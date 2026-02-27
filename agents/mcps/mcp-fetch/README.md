# MCP Fetch Server

一个可以让 AI 模型上网获取网页内容的 MCP（Model Context Protocol）服务器。

## 功能特性

- 🌐 **fetch_url**: 获取网页内容并转换为 Markdown 格式，适合读取文章、文档、博客等
- 📄 **fetch_url_raw**: 获取网页的原始 HTML 内容，适合分析 HTML 结构
- 🔌 **fetch_json**: 获取 JSON 格式的 API 响应，适合调用 REST API
- 🔍 **search_text**: 在网页内容中搜索指定文本，返回包含搜索词的上下文片段

## 安装

```bash
# 克隆或进入项目目录
cd mcp-fetch

# 安装依赖
npm install

# 编译项目
npm run build
```

## 配置

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

### 或者使用 npx 直接运行

```json
{
  "mcpServers": {
    "fetch": {
      "command": "npx",
      "args": ["-y", "mcp-fetch"],
      "env": {}
    }
  }
}
```

## 使用示例

### 1. 获取网页内容（Markdown 格式）

```
使用 fetch_url 工具获取 https://example.com 的内容
```

### 2. 获取 API 数据

```
使用 fetch_json 工具获取 https://api.github.com/users/octocat 的数据
```

### 3. 搜索网页内容

```
使用 search_text 工具在 https://example.com 中搜索 "keyword"
```

### 4. 获取原始 HTML

```
使用 fetch_url_raw 工具获取 https://example.com 的原始 HTML
```

## 工具参数说明

### fetch_url

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| url | string | 是 | - | 要获取的网页 URL |
| timeout | number | 否 | 30000 | 请求超时时间（毫秒） |

### fetch_url_raw

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| url | string | 是 | - | 要获取的网页 URL |
| timeout | number | 否 | 30000 | 请求超时时间（毫秒） |

### fetch_json

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| url | string | 是 | - | API 的 URL |
| method | string | 否 | GET | HTTP 方法 (GET/POST/PUT/DELETE) |
| body | object | 否 | - | 请求体（JSON 对象） |
| headers | object | 否 | - | 自定义请求头 |
| timeout | number | 否 | 30000 | 请求超时时间（毫秒） |

### search_text

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| url | string | 是 | - | 要搜索的网页 URL |
| query | string | 是 | - | 要搜索的文本 |
| contextSize | number | 否 | 200 | 每个匹配项周围的上下文大小（字符数） |
| maxResults | number | 否 | 10 | 最大返回结果数 |
| timeout | number | 否 | 30000 | 请求超时时间（毫秒） |

## 开发

```bash
# 监听模式编译
npm run watch

# 运行服务器（用于测试）
npm run dev
```

## 依赖说明

- `@modelcontextprotocol/sdk`: MCP 协议 SDK
- `node-fetch`: HTTP 请求库
- `jsdom`: 用于解析 HTML
- `@mozilla/readability`: 用于提取网页主要内容
- `turndown`: 用于将 HTML 转换为 Markdown
- `zod` / `zod-to-json-schema`: 用于参数验证和 Schema 生成

## 注意事项

1. 请遵守目标网站的 robots.txt 协议
2. 不要频繁请求同一网站，避免被封禁
3. 某些网站可能有反爬虫机制，需要使用适当的 User-Agent 或代理
4. 本工具仅用于获取公开可访问的网页内容

## 许可证

MIT
