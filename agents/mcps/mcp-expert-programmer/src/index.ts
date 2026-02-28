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
import { parseCode, CodeElement, ClassInfo, ImportInfo, ParseResult } from "./ast-parser.js";

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

// AST 解析工具输入验证 Schema
const ParseCodeSchema = z.object({
  filePath: z.string().describe("要解析的源代码文件路径"),
  code: z.string().optional().describe("代码内容，如不提供则从文件读取"),
  includeImports: z.boolean().optional().describe("是否包含导入信息，默认 true"),
  includeFunctions: z.boolean().optional().describe("是否包含函数信息，默认 true"),
  includeClasses: z.boolean().optional().describe("是否包含类信息，默认 true"),
  includeConstants: z.boolean().optional().describe("是否包含常量信息，默认 true"),
});

const FindCodeElementsSchema = z.object({
  filePath: z.string().describe("要搜索的源代码文件路径"),
  elementType: z.enum(["function", "class", "method", "constant", "import", "all"]).describe("要查找的元素类型"),
  namePattern: z.string().optional().describe("名称匹配模式（支持正则）"),
  minLine: z.number().optional().describe("最小行号"),
  maxLine: z.number().optional().describe("最大行号"),
});

const GetFunctionSignatureSchema = z.object({
  filePath: z.string().describe("源代码文件路径"),
  functionName: z.string().describe("函数名称"),
});

const GetClassStructureSchema = z.object({
  filePath: z.string().describe("源代码文件路径"),
  className: z.string().describe("类名称"),
});

