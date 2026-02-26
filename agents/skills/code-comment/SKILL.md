---
name: code-comment
description: "Use this skill when you need to add detailed Chinese comments to a Python code file while preserving the original code structure. Never modify the original source code - only add comments."
license: Proprietary
---

# Code Comment Skill

## Quick Reference

| Task | Guide |
|------|-------|
| 创建临时文件夹 | `data/temp_comment_modules/` |
| 拆分代码片段 | 按功能/语法拆分到临时文件夹 |
| 添加中文注释 | 对每个片段独立添加注释 |
| 合并代码片段 | 保持原缩进，合并为完整文件 |
| 输出注释文件 | 保存到 `data/` 目录 |

---

## 核心原则

> ⚠️ **黄金法则**: **永远不要修改源代码结构和逻辑！** 只能在原代码的基础上添加注释。

### ✅ 正确做法 vs ❌ 错误做法

| 做法 | 描述 | 状态 |
|------|------|------|
| 在函数上方添加 docstring | 保留原函数签名和实现 | ✅ 正确 |
| 在类定义上方添加说明 | 保留原类结构 | ✅ 正确 |
| 在复杂逻辑旁添加行内注释 | 不改变代码逻辑 | ✅ 正确 |
| 拆分代码到临时文件再合并 | 临时处理，最终保持原结构 | ✅ 正确 |
| 修改函数签名或参数 | 改变了 API | ❌ 错误 |
| 删除或移动原有代码 | 破坏了原结构 | ❌ 错误 |
| 改变原始缩进 | 破坏了代码格式 | ❌ 错误 |

---

## 工作流程概览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Code Comment 工作流程                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. 创建临时文件夹                                                       │
│     data/temp_comment_modules/                                          │
│           ↓                                                             │
│  2. 读取源代码                                                           │
│     read_file(source.py)                                                │
│           ↓                                                             │
│  3. 拆分代码片段                                                         │
│     按功能/语法拆分 → 保存到临时文件夹                                      │
│           ↓                                                             │
│  4. 添加中文注释                                                         │
│     对每个片段独立添加注释                                                │
│           ↓                                                             │
│  5. 合并代码片段                                                         │
│     保持原缩进 → 合并为完整文件                                           │
│           ↓                                                             │
│  6. 输出注释文件                                                         │
│     data/source_annotated.py                                           │
│           ↓                                                             │
│  7. 清理临时文件夹                                                        │
│     删除 data/temp_comment_modules/                                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Step 1: 创建临时文件夹

> ⚠️ **重要**: 所有临时文件必须在 `data/temp_comment_modules/` 目录下创建！

### 创建并初始化临时文件夹

```python
import os
import shutil
from pathlib import Path

# 临时文件夹路径（必须在 data/ 目录下）
TEMP_DIR = Path("data") / "temp_comment_modules"
OUTPUT_DIR = Path("data")

# 如果临时文件夹已存在，先彻底删除（防止旧文件残留）
if TEMP_DIR.exists():
    shutil.rmtree(TEMP_DIR)
    print(f"已删除旧的临时文件夹：{TEMP_DIR}")

# 创建新的临时文件夹
TEMP_DIR.mkdir(parents=True, exist_ok=True)
print(f"已创建临时文件夹：{TEMP_DIR}")

# 确保输出目录存在
OUTPUT_DIR.mkdir(exist_ok=True)
```

### 临时文件夹结构

```
data/
├── temp_comment_modules/          # 临时文件夹
│   ├── 00_header.txt             # 文件头信息（行号范围、元数据）
│   ├── 01_imports.txt            # 导入语句片段
│   ├── 02_constants.txt          # 常量定义片段
│   ├── 03_class_XXX.txt          # 类定义片段
│   ├── 04_function_YYY.txt      # 函数定义片段
│   ├── 05_main.txt               # 主程序片段
│   └── manifest.json             # 片段清单（记录合并顺序和缩进）
└── output_annotated.py           # 最终输出文件
```

---

## Step 2: 读取并分析源代码

### 读取完整文件内容

```python
from pathlib import Path

# 读取源代码
source_file = Path("source.py")
with open(source_file, 'r', encoding='utf-8') as f:
    source_code = f.read()

# 保存原始行数据（保留缩进信息）
original_lines = source_code.splitlines(keepends=True)
print(f"读取完成，共 {len(original_lines)} 行")
```

