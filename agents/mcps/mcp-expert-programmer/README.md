# MCP Expert Programmer

专家级编程 MCP - 为大型项目编程提供专业工具支持。

## 功能概述

本 MCP 提供三个核心工具，支持大项目的架构分析、增量修改和批量操作：

### 1. get_project_map - 项目架构扫描

扫描项目目录结构，生成详细的架构图。

**参数：**
- `rootPath` (必需): 项目根目录路径
- `patterns` (可选): 文件匹配模式，默认 `["**/*"]`
- `ignorePatterns` (可选): 忽略的模式，默认忽略 node_modules, .git, dist, build 等
- `includeContent` (可选): 是否包含文件内容摘要，默认 `false`
- `maxDepth` (可选): 最大扫描深度，默认 `10`

**示例：**
```json
{
  "name": "get_project_map",
  "arguments": {
    "rootPath": "/path/to/project",
    "includeContent": true
  }
}
```

### 2. apply_incremental_edit - 增量编辑

对文件进行精确的增量编辑，使用 SEARCH/REPLACE 模式。

**参数：**
- `filePath` (必需): 目标文件路径
- `searchPattern` (必需): 要搜索的文本模式
- `replaceText` (必需): 替换的文本内容
- `useRegex` (可选): 是否使用正则表达式，默认 `false`
- `replaceAll` (可选): 是否替换所有匹配项，默认 `true`
- `dryRun` (可选): 是否仅预览不实际修改，默认 `false`

**示例：**
```json
{
  "name": "apply_incremental_edit",
  "arguments": {
    "filePath": "src/utils/helper.ts",
    "searchPattern": "function oldName(",
    "replaceText": "function newName(",
    "dryRun": true
  }
}
```

### 3. batch_file_operation - 批量文件操作

执行批量文件操作，支持创建、删除、移动、复制和修改。

**参数：**
- `operations` (必需): 批量操作列表
  - `type`: 操作类型 (create | delete | move | copy | modify)
  - `sourcePath`: 源文件路径 (用于 move/copy/modify)
  - `targetPath`: 目标文件路径
  - `content`: 创建或修改时的内容
  - `searchPattern`: 修改时的搜索模式
  - `replaceText`: 修改时的替换文本
- `dryRun` (可选): 是否仅预览不实际执行，默认 `false`
- `continueOnError` (可选): 出错时是否继续执行，默认 `false`

**示例：**
```json
{
  "name": "batch_file_operation",
  "arguments": {
    "operations": [
      {
        "type": "create",
        "targetPath": "src/components/Button.tsx",
        "content": "export const Button = () => {};"
      },
      {
        "type": "move",
        "sourcePath": "src/old/file.ts",
        "targetPath": "src/new/file.ts"
      }
    ],
    "dryRun": true
  }
}
```

## 安装

```bash
cd mcps/mcp-expert-programmer
npm install
npm run build
```

## 配置

在 Claude Desktop 配置中添加：

```json
{
  "mcpServers": {
    "expert-programmer": {
      "command": "node",
      "args": ["/path/to/mcps/mcp-expert-programmer/dist/index.js"],
      "cwd": "/path/to/mcps/mcp-expert-programmer"
    }
  }
}
```

## 使用场景

### 项目理解
使用 `get_project_map` 快速理解新项目结构，识别关键文件和目录组织。

### 代码重构
使用 `apply_incremental_edit` 进行安全的变量重命名、函数签名修改等操作。

### 项目脚手架
使用 `batch_file_operation` 批量创建项目文件结构，快速搭建新项目。

### 大规模迁移
结合三个工具，进行项目结构的全面分析和批量修改。

## 设计原则

1. **架构先行**: 先理解项目结构，再进行修改
2. **增量构建**: 小步快跑，每次修改都可验证
3. **安全第一**: 支持 dry-run 预览，避免意外修改
4. **效率优先**: 批量操作减少重复劳动
