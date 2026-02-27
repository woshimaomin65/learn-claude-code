---
name: task-decomposer
description: "Use this skill when you need to break down a user's complex task into a structured todo list, identify relevant skills, and suggest parallel execution or subagent strategies. This skill helps agents efficiently plan and execute multi-step tasks. ALWAYS create a task folder in data/ directory to save final results after completing the user's request."
license: Proprietary. LICENSE.txt has complete terms
---

# Task Decomposer Skill

This skill provides a systematic approach to breaking down complex tasks into actionable steps, identifying the right skills for each step, and optimizing execution through parallel processing and subagent delegation.

## Purpose

To enable efficient task execution by:
1. Analyzing user requests to identify all required steps
2. Mapping each step to the most appropriate skill or MCP tool
3. Identifying opportunities for parallel execution
4. Determining when to use subagents for isolated work
5. Creating organized output structures

## Core Workflow

### Phase 1: Task Analysis
1. **Understand the Goal**: What is the user trying to accomplish?
2. **Identify Constraints**: Are there deadlines, format requirements, or specific tools needed?
3. **Determine Dependencies**: What steps must happen before others?
4. **Assess Complexity**: Is this a single-step task or multi-phase project?

### Phase 2: Skill & MCP Mapping
Map each task component to the appropriate skill or MCP tool. Use the reference below.

### Phase 3: Execution Planning
1. **Sequential Steps**: Steps that must happen in order
2. **Parallel Opportunities**: Steps that can run concurrently
3. **Delegation Candidates**: Tasks suitable for subagents or teammates

### Phase 4: Output Organization
ALWAYS create a task folder in `data/` directory:
```
data/{task-name}-{date}/
├── README.md          # Task overview and status
├── inputs/            # Source materials
├── outputs/           # Final deliverables
├── work/              # Intermediate files
└── assets/            # Images, templates, etc.
```

---

# Skill & MCP Reference Guide

## 🏗️ Architecture & Large Project Programming

### architecture-master (REQUIRED FOR ALL CODING TASKS)
**Trigger**: ANY task that involves writing code, building systems, migrating projects between languages, designing system architecture, performing major refactoring, creating new files with code, or modifying existing code
**Purpose**: World-class software architect and multi-language expert for commanding ALL programming projects (from simple scripts to complex systems)
**Key Features**:
- **Architecture Design**: Scalable, maintainable, high-performance system architecture
- **Multi-Language Expert**: Python, JavaScript/TypeScript, Go, Rust, Java, C++ and more
- **System Migration**: Migrate systems between languages while maintaining functional equivalence
- **Code Quality**: Clean, readable, well-tested code
- **Performance Optimization**: Identify and resolve bottlenecks

**Core Principles**:
1. **Architecture First**: Design before coding
2. **Equivalent Transformation**: Maintain functional consistency during migration
3. **Incremental Building**: Iterative development approach
4. **Tool Enhancement**: Leverage MCP tools for efficiency

**Workflow**:
1. Project scanning with `get_project_map` (MCP)
2. Architecture design and planning
3. Skeleton setup with `batch_file_operation` (MCP)
4. Core implementation with `apply_incremental_edit` (MCP)
5. Verification and optimization

**Use Cases**:
- **ANY code writing task** (simple scripts to complex systems)
- New project from scratch
- Language migration (Python → TypeScript, etc.)
- Architecture refactoring
- Large-scale feature addition
- Code review and improvement suggestions

**CRITICAL**: For ANY task that involves writing code (even simple scripts like hello_world.py), you MUST load and use architecture-master skill. Do NOT write code directly without using this skill.

**Differentiator**: Combines architectural thinking with MCP tool usage for maximum efficiency

---

## 📄 Document & Content Creation

### doc-coauthoring
**Trigger**: User wants to write documentation, proposals, technical specs, decision docs, or structured content
**Purpose**: Guide users through structured workflow for co-authoring documentation
**Key Features**: 
- Efficient context transfer
- Iterative content refinement
- Reader verification

