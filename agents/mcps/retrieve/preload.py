#!/usr/bin/env python3
"""
预加载模型并测试检索系统

用途：在正式使用前预加载模型到内存，避免首次调用延迟
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from server import kb, config


def preload_models():
    """预加载所有模型"""
    print("=" * 60)
    print("预加载模型")
    print("=" * 60)
    
    # 1. 加载向量模型
    print("\n[1/3] 加载向量模型...")
    try:
        _ = kb.vector.model
        print("✓ 向量模型加载成功")
    except Exception as e:
        print(f"✗ 向量模型加载失败：{e}")
        return False
    
    # 2. 加载 Reranker 模型
    print("\n[2/3] 加载 Reranker 模型...")
    try:
        _ = kb.reranker.model
        print("✓ Reranker 模型加载成功")
    except Exception as e:
        print(f"✗ Reranker 模型加载失败：{e}")
        return False
    
    # 3. 初始化 BM25（已经自动初始化）
    print("\n[3/3] 检查 BM25 索引...")
    print(f"✓ BM25 索引已就绪（{len(kb.bm25.documents)} 个文档）")
    
    return True


def test_query():
    """测试查询"""
    print("\n" + "=" * 60)
    print("测试查询")
    print("=" * 60)
    
    query = "头发油怎么办"
    print(f"\n查询：{query}")
    
    import time
    start = time.time()
    result = kb.search(query, top_k=3)
    elapsed = time.time() - start
    
    print(f"结果数量：{len(result)}")
    print(f"耗时：{elapsed*1000:.2f}ms")
    
    for i, r in enumerate(result, 1):
        q = r['metadata'].get('question', '')[:50]
        print(f"  {i}. [分数：{r.get('rerank_score', r['similarity'])}] {q}...")


def main():
    print("\nRetrieve MCP 预加载工具\n")
    
    # 预加载模型
    if not preload_models():
        print("\n✗ 预加载失败")
        return 1
    
    # 测试查询
    test_query()
    
    print("\n" + "=" * 60)
    print("✓ 预加载完成，系统已就绪")
    print("=" * 60)
    print("\n提示：")
    print("  - 模型已加载到内存，首次调用延迟已消除")
    print("  - 可以通过 MCP 协议调用工具")
    print("  - 或使用 python test_server.py 进行测试")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
