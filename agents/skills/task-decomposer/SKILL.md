---
name: task-decomposer
description: "Use this skill when you need to break down a user's complex task into a structured todo list, identify relevant skills, and suggest parallel execution or subagent strategies. This skill helps agents efficiently plan and execute multi-step tasks."
license: Proprietary
---

# Task Decomposer Skill

## Quick Reference

| Task | Guide |
|------|-------|
| 分析用户任务 | 理解任务目标、范围和约束 |
| 识别相关技能 | 从18个可用技能中匹配相关技能 |
| 任务拆解 | 将复杂任务分解为可执行的子任务 |
| 并行化建议 | 识别可并行执行的任务模块 |
| Subagent建议 | 识别可委托给子agent的独立模块 |
| 生成TodoList | 使用 TodoWrite 创建结构化任务列表 |

---

## 核心原则

> ⚠️ **关键**: 任务拆解的目标是**最小化串行步骤，最大化并行/委托机会**。

### 任务拆解黄金法则

| 原则 | 描述 |
|------|------|
| 独立性 | 每个子任务应尽可能独立，不依赖其他子任务的结果 |
| 可并行性 | 优先识别可以并行执行的任务模块 |
| 可委托性 | 识别可以委托给subagent的独立功能模块 |
| 技能匹配 | 优先使用现有的18个Skills来处理对应任务 |

---

## 可用技能参考

以下是系统中的18个技能，拆解任务时应优先考虑使用这些技能：

| Skill名称 | 适用场景 |
|-----------|----------|
| algorithmic-art |  algorithmic-art: 编程生成艺术、算法艺术、流场、粒子系统 |
| brand-guidelines | 品牌视觉设计、企业配色和字体规范 |
| canvas-design |  canvas-design: 海报、艺术设计、静态视觉作品 |
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
接收用户任务 → 分析任务类型 → 识别相关技能 → 拆解子任务 → 标记并行/委托机会 → 生成TodoList
```

---

## Step 1: 分析用户任务

### 理解任务类型

| 任务类型 | 特征 | 典型技能 |
|----------|------|----------|
| 文档类 | 创建报告、提案、文档 | docx, pdf, pptx, doc-coauthoring |
| 设计类 | 视觉设计、界面、海报 | canvas-design, frontend-design, theme-factory |
| 代码类 | 编程、API、工具开发 | code-comment, mcp-builder, web-artifacts-builder |
| 数据类 | 数据处理、表格、分析 | xlsx, pdf |
| 艺术类 | 生成艺术、动画 | algorithmic-art, slack-gif-creator, canvas-design |
| 测试类 | 测试、验证、调试 | webapp-testing |
| 沟通类 | 内部通讯、更新 | internal-comms |

### 关键问题

1. **任务目标是什么？** - 最终交付物是什么？
2. **涉及哪些文件类型？** - docx? pdf? xlsx? 代码？
3. **任务是否可以拆分？** - 有哪些独立的子模块？
4. **是否有依赖关系？** - 哪些任务必须按顺序执行？

---

## Step 2: 识别相关技能

### 技能匹配原则

> 🎯 **优先使用现有技能**: 不要重复造轮子，先从18个技能中匹配！

### 匹配步骤

1. **文件类型匹配**: 根据输入/输出文件类型选择技能
   - .docx → docx
   - .pdf → pdf
   - .xlsx/.csv → xlsx
   - .pptx → pptx

2. **任务场景匹配**: 根据任务性质选择技能
   - 生成艺术 → algorithmic-art
   - 前端开发 → frontend-design
   - 代码注释 → code-comment
   - 文档协作 → doc-coauthoring
   - 批量处理 → concurrent-execution

3. **组合匹配**: 复杂任务可能需要多个技能组合

---

## Step 3: 任务拆解与标记

### 任务类型标记

为每个子任务标记其特征：

| 标记 | 含义 | 说明 |
|------|------|------|
| 🔄 串行 | 必须按顺序执行 | 有依赖关系，必须等待前置任务完成 |
| ⚡ 并行 | 可并行执行 | 多个任务可以同时进行 |
| 👤 委托 | 可委托给subagent | 独立模块，可创建子agent执行 |
| 🎯 技能 | 有对应技能 | 可使用现有技能处理 |

### 拆解模式

#### 模式1: 顺序依赖
```
Task A → Task B → Task C
```
标记: 全部为 🔄 串行

#### 模式2: 部分并行
```
    Task B ──┐
             ├──→ Task D
Task A → C ──┘
```
标记: A,C 为 🔄 串行；B,D 为 ⚡ 并行

#### 模式3: 完全并行
```
Task A ──┐
Task B ──┼──→ Result
Task C ──┘
```
标记: A,B,C 全部 ⚡ 并行

#### 模式4: 委托模式
```
Main Agent
    ├──→ Subagent 1 (Task A, B)
    ├──→ Subagent 2 (Task C, D)
    └──→ Task E (自己执行)
