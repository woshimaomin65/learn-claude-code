---
name: task-dialogue-meta
description: "Use this skill when you need to build dynamic task-oriented dialogue systems that can adapt to any scenario. This meta-skill enables zero-shot TOD (Task-Oriented Dialogue) by inferring schemas from user descriptions or data structures, then dynamically generating dialogue flows. Perfect for building conversational agents that need to handle multiple scenarios without hard-coded logic. **v2.0**: Now includes full conversation state management, user confirmation, interruption handling, and dialogue history tracking. Requires task-dialogue-mcp server."
license: Proprietary. LICENSE.txt has complete terms
---

# Task Dialogue Meta-Skill v2.0 (Meta-TOD Engine)

**Version 2.0 Enhancements:**
- ✅ **Dialogue State Management**: Track conversation progress with `dialogue_state_create/update/get`
- ✅ **User Confirmation**: Built-in confirmation workflow with `user_confirm/response`
- ✅ **Interruption Handling**: Detect and recover from user interruptions with `handle_interruption`
- ✅ **Dialogue History**: Full conversation tracking with `dialogue_history_add/get`
- ✅ **Action Recommendations**: AI-powered next step suggestions with `next_action_recommend`

This skill provides a systematic approach to building **dynamic task-oriented dialogue systems** that can adapt to any scenario without hard-coded business logic. Instead of writing fixed dialogue flows, the AI learns to **infer schemas dynamically** and generate conversation strategies on-the-fly.

## Purpose

To enable flexible, schema-aware dialogue systems by:
1. **Analyzing data structures** (Excel, SQL, descriptions) to extract field definitions
2. **Generating dynamic slot policies** based on database constraints
3. **Executing adaptive multi-turn dialogues** with real-time validation
4. **Triggering HITL (Human-in-the-Loop)** for sensitive operations or conflicts

## Core Philosophy

> **"Don't write business logic in code. Write business logic in metadata."**

The MCP tools act as couriers, transferring database constraints to the AI. The AI transforms these constraints into natural dialogue.

---

## Core Workflow: DYNAMIC_SCHEMA_ORCHESTRATOR

### Phase 1: Schema Introspection (逆向工程)

When user provides a data source or defines a new scenario, the system performs introspection.

**Input:**
- Excel/CSV files
- SQL DDL statements
- Natural language descriptions (e.g., "I want to build a rental agent")
- JSON schemas

**Actions:**
1. Call `inspect_datasource` MCP tool to analyze structure
2. Extract **Field names**, **Types**, **Constraints** (required/unique/default)
3. Identify **Enum values** and **Distinct values** for suggestion options

**Output:**
```json
{
  "entity": "rental_listing",
  "fields": [
    {"name": "location", "type": "string", "required": true, "enum": null},
    {"name": "price_range", "type": "string", "required": true, "enum": ["low", "mid", "high"]},
    {"name": "has_balcony", "type": "boolean", "required": false, "default": false},
    {"name": "status", "type": "string", "required": true, "default": "Pending"}
  ]
}
```

---

### Phase 2: Dynamic Slot Policy Generation (槽位策略生成)

Based on Phase 1 structure, AI automatically generates dialogue logic.

**Inference Logic:**
> "To write a rental record to the database, I must first acquire `location` and `price_range`."

**Slot Classification:**

| Slot Type | Description | Example | Dialogue Strategy |
|-----------|-------------|---------|-------------------|
| **Hard Slots** | Non-nullable DB fields | `location`, `price_range` | Must ask, validate strictly |
| **Soft Slots** | Optional fields for precision | `has_balcony`, `floor_preference` | Ask if relevant, can skip |
| **Hidden Slots** | Auto-filled fields | `status`, `created_at` | Never ask, use defaults |
| **Derived Slots** | Computed from other sources | `user_level` | Retrieve from other tables |

