/**
 * AST Parser Module
 * 
 * 提供代码的 AST 解析功能，支持 Python 和 JavaScript/TypeScript
 * 用于分析代码结构、提取函数/类定义、分析导入依赖等
 */

import * as babelParser from '@babel/parser';
import * as t from '@babel/types';

// ============================================================================
// 类型定义
// ============================================================================

export interface CodeElement {
  name: string;
  type: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  signature?: string;
  docstring?: string;
  parameters?: ParameterInfo[];
  returnType?: string;
  decorators?: string[];
  filePath?: string;
}

export interface ParameterInfo {
  name: string;
  typeAnnotation?: string;
  defaultValue?: string;
}

export interface ImportInfo {
  moduleName: string;
  importedName: string;
  alias?: string;
  isDefaultImport: boolean;
  isNamespaceImport: boolean;
  line: number;
}

export interface ClassInfo {
  name: string;
  methods: CodeElement[];
  properties: string[];
  baseClasses: string[];
  decorators: string[];
  startLine: number;
  endLine: number;
}

export interface ParseResult {
  functions: CodeElement[];
  classes: ClassInfo[];
  imports: ImportInfo[];
  constants: CodeElement[];
  language: 'python' | 'javascript' | 'typescript';
}

// ============================================================================
// JavaScript/TypeScript AST 解析
// ============================================================================

/**
 * 解析 JavaScript/TypeScript 代码的 AST
 */
export function parseJavaScript(code: string, isTypeScript: boolean = false): ParseResult {
  const result: ParseResult = {
    functions: [],
    classes: [],
    imports: [],
    constants: [],
    language: isTypeScript ? 'typescript' : 'javascript'
  };

  const ast = babelParser.parse(code, {
    sourceType: 'module',
    plugins: isTypeScript ? ['typescript', 'jsx', 'decorators-legacy'] : ['jsx', 'decorators-legacy'],
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true
  });

  // 遍历 AST 提取信息
  traverseNode(ast, result);

  return result;
}

/**
 * 遍历 AST 节点
 */
function traverseNode(node: t.Node, result: ParseResult, parent?: t.Node) {
  // 函数声明
  if (t.isFunctionDeclaration(node)) {
    const func = extractFunction(node);
    if (func) result.functions.push(func);
  }
  
  // 箭头函数（仅顶层赋值）
  if (t.isArrowFunctionExpression(node) && t.isVariableDeclarator(parent as t.Node)) {
    const varDeclarator = parent as t.VariableDeclarator;
    if (t.isIdentifier(varDeclarator.id)) {
      const func = extractArrowFunction(node, varDeclarator.id.name);
      if (func) result.functions.push(func);
    }
  }
  
  // 类声明
  if (t.isClassDeclaration(node)) {
    const classInfo = extractClass(node);
    if (classInfo) result.classes.push(classInfo);
  }
  
  // 导入声明
  if (t.isImportDeclaration(node)) {
    extractImports(node, result);
  }
  
  // 变量声明（常量检测）
  if (t.isVariableDeclaration(node)) {
    extractConstants(node, result);
  }
  
  // 递归遍历子节点
  for (const key in node) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'leadingComments' || key === 'trailingComments') {
      continue;
    }
    const value = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      value.forEach((child: unknown) => {
        if (t.isNode(child as t.Node)) {
          traverseNode(child as t.Node, result, node);
        }
      });
    } else if (t.isNode(value as t.Node)) {
      traverseNode(value as t.Node, result, node);
    }
  }
}

/**
 * 提取函数信息
 */
function extractFunction(node: t.FunctionDeclaration): CodeElement | null {
  if (!node.id) return null;
  
  return {
    name: node.id.name,
    type: 'function',
    startLine: node.loc?.start.line || 0,
    endLine: node.loc?.end.line || 0,
    startColumn: node.loc?.start.column || 0,
    endColumn: node.loc?.end.column || 0,
    signature: `${node.id.name}(${getParamsString(node.params)})`,
    parameters: extractParameters(node.params),
    returnType: extractReturnType(node),
    decorators: extractDecorators(node)
  };
}

