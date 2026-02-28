#!/usr/bin/env node

/**
 * Human-in-the-Loop MCP Server v1.0
 * 
 * Dedicated MCP for human approval, confirmation, and intervention workflows.
 * Can be used independently or with task-dialogue-mcp for comprehensive HITL scenarios.
 * 
 * Capabilities:
 * - Approval requests (create, query, respond, batch)
 * - Confirmation workflows
 * - Multi-choice selections
 * - Notification channels (extensible)
 * - Audit trail and history
 * - Timeout handling
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// ============================================================================
// Types
// ============================================================================

/**
 * Approval request types
 */
const ApprovalType = z.enum([
  "confirmation",      // Simple yes/no confirmation
  "approval",          // Formal approval (manager, admin)
  "selection",         // User must choose from options
  "data_review",       // Review and approve/modify data
  "intervention",      // Human intervention for edge cases
  "escalation",        // Escalated issue requiring human decision
]);

/**
 * Approval status
 */
const ApprovalStatus = z.enum([
  "pending",
  "approved",
  "rejected",
  "modified",
  "escalated",
  "timeout",
  "cancelled",
]);

/**
 * Priority levels
 */
const Priority = z.enum(["low", "normal", "high", "critical"]);

/**
 * Approval request structure
 */
interface ApprovalRequest {
  requestId: string;
  type: z.infer<typeof ApprovalType>;
  title: string;
  description: string;
  data: Record<string, unknown>;
  options?: Array<{
    id: string;
    label: string;
    description?: string;
    value?: unknown;
  }>;
  status: z.infer<typeof ApprovalStatus>;
  priority: z.infer<typeof Priority>;
  createdAt: number;
  expiresAt: number;
  assignee?: string;
  sessionId?: string;
  metadata: Record<string, unknown>;
  response?: {
    decision: string;
    feedback?: string;
    modifiedData?: Record<string, unknown>;
    respondedAt: number;
  };
}

// In-memory stores (replace with persistent storage in production)
const approvalRequests = new Map<string, ApprovalRequest>();
const approvalHistory: Array<{
  requestId: string;
  event: string;
  timestamp: number;
  details?: Record<string, unknown>;
}> = [];

// ============================================================================
// Utilities
// ============================================================================

