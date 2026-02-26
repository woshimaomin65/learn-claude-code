---
name: code-comment
description: "Use this skill when you need to add detailed Chinese comments to a Python code file while preserving the original code structure. Never modify the original source code - only add comments."
license: Proprietary
---

# Code Comment Skill

## Quick Reference

| Task | Guide |
|------|-------|
| 读取源代码 | 使用 read_file 读取原始文件 |
| 分析代码结构 | 识别函数、类、模块边界 |
| 添加中文注释 | 在原位置插入注释，不改变代码结构 |
| 输出注释文件 | 保存到 data/ 目录 |

---

## 核心原则

> ⚠️ **黄金法则**: **永远不要修改源代码结构！** 只能在原代码的基础上添加注释。

### ✅ 正确做法 vs ❌ 错误做法

| 做法 | 描述 | 状态 |
|------|------|------|
| 在函数上方添加 docstring | 保留原函数签名和实现 | ✅ 正确 |
| 在类定义上方添加说明 | 保留原类结构 | ✅ 正确 |
| 在复杂逻辑旁添加行内注释 | 不改变代码逻辑 | ✅ 正确 |
| 拆分代码到多个文件再合并 | 改变了文件结构 | ❌ 错误 |
| 修改函数签名或参数 | 改变了 API | ❌ 错误 |
| 删除或移动原有代码 | 破坏了原结构 | ❌ 错误 |

---

## 工作流程

```
读取源代码 → 分析结构 → 原地添加注释 → 保存到 data/ 目录
```

---

## Step 0: 创建 data 临时文件夹（关键步骤）

> ⚠️ **重要**: 所有临时文件和输出文件都必须在 `data/` 目录下创建！

### 创建并清空临时文件夹

```python
import os
import shutil
from pathlib import Path

# 临时文件夹必须在 data/ 目录下
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

### 为什么必须在 data/ 目录下？

| 原因 | 说明 |
|------|------|
| 项目规范 | data/ 是专门用于存储生成文件的目录 |
| 避免污染 | 不会与源代码目录混合 |
| 便于清理 | 可以安全删除整个 data/ 目录 |
| Git 忽略 | data/ 通常在 .gitignore 中 |

---

## Step 1: 读取并分析源代码

### 读取完整文件内容

```python
from pathlib import Path

# 读取源代码
source_file = Path("s08_background_tasks.py")
with open(source_file, 'r', encoding='utf-8') as f:
    source_code = f.read()

print(f"读取完成，共 {len(source_code)} 字符，{len(source_code.splitlines())} 行")
```

### 分析代码结构

使用 Python 的 `ast` 模块分析代码结构：

```python
import ast

tree = ast.parse(source_code)

# 识别所有类和函数
for node in ast.walk(tree):
    if isinstance(node, ast.ClassDef):
        print(f"类：{node.name} (行 {node.lineno})")
    elif isinstance(node, ast.FunctionDef):
        print(f"函数：{node.name} (行 {node.lineno})")
```

---

## Step 2: 添加中文注释

### 注释类型和位置

#### 1. 文件头注释（在文件最开头）

```python
# ============================================================
# 文件名.py - 简短描述
# ============================================================
"""
模块文档字符串

功能概述:
- 功能点 1
- 功能点 2
"""
```

#### 2. 导入语句注释（在每个 import 旁）

```python
import asyncio           # 异步 I/O 操作支持
import json             # JSON 数据序列化/反序列化
from pathlib import Path       # 面向对象的路径操作
```

#### 3. 类注释（在 class 定义上方和内部）

```python
class BackgroundManager:
    """
    后台任务管理器
    
    功能概述:
    - 创建和管理后台任务
    - 追踪任务状态
    
    属性:
        tasks (dict): 任务字典
        next_id (int): 下一个任务 ID
    """
    
    def __init__(self):
        """初始化后台任务管理器"""
        self.tasks = {}      # 存储所有任务的字典
        self.next_id = 1     # 下一个任务的 ID
```

#### 4. 函数注释（在 def 定义上方）

```python
def create_task(self, command: str, timeout: int = 60) -> dict:
    """
    创建一个新的后台任务
    
    参数:
        command (str): 要执行的 shell 命令
        timeout (int): 任务超时时间（秒），默认 60 秒
        
    返回:
        dict: 包含任务 ID 和初始状态的字典
    
    示例:
        >>> manager.create_task("ls -la", timeout=30)
        {"task_id": 1, "status": "pending"}
    """
    # 函数实现...
```

### 注释添加方法

**关键：使用字符串替换，精确匹配原代码，然后添加注释**

```python
def add_comment_to_file(source_code: str, old_text: str, new_text: str) -> str:
    """
    在源代码中添加注释
    
    参数:
        source_code: 原始代码
        old_text: 要替换的代码段（通常是函数/类定义）
        new_text: 添加注释后的代码段
        
    返回:
        添加注释后的完整代码
    """
    if old_text not in source_code:
        raise ValueError("要替换的代码段未在源文件中找到")
    
    return source_code.replace(old_text, new_text, 1)
