---
name: concurrent-execution
description: "Use this skill when you need to analyze tasks for parallel execution opportunities, determine concurrency strategies, and execute multiple tasks efficiently. Make sure to use this skill whenever the user mentions parallel tasks, concurrent execution, batch processing, multiple independent operations, or when you identify opportunities to speed up work by running tasks simultaneously. This skill helps maximize efficiency through intelligent task analysis and parallel execution."
license: Proprietary
---

# Concurrent Execution Skill

## Quick Reference

| Task | Guide |
|------|-------|
| 分析任务依赖关系 | 识别任务之间的输入输出依赖 |
| 判断并发可行性 | 评估任务是否可安全并行执行 |
| 制定并发策略 | 选择 parallel、batched 或 pipeline 模式 |
| 执行并发任务 | 使用 background_run 或 task 子代理 |
| 监控执行状态 | 使用 check_background 跟踪进度 |
| 汇总执行结果 | 合并所有任务的输出 |

---

## 工作流程概述

本技能用于分析一组任务的并发可行性，制定最优执行策略，并高效地并行执行这些任务。

```
任务列表 → 依赖分析 → 并发判断 → 策略选择 → 执行 → 结果汇总
```

---

## Step 1: 分析任务依赖关系

### 识别任务类型

在决定并发之前，首先需要分析每个任务的特性：

1. **读取任务描述**: 理解每个任务的具体内容
2. **识别输入依赖**: 任务是否需要其他任务的输出作为输入
3. **识别资源竞争**: 任务是否访问相同的文件或资源
4. **识别执行顺序约束**: 是否存在业务逻辑上的先后顺序

### 依赖关系分类

| 依赖类型 | 描述 | 并发影响 |
|----------|------|----------|
| 无依赖 | 任务完全独立 | 可完全并行 |
| 数据依赖 | 任务 A 的输出是任务 B 的输入 | 必须串行或流水线 |
| 资源依赖 | 任务访问同一文件/端口 | 需要互斥或排队 |
| 逻辑依赖 | 业务上需要先完成 A 再做 B | 按业务顺序执行 |

### 依赖分析示例

```
任务列表:
- 任务 A: 读取 data.csv
- 任务 B: 处理 data.csv 生成 report.xlsx
- 任务 C: 读取 config.json
- 任务 D: 发送报告邮件

依赖关系:
A → B (B 依赖 A 的输出)
B → D (D 依赖 B 的输出)
C 独立

并发分组:
- 组 1 (并行): A, C
- 组 2 (串行): B (等待 A)
- 组 3 (串行): D (等待 B)
```

---

## Step 2: 判断并发可行性

### 并发判断矩阵

使用以下标准评估每个任务是否可并发：

| 评估维度 | 可并发条件 | 不可并发条件 |
|----------|------------|--------------|
| 资源访问 | 读操作或独立文件 | 写操作到同一文件 |
| 端口/网络 | 使用不同端口或服务 | 绑定同一端口 |
| 数据库 | 不同表或只读查询 | 同表写操作 |
| 执行时间 | 长任务优先并发 | 短任务可串行 |
| 错误隔离 | 失败不影响其他任务 | 失败导致级联错误 |

### 并发风险评估

```
风险等级:
- 低风险: 只读操作、独立资源、幂等任务 → 推荐并发
- 中风险: 有资源竞争但可锁保护 → 谨慎并发
- 高风险: 数据一致性关键、级联依赖 → 避免并发
```

### 决策流程图

```
开始
  ↓
任务是否独立？──否──→ 串行执行
  ↓是
是否有资源竞争？──是──→ 加锁或排队
  ↓否
执行时间是否值得？──否──→ 串行执行（开销大）
  ↓是
  ↓
推荐并发执行
```

---

## Step 3: 制定并发策略

### 策略选择

根据任务特性选择合适的并发策略：

| 策略 | 适用场景 | 实现方式 |
|------|----------|----------|
| **完全并行** | 所有任务独立 | 同时启动所有任务 |
| **分组并行** | 任务分多组，组内并行、组间串行 | 按依赖分组，逐组执行 |
| **流水线** | 任务有上下游关系 | 使用队列传递数据 |
| **限流并发** | 资源有限制 | 控制最大并发数 |
| **优先级并发** | 任务有优先级 | 高优先级先执行 |

### 策略配置示例

```python
# 完全并行 - 适合独立任务
strategy = {
    "type": "parallel",
    "max_concurrent": "unlimited",
    "tasks": ["task1", "task2", "task3"]
}

# 分组并行 - 适合有依赖的任务
strategy = {
    "type": "batched",
    "groups": [
        {"id": 1, "tasks": ["A", "C"]},  # 组 1 并行
        {"id": 2, "tasks": ["B"]},       # 组 2 等待组 1
        {"id": 3, "tasks": ["D"]}        # 组 3 等待组 2
    ]
}

# 限流并发 - 适合资源受限场景
strategy = {
    "type": "throttled",
    "max_concurrent": 3,
    "tasks": ["task1", "task2", ..., "taskN"]
}
```

---

## Step 4: 执行并发任务

### 方法 1: 使用 background_run（适合命令执行）

```python
# 启动多个后台任务
task_ids = []
for cmd in commands:
    result = background_run(command=cmd)
    task_ids.append(result["task_id"])

# 等待所有任务完成
for tid in task_ids:
    status = check_background(task_id=tid)
    while status["status"] == "running":
        time.sleep(1)
        status = check_background(task_id=tid)
```