### internal-comms
**Trigger**: User needs internal communications (status reports, leadership updates, 3P updates, company newsletters, FAQs, incident reports, project updates)
**Purpose**: Write all kinds of internal communications using company-preferred formats
**Key Features**:
- Status reports
- Leadership updates
- Company newsletters
- Incident reports

### docx
**Trigger**: Any mention of 'Word doc', 'word document', '.docx', or requests for professional documents with formatting
**Purpose**: Create, read, edit, or manipulate Word documents
**Key Features**:
- Tables of contents, headings, page numbers
- Letterheads and templates
- Track changes and comments
- Image insertion/replacement
- Find-and-replace

**DO NOT use for**: PDFs, spreadsheets, Google Docs, or general coding tasks

### pptx
**Trigger**: Any mention of "deck," "slides," "presentation," or .pptx files
**Purpose**: Create, read, edit presentations and slide decks
**Key Features**:
- Creating slide decks and pitch decks
- Reading/parsing .pptx files
- Templates, layouts, speaker notes
- Combining/splitting slide files

**Note**: Use even if extracted content will be used elsewhere (email, summary)

### pdf
**Trigger**: User mentions .pdf file or asks to produce one
**Purpose**: All PDF-related operations
**Key Features**:
- Reading/extracting text and tables
- Combining/splitting/merging PDFs
- Rotating pages, adding watermarks
- Creating new PDFs, filling forms
- Encrypting/decrypting
- OCR on scanned PDFs

### xlsx
**Trigger**: Spreadsheet file is primary input or output (.xlsx, .xlsm, .csv, .tsv)
**Purpose**: Create, read, edit, or fix spreadsheet files
**Key Features**:
- Adding columns, computing formulas
- Formatting, charting, data cleaning
- Converting between tabular formats
- Restructuring messy data

**CRITICAL Requirements**:
- Use Excel formulas, NOT hardcoded values
- Zero formula errors required
- Color coding for financial models (blue=inputs, black=formulas, green=links, red=external)
- Use LibreOffice for formula recalculation via `scripts/recalc.py`

**DO NOT use for**: Word documents, HTML reports, standalone Python scripts, database pipelines

---

## 🔍 Research & Information Gathering

### web-browsing
**Trigger**: User mentions research, literature review, finding papers, downloading code, gathering news, analyzing reports, or navigating multiple web pages
**Purpose**: Browse the web for research purposes. **Core search functionality unified with `tavily-search`** for faster, AI-optimized search experience.
**Key Features**:
- **tavily-search (PRIMARY/DEFAULT)**: AI-optimized search with structured results
  - `tavily_search`: General web search (90% of search tasks)
  - `tavily_news`: News search for latest industry updates and current events
  - `tavily_fact_check`: Fact-checking and claim verification
- **Academic paper research**: Finding, reading, summarizing papers from arXiv, Google Scholar, journal websites
- **Code download**: Finding repositories on GitHub, GitLab, downloading code samples from documentation
- **News research**: Gathering current events from news websites, press releases, blogs
- **Research report analysis**: Financial reports, industry analysis, market research from institutional websites
- **Multi-hop web browsing**: Following citation chains, tracing information sources, comprehensive information gathering

**⚠️ CRITICAL: Time Expression Sensitivity**
When users use relative time expressions, the system **automatically converts them to specific dates**:
- **今天/今日/today** → Current date (e.g., "2025 年 01 月 27 日")
- **昨天/昨日/yesterday** → 1 day ago
- **最近/近期/recent** → Last 7 days (default)
- **最近一周/last week** → Last 7 days
- **最近一个月/last month** → Last 30 days
- **本周/this week** → Since Monday of this week
- **本月/this month** → Since 1st of current month

**Why this matters**: 
- ❌ NEVER return outdated information when user asks about "today"
- ✅ ALWAYS ensure search queries include specific dates for time-sensitive queries
- Example: "今天的金价" → searches "2025 年 01 月 27 日的金价" (not just "今天的金价")

