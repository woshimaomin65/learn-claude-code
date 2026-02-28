# Meta-TOD Example: Equipment Repair System

This example demonstrates how to use the Task Dialogue Meta-Skill to create an equipment repair dialogue system.

## Step 1: Define the Schema

### Option A: SQL DDL
```sql
CREATE TABLE equipment_repair (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    serial_number TEXT NOT NULL UNIQUE,
    issue_description TEXT NOT NULL,
    urgency TEXT CHECK(urgency IN ('low', 'medium', 'high', 'critical')),
    reported_by TEXT NOT NULL,
    reported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'Open',
    assigned_to TEXT
);
```

### Option B: Excel Structure
| Column | Type | Required | Notes |
|--------|------|----------|-------|
| serial_number | TEXT | Yes | Unique equipment ID |
| issue_description | TEXT | Yes | Problem description |
| urgency | TEXT | Yes | low/medium/high/critical |
| reported_by | TEXT | Yes | Employee name/ID |
| status | TEXT | No | Default: Open |

### Option C: Natural Language Description
"I need a system to track equipment repairs. Each repair record should have:
- Equipment serial number (required, unique)
- Description of the issue (required)
- Urgency level: low, medium, high, or critical
- Who reported it (required)
- Current status (defaults to 'Open')
- Assigned technician (optional)"

## Step 2: Load the Skill

```python
# In your conversation
load_skill(name="task-dialogue-meta")
```

## Step 3: Trigger Schema Analysis

```
User: "I have an equipment repair system. Here's the table structure:
[Insert SQL DDL or describe fields]"

AI (with skill loaded): "I'll analyze the schema and generate a dialogue plan..."
```

## Step 4: Generated Slot Classification

```json
{
  "entity": "equipment_repair",
  "hard_slots": ["serial_number", "issue_description", "urgency", "reported_by"],
  "soft_slots": ["assigned_to"],
  "hidden_slots": ["id", "reported_at", "status"]
}
```

## Step 5: Dialogue Execution

```
AI: "您好！欢迎使用设备报修系统。我来帮您登记报修请求。
     首先，请提供设备的序列号。"

User: "SN-2024-001"

AI: "收到，序列号 SN-2024-001。
     请问设备出现了什么问题？请详细描述一下故障现象。"

User: "设备无法启动，显示屏完全不亮，按电源键没有任何反应"

AI: "明白了，设备无法启动，显示屏无反应。
     请问这个问题的紧急程度如何？
     - 低：不影响生产，可以等待
     - 中：影响部分功能，但可临时应对
     - 高：严重影响生产，需要尽快处理
     - 紧急：产线完全停摆，需要立即处理"

User: "高，这条产线现在停摆了"

AI: "已记录为高优先级。
     请问是您本人在报修吗？请提供您的姓名或工号。"

User: "张三，工号 12345"

AI: "好的，张三（12345）。让我确认一下报修信息：
     
     📋 报修信息确认
     ─────────────────
     设备序列号：SN-2024-001
     故障描述：设备无法启动，显示屏无反应，按电源键无反应
     紧急程度：高
     报修人：张三 (12345)
     状态：Open（自动）
     报修时间：2025-01-27 10:30（自动）
     ─────────────────
     
     确认提交这个报修工单吗？"

User: "确认"

AI: "✅ 报修工单已提交！
     工单号：RPA-2025-0042
     技术人员将会尽快联系您处理。"
```

## Step 6: HITL Scenarios

### Scenario A: Duplicate Detection
```
User: "SN-2024-001"

AI: "⚠️ 检测到该设备已有未完成的报修记录：
     
     工单号：RPA-2025-0038
     报修时间：2025-01-25
     当前状态：处理中
      assigned_to: 李工
     
     您是要：
     1. 查看现有工单状态
     2. 追加新的故障描述
     3. 创建新工单（需要人工确认）"

User: "3"

AI: "好的，我将为您转接人工客服确认是否创建新工单..."
     [TRIGGER: propose_human_intervention with duplicate_detection]
```

### Scenario B: Sensitive Field
```
# If schema had fields like payment_amount, password, is_admin
AI: "此操作涉及敏感信息，需要人工审核确认。
     我将为您转接人工客服..."
     [TRIGGER: propose_human_intervention with sensitive_field]
```

## Python Integration

```python
from typing import Dict, List, Any

class MetaTODExample:
    def __init__(self):
        self.schema = {
            "entity": "equipment_repair",
            "fields": [
                {"name": "serial_number", "type": "TEXT", "required": True, "unique": True},
                {"name": "issue_description", "type": "TEXT", "required": True},
                {"name": "urgency", "type": "TEXT", "required": True, 
                 "enum": ["low", "medium", "high", "critical"]},
                {"name": "reported_by", "type": "TEXT", "required": True},
                {"name": "status", "type": "TEXT", "default": "Open"},
                {"name": "assigned_to", "type": "TEXT", "required": False}
            ]
        }
        self.collected_slots = {}
    
    def classify_slots(self) -> Dict[str, List[str]]:
        hard = []
        soft = []
        hidden = []
        
        for field in self.schema["fields"]:
            if field.get("default") is not None:
                hidden.append(field["name"])
            elif field.get("required", False):
                hard.append(field["name"])
            else:
                soft.append(field["name"])
        
        return {"hard": hard, "soft": soft, "hidden": hidden}
    
    def validate_slot(self, field_name: str, value: Any) -> bool:
        field = next(f for f in self.schema["fields"] if f["name"] == field_name)
        
        # Check enum constraint
        if "enum" in field and value not in field["enum"]:
            return False
        
        # Check required
        if field.get("required") and (value is None or value == ""):
            return False
        
        return True
    
    def get_dialogue_prompt(self, slot_name: str) -> str:
        prompts = {
            "serial_number": "请提供设备的序列号。",
            "issue_description": "请问设备出现了什么问题？请详细描述故障现象。",
            "urgency": "请问紧急程度？(low/medium/high/critical)",
            "reported_by": "请问报修人姓名或工号？",
            "assigned_to": "需要指定技术人员处理吗？（可选）"
        }
        return prompts.get(slot_name, f"请提供{slot_name}。")

# Usage
tod = MetaTODExample()
slots = tod.classify_slots()
print(f"Hard slots: {slots['hard']}")
print(f"Soft slots: {slots['soft']}")
print(f"Hidden slots: {slots['hidden']}")
```

## Key Takeaways

1. **Schema-First Approach**: Always analyze data structure before dialogue
2. **Slot Classification**: Automatically determine what to ask vs. auto-fill
3. **Dynamic Validation**: Check constraints in real-time during conversation
4. **HITL Triggers**: Know when to involve humans (duplicates, sensitive data)
5. **Confirmation Pattern**: Always summarize before final submission
