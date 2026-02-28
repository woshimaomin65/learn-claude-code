# Retrieve MCP Server 配置文件

混合检索系统配置：BM25 + 向量 + Rerank

注意：请确保模型已下载。运行以下命令检查：
    python check_models.py

如果模型缺失，请运行：
    export HF_ENDPOINT=https://hf-mirror.com
    python download_models.py --save-dir ./data/models

import os
from dataclasses import dataclass, field
from typing import Optional, List


@dataclass
class ChromaConfig:
    """ChromaDB 配置"""
    persist_dir: str = "./chroma_db"
    anonymized_telemetry: bool = False
    allow_reset: bool = True


@dataclass
class ModelConfig:
    """模型配置"""
    # BGE 向量嵌入模型
    embedding_model: str = "./data/models/bge-small-zh-v1.5"
    # BGE Reranker 模型
    reranker_model: str = "./data/models/bge-reranker-base"
    # 向量维度
    embedding_dimension: int = 512
    # 最大序列长度
    max_length: int = 512


@dataclass
class RetrieveConfig:
    """检索配置"""
    # 默认集合
    default_collection: str = "hair_knowledge"
    
    # 召回配置
    default_top_k: int = 10      # BM25 和向量召回数量
    rerank_top_k: int = 10       # Rerank 候选数量
    final_top_k: int = 5         # 最终返回数量
    
    # 混合检索权重
    bm25_weight: float = 0.4     # BM25 权重
    vector_weight: float = 0.6   # 向量权重
    
    # 分数阈值
    similarity_threshold: float = 0.5
    rerank_threshold: float = 0.3
    
    # 内容限制
    max_content_length: int = 512
    
    # 支持的类别
    categories: List[str] = field(default_factory=lambda: [
        "general",
        "hair_type",
        "hair_problem",
        "treatment",
        "product",
        "maintenance"
    ])


@dataclass
class CacheConfig:
    """缓存配置"""
    use_cache: bool = True
    cache_size: int = 1000
    cache_ttl: int = 3600  # 秒


@dataclass
class LogConfig:
    """日志配置"""
    level: str = "INFO"
    format: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    file: Optional[str] = None


def load_config() -> dict:
    """从环境变量加载配置"""
    return {
        "chroma": ChromaConfig(
            persist_dir=os.getenv("CHROMA_PERSIST_DIR", "./chroma_db"),
        ),
        "model": ModelConfig(
            embedding_model=os.getenv("EMBEDDING_MODEL", "./data/models/bge-small-zh-v1.5"),
            reranker_model=os.getenv("RERANKER_MODEL", "./data/models/bge-reranker-base"),
        ),
        "retrieve": RetrieveConfig(
            default_collection=os.getenv("DEFAULT_COLLECTION", "hair_knowledge"),
            default_top_k=int(os.getenv("DEFAULT_TOP_K", "10")),
            final_top_k=int(os.getenv("FINAL_TOP_K", "5")),
            bm25_weight=float(os.getenv("BM25_WEIGHT", "0.4")),
            vector_weight=float(os.getenv("VECTOR_WEIGHT", "0.6")),
            rerank_top_k=int(os.getenv("RERANK_TOP_K", "10")),
        ),
        "cache": CacheConfig(
            use_cache=os.getenv("USE_CACHE", "true").lower() == "true",
            cache_size=int(os.getenv("CACHE_SIZE", "1000")),
        ),
        "log": LogConfig(
            level=os.getenv("LOG_LEVEL", "INFO"),
        )
    }


if __name__ == "__main__":
    config = load_config()
    print("当前配置：")
    for section, values in config.items():
        print(f"\n{section}:")
        if hasattr(values, '__dataclass_fields__'):
            for field_name in values.__dataclass_fields__:
                print(f"  {field_name}: {getattr(values, field_name)}")
