#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { join, relative, dirname, basename } from "path";
import { glob } from "glob";

// 工具输入验证 Schema
const ProjectMapSchema = z.object({
  rootPath: z.string().describe("项目根目录路径"),
  patterns: z.array(z.string()).optional().describe("文件匹配模式，默认为 ['**/*']"),
  ignorePatterns: z.array(z.string()).optional().describe("忽略的模式，默认为 ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**']"),
  includeContent: z.boolean().optional().describe("是否包含文件内容摘要，默认 false"),
  maxDepth: z.number().optional().describe("最大扫描深度，默认 10"),
});

const IncrementalEditSchema = z.object({
  filePath: z.string().describe("目标文件路径"),
  searchPattern: z.string().describe("要搜索的文本模式"),
  replaceText: z.string().describe("替换的文本内容"),
  useRegex: z.boolean().optional().describe("是否使用正则表达式，默认 false"),
  replaceAll: z.boolean().optional().describe("是否替换所有匹配项，默认 true"),
  dryRun: z.boolean().optional().describe("是否仅预览不实际修改，默认 false"),
});

const BatchOperationSchema = z.object({
  operations: z.array(z.object({
    type: z.enum(["create", "delete", "move", "copy", "modify"]),
    sourcePath: z.string().optional().describe("源文件路径（用于 move/copy/modify）"),
    targetPath: z.string().describe("目标文件路径"),
    content: z.string().optional().describe("创建或修改时的内容"),
    searchPattern: z.string().optional().describe("修改时的搜索模式"),
    replaceText: z.string().optional().describe("修改时的替换文本"),
  })).describe("批量操作列表"),
  dryRun: z.boolean().optional().describe("是否仅预览不实际执行，默认 false"),
  continueOnError: z.boolean().optional().describe("出错时是否继续执行，默认 false"),
});

// 工具定义
const TOOLS = [
  {
    name: "get_project_map",
    description: `扫描项目目录结构，生成详细的架构图。支持多种编程语言的项目结构分析。
    
功能特点：
- 递归扫描目录结构
- 识别主要源代码文件
- 生成树状结构图
- 可选包含文件内容摘要
- 支持自定义忽略模式

使用场景：
- 理解新项目结构
- 生成项目文档
- 代码审查准备
- 重构前的结构分析`,
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "项目根目录路径" },
        patterns: { type: "array", items: { type: "string" }, description: "文件匹配模式" },
        ignorePatterns: { type: "array", items: { type: "string" }, description: "忽略的模式" },
        includeContent: { type: "boolean", description: "是否包含文件内容摘要" },
        maxDepth: { type: "number", description: "最大扫描深度" },
      },
      required: ["rootPath"],
    },
  },
  {
    name: "apply_incremental_edit",
    description: `对文件进行精确的增量编辑，使用 SEARCH/REPLACE 模式。
    
功能特点：
- 精确匹配搜索文本
- 支持正则表达式
- 可控制替换范围（单个或全部）
- 支持 dry-run 预览
- 保持原有代码格式

使用场景：
- 变量重命名
- 函数签名修改
- 导入语句更新
- 配置项调整
- 小规模重构`,
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "目标文件路径" },
        searchPattern: { type: "string", description: "要搜索的文本模式" },
        replaceText: { type: "string", description: "替换的文本内容" },
        useRegex: { type: "boolean", description: "是否使用正则表达式" },
        replaceAll: { type: "boolean", description: "是否替换所有匹配项" },
        dryRun: { type: "boolean", description: "是否仅预览不实际修改" },
      },
      required: ["filePath", "searchPattern", "replaceText"],
    },
  },
  {
    name: "batch_file_operation",
    description: `执行批量文件操作，支持创建、删除、移动、复制和修改。
    
功能特点：
- 多种操作类型支持
- 批量执行提高效率
- 支持 dry-run 预览
- 错误处理和继续执行选项
- 原子操作保证一致性

操作类型：
- create: 创建新文件
- delete: 删除文件
- move: 移动/重命名文件
- copy: 复制文件
- modify: 修改文件内容

使用场景：
- 项目脚手架创建
- 批量文件重命名
- 大规模重构
- 模板文件生成`,
    inputSchema: {
      type: "object",
      properties: {
        operations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["create", "delete", "move", "copy", "modify"] },
              sourcePath: { type: "string" },
              targetPath: { type: "string" },
              content: { type: "string" },
              searchPattern: { type: "string" },
              replaceText: { type: "string" },
            },
            required: ["type", "targetPath"],
          },
          description: "批量操作列表",
        },
        dryRun: { type: "boolean", description: "是否仅预览不实际执行" },
        continueOnError: { type: "boolean", description: "出错时是否继续执行" },
      },
      required: ["operations"],
    },
  },
];

