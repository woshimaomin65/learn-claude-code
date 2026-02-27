---
name: task-decomposer
description: "Use this skill when you need to break down a user's complex task into a structured todo list, identify relevant skills, and suggest parallel execution or subagent strategies. This skill helps agents efficiently plan and execute multi-step tasks. ALWAYS create a task folder in data/ directory to save final results after completing the user's request."
license: Proprietary
---

# Task Decomposer Skill

## Quick Reference

| Task | Guide |
|------|-------|
| 分析用户任务 | 理解任务目标、范围和约束 |
| 识别相关技能 | 从18个可用技能中匹配相关技能 |
| 任务拆解 | 将复杂任务分解为可执行的子任务 |
| 并行化建议 | 使用 background_run 并行执行 |
| Subagent委托 | 使用 task 或 spawn_teammate 委托任务 |
| Task系统 | 使用 task_create/task_update 管理持久化任务 |
| 生成TodoList | 使用 TodoWrite 创建结构化任务列表 |

---

## 核心原则

> ⚠️ **关键**: 任务拆解的目标是**最小化串行步骤，最大化并行/委托机会**。

### 任务拆解黄金法则

| 原则 | 描述 |
|------|------|
| 独立性 | 每个子任务应尽可能独立，不依赖其他子任务的结果 |
| 可并行性 | 优先使用 background_run 并行执行独立任务 |
| 可委托性 | 使用 task (一次性) 或 spawn_teammate (持久化) 委托 |
| 技能匹配 | 优先使用现有的18个Skills来处理对应任务 |
| 依赖管理 | 使用 task_create/task_update 的 blockedBy/blocks 管理依赖 |

---

## 执行机制详解

> 🎯 **重要**: 根据任务特性选择正确的执行机制是高效完成的关键！

### 执行机制对比

| 机制 | 工具 | 适用场景 | 特点 |
|------|------|----------|------|
| 同步执行 | bash, read_file, write_file | 简单、快速的任务 | 主线程阻塞，等待结果 |
| 后台执行 | background_run | 长时间运行的任务 | 不阻塞，异步通知 |
| 一次性Subagent | task | 独立探索或处理任务 | 隔离环境，返回摘要 |
| 持久化Teammate | spawn_teammate | 长期协作任务 | 独立agent，可idle/work |
| 持久化Task | task_create | 需要跟踪进度的任务 | 文件存储，支持依赖 |

### 选择决策树

```
任务是否需要并行执行？
├── 是 → 使用 background_run（后台执行）
│        └── 后续用 check_background 检查结果
│
└── 否 → 任务是否独立/隔离？
         ├── 是 → 任务是一次性的？
         │        ├── 是 → 使用 task (subagent)
         │        │        └── agent_type="Explore" (只读)
         │        │        └── agent_type="general-purpose" (读写)
         │        │
         │        └── 否 → 使用 spawn_teammate (持久化)
         │                 └── 可 idle/work 状态切换
         │                 └── 可 auto-claim tasks
         │
         └── 否 → 任务需要跟踪进度？
                  ├── 是 → 使用 task_create (持久化Task)
                  │        └── 支持 blockedBy/blocks 依赖
                  │
                  └── 否 → 使用 TodoWrite (内存Todo)
                           └── 简单任务跟踪
```

---

## 机制1: Background Tasks (background_run)

### 概述
后台执行不阻塞主流程的长时间任务。

### 工具定义
```python
background_run(command: str, timeout: int = 120) -> str
# 返回: "Background task {task_id} started: {command}"
# 后续通知: {"task_id": "...", "status": "completed/error", "result": "..."}

check_background(task_id: str = None) -> str
# task_id=None: 列出所有后台任务
# task_id指定: 返回特定任务状态和结果
```

### 使用场景
| 场景 | 示例 |
|------|------|
| 长时间命令 | `background_run("npm install")` |
| 批量处理 | `background_run("python process_all.py")` |
| 并行任务A | `background_run("python task_a.py")` |
| 并行任务B | `background_run("python task_b.py")` |

### 执行流程
```
1. 主Agent: background_run("long_command")
   ← "Background task abc12345 started"
   
2. 主Agent: 继续其他工作...

3. 系统自动: 任务完成后发送通知
   → <background-results>
     [bg:abc12345] completed: (result...)
     </background-results>
     
4. 主Agent: 检查结果
   check_background("abc12345")
```

### 并行执行示例
```python
# 同时启动多个后台任务
result1 = background_run("python script1.py")
result2 = background_run("python script2.py")
result3 = background_run("python script3.py")

# 继续其他工作...
read_file("config.json")

# 检查所有后台任务
all_tasks = check_background()

# 检查特定任务
task_result = check_background("abc12345")
```

---

## 机制2: Subagent (task)

### 概述
创建一次性子代理执行隔离任务，完成后返回摘要。

### 工具定义
```python
task(prompt: str, agent_type: str = "Explore") -> str
# agent_type:
#   - "Explore": 只读权限 (bash, read_file)
#   - "general-purpose": 读写权限 (bash, read_file, write_file, edit_file)
# 返回: 子代理执行结果的摘要
```

### Agent类型对比

| 类型 | 权限 | 适用场景 |
|------|------|----------|
| Explore | bash, read_file | 代码审查、文件探索、信息收集 |
| general-purpose | bash, read_file, write_file, edit_file | 代码修改、文件创建、实际操作 |

### 使用场景
| 场景 | Agent类型 | 示例 |
|------|-----------|------|
| 代码审查 | Explore | `task("审查 src/ 目录的代码质量")` |
| 文件探索 | Explore | `task("找到所有 .env 文件并检查安全性")` |
| 代码修改 | general-purpose | `task("重构 utils.py 中的错误处理逻辑")` |
| 文件创建 | general-purpose | `task("创建测试文件 test_api.py")` |

