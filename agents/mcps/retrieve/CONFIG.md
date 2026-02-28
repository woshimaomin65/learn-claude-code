# Retrieve MCP 配置说明

## MCP 服务器工作模式

### ❌ 不需要手动启动

MCP 服务器**不需要**提前在后台启动。Claude Desktop 会自动管理 MCP 服务器进程：

```
用户触发 MCP 工具调用
         │
         ▼
Claude Desktop 自动启动 MCP 服务器进程
         │
         ▼
模型懒加载（首次调用时）
         │
         ▼
处理请求并返回结果
         │
         ▼
空闲时自动保持或退出
```

### 配置步骤

#### 1. 打开配置文件

**macOS:**
```bash
open ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

**Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

#### 2. 添加 MCP 服务器配置

```json
{
  "mcpServers": {
    "retrieve": {
      "command": "python",
      "args": ["-m", "mcp", "run", "server.py"],
      "cwd": "/Users/maomin/programs/vscode/learn-claude-code/agents/mcps/retrieve",
      "env": {
        "CHROMA_PERSIST_DIR": "./chroma_db",
        "EMBEDDING_MODEL": "./data/models/bge-small-zh-v1.5",
        "RERANKER_MODEL": "./data/models/bge-reranker-base",
        "HF_ENDPOINT": "https://hf-mirror.com",
        "LOG_LEVEL": "INFO"
      }
    }
  }
}
```

#### 3. 重启 Claude Desktop

配置后重启 Claude Desktop，MCP 服务器会自动注册。

---

## 模型加载策略

### 懒加载（默认）

当前实现使用**懒加载**，模型在第一次调用时才加载：

```
启动 MCP 服务器          首次调用工具
      │                      │
      │ (快速启动)           │ (加载模型)
      ▼                      ▼
  进程就绪 ───────────→  模型加载 (~5-8 秒)
                             │
                             ▼
                        后续调用 (即时)
```

**优点:**
- 启动快
- 不占用内存（如果不调用）

**缺点:**
- 首次调用有延迟

### 预加载模式（可选）

如果希望消除首次调用延迟，可以预加载：

```bash
# 预加载模型到内存
python preload.py
```

**优点:**
- 首次调用无延迟
- 可以提前发现模型问题

**缺点:**
- 启动慢
- 占用内存

---

## 进程管理

### Claude Desktop 自动管理

```
┌─────────────────────────────────────┐
│         Claude Desktop              │
│  ┌─────────────────────────────┐    │
│  │    MCP 进程管理器           │    │
│  │  ┌─────────────────────┐    │    │
│  │  │  retrieve 服务器    │    │    │
│  │  │  (python server.py) │    │    │
│  │  └─────────────────────┘    │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

- Claude Desktop 在调用工具时自动启动服务器
- 服务器保持运行以处理后续请求
- 关闭 Claude Desktop 时服务器自动退出

### 手动调试模式

开发调试时可以手动运行：

```bash
cd /Users/maomin/programs/vscode/learn-claude-code/agents/mcps/retrieve

# 直接运行
python server.py

# 或预加载后运行
python preload.py && python server.py
```

---

## 性能优化建议

### 1. 使用本地模型

确保配置指向本地模型路径，避免每次都下载：

```json
{
  "env": {
    "EMBEDDING_MODEL": "./data/models/bge-small-zh-v1.5",
    "RERANKER_MODEL": "./data/models/bge-reranker-base"
  }
}
```

### 2. 启用缓存

默认已启用 LRU 缓存，相同查询会直接返回：

```python
# server.py 中的缓存配置
config.use_cache = True
config.cache_size = 1000
```

### 3. 调整模型大小

如果内存有限，可以使用更小的模型：

| 模型 | 大小 | 速度 |
|------|------|------|
| bge-small-zh-v1.5 | ~100MB | 快 |
| bge-base-zh-v1.5 | ~200MB | 中 |
| bge-large-zh-v1.5 | ~600MB | 慢 |

---

## 常见问题

### Q: 每次调用都要加载模型吗？

**A:** 不是。模型加载后会在内存中缓存，直到服务器进程退出。

### Q: 如何验证 MCP 服务器已连接？

**A:** 在 Claude Desktop 中输入 `@retrieve` 或查看 MCP 工具列表。

### Q: 首次调用太慢怎么办？

**A:** 可以：
1. 使用预加载：`python preload.py`
2. 使用更小的模型
3. 禁用 Rerank：`use_rerank=False`

### Q: 如何查看服务器日志？

**A:** 设置 `LOG_LEVEL=DEBUG`：
```json
{
  "env": {
    "LOG_LEVEL": "DEBUG"
  }
}
```

---

## 完整配置示例

```json
{
  "mcpServers": {
    "retrieve": {
      "command": "python",
      "args": ["-m", "mcp", "run", "/Users/maomin/programs/vscode/learn-claude-code/agents/mcps/retrieve/server.py"],
      "cwd": "/Users/maomin/programs/vscode/learn-claude-code/agents/mcps/retrieve",
      "env": {
        "CHROMA_PERSIST_DIR": "/Users/maomin/programs/vscode/learn-claude-code/agents/mcps/retrieve/chroma_db",
        "EMBEDDING_MODEL": "/Users/maomin/programs/vscode/learn-claude-code/agents/mcps/retrieve/data/models/bge-small-zh-v1.5",
        "RERANKER_MODEL": "/Users/maomin/programs/vscode/learn-claude-code/agents/mcps/retrieve/data/models/bge-reranker-base",
        "HF_ENDPOINT": "https://hf-mirror.com",
        "DEFAULT_TOP_K": "10",
        "FINAL_TOP_K": "5",
        "BM25_WEIGHT": "0.4",
        "VECTOR_WEIGHT": "0.6",
        "USE_CACHE": "true",
        "LOG_LEVEL": "INFO"
      }
    }
  }
}
```

---

## 总结

| 问题 | 答案 |
|------|------|
| 需要手动启动吗？ | ❌ 不需要，Claude Desktop 自动管理 |
| 模型何时加载？ | 首次调用工具时（懒加载） |
| 如何消除首次延迟？ | 使用 `preload.py` 预加载 |
| 配置在哪里？ | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| 如何验证配置？ | 重启 Claude Desktop，查看 MCP 工具列表 |

---

**文档位置**: `/Users/maomin/programs/vscode/learn-claude-code/agents/mcps/retrieve/CONFIG.md`  
**更新时间**: 2026-02-28
