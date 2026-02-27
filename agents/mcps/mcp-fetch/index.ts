#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";

// 创建 Turndown 服务用于 HTML 转 Markdown
const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

// 工具定义
const tools = [
  {
    name: "fetch_url",
    description: "获取网页内容并转换为 Markdown 格式。适合读取文章、文档、博客等文本内容。",
    inputSchema: zodToJsonSchema(
      z.object({
        url: z.string().url().describe("要获取的网页 URL"),
        timeout: z.number().optional().default(30000).describe("请求超时时间（毫秒）"),
      })
    ),
  },
  {
    name: "fetch_url_raw",
    description: "获取网页的原始 HTML 内容。适合需要分析 HTML 结构的场景。",
    inputSchema: zodToJsonSchema(
      z.object({
        url: z.string().url().describe("要获取的网页 URL"),
        timeout: z.number().optional().default(30000).describe("请求超时时间（毫秒）"),
      })
    ),
  },
  {
    name: "fetch_json",
    description: "获取 JSON 格式的 API 响应。适合调用 REST API。",
    inputSchema: zodToJsonSchema(
      z.object({
        url: z.string().url().describe("API 的 URL"),
        method: z.enum(["GET", "POST", "PUT", "DELETE"]).optional().default("GET").describe("HTTP 方法"),
        body: z.object({}).passthrough().optional().describe("请求体（JSON 对象）"),
        headers: z.object({}).passthrough().optional().describe("自定义请求头"),
        timeout: z.number().optional().default(30000).describe("请求超时时间（毫秒）"),
      })
    ),
  },
  {
    name: "search_text",
    description: "在网页内容中搜索指定文本，返回包含搜索词的上下文片段。",
    inputSchema: zodToJsonSchema(
      z.object({
        url: z.string().url().describe("要搜索的网页 URL"),
        query: z.string().describe("要搜索的文本"),
        contextSize: z.number().optional().default(200).describe("每个匹配项周围的上下文大小（字符数）"),
        maxResults: z.number().optional().default(10).describe("最大返回结果数"),
        timeout: z.number().optional().default(30000).describe("请求超时时间（毫秒）"),
      })
    ),
  },
];

// 创建 MCP 服务器
const server = new Server(
  {
    name: "mcp-fetch",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 处理工具列表请求
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// 处理工具调用请求
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "fetch_url": {
        const parsed = z.object({
          url: z.string().url(),
          timeout: z.number().optional().default(30000),
        }).parse(args);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), parsed.timeout);

        try {
          const response = await fetch(parsed.url, {
            signal: controller.signal,
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; MCP Fetch Bot/1.0)",
            },
          });
          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const html = await response.text();
          const dom = new JSDOM(html, { url: parsed.url });
          const reader = new Readability(dom.window.document);
          const article = reader.parse();

          if (!article) {
            return {
              content: [
                {
                  type: "text",
                  text: `无法解析网页内容，原始 HTML 长度：${html.length} 字符`,
                },
              ],
              isError: true,
            };
          }

          const markdown = turndownService.turndown(article.content);

          return {
            content: [
              {
                type: "text",
                text: `# ${article.title}\n\n${markdown}\n\n---\n来源：${parsed.url}`,
              },
            ],
          };
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      }

      case "fetch_url_raw": {
        const parsed = z.object({
          url: z.string().url(),
          timeout: z.number().optional().default(30000),
        }).parse(args);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), parsed.timeout);

        try {
          const response = await fetch(parsed.url, {
            signal: controller.signal,
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; MCP Fetch Bot/1.0)",
            },
          });
          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const html = await response.text();

          return {
            content: [
              {
                type: "text",
                text: html,
              },
            ],
          };
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      }

      case "fetch_json": {
        const parsed = z.object({
          url: z.string().url(),
          method: z.enum(["GET", "POST", "PUT", "DELETE"]).optional().default("GET"),
          body: z.object({}).passthrough().optional(),
          headers: z.object({}).passthrough().optional(),
          timeout: z.number().optional().default(30000),
        }).parse(args);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), parsed.timeout);

        try {
          const fetchOptions: any = {
            method: parsed.method,
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "Mozilla/5.0 (compatible; MCP Fetch Bot/1.0)",
              ...parsed.headers,
            },
          };

          if (parsed.body && parsed.method !== "GET") {
            fetchOptions.body = JSON.stringify(parsed.body);
          }

          const response = await fetch(parsed.url, fetchOptions);
          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(data, null, 2),
              },
            ],
          };
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      }

      case "search_text": {
        const parsed = z.object({
          url: z.string().url(),
          query: z.string(),
          contextSize: z.number().optional().default(200),
          maxResults: z.number().optional().default(10),
          timeout: z.number().optional().default(30000),
        }).parse(args);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), parsed.timeout);

        try {
          const response = await fetch(parsed.url, {
            signal: controller.signal,
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; MCP Fetch Bot/1.0)",
            },
          });
          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const html = await response.text();
          const dom = new JSDOM(html, { url: parsed.url });
          const reader = new Readability(dom.window.document);
          const article = reader.parse();

          if (!article) {
            return {
              content: [
                {
                  type: "text",
                  text: "无法解析网页内容",
                },
              ],
              isError: true,
            };
          }

          const text = article.content;
          const queryLower = parsed.query.toLowerCase();
          const textLower = text.toLowerCase();
          const results: string[] = [];
          let startIndex = 0;

          while (results.length < parsed.maxResults) {
            const index = textLower.indexOf(queryLower, startIndex);
            if (index === -1) break;

            const start = Math.max(0, index - parsed.contextSize);
            const end = Math.min(text.length, index + parsed.query.length + parsed.contextSize);
            const context = text.substring(start, end);
            results.push(`...${context}...`);

            startIndex = index + 1;
          }

          if (results.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `未找到包含 "${parsed.query}" 的内容`,
                },
              ],
            };
          }

          return {
            content: [
              {
                type: "text",
                text: `在 ${parsed.url} 中找到 ${results.length} 个匹配项：\n\n${results.join("\n\n---\n\n")}`,
              },
            ],
          };
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `错误：${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Fetch 服务器已启动，等待连接...");
}

main().catch((error) => {
  console.error("服务器启动失败:", error);
  process.exit(1);
});
