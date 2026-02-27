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
2. Mapping each step to the most appropriate skill
3. Identifying opportunities for parallel execution
4. Determining when to use subagents for isolated work
5. Creating organized output structures

## Core Workflow

### Phase 1: Task Analysis
1. **Understand the Goal**: What is the user trying to accomplish?
2. **Identify Constraints**: Are there deadlines, format requirements, or specific tools needed?
3. **Determine Dependencies**: What steps must happen before others?
4. **Assess Complexity**: Is this a single-step task or multi-phase project?

### Phase 2: Skill Mapping
Map each task component to the appropriate skill. Use the skill reference below.

### Phase 3: Execution Planning
1. **Sequential Steps**: Steps that must happen in order
2. **Parallel Opportunities**: Steps that can run concurrently
3. **Delegation Candidates**: Tasks suitable for subagents

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

# Skill Reference Guide

## Document & Content Creation

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

## Research & Information Gathering

### web-browsing
**Trigger**: User mentions research, literature review, finding papers, downloading code, gathering news, analyzing reports, or navigating multiple web pages
**Purpose**: Browse the web for research purposes
**Key Features**:
- **Academic paper research**: Finding, reading, summarizing papers from arXiv, Google Scholar, journal websites
- **Code download**: Finding repositories on GitHub, GitLab, downloading code samples from documentation
- **News research**: Gathering current events from news websites, press releases, blogs
- **Research report analysis**: Financial reports, industry analysis, market research from institutional websites
- **Multi-hop web browsing**: Following citation chains, tracing information sources, comprehensive information gathering

**Best Practices**:
- Use for any task requiring external information
- Combine with other skills for document creation from research
- Track sources for citations

### task-decomposer
**Trigger**: Complex multi-step tasks requiring planning and organization
**Purpose**: Break down tasks, identify skills, plan execution
**Self-Reference**: Use this skill recursively for complex projects with multiple phases

---

## Visual & Creative Content

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

## Technical & Development

### mcp-builder
**Trigger**: Building MCP servers to integrate external APIs or services
**Purpose**: Create high-quality Model Context Protocol servers
**Key Features**:
- Python (FastMCP) implementations
- Node/TypeScript (MCP SDK) implementations
- Tool design for LLM external service interaction

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

## Skill Creation & Optimization

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

## Parallel Execution

### concurrent-execution
**Trigger**: User mentions parallel tasks, concurrent execution, batch processing, multiple independent operations, or when you identify opportunities to speed up work
**Purpose**: Analyze tasks for parallel execution opportunities
**Key Features**:
- Task concurrency analysis
- Parallel execution strategies
- Batch processing optimization
- Efficiency maximization

---

# Decision Tree for Skill Selection

```
User Request
    │
    ├── Contains file reference?
    │   ├── .docx, Word → docx
    │   ├── .pptx, slides, deck → pptx
    │   ├── .pdf → pdf
    │   ├── .xlsx, .csv, spreadsheet → xlsx
    │   └── No file → Continue
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

---

# Best Practices

## Always
- Create organized folder structure in `data/`
- Identify parallel execution opportunities
- Map each step to specific skills
- Consider subagent delegation for isolated tasks
- Document sources and assumptions

## Never
- Start complex tasks without decomposition
- Ignore existing skill capabilities
- Hardcode values in spreadsheets (use formulas)
- Copy existing artists' work (create original content)
- Use wrong skill for file type (e.g., pdf skill for .xlsx)

## Quality Checks
- Verify all formula errors are resolved (xlsx)
- Confirm research sources are cited
- Ensure visual designs are original
- Test web applications before delivery
- Review document formatting consistency

---

# Subagent Delegation Guidelines

Use `task` (subagent) for:
- Isolated research tasks
- Independent data processing
- Single-skill focused work
- Tasks with clear success criteria

Use `spawn_teammate` for:
- Long-running autonomous work
- Tasks requiring ongoing coordination
- Complex multi-phase projects
- Work needing persistent state

Use `concurrent-execution` skill for:
- Batch processing
- Multiple independent file operations
- Parallel research queries
- Simultaneous format generation

---

# Integration with web-browsing

The web-browsing skill is critical for research-heavy tasks. Key integration patterns:

### Research → Document Pipeline
```
web-browsing (gather info) → doc-coauthoring/pptx/docx (create content)
```

### Research → Data Pipeline
```
web-browsing (collect data) → xlsx (analyze/model) → pptx (present)
```

### Multi-Hop Research
```
web-browsing (find sources) → web-browsing (follow citations) → web-browsing (verify claims)
```

### Code Research
```
web-browsing (find GitHub repos) → web-browsing (download code) → code-comment (document)
```

Always cite sources gathered via web-browsing in final deliverables.
