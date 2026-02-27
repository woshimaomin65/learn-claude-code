# Web Browsing Skill

## 概述

此技能提供完整的网页浏览和信息检索能力，通过 MCP (Model Context Protocol) 与两个互补的服务器交互：

| MCP 服务器 | 优势 | 适用场景 |
|-----------|------|---------|
| **mcp-fetch** | 快速、轻量、低资源 | 静态网页、API 调用、文档读取 |
| **browser-mcp** | 完整浏览器渲染、支持交互 | 动态网页 (SPA)、JavaScript 渲染、网页自动化 |

## MCP 服务器配置

### 1. mcp-fetch 配置（静态网页/API）

```json
{
  "mcpServers": {
    "fetch": {
      "command": "node",
      "args": ["/Users/maomin/programs/vscode/learn-claude-code/agents/mcps/mcp-fetch/dist/index.js"],
      "env": {}
    }
  }
}
```

### 2. browser-mcp 配置（动态网页/交互）

```json
{
  "mcpServers": {
    "browser": {
      "command": "python",
      "args": ["/Users/maomin/programs/vscode/learn-claude-code/agents/mcps/browser-mcp/server.py"],
      "env": {
        "PATH": "/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin"
      }
    }
  }
}
```

### 完整配置示例

```json
{
  "mcpServers": {
    "fetch": {
      "command": "node",
      "args": ["/Users/maomin/programs/vscode/learn-claude-code/agents/mcps/mcp-fetch/dist/index.js"]
    },
    "browser": {
      "command": "python",
      "args": ["/Users/maomin/programs/vscode/learn-claude-code/agents/mcps/browser-mcp/server.py"]
    }
  }
}
```

---

## 工具选择决策树

```
需要访问网页内容？
    │
    ├── 是静态内容/文章/API？
    │   └──→ 使用 mcp-fetch (fetch_url / fetch_json)
    │
    ├── 页面需要 JavaScript 渲染？
    │   └──→ 使用 browser-mcp (browser_navigate + browser_get_content)
    │
    ├── 需要截图？
    │   └──→ 使用 browser-mcp (browser_screenshot)
    │
    ├── 需要点击/输入等交互？
    │   └──→ 使用 browser-mcp (browser_click / browser_fill)
    │
    └── 需要执行自定义 JS？
        └──→ 使用 browser-mcp (browser_evaluate)
```

---

## mcp-fetch 工具（静态网页/API）

### 1. fetch_url

**用途**: 获取网页内容并转换为 Markdown 格式。适合读取文章、文档、博客等文本内容。

**参数**:
- `url` (string, 必填): 要获取的网页 URL
- `timeout` (number, 可选): 请求超时时间（毫秒），默认 30000

**示例**:
```
fetch_url({
  "url": "https://example.com/article"
})
```

### 2. fetch_url_raw

**用途**: 获取网页的原始 HTML 内容。适合需要分析 HTML 结构的场景。

**参数**:
- `url` (string, 必填): 要获取的网页 URL
- `timeout` (number, 可选): 请求超时时间（毫秒），默认 30000

### 3. fetch_json

**用途**: 获取 JSON 格式的 API 响应。适合调用 REST API。

**参数**:
- `url` (string, 必填): API 的 URL
- `method` (string, 可选): HTTP 方法，GET/POST/PUT/DELETE，默认 GET
- `body` (object, 可选): 请求体（JSON 对象）
- `headers` (object, 可选): 自定义请求头
- `timeout` (number, 可选): 请求超时时间（毫秒），默认 30000

### 4. search_text

**用途**: 在网页内容中搜索指定文本，返回包含搜索词的上下文片段。

**参数**:
- `url` (string, 必填): 要搜索的网页 URL
- `query` (string, 必填): 要搜索的文本
- `contextSize` (number, 可选): 每个匹配项周围的上下文大小（字符数），默认 200
- `maxResults` (number, 可选): 最大返回结果数，默认 10
- `timeout` (number, 可选): 请求超时时间（毫秒），默认 30000

---

## browser-mcp 工具（动态网页/交互）

### 1. browser_navigate

**用途**: 导航到指定 URL 并等待页面加载完成，支持 JavaScript 渲染。

**参数**:
- `url` (string, 必填): 要访问的网址
- `wait_until` (string, 可选): 等待策略
  - `"load"`: 等待 load 事件
  - `"domcontentloaded"`: 等待 DOMContentLoaded 事件
  - `"networkidle"`: 等待网络连接空闲（推荐）
  - `"commit"`: 等待网络响应接收完成

**返回**:
```json
{
  "success": true,
  "url": "https://example.com",
  "title": "Example Domain",
  "status": 200
}
```

**示例**:
```
browser_navigate({
  "url": "https://github.com/trending",
  "wait_until": "networkidle"
})
```

### 2. browser_screenshot

