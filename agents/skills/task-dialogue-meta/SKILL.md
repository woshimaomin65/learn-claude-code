---

## Architecture: Dual-MCP Design (v3.0)

```
┌─────────────────────────────────────────────────────────────────┐
│                     Agent / Application                           │
│                                                                   │
│   // Example workflow                                            │
│   const session = await dialogueMcp.dialogue_state_create(...);  │
│   await dialogueMcp.dialogue_state_update(...); // collect slots │
│   const approval = await dialogueMcp.prepare_for_approval(...);  │
│   await hitlMcp.create_approval_request(approval.hitl_request);  │
│   // ... wait for user response                                  │
│   await hitlMcp.respond_to_approval({ decision: "approved" });   │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ task-dialogue-  │ │ human-in-the-   │ │                 │
│ mcp (v3.0)      │ │ loop-mcp (v1.0) │ │   Your App      │
│                 │ │                 │ │                 │
│ Dialogue Focus: │ │ Approval Focus: │ │  User Interface │
│ • State mgmt    │ │ • Confirmations │ │  Notifications  │
│ • Slot collect  │ │ • Approvals     │ │  Decision UI    │
│ • Interruption  │ │ • Selections    │ │                 │
│ • History       │ │ • Escalations   │ │                 │
│ • Schema tools  │ │ • Audit trail   │ │                 │
│ • prepare_for_  │ │ • Batch ops     │ │                 │
│   approval      │ │ • Statistics    │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘
          │                   │
          └─────────┬─────────┘
                    │
                    ▼
          ┌─────────────────┐
          │  Shared Context │
          │  (session_id)   │
          └─────────────────┘
```

### Why Dual-MCP?

| Aspect | Before (v2.0) | After (v3.0) |
|--------|--------------|--------------|
| **Concerns** | Mixed dialogue + approval | Separated |
| **Reusability** | Approval tied to dialogue | HITL MCP usable standalone |
| **Complexity** | Single large MCP | Two focused MCPs |
| **Testing** | Hard to isolate | Easy to test independently |
| **Extension** | Modify main MCP | Extend either MCP |

---

## MCP Toolset Reference

### task-dialogue-mcp Tools

| Category | Tool | Description |
|----------|------|-------------|
| **Schema** | `inspect_datasource` | Analyze SQL DDL, Excel, CSV, JSON |
| **Schema** | `get_data_schema` | Alias for inspect_datasource |
| **Validation** | `validate_against_schema` | Validate slots against schema |
| **Validation** | `check_duplicate_records` | Detect duplicates |
| **State** | `dialogue_state_create` | Create dialogue session |
| **State** | `dialogue_state_update` | Update with slot value |
| **State** | `dialogue_state_get` | Get session state |
| **Interruption** | `handle_interruption` | Detect and handle interruptions |
| **HITL Bridge** | `prepare_for_approval` | Format data for HITL MCP |
| **History** | `dialogue_history_add` | Add conversation turn |
| **History** | `dialogue_history_get` | Retrieve history |
| **Recommendation** | `next_action_recommend` | Get next action suggestion |

### human-in-the-loop-mcp Tools

| Category | Tool | Description |
|----------|------|-------------|
| **Core** | `create_approval_request` | Create approval (confirmation/approval/selection/data_review/intervention/escalation) |
| **Core** | `get_approval_request` | Get request details |
| **Core** | `list_approval_requests` | List with filtering |
| **Core** | `respond_to_approval` | Submit decision (approve/reject/modify/escalate) |
| **Core** | `cancel_approval_request` | Cancel pending request |
| **Specialized** | `create_selection_request` | User chooses from options |
| **Specialized** | `create_data_review_request` | Review and modify data |
| **Management** | `escalate_request` | Escalate priority/assignee |
| **Management** | `batch_approve` | Approve multiple at once |
| **Audit** | `get_approval_history` | Audit trail |
| **Audit** | `get_approval_stats` | Statistics and metrics |
| **Integration** | `link_to_session` | Link to dialogue session |
| **Integration** | `get_session_approvals` | Get session's approvals |