```

### 处理流程

1. **读取原始文件** - 保持原样，不修改
2. **逐个处理代码块** - 对每个类/函数添加注释
3. **使用 run_edit 或直接写入** - 将注释后的代码写入新文件
4. **不修改原文件** - 原文件始终保持不变

---

## Step 3: 输出到 data/ 目录

### 保存注释后的文件

```python
from pathlib import Path

# 输出文件名：在原文件名后添加 _annotated
output_file = Path("data") / "s08_background_tasks_annotated.py"

# 写入注释后的代码
with open(output_file, 'w', encoding='utf-8') as f:
    f.write(annotated_code)

print(f"注释完成 → {output_file}")
```

### 文件命名规范

| 原文件 | 输出文件 |
|--------|----------|
| s08_background_tasks.py | s08_background_tasks_annotated.py |
| agent.py | agent_annotated.py |
| tools.py | tools_annotated.py |

---

## Step 4: 验证和清理

### 语法验证

```python
import ast

try:
    with open(output_file, 'r', encoding='utf-8') as f:
        ast.parse(f.read())
    print("✓ 语法检查通过")
except SyntaxError as e:
    print(f"✗ 语法错误：{e}")
```

### 清理临时文件夹

```python
import shutil

# 确认输出文件正确后再删除临时文件夹
if TEMP_DIR.exists():
    shutil.rmtree(TEMP_DIR)
    print("✓ 临时文件夹已清理")
```

---

## 完整示例

### 示例：为背景任务文件添加注释

```python
#!/usr/bin/env python3
"""
为背景任务文件添加中文注释的完整示例
"""

import ast
import shutil
from pathlib import Path

# 配置
INPUT_FILE = Path("s08_background_tasks.py")
OUTPUT_FILE = Path("data") / "s08_background_tasks_annotated.py"
TEMP_DIR = Path("data") / "temp_comment_modules"

def add_comments():
    """主函数：添加注释"""
    
    # Step 0: 创建临时目录
    if TEMP_DIR.exists():
        shutil.rmtree(TEMP_DIR)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    
    # Step 1: 读取源代码
    print(f"读取 {INPUT_FILE}...")
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        source = f.read()
    
    # Step 2: 分析结构
    print("分析代码结构...")
    tree = ast.parse(source)
    
    # Step 3: 添加注释（示例：逐行处理）
    print("添加中文注释...")
    annotated_lines = []
    
    for line in source.splitlines():
        annotated_lines.append(line)
        
        # 在 import 语句后添加注释
        if line.startswith('import '):
            module = line.split()[1].split('.')[0]
            annotated_lines.append(f"  # {module} 模块")
    
    annotated_code = '\n'.join(annotated_lines)
    
    # Step 4: 输出
    OUTPUT_FILE.parent.mkdir(exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(annotated_code)
    
    print(f"✓ 注释完成 → {OUTPUT_FILE}")
    
    # Step 5: 验证
    ast.parse(annotated_code)
    print("✓ 语法检查通过")
    
    # Step 6: 清理
    shutil.rmtree(TEMP_DIR)
    print("✓ 临时文件夹已清理")

if __name__ == "__main__":
    add_comments()
```

---

## 注释风格指南

### 1. 文件头注释

```python
# ============================================================
# 文件名.py - 简短描述
# ============================================================
"""
模块文档字符串

功能概述:
- 功能点 1
- 功能点 2

使用场景:
- 在 sXX_module_name.py 中学习
"""
```

### 2. 导入注释

```python
import asyncio           # 异步 I/O 操作
import json             # JSON 序列化
```

### 3. 常量注释

```python
DATA_DIR = Path("data")     # 数据目录
TIMEOUT = 60                # 默认超时时间（秒）
```

### 4. 类注释

```python
class ClassName:
    """
    类名
    
    功能概述:
    - 功能 1
    - 功能 2
    
    属性:
        attr1 (type): 说明
    """
```

### 5. 函数注释

```python
def func_name(param: type) -> return_type:
    """
    函数功能
    
    参数:
        param (type): 参数说明
        
    返回:
        return_type: 返回值说明
        
    示例:
        >>> result = func_name(value)
    """
```

### 6. 行内注释

```python
self.tasks = {}      # 存储任务字典
self.next_id = 1     # 任务 ID 从 1 开始
```

---

## 常见问题

### Q: 如何处理大型文件？

A: 
1. 使用 `ast` 模块分析结构
2. 分段处理，每次处理一个类或函数
3. 使用 `background_run` 并行处理多个模块

### Q: 如何确保不破坏原代码？

A:
1. 永远不要修改原始文件
2. 输出到新文件（`_annotated` 后缀）
3. 使用 `ast.parse()` 验证语法
4. 保留所有原有代码，只添加注释

### Q: 临时文件夹应该放在哪里？

A:
- **必须**在 `data/` 目录下
- 例如：`data/temp_comment_modules/`
- 不要在源代码目录创建临时文件

---

## 依赖工具

本技能使用 Python 标准库：

- `ast` - 代码结构分析
- `os` / `shutil` - 文件操作
- `pathlib` - 路径处理

无需额外安装依赖包。