/**
 * 提取箭头函数信息
 */
function extractArrowFunction(node: t.ArrowFunctionExpression, name: string): CodeElement | null {
  return {
    name,
    type: 'arrow_function',
    startLine: node.loc?.start.line || 0,
    endLine: node.loc?.end.line || 0,
    startColumn: node.loc?.start.column || 0,
    endColumn: node.loc?.end.column || 0,
    signature: `${name}(${getParamsString(node.params)})`,
    parameters: extractParameters(node.params),
    returnType: extractReturnType(node)
  };
}

/**
 * 提取类信息
 */
function extractClass(node: t.ClassDeclaration): ClassInfo | null {
  const className = node.id?.name || 'Anonymous';
  const classInfo: ClassInfo = {
    name: className,
    methods: [],
    properties: [],
    baseClasses: [],
    decorators: extractDecorators(node),
    startLine: node.loc?.start.line || 0,
    endLine: node.loc?.end.line || 0
  };
  
  // 提取基类
  if (node.superClass) {
    if (t.isIdentifier(node.superClass)) {
      classInfo.baseClasses.push(node.superClass.name);
    }
  }
  
  // 提取类体中的内容
  if (node.body) {
    for (const item of node.body.body) {
      if (t.isClassMethod(item)) {
        const method = extractClassMethod(item);
        if (method) classInfo.methods.push(method);
      } else if (t.isClassProperty(item) && t.isIdentifier(item.key)) {
        classInfo.properties.push(item.key.name);
      }
    }
  }
  
  return classInfo;
}

/**
 * 提取类方法
 */
function extractClassMethod(node: t.ClassMethod): CodeElement | null {
  const methodName = t.isIdentifier(node.key) ? node.key.name : String(node.key);
  
  return {
    name: methodName,
    type: 'method',
    startLine: node.loc?.start.line || 0,
    endLine: node.loc?.end.line || 0,
    startColumn: node.loc?.start.column || 0,
    endColumn: node.loc?.end.column || 0,
    signature: `${methodName}(${getParamsString(node.params as t.FunctionDeclaration['params'])})`,
    parameters: extractParameters(node.params as t.FunctionDeclaration['params']),
    returnType: extractReturnType(node),
    decorators: extractDecorators(node)
  };
}

/**
 * 提取导入信息
 */
function extractImports(node: t.ImportDeclaration, result: ParseResult) {
  const moduleName = node.source.value;
  
  node.specifiers.forEach(spec => {
    if (t.isImportDefaultSpecifier(spec)) {
      result.imports.push({
        moduleName,
        importedName: 'default',
        alias: spec.local.name,
        isDefaultImport: true,
        isNamespaceImport: false,
        line: node.loc?.start.line || 0
      });
    } else if (t.isImportSpecifier(spec)) {
      const importedName = t.isIdentifier(spec.imported) ? spec.imported.name : String(spec.imported.value);
      result.imports.push({
        moduleName,
        importedName,
        alias: spec.local.name !== importedName ? spec.local.name : undefined,
        isDefaultImport: false,
        isNamespaceImport: false,
        line: node.loc?.start.line || 0
      });
    } else if (t.isImportNamespaceSpecifier(spec)) {
      result.imports.push({
        moduleName,
        importedName: '*',
        alias: spec.local.name,
        isDefaultImport: false,
        isNamespaceImport: true,
        line: node.loc?.start.line || 0
      });
    }
  });
}

/**
 * 提取常量
 */
function extractConstants(node: t.VariableDeclaration, result: ParseResult) {
  node.declarations.forEach(decl => {
    if (t.isIdentifier(decl.id) && /^[A-Z_][A-Z0-9_]*$/.test(decl.id.name)) {
      result.constants.push({
        name: decl.id.name,
        type: 'constant',
        startLine: node.loc?.start.line || 0,
        endLine: node.loc?.end.line || 0,
        startColumn: node.loc?.start.column || 0,
        endColumn: node.loc?.end.column || 0
      });
    }
  });
}

