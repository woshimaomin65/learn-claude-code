#!/usr/bin/env node

/**
 * Task Dialogue MCP Server
 * 
 * Provides tools for task-oriented dialogue systems:
 * - inspect_datasource: Analyze data source schema
 * - validate_against_schema: Validate collected slots
 * - propose_human_intervention: Trigger HITL when needed
 * - get_data_schema: Alias for inspect_datasource
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// Schema Definitions
// ============================================================================

const FieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean().optional().default(false),
  unique: z.boolean().optional().default(false),
  default: z.unknown().optional(),
  enum: z.array(z.string()).optional().nullable(),
  description: z.string().optional(),
});

const SchemaResultSchema = z.object({
  entity: z.string(),
  fields: z.array(FieldSchema),
  relationships: z.array(z.object({
    field: z.string(),
    references: z.string(),
  })).optional(),
});

const ValidateRequestSchema = z.object({
  data_json: z.record(z.unknown()),
  schema: z.object({
    entity: z.string(),
    fields: z.array(FieldSchema),
  }),
});

const HITLRequestSchema = z.object({
  issue_type: z.enum([
    "duplicate_detection",
    "sensitive_field",
    "validation_failure",
    "user_request",
    "schema_conflict",
  ]),
  current_data: z.record(z.unknown()),
  context: z.record(z.unknown()).optional(),
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Parse SQL DDL to extract schema
 */
