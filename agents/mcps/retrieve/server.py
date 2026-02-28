#!/usr/bin/env python3
"""
Retrieve MCP Server - 基于混合检索的知识库检索系统

优化自 hair_llm/kbqa.py，实现 BM25 + 向量召回 + Rerank 的三级检索架构。

核心特性：
1. BM25 关键词检索 - 基于 jieba 分词
2. 向量语义检索 - 基于 BGE 嵌入模型
3. Rerank 重排序 - 基于 BGE Reranker 模型
4. 混合得分融合 - 0.4 * BM25 + 0.6 * 向量得分

MCP 工具：
- retrieve_knowledge: 混合检索相关知识
- kb_qa: 知识库问答
- add_knowledge: 添加知识条目
- list_knowledge_collections: 列出集合
- get_knowledge_stats: 获取统计信息
- clear_collection: 清空集合
"""

import os
import json
import logging
import hashlib
from typing import Optional, List, Dict, Any, Tuple
from pathlib import Path
from dataclasses import dataclass, field

from mcp.server.fastmcp import FastMCP
import chromadb
from chromadb.config import Settings

# ==================== 配置管理 ====================

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("retrieve-mcp")

mcp = FastMCP("retrieve")


def check_model_path(model_path: str, model_name: str) -> bool:
    """检查模型路径是否存在"""
    path = Path(model_path)
    if not path.exists():
        logger.warning(f"模型路径不存在：{model_path}")
        logger.warning(f"请运行以下命令下载模型：")
        logger.warning(f"  export HF_ENDPOINT=https://hf-mirror.com")
        logger.warning(f"  python download_models.py --save-dir ./data/models")
        return False
    
    # 检查关键文件
    config_file = path / "config.json"
    if not config_file.exists():
        logger.warning(f"模型文件不完整，缺少 config.json: {model_path}")
        return False
    
    logger.info(f"模型检查通过：{model_name}")
    return True


@dataclass
class RetrieveConfig:
    """检索系统配置"""
    # ChromaDB 配置
    chroma_persist_dir: str = "./chroma_db"
    
    # 模型配置
    embedding_model: str = "./data/models/bge-small-zh-v1.5"
    reranker_model: str = "./data/models/bge-reranker-base"
    
    # 检索配置
    default_collection: str = "hair_knowledge"
    default_top_k: int = 10  # 召回数量
    final_top_k: int = 5     # rerank 后返回数量
    bm25_weight: float = 0.4
    vector_weight: float = 0.6
    rerank_top_k: int = 10   # rerank 候选数量
    
    # 内容限制
    max_content_length: int = 512
    
    # 缓存配置
    use_cache: bool = True
    cache_size: int = 1000

    @classmethod
    def from_env(cls) -> "RetrieveConfig":
        """从环境变量加载配置"""
        return cls(
            chroma_persist_dir=os.getenv("CHROMA_PERSIST_DIR", "./chroma_db"),
            embedding_model=os.getenv("EMBEDDING_MODEL", "./data/models/bge-small-zh-v1.5"),
            reranker_model=os.getenv("RERANKER_MODEL", "./data/models/bge-reranker-base"),
            default_collection=os.getenv("DEFAULT_COLLECTION", "hair_knowledge"),
            default_top_k=int(os.getenv("DEFAULT_TOP_K", "10")),
            final_top_k=int(os.getenv("FINAL_TOP_K", "5")),
            bm25_weight=float(os.getenv("BM25_WEIGHT", "0.4")),
            vector_weight=float(os.getenv("VECTOR_WEIGHT", "0.6")),
            rerank_top_k=int(os.getenv("RERANK_TOP_K", "10")),
            max_content_length=int(os.getenv("MAX_CONTENT_LENGTH", "512")),
        )


config = RetrieveConfig.from_env()

# ==================== 缓存类 ====================


