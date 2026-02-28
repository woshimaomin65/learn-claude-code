# Task Dialogue Meta-Skill (Meta-TOD Engine)

## Overview

This meta-skill enables **zero-shot task-oriented dialogue** systems that can adapt to any scenario without hard-coded business logic. Instead of writing fixed dialogue flows, the AI learns to **infer schemas dynamically** and generate conversation strategies on-the-fly.

## Key Features

- **Dynamic Schema Extraction**: Analyze Excel, SQL DDL, JSON schemas, or natural language descriptions
- **Automatic Slot Classification**: Hard slots, soft slots, hidden slots, derived slots
- **Adaptive Dialogue Execution**: Real-time validation and conflict detection
- **HITL Integration**: Automatic human-in-the-loop triggers for sensitive operations

## When to Use

Use this skill when you need to:
- Build conversational agents for multiple scenarios without rewriting code
- Create dialogue systems that adapt to changing database schemas
- Implement task-oriented dialogue with automatic validation
- Enable zero-shot adaptation to new business domains

## Core Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 1: Schema Introspection                              │
│  - Analyze data source (Excel, SQL, description)            │
│  - Extract fields, types, constraints                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase 2: Dynamic Slot Policy Generation                    │
│  - Classify slots (Hard/Soft/Hidden/Derived)                │
│  - Generate dialogue plan                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase 3: Adaptive Slot Filling Execution                   │
│  - Multi-turn dialogue with validation                      │
│  - Conflict detection                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase 4: HITL Validation & Write                           │
│  - Schema validation                                        │
│  - Human intervention if needed                             │
└─────────────────────────────────────────────────────────────┘
```

## Example Usage

```markdown
# Load the skill
load_skill(name="task-dialogue-meta")

# Then describe your scenario
"I have an equipment repair tracking system. Here's the table structure..."

# The AI will automatically:
# 1. Analyze the schema
# 2. Generate dialogue slots
# 3. Start adaptive conversation
```

## MCP Tools Required

| Tool | Purpose | Source |
|------|---------|--------|
| `inspect_datasource(uri)` | Read database metadata | task-dialogue-mcp |
| `validate_against_schema(data, schema)` | Validate collected slots | task-dialogue-mcp |
| `propose_human_intervention(issue, data)` | Trigger HITL when needed | task-dialogue-mcp |
| `get_data_schema(source)` | Alias for inspect_datasource | task-dialogue-mcp |
| `check_duplicate_records(data, records, threshold)` | Check for duplicates | task-dialogue-mcp |

## Setup

### 1. Install MCP Server

```bash
cd /Users/maomin/programs/vscode/learn-claude-code/agents/mcps/task-dialogue-mcp
npm install
npm run build
```

### 2. Configure MCP

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "task-dialogue": {
      "command": "node",
      "args": ["/Users/maomin/programs/vscode/learn-claude-code/agents/mcps/task-dialogue-mcp/dist/index.js"]
    }
  }
}
```

### 3. Load the Skill

```markdown
load_skill(name="task-dialogue-meta")
```

## Documentation

See [SKILL.md](./SKILL.md) for complete documentation including:
- Detailed workflow descriptions
- MCP tool specifications
- Example scenarios (Equipment Repair, Restaurant Ordering, Rental Agent)
- Python helper code for SQL DDL to JSON conversion
- Best practices and troubleshooting

## Related Skills

- **task-decomposer**: Break down complex multi-entity tasks
- **xlsx**: Read Excel-based schemas
- **mcp-builder**: Build custom MCP tools for data sources