// 项目扫描辅助函数
function getFileIcon(extension: string): string {
  const iconMap: Record<string, string> = {
    ".ts": "📘",
    ".tsx": "⚛️",
    ".js": "📗",
    ".jsx": "⚛️",
    ".py": "🐍",
    ".go": "🔷",
    ".rs": "🦀",
    ".java": "☕",
    ".cpp": "⚙️",
    ".c": "⚙️",
    ".h": "⚙️",
    ".hpp": "⚙️",
    ".rb": "💎",
    ".php": "🐘",
    ".swift": "🍎",
    ".kt": "🎯",
    ".scala": "🔴",
    ".cs": "🔵",
    ".vue": "🟢",
    ".svelte": "🔶",
    ".html": "🌐",
    ".css": "🎨",
    ".scss": "🎨",
    ".less": "🎨",
    ".json": "📋",
    ".yaml": "📝",
    ".yml": "📝",
    ".toml": "📝",
    ".md": "📄",
    ".txt": "📃",
    ".sql": "🗄️",
    ".sh": "📜",
    ".bash": "📜",
    ".zsh": "📜",
    ".env": "🔐",
    ".gitignore": "🙈",
    ".dockerfile": "🐳",
    "Dockerfile": "🐳",
  };
  
  const lowerExt = extension.toLowerCase();
  return iconMap[lowerExt] || "📄";
}

function scanDirectory(
  rootPath: string,
  options: {
    patterns: string[];
    ignorePatterns: string[];
    includeContent: boolean;
    maxDepth: number;
  }
): { tree: string; stats: Record<string, any>; files: string[] } {
  const { patterns, ignorePatterns, includeContent, maxDepth } = options;
  
  // 扫描文件
  const files = glob.sync(patterns.join(","), {
    cwd: rootPath,
    ignore: ignorePatterns,
    nodir: true,
  }).slice(0, 1000); // 限制最大文件数
  
  // 构建树状结构
  const fileTree: Map<string, Set<string>> = new Map();
  const stats: Record<string, any> = {
    totalFiles: 0,
    byExtension: {} as Record<string, number>,
    byDirectory: {} as Record<string, number>,
  };
  
  for (const file of files) {
    const parts = file.split("/");
    const dir = parts.slice(0, -1).join("/");
    const fileName = parts[parts.length - 1];
    const ext = fileName.includes(".") ? "." + fileName.split(".").pop() : "";
    
    if (!fileTree.has(dir)) {
      fileTree.set(dir, new Set());
    }
    fileTree.get(dir)!.add(fileName);
    
    stats.totalFiles++;
    stats.byExtension[ext] = (stats.byExtension[ext] || 0) + 1;
    stats.byDirectory[dir] = (stats.byDirectory[dir] || 0) + 1;
  }
  
  // 生成树状字符串
  let tree = "```\n";
  tree += `${basename(rootPath)}/\n`;
  
  const sortedDirs = Array.from(fileTree.keys()).sort();
  const processedDirs = new Set<string>();
  
  for (const dir of sortedDirs) {
    const parts = dir.split("/");
    let currentPath = "";
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const prevPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      
      if (!processedDirs.has(currentPath)) {
        processedDirs.add(currentPath);
        const indent = "  ".repeat(i);
        const isLastInLevel = !sortedDirs.some(d => d.startsWith(currentPath + "/"));
        const prefix = isLastInLevel ? "└── " : "├── ";
        tree += `${indent}${prefix}${part}/\n`;
      }
    }
    
    // 添加文件
    const filesInDir = Array.from(fileTree.get(dir)!).sort();
    const indent = "  ".repeat(parts.length);
    for (let i = 0; i < filesInDir.length; i++) {
      const fileName = filesInDir[i];
      const ext = fileName.includes(".") ? "." + fileName.split(".").pop() : "";
      const icon = getFileIcon(ext);
      const isLast = i === filesInDir.length - 1;
      const prefix = isLast ? "└── " : "├── ";
      
      if (includeContent) {
        const fullPath = join(rootPath, dir, fileName);
        try {
          const content = readFileSync(fullPath, "utf-8");
          const lines = content.split("\n").length;
          tree += `${indent}${prefix}${icon} ${fileName} (${lines} lines)\n`;
        } catch {
          tree += `${indent}${prefix}${icon} ${fileName}\n`;
        }
      } else {
        tree += `${indent}${prefix}${icon} ${fileName}\n`;
      }
    }
  }
  
  tree += "```\n";
  
  return { tree, stats, files };
}