class LRUCache:
    """LRU 缓存，用于缓存查询结果"""
    
    def __init__(self, capacity: int = 1000):
        self.capacity = capacity
        self.cache: Dict[str, Any] = {}
        self.order: List[str] = []
    
    def get(self, key: str) -> Optional[Any]:
        if key in self.cache:
            self.order.remove(key)
            self.order.append(key)
            return self.cache[key]
        return None
    
    def put(self, key: str, value: Any):
        if key in self.cache:
            self.order.remove(key)
        elif len(self.cache) >= self.capacity:
            oldest = self.order.pop(0)
            del self.cache[oldest]
        self.cache[key] = value
        self.order.append(key)


# ==================== BM25 检索器 ====================


class BM25Retriever:
    """BM25 关键词检索器，基于 jieba 分词"""
    
    def __init__(self):
        import jieba
        import jieba.analyse
        self.jieba = jieba
        self.documents: Dict[str, List[str]] = {}  # id -> tokens
        self.doc_freq: Dict[str, int] = {}  # term -> doc count
        self.doc_lengths: Dict[str, int] = {}  # id -> doc length
        self.avg_doc_length: float = 0
        self.total_docs: int = 0
        
        # BM25 参数
        self.k1 = 1.5
        self.b = 0.75
        
        logger.info("BM25Retriever 初始化完成")
    
    def tokenize(self, text: str) -> List[str]:
        """中文分词"""
        return list(self.jieba.cut(text.lower()))
    
    def add_document(self, doc_id: str, text: str):
        """添加文档到索引"""
        tokens = self.tokenize(text)
        self.documents[doc_id] = tokens
        self.doc_lengths[doc_id] = len(tokens)
        
        # 更新文档频率
        unique_tokens = set(tokens)
        for token in unique_tokens:
            self.doc_freq[token] = self.doc_freq.get(token, 0) + 1
        
        # 更新平均长度
        self.total_docs = len(self.documents)
        total_length = sum(self.doc_lengths.values())
        self.avg_doc_length = total_length / self.total_docs if self.total_docs > 0 else 0
    
    def remove_document(self, doc_id: str):
        """从索引中移除文档"""
        if doc_id not in self.documents:
            return
        
        tokens = self.documents[doc_id]
        unique_tokens = set(tokens)
        
        # 更新文档频率
        for token in unique_tokens:
            if token in self.doc_freq:
                self.doc_freq[token] -= 1
                if self.doc_freq[token] <= 0:
                    del self.doc_freq[token]
        
        del self.documents[doc_id]
        del self.doc_lengths[doc_id]
        
        # 重新计算平均长度
        self.total_docs = len(self.documents)
        if self.total_docs > 0:
            total_length = sum(self.doc_lengths.values())
            self.avg_doc_length = total_length / self.total_docs
    
    def bm25_score(self, query_tokens: List[str], doc_id: str) -> float:
        """计算单个文档的 BM25 分数"""
        if doc_id not in self.documents:
            return 0.0
        
        doc_tokens = self.documents[doc_id]
        doc_len = self.doc_lengths[doc_id]
        
        score = 0.0
        doc_token_count = {}
        for token in doc_tokens:
            doc_token_count[token] = doc_token_count.get(token, 0) + 1
        
        for query_token in query_tokens:
            if query_token not in self.doc_freq:
                continue
            
            # IDF
            idf = max(0, (
                (self.total_docs - self.doc_freq[query_token] + 0.5) / 
                (self.doc_freq[query_token] + 0.5) + 1
            ))
            
            # TF
            tf = doc_token_count.get(query_token, 0)
            tf_score = (tf * (self.k1 + 1)) / (
                tf + self.k1 * (1 - self.b + self.b * doc_len / self.avg_doc_length)
            ) if self.avg_doc_length > 0 else 0
            
            score += idf * tf_score
        
        return score
    
    def search(self, query: str, top_k: int = 10) -> List[Tuple[str, float]]:
        """搜索相关文档"""
        query_tokens = self.tokenize(query)
        
        scores = []
        for doc_id in self.documents:
            score = self.bm25_score(query_tokens, doc_id)
            if score > 0:
                scores.append((doc_id, score))
        
        # 按分数排序
        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[:top_k]
    
    def clear(self):
        """清空索引"""
        self.documents.clear()
        self.doc_freq.clear()
        self.doc_lengths.clear()
        self.avg_doc_length = 0
        self.total_docs = 0


