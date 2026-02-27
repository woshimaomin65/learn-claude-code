# Browser MCP Server - 快速入门指南

## 📁 项目结构

```
mcps/browser-mcp/
├── server.py                      # MCP 服务器主程序
├── __init__.py                    # 包初始化文件
├── requirements.txt               # Python 依赖
├── README.md                      # 详细文档
├── claude_desktop_config.example.json  # 配置示例
└── test_browser.py                # 测试脚本
```

## 🚀 快速开始

### 1. 安装依赖

```bash
cd mcps/browser-mcp
pip install -r requirements.txt
playwright install chromium
```

### 2. 运行测试

```bash
python test_browser.py
```

### 3. 配置 Claude Desktop

编辑 `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "browser": {
      "command": "python",
      "args": ["/Users/maomin/programs/vscode/learn-claude-code/agents/mcps/browser-mcp/server.py"]
    }
  }
}
```

### 4. 重启 Claude Desktop

重启后，你就可以在对话中使用浏览器工具了！

## 🛠️ 可用工具

| 工具 | 描述 |
|------|------|
| `browser_navigate` | 导航到指定 URL |
| `browser_screenshot` | 截取页面截图 |
| `browser_get_content` | 获取页面文本内容 |
| `browser_click` | 点击页面元素 |
| `browser_fill` | 填写输入框 |
| `browser_evaluate` | 执行 JavaScript |
| `browser_wait` | 等待时间或元素 |
| `browser_get_tabs_info` | 获取标签页信息 |
| `browser_close` | 关闭浏览器 |

## 💡 使用示例

### 示例 1：抓取知乎热榜

```
请帮我在知乎上搜索关于 AI agent 的热门内容

1. 导航到知乎搜索页面
2. 获取页面内容
3. 提取搜索结果
```

### 示例 2：截取网页截图

```
请帮我截取 GitHub trending 页面的截图
```

### 示例 3：网页自动化

```
请帮我访问 example.com，在搜索框输入"Python"，然后点击搜索按钮
```

## 🔍 与 mcp-fetch 的区别

- **browser-mcp**: 使用真实浏览器，支持 JavaScript 渲染，适合动态网页
- **mcp-fetch**: 使用 HTTP 请求，速度快，适合静态网页和 API

## ⚠️ 注意事项

1. 浏览器会占用较多内存，使用完毕后会自动清理
2. 某些网站可能检测到自动化访问
3. 默认使用无头模式，不显示浏览器窗口

## 📖 更多文档

详细文档请查看 [README.md](README.md)