**Tool Selection Decision Tree**:
```
Need web information?
    │
    ├── Search/Research/Fact-check?
    │   └──→ ✅ tavily-search (PRIMARY)
    │       ├── tavily_search - General search
    │       ├── tavily_news - News search
    │       └── tavily_fact_check - Fact verification
    │
    ├── Fetch known URL content?
    │   ├── Static page/API
    │   │   └──→ ⚠️ mcp-fetch (BACKUP - deprecated)
    │   │
    │   └── Dynamic page/screenshot/interaction?
    │       └──→ ⚠️ browser-mcp (SPECIAL CASES ONLY)
    │
    └── Real-time data (stocks/weather)?
        ├── Has official API
        │   └──→ ⚠️ mcp-fetch fetch_json
        │
        └── No API, need web scraping
            └──→ Try tavily_search first (may have cache)
```

**Best Practices**:
- **DEFAULT to tavily-search** for 90% of search tasks (faster, AI-optimized, structured results)
- **ALWAYS recognize relative time expressions** and understand they will be auto-converted to specific dates
- Use mcp-fetch ONLY for known URL content fetching or API calls (being deprecated)
- Use browser-mcp ONLY for screenshots, interaction, or JavaScript-rendered pages (resource-intensive)
- Combine with other skills for document creation from research
- Track sources for citations

**Performance Comparison**:
| Tool | Speed | Resource | Result Quality | Use Case |
|------|-------|----------|----------------|----------|
| tavily-search | ⚡ Fast (1-3s) | 💚 Low | ⭐⭐⭐⭐⭐ AI-optimized | 90% search tasks |
| mcp-fetch | ⚡ Fast (1-2s) | 💚 Low | ⭐⭐⭐ Raw content | Known URLs, APIs |
| browser-mcp | 🐌 Slow (5-15s) | 🔴 High | ⭐⭐⭐⭐ Full content | Screenshots, interaction |

---

## 🎨 Visual & Creative Content

### frontend-design
**Trigger**: User asks to build web components, pages, artifacts, dashboards, React components, HTML/CSS layouts, or styling/beautifying web UI
**Purpose**: Create distinctive, production-grade frontend interfaces
**Key Features**:
- Websites and landing pages
- Dashboards and data visualizations
- React components
- HTML/CSS layouts
- Creative, polished UI design

**Differentiator**: Avoids generic AI aesthetics, produces high design quality

### web-artifacts-builder
**Trigger**: Complex artifacts requiring state management, routing, or shadcn/ui components
**Purpose**: Create elaborate, multi-component claude.ai HTML artifacts
**Key Features**:
- React with modern frontend technologies
- Tailwind CSS styling
- shadcn/ui components
- State management
- Routing

**DO NOT use for**: Simple single-file HTML/JSX artifacts (use frontend-design instead)

### algorithmic-art
**Trigger**: User requests creating art using code, generative art, algorithmic art, flow fields, or particle systems
**Purpose**: Create algorithmic art using p5.js with seeded randomness
**Key Features**:
- Seeded randomness for reproducibility
- Interactive parameter exploration
- Original algorithmic art (never copying existing artists)

### canvas-design
**Trigger**: User asks to create a poster, piece of art, design, or static piece
**Purpose**: Create beautiful visual art in .png and .pdf documents
**Key Features**:
- Original visual designs
- Print-ready outputs
- Design philosophy application

### slack-gif-creator
**Trigger**: User requests animated GIFs for Slack like "make me a GIF of X doing Y for Slack"
**Purpose**: Create animated GIFs optimized for Slack
**Key Features**:
- Emoji GIFs (128x128) and message GIFs (480x480)
- Optimization for file size
- PIL-based drawing primitives
- Easing functions for smooth motion

### brand-guidelines
**Trigger**: Any artifact that may benefit from Anthropic's look-and-feel, brand colors, or style guidelines
**Purpose**: Apply Anthropic's official brand colors and typography
**Key Features**:
- Official brand colors
- Typography standards
- Visual formatting guidelines