### 执行流程
```
1. 主Agent: task("探索项目结构", agent_type="Explore")
   ↓
2. Subagent启动:
   - 接收prompt
   - 使用只读工具 (bash, read_file)
   - 执行探索任务
   - 返回结果摘要
   ↓
3. 主Agent收到: "项目结构分析结果..."
```

### Subagent工具权限

```python
# Explore 类型 - 只读
sub_tools = [
    "bash",        # 可执行命令
    "read_file",   # 可读取文件
]

# general-purpose 类型 - 读写
sub_tools = [
    "bash",        # 可执行命令
    "read_file",   # 可读取文件
    "write_file",  # 可写入文件
    "edit_file",   # 可编辑文件
]
```

---

## 机制3: Teammate (spawn_teammate)

### 概述
创建持久化的协作代理，支持 idle/work 状态切换和自动任务认领。

### 工具定义
```python
spawn_teammate(name: str, role: str, prompt: str) -> str
# 创建持久化队友
# name: 队友名称
# role: 角色描述
# prompt: 初始任务/指令
# 返回: "Spawned '{name}' (role: {role})"

list_teammates() -> str
# 列出所有队友状态
# 返回: "Team: {team_name}\n  {name} ({role}): {status}"

send_message(to: str, content: str, msg_type: str = "message") -> str
# 发送消息给队友
# msg_type: message, broadcast, shutdown_request

read_inbox() -> list
# 读取主agent的收件箱

broadcast(content: str) -> str
# 广播消息给所有队友

shutdown_request(teammate: str) -> str
# 请求队友关闭
```

### Teammate 状态机制

```
┌─────────────────────────────────────────────────────────────┐
│                    Teammate 状态机                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   spawn() ──→ [working] ←──→ [idle] ←──→ auto-claim task   │
│                  │                │                         │
│                  ↓                ↓                         │
│              shutdown_request ──→ [shutdown]                │
│                                                             │
│   working: 正在执行任务，响应消息                             │
│   idle:    等待新消息或自动认领任务                           │
│   shutdown: 收到关闭请求后退出                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 自动任务认领

Teammate 在 idle 状态下会自动检查并认领未分配的任务：

```python
# Teammate 自动认领逻辑
if status == "idle":
    # 检查未认领的任务
    for task in tasks:
        if task.status == "pending" and not task.owner and not task.blockedBy:
            claim_task(task.id)
            status = "working"
            break
```

### 使用场景

| 场景 | 示例 |
|------|------|
| 长期协作 | `spawn_teammate("assistant", "helper", "协助处理用户请求")` |
| 专业分工 | `spawn_teammate("tester", "QA", "负责测试验证")` |
| 并行处理 | 同时spawn多个队友各自处理不同模块 |

### 协作示例

```python
# 1. 创建队友
spawn_teammate("data_processor", "数据处理专家", "处理data目录下的所有CSV文件")

# 2. 继续其他工作
read_file("config.json")

# 3. 发送消息给队友
send_message("data_processor", "请优先处理sales.csv文件")

# 4. 广播给所有队友
broadcast("请各位报告当前进度")

# 5. 检查收件箱
messages = read_inbox()

# 6. 查看队友状态
list_teammates()

# 7. 关闭队友
shutdown_request("data_processor")
```

---

## 机制4: 持久化 Task 系统

### 概述
持久化任务管理系统，支持依赖关系和状态跟踪。

### 工具定义
```python
task_create(subject: str, description: str = "") -> str
# 创建任务，返回任务JSON

task_get(task_id: int) -> str
# 获取任务详情

task_update(task_id: int, status: str = None, 
            add_blocked_by: list = None, add_blocks: list = None) -> str
# 更新任务状态和依赖关系
# status: pending, in_progress, completed, deleted

task_list() -> str
# 列出所有任务

claim_task(task_id: int) -> str
# 认领任务（设置owner和status=in_progress）
```

### 任务数据结构

```json
{
    "id": 1,
    "subject": "处理用户数据",
    "description": "从CSV文件导入用户数据到数据库",
    "status": "pending",
    "owner": null,
    "blockedBy": [],
    "blocks": []
}
```

### 依赖管理

```python
# 任务A必须在任务B之前完成
task_create("任务A: 数据准备")  # 返回 id=1
task_create("任务B: 数据分析")  # 返回 id=2

# 设置依赖: 任务B被任务A阻塞
task_update(2, add_blocked_by=[1])
# 或等价写法: 任务A阻塞任务B
task_update(1, add_blocks=[2])

# 完成任务A后，任务B的blockedBy自动清除
task_update(1, status="completed")
# 任务B现在可以执行了
```

### 状态流转

```
┌─────────────────────────────────────────────────────────────┐
│                    Task 状态流转                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   task_create() ──→ [pending] ──→ claim_task() ──→ [in_progress]
│                           │                          │      │
│                      blockedBy                    completed │
│                      (被阻塞)                      或 deleted│
│                           │                          │      │
│                           ↓                          ↓      │
│                      [等待中] ──────────────────→ [completed]
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 使用场景

| 场景 | 工具组合 |
|------|----------|
| 创建独立任务 | `task_create()` → `claim_task()` → `task_update(status="completed")` |
| 创建依赖任务 | `task_create()` × N → `task_update(add_blocked_by=[...])` |
| 跟踪任务进度 | `task_list()` → `task_get(id)` |
| Teammate认领 | 自动认领或 `claim_task()` |

---

## 机制5: TodoWrite (内存Todo)

### 概述
轻量级内存任务跟踪，适合简单任务列表。

### 工具定义
```python
TodoWrite(items: list) -> str
# items: [{"content": "...", "status": "pending|in_progress|completed", "activeForm": "..."}]
# 限制: 最多20项，只能有1个in_progress
```

### 使用场景
| 场景 | 建议 |
|------|------|
| 简单任务列表 (≤20项) | 使用 TodoWrite |
| 复杂任务 + 依赖关系 | 使用 task_create |
| 需要跨session持久化 | 使用 task_create |
| Teammate协作 | 使用 task_create + claim_task |