/**
 * 获取参数字符串
 */
function getParamsString(params: t.FunctionDeclaration['params']): string {
  return params.map(param => {
    if (t.isIdentifier(param)) {
      return param.name;
    } else if (t.isObjectPattern(param)) {
      return '{...}';
    } else if (t.isArrayPattern(param)) {
      return '[...]';
    } else if (t.isRestElement(param) && t.isIdentifier(param.argument)) {
      return `...${param.argument.name}`;
    } else if (t.isAssignmentPattern(param) && t.isIdentifier(param.left)) {
      return param.left.name;
    } else if (t.isTSParameterProperty(param)) {
      const p = param as unknown as { parameter?: { name?: string } };
      if (p.parameter && p.parameter.name) return p.parameter.name;
      return 'unknown';
    }
    return 'unknown';
  }).join(', ');
}

/**
 * 提取参数信息
 */
function extractParameters(params: t.FunctionDeclaration['params']): ParameterInfo[] {
  const result: ParameterInfo[] = [];
  for (const param of params) {
    if (t.isIdentifier(param)) {
      result.push({
        name: param.name,
        typeAnnotation: param.typeAnnotation ? getTypeString(param.typeAnnotation) : undefined
      });
    } else if (t.isObjectPattern(param)) {
      result.push({ name: '{...}', typeAnnotation: 'object' });
    } else if (t.isArrayPattern(param)) {
      result.push({ name: '[...]', typeAnnotation: 'array' });
    } else if (t.isRestElement(param)) {
      const name = t.isIdentifier(param.argument) ? param.argument.name : 'args';
      const typeAnn = t.isIdentifier(param.argument) && param.argument.typeAnnotation 
        ? getTypeString(param.argument.typeAnnotation) 
        : undefined;
      result.push({ name: `...${name}`, typeAnnotation: typeAnn });
    } else if (t.isAssignmentPattern(param) && t.isIdentifier(param.left)) {
      result.push({
        name: param.left.name,
        typeAnnotation: param.left.typeAnnotation ? getTypeString(param.left.typeAnnotation) : undefined,
        defaultValue: getDefaultValue(param.right)
      });
    } else if (t.isTSParameterProperty(param)) {
      const p = param as unknown as { parameter?: { name?: string; typeAnnotation?: t.TSTypeAnnotation } };
      if (p.parameter) {
        result.push({
          name: p.parameter.name || 'unknown',
          typeAnnotation: p.parameter.typeAnnotation ? getTypeString(p.parameter.typeAnnotation) : undefined
        });
      }
    } else {
      result.push({ name: 'unknown' });
    }
  }
  return result;
}

/**
 * 获取默认值的字符串表示
 */
function getDefaultValue(node: t.Expression): string | undefined {
  if (t.isStringLiteral(node)) return `"${node.value}"`;
  if (t.isNumericLiteral(node)) return String(node.value);
  if (t.isBooleanLiteral(node)) return String(node.value);
  if (t.isNullLiteral(node)) return 'null';
  if (t.isIdentifier(node)) return node.name;
  return undefined;
}

/**
 * 提取返回类型
 */
function extractReturnType(node: t.FunctionDeclaration | t.ClassMethod | t.ArrowFunctionExpression): string | undefined {
  let returnType: t.TSTypeAnnotation | undefined;
  
  if (t.isFunctionDeclaration(node)) {
    const rt = node.returnType as unknown as t.TSTypeAnnotation | null | undefined;
    returnType = rt || undefined;
  } else if (t.isClassMethod(node)) {
    const rt = node.returnType as unknown as t.TSTypeAnnotation | null | undefined;
    returnType = rt || undefined;
  } else if (t.isArrowFunctionExpression(node)) {
    const nodeWithReturnType = node as unknown as { returnType?: t.TSTypeAnnotation | null };
    returnType = nodeWithReturnType.returnType || undefined;
  }
  
  if (returnType) {
    return getTypeString(returnType);
  }
  return undefined;
}