### theme-factory
**Trigger**: Styling artifacts with themes (slides, docs, reportings, HTML landing pages)
**Purpose**: Apply consistent professional themes to artifacts
**Key Features**:
- 10 pre-set themes with colors/fonts
- Custom theme generation
- Application to any artifact type

---

## 💻 Technical & Development

### mcp-builder
**Trigger**: Building MCP servers to integrate external APIs or services
**Purpose**: Create high-quality Model Context Protocol servers
**Key Features**:
- Python (FastMCP) implementations
- Node/TypeScript (MCP SDK) implementations
- Tool design for LLM external service interaction

### mcp-expert-programmer (NEW - MCP Tool)
**Trigger**: Large project programming, architecture analysis, code transformation, batch file operations
**Purpose**: Expert-level programming MCP providing project architecture scanning, incremental editing, and batch file operations
**Tools**:
- `get_project_map`: Scan project directory structure, generate architecture diagrams
- `apply_incremental_edit`: Precise SEARCH/REPLACE editing with regex support
- `batch_file_operation`: Batch create/delete/move/copy/modify operations

**Use Cases**:
- Understanding new project structure
- Code refactoring
- Project scaffolding
- Large-scale migration
- Batch file operations

### webapp-testing
**Trigger**: Testing local web applications, verifying frontend functionality
**Purpose**: Interact with and test web applications using Playwright
**Key Features**:
- Frontend functionality verification
- UI behavior debugging
- Browser screenshots
- Browser logs viewing

### code-comment
**Trigger**: Need to add detailed Chinese comments to Python code files
**Purpose**: Add comments while preserving original code structure
**Key Features**:
- Chinese language comments
- Preserves original code (never modifies)
- Detailed documentation

---

## 🛠️ Skill Creation & Optimization

### skill-creator
**Trigger**: Users want to create a skill from scratch, update/optimize existing skills, run evals, or benchmark performance
**Purpose**: Create, modify, and measure skill performance
**Key Features**:
- Create skills from scratch
- Update and optimize existing skills
- Run evals to test skills
- Benchmark performance with variance analysis
- Optimize skill descriptions for triggering accuracy

---

## ⚡ Parallel Execution

### concurrent-execution
**Trigger**: User mentions parallel tasks, concurrent execution, batch processing, multiple independent operations, or when you identify opportunities to speed up work
**Purpose**: Analyze tasks for parallel execution opportunities
**Key Features**:
- Task concurrency analysis
- Parallel execution strategies
- Batch processing optimization
- Efficiency maximization

---

# Decision Tree for Skill & MCP Selection

```
User Request
    │
    ├── Contains code writing task? (ANY code: simple scripts, new files, modifications)
    │   ├── Yes → architecture-master (REQUIRED for ALL coding tasks)
    │   └── No → Continue
    │
    ├── Contains file reference?
    │   ├── .docx, Word → docx
    │   ├── .pptx, slides, deck → pptx
    │   ├── .pdf → pdf
    │   ├── .xlsx, .csv, spreadsheet → xlsx
    │   └── No file → Continue
    │
    ├── Project analysis / Code transformation needed?
    │   ├── Scan project structure → mcp-expert-programmer (get_project_map)
    │   ├── Incremental code edit → mcp-expert-programmer (apply_incremental_edit)
    │   ├── Batch file operations → mcp-expert-programmer (batch_file_operation)
    │   └── No → Continue
    │
    ├── Research/Information needed?
    │   ├── Papers, literature → web-browsing (academic)
    │   ├── Code, repositories → web-browsing (code download)
    │   ├── News, current events → web-browsing (news)
    │   ├── Reports, analysis → web-browsing (reports)
    │   └── No research → Continue
    │
    ├── Visual/Creative output?
    │   ├── Web UI, dashboard → frontend-design
    │   ├── Complex web app → web-artifacts-builder
    │   ├── Generative/code art → algorithmic-art
    │   ├── Poster, static design → canvas-design
    │   ├── Slack GIF → slack-gif-creator
    │   └── Styling needed → theme-factory or brand-guidelines
    │
    ├── Documentation/Communication?
    │   ├── Internal comms → internal-comms
    │   ├── Collaborative doc → doc-coauthoring
    │   └── Technical doc → doc-coauthoring
    │
    └── Technical/Development?
        ├── MCP server → mcp-builder
        ├── Web app testing → webapp-testing
        ├── Code comments (Chinese) → code-comment
        └── Skill creation → skill-creator
```

