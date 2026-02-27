#!/usr/bin/env python3
"""
MCP Browser Server - 浏览器模拟 MCP 服务器

使用 Playwright 实现完整的浏览器自动化功能，支持：
- 页面导航和截图
- JavaScript 渲染页面抓取
- 页面元素交互（点击、输入等）
- 多标签页管理
- 等待和重试机制

基于 Model Context Protocol (MCP) 规范实现
"""

import asyncio
import json
import sys
import os
from typing import Any, Optional
from contextlib import asynccontextmanager

from mcp.server.fastmcp import FastMCP
from playwright.async_api import async_playwright, Browser, BrowserContext, Page

# ============================================================
# MCP Server 配置
# ============================================================

mcp = FastMCP(
    name="browser-mcp",
    instructions="""
    浏览器模拟 MCP 服务器 - 使用真实浏览器访问网页
    
    主要功能：
    - browser_navigate: 导航到指定 URL
    - browser_screenshot: 截取当前页面截图
    - browser_get_content: 获取页面文本内容
    - browser_click: 点击页面元素
    - browser_fill: 在输入框中填写内容
    - browser_evaluate: 执行 JavaScript 代码
    - browser_wait: 等待指定时间或条件
    - browser_close: 关闭浏览器
    
    适用于抓取 JavaScript 渲染的页面、进行网页自动化测试等场景
    """,
)

# ============================================================
# 浏览器管理器
# ============================================================

class BrowserManager:
    """浏览器会话管理器"""
    
    def __init__(self):
        self.playwright = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self.headless = True
        self.timeout = 30000  # 30 秒超时
        
    async def start(self, headless: bool = True):
        """启动浏览器"""
        if self.playwright is None:
            self.playwright = await async_playwright().start()
        
        if self.browser is None:
            # 启动 Chromium 浏览器
            self.browser = await self.playwright.chromium.launch(
                headless=headless,
                args=[
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                ]
            )
        
        if self.context is None:
            # 创建浏览器上下文
            self.context = await self.browser.new_context(
                viewport={'width': 1280, 'height': 720},
                user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                locale='zh-CN',
                timezone_id='Asia/Shanghai',
            )
        
        self.headless = headless
        
    async def get_page(self) -> Page:
        """获取或创建页面"""
        if self.context is None:
            await self.start()
        
        if self.page is None or self.page.is_closed():
            self.page = await self.context.new_page()
            self.page.set_default_timeout(self.timeout)
        
        return self.page
    
    async def navigate(self, url: str, wait_until: str = 'networkidle') -> dict:
        """导航到指定 URL"""
        page = await self.get_page()
        
        try:
            response = await page.goto(url, wait_until=wait_until)
            return {
                'success': True,
                'url': page.url,
                'title': await page.title(),
                'status': response.status if response else None,
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
            }
    
    async def screenshot(self, full_page: bool = True) -> dict:
        """截取当前页面截图"""
        page = await self.get_page()
        
        try:
            screenshot = await page.screenshot(full_page=full_page, type='png')
            # 返回 base64 编码的截图
            import base64
            screenshot_b64 = base64.b64encode(screenshot).decode('utf-8')
            return {
                'success': True,
                'image': f'data:image/png;base64,{screenshot_b64}',
                'width': page.viewport_size['width'] if page.viewport_size else 1280,
                'height': page.viewport_size['height'] if page.viewport_size else 720,
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
            }
    
    async def get_content(self, selector: Optional[str] = None) -> dict:
        """获取页面文本内容"""
        page = await self.get_page()
        
        try:
            if selector:
                # 获取指定元素的内容
                element = await page.query_selector(selector)
                if element:
                    text = await element.inner_text()
                else:
                    return {
                        'success': False,
                        'error': f'未找到元素：{selector}',
                    }
            else:
                # 获取整个页面的文本内容
                text = await page.evaluate('''() => {
                    // 移除 script 和 style 标签
                    const clones = document.cloneNode(true)
                    const scripts = clones.querySelectorAll('script, style, noscript')
                    scripts.forEach(s => s.remove())
                    return clones.body.innerText
                }''')
            
            return {
                'success': True,
                'content': text[:50000],  # 限制返回长度
                'url': page.url,
                'title': await page.title(),
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
            }
    
    async def click(self, selector: str) -> dict:
        """点击页面元素"""
        page = await self.get_page()
        
        try:
            await page.click(selector, timeout=5000)
            # 等待导航完成
            try:
                await page.wait_for_load_state('networkidle', timeout=5000)
            except:
                pass  # 如果没有导航则忽略
            
            return {
                'success': True,
                'url': page.url,
                'title': await page.title(),
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
            }
    
    async def fill(self, selector: str, value: str) -> dict:
        """在输入框中填写内容"""
        page = await self.get_page()
        
        try:
            await page.fill(selector, value, timeout=5000)
            return {
                'success': True,
                'selector': selector,
                'value': value,
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
            }
    
    async def evaluate(self, javascript: str) -> dict:
        """执行 JavaScript 代码"""
        page = await self.get_page()
        
        try:
            result = await page.evaluate(javascript)
            # 处理不可序列化的结果
            if isinstance(result, (set, frozenset)):
                result = list(result)
            elif hasattr(result, '__dict__'):
                result = str(result)
            
            return {
                'success': True,
                'result': result,
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
            }
    
    async def wait(self, time_ms: Optional[int] = None, selector: Optional[str] = None) -> dict:
        """等待指定时间或元素"""
        page = await self.get_page()
        
        try:
            if time_ms:
                await asyncio.sleep(time_ms / 1000)
            elif selector:
                await page.wait_for_selector(selector, timeout=30000)
            
            return {
                'success': True,
                'waited': time_ms or f'for selector: {selector}',
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
            }
    
    async def close(self):
        """关闭浏览器"""
        if self.page:
            try:
                await self.page.close()
            except:
                pass
            self.page = None
        
        if self.context:
            try:
                await self.context.close()
            except:
                pass
            self.context = None
        
        if self.browser:
            try:
                await self.browser.close()
            except:
                pass
            self.browser = None
        
        if self.playwright:
            try:
                await self.playwright.stop()
            except:
                pass
            self.playwright = None
    
    async def get_tabs_info(self) -> dict:
        """获取当前标签页信息"""
        page = await self.get_page()
        return {
            'success': True,
            'current_url': page.url,
            'current_title': await page.title(),
        }