### 分析代码结构

使用 Python 的 `ast` 模块分析代码结构：

```python
import ast

tree = ast.parse(source_code)

# 收集所有顶级节点及其行号范围
top_level_nodes = []

for node in tree.body:
    node_info = {
        'type': node.__class__.__name__,
        'lineno_start': node.lineno,
        'lineno_end': getattr(node, 'end_lineno', node.lineno),
        'name': getattr(node, 'name', None),
        'node': node
    }
    top_level_nodes.append(node_info)
    print(f"{node_info['type']}: {node_info.get('name', '')} (行 {node_info['lineno_start']}-{node_info['lineno_end']})")
```

---

## Step 3: 拆分代码片段

### 按功能/语法拆分代码

将代码拆分为多个独立的片段，保存到临时文件夹：

```python
import json
from pathlib import Path

def split_code_into_fragments(source_lines: list, tree: ast.AST, temp_dir: Path) -> list:
    """
    将源代码按功能和语法拆分为独立片段
    
    参数:
        source_lines: 原始代码行列表（保留换行符）
        tree: AST 语法树
        temp_dir: 临时文件夹路径
        
    返回:
        manifest: 片段清单列表
    """
    manifest = []
    fragment_id = 0
    
    # 记录已处理的行号
    processed_lines = set()
    
    # 用于存储每个片段的边界信息
    boundaries = []
    
    # 收集所有 AST 节点的边界
    for node in tree.body:
        start_line = node.lineno - 1  # 转为 0-based 索引
        end_line = node.end_lineno    # end_lineno 是 inclusive 的
        
        node_type = node.__class__.__name__
        node_name = getattr(node, 'name', None) or getattr(node, 'module', None)
        
        boundaries.append({
            'start': start_line,
            'end': end_line,
            'type': node_type,
            'name': node_name
        })
    
    # 按起始行号排序
    boundaries.sort(key=lambda x: x['start'])
    
    # 处理代码片段之间的空白行和注释
    prev_end = 0
    
    for boundary in boundaries:
        start = boundary['start']
        end = boundary['end']
        
        # 如果前面有未处理的行（空白、注释等），先保存为一个片段
        if start > prev_end:
            fragment_lines = source_lines[prev_end:start]
            if any(line.strip() for line in fragment_lines):  # 有非空内容
                fragment_path = temp_dir / f"{fragment_id:02d}_header.txt"
                fragment_content = ''.join(fragment_lines)
                
                # 计算基础缩进（通常是 0）
                base_indent = 0
                
                fragment_path.write_text(fragment_content, encoding='utf-8')
                
                manifest.append({
                    'id': fragment_id,
                    'file': fragment_path.name,
                    'type': 'header',
                    'name': None,
                    'start_line': prev_end + 1,  # 1-based
                    'end_line': start,
                    'base_indent': base_indent,
                    'annotated': False
                })
                fragment_id += 1
        
        # 提取当前节点的代码片段
        fragment_lines = source_lines[start:end]
        fragment_content = ''.join(fragment_lines)
        
        # 计算基础缩进（顶级代码块通常为 0）
        base_indent = 0
        for line in fragment_lines:
            if line.strip():  # 找到第一个非空行
                base_indent = len(line) - len(line.lstrip())
                break
        
        # 确定片段类型名称
        type_name = boundary['type'].lower()
        node_name = boundary['name']
        
        # 生成片段文件名
        if node_name:
            safe_name = ''.join(c if c.isalnum() or c == '_' else '_' for c in str(node_name))
            fragment_filename = f"{fragment_id:02d}_{type_name}_{safe_name}.txt"
        else:
            fragment_filename = f"{fragment_id:02d}_{type_name}.txt"
        
        fragment_path = temp_dir / fragment_filename
        fragment_path.write_text(fragment_content, encoding='utf-8')
        
        manifest.append({
            'id': fragment_id,
            'file': fragment_filename,
            'type': boundary['type'],
            'name': node_name,
            'start_line': start + 1,  # 1-based
            'end_line': end,
            'base_indent': base_indent,
            'annotated': False
        })
        fragment_id += 1
        
        prev_end = end
    
    # 处理最后剩余的代码
    if prev_end < len(source_lines):
        fragment_lines = source_lines[prev_end:]
        if any(line.strip() for line in fragment_lines):
            fragment_path = temp_dir / f"{fragment_id:02d}_footer.txt"
            fragment_content = ''.join(fragment_lines)
            
            base_indent = 0
            for line in fragment_lines:
                if line.strip():
                    base_indent = len(line) - len(line.lstrip())
                    break
            
            fragment_path.write_text(fragment_content, encoding='utf-8')
            
            manifest.append({
                'id': fragment_id,
                'file': fragment_path.name,
                'type': 'footer',
                'name': None,
                'start_line': prev_end + 1,
                'end_line': len(source_lines),
                'base_indent': base_indent,
                'annotated': False
            })
    
    return manifest

# 执行拆分
manifest = split_code_into_fragments(original_lines, tree, TEMP_DIR)

# 保存清单文件
manifest_path = TEMP_DIR / "manifest.json"
with open(manifest_path, 'w', encoding='utf-8') as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)

print(f"拆分完成，共 {len(manifest)} 个片段")
print(f"清单文件: {manifest_path}")
```

