# MCP Expert Programmer

专家级编程 MCP - 为大型项目编程提供专业工具支持，包含 AST 代码解析能力。

## 功能概述

本 MCP 提供多个核心工具，支持大项目的架构分析、增量修改、批量操作和代码解析：

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

### 4. parse_code - 代码 AST 解析

使用 AST 解析代码结构，提取函数、类、导入等元素。支持 Python、JavaScript、TypeScript。

**参数：**
- `filePath` (必需): 要解析的源代码文件路径
- `code` (可选): 代码内容，如不提供则从文件读取
- `includeImports` (可选): 是否包含导入信息，默认 `true`
- `includeFunctions` (可选): 是否包含函数信息，默认 `true`
- `includeClasses` (可选): 是否包含类信息，默认 `true`
- `includeConstants` (可选): 是否包含常量信息，默认 `true`

**示例：**
```json
{
  "name": "parse_code",
  "arguments": {
    "filePath": "src/utils/helper.ts",
    "includeFunctions": true,
    "includeClasses": true
  }
}
```

### 5. find_code_elements - 查找代码元素

查找特定类型的代码元素（函数、类、方法等）。

**参数：**
- `filePath` (必需): 要搜索的源代码文件路径
- `elementType` (必需): 要查找的元素类型 (function | class | method | constant | import | all)
- `namePattern` (可选): 名称匹配模式（支持正则）
- `minLine` (可选): 最小行号
- `maxLine` (可选): 最大行号

**示例：**
```json
{
  "name": "find_code_elements",
  "arguments": {
    "filePath": "src/app.py",
    "elementType": "function",
    "namePattern": "^handle.*"
  }
}
```

### 6. get_function_signature - 获取函数签名

获取指定函数的完整签名信息，包括参数、返回类型和装饰器。

**参数：**
- `filePath` (必需): 源代码文件路径
- `functionName` (必需): 函数名称

**示例：**
```json
{
  "name": "get_function_signature",
  "arguments": {
    "filePath": "src/api/routes.ts",
    "functionName": "getUserById"
  }
}
```

### 7. get_class_structure - 获取类结构

获取指定类的完整结构信息，包括方法、属性和继承关系。

**参数：**
- `filePath` (必需): 源代码文件路径
- `className` (必需): 类名称

**示例：**
```json
{
  "name": "get_class_structure",
  "arguments": {
    "filePath": "src/models/User.ts",
    "className": "User"
  }
}
```

### 8. analyze_imports - 分析导入依赖

分析文件的导入依赖关系，支持按模块分组查看。

**参数：**
- `filePath` (必需): 源代码文件路径
- `includeDetails` (可选): 是否包含详细信息，默认 `true`

**示例：**
```json
{
  "name": "analyze_imports",
  "arguments": {
    "filePath": "src/main.ts",
    "includeDetails": true
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

### 代码分析
使用 `parse_code` 分析代码结构，快速了解文件中的函数、类和依赖关系。

### 代码导航
使用 `find_code_elements` 和 `get_function_signature` 快速定位和查看特定函数或类。

### 依赖审查
使用 `analyze_imports` 分析模块依赖，检测循环依赖或未使用的导入。

### 文档生成
结合 AST 解析工具，自动生成 API 文档和代码结构说明。

## 设计原则

1. **架构先行**: 先理解项目结构，再进行修改
2. **增量构建**: 小步快跑，每次修改都可验证
3. **安全第一**: 支持 dry-run 预览，避免意外修改
4. **效率优先**: 批量操作减少重复劳动