**Dialogue Plan Generation:**
```markdown
## Dialogue Execution Plan

- **Total Fields:** 5
- **Must Ask:** 3 (location, price_range, contact)
- **Optional:** 1 (has_balcony)
- **Auto-fill:** 1 (status = 'Pending')

**Suggested Flow:**
1. Greet and explain purpose
2. Ask core slots (location, price_range) together
3. Ask optional slot if user seems engaged
4. Confirm all collected info before submission
```

---

### Phase 3: Adaptive Slot Filling Execution (动态状态机执行)

Start dialogue with dynamically generated schema-based confirmation.

**Key Dialogue Patterns:**

### 1. Proactive Guidance (主动引导)
```
User: "I want to list my apartment"
AI: "Great! I can help you list your rental. To get started, I'll need:
     - The location (which district?)
     - Your price range (low/mid/high)
     - Contact information
     
     Let's begin: Which district is your apartment in?"
```

### 2. Dynamic Validation (动态校验)
```
User: "The price is 5000"
AI: "Got it, 5000. Just to confirm, is that per month? 
     And would you categorize this as 'low', 'mid', or 'high' range for your area?"
     
User: "The age is twenty-five"
AI: "I need to record age as a number. Did you mean 25?"
```

### 3. Conflict Detection & HITL Trigger
```
IF similarity(current_input, existing_records) > 80%:
    TRIGGER: propose_human_intervention(
        issue_type="duplicate_detection",
        current_data={...},
        similar_records=[...]
    )
```

---

### Phase 4: HITL Validation & Write (验证与写入)

Before final execution, validate collected data against schema.

**Pre-Write Validation:**
```json
{
  "validation_result": "pass",
  "collected_slots": {
    "location": "Haidian District",
    "price_range": "mid",
    "contact": "138xxxx1234"
  },
  "auto_filled": {
    "status": "Pending",
    "created_at": "2025-01-27T10:30:00Z"
  },
  "requires_human_review": false
}
```

**HITL Trigger Conditions:**
- Sensitive fields involved (`is_admin`, `payment_amount`, `password`)
- High similarity conflict detected
- Schema validation failed
- User requests human agent

---

## MCP Toolset: Schema-Aware Tools (v2.0 Enhanced)

### Schema Analysis Tools

### 1. `inspect_datasource(uri)` / `get_data_schema(source)`

**Purpose:** Read database metadata (DML/DDL) and extract schema

**Parameters:**
- `uri`/`source` (required): Data source URI (file path, SQL DDL string, JSON schema)
- `include_relationships` (optional): Include foreign key relationships

**Returns:**
```json
{
  "entity": "equipment_repair",
  "fields": [
    {"name": "serial_number", "type": "TEXT", "required": true, "unique": true},
    {"name": "issue_description", "type": "TEXT", "required": true},
    {"name": "urgency", "type": "TEXT", "enum": ["low", "medium", "high", "critical"]},
    {"name": "reported_by", "type": "TEXT", "required": true},
    {"name": "status", "type": "TEXT", "default": "Open"}
  ],
  "relationships": []
}
```

---

### Data Validation Tools

### 2. `validate_against_schema(data_json, schema)`

**Purpose:** Validate AI-collected slots against physical database requirements

**Parameters:**
- `data_json` (required): Collected slot values
- `schema` (required): Target schema definition with entity and fields

**Returns:**
```json
{
  "valid": true,
  "errors": [],
  "warnings": ["Field 'urgency' not provided, using default 'medium'"],
  "ready_for_write": true
}
```

---

### 3. `check_duplicate_records(current_data, existing_records, threshold)`

**Purpose:** Detect potential duplicate entries before submission

**Parameters:**
- `current_data` (required): Data to check for duplicates
- `existing_records` (required): Existing records to compare against
- `threshold` (optional): Similarity threshold (0-1), default 0.8

**Returns:**
```json
{
  "has_duplicates": true,
  "duplicate_count": 1,
  "duplicates": [
    {"record": {...}, "similarity": 0.92, "matching_fields": ["serial_number", "issue_description"]}
  ],
  "threshold_used": 0.8
}
```