# ==================== 向量检索器 ====================


class VectorRetriever:
    """向量检索器，基于 BGE 嵌入模型"""
    
    def __init__(self, model_path: str = None):
        self.model_path = model_path or config.embedding_model
        self._model = None
        
        # 检查模型路径
        if not check_model_path(self.model_path, "BGE 嵌入模型"):
            logger.error(f"请确保模型已下载：{self.model_path}")
        
        logger.info(f"VectorRetriever 初始化，模型路径：{self.model_path}")
    
    @property
    def model(self):
        """懒加载模型"""
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer
                self._model = SentenceTransformer(self.model_path)
                logger.info(f"向量模型加载成功：{self.model_path}")
            except Exception as e:
                logger.error(f"加载向量模型失败：{e}")
                raise
        return self._model
    
    def encode(self, texts: List[str], normalize: bool = True) -> List[List[float]]:
        """编码文本为向量"""
        embeddings = self.model.encode(
            texts,
            convert_to_numpy=True,
            normalize_embeddings=normalize
        )
        return embeddings.tolist()
    
    def similarity(self, query_vector: List[float], doc_vectors: List[List[float]]) -> List[float]:
        """计算余弦相似度"""
        import numpy as np
        query_vec = np.array(query_vector)
        doc_vecs = np.array(doc_vectors)
        
        # 余弦相似度
        similarities = np.dot(doc_vecs, query_vec) / (
            np.linalg.norm(doc_vecs, axis=1) * np.linalg.norm(query_vec)
        )
        return similarities.tolist()


# ==================== Reranker ====================


class Reranker:
    """Rerank 重排序器，基于 BGE Reranker 模型"""
    
    def __init__(self, model_path: str = None):
        self.model_path = model_path or config.reranker_model
        self._model = None
        
        # 检查模型路径
        if not check_model_path(self.model_path, "BGE Reranker 模型"):
            logger.error(f"请确保模型已下载：{self.model_path}")
        
        logger.info(f"Reranker 初始化，模型路径：{self.model_path}")
    
    @property
    def model(self):
        """懒加载模型"""
        if self._model is None:
            try:
                from sentence_transformers import CrossEncoder
                self._model = CrossEncoder(self.model_path)
                logger.info(f"Reranker 模型加载成功：{self.model_path}")
            except Exception as e:
                logger.error(f"加载 Reranker 模型失败：{e}")
                raise
        return self._model
    
    def rerank(
        self,
        query: str,
        documents: List[str],
        top_k: int = 5
    ) -> List[Tuple[int, float]]:
        """
        重排序文档
        
        Args:
            query: 查询文本
            documents: 候选文档列表
            top_k: 返回前 K 个结果
            
        Returns:
            (索引，分数) 列表
        """
        if not documents:
            return []
        
        # 创建句子对
        pairs = [[query, doc] for doc in documents]
        
        # 计算分数
        scores = self.model.predict(pairs)
        
        # 创建索引 - 分数对
        indexed_scores = list(enumerate(scores.tolist()))
        
        # 按分数排序
        indexed_scores.sort(key=lambda x: x[1], reverse=True)
        
        return indexed_scores[:top_k]


# ==================== 知识库管理类 ====================