/**
 * 将类型注解转换为字符串
 */
function getTypeString(node: t.TSTypeAnnotation | t.TypeAnnotation | t.Node): string {
  let typeNode: t.Node = node as t.Node;
  
  // 解包 TSTypeAnnotation 或 TypeAnnotation
  const maybeNode = node as unknown as { typeAnnotation?: t.Node };
  if (maybeNode.typeAnnotation) {
    typeNode = maybeNode.typeAnnotation;
  }
  
  if (t.isTSStringKeyword(typeNode)) return 'string';
  if (t.isTSNumberKeyword(typeNode)) return 'number';
  if (t.isTSBooleanKeyword(typeNode)) return 'boolean';
  if (t.isTSAnyKeyword(typeNode)) return 'any';
  if (t.isTSVoidKeyword(typeNode)) return 'void';
  if (t.isTSArrayType(typeNode)) return `${getTypeString(typeNode.elementType)}[]`;
  if (t.isTSTypeReference(typeNode) && t.isIdentifier(typeNode.typeName)) {
    return typeNode.typeName.name;
  }
  if (t.isIdentifier(typeNode)) return typeNode.name;
  return 'unknown';
}

/**
 * 提取装饰器
 */
function extractDecorators(node: t.Node): string[] {
  const nodeWithDecorators = node as unknown as { decorators?: t.Decorator[] | null };
  if (!nodeWithDecorators.decorators || nodeWithDecorators.decorators.length === 0) {
    return [];
  }
  return nodeWithDecorators.decorators.map(dec => {
    if (t.isIdentifier(dec.expression)) {
      return dec.expression.name;
    }
    if (t.isCallExpression(dec.expression) && t.isIdentifier(dec.expression.callee)) {
      return dec.expression.callee.name;
    }
    return 'unknown';
  }).filter(Boolean);
}

// ============================================================================
// Python AST 解析
// ============================================================================

/**
 * 解析 Python 代码的 AST（使用正则和简单解析）
 * 注意：完整的 Python AST 解析需要使用 Python 的 ast 模块
 * 这里提供基础的解析功能
 */