---

## Step 4: 添加中文注释

### 对每个片段独立添加注释

```python
def add_comment_to_fragment(fragment_path: Path, fragment_type: str, fragment_name: str) -> str:
    """
    为单个代码片段添加中文注释
    
    参数:
        fragment_path: 片段文件路径
        fragment_type: 片段类型（ClassDef, FunctionDef 等）
        fragment_name: 片段名称（类名、函数名等）
        
    返回:
        添加注释后的代码内容
    """
    content = fragment_path.read_text(encoding='utf-8')
    
    if not content.strip():
        return content
    
    # 根据片段类型添加不同的注释
    annotated = []
    lines = content.splitlines(keepends=True)
    
    for i, line in enumerate(lines):
        # 保留原始行
        annotated.append(line)
        
        # 根据内容添加适当的注释
        stripped = line.strip()
        
        # 为 import 语句添加注释
        if stripped.startswith('import ') or stripped.startswith('from '):
            # 提取模块名
            if 'import' in stripped:
                parts = stripped.split('import')
                module = parts[0].replace('from', '').strip()
                if module:
                    # 在同一行添加注释（如果行尾没有注释）
                    if '#' not in line:
                        annotated[-1] = line.rstrip() + f"  # 导入 {module} 模块\n"
        
        # 为类定义添加 docstring
        elif stripped.startswith('class ') and ':' in stripped and i + 1 < len(lines):
            next_line = lines[i + 1] if i + 1 < len(lines) else ''
            # 如果类后面没有 docstring，添加一个
            if not next_line.strip().startswith('"""') and not next_line.strip().startswith("'''"):
                class_indent = len(line) - len(line.lstrip())
                indent = ' ' * (class_indent + 4)
                class_name = stripped.split('class ')[1].split('(')[0].split(':')[0]
                docstring = f'{indent}"""{class_name} 类 - 功能描述"""\n'
                annotated.append(docstring)
        
        # 为函数定义添加 docstring
        elif stripped.startswith('def ') and ':' in stripped and i + 1 < len(lines):
            next_line = lines[i + 1] if i + 1 < len(lines) else ''
            # 如果函数后面没有 docstring，添加一个
            if not next_line.strip().startswith('"""') and not next_line.strip().startswith("'''"):
                func_indent = len(line) - len(line.lstrip())
                indent = ' ' * (func_indent + 4)
                func_name = stripped.split('def ')[1].split('(')[0]
                docstring = f'{indent}"""{func_name} 函数 - 功能描述"""\n'
                annotated.append(docstring)
        
        # 为变量赋值添加注释
        elif '=' in stripped and not stripped.startswith('#') and '#' not in line:
            # 检查是否是常量（全大写）或普通变量
            var_part = stripped.split('=')[0].strip()
            if var_part.isupper():
                annotated[-1] = line.rstrip() + f"  # 常量\n"
    
    return ''.join(annotated)

# 处理所有片段
for item in manifest:
    fragment_path = TEMP_DIR / item['file']
    if fragment_path.exists():
        annotated_content = add_comment_to_fragment(
            fragment_path,
            item['type'],
            item.get('name')
        )
        
        # 更新片段文件（保存注释后的内容）
        fragment_path.write_text(annotated_content, encoding='utf-8')
        item['annotated'] = True
        print(f"已添加注释: {item['file']}")

# 更新清单文件
manifest_path = TEMP_DIR / "manifest.json"
with open(manifest_path, 'w', encoding='utf-8') as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)
```