---

### Conversation State Management (NEW v2.0)

### 4. `dialogue_state_create(entity, schema, initial_slots, metadata)`

**Purpose:** Initialize a new dialogue session with slot classification and state tracking

**Parameters:**
- `entity` (required): Entity/domain name (e.g., "equipment_repair", "rental_listing")
- `schema` (optional): Schema definition for automatic slot classification
- `initial_slots` (optional): Pre-filled slot values
- `metadata` (optional): Additional session metadata

**Returns:**
```json
{
  "session_id": "dialogue-1706345678-abc123",
  "state": {
    "entity": "equipment_repair",
    "status": "active",
    "collected_slots": {},
    "pending_slots": ["serial_number", "issue_description", "urgency", "reported_by"],
    "completed_slots": [],
    "current_slot": "serial_number"
  },
  "slot_classification": {
    "hard_slots": ["serial_number", "issue_description", "urgency", "reported_by"],
    "soft_slots": [],
    "hidden_slots": ["status"]
  }
}
```

**Usage Pattern:**
```javascript
// Start new dialogue session
const session = await mcp.dialogue_state_create({
  entity: "equipment_repair",
  schema: extractedSchema,
  initial_slots: { reported_by: currentUser }
});

// Use session_id for all subsequent dialogue operations
```

---

### 5. `dialogue_state_update(session_id, slot_name, slot_value, action)`

**Purpose:** Update dialogue session with collected slot value, track progress

**Parameters:**
- `session_id` (required): Session ID from `dialogue_state_create`
- `slot_name` (required): Name of the slot being updated
- `slot_value` (required): Value to store
- `action` (optional): "collect" | "modify" | "clear" (default: "collect")

**Returns:**
```json
{
  "session_id": "dialogue-1706345678-abc123",
  "updated": true,
  "slot": "serial_number",
  "value": "SN-2024-001",
  "action": "collect",
  "state": {
    "status": "active",
    "collected_slots": {"serial_number": "SN-2024-001"},
    "completed_slots": ["serial_number"],
    "pending_slots": ["issue_description", "urgency", "reported_by"],
    "current_slot": "issue_description"
  },
  "is_complete": false
}
```

---

### 6. `dialogue_state_get(session_id)`

**Purpose:** Retrieve current dialogue session state

**Parameters:**
- `session_id` (required): Session ID to retrieve

**Returns:**
```json
{
  "session_id": "dialogue-1706345678-abc123",
  "entity": "equipment_repair",
  "status": "active",
  "collected_slots": {"serial_number": "SN-2024-001", "issue_description": "Won't start"},
  "completed_slots": ["serial_number", "issue_description"],
  "pending_slots": ["urgency", "reported_by"],
  "current_slot": "urgency",
  "interruption_count": 0,
  "last_updated": "2025-01-27T10:30:00Z"
}
```

---

### User Interaction Tools (NEW v2.0)

### 7. `user_confirm(session_id, message, data, timeout_seconds)`

**Purpose:** Create confirmation request for user verification before submission

**Parameters:**
- `session_id` (required): Session ID
- `message` (required): Confirmation message to display to user
- `data` (required): Data object to be confirmed
- `timeout_seconds` (optional): Confirmation timeout, default 300 seconds

**Returns:**
```json
{
  "request_id": "confirm-1706345678-xyz789",
  "session_id": "dialogue-1706345678-abc123",
  "status": "pending",
  "message": "请确认以下报修信息是否正确...",
  "data": {"serial_number": "SN-2024-001", "issue_description": "Won't start", ...},
  "timeout_seconds": 300,
  "expires_at": "2025-01-27T10:35:00Z",
  "instructions": "Present this to user and call user_confirm_response with their answer"
}
```