class KnowledgeBase:
    """知识库管理类，封装混合检索逻辑"""
    
    def __init__(self, persist_dir: str = None):
        self.persist_dir = persist_dir or config.chroma_persist_dir
        self._client = None
        self._collections: Dict[str, Any] = {}
        
        # 初始化检索器
        self.bm25 = BM25Retriever()
        self.vector = VectorRetriever()
        self.reranker = Reranker()
        
        # 缓存
        self.cache = LRUCache(config.cache_size) if config.use_cache else None
        
        logger.info(f"KnowledgeBase 初始化，持久化目录：{self.persist_dir}")
    
    @property
    def client(self) -> chromadb.Client:
        """获取 ChromaDB 客户端"""
        if self._client is None:
            self._client = chromadb.PersistentClient(
                path=self.persist_dir,
                settings=Settings(
                    anonymized_telemetry=False,
                    allow_reset=True
                )
            )
        return self._client
    
    def get_or_create_collection(self, name: str = None) -> chromadb.Collection:
        """获取或创建集合"""
        name = name or config.default_collection
        if name not in self._collections:
            self._collections[name] = self.client.get_or_create_collection(
                name=name,
                metadata={"description": f"Knowledge base: {name}"}
            )
            logger.info(f"获取/创建集合：{name}")
        return self._collections[name]
    
    def _generate_id(self, text: str) -> str:
        """生成文档 ID"""
        return hashlib.md5(text.encode()).hexdigest()
    
    def add_entries(
        self,
        entries: List[Dict[str, Any]],
        collection_name: str = None
    ) -> Dict[str, Any]:
        """添加知识条目"""
        collection = self.get_or_create_collection(collection_name)
        
        ids = []
        documents = []
        metadatas = []
        
        for i, entry in enumerate(entries):
            entry_id = entry.get("id") or self._generate_id(
                entry.get("question", "") + entry.get("answer", "")
            )
            ids.append(entry_id)
            
            content = f"问题：{entry.get('question', '')}\n答案：{entry.get('answer', '')}"
            documents.append(self._truncate(content))
            
            metadata = {
                "question": self._truncate(entry.get("question", ""), 256),
                "answer": self._truncate(entry.get("answer", ""), 512),
                "category": entry.get("category", "general"),
            }
            if "metadata" in entry and isinstance(entry["metadata"], dict):
                for k, v in entry["metadata"].items():
                    if isinstance(v, (str, int, float, bool)):
                        metadata[k] = v
            metadatas.append(metadata)
        
        if documents:
            # 生成向量
            embeddings = self.vector.encode(documents)
            
            # 添加到 ChromaDB
            collection.upsert(
                ids=ids,
                embeddings=embeddings,
                documents=documents,
                metadatas=metadatas
            )
            
            # 添加到 BM25 索引
            for doc_id, doc in zip(ids, documents):
                self.bm25.add_document(doc_id, doc)
            
            logger.info(f"添加 {len(documents)} 个条目到集合 {collection_name}")
        
        return {"added_count": len(ids), "ids": ids}
    
    def _truncate(self, text: str, max_length: int = None) -> str:
        """截断文本"""
        max_length = max_length or config.max_content_length
        if len(text) <= max_length:
            return text
        return text[:max_length] + "..."
    
    def search(
        self,
        query: str,
        top_k: int = None,
        use_rerank: bool = True,
        collection_name: str = None,
        filter_category: str = None
    ) -> List[Dict[str, Any]]:
        """
        混合检索：BM25 + 向量 + Rerank
        
        Args:
            query: 查询文本
            top_k: 返回结果数量
            use_rerank: 是否使用 rerank
            collection_name: 集合名称
            filter_category: 类别过滤
            
        Returns:
            检索结果列表
        """
        top_k = top_k or config.final_top_k
        collection = self.get_or_create_collection(collection_name)
        
        # 检查缓存
        cache_key = f"{query}:{top_k}:{collection_name}:{filter_category}"
        if self.cache and (cached := self.cache.get(cache_key)):
            logger.info(f"使用缓存结果：{query[:50]}...")
            return cached
        
        # 1. BM25 检索
        bm25_results = self.bm25.search(query, top_k=config.rerank_top_k * 2)
        bm25_scores = {doc_id: score for doc_id, score in bm25_results}
        
        # 2. 向量检索
        query_embedding = self.vector.encode([query])[0]
        vector_results = collection.query(
            query_embeddings=[query_embedding],
            n_results=config.rerank_top_k * 2,
            include=["documents", "metadatas", "distances"]
        )
        
        # 3. 合并结果 (取并集)
        all_doc_ids = set(bm25_scores.keys())
        if vector_results["ids"] and vector_results["ids"][0]:
            for i, doc_id in enumerate(vector_results["ids"][0]):
                all_doc_ids.add(doc_id)
        
        # 4. 计算混合分数
        hybrid_scores = []
        for doc_id in all_doc_ids:
            bm25_score = bm25_scores.get(doc_id, 0)
            
            # 向量分数
            vector_score = 0
            if vector_results["ids"] and doc_id in vector_results["ids"][0]:
                idx = vector_results["ids"][0].index(doc_id)
                distance = vector_results["distances"][0][idx]
                vector_score = 1 - distance  # 转换为相似度
            
            # 归一化 BM25 分数
            max_bm25 = max(bm25_scores.values()) if bm25_scores else 1
            norm_bm25 = bm25_score / max_bm25 if max_bm25 > 0 else 0
            
            # 混合分数
            hybrid_score = (
                config.bm25_weight * norm_bm25 +
                config.vector_weight * vector_score
            )
            
            hybrid_scores.append((doc_id, hybrid_score))
        
        # 5. 按混合分数排序，取前 K 个
        hybrid_scores.sort(key=lambda x: x[1], reverse=True)
        candidate_ids = [doc_id for doc_id, _ in hybrid_scores[:config.rerank_top_k]]
        
        # 6. 获取候选文档内容
        candidate_docs = []
        candidate_metas = []
        
        if vector_results["ids"] and vector_results["ids"][0]:
            for i, doc_id in enumerate(vector_results["ids"][0]):
                if doc_id in candidate_ids:
                    candidate_docs.append(vector_results["documents"][0][i])
                    candidate_metas.append(vector_results["metadatas"][0][i])
        
        # 对于 BM25 独有结果，需要从 ChromaDB 获取
        existing_ids = set()
        if vector_results["ids"] and vector_results["ids"][0]:
            existing_ids = set(vector_results["ids"][0])
        
        for doc_id in candidate_ids:
            if doc_id not in existing_ids:
                # 从 ChromaDB 获取
                result = collection.get(ids=[doc_id], include=["documents", "metadatas"])
                if result["documents"]:
                    candidate_docs.append(result["documents"][0])
                    candidate_metas.append(result["metadatas"][0] if result["metadatas"] else {})
        
        # 7. Rerank
        if use_rerank and candidate_docs and len(candidate_docs) > 1:
            rerank_results = self.reranker.rerank(
                query,
                candidate_docs,
                top_k=top_k
            )
            
            # 构建最终结果
            final_results = []
            for idx, score in rerank_results:
                if idx < len(candidate_docs):
                    doc_id = candidate_ids[idx] if idx < len(candidate_ids) else f"doc_{idx}"
                    final_results.append({
                        "id": doc_id,
                        "content": candidate_docs[idx],
                        "metadata": candidate_metas[idx] if idx < len(candidate_metas) else {},
                        "similarity": round(float(score), 4),
                        "rerank_score": round(float(score), 4)
                    })
            
            results = final_results
        else:
            # 不使用 rerank，直接返回混合检索结果
            results = []
            for doc_id, score in hybrid_scores[:top_k]:
                # 获取文档内容
                doc_content = ""
                doc_meta = {}
                if doc_id in [did for did, _ in hybrid_scores]:
                    idx = 0
                    if vector_results["ids"] and doc_id in vector_results["ids"][0]:
                        idx = vector_results["ids"][0].index(doc_id)
                        doc_content = vector_results["documents"][0][idx]
                        doc_meta = vector_results["metadatas"][0][idx] if vector_results["metadatas"] else {}
                
                results.append({
                    "id": doc_id,
                    "content": doc_content,
                    "metadata": doc_meta,
                    "similarity": round(float(score), 4)
                })
        
        logger.info(f"检索 '{query[:50]}...' 找到 {len(results)} 个结果")
        
        # 缓存结果
        if self.cache:
            self.cache.put(cache_key, results)
        
        return results
    
    def list_collections(self) -> List[str]:
        """列出所有集合"""
        return [col.name for col in self.client.list_collections()]
    
    def get_stats(self, collection_name: str = None) -> Dict[str, Any]:
        """获取统计信息"""
        collection = self.get_or_create_collection(collection_name)
        return {
            "name": collection.name,
            "count": collection.count(),
            "metadata": collection.metadata
        }
    
    def clear(self):
        """清空所有索引"""
        self.bm25.clear()
        if self.cache:
            self.cache = LRUCache(config.cache_size)


