---
name: code-comment
description: "Use this skill when you need to split a Python code file into modular components, add Chinese comments to each module, and merge them back into a single annotated file. This skill automates the process of code documentation through modular splitting and annotation."
license: Proprietary
---

# Code Comment Skill

## Quick Reference

| Task | Guide |
|------|-------|
| 分析代码文件结构 | 识别代码中的功能模块和 section |
| 拆分代码为模块 | 使用 write_file 创建拆分后的模块文件 |
| 添加中文注释 | 在每个模块文件中添加详细的中文注释 |
| 合并模块 | 使用 Python 脚本合并所有模块文件 |
| 清理临时文件 | 删除临时拆分文件夹 |

---

## 工作流程概述

本技能用于将大型 Python 代码文件拆分为多个独立的功能模块，为每个模块添加详细的中文注释，然后再合并成最终的带注释版本。

```
原始文件 → 拆分模块 → 添加注释 → 合并文件 → 清理临时文件夹
```

---

## Step 1: 分析代码文件结构

### 识别功能模块

在拆分代码之前，首先需要分析原始文件的结构：

1. **读取完整文件内容**: 使用 read_file 读取源代码
2. **识别 section 标记**: 查找类似 `# === SECTION: xxx ===` 的注释
3. **识别类和函数**: 记录所有主要的类、函数定义
4. **识别依赖关系**: 了解模块之间的导入依赖

### 常见的代码模块类型

| 模块类型 | 描述 |
|----------|------|
| 导入和常量 | import 语句、全局配置常量 |
| 基础工具 | 工具函数 (run_bash, run_read 等) |
| 管理器类 | 各种 Manager 类 |
| 业务逻辑 | 核心功能函数 |
| 配置 | 系统配置、全局实例 |
| 主循环 | 程序的 main loop |
| REPL | 交互式界面 |

---

## Step 2: 拆分代码为模块

### 创建临时文件夹

```python
import os
os.makedirs("temp_split_modules", exist_ok=True)
```

### 拆分策略

1. **每个功能模块独立一个文件**
2. **使用数字前缀排序**: `01_xxx.py`, `02_xxx.py`, ...
3. **模块命名**: 使用描述性名称，如 `02_base_tools.py`

### 示例模块结构

```
temp_split_modules/
├── 01_imports_constants.py    # 导入和常量
├── 02_base_tools.py           # 基础工具函数
├── 03_todo_manager.py         # 待办事项管理
├── ...
└── 18_repl.py                 # REPL 界面
```

---

## Step 3: 添加中文注释

### 注释内容要求

每个模块文件应包含以下中文注释：

1. **模块标题注释**
```python
# ============================================================
# 模块 N: 模块名称
# ============================================================
```

2. **模块功能描述**
```python
"""
本模块包含:
- 功能1: 描述
- 功能2: 描述
- 使用场景: 在 xx 中学习
"""
```

3. **函数/类注释**
```python
def function_name(param: type) -> return_type:
    """
    函数功能描述
    
    参数:
        param - 参数说明
    返回: 返回值说明
    
    示例:
        >>> result = function_name(value)
    """
```

### 注释风格指南

- 使用中文标点符号 (，。：；？！"")
- 保持注释简洁但信息完整
- 每个主要函数/类都需要 docstring
- 复杂逻辑需要行内注释说明

---

## Step 4: 合并模块文件

### 使用 Python 脚本合并

```python
import os

# 获取排序后的文件列表
files = sorted(os.listdir('temp_split_modules'))

with open('output_file.py', 'w') as out:
    for f in files:
        if f.endswith('.py'):
            with open(f'temp_split_modules/{f}') as inp:
                out.write(inp.read())
                out.write('\n\n')  # 模块之间添加空行

print('合并完成')
```

### 合并后检查

```bash
# 语法检查
python3 -m py_compile output_file.py

# 行数统计
wc -l output_file.py
```

---

## Step 5: 清理临时文件夹

### 安全删除

```python
import shutil

# 确认文件已正确合并后再删除
shutil.rmtree('temp_split_modules')
print('临时文件夹已删除')
```

### 注意事项

- **先验证再删除**: 确保合并后的文件正确后再删除临时文件夹
- **保留原始文件**: 保留原始代码文件以供参考

---

## 完整示例流程

### 1. 分析原始文件

假设有 `s_full.py` 文件，包含以下 section：
- base_tools
- todos (s03)
- subagent (s04)
- skills (s05)
- compression (s06)
- file_tasks (s07)
- background (s08)
- messaging (s09)
- shutdown + plan tracking (s10)
- team (s09/s11)
- global_instances
- system_prompt
- shutdown_protocol (s10)
- plan_approval (s10)
- tool_dispatch (s02)
- agent_loop
- repl

### 2. 创建模块文件

为每个 section 创建独立的 `.py` 文件，添加详细中文注释。

### 3. 合并并验证

```python
# 合并所有模块
python3 merge_modules.py

# 验证语法
python3 -m py_compile s_full_comment.py

# 清理
shutil.rmtree('temp_split_modules')
```

### 4. 输出位置

最终带注释的文件存放在 `data/` 目录下，命名为 `s_full_comment.py`。

---

## 常见问题

### Q: 如何确定模块的划分边界？

A: 查找代码中的 `# === SECTION: xxx ===` 注释，这些通常是模块的自然边界。

### Q: 模块之间有依赖怎么办？

A: 
1. 确保被依赖的模块编号在前
2. 或者在模块内添加必要的 import 说明

### Q: 注释内容太长怎么办？

A: 
1. 使用多级标题组织结构
2. 用表格呈现并列信息
3. 将详细文档放在外部文件中引用

---

## 依赖工具

本技能主要使用 Python 标准库：

- `os` - 文件和目录操作
- `shutil` - 高级文件操作
- `pathlib` - 路径处理

无需额外安装依赖包。