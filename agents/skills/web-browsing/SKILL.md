# Web Browsing Skill

## 概述

此技能提供网页浏览和信息检索能力，通过 MCP (Model Context Protocol) 与 `mcp-fetch` 服务器交互。

## MCP 服务器配置

### 服务器位置

```
/Users/maomin/programs/vscode/learn-claude-code/agents/mcps/mcp-fetch/
```

### Claude Desktop 配置

在 Claude Desktop 的配置文件（`~/Library/Application Support/Claude/claude_desktop_config.json`）中添加：

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

### 验证配置

配置完成后，可以通过以下方式验证 MCP 服务器是否正常工作：

```bash
# 测试 MCP 服务器启动
node /Users/maomin/programs/vscode/learn-claude-code/agents/mcps/mcp-fetch/dist/index.js
```

## 可用工具

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

**示例**:
```
fetch_url_raw({
  "url": "https://example.com"
})
```

### 3. fetch_json

**用途**: 获取 JSON 格式的 API 响应。适合调用 REST API。

**参数**:
- `url` (string, 必填): API 的 URL
- `method` (string, 可选): HTTP 方法，GET/POST/PUT/DELETE，默认 GET
- `body` (object, 可选): 请求体（JSON 对象）
- `headers` (object, 可选): 自定义请求头
- `timeout` (number, 可选): 请求超时时间（毫秒），默认 30000

**示例**:
```
fetch_json({
  "url": "https://api.example.com/data",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer token123"
  }
})
```

### 4. search_text

**用途**: 在网页内容中搜索指定文本，返回包含搜索词的上下文片段。

**参数**:
- `url` (string, 必填): 要搜索的网页 URL
- `query` (string, 必填): 要搜索的文本
- `contextSize` (number, 可选): 每个匹配项周围的上下文大小（字符数），默认 200
- `maxResults` (number, 可选): 最大返回结果数，默认 10
- `timeout` (number, 可选): 请求超时时间（毫秒），默认 30000

**示例**:
```
search_text({
  "url": "https://example.com/docs",
  "query": "API endpoint",
  "maxResults": 5
})
```

## 使用场景

| 场景 | 推荐工具 | 说明 |
|------|---------|------|
| 阅读文章/博客 | `fetch_url` | 自动转换为易读的 Markdown |
| 调用 REST API | `fetch_json` | 直接获取结构化 JSON 数据 |
| 分析网页结构 | `fetch_url_raw` | 获取原始 HTML 进行分析 |
| 查找特定信息 | `search_text` | 在长页面中快速定位关键词 |
| 金融数据查询 | `fetch_json` | 获取股票、汇率、金价等 API 数据 |
| 学术论文检索 | `fetch_url` + `search_text` | 读取论文并搜索关键概念 |
| 新闻收集 | `fetch_url` | 批量获取新闻内容 |

## 最佳实践

### 1. 优先使用官方 API

```
✅ 推荐：fetch_json({ url: "https://api.github.com/repos/..." })
❌ 不推荐：fetch_url_raw 解析 HTML 提取数据
```

### 2. 设置合理的超时时间

```
- 普通网页：30000ms (默认)
- 大型页面：60000ms
- API 调用：10000ms
```

### 3. 错误处理

当工具返回错误时：
1. 检查 URL 是否正确
2. 确认网站是否可公开访问
3. 尝试增加超时时间
4. 考虑使用备用数据源

### 4. 多源验证

对于重要数据，建议从多个来源验证：
```
1. 官方 API → fetch_json
2. 新闻网站 → fetch_url
3. 数据平台 → fetch_json/fetch_url
```

## 限制与注意事项

| 限制 | 说明 | 解决方案 |
|------|------|---------|
| JavaScript 渲染 | 无法执行 JS，只能获取初始 HTML | 寻找 API 端点或使用 fetch_json |
| 登录墙 | 无法访问需要登录的内容 | 使用公开数据源 |
| 反爬虫 | 部分网站会阻止自动化访问 | 降低请求频率，使用 API |
| 速率限制 | API 可能有请求频率限制 | 添加请求间隔，缓存结果 |
| 付费内容 | 无法绕过付费墙 | 寻找免费替代源 |

## 故障排除

### 问题：MCP 服务器未响应

**解决方案**:
```bash
# 1. 检查 Node.js 是否安装
node --version

# 2. 安装依赖
cd /Users/maomin/programs/vscode/learn-claude-code/agents/mcps/mcp-fetch
npm install

# 3. 构建项目
npm run build

# 4. 重启 Claude Desktop
```

### 问题：工具调用失败

**检查清单**:
- [ ] MCP 服务器配置路径正确
- [ ] dist/index.js 文件存在
- [ ] Claude Desktop 已重启
- [ ] 网络连接正常

## 相关文件

- MCP 服务器代码：`/Users/maomin/programs/vscode/learn-claude-code/agents/mcps/mcp-fetch/index.ts`
- 配置文件：`~/Library/Application Support/Claude/claude_desktop_config.json`
- 依赖安装：`/Users/maomin/programs/vscode/learn-claude-code/agents/mcps/mcp-fetch/package.json`

## 更新日志

- **2024-02-27**: 更新 MCP 路径至 `mcps/mcp-fetch/` 目录结构