function parseSQLDDL(ddl: string): z.infer<typeof SchemaResultSchema> {
  const tableMatch = ddl.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["']?(\w+)["']?\s*\(/i);
  const entity = tableMatch ? tableMatch[1] : "unknown";
  
  const fields: z.infer<typeof FieldSchema>[] = [];
  
  // Extract field definitions
  const fieldPattern = /["']?(\w+)["']?\s+(\w+)(?:\s*\([^)]*\))?(.*?)(?:,|(?=\)))/gis;
  let match;
  
  while ((match = fieldPattern.exec(ddl)) !== null) {
    const fieldName = match[1];
    const fieldType = match[2].toUpperCase();
    const constraints = (match[3] || "").toUpperCase();
    
    // Skip PRIMARY KEY and other table-level constraints
    if (["PRIMARY", "FOREIGN", "UNIQUE", "CHECK", "CONSTRAINT"].some(k => constraints.trim().startsWith(k))) {
      continue;
    }
    
    const required = constraints.includes("NOT NULL");
    const unique = constraints.includes("UNIQUE");
    const autoIncrement = constraints.includes("AUTOINCREMENT") || constraints.includes("AUTO_INCREMENT");
    
    // Extract default value
    let defaultValue: unknown = undefined;
    const defaultMatch = match[3].match(/DEFAULT\s+['"]?([^'"\s,)]+)['"]?/i);
    if (defaultMatch) {
      const val = defaultMatch[1];
      defaultValue = val === "NULL" ? null : 
                     val === "TRUE" || val === "1" ? true :
                     val === "FALSE" || val === "0" ? false :
                     isNaN(Number(val)) ? val : Number(val);
    }
    
    // Extract enum values
    let enumValues: string[] | null = null;
    const enumMatch = match[3].match(/CHECK\s*\(\s*\w+\s+IN\s*\(([^)]+)\)/i);
    if (enumMatch) {
      enumValues = enumMatch[1]
        .split(",")
        .map(v => v.trim().replace(/['"]/g, ""));
    }
    
    // Skip auto-increment primary keys
    if (autoIncrement) {
      continue;
    }
    
    fields.push({
      name: fieldName,
      type: fieldType,
      required,
      unique,
      default: defaultValue,
      enum: enumValues,
    });
  }
  
  return { entity, fields, relationships: [] };
}

/**
 * Parse Excel/CSV file to extract schema
 */
function parseExcelFile(filePath: string): z.infer<typeof SchemaResultSchema> {
  const ext = path.extname(filePath).toLowerCase();
  const entity = path.basename(filePath, ext);
  
  if (ext === ".csv") {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n");
    if (lines.length === 0) {
      return { entity, fields: [], relationships: [] };
    }
    
    const headers = lines[0].split(",").map(h => h.trim().replace(/["']/g, ""));
    const fields: z.infer<typeof FieldSchema>[] = headers.map(name => ({
      name,
      type: "STRING",
      required: true,
    }));
    
    // Analyze data types from second row
    if (lines.length > 1) {
      const sampleValues = lines[1].split(",").map(v => v.trim());
      fields.forEach((field, i) => {
        const value = sampleValues[i];
        if (!isNaN(Number(value))) {
          field.type = "NUMBER";
        } else if (value === "true" || value === "false") {
          field.type = "BOOLEAN";
        }
      });
    }
    
    return { entity, fields, relationships: [] };
  }
  
  // For .xlsx files, return basic schema
  return {
    entity,
    fields: [{ name: "data", type: "OBJECT", required: true }],
    relationships: [],
  };
}

/**
 * Check for sensitive field names
 */
function containsSensitiveFields(data: Record<string, unknown>): boolean {
  const sensitivePatterns = [
    "password", "passwd", "secret", "token", "api_key", "apikey",
    "credit_card", "creditcard", "ssn", "social_security",
    "bank_account", "bankaccount", "payment", "billing",
    "is_admin", "admin", "privilege", "role",
  ];
  
  return Object.keys(data).some(key => 
    sensitivePatterns.some(pattern => 
      key.toLowerCase().includes(pattern)
    )
  );
}

/**
 * Calculate simple string similarity (Jaccard-like)
 */
function calculateSimilarity(obj1: Record<string, unknown>, obj2: Record<string, unknown>): number {
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  const commonKeys = keys1.filter(k => keys2.includes(k));
  
  if (commonKeys.length === 0) return 0;
  
  let matchCount = 0;
  commonKeys.forEach(key => {
    if (String(obj1[key]).toLowerCase() === String(obj2[key]).toLowerCase()) {
      matchCount++;
    }
  });
  
  return matchCount / Math.max(keys1.length, keys2.length);
}

// ============================================================================
// MCP Server Setup
// ============================================================================

const server = new Server(
  {
    name: "task-dialogue-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "inspect_datasource",
        description: "Analyze a data source (SQL DDL, Excel, CSV, JSON, or file path) and extract schema including fields, types, constraints, and relationships. Use this to understand the structure of your data before building dialogue flows.",
        inputSchema: zodToJsonSchema(
          z.object({
            uri: z.string().describe("Data source URI: file path, SQL DDL string, or JSON schema"),
            include_relationships: z.boolean().optional().default(true).describe("Include foreign key relationships"),
          })
        ),
      },
      {
        name: "validate_against_schema",
        description: "Validate collected slot values against a schema definition. Returns validation errors, warnings, and whether the data is ready for database write.",
        inputSchema: zodToJsonSchema(
          z.object({
            data_json: z.record(z.unknown()).describe("Collected slot values to validate"),
            schema: z.object({
              entity: z.string(),
              fields: z.array(FieldSchema),
            }).describe("Target schema definition"),
          })
        ),
      },
      {
        name: "propose_human_intervention",
        description: "Trigger Human-in-the-Loop (HITL) intervention for sensitive operations, conflicts, or validation failures. Returns intervention ID and status.",
        inputSchema: zodToJsonSchema(
          z.object({
            issue_type: z.enum([
              "duplicate_detection",
              "sensitive_field", 
              "validation_failure",
              "user_request",
              "schema_conflict",
            ]).describe("Type of intervention needed"),
            current_data: z.record(z.unknown()).describe("Current collected data"),
            context: z.record(z.unknown()).optional().describe("Additional context for human reviewer"),
          })
        ),
      },
      {
        name: "get_data_schema",
        description: "Alias for inspect_datasource. Analyze data structure for schema extraction.",
        inputSchema: zodToJsonSchema(
          z.object({
            source: z.string().describe("Data source: file path, SQL DDL, or description"),
          })
        ),
      },
      {
        name: "check_duplicate_records",
        description: "Check if the provided data matches any existing records (for duplicate detection). Returns similarity score and potential duplicates.",
        inputSchema: zodToJsonSchema(
          z.object({
            current_data: z.record(z.unknown()).describe("Data to check for duplicates"),
            existing_records: z.array(z.record(z.unknown())).describe("Existing records to compare against"),
            threshold: z.number().min(0).max(1).optional().default(0.8).describe("Similarity threshold for duplicate detection"),
          })
        ),
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    switch (name) {
      case "inspect_datasource": {
        const parsed = z.object({
          uri: z.string(),
          include_relationships: z.boolean().optional().default(true),
        }).parse(args);
        
        let result: z.infer<typeof SchemaResultSchema>;
        
        // Check if it's a file path
        if (fs.existsSync(parsed.uri)) {
          result = parseExcelFile(parsed.uri);
        }
        // Check if it's SQL DDL
        else if (parsed.uri.toUpperCase().includes("CREATE TABLE")) {
          result = parseSQLDDL(parsed.uri);
        }
        // Try to parse as JSON schema
        else {
          try {
            const jsonSchema = JSON.parse(parsed.uri);
            result = {
              entity: jsonSchema.entity || "unknown",
              fields: jsonSchema.fields || [],
              relationships: jsonSchema.relationships || [],
            };
          } catch {
            // Treat as description, return minimal schema
            result = {
              entity: "inferred_entity",
              fields: [],
              relationships: [],
              _note: "Input appears to be a description. Please provide SQL DDL, file path, or JSON schema for accurate extraction.",
            };
          }
        }
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
      
      case "validate_against_schema": {
        const parsed = ValidateRequestSchema.parse(args);
        
        const errors: string[] = [];
        const warnings: string[] = [];
        
        for (const field of parsed.schema.fields) {
          const value = parsed.data_json[field.name];
          
          // Check required fields
          if (field.required && (value === undefined || value === null || value === "")) {
            errors.push(`Field '${field.name}' is required but not provided`);
            continue;
          }
          
          // Skip if value is undefined and not required
          if (value === undefined || value === null) {
            if (field.default !== undefined) {
              warnings.push(`Field '${field.name}' not provided, using default '${field.default}'`);
            }
            continue;
          }
          
          // Check enum constraint
          if (field.enum && !field.enum.includes(String(value))) {
            errors.push(`Field '${field.name}' value '${value}' is not in allowed values: ${field.enum.join(", ")}`);
          }
          
          // Type checking (basic)
          if (field.type === "NUMBER" && typeof value === "string" && isNaN(Number(value))) {
            errors.push(`Field '${field.name}' should be a number but got '${value}'`);
          }
          
          if (field.type === "BOOLEAN" && typeof value !== "boolean") {
            warnings.push(`Field '${field.name}' should be a boolean, got '${value}' (type: ${typeof value})`);
          }
        }
        
        const valid = errors.length === 0;
        const readyForWrite = valid && !warnings.some(w => w.includes("not provided"));
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                valid,
                errors,
                warnings,
                ready_for_write: readyForWrite,
              }, null, 2),
            },
          ],
        };
      }
      
      case "propose_human_intervention": {
        const parsed = HITLRequestSchema.parse(args);
        
        const interventionId = `HITL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Check for sensitive fields
        if (parsed.issue_type === "sensitive_field" || containsSensitiveFields(parsed.current_data)) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  intervention_id: interventionId,
                  status: "pending_review",
                  assigned_to: "human_agent_queue",
                  issue_type: parsed.issue_type,
                  reason: "Sensitive field detected - requires human approval",
                  estimated_wait: "5 minutes",
                  current_data: parsed.current_data,
                  context: parsed.context,
                }, null, 2),
              },
            ],
          };
        }
        
        // Generic HITL response
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                intervention_id: interventionId,
                status: "pending_review",
                assigned_to: "human_agent_queue",
                issue_type: parsed.issue_type,
                estimated_wait: "5 minutes",
                current_data: parsed.current_data,
                context: parsed.context,
              }, null, 2),
            },
          ],
        };
      }
      
      case "get_data_schema": {
        const parsed = z.object({
          source: z.string(),
        }).parse(args);
        
        // Delegate to inspect_datasource logic
        let result: z.infer<typeof SchemaResultSchema>;
        
        if (fs.existsSync(parsed.source)) {
          result = parseExcelFile(parsed.source);
        } else if (parsed.source.toUpperCase().includes("CREATE TABLE")) {
          result = parseSQLDDL(parsed.source);
        } else {
          try {
            const jsonSchema = JSON.parse(parsed.source);
            result = {
              entity: jsonSchema.entity || "unknown",
              fields: jsonSchema.fields || [],
              relationships: jsonSchema.relationships || [],
            };
          } catch {
            result = {
              entity: "inferred_entity",
              fields: [],
              relationships: [],
            };
          }
        }
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
      
      case "check_duplicate_records": {
        const parsed = z.object({
          current_data: z.record(z.unknown()),
          existing_records: z.array(z.record(z.unknown())),
          threshold: z.number().min(0).max(1).optional().default(0.8),
        }).parse(args);
        
        const duplicates: Array<{
          record: Record<string, unknown>;
          similarity: number;
          matching_fields: string[];
        }> = [];
        
        for (const record of parsed.existing_records) {
          const similarity = calculateSimilarity(parsed.current_data, record);
          
          if (similarity >= parsed.threshold) {
            const matchingFields = Object.keys(parsed.current_data).filter(
              key => String(parsed.current_data[key]).toLowerCase() === String(record[key]).toLowerCase()
            );
            
            duplicates.push({
              record,
              similarity,
              matching_fields: matchingFields,
            });
          }
        }
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                has_duplicates: duplicates.length > 0,
                duplicate_count: duplicates.length,
                duplicates: duplicates.sort((a, b) => b.similarity - a.similarity),
                threshold_used: parsed.threshold,
              }, null, 2),
            },
          ],
        };
      }
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: true,
            message: errorMessage,
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// ============================================================================
// Server Start
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Task Dialogue MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