### 注释风格指南

```python
# ============================================================
# 1. 文件头注释（在文件最开头）
# ============================================================
"""
模块名 - 简短描述

功能概述:
- 功能点 1
- 功能点 2

使用场景:
- 在 sXX_module_name.py 中学习
"""

# ============================================================
# 2. 导入注释
# ============================================================
import asyncio           # 异步 I/O 操作支持
import json             # JSON 数据序列化/反序列化
from pathlib import Path       # 面向对象的路径操作

# ============================================================
# 3. 常量注释
# ============================================================
DATA_DIR = Path("data")     # 数据存储目录
TIMEOUT = 60                # 默认超时时间（秒）
MAX_RETRIES = 3             # 最大重试次数

# ============================================================
# 4. 类注释
# ============================================================
class ClassName:
    """
    类名 - 简短描述
    
    功能概述:
    - 功能 1: 描述
    - 功能 2: 描述
    
    属性:
        attr1 (type): 属性说明
        attr2 (type): 属性说明
    
    使用示例:
        >>> obj = ClassName()
        >>> obj.method()
    """
    
    def __init__(self):
        """初始化方法"""
        self.attr1 = None      # 属性1说明
        self.attr2 = []        # 属性2说明

# ============================================================
# 5. 函数注释
# ============================================================
def func_name(param1: type, param2: type) -> return_type:
    """
    函数功能简述
    
    详细描述（可选）
    
    参数:
        param1 (type): 参数1说明
        param2 (type): 参数2说明
        
    返回:
        return_type: 返回值说明
        
    异常:
        ExceptionType: 异常说明
        
    示例:
        >>> result = func_name(value1, value2)
    """
    pass

# ============================================================
# 6. 行内注释
# ============================================================
result = process(data)      # 处理数据
count = len(items)          # 获取项目数量
is_valid = check(value)     # 验证值是否有效
```

---

## Step 5: 合并代码片段

### 按原始顺序和缩进合并片段

```python
def merge_fragments(manifest: list, temp_dir: Path) -> str:
    """
    按原始顺序合并所有代码片段
    
    参数:
        manifest: 片段清单
        temp_dir: 临时文件夹路径
        
    返回:
        合并后的完整代码
    """
    # 按 ID 排序确保正确顺序
    sorted_manifest = sorted(manifest, key=lambda x: x['id'])
    
    merged_lines = []
    
    for item in sorted_manifest:
        fragment_path = temp_dir / item['file']
        if not fragment_path.exists():
            print(f"警告: 片段文件不存在 {item['file']}")
            continue
        
        content = fragment_path.read_text(encoding='utf-8')
        lines = content.splitlines(keepends=True)
        
        # 保留原始缩进，直接添加行
        for line in lines:
            merged_lines.append(line)
    
    return ''.join(merged_lines)

# 执行合并
annotated_code = merge_fragments(manifest, TEMP_DIR)

# 验证合并后的代码语法
try:
    ast.parse(annotated_code)
    print("✓ 合并后代码语法检查通过")
except SyntaxError as e:
    print(f"✗ 语法错误: {e}")
    raise
```

---

## Step 6: 输出注释文件

### 保存最终文件到 data/ 目录

```python
from pathlib import Path

# 生成输出文件名
source_name = source_file.stem  # 不含扩展名的文件名
output_file = Path("data") / f"{source_name}_annotated.py"

# 写入注释后的代码
with open(output_file, 'w', encoding='utf-8') as f:
    f.write(annotated_code)

print(f"✓ 注释完成 → {output_file}")
```

### 文件命名规范

| 原文件 | 输出文件 |
|--------|----------|
| s08_background_tasks.py | s08_background_tasks_annotated.py |
| agent.py | agent_annotated.py |
| tools.py | tools_annotated.py |