**Usage Pattern:**
```javascript
// Create confirmation request
const confirm = await mcp.user_confirm({
  session_id,
  message: "请确认信息：序列号 SN-2024-001，问题：无法启动...",
  data: collectedData
});

// Present to user and wait for response
// User says "确认" or "是的"
await mcp.user_confirm_response({
  request_id: confirm.request_id,
  response: "confirmed"
});
```

---

### 8. `user_confirm_response(request_id, response, feedback)`

**Purpose:** Submit user's response to a confirmation request

**Parameters:**
- `request_id` (required): Confirmation request ID from `user_confirm`
- `response` (required): "confirmed" | "rejected" | "timeout"
- `feedback` (optional): User's feedback or reason for rejection

**Returns:**
```json
{
  "request_id": "confirm-1706345678-xyz789",
  "response": "confirmed",
  "feedback": null,
  "session_status": "submitted"
}
```

---

### 9. `handle_interruption(session_id, user_message, action)`

**Purpose:** Detect and handle user interruptions during dialogue flow

**Parameters:**
- `session_id` (required): Session ID
- `user_message` (required): User's interruption message
- `action` (optional): "analyze" | "recover" | "abort" | "pause" (default: "analyze")

**Detected Interruption Types:**
| Intent | Trigger Keywords | Recommended Action |
|--------|-----------------|-------------------|
| `pause` | 等一下，等等，暂停，稍等 | pause_and_resume |
| `correction` | 不对，错了，不是，应该是 | answer_and_resume |
| `topic_change` | 我想问，换个话题，回到 | recover_with_context |
| `cancel` | 取消，不要了，不办了，算了 | abort |
| `question` | 为什么，怎么，如何，什么意思 | answer_and_resume |

**Returns:**
```json
{
  "session_id": "dialogue-1706345678-abc123",
  "user_message": "等一下，我先问个问题",
  "is_interruption": true,
  "detected_intent": "pause",
  "recommended_action": "pause_and_resume",
  "session_status": "interrupted",
  "interruption_count": 1,
  "recovery_message": "对话已暂停，准备好后请说'继续'"
}
```

**Usage Pattern:**
```javascript
// User interrupts: "等一下，我想先问个问题"
const interruption = await mcp.handle_interruption({
  session_id,
  user_message: "等一下，我想先问个问题",
  action: "analyze"
});

// Handle based on intent
if (interruption.detected_intent === "question") {
  // Answer the question
  await answerUserQuestion(userMessage);
  // Then recover dialogue
  await mcp.handle_interruption({ session_id, user_message: "继续", action: "recover" });
}
```

---

### HITL Tools

### 10. `propose_human_intervention(issue_type, current_data, session_id, context)`

**Purpose:** Trigger Human-in-the-Loop intervention for sensitive operations

**Parameters:**
- `issue_type` (required): Type of intervention
  - `duplicate_detection`: Similar record exists
  - `sensitive_field`: Requires human approval (auto-detected)
  - `validation_failure`: Schema validation failed
  - `user_request`: User explicitly requested human
  - `schema_conflict`: Schema mismatch
  - `interruption_recovery`: Complex interruption recovery needed
- `current_data` (required): Current collected data
- `session_id` (optional): Session ID for context
- `context` (optional): Additional context for human reviewer

**Returns:**
```json
{
  "intervention_id": "HITL-2025-001",
  "status": "pending_review",
  "assigned_to": "human_agent_queue",
  "issue_type": "sensitive_field",
  "reason": "Sensitive field detected - requires human approval",
  "estimated_wait": "5 minutes",
  "current_data": {...},
  "context": {...}
}
```

---

### Dialogue History Tools (NEW v2.0)

### 11. `dialogue_history_add(session_id, role, content, intent, slots, action)`

**Purpose:** Add a turn to dialogue history for context tracking

**Parameters:**
- `session_id` (required): Session ID
- `role` (required): "user" | "assistant" | "system"
- `content` (required): Message content
- `intent` (optional): Detected intent
- `slots` (optional): Slots mentioned in this turn
- `action` (optional): Action taken