# 全局浏览器管理器实例
browser_manager = BrowserManager()


# ============================================================
# MCP Tools
# ============================================================

@mcp.tool()
async def browser_navigate(url: str, wait_until: str = 'networkidle') -> dict:
    """
    导航到指定的 URL 并等待页面加载完成
    
    Args:
        url: 要访问的网址，例如 "https://www.zhihu.com"
        wait_until: 等待策略，可选值：
            - "load": 等待 load 事件
            - "domcontentloaded": 等待 DOMContentLoaded 事件
            - "networkidle": 等待网络连接空闲（推荐）
            - "commit": 等待网络响应接收完成
    
    Returns:
        包含导航结果的字典，包括：
            - success: 是否成功
            - url: 最终 URL（可能有重定向）
            - title: 页面标题
            - status: HTTP 状态码
            - error: 错误信息（如果失败）
    
    Example:
        browser_navigate("https://github.com/trending")
    """
    await browser_manager.start(headless=True)
    return await browser_manager.navigate(url, wait_until)


@mcp.tool()
async def browser_screenshot(full_page: bool = True) -> dict:
    """
    截取当前页面的截图
    
    Args:
        full_page: 是否截取完整页面（包括滚动区域），默认 True
    
    Returns:
        包含截图的字典：
            - success: 是否成功
            - image: base64 编码的 PNG 图片
            - width: 截图宽度
            - height: 截图高度
            - error: 错误信息（如果失败）
    
    Example:
        browser_screenshot(full_page=True)
    """
    await browser_manager.start(headless=True)
    return await browser_manager.screenshot(full_page)


@mcp.tool()
async def browser_get_content(selector: Optional[str] = None) -> dict:
    """
    获取当前页面的文本内容
    
    Args:
        selector: 可选的 CSS 选择器，如果提供则只获取该元素的内容
                 例如："article" 或 ".content" 或 "#main"
    
    Returns:
        包含页面内容的字典：
            - success: 是否成功
            - content: 页面文本内容（最多 50000 字符）
            - url: 当前 URL
            - title: 页面标题
            - error: 错误信息（如果失败）
    
    Example:
        browser_get_content()  # 获取整个页面内容
        browser_get_content("article h1")  # 获取文章标题
    """
    await browser_manager.start(headless=True)
    return await browser_manager.get_content(selector)


