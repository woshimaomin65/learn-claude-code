# Human-in-the-Loop MCP Server

Dedicated MCP for human approval, confirmation, and intervention workflows. Can be used independently or with `task-dialogue-mcp` for comprehensive HITL scenarios.

## Features

- **Approval Requests**: Create, manage, and track approval workflows
- **Multiple Types**: confirmation, approval, selection, data_review, intervention, escalation
- **Priority Management**: low, normal, high, critical with automatic timeout handling
- **Batch Operations**: Approve/reject multiple requests at once
- **Audit Trail**: Complete history and statistics
- **Session Integration**: Link approvals to dialogue sessions or other contexts

## Tools

### Core Approval Tools

| Tool | Description |
|------|-------------|
| `create_approval_request` | Create a new approval request with type, priority, and timeout |
| `get_approval_request` | Get details of a specific approval request |
| `list_approval_requests` | List requests with filtering by status, type, assignee |
| `respond_to_approval` | Submit response (approve/reject/modify/escalate) |
| `cancel_approval_request` | Cancel a pending request |

### Specialized Request Types

| Tool | Description |
|------|-------------|
| `create_selection_request` | User chooses from multiple options |
| `create_data_review_request` | Review and optionally modify data before approval |

### Management Tools

| Tool | Description |
|------|-------------|
| `escalate_request` | Escalate to higher priority or different assignee |
| `batch_approve` | Approve/reject multiple requests at once |
| `get_approval_history` | Audit history for requests |
| `get_approval_stats` | Statistics (approval rate, response time, etc.) |

### Integration Tools

| Tool | Description |
|------|-------------|
| `link_to_session` | Link approval to a session (e.g., from task-dialogue-mcp) |
| `get_session_approvals` | Get all approvals linked to a session |

## Usage with task-dialogue-mcp

```javascript
// 1. Start dialogue session with task-dialogue-mcp
const session = await taskDialogueMcp.dialogue_state_create({
  entity: "equipment_repair",
  schema: schema,
});

// 2. Collect slots...
await taskDialogueMcp.dialogue_state_update({
  session_id: session.session_id,
  slot_name: "serial_number",
  slot_value: "SN-2024-001",
});

// 3. When confirmation needed, use human-in-the-loop-mcp
const approval = await hitlMcp.create_approval_request({
  type: "confirmation",
  title: "确认报修信息",
  description: "请确认以下信息是否正确",
  data: collectedData,
  session_id: session.session_id,  // Link to dialogue session
  priority: "normal",
});

// 4. Present to user and wait for response
// User responds...
await hitlMcp.respond_to_approval({
  request_id: approval.request_id,
  decision: "approved",
});

// 5. Check approval status and continue dialogue
const approvals = await hitlMcp.get_session_approvals({
  session_id: session.session_id,
});
```

## Approval Types

| Type | Use Case | Response Options |
|------|----------|-----------------|
| `confirmation` | Simple yes/no confirmation | approved, rejected |
| `approval` | Formal approval workflow | approved, rejected, escalated |
| `selection` | Choose from options | approved + selected option |
| `data_review` | Review and modify data | approved, rejected, modified |
| `intervention` | Edge case handling | approved, rejected, guidance |
| `escalation` | Senior-level decision | approved, rejected, redirected |

## Priority & Timeout

| Priority | Default Timeout |
|----------|-----------------|
| `critical` | 5 minutes |
| `high` | 30 minutes |
| `normal` | 4 hours |
| `low` | 24 hours |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent / Application                        │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ task-dialogue-  │ │ human-in-the-   │ │    Other        │
│ mcp             │ │ loop-mcp        │ │    Skills       │
│                 │ │                 │ │                 │
│ • State Mgmt    │ │ • Approvals     │ │ • Domain logic  │
│ • Slot Collect  │ │ • Confirmations │ │                 │
│ • Interruption  │ │ • Choices       │ │                 │
│ • History       │ │ • Notifications │ │                 │
│ • Schema Tools  │ │ • Audit Trail   │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘
          │                   │
          └─────────┬─────────┘
                    │
                    ▼
          ┌─────────────────┐
          │  Shared State   │
          │  (Session/DB)   │
          └─────────────────┘
```