**Returns:**
```json
{
  "success": true,
  "turn_id": "turn-1706345678-def456",
  "timestamp": "2025-01-27T10:30:00Z"
}
```

---

### 12. `dialogue_history_get(session_id, limit)`

**Purpose:** Retrieve dialogue history for context and analysis

**Parameters:**
- `session_id` (required): Session ID
- `limit` (optional): Maximum turns to return, default 50

**Returns:**
```json
{
  "session_id": "dialogue-1706345678-abc123",
  "turn_count": 8,
  "history": [
    {"turnId": "...", "role": "assistant", "content": "您好，请提供设备序列号...", "timestamp": "..."},
    {"turnId": "...", "role": "user", "content": "SN-2024-001", "timestamp": "..."},
    ...
  ]
}
```

---

### 13. `next_action_recommend(session_id, schema)`

**Purpose:** Get AI-powered recommendation for next dialogue action

**Parameters:**
- `session_id` (required): Session ID
- `schema` (optional): Schema for slot requirement analysis

**Returns:**
```json
{
  "session_id": "dialogue-1706345678-abc123",
  "current_status": "active",
  "collected_count": 2,
  "pending_count": 2,
  "action": "ask_slot",
  "next_slot": "urgency",
  "reason": "Continue collecting required information",
  "collected_slots": {"serial_number": "SN-2024-001", "issue_description": "Won't start"},
  "pending_slots": ["urgency", "reported_by"]
}
```

**Status-Based Recommendations:**
| Status | Recommended Action | Reason |
|--------|-------------------|--------|
| `active` + pending slots | `ask_slot` | Continue collecting |
| `active` + all collected | `confirm_and_submit` | Ready for confirmation |
| `interrupted` | `recover_dialogue` | Resume after interruption |
| `confirmed` | `submit_data` | Submit confirmed data |
| `abandoned` | `restart_or_close` | User cancelled |
| `submitted` | `complete` | Dialogue finished |

---

## Example Scenarios

### Scenario 1: Equipment Repair (设备报修)

**User Input:** "This is my equipment repair form (Excel), help me handle customer requests."

**Meta-Skill Actions:**

1. **Analyze:** Discover columns: `Serial_Number`, `Issue_Desc`, `Urgency`
2. **Generate Slots:** `Serial_Number` is unique index, must ask first
3. **Execute:** AI starts dialogue: "Hello, please provide the equipment serial number for repair registration."
4. **HITL:** User inputs non-existent serial → MCP triggers "manual verification" instead of error

**Dialogue Flow:**
```
AI: "您好，请提供设备的序列号，以便我为您登记报修。"
User: "SN-2024-001"
AI: "找到设备 SN-2024-001（型号：XJ-500）。请问设备出现了什么问题？"
User: "无法启动，显示屏黑屏"
AI: "明白了。请问这个问题的紧急程度？(低/中/高/紧急)"
User: "高，产线停摆了"
AI: "已记录。我将为您创建高优先级工单，稍后会有技术人员联系您。确认提交吗？"
```

---

### Scenario 2: Restaurant Ordering (订餐)

**User Input:** "I need a food ordering assistant for my restaurant."

**Meta-Skill Actions:**

1. **Analyze:** Menu database with `item_name`, `price`, `category`, `allergens`
2. **Generate Slots:** Required: `items`, `quantity`; Optional: `special_requests`, `delivery_time`
3. **Execute:** Guide user through menu selection

**Dialogue Flow:**
```
AI: "欢迎！今天想吃点什么？我们有以下类别：主食、小吃、饮料。"
User: "看看主食"
AI: "主食有：红烧肉饭 (¥25)、鱼香肉丝饭 (¥22)、宫保鸡丁饭 (¥24)。您想选哪个？"
User: "红烧肉饭，两份"
AI: "好的，两份红烧肉饭。需要加什么小吃或饮料吗？"
User: "来杯可乐"
AI: "收到。两份红烧肉饭 + 一杯可乐，共 ¥55。需要配送吗？"
```