@mcp.tool()
async def browser_click(selector: str) -> dict:
    """
    点击页面上的元素
    
    Args:
        selector: CSS 选择器，例如：
            - "button#submit"
            - "a[href='/login']"
            - ".nav-item:nth-child(2)"
            - 'text="登录"'
    
    Returns:
        包含点击结果的字典：
            - success: 是否成功
            - url: 点击后的 URL（如果有导航）
            - title: 点击后的页面标题
            - error: 错误信息（如果失败）
    
    Example:
        browser_click('button[type="submit"]')
        browser_click('text="下一页"')
    """
    await browser_manager.start(headless=True)
    return await browser_manager.click(selector)


@mcp.tool()
async def browser_fill(selector: str, value: str) -> dict:
    """
    在输入框中填写内容
    
    Args:
        selector: 输入框的 CSS 选择器
        value: 要填写的值
    
    Returns:
        包含填写结果的字典：
            - success: 是否成功
            - selector: 选择器
            - value: 填写的值
            - error: 错误信息（如果失败）
    
    Example:
        browser_fill('input[name="username"]', 'test@example.com')
        browser_fill('#search-box', 'Python MCP')
    """
    await browser_manager.start(headless=True)
    return await browser_manager.fill(selector, value)


@mcp.tool()
async def browser_evaluate(javascript: str) -> dict:
    """
    在页面上下文中执行 JavaScript 代码
    
    Args:
        javascript: 要执行的 JavaScript 代码字符串
    
    Returns:
        包含执行结果的字典：
            - success: 是否成功
            - result: JavaScript 执行结果
            - error: 错误信息（如果失败）
    
    Example:
        browser_evaluate('document.title')
        browser_evaluate('document.querySelectorAll("a").length')
        browser_evaluate('fetch("/api/data").then(r => r.json())')
    """
    await browser_manager.start(headless=True)
    return await browser_manager.evaluate(javascript)


@mcp.tool()
async def browser_wait(time_ms: Optional[int] = None, selector: Optional[str] = None) -> dict:
    """
    等待指定时间或等待元素出现
    
    Args:
        time_ms: 等待的毫秒数，例如 1000 表示等待 1 秒
        selector: CSS 选择器，等待该元素出现
    
    Returns:
        包含等待结果的字典：
            - success: 是否成功
            - waited: 等待的信息
            - error: 错误信息（如果失败）
    
    Example:
        browser_wait(time_ms=2000)  # 等待 2 秒
        browser_wait(selector=".loaded-content")  # 等待元素出现
    """
    await browser_manager.start(headless=True)
    return await browser_manager.wait(time_ms, selector)


@mcp.tool()
async def browser_get_tabs_info() -> dict:
    """
    获取当前浏览器标签页的信息
    
    Returns:
        包含标签页信息的字典：
            - success: 是否成功
            - current_url: 当前 URL
            - current_title: 当前页面标题
    """
    await browser_manager.start(headless=True)
    return await browser_manager.get_tabs_info()


@mcp.tool()
async def browser_close() -> dict:
    """
    关闭浏览器并释放资源
    
    Returns:
        包含关闭结果的字典：
            - success: 是否成功
    """
    await browser_manager.close()
    return {'success': True, 'message': '浏览器已关闭'}


# ============================================================
# MCP Resources (可选)
# ============================================================

@mcp.resource("browser://status")
async def browser_status() -> str:
    """浏览器当前状态信息"""
    info = await browser_manager.get_tabs_info()
    return json.dumps(info, indent=2, ensure_ascii=False)


# ============================================================
# 主程序入口
# ============================================================

async def run_server():
    """运行 MCP 服务器"""
    # 使用 stdio 传输
    await mcp.run_stdio_async()


if __name__ == "__main__":
    # 设置日志级别
    import logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    print("Starting Browser MCP Server...", file=sys.stderr)
    asyncio.run(run_server())