# 全局知识库实例
kb = KnowledgeBase()

# ==================== MCP 工具 ====================


@mcp.tool()
def retrieve_knowledge(
    query: str,
    top_k: int = 5,
    use_rerank: bool = True,
    collection_name: str = "hair_knowledge",
    filter_category: str = None
) -> Dict[str, Any]:
    """
    从知识库中检索相关信息（混合检索：BM25 + 向量 + Rerank）
    
    Args:
        query: 用户查询文本
        top_k: 返回结果数量，默认 5
        use_rerank: 是否使用 rerank 重排序，默认 True
        collection_name: 知识库集合名称，默认 "hair_knowledge"
        filter_category: 按类别过滤（可选）
    
    Returns:
        检索结果，包含:
        - query: 原始查询
        - results: 检索结果列表（按相关性排序）
        - count: 结果数量
        - search_info: 检索信息（使用的检索器等）
    """
    try:
        logger.info(f"检索查询：{query[:100]}")
        results = kb.search(
            query=query,
            top_k=top_k,
            use_rerank=use_rerank,
            collection_name=collection_name,
            filter_category=filter_category
        )
        return {
            "query": query,
            "results": results,
            "count": len(results),
            "search_info": {
                "bm25_weight": config.bm25_weight,
                "vector_weight": config.vector_weight,
                "use_rerank": use_rerank
            }
        }
    except Exception as e:
        logger.error(f"检索失败：{e}")
        return {
            "query": query,
            "results": [],
            "count": 0,
            "error": str(e)
        }