---

## 可用技能参考

以下是系统中的18个技能，拆解任务时应优先考虑使用这些技能：

| Skill名称 | 适用场景 |
|-----------|----------|
| algorithmic-art | 编程生成艺术、算法艺术、流场、粒子系统 |
| brand-guidelines | 品牌视觉设计、企业配色和字体规范 |
| canvas-design | 海报、艺术设计、静态视觉作品 |
| code-comment | 代码注释添加、中文文档化Python代码 |
| concurrent-execution | 并发执行分析、批量处理、并行任务规划 |
| doc-coauthoring | 文档协作、技术规范、提案写作 |
| docx | Word文档创建、编辑、处理 .docx 文件 |
| frontend-design | 前端界面开发、React组件、网页设计 |
| internal-comms | 内部通讯、状态报告、项目更新 |
| mcp-builder | MCP服务器构建、API集成、工具开发 |
| pdf | PDF操作、合并、拆分、OCR、表格提取 |
| pptx | PPT演示文稿创建、编辑、幻灯片制作 |
| skill-creator | 技能创建、优化、性能评估 |
| slack-gif-creator | Slack动画GIF制作 |
| theme-factory | 主题样式应用、10种预设主题 |
| web-artifacts-builder | 复杂Web artifact构建、React多组件 |
| webapp-testing | Web应用测试、Playwright自动化 |
| xlsx | Excel表格操作、数据处理、图表生成 |

---

## 工作流程

```
接收用户任务
    ↓
分析任务类型 → 识别相关技能
    ↓
任务拆解
    ├── 识别独立子任务
    ├── 标记依赖关系
    └── 确定执行机制
    ↓
选择执行策略
    ├── 并行任务 → background_run
    ├── 隔离任务 → task (subagent)
    ├── 协作任务 → spawn_teammate
    └── 跟踪任务 → task_create
    ↓
生成任务计划
    ├── TodoWrite (简单列表)
    └── task_create (复杂依赖)
    ↓
执行并监控
    ↓
保存最终结果 → data/<任务关联文件夹>/
```

---

## 📁 任务结果保存规范 (重要)

> ⚠️ **必须遵守**: 每次用户请求完成后，**必须**在 `data` 文件夹下创建一个与当前任务关联的文件夹，用于保存最终结果。

### 文件夹命名规则

| 任务类型 | 命名格式 | 示例 |
|----------|----------|------|
| 通用任务 | `task-<YYYYMMDD>-<简短描述>` | `task-20250101-data-analysis` |
| 文件处理 | `<原文件名>-<处理类型>` | `sales-report-converted` |
| 技能相关 | `<skill-name>-<日期>` | `pptx-20250101-brand-deck` |
| 项目任务 | `project-<项目名>-<阶段>` | `project-website-v1` |

### 文件夹结构

```
data/
└── <任务文件夹>/
    ├── README.md          # 任务说明和结果概述 (必需)
    ├── output/            # 最终输出文件
    ├── intermediate/      # 中间文件 (可选)
    └── logs/              # 执行日志 (可选)
```

### README.md 模板

```markdown
# <任务名称>

## 任务描述
<用户原始请求的简述>

## 执行时间
- 开始：<日期时间>
- 结束：<日期时间>

## 使用的技能
- <skill-1>
- <skill-2>

## 输出文件
| 文件名 | 说明 |
|--------|------|
| xxxxx | 文件描述 |

## 备注
<其他需要说明的信息>
```

### 执行时机

1. **任务开始时**: 创建任务文件夹和 README.md 骨架
2. **任务进行中**: 将中间结果保存到 `intermediate/`
3. **任务完成时**: 将最终结果保存到 `output/` 并更新 README.md

### 示例代码

```python
# 1. 任务开始时创建文件夹
import os
from datetime import datetime

date_str = datetime.now().strftime("%Y%m%d")
task_folder = f"data/task-{date_str}-数据分析"
os.makedirs(f"{task_folder}/output", exist_ok=True)
os.makedirs(f"{task_folder}/intermediate", exist_ok=True)

# 2. 创建 README.md
readme_content = f"""# 数据分析任务

## 任务描述
分析销售数据并生成报告

## 执行时间
- 开始：{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
- 结束：待完成

## 使用的技能
- xlsx
- concurrent-execution

## 输出文件
待更新

## 备注
待补充
"""
write_file(f"{task_folder}/README.md", readme_content)

# 3. 任务完成时更新 README 并保存结果
# ... 执行任务 ...
write_file(f"{task_folder}/output/final-report.xlsx", result)
```

### 保存最终结果的 Checklist

- [ ] 创建 `data/<任务文件夹>/` 目录
- [ ] 创建 `README.md` 记录任务信息
- [ ] 将最终输出保存到 `output/` 子目录
- [ ] 更新 `README.md` 中的输出文件列表
- [ ] 更新 `README.md` 中的结束时间

---

## 📝 TodoWrite 编写指南 (基于 s_full.py 工具)

> ⚠️ **关键**: TodoWrite 的 items 必须与实际使用的工具调用相匹配，确保每个 todo 都能映射到具体的工具执行。

### TodoWrite 数据结构

```python
TodoWrite(items=[
    {
        "content": "任务描述",      # 必需：清晰描述要做什么
        "status": "pending",        # 必需：pending | in_progress | completed
        "activeForm": "正在执行..."  # 必需：描述当前活动
    },
    # 最多 20 项，只能有 1 个 in_progress
])
```

### 工具与 Todo 的映射关系

