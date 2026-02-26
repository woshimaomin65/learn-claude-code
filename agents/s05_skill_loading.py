#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
s05_skill_loading.py - 技能加载模块

实现两层技能注入机制，避免系统提示词过于臃肿：

    第一层（轻量）：系统提示词中只包含技能名称 (~100 tokens/技能)
    第二层（按需）：完整技能内容通过 tool_result 返回

    系统提示词:
    +--------------------------------------+
    | 你是一个编码助手。                    |
    | 可用技能:                            |
    |   - git: Git 工作流助手              |  <-- 第一层：仅元数据
    |   - test: 测试最佳实践              |
    +--------------------------------------+

    当模型调用 load_skill("git") 时:
    +--------------------------------------+
    | tool_result:                         |
    | <skill>                              |
    |   完整的 Git 工作流指令...           |  <-- 第二层：完整内容
    |   步骤 1: ...                        |
    |   步骤 2: ...                        |
    | </skill>                             |
    +--------------------------------------+

核心理念："不要把所有内容都放进系统提示词，按需加载。"
"""

import os
import re
import subprocess
from pathlib import Path
from glob import glob
import json
import readline

from llm_config import client, MODEL  # 导入 LLM 客户端配置和模型名称


def js(data):
    """格式化打印 JSON 数据（用于调试）"""
    print(json.dumps(data, indent=2, ensure_ascii=False, default=str))

# 设置工作目录和技能目录
WORKDIR = Path.cwd()  # 当前工作目录
SKILLS_DIR = WORKDIR / "skills"  # 技能文件存储目录


# -- SkillLoader 类：解析 .skills/*.md 文件（带 YAML frontmatter）--
class SkillLoader:
    """
    技能加载器类
    
    负责从 markdown 文件中解析技能定义，支持 YAML frontmatter 元数据
    实现两层技能加载机制：
    - Layer 1: 获取技能的简短描述（用于系统提示词）
    - Layer 2: 获取技能的完整内容（按需加载）
    """
    
    def __init__(self, skills_dir: Path):
        """
        初始化技能加载器
        
        Args:
            skills_dir: 技能文件所在的目录路径
        """
        self.skills_dir = skills_dir  # 技能目录
        self.skills = {}  # 存储所有已加载的技能 {name: {meta, body, path}}
        self._load_all()  # 初始化时加载所有技能

    def _load_all(self):
        """
        加载技能目录下的所有技能文件
        
        遍历 skills 目录下的所有子目录，读取其中的 .md 文件
        解析每个文件的 YAML frontmatter 和正文内容
        """
        # 遍历技能目录下的所有子目录
        for _dir in sorted(glob(f"{self.skills_dir}/*")):
            # 遍历每个子目录下的所有 markdown 文件
            for f in glob(f'{_dir}/*.md'):
                # 从文件路径提取技能名称（父目录名）
                name = Path(f.rsplit('/', 1)[0]).stem
                # 读取文件内容
                text = Path(f).read_text()
                # 解析 frontmatter 和正文
                meta, body = self._parse_frontmatter(text)
                # 存储技能信息
                self.skills[name] = {"meta": meta, "body": body, "path": str(f)}

    def _parse_frontmatter(self, text: str) -> tuple:
        """
        解析 YAML frontmatter（位于 --- 分隔符之间）
        
        Args:
            text: 包含 frontmatter 的完整文本
            
        Returns:
            tuple: (元数据字典，正文字符串)
        """
        # 匹配 YAML frontmatter 格式：---\n内容\n---\n正文
        match = re.match(r"^---\n(.*?)\n---\n(.*)", text, re.DOTALL)
        if not match:
            # 没有 frontmatter，返回空字典和全文
            return {}, text
        
        meta = {}
        # 逐行解析 YAML 键值对
        for line in match.group(1).strip().splitlines():
            if ":" in line:
                key, val = line.split(":", 1)
                meta[key.strip()] = val.strip()
        
        return meta, match.group(2).strip()

    def get_descriptions(self) -> str:
        """
        第一层：获取技能的简短描述（用于系统提示词）
        
        Returns:
            str: 格式化的技能描述列表字符串
        """
        if not self.skills:
            return "(no skills available)"
        
        lines = []
        for name, skill in self.skills.items():
            # 获取技能描述和标签
            desc = skill["meta"].get("description", "No description")
            tags = skill["meta"].get("tags", "")
            
            # 构建描述行
            line = f"  - {name}: {desc}"
            if tags:
                line += f" [{tags}]"
            lines.append(line)
        
        return "\n".join(lines)

    def get_content(self, name: str) -> str:
        """
        第二层：获取技能的完整内容（在 tool_result 中返回）
        
        Args:
            name: 技能名称
            
        Returns:
            str: 格式化的技能内容，或错误信息
        """
        skill = self.skills.get(name)
        if not skill:
            # 技能不存在时返回错误信息和可用技能列表
            return f"Error: Unknown skill '{name}'. Available: {', '.join(self.skills.keys())}"
        
        # 返回 XML 格式的技能内容
        return f"<skill name=\"{name}\">\n{skill['body']}\n</skill>"


# 创建全局技能加载器实例
SKILL_LOADER = SkillLoader(SKILLS_DIR)

# 第一层：将技能元数据注入系统提示词
SYSTEM = f"""You are a coding agent at {WORKDIR}.
Use load_skill to access specialized knowledge before tackling unfamiliar topics.