**用途**: 截取当前页面的截图（支持完整页面）。

**参数**:
- `full_page` (boolean, 可选): 是否截取完整页面（包括滚动区域），默认 true

**返回**:
```json
{
  "success": true,
  "image": "data:image/png;base64,...",
  "width": 1280,
  "height": 720
}
```

**示例**:
```
browser_screenshot({
  "full_page": true
})
```

### 3. browser_get_content

**用途**: 获取当前页面的文本内容，可选 CSS 选择器过滤。

**参数**:
- `selector` (string, 可选): CSS 选择器，如 `"article"` 或 `".content"`

**返回**:
```json
{
  "success": true,
  "content": "页面文本内容...",
  "url": "https://example.com",
  "title": "Example Domain"
}
```

**示例**:
```
browser_get_content()  // 获取整个页面
browser_get_content({ "selector": "article h1" })  // 获取文章标题
```

### 4. browser_click

**用途**: 点击页面上的元素。

**参数**:
- `selector` (string, 必填): CSS 选择器，如 `"button#submit"` 或 `"text=\"登录\""`

**示例**:
```
browser_click({
  "selector": "button[type=\"submit\"]"
})
```

### 5. browser_fill

**用途**: 在输入框中填写内容。

**参数**:
- `selector` (string, 必填): 输入框的 CSS 选择器
- `value` (string, 必填): 要填写的值

**示例**:
```
browser_fill({
  "selector": "input[name=\"username\"]",
  "value": "test@example.com"
})
```

### 6. browser_evaluate

**用途**: 在页面上下文中执行 JavaScript 代码。

**参数**:
- `javascript` (string, 必填): 要执行的 JavaScript 代码

**示例**:
```
browser_evaluate({
  "javascript": "document.querySelectorAll('a').length"
})
```

### 7. browser_wait

**用途**: 等待指定时间或等待元素出现。

**参数**:
- `time_ms` (number, 可选): 等待的毫秒数
- `selector` (string, 可选): CSS 选择器，等待该元素出现

**示例**:
```
browser_wait({ "time_ms": 2000 })  // 等待 2 秒
browser_wait({ "selector": ".loaded-content" })  // 等待元素
```

### 8. browser_get_tabs_info

**用途**: 获取当前浏览器标签页的信息。

**返回**:
```json
{
  "success": true,
  "current_url": "https://example.com",
  "current_title": "Page Title"
}
```

### 9. browser_close

**用途**: 关闭浏览器并释放资源。

---

## 使用场景对比

| 场景 | 推荐工具 | 理由 |
|------|---------|------|
| **阅读静态文章/博客** | `fetch_url` | 快速，自动转 Markdown |
| **调用 REST API** | `fetch_json` | 直接获取结构化数据 |
| **GitHub Trending** | `browser_navigate` + `browser_get_content` | 页面动态渲染 |
| **知乎/社交媒体** | `browser_navigate` + `browser_get_content` | 需要 JS 执行 |
| **网页截图** | `browser_screenshot` | 唯一支持截图 |
| **登录/表单提交** | `browser_fill` + `browser_click` | 需要交互 |
| **单页应用 (SPA)** | `browser_navigate` | 等待路由加载 |
| **数据可视化页面** | `browser_evaluate` | 提取图表数据 |
| **搜索结果页面** | `browser_navigate` + `browser_get_content` | 动态加载结果 |
| **API 文档** | `fetch_url` | 静态内容，速度快 |
| **金融数据** | `fetch_json` | 实时 API 数据 |
| **学术论文** | `fetch_url` 或 `browser_navigate` | 根据网站类型选择 |

---

## 最佳实践

### 1. 优先使用 mcp-fetch（更快更轻）

```
✅ 首选：fetch_url({ url: "https://docs.python.org/3/" })
✅ 备选：browser_navigate + browser_get_content（仅当 fetch 失败时）
```

### 2. 识别动态网页

以下特征表明需要使用 browser-mcp：
- 页面内容通过 JavaScript 加载
- 滚动时动态加载更多内容（无限滚动）
- 需要登录才能查看内容
- 单页应用（URL 变化但页面不刷新）
- 大量交互元素（按钮、表单）

### 3. browser-mcp 使用模式

**基本浏览模式**:
```
1. browser_navigate({ url: "https://..." })
2. browser_get_content() 或 browser_screenshot()
3. browser_close()  // 完成后关闭
```

**交互模式**:
```
1. browser_navigate({ url: "https://..." })
2. browser_fill({ selector: "...", value: "..." })
3. browser_click({ selector: "..." })
4. browser_wait({ time_ms: 2000 })
5. browser_get_content()
6. browser_close()
```

**数据提取模式**:
```
1. browser_navigate({ url: "https://..." })
2. browser_evaluate({ javascript: "..." })
3. browser_close()
```

### 4. 资源管理