| 工具 | Todo 内容示例 | activeForm 示例 |
|------|--------------|----------------|
| `bash` | 执行 shell 命令 | 正在运行命令... |
| `read_file` | 读取配置文件 | 正在读取 config.json... |
| `write_file` | 创建输出文件 | 正在写入结果文件... |
| `edit_file` | 修改源代码 | 正在编辑 source.py... |
| `task` (subagent) | 委托子代理任务 | 正在等待子代理分析... |
| `background_run` | 后台执行长时间任务 | 正在后台处理... |
| `load_skill` | 加载专业技能 | 正在加载 xlsx 技能... |
| `task_create` | 创建持久化任务 | 正在设置任务跟踪... |
| `spawn_teammate` | 创建协作者 | 正在启动协作者... |

---

## 🔀 并发任务 TodoWrite 示例

### 场景：处理多个数据文件并生成汇总报告

**任务分析**:
- 3 个独立的 CSV 文件需要处理
- 文件之间无依赖，可并行
- 最后需要汇总所有结果

**TodoWrite 写法**:

```python
TodoWrite(items=[
    # 阶段 1: 准备工作
    {"content": "创建任务文件夹 data/task-数据分析/", "status": "completed", "activeForm": "创建任务文件夹..."},
    {"content": "读取并分析 3 个 CSV 文件结构", "status": "in_progress", "activeForm": "正在分析 CSV 文件结构..."},
    
    # 阶段 2: 并行处理 (使用 background_run)
    {"content": "[并行] 处理 sales_q1.csv", "status": "pending", "activeForm": "等待后台处理 q1 数据..."},
    {"content": "[并行] 处理 sales_q2.csv", "status": "pending", "activeForm": "等待后台处理 q2 数据..."},
    {"content": "[并行] 处理 sales_q3.csv", "status": "pending", "activeForm": "等待后台处理 q3 数据..."},
    
    # 阶段 3: 汇总
    {"content": "检查所有后台任务完成状态", "status": "pending", "activeForm": "正在检查后台任务状态..."},
    {"content": "合并 3 个季度的处理结果", "status": "pending", "activeForm": "正在合并数据结果..."},
    
    # 阶段 4: 输出
    {"content": "生成最终汇总报告 Excel", "status": "pending", "activeForm": "正在生成汇总报告..."},
    {"content": "更新任务 README.md", "status": "pending", "activeForm": "正在更新任务文档..."},
])

# 对应的工具调用序列:
# 1. 完成任务 1 (已完成)
# 2. 完成任务 2 (in_progress)
read_file("data/sales_q1.csv")
read_file("data/sales_q2.csv")
read_file("data/sales_q3.csv")

# 3. 启动并行任务
TodoWrite(items=[...将任务 3,4,5 设为 in_progress...])
bg1 = background_run("python process.py data/sales_q1.csv")
bg2 = background_run("python process.py data/sales_q2.csv")
bg3 = background_run("python process.py data/sales_q3.csv")

# 4. 检查后台任务
TodoWrite(items=[...将任务 6 设为 in_progress...])
check_background()  # 或等待自动通知

# 5. 继续后续任务...
```

**关键要点**:
1. 用 `[并行]` 前缀标记可并行执行的任务
2. 并行任务可以**同时**设为 `in_progress` 状态（在实际执行时）
3. 在 TodoWrite 中体现**任务阶段**
4. 每个 todo 对应一个明确的工具调用

---

## 🤖 Subagent 任务 TodoWrite 示例

### 场景：代码审查 + 重构

**任务分析**:
- 先探索代码库（只读）
- 再执行重构（读写）
- 两个阶段可委托给 subagent

**TodoWrite 写法**:

```python
TodoWrite(items=[
    # 阶段 1: 任务分解
    {"content": "加载 task-decomposer 技能", "status": "completed", "activeForm": "正在加载技能..."},
    {"content": "分析任务并创建 TodoWrite", "status": "completed", "activeForm": "正在分析任务..."},
    
    # 阶段 2: 代码审查 (使用 task-Explore)
    {"content": "[Subagent-Explore] 审查 src/ 目录代码质量", "status": "in_progress", "activeForm": "正在等待子代理审查代码..."},
    
    # 阶段 3: 代码重构 (使用 task-general-purpose)
    {"content": "[Subagent-GP] 根据审查结果重构代码", "status": "pending", "activeForm": "等待子代理重构代码..."},
    
    # 阶段 4: 验证
    {"content": "运行测试验证重构结果", "status": "pending", "activeForm": "正在运行测试..."},
    
    # 阶段 5: 保存结果
    {"content": "保存审查报告和重构日志", "status": "pending", "activeForm": "正在保存结果..."},
])

# 对应的工具调用序列:
# 1. 加载技能
load_skill("task-decomposer")

# 2. 完成 todo 1,2 后
TodoWrite(items=[...将任务 3 设为 in_progress...])

# 3. 启动 Explore 类型的 subagent (只读)
review_result = task("""
审查 src/ 目录，识别:
1. 代码质量问题
2. 需要重构的模块
3. 建议的重构方案
""", agent_type="Explore")

# 4. 审查完成后
TodoWrite(items=[
    {"content": "[Subagent-Explore] 审查 src/ 目录代码质量", "status": "completed", "activeForm": "审查完成"},
    {"content": "[Subagent-GP] 根据审查结果重构代码", "status": "in_progress", "activeForm": "正在委托子代理重构..."},
    ...
])

# 5. 启动 general-purpose 类型的 subagent (可读写)
refactor_result = task("""
根据以下审查报告重构代码:
{review_result}

要求:
1. 保持 API 兼容性
2. 添加必要的注释
3. 保持代码风格一致
""", agent_type="general-purpose")

# 6. 继续后续任务...
```

**关键要点**:
1. 用 `[Subagent-Explore]` 或 `[Subagent-GP]` 标记 subagent 任务
2. 在 todo content 中说明 subagent 的类型
3. activeForm 体现"等待子代理"的状态
4. 完成后再更新下一个 todo 为 in_progress

---

## 👥 Teammate 协作 TodoWrite 示例

