#!/usr/bin/env python3
"""
检查模型是否存在，并提供下载指导
"""

import sys
from pathlib import Path

# 模型配置
MODELS = {
    "bge-small-zh-v1.5": {
        "path": "./data/models/bge-small-zh-v1.5",
        "description": "BGE 中文向量嵌入模型",
        "required_files": ["config.json"],
        "download_url": "https://hf-mirror.com/BAAI/bge-small-zh-v1.5"
    },
    "bge-reranker-base": {
        "path": "./data/models/bge-reranker-base",
        "description": "BGE 重排序模型",
        "required_files": ["config.json"],
        "download_url": "https://hf-mirror.com/BAAI/bge-reranker-base"
    }
}


def check_model(name: str, info: dict) -> bool:
    """检查模型是否存在且完整"""
    path = Path(info["path"])
    
    if not path.exists():
        return False
    
    # 检查必要文件
    for file in info["required_files"]:
        if not (path / file).exists():
            return False
    
    return True


def print_download_command(name: str, info: dict):
    """打印下载命令"""
    print(f"\n  下载命令:")
    print(f"  # 方式 1: 使用 git clone")
    print(f"  git clone {info['download_url']} {info['path']}")
    print()
    print(f"  # 方式 2: 使用 Python")
    print(f"  export HF_ENDPOINT=https://hf-mirror.com")
    print(f"  python -c \"from huggingface_hub import snapshot_download; \"")
    print(f"           \"snapshot_download('{name}', local_dir='{info['path']}')\"")


def main():
    print("=" * 60)
    print("Retrieve MCP 模型检查")
    print("=" * 60)
    
    all_exist = True
    missing_models = []
    
    for name, info in MODELS.items():
        exists = check_model(name, info)
        status = "✓ 存在" if exists else "✗ 缺失"
        print(f"\n{name}:")
        print(f"  状态：{status}")
        print(f"  路径：{info['path']}")
        print(f"  说明：{info['description']}")
        
        if not exists:
            all_exist = False
            missing_models.append(name)
            print_download_command(name, info)
    
    print("\n" + "=" * 60)
    
    if all_exist:
        print("✓ 所有模型都已就绪，可以启动 MCP 服务器！")
        print()
        print("启动命令:")
        print("  python server.py")
        return 0
    else:
        print(f"✗ 缺少 {len(missing_models)} 个模型: {', '.join(missing_models)}")
        print()
        print("请先下载缺失的模型，参考 QUICKSTART.md")
        print()
        print("快速下载（使用 HuggingFace 镜像）:")
        print("  export HF_ENDPOINT=https://hf-mirror.com")
        print("  python download_models.py --save-dir ./data/models")
        return 1


if __name__ == "__main__":
    sys.exit(main())