### 方法 2: 使用 task 子代理（适合复杂任务）

```python
# 为每个独立任务创建子代理
subagents = []
for task_desc in independent_tasks:
    agent = task(
        agent_type="general-purpose",
        prompt=f"Execute this task: {task_desc}"
    )
    subagents.append(agent)

# 收集所有结果
results = []
for agent in subagents:
    # 等待子代理完成并获取结果
    results.append(agent.result)
```

### 方法 3: 混合模式（推荐）

```python
# 对于 I/O 密集型任务使用 background_run
# 对于 CPU 密集型或复杂逻辑使用 task 子代理

io_tasks = ["download_file", "read_large_csv", "api_call"]
cpu_tasks = ["data_analysis", "model_training"]

# 并行执行 I/O 任务
io_ids = [background_run(command=t) for t in io_tasks]

# 并行执行 CPU 任务
cpu_agents = [task(agent_type="general-purpose", prompt=t) for t in cpu_tasks]
```

### 执行监控

```python
def monitor_tasks(task_ids):
    """监控所有任务进度"""
    progress = {}
    while True:
        all_done = True
        for tid in task_ids:
            status = check_background(task_id=tid)
            progress[tid] = status
            if status["status"] != "completed":
                all_done = False
        if all_done:
            break
        time.sleep(2)
    return progress
```

---

## Step 5: 汇总执行结果

### 结果收集

```python
def collect_results(task_ids):
    """收集所有任务的结果"""
    results = {
        "success": [],
        "failed": [],
        "output": {}
    }
    
    for tid in task_ids:
        status = check_background(task_id=tid)
        if status["status"] == "completed":
            results["success"].append(tid)
            results["output"][tid] = status.get("output")
        else:
            results["failed"].append({
                "task_id": tid,
                "error": status.get("error")
            })
    
    return results
```

### 结果合并策略

| 输出类型 | 合并方式 |
|----------|----------|
| 文件输出 | 按任务名组织目录结构 |
| 数据输出 | 合并为统一 JSON/CSV |
| 日志输出 | 按任务分组合并 |
| 错误信息 | 单独汇总便于调试 |

### 结果报告格式

```markdown
## 并发执行结果汇总

### 执行概况
- 总任务数：10
- 成功：9
- 失败：1
- 总耗时：45 秒（串行预计 180 秒）
- 加速比：4x

### 成功任务
| 任务 | 状态 | 输出 |
|------|------|------|
| Task A | ✅ | output_a.csv |
| Task B | ✅ | output_b.csv |

### 失败任务
| 任务 | 错误原因 |
|------|----------|
| Task C | 文件不存在 |

### 建议
- 失败任务可重试
- 下次可增加并发度至 5
```

---

## 完整示例流程

### 场景：批量处理 10 个数据文件

```
1. 分析任务
   - 输入：data_01.csv ~ data_10.csv
   - 操作：每个文件独立处理生成报告
   - 依赖：无
   - 结论：可完全并行

2. 制定策略
   - 并发模式：parallel
   - 最大并发：5（避免资源耗尽）
   - 错误处理：继续执行其他任务

3. 执行
   - 启动 5 个后台任务
   - 监控进度
   - 完成后启动下一批

4. 汇总
   - 合并所有报告
   - 生成执行摘要
```

---

## 常见问题

### Q: 如何确定最大并发数？

A: 考虑以下因素：
- **CPU 核心数**: CPU 密集型任务不超过核心数
- **内存限制**: 每个任务内存 × 并发数 < 可用内存
- **I/O 带宽**: 网络/磁盘 I/O 密集型可适当增加
- **外部 API 限制**: 遵守 rate limit

建议默认值：
- CPU 密集型：`min(4, CPU 核心数)`
- I/O 密集型：`10-20`
- 混合负载：`4-8`

### Q: 如何处理任务失败？

A: 
1. **隔离失败**: 确保单个任务失败不影响其他任务
2. **重试机制**: 对可恢复错误自动重试（最多 3 次）
3. **错误汇总**: 所有任务完成后统一报告错误
4. **部分成功**: 接受部分成功的结果

### Q: 并发执行会影响结果一致性吗？

A: 
- **读操作**: 安全
- **写操作**: 需要确保写入不同文件或加锁
- **共享状态**: 避免共享可变状态，使用消息传递

---

## 依赖工具

本技能主要使用以下工具：

| 工具 | 用途 |
|------|------|
| `background_run` | 执行后台命令 |
| `check_background` | 检查后台任务状态 |
| `task` | 创建子代理处理复杂任务 |
| `TodoWrite` | 跟踪并发任务进度 |

无需额外安装依赖包。

---

## 最佳实践

### 1. 先分析再执行
不要盲目并发，先花 10% 的时间分析依赖关系。

### 2. 渐进式增加并发度
从低并发开始，逐步增加直到找到最优值。

### 3. 添加超时保护
```python
result = background_run(command=cmd, timeout=300)  # 5 分钟超时
```

### 4. 记录执行日志
便于调试和性能分析。

### 5. 清理资源
并发任务完成后，及时清理临时文件和进程。

---

## 性能优化建议

| 优化点 | 建议 |
|--------|------|
| 任务分组 | 相似任务分到同一组减少上下文切换 |
| 资源预热 | 提前加载共享资源到内存 |
| 批量 I/O | 合并小文件读写为大块操作 |
| 结果缓存 | 重复任务使用缓存结果 |
| 动态调整 | 根据系统负载动态调整并发数 |