### 场景：数据处理 + 报告生成的长期协作

**任务分析**:
- 需要两个协作者长期工作
- 数据处理和报告生成并行
- 需要任务跟踪和依赖管理

**TodoWrite 写法**:

```python
TodoWrite(items=[
    # 阶段 1: 设置协作环境
    {"content": "创建持久化任务 (数据处理)", "status": "in_progress", "activeForm": "正在创建数据处理任务..."},
    {"content": "创建持久化任务 (报告生成)", "status": "pending", "activeForm": "准备创建报告任务..."},
    {"content": "创建持久化任务 (汇总)", "status": "pending", "activeForm": "准备创建汇总任务..."},
    
    # 阶段 2: 启动协作者
    {"content": "[Teammate] 启动数据处理专家", "status": "pending", "activeForm": "准备启动 data_worker..."},
    {"content": "[Teammate] 启动报告生成器", "status": "pending", "activeForm": "准备启动 report_worker..."},
    
    # 阶段 3: 分配任务
    {"content": "分配本周数据处理任务", "status": "pending", "activeForm": "准备分配任务给 data_worker..."},
    {"content": "分配周报生成任务", "status": "pending", "activeForm": "准备分配任务给 report_worker..."},
    
    # 阶段 4: 监控和整合
    {"content": "检查协作者进度", "status": "pending", "activeForm": "准备检查团队状态..."},
    {"content": "整合最终结果", "status": "pending", "activeForm": "准备整合数据..."},
])

# 对应的工具调用序列:
# 1. 创建持久化任务
data_task = task_create("数据处理", "处理 data 目录下所有 CSV 文件")
# 返回: {"id": 1, ...}

TodoWrite(items=[
    {"content": "创建持久化任务 (数据处理)", "status": "completed", "activeForm": "任务已创建"},
    {"content": "创建持久化任务 (报告生成)", "status": "in_progress", "activeForm": "正在创建报告任务..."},
    ...
])

report_task = task_create("报告生成", "基于处理结果生成周报")
# 返回: {"id": 2, ...}

summary_task = task_create("汇总报告", "生成月度汇总", add_blocked_by=[1, 2])
# 返回: {"id": 3, ...}

# 2. 启动协作者
TodoWrite(items=[...更新任务状态...])
spawn_teammate("data_worker", "数据处理专家", "负责处理所有 CSV 数据文件")

TodoWrite(items=[...更新...])
spawn_teammate("report_worker", "报告生成器", "负责生成周报和月报")

# 3. 分配任务
TodoWrite(items=[...更新...])
send_message("data_worker", "请处理本周的 CSV 文件")

send_message("report_worker", "请生成本周工作报告")

# 4. 监控
TodoWrite(items=[...更新...])
list_teammates()
read_inbox()

# 5. 整合结果
# ... 主 agent 继续工作 ...
```

**关键要点**:
1. 用 `[Teammate]` 前缀标记协作者相关任务
2. 使用 `task_create` 创建可追踪的持久化任务
3. 使用 `task_update` 设置依赖关系
4. 协作者可以自动 `claim_task`

---

## 📋 完整综合示例

### 任务："分析销售数据并创建品牌 PPT 报告"

**完整执行流程**:

