# Tavily Search MCP Server

优化版 Tavily MCP 服务器 - 高级网页搜索工具

## 简介

这是基于原始 [tavily-mcp](https://github.com/tavily/tavily-mcp) 项目优化后的版本，专为 MCP（Model Context Protocol）生态系统设计。提供了更强大的搜索功能、更好的错误处理和更友好的使用体验。

## 优化内容

### 相比原版的改进

1. **代码结构优化**
   - 模块化设计，分离 API 封装、结果格式化和服务器逻辑
   - 清晰的代码注释和文档
   - 统一的配置管理

2. **功能增强**
   - 新增 3 个搜索工具：
     - `tavily_search` - 通用网页搜索
     - `tavily_news` - 新闻搜索
     - `tavily_fact_check` - 事实核查
   - 支持搜索深度配置（basic/advanced）
   - 支持域名包含/排除过滤
   - 支持时间范围筛选

3. **可靠性提升**
   - 自动重试机制（网络错误、超时等）
   - 完善的错误处理和日志记录
   - 请求超时保护（30 秒）

4. **结果优化**
   - 结构化的结果格式
   - 人类可读的摘要输出
   - 机器可读的 JSON 数据
   - 相关度评分显示

## 安装

```bash
# 进入目录
cd mcps/tavily-search

# 安装依赖
npm install
```

## 配置

### ✅ API Key 已配置

本项目已配置好 Tavily API Key，可直接使用。

如需更换 API Key，请编辑 `.env` 文件：

```bash
# 编辑 .env 文件
vi .env

# 或在命令行设置
export TAVILY_API_KEY="your-new-api-key"
```

### 原始获取方式（如需新 key）

1. 访问 [Tavily AI](https://tavily.com/)
2. 注册账号
3. 在 Dashboard 获取 API Key

## 使用

### 作为 MCP 服务器运行

```bash
# 直接运行
npm start

# 或使用 MCP Inspector 调试
npm run inspector
```

### 在 Claude Desktop 中配置

在 Claude Desktop 配置文件中添加：

```json
{
  "mcpServers": {
    "tavily-search": {
      "command": "node",
      "args": ["/path/to/mcps/tavily-search/index.js"],
      "env": {
        "TAVILY_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### 在 MCP 客户端中使用

连接后，可使用以下工具：

#### 1. tavily_search - 通用搜索

```
搜索查询：最新 AI 技术发展
最大结果数：5
搜索深度：basic
包含域名：["wikipedia.org", "arxiv.org"]
排除域名：["twitter.com"]
```

#### 2. tavily_news - 新闻搜索

```
查询：人工智能监管政策
最大结果数：10
时间范围：最近 7 天
```

#### 3. tavily_fact_check - 事实核查

```
声明：GPT-5 已经发布
```

## API 参数说明

### tavily_search

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| query | string | 是 | - | 搜索查询语句 |
| maxResults | number | 否 | 5 | 最大结果数（1-10） |
| searchDepth | enum | 否 | basic | 搜索深度（basic/advanced） |
| includeDomains | array | 否 | [] | 限定搜索的域名列表 |
| excludeDomains | array | 否 | [] | 排除的域名列表 |

### tavily_news

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| query | string | 是 | - | 新闻搜索查询 |
| maxResults | number | 否 | 10 | 最大结果数（1-10） |
| days | number | 否 | - | 限制最近 N 天的新闻 |

### tavily_fact_check

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| claim | string | 是 | - | 需要核实的信息 |

## 输出格式

每个搜索工具返回两种格式的结果：

1. **人类可读格式** - 结构化的文本摘要，便于阅读
2. **机器可读格式** - JSON 格式的详细数据，便于程序处理

### 示例输出

```
搜索结果：5 条

📝 答案摘要：[AI 生成的答案]

🔍 相关问题：问题 1, 问题 2

--- 详细结果 ---

[1] 标题
URL: https://example.com
日期：2024-01-15
摘要：内容摘要...
相关度：95.2%
```

## 故障排除

### 常见问题

**1. API Key 错误**
```
错误：TAVILY_API_KEY 环境变量未设置
解决：确保已正确设置环境变量
```

**2. 请求超时**
```
错误：Request timeout
解决：检查网络连接，或尝试减少 maxResults
```

**3. 速率限制**
```
错误：Rate limit exceeded
解决：等待一段时间后重试，或升级 API 套餐
```

### 日志查看

服务器日志输出到 stderr，格式为 JSON：
```json
{"timestamp":"2024-01-15T10:00:00Z","level":"info","message":"执行搜索","data":{"query":"test"}}
```

## 依赖

- `@modelcontextprotocol/sdk` - MCP SDK
- `zod` - 参数验证
- `axios` - HTTP 请求

## 许可证

MIT License

## 致谢

原始项目：[tavily-mcp](https://github.com/tavily/tavily-mcp) by Tavily