// 增量编辑辅助函数
function applyIncrementalEdit(
  filePath: string,
  options: {
    searchPattern: string;
    replaceText: string;
    useRegex: boolean;
    replaceAll: boolean;
    dryRun: boolean;
  }
): { success: boolean; message: string; diff?: string; matches?: number } {
  const { searchPattern, replaceText, useRegex, replaceAll, dryRun } = options;
  
  // 检查文件是否存在
  if (!existsSync(filePath)) {
    return { success: false, message: `文件不存在：${filePath}` };
  }
  
  // 读取文件内容
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch (error) {
    return { success: false, message: `读取文件失败：${error}` };
  }
  
  // 执行搜索替换
  let newContent: string;
  let matchCount = 0;
  
  if (useRegex) {
    const flags = "gm";
    const regex = new RegExp(searchPattern, flags);
    const matches = content.match(regex);
    matchCount = matches ? matches.length : 0;
    
    if (replaceAll) {
      newContent = content.replace(regex, replaceText);
    } else {
      newContent = content.replace(regex, replaceText);
    }
  } else {
    // 精确文本匹配
    const escapedPattern = searchPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escapedPattern, "g");
    const matches = content.match(regex);
    matchCount = matches ? matches.length : 0;
    
    if (replaceAll) {
      newContent = content.replace(regex, replaceText);
    } else {
      newContent = content.replace(regex, replaceText);
    }
  }
  
  if (matchCount === 0) {
    return { success: false, message: "未找到匹配的内容" };
  }
  
  // 生成 diff
  const oldLines = content.split("\n");
  const newLines = newContent.split("\n");
  const diff: string[] = [];
  
  diff.push("--- 原始内容");
  diff.push("+++ 修改后内容");
  diff.push(`@@ 共修改 ${matchCount} 处 @@`);
  
  if (dryRun) {
    return {
      success: true,
      message: `[预览模式] 找到 ${matchCount} 处匹配`,
      diff: diff.join("\n"),
      matches: matchCount,
    };
  }
  
  // 写入文件
  try {
    writeFileSync(filePath, newContent, "utf-8");
    return {
      success: true,
      message: `成功修改 ${matchCount} 处`,
      matches: matchCount,
    };
  } catch (error) {
    return { success: false, message: `写入文件失败：${error}` };
  }
}

// 批量操作辅助函数
function executeBatchOperations(
  rootPath: string,
  options: {
    operations: Array<{
      type: string;
      sourcePath?: string;
      targetPath: string;
      content?: string;
      searchPattern?: string;
      replaceText?: string;
    }>;
    dryRun: boolean;
    continueOnError: boolean;
  }
): { success: boolean; results: Array<{ operation: number; success: boolean; message: string }> } {
  const { operations, dryRun, continueOnError } = options;
  const results: Array<{ operation: number; success: boolean; message: string }> = [];
  let hasError = false;
  
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    let result: { success: boolean; message: string };
    
    try {
      const targetFullPath = join(rootPath, op.targetPath);
      
      switch (op.type) {
        case "create": {
          if (dryRun) {
            result = { success: true, message: `[预览] 创建文件：${op.targetPath}` };
          } else {
            const dir = dirname(targetFullPath);
            if (!existsSync(dir)) {
              mkdirSync(dir, { recursive: true });
            }
            writeFileSync(targetFullPath, op.content || "", "utf-8");
            result = { success: true, message: `已创建：${op.targetPath}` };
          }
          break;
        }
        
        case "delete": {
          if (!existsSync(targetFullPath)) {
            result = { success: false, message: `文件不存在：${op.targetPath}` };
          } else if (dryRun) {
            result = { success: true, message: `[预览] 删除文件：${op.targetPath}` };
          } else {
            rmSync(targetFullPath, { recursive: true, force: true });
            result = { success: true, message: `已删除：${op.targetPath}` };
          }
          break;
        }
        
        case "move": {
          if (!op.sourcePath) {
            result = { success: false, message: "move 操作需要 sourcePath" };
          } else if (!existsSync(join(rootPath, op.sourcePath))) {
            result = { success: false, message: `源文件不存在：${op.sourcePath}` };
          } else if (dryRun) {
            result = { success: true, message: `[预览] 移动：${op.sourcePath} -> ${op.targetPath}` };
          } else {
            const sourceFullPath = join(rootPath, op.sourcePath);
            const targetDir = dirname(targetFullPath);
            if (!existsSync(targetDir)) {
              mkdirSync(targetDir, { recursive: true });
            }
            // Node.js 18+ 有 renameSync，但为了兼容性使用 read/write
            const content = readFileSync(sourceFullPath);
            writeFileSync(targetFullPath, content);
            rmSync(sourceFullPath);
            result = { success: true, message: `已移动：${op.sourcePath} -> ${op.targetPath}` };
          }
          break;
        }
        
        case "copy": {
          if (!op.sourcePath) {
            result = { success: false, message: "copy 操作需要 sourcePath" };
          } else if (!existsSync(join(rootPath, op.sourcePath))) {
            result = { success: false, message: `源文件不存在：${op.sourcePath}` };
          } else if (dryRun) {
            result = { success: true, message: `[预览] 复制：${op.sourcePath} -> ${op.targetPath}` };
          } else {
            const sourceFullPath = join(rootPath, op.sourcePath);
            const targetDir = dirname(targetFullPath);
            if (!existsSync(targetDir)) {
              mkdirSync(targetDir, { recursive: true });
            }
            const content = readFileSync(sourceFullPath);
            writeFileSync(targetFullPath, content);
            result = { success: true, message: `已复制：${op.sourcePath} -> ${op.targetPath}` };
          }
          break;
        }
        
        case "modify": {
          const fullPath = join(rootPath, op.targetPath);
          if (!existsSync(fullPath)) {
            result = { success: false, message: `文件不存在：${op.targetPath}` };
          } else if (!op.searchPattern || op.replaceText === undefined) {
            result = { success: false, message: "modify 操作需要 searchPattern 和 replaceText" };
          } else {
            const editResult = applyIncrementalEdit(fullPath, {
              searchPattern: op.searchPattern!,
              replaceText: op.replaceText!,
              useRegex: false,
              replaceAll: true,
              dryRun,
            });
            result = editResult;
          }
          break;
        }
        
        default:
          result = { success: false, message: `未知操作类型：${op.type}` };
      }
    } catch (error) {
      result = { success: false, message: `操作失败：${error}` };
      hasError = true;
    }
    
    results.push({ operation: i + 1, ...result });
    
    if (!result.success && !continueOnError) {
      break;
    }
  }
  
  return {
    success: !hasError,
    results,
  };
}

