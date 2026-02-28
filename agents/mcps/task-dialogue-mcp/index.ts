#!/usr/bin/env node

/**
 * Task Dialogue MCP Server v2.0
 * 
 * Enhanced with full conversation management capabilities:
 * - Schema analysis: inspect_datasource, get_data_schema
 * - Data validation: validate_against_schema, check_duplicate_records
 * - Conversation management: dialogue_state_create/update/get (NEW)
 * - User interaction: user_confirm/response, handle_interruption (NEW)
 * - HITL: propose_human_intervention
 * - Dialogue history: dialogue_history_add/get, next_action_recommend (NEW)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// Types
// ============================================================================

interface DialogueState {
  sessionId: string;
  entity: string;
  collectedSlots: Record<string, unknown>;
  currentSlot: string | null;
  completedSlots: string[];
  pendingSlots: string[];
  status: "active" | "confirmed" | "submitted" | "interrupted" | "abandoned";
  interruptionCount: number;
  lastUpdated: number;
  metadata: Record<string, unknown>;
}

interface DialogueTurn {
  turnId: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  intent?: string;
  slots?: Record<string, unknown>;
  action?: string;
}

interface ConfirmationRequest {
  requestId: string;
  sessionId: string;
  message: string;
  data: Record<string, unknown>;
  status: "pending" | "confirmed" | "rejected" | "timeout";
  createdAt: number;
  timeoutSeconds: number;
}

const dialogueStates = new Map<string, DialogueState>();
const dialogueHistory = new Map<string, DialogueTurn[]>();
const confirmationRequests = new Map<string, ConfirmationRequest>();

// ============================================================================
// Schemas
// ============================================================================

const FieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean().optional().default(false),
  unique: z.boolean().optional().default(false),
  default: z.unknown().optional(),
  enum: z.array(z.string()).optional().nullable(),
  description: z.string().optional(),
  priority: z.number().optional().default(1),
});

// ============================================================================
// Utilities
// ============================================================================

function generateId(prefix: string = "id"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function parseSQLDDL(ddl: string) {
  const tableMatch = ddl.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["']?(\w+)["']?\s*\(/i);
  const entity = tableMatch ? tableMatch[1] : "unknown";
  const fields: any[] = [];
  const fieldPattern = /["']?(\w+)["']?\s+(\w+)(?:\s*\([^)]*\))?(.*?)(?:,|(?=\)))/gis;
  let match;
  
  while ((match = fieldPattern.exec(ddl)) !== null) {
    const fieldName = match[1], fieldType = match[2].toUpperCase(), constraints = (match[3] || "").toUpperCase();
    if (["PRIMARY", "FOREIGN", "UNIQUE", "CHECK", "CONSTRAINT"].some(k => constraints.trim().startsWith(k))) continue;
    
    const required = constraints.includes("NOT NULL");
    const unique = constraints.includes("UNIQUE");
    const autoIncrement = constraints.includes("AUTOINCREMENT") || constraints.includes("AUTO_INCREMENT");
    
    let defaultValue: any = undefined;
    const defaultMatch = match[3].match(/DEFAULT\s+['"]?([^'"\s,)]+)['"]?/i);
    if (defaultMatch) {
      const val = defaultMatch[1];
      defaultValue = val === "NULL" ? null : val === "TRUE" || val === "1" ? true : val === "FALSE" || val === "0" ? false : isNaN(Number(val)) ? val : Number(val);
    }
    
    let enumValues: string[] | null = null;
    const enumMatch = match[3].match(/CHECK\s*\(\s*\w+\s+IN\s*\(([^)]+)\)/i);
    if (enumMatch) enumValues = enumMatch[1].split(",").map(v => v.trim().replace(/['"]/g, ""));
    
    if (!autoIncrement) fields.push({ name: fieldName, type: fieldType, required, unique, default: defaultValue, enum: enumValues, priority: required ? 1 : 2 });
  }
  return { entity, fields, relationships: [] };
}

function parseExcelFile(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  const entity = path.basename(filePath, ext);
  if (ext === ".csv") {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n");
    if (lines.length === 0) return { entity, fields: [], relationships: [] };
    const headers = lines[0].split(",").map(h => h.trim().replace(/["']/g, ""));
    const fields = headers.map((name: string) => ({ name, type: "STRING", required: true, priority: 1 }));
    if (lines.length > 1) {
      const sampleValues = lines[1].split(",").map(v => v.trim());
      fields.forEach((field: any, i: number) => {
        const value = sampleValues[i];
        if (!isNaN(Number(value))) field.type = "NUMBER";
        else if (value === "true" || value === "false") field.type = "BOOLEAN";
      });
    }
    return { entity, fields, relationships: [] };
  }
  return { entity, fields: [{ name: "data", type: "OBJECT", required: true, priority: 1 }], relationships: [] };
}

function containsSensitiveFields(data: Record<string, unknown>): boolean {
  const patterns = ["password", "passwd", "secret", "token", "api_key", "credit_card", "ssn", "bank_account", "payment", "is_admin", "role"];
  return Object.keys(data).some(key => patterns.some(p => key.toLowerCase().includes(p)));
}

function calculateSimilarity(obj1: Record<string, unknown>, obj2: Record<string, unknown>): number {
  const keys1 = Object.keys(obj1), keys2 = Object.keys(obj2);
  const commonKeys = keys1.filter(k => keys2.includes(k));
  if (commonKeys.length === 0) return 0;
  let matchCount = 0;
  commonKeys.forEach(key => { if (String(obj1[key]).toLowerCase() === String(obj2[key]).toLowerCase()) matchCount++; });
  return matchCount / Math.max(keys1.length, keys2.length);
}

function detectInterruptionIntent(message: string): { isInterruption: boolean; intent?: string } {
  const patterns: Array<{ pattern: RegExp; intent: string }> = [
    { pattern: /\b(等一下 | 等等 | 暂停 | 停一下 | 打断 | 稍等)\b/i, intent: "pause" },
    { pattern: /\b(不对 | 错了 | 不是 | 不正确 | 应该是)\b/i, intent: "correction" },
    { pattern: /\b(我想问 | 我想说 | 换个话题 | 回到 | 先问个)\b/i, intent: "topic_change" },
    { pattern: /\b(取消 | 不要了 | 不办了 | 退出 | 算了)\b/i, intent: "cancel" },
    { pattern: /\b(为什么 | 怎么 | 如何 | 什么意思 | 什么是)\b/i, intent: "question" },
  ];
  for (const { pattern, intent } of patterns) if (pattern.test(message)) return { isInterruption: true, intent };
  return { isInterruption: false };
}

function getNextSlot(pendingSlots: string[], completedSlots: string[], fields: any[]): string | null {
  const remaining = pendingSlots.filter(s => !completedSlots.includes(s));
  if (remaining.length === 0) return null;
  const priorityMap = new Map(fields.map(f => [f.name, f.priority || 1]));
  remaining.sort((a, b) => (priorityMap.get(a) || 999) - (priorityMap.get(b) || 999));
  return remaining[0];
}

// ============================================================================
// MCP Server
// ============================================================================

const server = new Server({ name: "task-dialogue-mcp", version: "2.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "inspect_datasource", description: "Analyze data source (SQL DDL, Excel, CSV, JSON, file path) and extract schema", inputSchema: zodToJsonSchema(z.object({ uri: z.string(), include_relationships: z.boolean().optional().default(true) })) },
    { name: "get_data_schema", description: "Alias for inspect_datasource", inputSchema: zodToJsonSchema(z.object({ source: z.string() })) },
    { name: "validate_against_schema", description: "Validate slot values against schema. Returns errors, warnings, ready_for_write", inputSchema: zodToJsonSchema(z.object({ data_json: z.record(z.unknown()), schema: z.object({ entity: z.string(), fields: z.array(FieldSchema) }) })) },
    { name: "check_duplicate_records", description: "Check for duplicate records. Returns similarity score and matches", inputSchema: zodToJsonSchema(z.object({ current_data: z.record(z.unknown()), existing_records: z.array(z.record(z.unknown())), threshold: z.number().min(0).max(1).optional().default(0.8) })) },
    { name: "dialogue_state_create", description: "[NEW v2.0] Create dialogue session state for slot collection. Returns session_id and slot classification", inputSchema: zodToJsonSchema(z.object({ entity: z.string(), schema: z.object({ entity: z.string(), fields: z.array(FieldSchema) }).optional(), initial_slots: z.record(z.unknown()).optional(), metadata: z.record(z.unknown()).optional() })) },
    { name: "dialogue_state_update", description: "[NEW v2.0] Update dialogue session with slot value. Returns updated state and next slot", inputSchema: zodToJsonSchema(z.object({ session_id: z.string(), slot_name: z.string(), slot_value: z.unknown(), action: z.enum(["collect", "modify", "clear"]).optional().default("collect") })) },
    { name: "dialogue_state_get", description: "[NEW v2.0] Get current dialogue session state", inputSchema: zodToJsonSchema(z.object({ session_id: z.string() })) },
    { name: "user_confirm", description: "[NEW v2.0] Create confirmation request for user verification. Returns request_id", inputSchema: zodToJsonSchema(z.object({ session_id: z.string(), message: z.string(), data: z.record(z.unknown()), timeout_seconds: z.number().optional().default(300) })) },
    { name: "user_confirm_response", description: "[NEW v2.0] Submit user response to confirmation request", inputSchema: zodToJsonSchema(z.object({ request_id: z.string(), response: z.enum(["confirmed", "rejected", "timeout"]), feedback: z.string().optional() })) },
    { name: "handle_interruption", description: "[NEW v2.0] Handle user interruption. Detects intent (pause/correction/topic_change/cancel/question) and recommends action", inputSchema: zodToJsonSchema(z.object({ session_id: z.string(), user_message: z.string(), action: z.enum(["analyze", "recover", "abort", "pause"]).optional().default("analyze") })) },
    { name: "propose_human_intervention", description: "Trigger HITL for sensitive operations or conflicts", inputSchema: zodToJsonSchema(z.object({ issue_type: z.enum(["duplicate_detection", "sensitive_field", "validation_failure", "user_request", "schema_conflict", "interruption_recovery"]), current_data: z.record(z.unknown()), session_id: z.string().optional(), context: z.record(z.unknown()).optional() })) },
    { name: "dialogue_history_add", description: "[NEW v2.0] Add turn to dialogue history", inputSchema: zodToJsonSchema(z.object({ session_id: z.string(), role: z.enum(["user", "assistant", "system"]), content: z.string(), intent: z.string().optional(), slots: z.record(z.unknown()).optional(), action: z.string().optional() })) },
    { name: "dialogue_history_get", description: "[NEW v2.0] Retrieve dialogue history", inputSchema: zodToJsonSchema(z.object({ session_id: z.string(), limit: z.number().optional().default(50) })) },
    { name: "next_action_recommend", description: "[NEW v2.0] Get recommended next action based on dialogue state", inputSchema: zodToJsonSchema(z.object({ session_id: z.string(), schema: z.object({ entity: z.string(), fields: z.array(FieldSchema) }).optional() })) },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    switch (name) {
      case "inspect_datasource": {
        const parsed = z.object({ uri: z.string(), include_relationships: z.boolean().optional().default(true) }).parse(args);
        let result: any;
        if (fs.existsSync(parsed.uri)) result = parseExcelFile(parsed.uri);
        else if (parsed.uri.toUpperCase().includes("CREATE TABLE")) result = parseSQLDDL(parsed.uri);
        else { try { const j = JSON.parse(parsed.uri); result = { entity: j.entity || "unknown", fields: j.fields || [], relationships: j.relationships || [] }; } catch { result = { entity: "inferred", fields: [], relationships: [], _note: "Provide SQL DDL, file path, or JSON schema" }; } }
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      
      case "get_data_schema": {
        const parsed = z.object({ source: z.string() }).parse(args);
        let result: any;
        if (fs.existsSync(parsed.source)) result = parseExcelFile(parsed.source);
        else if (parsed.source.toUpperCase().includes("CREATE TABLE")) result = parseSQLDDL(parsed.source);
        else { try { const j = JSON.parse(parsed.source); result = { entity: j.entity || "unknown", fields: j.fields || [], relationships: j.relationships || [] }; } catch { result = { entity: "inferred", fields: [], relationships: [] }; } }
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      
      case "validate_against_schema": {
        const parsed = z.object({ data_json: z.record(z.unknown()), schema: z.object({ entity: z.string(), fields: z.array(FieldSchema) }) }).parse(args);
        const errors: string[] = [], warnings: string[] = [];
        for (const field of parsed.schema.fields) {
          const value = parsed.data_json[field.name];
          if (field.required && (value === undefined || value === null || value === "")) { errors.push(`Field '${field.name}' is required`); continue; }
          if (value === undefined || value === null) { if (field.default !== undefined) warnings.push(`Field '${field.name}' using default`); continue; }
          if (field.enum && !field.enum.includes(String(value))) errors.push(`Field '${field.name}' value not in allowed: ${field.enum.join(", ")}`);
          if (field.type === "NUMBER" && typeof value === "string" && isNaN(Number(value))) errors.push(`Field '${field.name}' should be number`);
        }
        return { content: [{ type: "text", text: JSON.stringify({ valid: errors.length === 0, errors, warnings, ready_for_write: errors.length === 0 && !warnings.some(w => w.includes("default")) }, null, 2) }] };
      }
      
      case "check_duplicate_records": {
        const parsed = z.object({ current_data: z.record(z.unknown()), existing_records: z.array(z.record(z.unknown())), threshold: z.number().min(0).max(1).optional().default(0.8) }).parse(args);
        const duplicates: any[] = [];
        for (const record of parsed.existing_records) {
          const similarity = calculateSimilarity(parsed.current_data, record);
          if (similarity >= parsed.threshold) {
            const matchingFields = Object.keys(parsed.current_data).filter(key => String(parsed.current_data[key]).toLowerCase() === String(record[key]).toLowerCase());
            duplicates.push({ record, similarity, matching_fields: matchingFields });
          }
        }
        return { content: [{ type: "text", text: JSON.stringify({ has_duplicates: duplicates.length > 0, duplicate_count: duplicates.length, duplicates: duplicates.sort((a, b) => b.similarity - a.similarity), threshold_used: parsed.threshold }, null, 2) }] };
      }
      
      case "dialogue_state_create": {
        const parsed = z.object({ entity: z.string(), schema: z.object({ entity: z.string(), fields: z.array(FieldSchema) }).optional(), initial_slots: z.record(z.unknown()).optional(), metadata: z.record(z.unknown()).optional() }).parse(args);
        const sessionId = generateId("dialogue");
        const hardSlots: string[] = [], softSlots: string[] = [], hiddenSlots: string[] = [];
        if (parsed.schema) {
          for (const field of parsed.schema.fields) {
            if (field.default !== undefined) hiddenSlots.push(field.name);
            else if (field.required) hardSlots.push(field.name);
            else softSlots.push(field.name);
          }
        }
        const state: DialogueState = { sessionId, entity: parsed.entity, collectedSlots: parsed.initial_slots || {}, currentSlot: hardSlots[0] || softSlots[0] || null, completedSlots: [], pendingSlots: [...hardSlots, ...softSlots], status: "active", interruptionCount: 0, lastUpdated: Date.now(), metadata: parsed.metadata || {} };
        dialogueStates.set(sessionId, state);
        dialogueHistory.set(sessionId, []);
        return { content: [{ type: "text", text: JSON.stringify({ session_id: sessionId, state: { entity: state.entity, status: state.status, collected_slots: state.collectedSlots, pending_slots: state.pendingSlots, completed_slots: state.completedSlots, current_slot: state.currentSlot }, slot_classification: { hard_slots: hardSlots, soft_slots: softSlots, hidden_slots: hiddenSlots } }, null, 2) }] };
      }
      
      case "dialogue_state_update": {
        const parsed = z.object({ session_id: z.string(), slot_name: z.string(), slot_value: z.unknown(), action: z.enum(["collect", "modify", "clear"]).optional().default("collect") }).parse(args);
        const state = dialogueStates.get(parsed.session_id);
        if (!state) return { content: [{ type: "text", text: JSON.stringify({ error: "Session not found", session_id: parsed.session_id }, null, 2) }], isError: true };
        if (parsed.action === "clear") { delete state.collectedSlots[parsed.slot_name]; state.completedSlots = state.completedSlots.filter(s => s !== parsed.slot_name); }
        else { state.collectedSlots[parsed.slot_name] = parsed.slot_value; if (!state.completedSlots.includes(parsed.slot_name)) state.completedSlots.push(parsed.slot_name); }
        state.currentSlot = getNextSlot(state.pendingSlots, state.completedSlots, []);
        state.lastUpdated = Date.now();
        const isComplete = state.pendingSlots.filter(s => !state.completedSlots.includes(s)).length === 0;
        if (isComplete && state.status === "active") state.status = "confirmed";
        dialogueStates.set(parsed.session_id, state);
        return { content: [{ type: "text", text: JSON.stringify({ session_id: parsed.session_id, updated: true, slot: parsed.slot_name, value: parsed.slot_value, action: parsed.action, state: { status: state.status, collected_slots: state.collectedSlots, completed_slots: state.completedSlots, pending_slots: state.pendingSlots.filter(s => !state.completedSlots.includes(s)), current_slot: state.currentSlot }, is_complete: isComplete }, null, 2) }] };
      }
      
      case "dialogue_state_get": {
        const parsed = z.object({ session_id: z.string() }).parse(args);
        const state = dialogueStates.get(parsed.session_id);
        if (!state) return { content: [{ type: "text", text: JSON.stringify({ error: "Session not found", session_id: parsed.session_id }, null, 2) }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify({ session_id: state.sessionId, entity: state.entity, status: state.status, collected_slots: state.collectedSlots, completed_slots: state.completedSlots, pending_slots: state.pendingSlots.filter(s => !state.completedSlots.includes(s)), current_slot: state.currentSlot, interruption_count: state.interruptionCount, last_updated: new Date(state.lastUpdated).toISOString() }, null, 2) }] };
      }
      
      case "user_confirm": {
        const parsed = z.object({ session_id: z.string(), message: z.string(), data: z.record(z.unknown()), timeout_seconds: z.number().optional().default(300) }).parse(args);
        const requestId = generateId("confirm");
        confirmationRequests.set(requestId, { requestId, sessionId: parsed.session_id, message: parsed.message, data: parsed.data, status: "pending", createdAt: Date.now(), timeoutSeconds: parsed.timeout_seconds });
        const state = dialogueStates.get(parsed.session_id);
        if (state) { state.status = "confirmed"; dialogueStates.set(parsed.session_id, state); }
        return { content: [{ type: "text", text: JSON.stringify({ request_id: requestId, session_id: parsed.session_id, status: "pending", message: parsed.message, data: parsed.data, timeout_seconds: parsed.timeout_seconds, expires_at: new Date(Date.now() + parsed.timeout_seconds * 1000).toISOString(), instructions: "Present this to user and call user_confirm_response with their answer" }, null, 2) }] };
      }
      
      case "user_confirm_response": {
        const parsed = z.object({ request_id: z.string(), response: z.enum(["confirmed", "rejected", "timeout"]), feedback: z.string().optional() }).parse(args);
        const confirmation = confirmationRequests.get(parsed.request_id);
        if (!confirmation) return { content: [{ type: "text", text: JSON.stringify({ error: "Confirmation request not found", request_id: parsed.request_id }, null, 2) }], isError: true };
        confirmation.status = parsed.response;
        confirmationRequests.set(parsed.request_id, confirmation);
        const state = dialogueStates.get(confirmation.sessionId);
        if (state) { state.status = parsed.response === "confirmed" ? "submitted" : "abandoned"; dialogueStates.set(confirmation.sessionId, state); }
        return { content: [{ type: "text", text: JSON.stringify({ request_id: parsed.request_id, response: parsed.response, feedback: parsed.feedback, session_status: state?.status }, null, 2) }] };
      }
      
      case "handle_interruption": {
        const parsed = z.object({ session_id: z.string(), user_message: z.string(), action: z.enum(["analyze", "recover", "abort", "pause"]).optional().default("analyze") }).parse(args);
        const state = dialogueStates.get(parsed.session_id);
        const interruption = detectInterruptionIntent(parsed.user_message);
        const result: any = { session_id: parsed.session_id, user_message: parsed.user_message, is_interruption: interruption.isInterruption, detected_intent: interruption.intent };
        if (!state) { result.error = "Session not found"; return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; }
        state.interruptionCount++;
        switch (parsed.action) {
          case "analyze": result.recommended_action = interruption.intent === "cancel" ? "abort" : interruption.intent === "topic_change" ? "recover_with_context" : interruption.intent === "question" ? "answer_and_resume" : "pause_and_resume"; break;
          case "recover": state.status = "active"; state.currentSlot = getNextSlot(state.pendingSlots, state.completedSlots, []); result.recovery_message = `好的，我们继续。${state.currentSlot ? `接下来请提供${state.currentSlot}。` : "所有信息已收集完成。"}`; break;
          case "abort": state.status = "abandoned"; result.message = "对话已取消"; break;
          case "pause": state.status = "interrupted"; result.message = "对话已暂停，准备好后请说'继续'"; break;
        }
        dialogueStates.set(parsed.session_id, state);
        result.session_status = state.status;
        result.interruption_count = state.interruptionCount;
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      
      case "propose_human_intervention": {
        const parsed = z.object({ issue_type: z.enum(["duplicate_detection", "sensitive_field", "validation_failure", "user_request", "schema_conflict", "interruption_recovery"]), current_data: z.record(z.unknown()), session_id: z.string().optional(), context: z.record(z.unknown()).optional() }).parse(args);
        const interventionId = generateId("HITL");
        const isSensitive = parsed.issue_type === "sensitive_field" || containsSensitiveFields(parsed.current_data);
        return { content: [{ type: "text", text: JSON.stringify({ intervention_id: interventionId, status: "pending_review", assigned_to: "human_agent_queue", issue_type: parsed.issue_type, reason: isSensitive ? "Sensitive field detected - requires human approval" : undefined, estimated_wait: "5 minutes", current_data: parsed.current_data, context: parsed.context }, null, 2) }] };
      }
      
      case "dialogue_history_add": {
        const parsed = z.object({ session_id: z.string(), role: z.enum(["user", "assistant", "system"]), content: z.string(), intent: z.string().optional(), slots: z.record(z.unknown()).optional(), action: z.string().optional() }).parse(args);
        const turn: DialogueTurn = { turnId: generateId("turn"), sessionId: parsed.session_id, role: parsed.role, content: parsed.content, timestamp: Date.now(), intent: parsed.intent, slots: parsed.slots, action: parsed.action };
        let history = dialogueHistory.get(parsed.session_id);
        if (!history) { history = []; dialogueHistory.set(parsed.session_id, history); }
        history.push(turn);
        return { content: [{ type: "text", text: JSON.stringify({ success: true, turn_id: turn.turnId, timestamp: new Date(turn.timestamp).toISOString() }, null, 2) }] };
      }
      
      case "dialogue_history_get": {
        const parsed = z.object({ session_id: z.string(), limit: z.number().optional().default(50) }).parse(args);
        const history = dialogueHistory.get(parsed.session_id);
        if (!history) return { content: [{ type: "text", text: JSON.stringify({ error: "No history found", session_id: parsed.session_id }, null, 2) }] };
        return { content: [{ type: "text", text: JSON.stringify({ session_id: parsed.session_id, turn_count: history.length, history: history.slice(-parsed.limit) }, null, 2) }] };
      }
      
      case "next_action_recommend": {
        const parsed = z.object({ session_id: z.string(), schema: z.object({ entity: z.string(), fields: z.array(FieldSchema) }).optional() }).parse(args);
        const state = dialogueStates.get(parsed.session_id);
        if (!state) return { content: [{ type: "text", text: JSON.stringify({ error: "Session not found", session_id: parsed.session_id }, null, 2) }], isError: true };
        
        const pendingSlots = state.pendingSlots.filter(s => !state.completedSlots.includes(s));
        const recommendation: any = { session_id: parsed.session_id, current_status: state.status, collected_count: state.completedSlots.length, pending_count: pendingSlots.length };
        
        if (state.status === "active") {
          if (pendingSlots.length > 0) {
            recommendation.action = "ask_slot";
            recommendation.next_slot = state.currentSlot || pendingSlots[0];
            recommendation.reason = "Continue collecting required information";
          } else {
            recommendation.action = "confirm_and_submit";
            recommendation.reason = "All slots collected, ready for confirmation";
          }
        } else if (state.status === "interrupted") {
          recommendation.action = "recover_dialogue";
          recommendation.reason = "Dialogue was interrupted, needs recovery";
        } else if (state.status === "confirmed") {
          recommendation.action = "submit_data";
          recommendation.reason = "Data confirmed, ready for submission";
        } else if (state.status === "abandoned") {
          recommendation.action = "restart_or_close";
          recommendation.reason = "User abandoned the dialogue";
        } else if (state.status === "submitted") {
          recommendation.action = "complete";
          recommendation.reason = "Dialogue completed successfully";
        }
        
        recommendation.collected_slots = state.collectedSlots;
        recommendation.pending_slots = pendingSlots;
        return { content: [{ type: "text", text: JSON.stringify(recommendation, null, 2) }] };
      }
      
      default:
        return { content: [{ type: "text", text: JSON.stringify({ error: `Unknown tool: ${name}` }, null, 2) }], isError: true };
    }
  } catch (error: any) {
    return { content: [{ type: "text", text: JSON.stringify({ error: error.message || "Unknown error" }, null, 2) }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Task Dialogue MCP Server v2.0 running on stdio");
}

main().catch(console.error);