---

# Parallel Execution Analysis

Identify parallel opportunities using these patterns:

### Independent Data Processing
```
Task: Process 10 CSV files
Parallel Strategy: Use concurrent-execution to process files simultaneously
```

### Multi-Source Research
```
Task: Research competitors A, B, C
Parallel Strategy: Spawn subagents for each competitor using web-browsing
```

### Document Assembly
```
Task: Create presentation with 5 sections
Parallel Strategy: Research each section in parallel, then assemble with pptx
```

### Multi-Format Output
```
Task: Create report in Word, PDF, and presentation formats
Parallel Strategy: Generate all formats concurrently after content is ready
```

### Project Module Development
```
Task: Build multiple independent modules in a large project
Parallel Strategy: Use architecture-master to design, then spawn teammates for each module
```

---

# Examples

## Example 1: Research Report
**User**: "Research the AI coding assistant market and create a presentation"

**Decomposition**:
1. Use web-browsing to gather market data, competitor analysis, trends
2. Use concurrent-execution to research multiple sources in parallel
3. Use pptx to create the presentation
4. Use theme-factory to style the deck
5. Save all outputs to `data/ai-market-research-{date}/`

## Example 2: Financial Model
**User**: "Create a financial projection model from this data"

**Decomposition**:
1. Use xlsx to create the model with proper formulas
2. Apply color coding (blue inputs, black formulas)
3. Use scripts/recalc.py to verify zero formula errors
4. Save to `data/financial-model-{date}/`

## Example 3: Web Application
**User**: "Build a dashboard to visualize sales data"

**Decomposition**:
1. Use xlsx to process and clean sales data
2. Use web-artifacts-builder for complex dashboard with React/Tailwind
3. Use theme-factory for consistent styling
4. Save to `data/sales-dashboard-{date}/`

## Example 4: Multi-Format Documentation
**User**: "Document our API and create user guides"

**Decomposition**:
1. Use doc-coauthoring for collaborative documentation
2. Use pdf to create downloadable guides
3. Use web-browsing if API reference research needed
4. Use docx for Word format versions
5. Save to `data/api-docs-{date}/`

## Example 5: Large Project Migration (NEW)
**User**: "Migrate this Python project to TypeScript"

**Decomposition**:
1. Load skill: architecture-master
2. Use mcp-expert-programmer (get_project_map) to scan Python project structure
3. Architecture-master designs TypeScript project architecture
4. Use mcp-expert-programmer (batch_file_operation) to create TypeScript project skeleton
5. Architecture-master guides module-by-module conversion
   - Data structure conversion
   - Function/method conversion
   - Class/interface conversion
   - Error handling conversion
6. Use mcp-expert-programmer (apply_incremental_edit) for precise code modifications
7. Verify functional equivalence
8. Save to `data/python-to-ts-migration-{date}/`

## Example 6: New System Development (NEW)
**User**: "Build a microservice-based e-commerce platform from scratch"

**Decomposition**:
1. Load skill: architecture-master
2. Architecture-master designs system architecture (microservices pattern)
3. Use mcp-expert-programmer (batch_file_operation) to create project structure
4. Spawn teammates for each service (user, product, order, payment)
5. Each teammate uses architecture-master principles for their service
6. Use concurrent-execution for parallel service development
7. Integration testing and deployment
8. Save to `data/ecommerce-platform-{date}/`

## Example 7: Codebase Refactoring (NEW)
**User**: "Refactor this legacy codebase to improve maintainability"