@mcp.tool()
def kb_qa(
    question: str,
    report: str = None,
    top_k: int = 5,
    use_rerank: bool = True,
    collection_name: str = "hair_knowledge"
) -> Dict[str, Any]:
    """
    基于知识库进行问答
    
    Args:
        question: 用户问题
        report: 检测报告内容（可选）
        top_k: 检索结果数量，默认 5
        use_rerank: 是否使用 rerank，默认 True
        collection_name: 知识库集合名称
    
    Returns:
        问答结果，包含:
        - answer: 基于知识库生成的答案（包含构建的 prompt）
        - sources: 引用来源列表
        - context: 检索到的上下文
        - has_knowledge: 是否找到相关知识
    """
    try:
        logger.info(f"KBQA 问题：{question[:100]}")
        
        # 检索相关知识
        search_results = kb.search(
            query=question,
            top_k=top_k,
            use_rerank=use_rerank,
            collection_name=collection_name
        )
        
        # 构建上下文
        context_parts = []
        sources = []
        for i, result in enumerate(search_results, 1):
            context_parts.append(f"[来源{i}] {result['content']}")
            sources.append({
                "id": result["id"],
                "similarity": result["similarity"],
                "question": result["metadata"].get("question", ""),
                "answer": result["metadata"].get("answer", "")
            })
        
        context = "\n\n".join(context_parts) if context_parts else "未找到相关知识库内容"
        
        # 构建 prompt
        if report:
            prompt = f"""基于以下检测报告和相关知识库内容，回答用户问题。

检测报告：
{report}

相关知识库内容：
{context}

用户问题：{question}

请综合以上信息，给出专业、准确的回答。"""
        else:
            prompt = f"""基于以下知识库内容回答用户问题。

相关知识库内容：
{context}

用户问题：{question}

请基于以上知识库内容，给出专业、准确的回答。如果知识库中没有相关信息，请说明。"""
        
        return {
            "answer": prompt,
            "sources": sources,
            "context": context,
            "has_knowledge": len(search_results) > 0
        }
    except Exception as e:
        logger.error(f"KBQA 失败：{e}")
        return {
            "answer": f"回答失败：{str(e)}",
            "sources": [],
            "context": "",
            "has_knowledge": False,
            "error": str(e)
        }