---

### Scenario 3: Rental Agent (租房代理)

**User Input:** "Help me build a rental listing assistant."

**Generated Schema:**
```json
{
  "entity": "rental_listing",
  "hard_slots": ["location", "price_range", "contact"],
  "soft_slots": ["has_balcony", "floor_preference", "pet_friendly"],
  "hidden_slots": ["status", "created_at", "listing_id"]
}
```

**Dialogue Flow:**
```
AI: "您好！我来帮您发布房源。首先请问房子在哪个区？"
User: "海淀区"
AI: "好的，海淀区。您的期望租金范围是？(低：¥5000 以下/中：¥5000-10000/高：¥10000 以上)"
User: "中吧，8000 左右"
AI: "明白了。房子有阳台吗？这个信息能帮助租客更好了解房源。"
User: "有的"
AI: "好的，已记录。请提供您的联系电话。"
User: "138xxxx1234"
AI: "确认信息：海淀区，¥8000/月，有阳台，联系：138xxxx1234。确认发布吗？"
```

---

## Decision Tree for Meta-TOD

```
User provides scenario/data
    │
    ├── Has data source? (Excel, SQL, JSON)
    │   ├── Yes → Call inspect_datasource()
    │   └── No (natural language description)
    │       └──→ Extract fields from description
    │
    ├── Schema extracted?
    │   ├── Yes → Classify slots (Hard/Soft/Hidden/Derived)
    │   └── No → Ask clarifying questions
    │
    ├── Generate Dialogue Plan
    │   └──→ Determine slot order, defaults, validations
    │
    ├── Execute Dialogue
    │   ├── Collect slot values
    │   ├── Validate in real-time
    │   └── Detect conflicts
    │
    ├── Pre-write Validation
    │   ├── Call validate_against_schema()
    │   └── Check HITL conditions
    │
    └── Final Action
        ├── Safe to write → Submit
        ├── Needs review → propose_human_intervention()
        └── User requests human → Transfer
```

---

## Best Practices

### Always
- **Extract schema first** before starting dialogue
- **Classify slots** into Hard/Soft/Hidden/Derived
- **Validate in real-time** as user provides values
- **Confirm before submission** with complete summary
- **Trigger HITL** for sensitive fields or conflicts

### Never
- **Assume field meanings** without schema analysis
- **Ask for hidden slots** (auto-filled fields)
- **Proceed without validation** before database write
- **Ignore enum constraints** (offer valid options)
- **Skip confirmation** for important operations

### Quality Checks
- All required slots collected
- Values match expected types
- No schema validation errors
- HITL triggered when needed
- User confirmation obtained

---

## Integration Patterns

### Pattern 1: Excel → Dialogue
```
read_file(excel_path) → inspect_datasource() → generate_slots() → start_dialogue()
```

### Pattern 2: SQL DDL → Dialogue
```
parse_ddl(sql_string) → extract_tables() → inspect_datasource() → generate_slots()
```

### Pattern 3: Description → Schema → Dialogue
```
user_describes_scenario() → infer_schema() → validate_with_user() → generate_slots()
```

### Pattern 4: Multi-Entity Dialogue
```
inspect_datasource(multiple_tables) → identify_relationships() → generate_cross_entity_slots()
```

---

## Python Helper: SQL DDL to Slot JSON

