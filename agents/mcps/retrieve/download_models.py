#!/usr/bin/env python3
"""
Retrieve MCP 模型下载脚本

使用方法:
    python download_models.py [--save-dir ./data/models]
"""

import os
import sys
from pathlib import Path


def check_model_exists(model_path: str) -> bool:
    """检查模型是否已存在"""
    path = Path(model_path)
    if not path.exists():
        return False
    config_file = path / "config.json"
    if not config_file.exists():
        return False
    model_files = ["model.safetensors", "pytorch_model.bin", "model.bin"]
    return any((path / f).exists() for f in model_files)


def download_from_hf(model_id: str, save_dir: str) -> bool:
    """从 HuggingFace 下载"""
    print(f"从 HuggingFace 下载：{model_id}")
    try:
        from huggingface_hub import snapshot_download
        os.environ['HF_ENDPOINT'] = 'https://hf-mirror.com'
        
        snapshot_download(
            repo_id=model_id,
            local_dir=save_dir,
            resume_download=True
        )
        
        if check_model_exists(save_dir):
            print(f"✓ 下载成功：{save_dir}")
            return True
        return False
    except Exception as e:
        print(f"✗ HuggingFace 下载失败：{e}")
        return False


def download_from_ms(model_id: str, save_dir: str) -> bool:
    """从 ModelScope 下载"""
    print(f"从 ModelScope 下载：{model_id}")
    try:
        from modelscope.hub.snapshot_download import snapshot_download
        
        snapshot_download(
            model_id=model_id,
            local_dir=save_dir,
            resume_download=True
        )
        
        if check_model_exists(save_dir):
            print(f"✓ 下载成功：{save_dir}")
            return True
        return False
    except Exception as e:
        print(f"✗ ModelScope 下载失败：{e}")
        return False


def download_model(name: str, model_id: str, save_dir: str) -> bool:
    """下载单个模型"""
    print(f"\n{'='*50}")
    print(f"下载：{name}")
    print(f"{'='*50}")
    
    # 检查是否已存在
    if check_model_exists(save_dir):
        print(f"✓ 已存在，跳过：{save_dir}")
        return True
    
    # 尝试 HuggingFace
    if download_from_hf(model_id, save_dir):
        return True
    
    # 尝试 ModelScope
    if download_from_ms(model_id, save_dir):
        return True
    
    print(f"✗ 下载失败，请手动下载：{model_id}")
    return False


def main():
    print("=" * 50)
    print("Retrieve MCP 模型下载工具")
    print("=" * 50)
    
    save_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "./data/models")
    save_dir.mkdir(parents=True, exist_ok=True)
    
    models = [
        ("BGE 向量嵌入", "BAAI/bge-small-zh-v1.5", "bge-small-zh-v1.5"),
        ("BGE Reranker", "BAAI/bge-reranker-base", "bge-reranker-base"),
    ]
    
    results = {}
    for name, model_id, folder in models:
        results[name] = download_model(name, model_id, str(save_dir / folder))
    
    # 测试 jieba
    print(f"\n{'='*50}")
    print("初始化 Jieba...")
    try:
        import jieba
        list(jieba.cut("测试"))
        print("✓ Jieba 就绪")
        results["Jieba"] = True
    except Exception as e:
        print(f"✗ Jieba 失败：{e}")
        results["Jieba"] = False
    
    # 总结
    print(f"\n{'='*50}")
    print("总结")
    print("=" * 50)
    
    all_ok = all(results.values())
    for name, ok in results.items():
        print(f"{'✓' if ok else '✗'} {name}")
    
    if all_ok:
        print(f"\n✓ 完成！模型位置：{save_dir.absolute()}")
        print("运行：python server.py")
        return 0
    else:
        print("\n✗ 部分失败，请检查网络")
        return 1


if __name__ == "__main__":
    sys.exit(main())