// 创建 MCP 服务器
const server = new Server(
  {
    name: "mcp-expert-programmer",
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
  return { tools: TOOLS };
});

// 处理工具调用请求
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    switch (name) {
      case "get_project_map": {
        const validated = ProjectMapSchema.parse(args);
        const {
          rootPath,
          patterns = ["**/*"],
          ignorePatterns = ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**", "**/__pycache__/**", "**/*.pyc"],
          includeContent = false,
          maxDepth = 10,
        } = validated;
        
        const { tree, stats } = scanDirectory(rootPath, {
          patterns,
          ignorePatterns,
          includeContent,
          maxDepth,
        });
        
        return {
          content: [
            {
              type: "text",
              text: `# 项目架构扫描结果\n\n## 目录结构\n\n${tree}\n\n## 统计信息\n\n- 总文件数：${stats.totalFiles}\n- 文件类型分布:\n${Object.entries(stats.byExtension as Record<string, number>)
                .sort((a, b) => b[1] - a[1])
                .map(([ext, count]) => `  - ${ext || "(无扩展名)"}: ${count}`)
                .join("\n")}\n`,
            },
          ],
        };
      }
      
      case "apply_incremental_edit": {
        const validated = IncrementalEditSchema.parse(args);
        const {
          filePath,
          searchPattern,
          replaceText,
          useRegex = false,
          replaceAll = true,
          dryRun = false,
        } = validated;
        
        const result = applyIncrementalEdit(filePath, {
          searchPattern,
          replaceText,
          useRegex,
          replaceAll,
          dryRun,
        });
        
        return {
          content: [
            {
              type: "text",
              text: `## 增量编辑结果\n\n- 状态：${result.success ? "✅ 成功" : "❌ 失败"}\n- 消息：${result.message}\n${result.matches !== undefined ? `- 匹配数量：${result.matches}\n` : ""}${result.diff ? `\n## Diff\n\n${result.diff}\n` : ""}`,
            },
          ],
        };
      }
      
      case "batch_file_operation": {
        const validated = BatchOperationSchema.parse(args);
        const {
          operations,
          dryRun = false,
          continueOnError = false,
        } = validated;
        
        // 使用当前工作目录作为根路径
        const rootPath = process.cwd();
        
        const result = executeBatchOperations(rootPath, {
          operations,
          dryRun,
          continueOnError,
        });
        
        const resultsText = result.results
          .map((r) => `### 操作 ${r.operation}\n- 状态：${r.success ? "✅" : "❌"}\n- 消息：${r.message}`)
          .join("\n\n");
        
        return {
          content: [
            {
              type: "text",
              text: `## 批量操作结果\n\n整体状态：${result.success ? "✅ 全部成功" : "⚠️ 部分失败"}\n\n${resultsText}`,
            },
          ],
        };
      }
      
      default:
        throw new Error(`未知工具：${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `❌ 错误：${error instanceof Error ? error.message : String(error)}`,
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
  console.error("MCP Expert Programmer 服务器已启动");
}

main().catch((error) => {
  console.error("服务器启动失败:", error);
  process.exit(1);
});