---

## Usage Patterns

### Pattern 1: Simple Confirmation Flow

```javascript
// 1. Create dialogue session
const session = await dialogueMcp.dialogue_state_create({
  entity: "equipment_repair",
  schema: equipmentSchema,
});

// 2. Collect slots
for (const slot of requiredSlots) {
  await dialogueMcp.dialogue_state_update({
    session_id: session.session_id,
    slot_name: slot,
    slot_value: await askUser(slot),
  });
}

// 3. Prepare for approval
const approvalPrep = await dialogueMcp.prepare_for_approval({
  session_id: session.session_id,
  approval_type: "confirmation",
  title: "确认报修信息",
});

// 4. Create approval request (using HITL MCP)
const approval = await hitlMcp.create_approval_request(approvalPrep.hitl_request);

// 5. Present to user and wait for response
// ... display approval.message to user ...
// ... user responds "确认" or "取消" ...

// 6. Submit response
const response = await hitlMcp.respond_to_approval({
  request_id: approval.request_id,
  decision: userConfirmed ? "approved" : "rejected",
});

// 7. Continue based on approval status
if (response.decision === "approved") {
  await submitToDatabase(session.state.collected_slots);
}
```

### Pattern 2: Selection Flow

```javascript
// User needs to choose from options
const selection = await hitlMcp.create_selection_request({
  title: "选择维修时间",
  description: "请选择方便的维修时间段",
  options: [
    { id: "morning", label: "上午 (9:00-12:00)" },
    { id: "afternoon", label: "下午 (13:00-17:00)" },
    { id: "evening", label: "晚上 (18:00-20:00)" },
  ],
  session_id: session.session_id,
});

// ... user selects option ...

await hitlMcp.respond_to_approval({
  request_id: selection.request_id,
  decision: "approved",
  modified_data: { selected_time_slot: "morning" },
});
```

### Pattern 3: Data Review Flow

```javascript
// Complex data that needs human review
const review = await hitlMcp.create_data_review_request({
  title: "审核报修详情",
  description: "请审核以下报修信息，可以修改错误内容",
  data: collectedData,
  editable_fields: ["issue_description", "location"],
  session_id: session.session_id,
  priority: "high",
});

// ... reviewer examines and possibly modifies ...

await hitlMcp.respond_to_approval({
  request_id: review.request_id,
  decision: "modified",
  modified_data: {
    ...collectedData,
    issue_description: "Revised description",
  },
});
```

### Pattern 4: Interruption + Approval

```javascript
// During slot collection, user interrupts
const interruption = await dialogueMcp.handle_interruption({
  session_id: session.session_id,
  user_message: "等一下，我想问一下费用怎么算？",
  action: "analyze",
});

// Detected: question -> answer and resume
if (interruption.detected_intent === "question") {
  await answerUserQuestion(interruption.user_message);
  await dialogueMcp.handle_interruption({
    session_id: session.session_id,
    user_message: "继续",
    action: "recover",
  });
}

// After collecting all slots, proceed to approval
const approvalPrep = await dialogueMcp.prepare_for_approval({
  session_id: session.session_id,
});
// ... continue with approval flow
```

### Pattern 5: Batch Approval

```javascript
// Multiple pending approvals
const pending = await hitlMcp.list_approval_requests({
  status: "pending",
  assignee: "manager-001",
});

// Batch approve all normal-priority requests
const normalPriority = pending.requests.filter(r => r.priority === "normal");
await hitlMcp.batch_approve({
  request_ids: normalPriority.map(r => r.request_id),
  decision: "approved",
});
```

---

## Session State Lifecycle