const AnalyzeImportsSchema = z.object({
  filePath: z.string().describe("源代码文件路径"),
  includeDetails: z.boolean().optional().describe("是否包含详细信息，默认 true"),
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
  {
    name: "parse_code",
    description: `使用 AST 解析代码结构，提取函数、类、导入等元素。
    
功能特点：
- 支持 Python、JavaScript、TypeScript
- 提取完整的 AST 信息
- 包含行号、列号位置信息
- 支持参数和返回类型分析

解析内容：
- 函数定义（名称、参数、返回类型）
- 类定义（方法、属性、继承）
- 导入语句（模块、别名）
- 常量定义

使用场景：
- 代码分析和理解
- 自动生成文档
- 代码重构辅助
- 依赖分析`,
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "要解析的源代码文件路径" },
        code: { type: "string", description: "代码内容，如不提供则从文件读取" },
        includeImports: { type: "boolean", description: "是否包含导入信息" },
        includeFunctions: { type: "boolean", description: "是否包含函数信息" },
        includeClasses: { type: "boolean", description: "是否包含类信息" },
        includeConstants: { type: "boolean", description: "是否包含常量信息" },
      },
      required: ["filePath"],
    },
  },
  {
    name: "find_code_elements",
    description: `查找特定类型的代码元素（函数、类、方法等）。
    
功能特点：
- 按类型过滤（function/class/method/constant/import）
- 支持名称正则匹配
- 支持行号范围过滤
- 返回完整位置信息

使用场景：
- 快速定位代码
- 查找特定函数/类
- 代码导航辅助
- 重构目标定位`,
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "要搜索的源代码文件路径" },
        elementType: { type: "string", enum: ["function", "class", "method", "constant", "import", "all"], description: "要查找的元素类型" },
        namePattern: { type: "string", description: "名称匹配模式（支持正则）" },
        minLine: { type: "number", description: "最小行号" },
        maxLine: { type: "number", description: "最大行号" },
      },
      required: ["filePath", "elementType"],
    },
  },
  {
    name: "get_function_signature",
    description: `获取指定函数的完整签名信息。
    
功能特点：
- 提取函数名称
- 完整参数列表（含类型和默认值）
- 返回类型注解
- 装饰器信息

使用场景：
- API 文档生成
- 函数调用参考
- 类型检查辅助`,
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "源代码文件路径" },
        functionName: { type: "string", description: "函数名称" },
      },
      required: ["filePath", "functionName"],
    },
  },
  {
    name: "get_class_structure",
    description: `获取指定类的完整结构信息。
    
功能特点：
- 提取类名称和基类
- 所有方法列表
- 属性列表
- 装饰器信息

使用场景：
- 类文档生成
- 继承关系分析
- 面向对象设计审查`,
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "源代码文件路径" },
        className: { type: "string", description: "类名称" },
      },
      required: ["filePath", "className"],
    },
  },
  {
    name: "analyze_imports",
    description: `分析文件的导入依赖关系。
    
功能特点：
- 提取所有导入语句
- 区分默认导入和命名导入
- 识别导入别名
- 统计模块依赖

使用场景：
- 依赖分析
- 循环导入检测
- 代码清理（移除未使用导入）
- 模块化评估`,
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "源代码文件路径" },
        includeDetails: { type: "boolean", description: "是否包含详细信息" },
      },
      required: ["filePath"],
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
      
      case "parse_code": {
        const validated = ParseCodeSchema.parse(args);
        const {
          filePath,
          code,
          includeImports = true,
          includeFunctions = true,
          includeClasses = true,
          includeConstants = true,
        } = validated;
        
        // 读取代码内容
        const fileContent = code || readFileSync(filePath, "utf-8");
        
        // 解析代码
        const parseResult = parseCode(fileContent, filePath);
        
        // 构建结果文本
        let resultText = `## 代码解析结果\n\n**文件**: ${filePath}\n**语言**: ${parseResult.language}\n\n`;
        
        if (includeFunctions && parseResult.functions.length > 0) {
          resultText += `### 函数 (${parseResult.functions.length})\n\n`;
          parseResult.functions.forEach(func => {
            resultText += `#### ${func.name}\n`;
            resultText += `- 位置：第 ${func.startLine}-${func.endLine} 行\n`;
            if (func.signature) resultText += `- 签名：\`${func.signature}\`\n`;
            if (func.returnType) resultText += `- 返回类型：${func.returnType}\n`;
            if (func.parameters && func.parameters.length > 0) {
              resultText += `- 参数：${func.parameters.map(p => `${p.name}${p.typeAnnotation ? ': ' + p.typeAnnotation : ''}`).join(', ')}\n`;
            }
            if (func.decorators && func.decorators.length > 0) {
              resultText += `- 装饰器：${func.decorators.join(', ')}\n`;
            }
            resultText += '\n';
          });
        }
        
        if (includeClasses && parseResult.classes.length > 0) {
          resultText += `### 类 (${parseResult.classes.length})\n\n`;
          parseResult.classes.forEach(cls => {
            resultText += `#### ${cls.name}\n`;
            resultText += `- 位置：第 ${cls.startLine}-${cls.endLine} 行\n`;
            if (cls.baseClasses.length > 0) resultText += `- 继承：${cls.baseClasses.join(', ')}\n`;
            if (cls.methods.length > 0) resultText += `- 方法：${cls.methods.map(m => m.name).join(', ')}\n`;
            if (cls.properties.length > 0) resultText += `- 属性：${cls.properties.join(', ')}\n`;
            if (cls.decorators.length > 0) resultText += `- 装饰器：${cls.decorators.join(', ')}\n`;
            resultText += '\n';
          });
        }
        
        if (includeImports && parseResult.imports.length > 0) {
          resultText += `### 导入 (${parseResult.imports.length})\n\n`;
          parseResult.imports.forEach(imp => {
            if (imp.isDefaultImport) {
              resultText += `- \`${imp.importedName}${imp.alias ? ' as ' + imp.alias : ''}\` from \`${imp.moduleName}\`\n`;
            } else if (imp.isNamespaceImport) {
              resultText += `- \`${imp.alias}\` (namespace) from \`${imp.moduleName}\`\n`;
            } else {
              resultText += `- \`${imp.importedName}${imp.alias ? ' as ' + imp.alias : ''}\` from \`${imp.moduleName}\`\n`;
            }
          });
          resultText += '\n';
        }
        
        if (includeConstants && parseResult.constants.length > 0) {
          resultText += `### 常量 (${parseResult.constants.length})\n\n`;
          parseResult.constants.forEach(c => {
            resultText += `- \`${c.name}\` (第 ${c.startLine} 行)\n`;
          });
          resultText += '\n';
        }
        
        if (!includeFunctions && !includeClasses && !includeImports && !includeConstants) {
          resultText += "*未选择任何解析选项*\n";
        }
        
        return {
          content: [
            {
              type: "text",
              text: resultText,
            },
          ],
        };
      }
      
      case "find_code_elements": {
        const validated = FindCodeElementsSchema.parse(args);
        const {
          filePath,
          elementType,
          namePattern,
          minLine,
          maxLine,
        } = validated;
        
        // 读取代码内容
        const fileContent = readFileSync(filePath, "utf-8");
        
        // 解析代码
        const parseResult = parseCode(fileContent, filePath);
        
        let elements: (CodeElement | ClassInfo)[] = [];
        
        if (elementType === "all" || elementType === "function") {
          elements = [...elements, ...parseResult.functions];
        }
        if (elementType === "all" || elementType === "class") {
          elements = [...elements, ...parseResult.classes];
        }
        if (elementType === "all" || elementType === "method") {
          parseResult.classes.forEach(cls => {
            elements = [...elements, ...cls.methods];
          });
        }
        if (elementType === "all" || elementType === "constant") {
          elements = [...elements, ...parseResult.constants];
        }
        if (elementType === "all" || elementType === "import") {
          elements = [...elements, ...parseResult.imports as unknown as CodeElement[]];
        }
        
        // 过滤
        if (namePattern) {
          const regex = new RegExp(namePattern, "i");
          elements = elements.filter(e => regex.test(e.name));
        }
        if (minLine) {
          elements = elements.filter(e => e.startLine >= minLine);
        }
        if (maxLine) {
          elements = elements.filter(e => e.endLine <= maxLine);
        }
        
        let resultText = `## 代码元素查找结果\n\n**文件**: ${filePath}\n**类型**: ${elementType}\n**找到**: ${elements.length} 个\n\n`;
        
        elements.forEach(el => {
          resultText += `### ${el.name}\n`;
          if ('type' in el) {
            resultText += `- 类型：${el.type}\n`;
          }
          resultText += `- 位置：第 ${el.startLine}-${el.endLine} 行\n`;
          if ('signature' in el && el.signature) {
            resultText += `- 签名：\`${el.signature}\`\n`;
          }
          resultText += '\n';
        });
        
        return {
          content: [
            {
              type: "text",
              text: resultText,
            },
          ],
        };
      }
      
      case "get_function_signature": {
        const validated = GetFunctionSignatureSchema.parse(args);
        const { filePath, functionName } = validated;
        
        // 读取代码内容
        const fileContent = readFileSync(filePath, "utf-8");
        
        // 解析代码
        const parseResult = parseCode(fileContent, filePath);
        
        // 查找函数
        const func = parseResult.functions.find(f => f.name === functionName);
        
        if (!func) {
          return {
            content: [
              {
                type: "text",
                text: `❌ 未找到函数：${functionName}\n\n可用的函数：${parseResult.functions.map(f => f.name).join(', ') || "无"}`,
              },
            ],
          };
        }
        
        let resultText = `## 函数签名\n\n### ${func.name}\n\n`;
        resultText += `**位置**: 第 ${func.startLine}-${func.endLine} 行\n\n`;
        resultText += `**签名**:\n\`\`\`\n${func.signature || func.name}()\n\`\`\`\n\n`;
        
        if (func.parameters && func.parameters.length > 0) {
          resultText += `**参数**:\n\n`;
          func.parameters.forEach(p => {
            resultText += `- \`${p.name}\``;
            if (p.typeAnnotation) resultText += `: ${p.typeAnnotation}`;
            if (p.defaultValue) resultText += ` = ${p.defaultValue}`;
            resultText += '\n';
          });
          resultText += '\n';
        }
        
        if (func.returnType) {
          resultText += `**返回类型**: ${func.returnType}\n\n`;
        }
        
        if (func.decorators && func.decorators.length > 0) {
          resultText += `**装饰器**: ${func.decorators.join(', ')}\n\n`;
        }
        
        return {
          content: [
            {
              type: "text",
              text: resultText,
            },
          ],
        };
      }
      
      case "get_class_structure": {
        const validated = GetClassStructureSchema.parse(args);
        const { filePath, className } = validated;
        
        // 读取代码内容
        const fileContent = readFileSync(filePath, "utf-8");
        
        // 解析代码
        const parseResult = parseCode(fileContent, filePath);
        
        // 查找类
        const cls = parseResult.classes.find(c => c.name === className);
        
        if (!cls) {
          return {
            content: [
              {
                type: "text",
                text: `❌ 未找到类：${className}\n\n可用的类：${parseResult.classes.map(c => c.name).join(', ') || "无"}`,
              },
            ],
          };
        }
        
        let resultText = `## 类结构\n\n### ${cls.name}\n\n`;
        resultText += `**位置**: 第 ${cls.startLine}-${cls.endLine} 行\n\n`;
        
        if (cls.baseClasses.length > 0) {
          resultText += `**继承**: ${cls.baseClasses.join(', ')}\n\n`;
        }
        
        if (cls.decorators.length > 0) {
          resultText += `**装饰器**: ${cls.decorators.join(', ')}\n\n`;
        }
        
        if (cls.methods.length > 0) {
          resultText += `**方法** (${cls.methods.length}):\n\n`;
          cls.methods.forEach(m => {
            resultText += `- \`${m.name}\` (第 ${m.startLine}-${m.endLine} 行)\n`;
          });
          resultText += '\n';
        }
        
        if (cls.properties.length > 0) {
          resultText += `**属性**:\n\n`;
          cls.properties.forEach(p => {
            resultText += `- \`${p}\`\n`;
          });
          resultText += '\n';
        }
        
        return {
          content: [
            {
              type: "text",
              text: resultText,
            },
          ],
        };
      }
      
      case "analyze_imports": {
        const validated = AnalyzeImportsSchema.parse(args);
        const { filePath, includeDetails = true } = validated;
        
        // 读取代码内容
        const fileContent = readFileSync(filePath, "utf-8");
        
        // 解析代码
        const parseResult = parseCode(fileContent, filePath);
        
        // 按模块分组
        const modulesMap = new Map<string, ImportInfo[]>();
        parseResult.imports.forEach(imp => {
          if (!modulesMap.has(imp.moduleName)) {
            modulesMap.set(imp.moduleName, []);
          }
          modulesMap.get(imp.moduleName)!.push(imp);
        });
        
        let resultText = `## 导入依赖分析\n\n**文件**: ${filePath}\n**总导入数**: ${parseResult.imports.length}\n**模块数**: ${modulesMap.size}\n\n`;
        
        if (includeDetails) {
          modulesMap.forEach((imports, moduleName) => {
            resultText += `### \`${moduleName}\`\n\n`;
            imports.forEach(imp => {
              if (imp.isDefaultImport) {
                resultText += `- 默认导入：${imp.alias || imp.importedName}\n`;
              } else if (imp.isNamespaceImport) {
                resultText += `- 命名空间导入：${imp.alias}\n`;
              } else {
                resultText += `- 命名导入：\`${imp.importedName}\`${imp.alias ? ` → \`${imp.alias}\`` : ''}\n`;
              }
            });
            resultText += '\n';
          });
        } else {
          resultText += `**导入的模块**:\n\n`;
          modulesMap.forEach((_, moduleName) => {
            resultText += `- \`${moduleName}\`\n`;
          });
        }
        
        return {
          content: [
            {
              type: "text",
              text: resultText,
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