```python
# ==================== STEP 1: 任务分解 ====================
load_skill("task-decomposer")

# ==================== STEP 2: 创建 TodoWrite ====================
TodoWrite(items=[
    # 阶段 1: 环境准备
    {"content": "创建任务文件夹 data/task-销售分析-ppt/", "status": "in_progress", "activeForm": "正在创建任务文件夹..."},
    {"content": "创建 README.md 任务文档", "status": "pending", "activeForm": "准备创建任务文档..."},
    
    # 阶段 2: 数据准备
    {"content": "读取销售数据 Excel 文件", "status": "pending", "activeForm": "准备读取 sales_data.xlsx..."},
    {"content": "[并行] 清洗 Q1 数据", "status": "pending", "activeForm": "准备后台处理 Q1..."},
    {"content": "[并行] 清洗 Q2 数据", "status": "pending", "activeForm": "准备后台处理 Q2..."},
    {"content": "[并行] 清洗 Q3 数据", "status": "pending", "activeForm": "准备后台处理 Q3..."},
    {"content": "[并行] 清洗 Q4 数据", "status": "pending", "activeForm": "准备后台处理 Q4..."},
    
    # 阶段 3: 数据分析
    {"content": "[Subagent] 分析销售趋势和关键指标", "status": "pending", "activeForm": "准备委托子代理分析..."},
    
    # 阶段 4: PPT 制作
    {"content": "加载 pptx 技能", "status": "pending", "activeForm": "准备加载 pptx 技能..."},
    {"content": "加载 brand-guidelines 技能", "status": "pending", "activeForm": "准备加载品牌指南..."},
    {"content": "创建 PPT 框架", "status": "pending", "activeForm": "准备创建 PPT 结构..."},
    {"content": "填充数据和图表", "status": "pending", "activeForm": "准备填充内容..."},
    {"content": "应用品牌样式", "status": "pending", "activeForm": "准备应用品牌风格..."},
    
    # 阶段 5: 完成
    {"content": "保存最终 PPT 到 output/", "status": "pending", "activeForm": "准备保存结果..."},
    {"content": "更新 README.md 完成状态", "status": "pending", "activeForm": "准备更新任务文档..."},
])

# ==================== STEP 3: 执行任务 ====================

# 任务 1: 创建文件夹
import os
from datetime import datetime
date_str = datetime.now().strftime("%Y%m%d")
task_folder = f"data/task-{date_str}-销售分析-ppt"
os.makedirs(f"{task_folder}/output", exist_ok=True)
os.makedirs(f"{task_folder}/intermediate", exist_ok=True)

# 更新 todo
TodoWrite(items=[
    {"content": "创建任务文件夹 data/task-销售分析-ppt/", "status": "completed", "activeForm": "文件夹已创建"},
    {"content": "创建 README.md 任务文档", "status": "in_progress", "activeForm": "正在创建 README.md..."},
    ...
])

# 任务 2: 创建 README
readme = f"""# 销售分析 PPT 报告

## 任务描述
分析销售数据并创建品牌 PPT 报告

## 执行时间
- 开始：{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
- 结束：待完成

## 使用的技能
- xlsx
- pptx
- brand-guidelines

## 输出文件
待更新
"""
write_file(f"{task_folder}/README.md", readme)

# 任务 3-7: 数据处理
TodoWrite(items=[...更新状态...])
load_skill("xlsx")
read_file("data/sales_data.xlsx")

# 并行清洗 4 个季度的数据
TodoWrite(items=[
    ...
    {"content": "[并行] 清洗 Q1 数据", "status": "in_progress", "activeForm": "正在后台处理 Q1..."},
    {"content": "[并行] 清洗 Q2 数据", "status": "in_progress", "activeForm": "正在后台处理 Q2..."},
    {"content": "[并行] 清洗 Q3 数据", "status": "in_progress", "activeForm": "正在后台处理 Q3..."},
    {"content": "[并行] 清洗 Q4 数据", "status": "in_progress", "activeForm": "正在后台处理 Q4..."},
    ...
])

bg1 = background_run("python clean_data.py --quarter Q1")
bg2 = background_run("python clean_data.py --quarter Q2")
bg3 = background_run("python clean_data.py --quarter Q3")
bg4 = background_run("python clean_data.py --quarter Q4")

# 等待后台任务完成
TodoWrite(items=[
    ...
    {"content": "检查所有后台任务完成状态", "status": "in_progress", "activeForm": "正在检查后台任务..."},
    ...
])
check_background()

# 任务 8: 数据分析 (subagent)
TodoWrite(items=[
    ...
    {"content": "[Subagent] 分析销售趋势和关键指标", "status": "in_progress", "activeForm": "正在委托子代理分析..."},
    ...
])

analysis = task("""
分析清洗后的销售数据，识别:
1. 季度增长趋势
2. 关键销售指标 (KPI)
3. 异常值和洞察
4. 建议的图表类型
""", agent_type="Explore")

# 任务 9-12: PPT 制作
TodoWrite(items=[
    ...
    {"content": "加载 pptx 技能", "status": "in_progress", "activeForm": "正在加载 pptx 技能..."},
    ...
])
load_skill("pptx")

TodoWrite(items=[
    ...
    {"content": "加载 brand-guidelines 技能", "status": "in_progress", "activeForm": "正在加载品牌指南..."},
    ...
])
load_skill("brand-guidelines")

# ... 继续执行剩余任务 ...

# 最后: 保存结果并更新 README
write_file(f"{task_folder}/output/sales_report.pptx", final_pptx)

final_readme = f"""# 销售分析 PPT 报告

## 任务描述
分析销售数据并创建品牌 PPT 报告

## 执行时间
- 开始：2025-01-15 09:00:00
- 结束：2025-01-15 11:30:00

## 使用的技能
- xlsx - 数据处理
- pptx - PPT 制作
- brand-guidelines - 品牌样式

## 输出文件
| 文件名 | 说明 |
|--------|------|
| sales_report.pptx | 最终销售报告 PPT |
| analysis_summary.md | 数据分析摘要 |

## 备注
使用了 4 个并行后台任务处理季度数据
使用 subagent 进行趋势分析
"""
write_file(f"{task_folder}/README.md", final_readme)

# 标记所有任务完成
TodoWrite(items=[
    {"content": "创建任务文件夹 data/task-销售分析-ppt/", "status": "completed", "activeForm": "已完成"},
    {"content": "创建 README.md 任务文档", "status": "completed", "activeForm": "已完成"},
    ...
    {"content": "更新 README.md 完成状态", "status": "completed", "activeForm": "已完成"},
])
```

---

## ✅ TodoWrite 最佳实践检查清单

| 检查项 | 说明 |
|--------|------|
| ✅ 任务分解合理 | 每个 todo 应该是原子操作 |
| ✅ 状态正确 | 只能有 1 个 `in_progress` |
| ✅ activeForm 清晰 | 描述当前正在进行的活动 |
| ✅ 映射到工具 | 每个 todo 对应具体的工具调用 |
| ✅ 并行任务标记 | 使用 `[并行]` 或 `[Parallel]` 前缀 |
| ✅ Subagent 标记 | 使用 `[Subagent-Explore]` 或 `[Subagent-GP]` |
| ✅ Teammate 标记 | 使用 `[Teammate]` 前缀 |
| ✅ 阶段分明 | 按阶段组织 todo 顺序 |
| ✅ 及时更新 | 完成一项后立即更新状态 |
| ✅ 结果保存 | 包含保存结果到 data/ 的任务 |

---

## 🎯 常见模式速查表

| 模式 | TodoWrite 结构 | 对应工具 |
|------|---------------|----------|
| 顺序执行 | A(pending) → A(in_progress) → A(completed), B(in_progress) | 同步工具 |
| 并行执行 | A,B,C 同时 in_progress | background_run |
| Subagent 委托 | [Subagent] A(in_progress) → 等待 → A(completed) | task |
| Teammate 协作 | [Teammate] A + task_create | spawn_teammate |
| 依赖链 | task_create A, B, C + task_update(B, blockedBy=[A]) | task_create/update |

---

## 任务类型标记

为每个子任务标记其特征和推荐执行机制：

| 标记 | 含义 | 推荐机制 |
|------|------|----------|
| 🔄 串行 | 必须按顺序执行 | 同步工具 |
| ⚡ 并行 | 可并行执行 | background_run |
| 🔍 探索 | 只读隔离任务 | task (Explore) |
| ✏️ 修改 | 需要写权限的隔离任务 | task (general-purpose) |
| 👥 协作 | 长期协作任务 | spawn_teammate |
| 📋 跟踪 | 需要进度跟踪 | task_create |
| 🎯 技能 | 有对应技能 | load_skill |

