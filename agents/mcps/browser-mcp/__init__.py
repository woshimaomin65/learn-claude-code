"""
Browser MCP Server - 浏览器模拟 MCP 服务器

使用 Playwright 实现完整的浏览器自动化功能
"""

from .server import (
    mcp,
    browser_manager,
    browser_navigate,
    browser_screenshot,
    browser_get_content,
    browser_click,
    browser_fill,
    browser_evaluate,
    browser_wait,
    browser_get_tabs_info,
    browser_close,
)

__all__ = [
    'mcp',
    'browser_manager',
    'browser_navigate',
    'browser_screenshot',
    'browser_get_content',
    'browser_click',
    'browser_fill',
    'browser_evaluate',
    'browser_wait',
    'browser_get_tabs_info',
    'browser_close',
]