**Decomposition**:
1. Load skill: architecture-master
2. Use mcp-expert-programmer (get_project_map) to analyze current structure
3. Architecture-master identifies refactoring opportunities
4. Create task list with priorities
5. Use mcp-expert-programmer (apply_incremental_edit) for safe code modifications
6. Use mcp-expert-programmer (batch_file_operation) for file reorganization
7. Continuous testing after each refactoring step
8. Save to `data/refactoring-{date}/`

---

# Best Practices

## Always
- Create organized folder structure in `data/`
- Identify parallel execution opportunities
- Map each step to specific skills or MCP tools
- Consider subagent delegation for isolated tasks
- Document sources and assumptions
- For large projects, use architecture-master skill

## Never
- Start complex tasks without decomposition
- Ignore existing skill capabilities
- Hardcode values in spreadsheets (use formulas)
- Copy existing artists' work (create original content)
- Use wrong skill for file type (e.g., pdf skill for .xlsx)
- Modify code without understanding project structure first

## Quality Checks
- Verify all formula errors are resolved (xlsx)
- Confirm research sources are cited
- Ensure visual designs are original
- Test web applications before delivery
- Review document formatting consistency
- Verify architecture decisions are documented

---

# Subagent & Teammate Delegation Guidelines

## Use `task` (subagent) for:
- Isolated research tasks
- Independent data processing
- Single-skill focused work
- Tasks with clear success criteria
- Short-lived exploration work

## Use `spawn_teammate` for:
- Long-running autonomous work
- Tasks requiring ongoing coordination
- Complex multi-phase projects
- Work needing persistent state
- Module development in large projects

## Use `concurrent-execution` skill for:
- Batch processing
- Multiple independent file operations
- Parallel research queries
- Simultaneous format generation

## Use architecture-master for:
- Large-scale project planning
- Language migration projects
- System architecture design
- Major refactoring efforts
- Multi-language development

---

# Integration Patterns

## architecture-master + mcp-expert-programmer Pipeline
```
architecture-master
    ├── get_project_map (scan structure)
    ├── Design architecture
    ├── batch_file_operation (create skeleton)
    ├── apply_incremental_edit (implement)
    └── Verify & optimize
```

## Research → Document Pipeline
```
web-browsing (gather info) → doc-coauthoring/pptx/docx (create content)
```

## Research → Data Pipeline
```
web-browsing (collect data) → xlsx (analyze/model) → pptx (present)
```

## Multi-Hop Research
```
web-browsing (find sources) → web-browsing (follow citations) → web-browsing (verify claims)
```

## Code Research & Documentation
```
web-browsing (find GitHub repos) → web-browsing (download code) → code-comment (document)
```

## Project Analysis → Refactoring Pipeline
```
mcp-expert-programmer (get_project_map) → architecture-master (analyze) → mcp-expert-programmer (apply_incremental_edit)
```

Always cite sources gathered via web-browsing in final deliverables.

---

# MCP Tools Quick Reference

## mcp-expert-programmer Tools

### get_project_map
```
Purpose: Scan project directory structure
Parameters:
  - rootPath (required): Project root directory
  - patterns (optional): File match patterns
  - ignorePatterns (optional): Patterns to ignore
  - includeContent (optional): Include file content summary
  - maxDepth (optional): Maximum scan depth
```

### apply_incremental_edit
```
Purpose: Precise SEARCH/REPLACE editing
Parameters:
  - filePath (required): Target file path
  - searchPattern (required): Text pattern to search
  - replaceText (required): Replacement text
  - useRegex (optional): Use regular expressions
  - replaceAll (optional): Replace all matches
  - dryRun (optional): Preview only
```

### batch_file_operation
```
Purpose: Batch file operations
Parameters:
  - operations (required): List of operations
    - type: create|delete|move|copy|modify
    - sourcePath: Source path (for move/copy/modify)
    - targetPath: Target path
    - content: File content (for create/modify)
    - searchPattern: Search pattern (for modify)
    - replaceText: Replace text (for modify)
  - dryRun (optional): Preview only
  - continueOnError (optional): Continue on error
```