---

## 拆解模式详解

### 模式1: 顺序依赖
```
Task A → Task B → Task C
```
**策略**: 使用 TodoWrite 或 task_create + blockedBy
```python
TodoWrite([
    {"content": "Task A", "status": "pending", "activeForm": "执行Task A..."},
    {"content": "Task B", "status": "pending", "activeForm": "执行Task B..."},
    {"content": "Task C", "status": "pending", "activeForm": "执行Task C..."},
])
```

### 模式2: 部分并行
```
    Task B ──┐
             ├──→ Task D
Task A → C ──┘
```
**策略**: 使用 background_run 并行执行 B 和 C
```python
# Task A 先执行
task_create("Task A", "...")  # id=1

# Task B 和 C 可以并行
background_run("python task_b.py")  # task_id: b123
background_run("python task_c.py")  # task_id: c456

# 等待完成后再执行 Task D
# (通过 check_background 或自动通知)
```

### 模式3: 完全并行
```
Task A ──┐
Task B ──┼──→ Result
Task C ──┘
```
**策略**: 使用 background_run 或多个 task
```python
# 方案1: background_run
bg_a = background_run("python task_a.py")
bg_b = background_run("python task_b.py")
bg_c = background_run("python task_c.py")

# 方案2: 多个 task (如果任务复杂)
task("执行 Task A", agent_type="general-purpose")
task("执行 Task B", agent_type="general-purpose")
task("执行 Task C", agent_type="general-purpose")
```

### 模式4: 委托模式
```
Main Agent
    ├──→ Subagent 1 (Task A, B)
    ├──→ Subagent 2 (Task C, D)
    └──→ Task E (自己执行)
```
**策略**: 使用 task 或 spawn_teammate
```python
# 方案1: 一次性 subagent (适合独立任务)
result1 = task("处理 Task A 和 B", agent_type="general-purpose")
result2 = task("处理 Task C 和 D", agent_type="general-purpose")

# 方案2: 持久化 teammate (适合长期协作)
spawn_teammate("worker1", "数据处理器", "处理 A 和 B")
spawn_teammate("worker2", "报告生成器", "处理 C 和 D")

# Task E 主agent自己执行
# ... 主agent工作 ...
```

### 模式5: 依赖链 + 并行
```
Task A ──→ Task B ──┐
                    ├──→ Task D
Task C ────────────┘
```
**策略**: 使用 task_create + blockedBy + background_run
```python
# 创建任务
a = task_create("Task A", "...")  # id=1
b = task_create("Task B", "...")  # id=2
c = task_create("Task C", "...")  # id=3
d = task_create("Task D", "...")  # id=4

# 设置依赖
task_update(2, add_blocked_by=[1])  # B 被 A 阻塞
task_update(4, add_blocked_by=[2, 3])  # D 被 B 和 C 阻塞

# 执行: A 和 C 可以并行
background_run("python task_a.py")
background_run("python task_c.py")

# A 完成后启动 B
# B 和 C 都完成后启动 D
```

---

## 示例拆解

### 示例1: "帮我创建一个品牌宣传PPT"

**分析:**
- 文件类型: .pptx
- 任务场景: 演示文稿
- 相关技能: pptx, brand-guidelines, canvas-design

**拆解:**
| 任务 | 类型 | 机制 | 说明 |
|------|------|------|------|
| 收集品牌素材 | 🔄 串行 | 同步 | 必须先有素材 |
| 创建PPT框架 | 🎯 技能 | load_skill("pptx") | 使用pptx技能 |
| 设计视觉风格 | ⚡ 并行 | background_run | 可与内容并行 |
| 完成最终PPT | 🔄 串行 | 同步 | 整合内容 |

**执行方案:**
```python
# 1. 收集素材 (同步)
read_file("brand_guidelines.md")

# 2. 并行执行内容准备和视觉设计
background_run("python prepare_content.py")

# 3. 使用pptx技能
load_skill("pptx")

# 4. 完成PPT
# ... 整合所有内容 ...
```

### 示例2: "分析这个PDF并生成Excel报告"

**分析:**
- 输入: PDF文件
- 输出: Excel报告
- 相关技能: pdf, xlsx

**拆解:**
| 任务 | 类型 | 机制 | 说明 |
|------|------|------|------|
| 读取PDF | 🔄 串行 | load_skill("pdf") | 必须先读取 |
| 提取数据 | 🔍 探索 | task (Explore) | 隔离探索 |
| 生成Excel | 🎯 技能 | load_skill("xlsx") | 使用xlsx技能 |

**执行方案:**
```python
# 1. 使用pdf技能读取
load_skill("pdf")

# 2. 委托子任务进行数据分析
analysis_result = task("""
分析提取的PDF数据，识别:
1. 数据结构和字段
2. 关键指标
3. 建议的Excel格式
""", agent_type="Explore")

# 3. 使用xlsx技能生成报告
load_skill("xlsx")
```

### 示例3: "处理多个数据文件并生成汇总报告"

**分析:**
- 多文件并行处理
- 需要生成汇总

**拆解:**
| 任务 | 类型 | 机制 | 说明 |
|------|------|------|------|
| 处理文件1 | ⚡ 并行 | background_run | 独立任务 |
| 处理文件2 | ⚡ 并行 | background_run | 独立任务 |
| 处理文件3 | ⚡ 并行 | background_run | 独立任务 |
| 汇总报告 | 🔄 串行 | 同步 | 等待所有文件处理 |

