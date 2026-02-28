# Task Dialogue MCP Server

MCP server for task-oriented dialogue systems. Provides schema inspection, validation, and Human-in-the-Loop (HITL) intervention tools.

## Installation

```bash
npm install
npm run build
```

## Available Tools

### 1. `inspect_datasource`

Analyze a data source and extract schema including fields, types, constraints, and relationships.

**Parameters:**
- `uri` (string): Data source URI - file path, SQL DDL string, or JSON schema
- `include_relationships` (boolean, optional): Include foreign key relationships (default: true)

**Example:**
```json
{
  "uri": "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE)"
}
```

**Returns:**
```json
{
  "entity": "users",
  "fields": [
    {"name": "name", "type": "TEXT", "required": true, "unique": false},
    {"name": "email", "type": "TEXT", "required": false, "unique": true}
  ],
  "relationships": []
}
```

---

### 2. `validate_against_schema`

Validate collected slot values against a schema definition.

**Parameters:**
- `data_json` (object): Collected slot values to validate
- `schema` (object): Target schema definition with entity and fields

**Example:**
```json
{
  "data_json": {"name": "John", "email": "john@example.com"},
  "schema": {
    "entity": "users",
    "fields": [
      {"name": "name", "type": "TEXT", "required": true},
      {"name": "email", "type": "TEXT", "required": true}
    ]
  }
}
```

**Returns:**
```json
{
  "valid": true,
  "errors": [],
  "warnings": [],
  "ready_for_write": true
}
```

---

### 3. `propose_human_intervention`

Trigger Human-in-the-Loop (HITL) intervention for sensitive operations or conflicts.

**Parameters:**
- `issue_type` (string): Type of intervention needed
  - `duplicate_detection`: Similar record exists
  - `sensitive_field`: Requires human approval
  - `validation_failure`: Schema validation failed
  - `user_request`: User explicitly requested human
  - `schema_conflict`: Schema mismatch detected
- `current_data` (object): Current collected data
- `context` (object, optional): Additional context for human reviewer

**Example:**
```json
{
  "issue_type": "sensitive_field",
  "current_data": {"name": "John", "password": "secret123"},
  "context": {"reason": "Password field detected"}
}
```

**Returns:**
```json
{
  "intervention_id": "HITL-1706337000000-abc123",
  "status": "pending_review",
  "assigned_to": "human_agent_queue",
  "issue_type": "sensitive_field",
  "estimated_wait": "5 minutes"
}
```

---

### 4. `get_data_schema`

Alias for `inspect_datasource`. Analyze data structure for schema extraction.

**Parameters:**
- `source` (string): Data source - file path, SQL DDL, or JSON schema

---

### 5. `check_duplicate_records`

Check if provided data matches any existing records for duplicate detection.

**Parameters:**
- `current_data` (object): Data to check for duplicates
- `existing_records` (array): Existing records to compare against
- `threshold` (number, optional): Similarity threshold (0-1, default: 0.8)

**Example:**
```json
{
  "current_data": {"name": "John", "email": "john@example.com"},
  "existing_records": [
    {"name": "John", "email": "john@example.com", "id": 1}
  ],
  "threshold": 0.8
}
```

**Returns:**
```json
{
  "has_duplicates": true,
  "duplicate_count": 1,
  "duplicates": [
    {
      "record": {"name": "John", "email": "john@example.com", "id": 1},
      "similarity": 1.0,
      "matching_fields": ["name", "email"]
    }
  ],
  "threshold_used": 0.8
}
```

---

## Usage with Claude

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "task-dialogue": {
      "command": "node",
      "args": ["/path/to/task-dialogue-mcp/dist/index.js"]
    }
  }
}
```

## Supported Data Sources

| Source Type | Format | Example |
|-------------|--------|---------|
| SQL DDL | CREATE TABLE statement | `CREATE TABLE users (id INT, name TEXT)` |
| Excel/CSV | File path | `/path/to/data.xlsx` or `/path/to/data.csv` |
| JSON Schema | JSON string | `{"entity": "users", "fields": [...]}` |
| File Path | Absolute or relative path | `./data/rentals.csv` |

## Integration with task-dialogue-meta Skill

This MCP server is designed to work with the `task-dialogue-meta` skill:

```markdown
# Load the skill
load_skill(name="task-dialogue-meta")

# The skill will automatically use these MCP tools:
# - inspect_datasource: To analyze your data structure
# - validate_against_schema: To validate collected information
# - propose_human_intervention: To trigger human review when needed
```

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run server
npm start

# Development mode with watch
npm run watch
```

## License

MIT
