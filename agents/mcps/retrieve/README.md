# Retrieve MCP Server

基于混合检索（BM25 + 向量 + Rerank）的知识库检索 MCP 服务器。

## 核心特性

### 三级检索架构

```
用户查询
    │
    ├─→ BM25 检索 ──┐
    │   (关键词匹配) │
    │               │
    ├─→ 向量检索 ───┼─→ 分数融合 ──→ Rerank ──→ 最终结果
    │   (语义匹配)  │    (0.4/0.6)    (重排序)
    │               │
    └───────────────┘
```

1. **BM25 检索**: 基于 jieba 分词的关键词匹配，擅长精确匹配
2. **向量检索**: 基于 BGE 嵌入模型的语义匹配，擅长语义理解
3. **Rerank 重排序**: 基于 BGE Reranker 模型的精细排序，提升结果质量

### 主要功能

- ✅ 混合检索（BM25 + 向量 + Rerank）
- ✅ 可配置的权重融合（默认 0.4 BM25 + 0.6 向量）
- ✅ LRU 查询结果缓存
- ✅ 支持类别过滤
- ✅ 知识库问答（RAG）
- ✅ 流式输出支持

## 安装

### 1. 安装依赖

```bash
cd /Users/maomin/programs/vscode/learn-claude-code/agents/mcps/retrieve
pip install -r requirements.txt
```

### 2. 检查/下载模型

```bash
# 检查模型是否存在
python check_models.py

# 如果模型缺失，下载模型（使用 HuggingFace 镜像）
export HF_ENDPOINT=https://hf-mirror.com
python download_models.py --save-dir ./data/models
```

模型会自动下载到 `./data/models` 目录：
- `bge-small-zh-v1.5` - BGE 中文向量嵌入模型 (~100MB)
- `bge-reranker-base` - BGE 重排序模型 (~300MB)

### 3. 配置环境变量（可选）

```bash
# ChromaDB 持久化路径
export CHROMA_PERSIST_DIR="./chroma_db"

# 模型路径
export EMBEDDING_MODEL="./data/models/bge-small-zh-v1.5"
export RERANKER_MODEL="./data/models/bge-reranker-base"

# 检索参数
export DEFAULT_TOP_K=10        # 召回数量
export FINAL_TOP_K=5           # 最终返回数量
export BM25_WEIGHT=0.4         # BM25 权重
export VECTOR_WEIGHT=0.6       # 向量权重
export RERANK_TOP_K=10         # Rerank 候选数量

# 日志级别
export LOG_LEVEL="INFO"
```

## MCP 工具

### retrieve_knowledge

混合检索相关知识。

**参数**:
- `query` (string): 用户查询文本
- `top_k` (integer, optional): 返回结果数量，默认 5
- `use_rerank` (boolean, optional): 是否使用 rerank，默认 true
- `collection_name` (string, optional): 集合名称，默认 "hair_knowledge"
- `filter_category` (string, optional): 按类别过滤

**返回**:
```json
{
  "query": "头发油怎么办",
  "results": [
    {
      "id": "kb_001",
      "content": "问题：头发容易出油怎么办？\n答案：...",
      "metadata": {"question": "...", "answer": "...", "category": "hair_problem"},
      "similarity": 0.8542,
      "rerank_score": 0.9123
    }
  ],
  "count": 3,
  "search_info": {
    "bm25_weight": 0.4,
    "vector_weight": 0.6,
    "use_rerank": true
  }
}
```

### kb_qa

基于知识库进行问答。

**参数**:
- `question` (string): 用户问题
- `report` (string, optional): 检测报告内容
- `top_k` (integer, optional): 检索数量，默认 5
- `use_rerank` (boolean, optional): 是否使用 rerank
- `collection_name` (string, optional): 集合名称

**返回**:
```json
{
  "answer": "基于以下知识库内容回答用户问题...\n\n相关知识库内容：...",
  "sources": [{"id": "...", "similarity": 0.85, "question": "...", "answer": "..."}],
  "context": "...",
  "has_knowledge": true
}
```