---

## Step 7: 清理临时文件夹

### 删除临时文件

```python
import shutil

# 确认输出文件正确后删除临时文件夹
if TEMP_DIR.exists():
    shutil.rmtree(TEMP_DIR)
    print(f"✓ 临时文件夹已清理: {TEMP_DIR}")
```

---

## 完整工作流程示例

```python
#!/usr/bin/env python3
"""
代码注释添加工具 - 完整工作流程示例

使用方法:
    python add_comments.py source.py
"""

import ast
import json
import shutil
from pathlib import Path
from typing import List, Dict

# 配置路径
DATA_DIR = Path("data")
TEMP_DIR = DATA_DIR / "temp_comment_modules"


def setup_temp_dir():
    """创建或重置临时文件夹"""
    if TEMP_DIR.exists():
        shutil.rmtree(TEMP_DIR)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    print(f"✓ 临时文件夹已创建: {TEMP_DIR}")


def read_source(file_path: Path) -> tuple:
    """读取源代码"""
    source_code = file_path.read_text(encoding='utf-8')
    lines = source_code.splitlines(keepends=True)
    tree = ast.parse(source_code)
    print(f"✓ 已读取 {len(lines)} 行代码")
    return source_code, lines, tree


def split_into_fragments(lines: list, tree: ast.AST) -> list:
    """拆分代码为片段"""
    manifest = []
    fragment_id = 0
    boundaries = []
    
    # 收集节点边界
    for node in tree.body:
        boundaries.append({
            'start': node.lineno - 1,
            'end': node.end_lineno,
            'type': node.__class__.__name__,
            'name': getattr(node, 'name', None) or getattr(node, 'module', None)
        })
    
    boundaries.sort(key=lambda x: x['start'])
    
    prev_end = 0
    for boundary in boundaries:
        start = boundary['start']
        end = boundary['end']
        
        # 保存前置代码
        if start > prev_end:
            self._save_fragment(
                fragment_id, 'header', None,
                lines[prev_end:start], manifest
            )
            fragment_id += 1
        
        # 保存主节点
        self._save_fragment(
            fragment_id, boundary['type'], boundary['name'],
            lines[start:end], manifest
        )
        fragment_id += 1
        prev_end = end
    
    # 保存尾部代码
    if prev_end < len(lines):
        self._save_fragment(
            fragment_id, 'footer', None,
            lines[prev_end:], manifest
        )
    
    # 保存清单
    manifest_path = TEMP_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f"✓ 已拆分为 {len(manifest)} 个片段")
    return manifest


def _save_fragment(fid: int, ftype: str, fname: str, 
                   content_lines: list, manifest: list):
    """保存单个片段"""
    content = ''.join(content_lines)
    if not content.strip():
        return
    
    safe_name = ''.join(c if c.isalnum() or c == '_' else '_' 
                       for c in (str(fname) or ''))
    filename = f"{fid:02d}_{ftype.lower()}"
    if safe_name:
        filename += f"_{safe_name}"
    filename += ".txt"
    
    fragment_path = TEMP_DIR / filename
    fragment_path.write_text(content, encoding='utf-8')
    
    # 计算基础缩进
    base_indent = 0
    for line in content_lines:
        if line.strip():
            base_indent = len(line) - len(line.lstrip())
            break
    
    manifest.append({
        'id': fid,
        'file': filename,
        'type': ftype,
        'name': fname,
        'base_indent': base_indent,
        'annotated': False
    })


def add_comments_to_fragments(manifest: list):
    """为所有片段添加注释"""
    for item in manifest:
        fragment_path = TEMP_DIR / item['file']
        if not fragment_path.exists():
            continue
        
        content = fragment_path.read_text(encoding='utf-8')
        annotated = _add_comments(content)
        
        fragment_path.write_text(annotated, encoding='utf-8')
        item['annotated'] = True
    
    # 更新清单
    manifest_path = TEMP_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f"✓ 已为 {sum(1 for m in manifest if m['annotated'])} 个片段添加注释")


def _add_comments(content: str) -> str:
    """添加中文注释"""
    lines = content.splitlines(keepends=True)
    result = []
    
    for i, line in enumerate(lines):
        result.append(line)
        stripped = line.strip()
        
        # 添加注释逻辑...
        if stripped.startswith('import ') or stripped.startswith('from '):
            if '#' not in line:
                result[-1] = line.rstrip() + "  # 导入模块\n"
        elif stripped.startswith('class ') and ':' in stripped:
            # 添加类 docstring
            pass
        elif stripped.startswith('def ') and ':' in stripped:
            # 添加函数 docstring
            pass
    
    return ''.join(result)


def merge_fragments(manifest: list) -> str:
    """合并所有片段"""
    sorted_manifest = sorted(manifest, key=lambda x: x['id'])
    merged = []
    
    for item in sorted_manifest:
        fragment_path = TEMP_DIR / item['file']
        if fragment_path.exists():
            merged.append(fragment_path.read_text(encoding='utf-8'))
    
    return ''.join(merged)


def cleanup():
    """清理临时文件夹"""
    if TEMP_DIR.exists():
        shutil.rmtree(TEMP_DIR)
    print("✓ 临时文件夹已清理")


def main(source_file: str):
    """主函数"""
    source_path = Path(source_file)
    
    # 1. 创建临时文件夹
    setup_temp_dir()
    
    # 2. 读取源代码
    source_code, lines, tree = read_source(source_path)
    
    # 3. 拆分为片段
    manifest = split_into_fragments(lines, tree)
    
    # 4. 添加注释
    add_comments_to_fragments(manifest)
    
    # 5. 合并片段
    annotated_code = merge_fragments(manifest)
    
    # 6. 验证语法
    ast.parse(annotated_code)
    print("✓ 语法检查通过")
    
    # 7. 输出文件
    output_path = DATA_DIR / f"{source_path.stem}_annotated.py"
    output_path.write_text(annotated_code, encoding='utf-8')
    print(f"✓ 输出文件: {output_path}")
    
    # 8. 清理临时文件夹
    cleanup()
    
    return output_path


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("用法: python add_comments.py <source_file>")
        sys.exit(1)
    main(sys.argv[1])
```

