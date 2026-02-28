# Retrieve MCP 快速入门指南

## 第一步：检查模型

在运行 MCP 服务器之前，需要先下载模型。

### 检查模型是否存在

```bash
cd /Users/maomin/programs/vscode/learn-claude-code/agents/mcps/retrieve

# 运行检查脚本
python -c "
from pathlib import Path
models = [
    './data/models/bge-small-zh-v1.5',
    './data/models/bge-reranker-base'
]
for m in models:
    p = Path(m)
    status = '✓ 存在' if p.exists() else '✗ 不存在'
    print(f'{m}: {status}')
"
```

## 第二步：下载模型（如果不存在）

### 方式 1：使用下载脚本（推荐）

```bash
# 安装依赖
pip install -r requirements.txt

# 下载模型（使用 HuggingFace 镜像）
export HF_ENDPOINT=https://hf-mirror.com
python download_models.py --save-dir ./data/models
```

### 方式 2：手动从 HuggingFace 下载

```bash
# 设置镜像
export HF_ENDPOINT=https://hf-mirror.com

# 使用 git clone 下载
mkdir -p ./data/models

# 下载 BGE 嵌入模型
git clone https://hf-mirror.com/BAAI/bge-small-zh-v1.5 ./data/models/bge-small-zh-v1.5

# 下载 Reranker 模型
git clone https://hf-mirror.com/BAAI/bge-reranker-base ./data/models/bge-reranker-base
```

### 方式 3：使用 Python 脚本下载

```python
from huggingface_hub import snapshot_download
import os

os.environ['HF_ENDPOINT'] = 'https://hf-mirror.com'

# 下载嵌入模型
snapshot_download(
    repo_id="BAAI/bge-small-zh-v1.5",
    local_dir="./data/models/bge-small-zh-v1.5"
)

# 下载 Reranker 模型
snapshot_download(
    repo_id="BAAI/bge-reranker-base",
    local_dir="./data/models/bge-reranker-base"
)
```

## 第三步：运行测试

```bash
# 测试模型加载
python -c "
from sentence_transformers import SentenceTransformer, CrossEncoder

print('加载 BGE 嵌入模型...')
model = SentenceTransformer('./data/models/bge-small-zh-v1.5')
print('✓ 嵌入模型加载成功')

print('加载 Reranker 模型...')
reranker = CrossEncoder('./data/models/bge-reranker-base')
print('✓ Reranker 模型加载成功')
"
```

## 第四步：启动 MCP 服务器

```bash
# 设置环境变量
export CHROMA_PERSIST_DIR="./chroma_db"
export EMBEDDING_MODEL="./data/models/bge-small-zh-v1.5"
export RERANKER_MODEL="./data/models/bge-reranker-base"
export LOG_LEVEL="INFO"

# 运行测试
python test_server.py

# 启动服务
python server.py
```

## 模型信息

| 模型 | 大小 | 用途 | 下载链接 |
|------|------|------|----------|
| BAAI/bge-small-zh-v1.5 | ~100MB | 中文文本向量化 | [HuggingFace](https://hf-mirror.com/BAAI/bge-small-zh-v1.5) |
| BAAI/bge-reranker-base | ~300MB | 重排序 | [HuggingFace](https://hf-mirror.com/BAAI/bge-reranker-base) |

## 常见问题

### Q: 下载速度慢怎么办？

A: 使用镜像源：
```bash
export HF_ENDPOINT=https://hf-mirror.com
```

### Q: 没有网络连接怎么办？

A: 可以手动下载模型文件后复制到 `./data/models/` 目录。

### Q: 模型加载失败怎么办？

A: 检查：
1. 模型目录是否存在
2. 模型文件是否完整（config.json, model.safetensors 等）
3. 依赖是否安装：`pip install -r requirements.txt`

### Q: 内存不足怎么办？

A: 使用更小的模型：
- 嵌入模型：`BAAI/bge-tiny-zh-v1.5`
- Reranker：暂时禁用 rerank 功能

```bash
export EMBEDDING_MODEL="./data/models/bge-tiny-zh-v1.5"
# 或在调用时设置 use_rerank=False
```