```
标记: A,B 为 👤 委托；C,D 为 👤 委托；E 为 🔄 串行

---

## Step 4: 生成TodoList

### 使用 TodoWrite 创建任务列表

```python
TodoWrite(items=[
    {"content": "子任务描述", "status": "pending", "activeForm": "执行中..."},
    ...
])
```

### TodoList结构建议

| 任务项 | 状态 | 说明 |
|--------|------|------|
| 任务A | pending | 技能: xxx, 类型: 串行/并行/委托 |
| 任务B | pending | 技能: xxx, 类型: 串行/并行/委托 |

---

## 示例拆解

### 示例1: "帮我创建一个品牌宣传PPT"

**分析:**
- 文件类型: .pptx
- 任务场景: 演示文稿
- 相关技能: pptx, brand-guidelines, canvas-design

**拆解:**
1. 🎯 收集品牌素材 - 串行
2. ⚡ 撰写PPT内容 (pptx) - 可并行设计
3. ⚡ 设计PPT视觉 (canvas-design + brand-guidelines) - 可并行
4. ⚡ 制作PPT (pptx) - 实际执行可以并行准备内容与设计

**TodoList:**
```
[
    {"content": "收集品牌宣传素材和内容要点", "status": "pending", "activeForm": "收集品牌宣传素材..."},
    {"content": "使用pptx技能创建PPT框架和内容", "status": "pending", "activeForm": "创建PPT内容..."},
    {"content": "使用canvas-design和brand-guidelines设计视觉风格", "status": "pending", "activeForm": "设计视觉风格..."},
    {"content": "使用pptx技能完成最终PPT制作", "status": "pending", "activeForm": "制作最终PPT..."}
]
```

### 示例2: "分析这个PDF并生成Excel报告"

**分析:**
- 输入: PDF文件
- 输出: Excel报告
- 相关技能: pdf, xlsx, concurrent-execution

**拆解:**
1. 🎯 提取PDF内容 (pdf) - 串行，必须先读取
2. ⚡ 分析数据结构 (并行处理不同章节) - 可并行
3. 🎯 生成Excel报告 (xlsx) - 串行，必须等分析完成

**TodoList:**
```
[
    {"content": "使用pdf技能读取并提取PDF内容", "status": "pending", "activeForm": "读取PDF内容..."},
    {"content": "使用xlsx技能创建数据表格结构", "status": "pending", "activeForm": "创建表格结构..."},
    {"content": "分析提取的内容并整理成数据", "status": "pending", "activeForm": "分析并整理数据..."},
    {"content": "使用xlsx技能生成最终Excel报告", "status": "pending", "activeForm": "生成Excel报告..."}
]
```

### 示例3: "创建一个数据可视化网页应用"

**分析:**
- 任务: Web应用开发
- 相关技能: frontend-design, web-artifacts-builder, xlsx, algorithmic-art

**拆解 (推荐使用subagent):**
1. 🔄 数据处理模块 (委托给subagent处理xlsx)
2. ⚡ 可视化逻辑 (委托给subagent处理algorithmic-art)
3. 🔄 前端界面 (主agent执行，使用frontend-design)
4. 🔄 集成测试 (webapp-testing)

**TodoList:**
```
[
    {"content": "使用xlsx技能处理数据，准备可视化数据源", "status": "pending", "activeForm": "处理数据..."},
    {"content": "使用algorithmic-art或canvas-design设计可视化方案", "status": "pending", "activeForm": "设计可视化..."},
    {"content": "使用frontend-design/web-artifacts-builder构建前端界面", "status": "pending", "activeForm": "构建前端界面..."},
    {"content": "使用webapp-testing进行集成测试", "status": "pending", "activeForm": "进行集成测试..."}
]
```

---

## 并行执行建议

### 何时使用并行

| 场景 | 示例 |
|------|------|
| 多个独立文件处理 | 同时处理多个.pdf文件 → 使用concurrent-execution |
| 多技能组合 | 内容撰写 + 视觉设计可并行 |
| 批量操作 | 批量生成缩略图、批量转换格式 |

### 如何实现并行

1. **使用 concurrent-execution skill**: 分析任务并行机会
2. **使用 spawn_teammate**: 创建并行工作的队友
3. **使用 background_run**: 后台执行长时间任务

---

## Subagent委托建议

### 何时使用Subagent

| 场景 | 示例 |
|------|------|
| 独立功能模块 | 数据处理模块、报告生成模块 |
| 长时间任务 | 不阻塞主流程的后续任务 |
| 专业领域 | 需要特定技能的专业任务 |

### 如何使用Subagent

1. **使用 spawn_teammate**: 创建持久化子agent
2. **使用 task + agent_type="Explore"**: 创建一次性探索任务
3. **使用 task + agent_type="general-purpose"**: 创建通用任务代理

### 委托模式示例

```
主Agent任务: 复杂项目报告

拆解:
├── Subagent "数据分析师" → 处理数据 + 生成xlsx
├── Subagent "文档写手" → 撰写内容 + 生成docx  
└── 主Agent → 整合成最终pptx报告
```

---

## 总结

| 步骤 | 操作 | 输出 |
|------|------|------|
| 1. 分析 | 理解任务类型、文件、目标 | 任务概述 |
| 2. 匹配 | 从18个技能中选择相关技能 | 技能列表 |
| 3. 拆解 | 分解为独立子任务 | 子任务列表 |
| 4. 标记 | 标记串行/并行/委托 | 任务类型 |
| 5. 生成 | 使用TodoWrite创建任务列表 | TodoList |

> 💡 **提示**: 复杂任务可以先创建一个粗粒度的todo，然后在执行过程中不断细化！