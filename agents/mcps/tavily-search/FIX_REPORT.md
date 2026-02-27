# Tavily MCP 服务器 404 错误修复报告

## 问题描述

在使用 `tavily_news` 工具搜索新闻时，返回 HTTP 404 错误：
```
Error: HTTP Error 404: Not Found
```

## 问题分析

### 根本原因
MCP 服务器的 `tavily_news` 工具实现存在两个问题：

1. **错误的日期过滤方式**：工具试图通过修改查询字符串来添加日期过滤
   ```javascript
   // ❌ 错误的方式
   searchQuery = `${query} after:${date.toISOString().split('T')[0]}`;
   ```
   Tavily API 不支持 `after:` 这种查询语法。

2. **缺少 `days` 参数支持**：`search` 方法没有将 `days` 参数传递给 Tavily API
   - Tavily API 原生支持 `days` 参数来限制搜索时间范围
   - MCP 服务器的 `search` 方法没有实现这个参数的传递

### Tavily API 正确用法
```javascript
// ✅ 正确的方式
{
  api_key: "xxx",
  query: "gold price",
  topic: "news",
  days: 1  // 直接传递 days 参数
}
```

## 修复方案

### 1. 添加 dotenv 支持（index.js 开头）
```javascript
import dotenv from "dotenv";

// Load environment variables
dotenv.config();
```

### 2. 修改 `search` 方法支持 `days` 参数
```javascript
async search(query, options = {}) {
  const params = {
    api_key: CONFIG.apiKey,
    query,
    // ... 其他参数
  };

  // Add days parameter if specified
  if (options.days) {
    params.days = options.days;
  }

  // ...
}
```

### 3. 修改 `tavily_news` 工具直接使用 `days` 参数
```javascript
async ({ query, maxResults, days }) => {
  try {
    // ✅ 直接传递 days 参数，不修改查询字符串
    const results = await TavilyAPI.getNews(query, { maxResults, days });
    // ...
  }
}
```

## 测试验证

修复后运行测试：
```
总测试数：12
✅ 通过：12
❌ 失败：0
📈 通过率：100.0%
```

所有测试通过，包括：
- ✅ 新闻搜索
- ✅ 新闻搜索（时间范围）

## 修改的文件

1. `/Users/maomin/programs/gitcode/learn-claude-code/agents/mcps/tavily-search/index.js`
   - 添加 dotenv 导入和配置
   - 修改 `search` 方法支持 `days` 参数
   - 修改 `tavily_news` 工具直接使用 `days` 参数

2. `/Users/maomin/programs/gitcode/learn-claude-code/agents/mcps/tavily-search/package.json`
   - 添加 `dotenv` 依赖

## 使用示例

修复后，`tavily_news` 工具可以正常使用 `days` 参数：

```javascript
// 搜索最近 1 天的黄金价格新闻
const results = await tavily_news({
  query: "gold price",
  days: 1,
  max_results: 5
});
```

## 日期：2026-01-22