- browser-mcp 会占用较多内存，使用完毕后调用 `browser_close()`
- 连续访问多个页面时，可以复用浏览器会话
- mcp-fetch 无状态，可随时调用

### 5. 错误处理策略

```
如果 fetch_url 失败:
1. 检查是否是动态网页 → 尝试 browser_navigate
2. 检查 URL 是否正确
3. 尝试 fetch_url_raw 获取原始 HTML
4. 寻找官方 API 替代

如果 browser_navigate 失败:
1. 增加 wait_until 等待时间
2. 检查是否需要先处理 Cookie/登录
3. 尝试不同的等待策略
```

---

## 限制与注意事项

### mcp-fetch 限制

| 限制 | 说明 | 解决方案 |
|------|------|---------|
| JavaScript 渲染 | 无法执行 JS，只能获取初始 HTML | 使用 browser-mcp |
| 登录墙 | 无法访问需要登录的内容 | 使用 browser-mcp + 手动登录 |
| 反爬虫 | 部分网站会阻止自动化访问 | 降低频率，使用 API |

### browser-mcp 限制

| 限制 | 说明 | 解决方案 |
|------|------|---------|
| 速度较慢 | 浏览器启动和渲染需要时间 | 优先使用 mcp-fetch |
| 资源消耗 | 占用较多内存和 CPU | 及时调用 browser_close() |
| 反自动化 | 某些网站检测自动化工具 | 使用真实用户代理 |
| 超时 | 默认 30 秒超时 | 增加 wait 时间 |

---

## 故障排除

### 问题：fetch_url 返回空内容

**可能原因**: 页面是 JavaScript 渲染的

**解决方案**:
```
改用 browser-mcp:
1. browser_navigate({ url: "https://...", wait_until: "networkidle" })
2. browser_get_content()
```

### 问题：browser_navigate 超时

**解决方案**:
```
1. 增加等待策略：wait_until: "domcontentloaded"
2. 手动等待：browser_wait({ time_ms: 5000 })
3. 检查网络连接
```

### 问题：browser_click 找不到元素

**解决方案**:
```
1. 先截图确认页面状态：browser_screenshot()
2. 等待元素出现：browser_wait({ selector: "..." })
3. 尝试其他选择器格式：text="按钮文本"
```

### 问题：MCP 服务器未响应

**检查清单**:
```bash
# 检查 mcp-fetch
node --version
cd /Users/maomin/programs/vscode/learn-claude-code/agents/mcps/mcp-fetch
npm install && npm run build

# 检查 browser-mcp
python3 --version
pip install mcp playwright
playwright install chromium

# 重启 Claude Desktop
```

---

## 完整示例

### 示例 1：抓取 GitHub Trending（动态页面）

```
任务：获取 GitHub Trending 上的热门项目

步骤:
1. browser_navigate({ url: "https://github.com/trending", wait_until: "networkidle" })
2. browser_get_content({ selector: "main" })
3. browser_close()
```

### 示例 2：搜索知乎内容（动态页面）

```
任务：在知乎上搜索 AI agent 相关内容

步骤:
1. browser_navigate({ url: "https://www.zhihu.com/search?q=AI+agent", wait_until: "networkidle" })
2. browser_get_content()
3. browser_close()
```

### 示例 3：读取 API 文档（静态页面）

```
任务：读取 Python 官方文档

步骤:
1. fetch_url({ url: "https://docs.python.org/3/library/asyncio.html" })
```

### 示例 4：网页自动化（登录 + 操作）

```
任务：登录网站并获取个人数据

步骤:
1. browser_navigate({ url: "https://example.com/login" })
2. browser_fill({ selector: "input[name=username]", value: "user" })
3. browser_fill({ selector: "input[name=password]", value: "pass" })
4. browser_click({ selector: "button[type=submit]" })
5. browser_wait({ time_ms: 3000 })
6. browser_navigate({ url: "https://example.com/dashboard" })
7. browser_get_content()
8. browser_close()
```

### 示例 5：截取网页截图

```
任务：保存网页当前状态的截图

步骤:
1. browser_navigate({ url: "https://example.com" })
2. browser_screenshot({ full_page: true })
3. browser_close()
```

---

## 相关文件

- **mcp-fetch 服务器**: `/Users/maomin/programs/vscode/learn-claude-code/agents/mcps/mcp-fetch/`
- **browser-mcp 服务器**: `/Users/maomin/programs/vscode/learn-claude-code/agents/mcps/browser-mcp/`
- **配置文件**: `~/Library/Application Support/Claude/claude_desktop_config.json`

---

## 更新日志

- **2024-02-27**: 整合 browser-mcp，增加动态网页浏览能力
- **2024-02-27**: 添加工具选择决策树和场景对比表
- **2024-02-27**: 更新 MCP 路径至 `mcps/` 目录结构