@mcp.tool()
def add_knowledge(
    entries: List[Dict[str, Any]],
    collection_name: str = "hair_knowledge"
) -> Dict[str, Any]:
    """
    向知识库添加新的知识条目
    
    Args:
        entries: 知识条目列表，每个条目包含:
            - question: 问题文本（必需）
            - answer: 答案文本（必需）
            - category: 分类（可选）
            - metadata: 其他元数据（可选）
        collection_name: 知识库集合名称
    
    Returns:
        添加结果，包含:
        - added_count: 成功添加的数量
        - ids: 添加的条目 ID 列表
    """
    try:
        logger.info(f"添加 {len(entries)} 个知识条目")
        
        valid_entries = []
        for entry in entries:
            if "question" not in entry or "answer" not in entry:
                logger.warning(f"跳过无效条目：缺少 question 或 answer")
                continue
            valid_entries.append(entry)
        
        if not valid_entries:
            return {"added_count": 0, "ids": [], "error": "没有有效的知识条目"}
        
        result = kb.add_entries(entries=valid_entries, collection_name=collection_name)
        return result
    except Exception as e:
        logger.error(f"添加知识失败：{e}")
        return {"added_count": 0, "ids": [], "error": str(e)}


@mcp.tool()
def list_knowledge_collections() -> Dict[str, Any]:
    """
    列出所有知识库集合
    
    Returns:
        集合列表和统计信息
    """
    try:
        collections = kb.client.list_collections()
        collection_info = []
        for col in collections:
            stats = kb.get_stats(col.name)
            collection_info.append(stats)
        return {"collections": collection_info, "count": len(collection_info)}
    except Exception as e:
        logger.error(f"列出集合失败：{e}")
        return {"collections": [], "count": 0, "error": str(e)}


@mcp.tool()
def get_knowledge_stats(collection_name: str = "hair_knowledge") -> Dict[str, Any]:
    """
    获取知识库统计信息
    """
    try:
        return kb.get_stats(collection_name)
    except Exception as e:
        logger.error(f"获取统计信息失败：{e}")
        return {"error": str(e)}


@mcp.tool()
def clear_collection(collection_name: str = "hair_knowledge") -> Dict[str, Any]:
    """
    清空指定集合（谨慎使用）
    """
    try:
        kb.client.delete_collection(collection_name)
        if collection_name in kb._collections:
            del kb._collections[collection_name]
        kb.bm25.clear()
        logger.info(f"清空集合：{collection_name}")
        return {"success": True, "message": f"集合 {collection_name} 已清空"}
    except Exception as e:
        logger.error(f"清空集合失败：{e}")
        return {"success": False, "error": str(e)}


# ==================== 主程序 ====================

if __name__ == "__main__":
    mcp.run()