```python
import re
from typing import List, Dict, Any

def ddl_to_slots(ddl: str) -> Dict[str, Any]:
    """
    Convert SQL DDL to slot definition JSON for Meta-TOD.
    
    Example DDL:
    CREATE TABLE rental_listings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        location TEXT NOT NULL,
        price_range TEXT CHECK(price_range IN ('low', 'mid', 'high')),
        has_balcony BOOLEAN DEFAULT 0,
        status TEXT DEFAULT 'Pending',
        contact TEXT NOT NULL UNIQUE
    );
    """
    
    # Extract table name
    table_match = re.search(r'CREATE TABLE (\w+)', ddl, re.IGNORECASE)
    table_name = table_match.group(1) if table_match else 'unknown'
    
    # Extract field definitions
    fields = []
    field_pattern = r'(\w+)\s+(\w+)(?:\s+([^,]+))?'
    
    for match in re.finditer(field_pattern, ddl, re.IGNORECASE):
        field_name = match.group(1)
        field_type = match.group(2).upper()
        constraints = match.group(3) or ''
        
        # Skip primary keys and auto-increment
        if 'PRIMARY' in constraints.upper() or 'AUTOINCREMENT' in constraints.upper():
            continue
        
        # Determine if required
        required = 'NOT NULL' in constraints.upper()
        
        # Extract default value
        default_match = re.search(r'DEFAULT\s+\'?(\w+)\'?', constraints, re.IGNORECASE)
        default_value = default_match.group(1) if default_match else None
        
        # Extract enum values
        enum_match = re.search(r"IN\s*\(([^)]+)\)", constraints, re.IGNORECASE)
        enum_values = None
        if enum_match:
            values = enum_match.group(1)
            enum_values = [v.strip().strip("'\"") for v in values.split(',')]
        
        # Classify slot type
        if default_value is not None or 'AUTO' in constraints.upper():
            slot_type = 'hidden'
        elif required:
            slot_type = 'hard'
        else:
            slot_type = 'soft'
        
        fields.append({
            'name': field_name,
            'type': field_type,
            'required': required,
            'default': default_value,
            'enum': enum_values,
            'slot_type': slot_type
        })
    
    return {
        'entity': table_name,
        'fields': fields,
        'hard_slots': [f['name'] for f in fields if f['slot_type'] == 'hard'],
        'soft_slots': [f['name'] for f in fields if f['slot_type'] == 'soft'],
        'hidden_slots': [f['name'] for f in fields if f['slot_type'] == 'hidden']
    }

# Usage Example
ddl = """
CREATE TABLE equipment_repair (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    serial_number TEXT NOT NULL UNIQUE,
    issue_description TEXT NOT NULL,
    urgency TEXT CHECK(urgency IN ('low', 'medium', 'high', 'critical')),
    reported_by TEXT NOT NULL,
    status TEXT DEFAULT 'Open'
);
"""

slots = ddl_to_slots(ddl)
print(slots)
```

---

## Comparison: Traditional vs Meta-TOD

| Aspect | Traditional TOD | Meta-TOD (This Skill) |
|--------|-----------------|----------------------|
| **Schema Definition** | Hard-coded in dialogue manager | Extracted dynamically from data |
| **New Scenario** | Requires code changes | Works with any schema |
| **Slot Policy** | Manually defined | Auto-generated from constraints |
| **Validation** | Custom logic per field | Schema-based universal validation |
| **Maintenance** | High (code changes needed) | Low (metadata changes only) |
| **Flexibility** | Low (fixed scenarios) | High (zero-shot adaptation) |

---

## Troubleshooting

### Issue: Schema extraction fails
**Solution:** Ensure data source is accessible. Try manual schema description.

### Issue: Dialogue feels robotic
**Solution:** Add persona and tone guidelines. Use soft slots for natural conversation flow.

### Issue: Too many questions
**Solution:** Batch related hard slots together. Make soft slots truly optional.

### Issue: Validation too strict
**Solution:** Add fuzzy matching for enum values. Provide helpful error messages.

### Issue: HITL triggered too often
**Solution:** Adjust similarity threshold. Review sensitive field definitions.

---

## Related Skills

- **task-decomposer**: For breaking down complex multi-entity tasks
- **xlsx**: For reading Excel-based schemas
- **mcp-builder**: For building custom MCP tools for your data sources
- **architecture-master**: For designing large-scale dialogue systems