### add_knowledge

添加知识条目。

**参数**:
- `entries` (array): 知识条目列表
  - `question` (string, required): 问题
  - `answer` (string, required): 答案
  - `category` (string, optional): 分类
  - `metadata` (object, optional): 其他元数据
- `collection_name` (string, optional): 集合名称

### list_knowledge_collections

列出所有知识库集合。

### get_knowledge_stats

获取集合统计信息。

### clear_collection

清空指定集合。

## 运行

### 测试

```bash
# 运行测试脚本
python test_server.py
```

### 启动 MCP 服务器

```bash
# 直接运行
python server.py

# 或使用 npx
npx -y @anthropic/mcp-dev-server server.py
```

### Claude Desktop 配置

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
        "RERANKER_MODEL": "./data/models/bge-reranker-base"
      }
    }
  }
}
```

## 检索流程说明

### 1. 索引构建

当添加知识条目时：
1. 生成文档 ID（基于内容哈希）
2. 使用 BGE 模型生成向量嵌入
3. 存储到 ChromaDB（向量 + 元数据）
4. 添加到 BM25 倒排索引（分词后）

### 2. 检索流程

```
1. 接收查询
       │
2. BM25 检索 ──────────────→ 得到 BM25 分数
   (jieba 分词 + 倒排索引)
       │
3. 向量检索 ───────────────→ 得到向量相似度
   (ChromaDB 查询)
       │
4. 合并结果 ───────────────→ 取并集
       │
5. 分数归一化 ─────────────→ BM25 分数归一化到 [0,1]
       │
6. 加权融合 ───────────────→ hybrid = 0.4*BM25 + 0.6*vector
       │
7. 选取候选 ───────────────→ Top-K (rerank_top_k)
       │
8. Rerank 重排序 ─────────→ 最终排序分数
   (CrossEncoder)
       │
9. 返回结果 ───────────────→ Top-K (final_top_k)
```

### 3. 分数计算

**BM25 分数**:
```
IDF(t) = log((N - df(t) + 0.5) / (df(t) + 0.5) + 1)
TF(t,d) = (tf(t,d) * (k1 + 1)) / (tf(t,d) + k1 * (1 - b + b * |d|/avgdl))
BM25(d,q) = Σ IDF(t) * TF(t,d)
```

**向量相似度**:
```
cosine_similarity = (A · B) / (||A|| * ||B||)
```

**混合分数**:
```
hybrid_score = 0.4 * norm_bm25 + 0.6 * vector_similarity
```

**Rerank 分数**:
```
rerank_score = CrossEncoder(query, document)
```

## 性能优化

- **LRU 缓存**: 缓存查询结果，避免重复检索
- **懒加载模型**: 首次使用时才加载模型
- **批量向量化**: 支持批量编码文本
- **混合检索**: 结合关键词和语义匹配，提升召回质量

## 与原始 kbqa.py 的对比

| 特性 | 原始 kbqa.py | 优化后 Retrieve MCP |
|------|-------------|---------------------|
| 检索方式 | BM25 + FAISS | BM25 + ChromaDB + Rerank |
| 权重融合 | 0.4/0.6 | 可配置 |
| Rerank | ✅ bge-reranker | ✅ bge-reranker-base |
| 缓存 | ❌ | ✅ LRU 缓存 |
| 模型路径 | 硬编码 | 环境变量配置 |
| 代码结构 | 面向过程 | 面向对象 |
| 错误处理 | 基础 | 完善 |
| MCP 支持 | ❌ | ✅ |

## 目录结构

```
retrieve/
├── README.md              # 本文件
├── server.py              # MCP 服务器主程序
├── config.py              # 配置管理
├── download_models.py     # 模型下载脚本
├── requirements.txt       # Python 依赖
├── example_knowledge.json # 示例数据
├── test_server.py         # 测试脚本
└── ANALYSIS.md            # 代码分析报告
```

## License

MIT