```
                    ┌─────────────┐
                    │   (start)   │
                    └──────┬──────┘
                           │
                           ▼
              ┌────────────────────────┐
              │ dialogue_state_create  │
              │  status: "active"      │
              └───────────┬────────────┘
                          │
              ┌───────────▼────────────┐
              │ dialogue_state_update  │
              │  (collect slots)       │
              └───────────┬────────────┘
                          │
              ┌───────────▼────────────┐
              │ All slots collected    │
              │  status: "pending_     │
              │   approval"            │
              └───────────┬────────────┘
                          │
              ┌───────────▼────────────┐
              │ prepare_for_approval   │
              └───────────┬────────────┘
                          │
              ┌───────────▼────────────┐
              │ create_approval_request│◄──── human-in-the-loop-mcp
              │  (HITL MCP)            │
              └───────────┬────────────┘
                          │
              ┌───────────▼────────────┐
              │  User responds         │
              │ respond_to_approval    │
              └───────────┬────────────┘
                   │              │
         ┌─────────┘              └─────────┐
         ▼                                  ▼
  ┌─────────────┐                   ┌─────────────┐
  │  approved   │                   │  rejected   │
  │  status:    │                   │  status:    │
  │  "completed"│                   │  "abandoned"│
  └─────────────┘                   └─────────────┘
```

---

## Interruption Handling

| Intent | Keywords | Recommended Action |
|--------|----------|-------------------|
| `pause` | 等一下，等等，暂停，稍等 | pause_and_resume |
| `correction` | 不对，错了，不是，应该是 | answer_and_resume |
| `topic_change` | 我想问，换个话题，回到 | recover_with_context |
| `cancel` | 取消，不要了，不办了，算了 | abort |
| `question` | 为什么，怎么，如何，什么意思 | answer_and_resume |

---

## Approval Types (human-in-the-loop-mcp)

| Type | Use Case | Response Options |
|------|----------|-----------------|
| `confirmation` | Simple yes/no | approved, rejected |
| `approval` | Formal approval | approved, rejected, escalated |
| `selection` | Choose options | approved + selected option |
| `data_review` | Review/modify data | approved, rejected, modified |
| `intervention` | Edge case handling | approved, rejected, guidance |
| `escalation` | Senior decision | approved, rejected, redirected |

---

## Best Practices

### 1. Always Link Approvals to Sessions

```javascript
// Good: Linked for tracking
await hitlMcp.create_approval_request({
  session_id: dialogueSessionId,
  // ...
});

// Later, can retrieve all approvals for session
const approvals = await hitlMcp.get_session_approvals({
  session_id: dialogueSessionId,
});
```

### 2. Use prepare_for_approval for Consistency

```javascript
// Good: Consistent format
const prep = await dialogueMcp.prepare_for_approval({
  session_id,
  approval_type: "confirmation",
});
const approval = await hitlMcp.create_approval_request(prep.hitl_request);

// Avoid: Manual formatting (might miss fields)
await hitlMcp.create_approval_request({
  type: "confirmation",
  data: state.collectedSlots, // might miss metadata
});
```

### 3. Handle Timeout Scenarios

```javascript
const approval = await hitlMcp.create_approval_request({
  type: "confirmation",
  timeout_seconds: 300, // 5 minutes
  priority: "high",
});

// Check status before proceeding
const status = await hitlMcp.get_approval_request({
  request_id: approval.request_id,
});

if (status.status === "timeout") {
  // Handle timeout scenario
}
```

### 4. Use Priority Appropriately

| Priority | Use Case | Timeout |
|----------|----------|---------|
| `critical` | Emergency, blocking | 5 min |
| `high` | Urgent business need | 30 min |
| `normal` | Standard workflow | 4 hours |
| `low` | Non-urgent | 24 hours |

---

## Error Handling

```javascript
try {
  const session = await dialogueMcp.dialogue_state_create({...});
} catch (error) {
  if (error.message.includes("Session not found")) {
    // Handle session error
  }
}

// Check approval status before responding
const request = await hitlMcp.get_approval_request({ request_id });
if (request.status !== "pending") {
  // Already responded, handle accordingly
}
```