function generateId(prefix: string = "id"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function logEvent(requestId: string, event: string, details?: Record<string, unknown>) {
  approvalHistory.push({
    requestId,
    event,
    timestamp: Date.now(),
    details,
  });
}

function getDefaultTimeout(priority: z.infer<typeof Priority>): number {
  switch (priority) {
    case "critical": return 5 * 60 * 1000;   // 5 minutes
    case "high": return 30 * 60 * 1000;      // 30 minutes
    case "normal": return 4 * 60 * 60 * 1000; // 4 hours
    case "low": return 24 * 60 * 60 * 1000;  // 24 hours
    default: return 4 * 60 * 60 * 1000;
  }
}

function checkTimeouts() {
  const now = Date.now();
  for (const [id, request] of approvalRequests.entries()) {
    if (request.status === "pending" && now > request.expiresAt) {
      request.status = "timeout";
      approvalRequests.set(id, request);
      logEvent(id, "timeout", { expiresAt: request.expiresAt });
    }
  }
}

// ============================================================================
// MCP Server
// ============================================================================

const server = new Server(
  { name: "human-in-the-loop-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ===== Core Approval Tools =====
    {
      name: "create_approval_request",
      description: "Create a new approval request for human review. Supports confirmation, approval, selection, data_review, intervention, and escalation types.",
      inputSchema: zodToJsonSchema(z.object({
        type: z.enum(["confirmation", "approval", "selection", "data_review", "intervention", "escalation"]),
        title: z.string().describe("Short title for the approval request"),
        description: z.string().describe("Detailed description of what needs approval"),
        data: z.record(z.unknown()).describe("Data to be approved/reviewed"),
        options: z.array(z.object({
          id: z.string(),
          label: z.string(),
          description: z.string().optional(),
          value: z.unknown().optional(),
        })).optional().describe("Options for selection type"),
        priority: z.enum(["low", "normal", "high", "critical"]).optional().default("normal"),
        timeout_seconds: z.number().optional().describe("Override default timeout"),
        assignee: z.string().optional().describe("Specific person to assign to"),
        session_id: z.string().optional().describe("Related session ID (e.g., from task-dialogue-mcp)"),
        metadata: z.record(z.unknown()).optional(),
      })),
    },
    {
      name: "get_approval_request",
      description: "Get details of a specific approval request by ID.",
      inputSchema: zodToJsonSchema(z.object({
        request_id: z.string().describe("Approval request ID"),
      })),
    },
    {
      name: "list_approval_requests",
      description: "List approval requests with optional filtering by status, type, or assignee.",
      inputSchema: zodToJsonSchema(z.object({
        status: z.enum(["pending", "approved", "rejected", "modified", "escalated", "timeout", "cancelled"]).optional(),
        type: z.enum(["confirmation", "approval", "selection", "data_review", "intervention", "escalation"]).optional(),
        assignee: z.string().optional(),
        limit: z.number().optional().default(50),
      })),
    },
    {
      name: "respond_to_approval",
      description: "Submit a response to an approval request (approve, reject, modify, escalate).",
      inputSchema: zodToJsonSchema(z.object({
        request_id: z.string().describe("Approval request ID"),
        decision: z.enum(["approved", "rejected", "modified", "escalated"]).describe("Decision made"),
        feedback: z.string().optional().describe("Optional feedback or reason"),
        modified_data: z.record(z.unknown()).optional().describe("Modified data (for 'modified' decision)"),
      })),
    },
    {
      name: "cancel_approval_request",
      description: "Cancel a pending approval request.",
      inputSchema: zodToJsonSchema(z.object({
        request_id: z.string().describe("Approval request ID"),
        reason: z.string().optional().describe("Reason for cancellation"),
      })),
    },
    
    // ===== Batch Operations =====
    {
      name: "batch_approve",
      description: "Approve multiple requests at once (for same decision type).",
      inputSchema: zodToJsonSchema(z.object({
        request_ids: z.array(z.string()).describe("List of request IDs to approve"),
        decision: z.enum(["approved", "rejected"]).describe("Decision to apply to all"),
        feedback: z.string().optional(),
      })),
    },
    
    // ===== Selection Tools =====
    {
      name: "create_selection_request",
      description: "Create a selection request where user must choose from multiple options. Shortcut for type='selection'.",
      inputSchema: zodToJsonSchema(z.object({
        title: z.string(),
        description: z.string(),
        options: z.array(z.object({
          id: z.string(),
          label: z.string(),
          description: z.string().optional(),
          value: z.unknown().optional(),
        })),
        allow_multiple: z.boolean().optional().default(false),
        priority: z.enum(["low", "normal", "high", "critical"]).optional().default("normal"),
        session_id: z.string().optional(),
        metadata: z.record(z.unknown()).optional(),
      })),
    },
    
    // ===== Data Review Tools =====
    {
      name: "create_data_review_request",
      description: "Create a data review request where human can review and optionally modify data before approval.",
      inputSchema: zodToJsonSchema(z.object({
        title: z.string(),
        description: z.string(),
        data: z.record(z.unknown()),
        editable_fields: z.array(z.string()).optional().describe("Fields that can be modified by reviewer"),
        validation_schema: z.record(z.unknown()).optional().describe("Schema to validate modified data"),
        priority: z.enum(["low", "normal", "high", "critical"]).optional().default("normal"),
        session_id: z.string().optional(),
        metadata: z.record(z.unknown()).optional(),
      })),
    },
    
    // ===== Escalation Tools =====
    {
      name: "escalate_request",
      description: "Escalate an existing approval request to higher priority or different assignee.",
      inputSchema: zodToJsonSchema(z.object({
        request_id: z.string(),
        new_priority: z.enum(["low", "normal", "high", "critical"]).optional(),
        new_assignee: z.string().optional(),
        reason: z.string().optional(),
      })),
    },
    
    // ===== History & Audit =====
    {
      name: "get_approval_history",
      description: "Get audit history for an approval request or global history.",
      inputSchema: zodToJsonSchema(z.object({
        request_id: z.string().optional().describe("Specific request ID, or omit for global history"),
        limit: z.number().optional().default(100),
      })),
    },
    {
      name: "get_approval_stats",
      description: "Get statistics about approval requests (pending count, approval rate, avg response time, etc.).",
      inputSchema: zodToJsonSchema(z.object({
        time_range_hours: z.number().optional().default(24),
      })),
    },
    
    // ===== Integration Tools =====
    {
      name: "link_to_session",
      description: "Link an approval request to a session (e.g., from task-dialogue-mcp).",
      inputSchema: zodToJsonSchema(z.object({
        request_id: z.string(),
        session_id: z.string(),
        session_type: z.string().optional().default("dialogue"),
      })),
    },
    {
      name: "get_session_approvals",
      description: "Get all approval requests linked to a session.",
      inputSchema: zodToJsonSchema(z.object({
        session_id: z.string(),
        include_history: z.boolean().optional().default(false),
      })),
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    // Check for timeouts before processing
    checkTimeouts();
    
    switch (name) {
      // ===== Core Approval Tools =====
      case "create_approval_request": {
        const parsed = z.object({
          type: ApprovalType,
          title: z.string(),
          description: z.string(),
          data: z.record(z.unknown()),
          options: z.array(z.object({
            id: z.string(),
            label: z.string(),
            description: z.string().optional(),
            value: z.unknown().optional(),
          })).optional(),
          priority: Priority.optional().default("normal"),
          timeout_seconds: z.number().optional(),
          assignee: z.string().optional(),
          session_id: z.string().optional(),
          metadata: z.record(z.unknown()).optional(),
        }).parse(args);
        
        const requestId = generateId("approval");
        const timeout = parsed.timeout_seconds 
          ? parsed.timeout_seconds * 1000 
          : getDefaultTimeout(parsed.priority);
        
        const approvalRequest: ApprovalRequest = {
          requestId,
          type: parsed.type,
          title: parsed.title,
          description: parsed.description,
          data: parsed.data,
          options: parsed.options,
          status: "pending",
          priority: parsed.priority,
          createdAt: Date.now(),
          expiresAt: Date.now() + timeout,
          assignee: parsed.assignee,
          sessionId: parsed.session_id,
          metadata: parsed.metadata || {},
        };
        
        approvalRequests.set(requestId, approvalRequest);
        logEvent(requestId, "created", { type: parsed.type, priority: parsed.priority });
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              request_id: requestId,
              status: "pending",
              type: parsed.type,
              title: parsed.title,
              priority: parsed.priority,
              expires_at: new Date(approvalRequest.expiresAt).toISOString(),
              assignee: parsed.assignee,
              session_id: parsed.session_id,
              data: parsed.data,
              options: parsed.options,
              instructions: getInstructions(parsed.type),
            }, null, 2),
          }],
        };
      }
      
      case "get_approval_request": {
        const parsed = z.object({ request_id: z.string() }).parse(args);
        const request = approvalRequests.get(parsed.request_id);
        
        if (!request) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "Request not found", request_id: parsed.request_id }, null, 2) }],
            isError: true,
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify({
            ...request,
            created_at: new Date(request.createdAt).toISOString(),
            expires_at: new Date(request.expiresAt).toISOString(),
          }, null, 2) }],
        };
      }
      
      case "list_approval_requests": {
        const parsed = z.object({
          status: ApprovalStatus.optional(),
          type: ApprovalType.optional(),
          assignee: z.string().optional(),
          limit: z.number().optional().default(50),
        }).parse(args);
        
        let requests = Array.from(approvalRequests.values());
        
        if (parsed.status) {
          requests = requests.filter(r => r.status === parsed.status);
        }
        if (parsed.type) {
          requests = requests.filter(r => r.type === parsed.type);
        }
        if (parsed.assignee) {
          requests = requests.filter(r => r.assignee === parsed.assignee);
        }
        
        // Sort by priority and created time
        const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
        requests.sort((a, b) => {
          if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
            return priorityOrder[a.priority] - priorityOrder[b.priority];
          }
          return b.createdAt - a.createdAt;
        });
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              count: Math.min(requests.length, parsed.limit),
              total: requests.length,
              requests: requests.slice(0, parsed.limit).map(r => ({
                request_id: r.requestId,
                type: r.type,
                title: r.title,
                status: r.status,
                priority: r.priority,
                created_at: new Date(r.createdAt).toISOString(),
                assignee: r.assignee,
              })),
            }, null, 2),
          }],
        };
      }
      
      case "respond_to_approval": {
        const parsed = z.object({
          request_id: z.string(),
          decision: z.enum(["approved", "rejected", "modified", "escalated"]),
          feedback: z.string().optional(),
          modified_data: z.record(z.unknown()).optional(),
        }).parse(args);
        
        const request = approvalRequests.get(parsed.request_id);
        if (!request) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "Request not found", request_id: parsed.request_id }, null, 2) }],
            isError: true,
          };
        }
        
        if (request.status !== "pending") {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "Request already responded", status: request.status }, null, 2) }],
            isError: true,
          };
        }
        
        request.status = parsed.decision;
        request.response = {
          decision: parsed.decision,
          feedback: parsed.feedback,
          modifiedData: parsed.modified_data,
          respondedAt: Date.now(),
        };
        
        approvalRequests.set(parsed.request_id, request);
        logEvent(parsed.request_id, "responded", { decision: parsed.decision, feedback: parsed.feedback });
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              request_id: parsed.request_id,
              decision: parsed.decision,
              feedback: parsed.feedback,
              modified_data: parsed.modified_data,
              status: request.status,
              responded_at: new Date(request.response.respondedAt).toISOString(),
            }, null, 2),
          }],
        };
      }
      
      case "cancel_approval_request": {
        const parsed = z.object({
          request_id: z.string(),
          reason: z.string().optional(),
        }).parse(args);
        
        const request = approvalRequests.get(parsed.request_id);
        if (!request) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "Request not found", request_id: parsed.request_id }, null, 2) }],
            isError: true,
          };
        }
        
        if (request.status !== "pending") {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "Cannot cancel non-pending request", status: request.status }, null, 2) }],
            isError: true,
          };
        }
        
        request.status = "cancelled";
        approvalRequests.set(parsed.request_id, request);
        logEvent(parsed.request_id, "cancelled", { reason: parsed.reason });
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              request_id: parsed.request_id,
              status: "cancelled",
              reason: parsed.reason,
            }, null, 2),
          }],
        };
      }
      
      // ===== Batch Operations =====
      case "batch_approve": {
        const parsed = z.object({
          request_ids: z.array(z.string()),
          decision: z.enum(["approved", "rejected"]),
          feedback: z.string().optional(),
        }).parse(args);
        
        const results: Array<{ request_id: string; success: boolean; error?: string }> = [];
        
        for (const requestId of parsed.request_ids) {
          const request = approvalRequests.get(requestId);
          if (!request || request.status !== "pending") {
            results.push({ request_id: requestId, success: false, error: "Not found or not pending" });
            continue;
          }
          
          request.status = parsed.decision;
          request.response = {
            decision: parsed.decision,
            feedback: parsed.feedback,
            respondedAt: Date.now(),
          };
          approvalRequests.set(requestId, request);
          logEvent(requestId, "batch_responded", { decision: parsed.decision });
          results.push({ request_id: requestId, success: true });
        }
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              total: parsed.request_ids.length,
              processed: results.filter(r => r.success).length,
              failed: results.filter(r => !r.success).length,
              results,
            }, null, 2),
          }],
        };
      }
      
      // ===== Selection Tools =====
      case "create_selection_request": {
        const parsed = z.object({
          title: z.string(),
          description: z.string(),
          options: z.array(z.object({
            id: z.string(),
            label: z.string(),
            description: z.string().optional(),
            value: z.unknown().optional(),
          })),
          allow_multiple: z.boolean().optional().default(false),
          priority: Priority.optional().default("normal"),
          session_id: z.string().optional(),
          metadata: z.record(z.unknown()).optional(),
        }).parse(args);
        
        // Delegate to create_approval_request
        return server.getRequestHandler(CallToolRequestSchema)({
          params: {
            name: "create_approval_request",
            arguments: {
              type: "selection",
              title: parsed.title,
              description: parsed.description,
              data: { allow_multiple: parsed.allow_multiple },
              options: parsed.options,
              priority: parsed.priority,
              session_id: parsed.session_id,
              metadata: parsed.metadata,
            },
          },
        } as any);
      }
      
      // ===== Data Review Tools =====
      case "create_data_review_request": {
        const parsed = z.object({
          title: z.string(),
          description: z.string(),
          data: z.record(z.unknown()),
          editable_fields: z.array(z.string()).optional(),
          validation_schema: z.record(z.unknown()).optional(),
          priority: Priority.optional().default("normal"),
          session_id: z.string().optional(),
          metadata: z.record(z.unknown()).optional(),
        }).parse(args);
        
        // Delegate to create_approval_request
        return server.getRequestHandler(CallToolRequestSchema)({
          params: {
            name: "create_approval_request",
            arguments: {
              type: "data_review",
              title: parsed.title,
              description: parsed.description,
              data: {
                ...parsed.data,
                _editable_fields: parsed.editable_fields,
                _validation_schema: parsed.validation_schema,
              },
              priority: parsed.priority,
              session_id: parsed.session_id,
              metadata: parsed.metadata,
            },
          },
        } as any);
      }
      
      // ===== Escalation Tools =====
      case "escalate_request": {
        const parsed = z.object({
          request_id: z.string(),
          new_priority: Priority.optional(),
          new_assignee: z.string().optional(),
          reason: z.string().optional(),
        }).parse(args);
        
        const request = approvalRequests.get(parsed.request_id);
        if (!request) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "Request not found", request_id: parsed.request_id }, null, 2) }],
            isError: true,
          };
        }
        
        const oldPriority = request.priority;
        const oldAssignee = request.assignee;
        
        if (parsed.new_priority) request.priority = parsed.new_priority;
        if (parsed.new_assignee) request.assignee = parsed.new_assignee;
        
        request.status = "escalated";
        approvalRequests.set(parsed.request_id, request);
        logEvent(parsed.request_id, "escalated", {
          old_priority: oldPriority,
          new_priority: request.priority,
          old_assignee: oldAssignee,
          new_assignee: request.assignee,
          reason: parsed.reason,
        });
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              request_id: parsed.request_id,
              status: "escalated",
              priority: request.priority,
              assignee: request.assignee,
              changes: {
                priority: oldPriority !== request.priority ? { from: oldPriority, to: request.priority } : undefined,
                assignee: oldAssignee !== request.assignee ? { from: oldAssignee, to: request.assignee } : undefined,
              },
            }, null, 2),
          }],
        };
      }
      
      // ===== History & Audit =====
      case "get_approval_history": {
        const parsed = z.object({
          request_id: z.string().optional(),
          limit: z.number().optional().default(100),
        }).parse(args);
        
        let history = approvalHistory;
        if (parsed.request_id) {
          history = history.filter(h => h.requestId === parsed.request_id);
        }
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              count: Math.min(history.length, parsed.limit),
              history: history.slice(-parsed.limit).map(h => ({
                ...h,
                timestamp: new Date(h.timestamp).toISOString(),
              })),
            }, null, 2),
          }],
        };
      }
      
      case "get_approval_stats": {
        const parsed = z.object({
          time_range_hours: z.number().optional().default(24),
        }).parse(args);
        
        const cutoff = Date.now() - (parsed.time_range_hours * 60 * 60 * 1000);
        const recentRequests = Array.from(approvalRequests.values()).filter(r => r.createdAt >= cutoff);
        
        const stats = {
          total: recentRequests.length,
          by_status: {
            pending: recentRequests.filter(r => r.status === "pending").length,
            approved: recentRequests.filter(r => r.status === "approved").length,
            rejected: recentRequests.filter(r => r.status === "rejected").length,
            modified: recentRequests.filter(r => r.status === "modified").length,
            escalated: recentRequests.filter(r => r.status === "escalated").length,
            timeout: recentRequests.filter(r => r.status === "timeout").length,
            cancelled: recentRequests.filter(r => r.status === "cancelled").length,
          },
          by_type: {} as Record<string, number>,
          by_priority: {} as Record<string, number>,
          approval_rate: 0,
          avg_response_time_ms: 0,
        };
        
        // Calculate by_type
        recentRequests.forEach(r => {
          stats.by_type[r.type] = (stats.by_type[r.type] || 0) + 1;
        });
        
        // Calculate by_priority
        recentRequests.forEach(r => {
          stats.by_priority[r.priority] = (stats.by_priority[r.priority] || 0) + 1;
        });
        
        // Calculate approval rate
        const responded = recentRequests.filter(r => r.status !== "pending");
        if (responded.length > 0) {
          stats.approval_rate = responded.filter(r => r.status === "approved" || r.status === "modified").length / responded.length;
        }
        
        // Calculate avg response time
        const withResponse = recentRequests.filter(r => r.response?.respondedAt);
        if (withResponse.length > 0) {
          const totalResponseTime = withResponse.reduce((sum, r) => sum + (r.response!.respondedAt - r.createdAt), 0);
          stats.avg_response_time_ms = totalResponseTime / withResponse.length;
        }
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              time_range_hours: parsed.time_range_hours,
              ...stats,
              approval_rate: `${(stats.approval_rate * 100).toFixed(1)}%`,
              avg_response_time: `${(stats.avg_response_time_ms / 1000).toFixed(1)}s`,
            }, null, 2),
          }],
        };
      }
      
      // ===== Integration Tools =====
      case "link_to_session": {
        const parsed = z.object({
          request_id: z.string(),
          session_id: z.string(),
          session_type: z.string().optional().default("dialogue"),
        }).parse(args);
        
        const request = approvalRequests.get(parsed.request_id);
        if (!request) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "Request not found", request_id: parsed.request_id }, null, 2) }],
            isError: true,
          };
        }
        
        request.sessionId = parsed.session_id;
        request.metadata = { ...request.metadata, session_type: parsed.session_type };
        approvalRequests.set(parsed.request_id, request);
        logEvent(parsed.request_id, "linked_to_session", { session_id: parsed.session_id, session_type: parsed.session_type });
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              request_id: parsed.request_id,
              session_id: parsed.session_id,
              session_type: parsed.session_type,
              linked: true,
            }, null, 2),
          }],
        };
      }
      
      case "get_session_approvals": {
        const parsed = z.object({
          session_id: z.string(),
          include_history: z.boolean().optional().default(false),
        }).parse(args);
        
        const requests = Array.from(approvalRequests.values())
          .filter(r => r.sessionId === parsed.session_id)
          .map(r => ({
            request_id: r.requestId,
            type: r.type,
            title: r.title,
            status: r.status,
            priority: r.priority,
            created_at: new Date(r.createdAt).toISOString(),
          }));
        
        const result: Record<string, unknown> = {
          session_id: parsed.session_id,
          count: requests.length,
          requests,
        };
        
        if (parsed.include_history) {
          result.history = approvalHistory
            .filter(h => {
              const req = approvalRequests.get(h.requestId);
              return req?.sessionId === parsed.session_id;
            })
            .map(h => ({ ...h, timestamp: new Date(h.timestamp).toISOString() }));
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }
      
      default:
        return {
          content: [{ type: "text", text: JSON.stringify({ error: `Unknown tool: ${name}` }, null, 2) }],
          isError: true,
        };
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: error.message || "Unknown error" }, null, 2) }],
      isError: true,
    };
  }
});

// Helper: Get instructions based on approval type
function getInstructions(type: z.infer<typeof ApprovalType>): string {
  switch (type) {
    case "confirmation":
      return "Present the confirmation message to the user and call respond_to_approval with 'approved' or 'rejected' based on their response.";
    case "approval":
      return "Route this approval request to the appropriate approver. Call respond_to_approval with the decision.";
    case "selection":
      return "Present the options to the user and call respond_to_approval with the selected option ID as 'modified_data'.";
    case "data_review":
      return "Allow the reviewer to examine and optionally modify the data. Call respond_to_approval with 'modified' decision and updated data if changes were made.";
    case "intervention":
      return "Human intervention required for edge case handling. Review the context and provide guidance or resolution.";
    case "escalation":
      return "This escalated issue requires senior-level decision. Review all context and make final determination.";
    default:
      return "Review and respond to this approval request.";
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Human-in-the-Loop MCP Server v1.0 running on stdio");
  
  // Periodic timeout check (every minute)
  setInterval(checkTimeouts, 60 * 1000);
}

main().catch(console.error);