Skills available:
{SKILL_LOADER.get_descriptions()}"""


# -- 工具函数实现 --

def safe_path(p: str) -> Path:
    """
    安全路径解析器
    
    确保解析后的路径在工作目录内，防止目录遍历攻击
    
    Args:
        p: 相对路径字符串
        
    Returns:
        Path: 解析后的绝对路径
        
    Raises:
        ValueError: 当路径超出工作目录范围时
    """
    path = (WORKDIR / p).resolve()
    if not path.is_relative_to(WORKDIR):
        raise ValueError(f"Path escapes workspace: {p}")
    return path


def run_bash(command: str) -> str:
    """
    执行 bash 命令
    
    包含安全检查，阻止危险命令执行
    
    Args:
        command: 要执行的 shell 命令
        
    Returns:
        str: 命令输出或错误信息
    """
    # 危险命令检查列表
    dangerous = ["rm -rf /", "sudo", "shutdown", "reboot", "> /dev/"]
    if any(d in command for d in dangerous):
        return "Error: Dangerous command blocked"
    
    try:
        r = subprocess.run(command, shell=True, cwd=WORKDIR,
                           capture_output=True, text=True, timeout=120)
        out = (r.stdout + r.stderr).strip()
        # 限制输出长度
        return out[:50000] if out else "(no output)"
    except subprocess.TimeoutExpired:
        return "Error: Timeout (120s)"


def run_read(path: str, limit: int = None) -> str:
    """
    读取文件内容
    
    Args:
        path: 文件路径
        limit: 可选的行数限制
        
    Returns:
        str: 文件内容或错误信息
    """
    try:
        lines = safe_path(path).read_text().splitlines()
        if limit and limit < len(lines):
            # 超过限制时截断并提示剩余行数
            lines = lines[:limit] + [f"... ({len(lines) - limit} more)"]
        return "\n".join(lines)[:50000]
    except Exception as e:
        return f"Error: {e}"


def run_write(path: str, content: str) -> str:
    """
    写入文件内容
    
    Args:
        path: 文件路径
        content: 要写入的内容
        
    Returns:
        str: 操作结果或错误信息
    """
    try:
        fp = safe_path(path)
        # 确保父目录存在
        fp.parent.mkdir(parents=True, exist_ok=True)
        fp.write_text(content)
        return f"Wrote {len(content)} bytes"
    except Exception as e:
        return f"Error: {e}"


def run_edit(path: str, old_text: str, new_text: str) -> str:
    """
    编辑文件内容（精确文本替换）
    
    Args:
        path: 文件路径
        old_text: 要替换的原文本
        new_text: 替换后的新文本
        
    Returns:
        str: 操作结果或错误信息
    """
    try:
        fp = safe_path(path)
        content = fp.read_text()
        if old_text not in content:
            return f"Error: Text not found in {path}"
        # 只替换第一次出现
        fp.write_text(content.replace(old_text, new_text, 1))
        return f"Edited {path}"
    except Exception as e:
        return f"Error: {e}"


# 工具处理函数映射表
TOOL_HANDLERS = {
    "bash":       lambda **kw: run_bash(kw["command"]),
    "read_file":  lambda **kw: run_read(kw["path"], kw.get("limit")),
    "write_file": lambda **kw: run_write(kw["path"], kw["content"]),
    "edit_file":  lambda **kw: run_edit(kw["path"], kw["old_text"], kw["new_text"]),
    "load_skill": lambda **kw: SKILL_LOADER.get_content(kw["name"]),
}

# 工具定义列表（用于向 LLM 声明可用工具）
TOOLS = [
    {"name": "bash", "description": "Run a shell command.",
     "input_schema": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]}},
    {"name": "read_file", "description": "Read file contents.",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "limit": {"type": "integer"}}, "required": ["path"]}},
    {"name": "write_file", "description": "Write content to file.",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]}},
    {"name": "edit_file", "description": "Replace exact text in file.",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "old_text": {"type": "string"}, "new_text": {"type": "string"}}, "required": ["path", "old_text", "new_text"]}},
    {"name": "load_skill", "description": "Load specialized knowledge by name.",
     "input_schema": {"type": "object", "properties": {"name": {"type": "string", "description": "Skill name to load"}}, "required": ["name"]}},
]


def agent_loop(messages: list):
    """
    智能体主循环
    
    处理 LLM 响应，执行工具调用，并将结果反馈给 LLM
    
    Args:
        messages: 对话消息历史列表
    """
    while True:
        # 调用 LLM API 获取响应
        response = client.messages.create(
            model=MODEL, system=SYSTEM, messages=messages,
            tools=TOOLS, max_tokens=8000,
        )
        
        # 将助手响应添加到消息历史
        messages.append({"role": "assistant", "content": response.content})
        
        # 如果没有工具调用，结束循环
        if response.stop_reason != "tool_use":
            return
        
        # 处理所有工具调用
        results = []
        for block in response.content:
            if block.type == "tool_use":
                handler = TOOL_HANDLERS.get(block.name)
                try:
                    # 执行对应的工具处理函数
                    output = handler(**block.input) if handler else f"Unknown tool: {block.name}"
                except Exception as e:
                    output = f"Error: {e}"
                # 打印工具执行结果（前 200 字符）
                print(f"> {block.name}: {str(output)[:200]}")
                # 添加工具结果到响应列表
                results.append({"type": "tool_result", "tool_use_id": block.id, "content": str(output)})
        
        # 将工具结果添加到消息历史
        messages.append({"role": "user", "content": results})


if __name__ == "__main__":
    # 主程序入口 - 交互式命令行界面
    history = []  # 对话历史
    
    while True:
        try:
            # 读取用户输入（带颜色提示符）
            query = input("\033[36ms05 >> \033[0m")
        except (EOFError, KeyboardInterrupt):
            # 处理 Ctrl+D 或 Ctrl+C
            break
        
        # 检查退出命令
        if query.strip().lower() in ("q", "exit", ""):
            break
        
        # 添加用户消息到历史
        history.append({"role": "user", "content": query})
        
        # 运行智能体循环
        agent_loop(history)
        print()  # 空行分隔
