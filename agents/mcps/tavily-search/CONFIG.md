# Tavily Search MCP - 配置完成

## ✅ 配置状态

Tavily API Key 已成功配置，可直接使用。

## 📁 配置文件位置

| 文件 | 路径 | 说明 |
|------|------|------|
| `.env` | `mcps/tavily-search/.env` | 环境变量配置 |
| `mcp-config.json` | `mcps/tavily-search/mcp-config.json` | MCP 服务器配置示例 |
| `start.sh` | `mcps/tavily-search/start.sh` | 快速启动脚本 |

## 🚀 快速开始

### 方式 1：使用启动脚本

```bash
cd /Users/maomin/programs/gitcode/learn-claude-code/agents/mcps/tavily-search
./start.sh
```

### 方式 2：直接运行

```bash
cd /Users/maomin/programs/gitcode/learn-claude-code/agents/mcps/tavily-search
export TAVILY_API_KEY=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
npm start
```

### 方式 3：在 Claude Desktop 中使用

将以下配置添加到你的 MCP 配置文件中：

```json
{
  "mcpServers": {
    "tavily-search": {
      "command": "node",
      "args": ["/Users/maomin/programs/gitcode/learn-claude-code/agents/mcps/tavily-search/index.js"],
      "env": {
        "TAVILY_API_KEY": "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"
      }
    }
  }
}
```

## 🧪 测试

```bash
cd /Users/maomin/programs/gitcode/learn-claude-code/agents/mcps/tavily-search
export TAVILY_API_KEY=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
npm test
```

## 🔑 API Key 信息

- **Key**: `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`
- **类型**: Development Key
- **状态**: ✅ 已配置

## 📝 可用工具

| 工具 | 用途 | 示例 |
|------|------|------|
| `tavily_search` | 通用网页搜索 | 搜索技术文档、产品信息 |
| `tavily_news` | 新闻搜索 | 获取最新行业动态 |
| `tavily_fact_check` | 事实核查 | 验证信息真实性 |

## 🔗 相关文档

- 详细使用指南：[README.md](./README.md)
- Web Browsing Skill: [../../skills/web-browsing/SKILL.md](../../skills/web-browsing/SKILL.md)

---

**配置完成时间**: 2024-02-27
**配置位置**: `/Users/maomin/programs/gitcode/learn-claude-code/agents/mcps/tavily-search/`