export function parsePython(code: string): ParseResult {
  const result: ParseResult = {
    functions: [],
    classes: [],
    imports: [],
    constants: [],
    language: 'python'
  };

  const lines = code.split('\n');

  // 解析函数定义
  const funcRegex = /^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*([\w\[\],\s\|]+))?\s*:/;
  lines.forEach((line, index) => {
    const match = line.match(funcRegex);
    if (match) {
      const [, name, paramsStr, returnType] = match;
      const params = parsePythonParams(paramsStr);
      const endLine = findPythonBlockEnd(lines, index);
      
      result.functions.push({
        name,
        type: 'function',
        startLine: index + 1,
        endLine,
        startColumn: 0,
        endColumn: line.length,
        signature: `${name}(${paramsStr})${returnType ? ' -> ' + returnType : ''}`,
        parameters: params,
        returnType: returnType?.trim()
      });
    }
  });

  // 解析类定义
  const classRegex = /^class\s+(\w+)(?:\s*\(([^)]*)\))?\s*:/;
  lines.forEach((line, index) => {
    const match = line.match(classRegex);
    if (match) {
      const [, name, baseClassesStr] = match;
      const baseClasses = baseClassesStr ? baseClassesStr.split(',').map(s => s.trim()) : [];
      const endLine = findPythonBlockEnd(lines, index);
      
      const classInfo: ClassInfo = {
        name,
        methods: [],
        properties: [],
        baseClasses,
        decorators: [],
        startLine: index + 1,
        endLine
      };

      // 提取类中的方法
      for (let i = index + 1; i < endLine; i++) {
        const methodMatch = lines[i].match(/^(\s{4,})(?:async\s+)?def\s+(\w+)\s*\(/);
        if (methodMatch && methodMatch[1].length === 4) {
          const methodName = methodMatch[2];
          const methodEnd = findPythonBlockEnd(lines, i);
          classInfo.methods.push({
            name: methodName,
            type: 'method',
            startLine: i + 1,
            endLine: methodEnd,
            startColumn: 4,
            endColumn: lines[i].length
          });
        }
        // 提取属性（self.xxx 赋值）
        const propMatch = lines[i].match(/self\.(\w+)\s*=/);
        if (propMatch && !classInfo.properties.includes(propMatch[1])) {
          classInfo.properties.push(propMatch[1]);
        }
      }

      result.classes.push(classInfo);
    }
  });

  // 解析导入
  const importRegex = /^(?:from\s+([\w.]+)\s+)?import\s+(.+)/;
  lines.forEach((line, index) => {
    const match = line.match(importRegex);
    if (match) {
      const [, fromModule, imports] = match;
      if (fromModule) {
        // from module import xxx
        imports.split(',').forEach(imp => {
          const parts = imp.trim().split(/\s+as\s+/);
          result.imports.push({
            moduleName: fromModule,
            importedName: parts[0].trim(),
            alias: parts[1]?.trim(),
            isDefaultImport: false,
            isNamespaceImport: false,
            line: index + 1
          });
        });
      } else {
        // import module
        imports.split(',').forEach(imp => {
          const parts = imp.trim().split(/\s+as\s+/);
          result.imports.push({
            moduleName: parts[0].trim(),
            importedName: parts[0].trim(),
            alias: parts[1]?.trim(),
            isDefaultImport: true,
            isNamespaceImport: false,
            line: index + 1
          });
        });
      }
    }
  });

  // 解析常量（全大写的变量）
  const constRegex = /^([A-Z_][A-Z0-9_]*)\s*=/;
  lines.forEach((line, index) => {
    const match = line.match(constRegex);
    if (match) {
      result.constants.push({
        name: match[1],
        type: 'constant',
        startLine: index + 1,
        endLine: index + 1,
        startColumn: 0,
        endColumn: line.length
      });
    }
  });

  return result;
}

/**
 * 解析 Python 参数
 */
function parsePythonParams(paramsStr: string): ParameterInfo[] {
  if (!paramsStr.trim()) return [];
  
  return paramsStr.split(',').map(param => {
    const parts = param.trim().split(':');
    const nameParts = parts[0].trim().split('=');
    const name = nameParts[0].trim();
    const typeAnnotation = parts[1]?.split('=')[0].trim();
    const defaultValue = parts[0].includes('=') ? nameParts[1]?.trim() :
                         parts[1]?.includes('=') ? parts[1].split('=')[1]?.trim() : undefined;
    
    return {
      name: name.replace('self', '').replace('cls', ''),
      typeAnnotation: typeAnnotation || undefined,
      defaultValue
    };
  }).filter(p => p.name);
}

/**
 * 查找 Python 代码块的结束行（基于缩进）
 */
function findPythonBlockEnd(lines: string[], startLine: number): number {
  if (startLine >= lines.length) return startLine + 1;
  
  const baseIndent = lines[startLine].search(/\S/);
  let endLine = startLine + 1;
  
  while (endLine < lines.length) {
    const line = lines[endLine];
    if (line.trim() === '') {
      endLine++;
      continue;
    }
    
    const currentIndent = line.search(/\S/);
    if (currentIndent <= baseIndent && line.trim()) {
      break;
    }
    endLine++;
  }
  
  return endLine;
}

/**
 * 通用的代码解析入口
 */
export function parseCode(code: string, filePath?: string): ParseResult {
  const extension = filePath?.split('.').pop()?.toLowerCase() || '';
  
  if (['py'].includes(extension)) {
    return parsePython(code);
  }
  
  if (['ts', 'tsx'].includes(extension)) {
    return parseJavaScript(code, true);
  }
  
  if (['js', 'jsx', 'mjs', 'cjs'].includes(extension)) {
    return parseJavaScript(code, false);
  }
  
  // 默认尝试 TypeScript
  return parseJavaScript(code, true);
}