---

## 关键注意事项

### 1. 保持原始缩进

```python
# ❌ 错误：改变缩进
original = "    def hello():\n        pass"
annotated = "def hello():\n    # 这是函数\n    pass"  # 缩进丢失！

# ✅ 正确：保持缩进
original = "    def hello():\n        pass"
annotated = "    def hello():\n        \"\"\"函数说明\"\"\"\n        pass"  # 缩进保持
```

### 2. 不修改代码结构

```python
# ❌ 错误：拆分后改变了结构
# 原始代码
for i in range(10):
    print(i)

# 错误的注释后
# 循环
for i in range(10):
    # 打印
    print(i)  # 缩进可能出错

# ✅ 正确：保持原有结构
for i in range(10):
    print(i)  # 打印当前数字
```

### 3. 片段合并顺序

```python
# 片段必须按 ID 顺序合并
manifest = [
    {'id': 0, 'file': '00_header.txt', ...},
    {'id': 1, 'file': '01_imports.txt', ...},
    {'id': 2, 'file': '02_class_MyClass.txt', ...},
    ...
]

# 按顺序合并
sorted_manifest = sorted(manifest, key=lambda x: x['id'])
```

---

## 常见问题

### Q: 如何处理嵌套的类和函数？

A: 对于嵌套结构，整个外层类/函数作为一个片段处理，内部结构在添加注释时处理：

```python
class OuterClass:           # 片段边界
    """外部类说明"""
    
    def inner_method(self): # 在片段内部处理
        """内部方法说明"""
        pass
```

### Q: 如何处理多行字符串中的特殊内容？

A: 使用 AST 分析时，多行字符串会被正确识别，不会破坏结构。

### Q: 如何确保合并后与原文件一致？

A: 
1. 保存原始行数据（包含换行符）
2. 按原始顺序合并片段
3. 使用 `ast.parse()` 验证语法
4. 对比原文件和注释文件的行数

---

## 依赖工具

本技能使用 Python 标准库：

- `ast` - 代码结构分析
- `json` - 清单文件处理
- `os` / `shutil` - 文件操作
- `pathlib` - 路径处理

无需额外安装依赖包。