**执行方案:**
```python
# 创建任务跟踪
task_create("处理文件1", "处理data/file1.csv")  # id=1
task_create("处理文件2", "处理data/file2.csv")  # id=2
task_create("处理文件3", "处理data/file3.csv")  # id=3
task_create("汇总报告", "生成最终汇总报告", add_blocked_by=[1,2,3])  # id=4

# 并行启动所有文件处理
bg1 = background_run("python process.py data/file1.csv")
bg2 = background_run("python process.py data/file2.csv")
bg3 = background_run("python process.py data/file3.csv")

# 检查后台任务状态
check_background()  # 列出所有任务

# 等待全部完成后执行汇总
# (系统会自动通知或主动检查)
```

### 示例4: "重构代码库并进行测试"

**分析:**
- 代码重构
- 需要测试验证
- 可能需要多个agent协作

**拆解:**
| 任务 | 类型 | 机制 | 说明 |
|------|------|------|------|
| 代码审查 | 🔍 探索 | task (Explore) | 只读探索 |
| 重构代码 | ✏️ 修改 | task (general-purpose) | 需要写权限 |
| 运行测试 | ⚡ 并行 | background_run | 后台运行 |
| 验证结果 | 🔄 串行 | 同步 | 最终确认 |

**执行方案:**
```python
# 1. 先进行代码审查
review = task("""
审查 src/ 目录，识别:
1. 需要重构的模块
2. 代码质量问题
3. 建议的重构方案
""", agent_type="Explore")

# 2. 委托重构任务
refactor = task("""
根据审查结果重构代码:
1. 重构识别的模块
2. 保持API兼容性
3. 添加必要的注释
""", agent_type="general-purpose")

# 3. 后台运行测试
bg_test = background_run("pytest tests/")

# 4. 检查测试结果
check_background(bg_test.split()[2])  # 提取task_id
```

### 示例5: "长期协作项目"

**分析:**
- 需要长期协作
- 多个agent分工

**拆解:**
| Agent | 角色 | 任务 |
|-------|------|------|
| 主Agent | 协调者 | 分配任务、整合结果 |
| Teammate1 | 数据处理 | 处理数据文件 |
| Teammate2 | 报告生成 | 生成各类报告 |

**执行方案:**
```python
# 1. 创建持久化任务
task_create("数据处理", "处理所有CSV数据文件")
task_create("周报生成", "生成每周工作报告")
task_create("月报生成", "生成每月汇总报告")

# 2. Spawn teammates
spawn_teammate("data_worker", "数据处理专家", 
    "负责处理data目录下的所有数据文件")

spawn_teammate("report_worker", "报告生成器",
    "负责生成周报和月报")

# 3. 分配任务
send_message("data_worker", "请处理本周的CSV文件")

# 4. Teammates 会自动认领任务:
# - idle状态下检查pending任务
# - 自动claim并执行

# 5. 广播重要通知
broadcast("项目截止日期更新为周五")

# 6. 检查团队状态
list_teammates()

# 7. 项目结束时关闭teammates
shutdown_request("data_worker")
shutdown_request("report_worker")
```

---

## 消息系统

### 消息类型

| 类型 | 用途 | 示例 |
|------|------|------|
| message | 普通消息 | `send_message(to, content, "message")` |
| broadcast | 广播给所有人 | `broadcast(content)` |
| shutdown_request | 关闭队友 | `shutdown_request(teammate)` |
| plan_approval_response | 计划审批响应 | 系统内部使用 |

### 消息流程

```
主Agent                          Teammate
   │                                │
   │── spawn_teammate() ────────────→│ 创建
   │                                │
   │── send_message() ──────────────→│ 接收消息
   │                                │
   │                                │←── 处理任务
   │                                │
   │←── inbox notification ─────────│ 完成通知
   │                                │
   │── read_inbox() ────────────────→│ 读取结果
   │                                │
   │── shutdown_request() ──────────→│ 关闭
   │                                │
```

---

## 最佳实践

### 1. 选择正确的执行机制

```python
# ✅ 好的选择
background_run("npm install")  # 长时间命令
task("探索代码库结构", agent_type="Explore")  # 只读探索
spawn_teammate("helper", "助手", "长期协作")  # 长期协作

# ❌ 错误的选择
background_run("ls")  # 简单命令不需要后台
task("创建文件", agent_type="Explore")  # Explore不能写文件
spawn_teammate("temp", "临时", "一次性任务")  # 应该用task
```

### 2. 管理依赖关系

```python
# ✅ 正确设置依赖
task_create("准备数据")  # id=1
task_create("分析数据", add_blocked_by=[1])  # id=2, 被1阻塞

# ✅ 完成任务后自动解除阻塞
task_update(1, status="completed")  # 任务2现在可以执行
```

### 3. 并行任务模式

```python
# ✅ 正确的并行模式
bg1 = background_run("task1.py")
bg2 = background_run("task2.py")
bg3 = background_run("task3.py")

# 继续其他工作...
read_file("config.json")

# 检查结果
check_background()
```

### 4. Teammate生命周期

```python
# ✅ 完整的生命周期管理
# 1. 创建
spawn_teammate("worker", "处理器", "任务描述")

# 2. 协作
send_message("worker", "新任务")
broadcast("重要通知")

# 3. 监控
list_teammates()
read_inbox()

# 4. 关闭
shutdown_request("worker")
```

---

## 总结

| 机制 | 工具 | 使用场景 | 特点 |
|------|------|----------|------|
| 后台执行 | background_run | 长时间、并行任务 | 异步、不阻塞 |
| 一次性Subagent | task | 隔离任务 | Explore只读 / general-purpose读写 |
| 持久化Teammate | spawn_teammate | 长期协作 | idle/work切换、自动认领任务 |
| 持久化Task | task_create | 依赖管理 | blockedBy/blocks依赖链 |
| 内存Todo | TodoWrite | 简单列表 | ≤20项、1个in_progress |

> 💡 **提示**: 复杂任务建议先用 TodoWrite 或 task_create 创建任务列表，然后根据任务特性选择正确的执行机制！