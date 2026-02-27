#!/bin/bash
# Tavily Search MCP 快速启动脚本

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 加载环境变量
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
    echo "✓ 已加载 .env 配置"
fi

# 检查 API Key
if [ -z "$TAVILY_API_KEY" ]; then
    echo "❌ 错误：TAVILY_API_KEY 未设置"
    echo "请确保 .env 文件中包含有效的 API Key"
    exit 1
fi

echo "✓ Tavily API Key 已配置"
echo "🚀 启动 Tavily Search MCP 服务器..."
echo ""

# 启动服务器
node index.js
