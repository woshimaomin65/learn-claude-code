# Browser MCP Server

浏览器模拟 MCP 服务器 - 使用真实浏览器访问网页，支持 JavaScript 渲染页面的抓取和自动化操作。

## 🌟 特性

- **真实浏览器渲染** - 使用 Playwright 驱动 Chromium，支持完整的 JavaScript 渲染
- **页面导航** - 支持各种等待策略，处理单页应用 (SPA)
- **截图功能** - 支持完整页面截图和可视区域截图
- **元素交互** - 点击、输入、选择等操作
- **JavaScript 执行** - 在页面上下文中执行自定义 JS 代码
- **智能等待** - 支持时间等待和元素等待

## 📦 安装

### 1. 安装依赖

```bash
cd mcps/browser-mcp
pip install -r requirements.txt
```

### 2. 安装 Playwright 浏览器

```bash
playwright install chromium
```

## 🔧 配置

### Claude Desktop 配置

在 `claude_desktop_config.json` 中添加：

```json
{
  "mcpServers": {
    "browser": {
      "command": "python",
      "args": ["/path/to/mcps/browser-mcp/server.py"],
      "env": {
        "PATH": "/usr/bin:/bin:/usr/sbin:/sbin"
      }
    }
  }
}
```

### MCP Inspector 配置

```bash
npx @modelcontextprotocol/inspector python mcps/browser-mcp/server.py
```

## 🛠️ 可用工具

### browser_navigate

导航到指定的 URL 并等待页面加载完成。

```python
browser_navigate(url: str, wait_until: str = 'networkidle')
```

**参数：**
- `url`: 要访问的网址
- `wait_until`: 等待策略 (load, domcontentloaded, networkidle, commit)

**返回：**
```json
{
  "success": true,
  "url": "https://example.com",
  "title": "Example Domain",
  "status": 200
}
```

### browser_screenshot

截取当前页面的截图。

```python
browser_screenshot(full_page: bool = True)
```

**参数：**
- `full_page`: 是否截取完整页面（包括滚动区域）

**返回：**
```json
{
  "success": true,
  "image": "data:image/png;base64,...",
  "width": 1280,
  "height": 720
}
```

### browser_get_content

获取当前页面的文本内容。

```python
browser_get_content(selector: Optional[str] = None)
```

**参数：**
- `selector`: 可选的 CSS 选择器，如果提供则只获取该元素的内容

**返回：**
```json
{
  "success": true,
  "content": "页面文本内容...",
  "url": "https://example.com",
  "title": "Example Domain"
}
```

### browser_click

点击页面上的元素。

```python
browser_click(selector: str)
```

**参数：**
- `selector`: CSS 选择器，例如 `button#submit` 或 `text="登录"`

**返回：**
```json
{
  "success": true,
  "url": "https://example.com/next",
  "title": "Next Page"
}
```

### browser_fill

在输入框中填写内容。

```python
browser_fill(selector: str, value: str)
```

**参数：**
- `selector`: 输入框的 CSS 选择器
- `value`: 要填写的值

### browser_evaluate

在页面上下文中执行 JavaScript 代码。

```python
browser_evaluate(javascript: str)
```

**参数：**
- `javascript`: 要执行的 JavaScript 代码

**示例：**
```python
# 获取页面链接数量
browser_evaluate('document.querySelectorAll("a").length')

# 获取页面标题
browser_evaluate('document.title')
```

### browser_wait

等待指定时间或等待元素出现。

```python
browser_wait(time_ms: Optional[int] = None, selector: Optional[str] = None)
```

**参数：**
- `time_ms`: 等待的毫秒数
- `selector`: CSS 选择器，等待该元素出现

### browser_get_tabs_info

获取当前浏览器标签页的信息。

```python
browser_get_tabs_info()
```

### browser_close

关闭浏览器并释放资源。

```python
browser_close()
```

## 📝 使用示例

### 示例 1：抓取动态网页内容

```python
# 导航到页面
result = browser_navigate("https://github.com/trending")

# 获取内容
content = browser_get_content()
```

### 示例 2：截取网页截图

```python
# 导航并截图
browser_navigate("https://www.zhihu.com")
screenshot = browser_screenshot(full_page=True)
```

### 示例 3：网页自动化

```python
# 打开登录页面
browser_navigate("https://example.com/login")

# 填写表单
browser_fill('input[name="username"]', 'user@example.com')
browser_fill('input[name="password"]', 'password123')

# 点击登录按钮
browser_click('button[type="submit"]')

# 等待登录完成
browser_wait(time_ms=2000)

# 获取登录后的页面内容
content = browser_get_content()
```

### 示例 4：执行 JavaScript

```python
browser_navigate("https://example.com")

# 获取所有链接
links = browser_evaluate('''
    Array.from(document.querySelectorAll("a")).map(a => ({
        text: a.textContent.trim(),
        href: a.href
    }))
''')
```

## 🔍 与 mcp-fetch 的区别

| 特性 | browser-mcp | mcp-fetch |
|------|-------------|-----------|
| JavaScript 渲染 | ✅ 支持 | ❌ 不支持 |
| 浏览器截图 | ✅ 支持 | ❌ 不支持 |
| 页面交互 | ✅ 支持 | ❌ 不支持 |
| 执行 JS | ✅ 支持 | ❌ 不支持 |
| 速度 | 较慢 | 快 |
| 资源消耗 | 较高 | 低 |
| 适用场景 | 动态网页、SPA | 静态网页、API |

## ⚠️ 注意事项

1. **资源消耗**：浏览器会占用较多内存和 CPU，使用完毕后请调用 `browser_close()`
2. **反爬虫**：某些网站可能检测到自动化访问，请遵守 robots.txt 和使用条款
3. **超时设置**：默认超时为 30 秒，可在代码中调整
4. **无头模式**：默认使用无头模式，不显示浏览器窗口

## 📄 License

MIT
