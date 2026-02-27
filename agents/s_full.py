#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
s_full.py - Full Reference Agent

Capstone implementation combining every mechanism from s01-s11.
Session s12 (task-aware worktree isolation) is taught separately.
NOT a teaching session -- this is the "put it all together" reference.

    +------------------------------------------------------------------+
   |                       FULL AGENT                                 |
   |                                                                  |
   | System prompt (s05 skills, task-first + optional todo nag)      |
   |                                                                  |
   | Before each LLM call:                                            |
   | +--------------------+  +------------------+  +--------------+  |
   ||Microcompact (s06)||Drain bg (s08)  ||Check inbox | |
   ||Auto-compact (s06)||notifications   ||(s09)       | |
   | +--------------------+  +------------------+  +--------------+  |
   |                                                                  |
   | Tool dispatch (s02 pattern):                                     |
   | +--------+----------+----------+---------+-----------+          |
   ||bash  |read    |write   |edit   |TodoWrite|         |
   ||task  |load_sk |compress|bg_run |bg_check |         |
   ||t_crt |t_get   |t_upd   |t_list |spawn_tm |         |
   ||list_tm| send_msg|rd_inbox|bcast  |shutdown |         |
   ||plan  |idle    |claim   |       |         |         |
   | +--------+----------+----------+---------+-----------+          |
   |                                                                  |
   | Subagent (s04):  spawn -> work -> return summary                 |
   | Teammate (s09):  spawn -> work -> idle -> auto-claim (s11)      |
   | Shutdown (s10):  request_id handshake                            |
   | Plan gate (s10): submit -> approve/reject                        |
    +------------------------------------------------------------------+

    REPL commands: /compact /tasks /team /inbox
"""

import json
import os
import sys
import re
import subprocess
import threading
import time
import uuid
from pathlib import Path
from queue import Queue
from datetime import datetime, timedelta
from typing import Any, Dict, List, Union

from llm_config import client, MODEL
import readline  # Enables line editing (backspace, arrow keys, history)
from glob import glob
import urllib.request
import ssl
import json as json_module


# =============================================================================
# TAVILY SEARCH MCP CLIENT
# =============================================================================

class TavilyConfig:
    """Configuration for Tavily API."""
    BASE_URL = "https://api.tavily.com"
    
    @classmethod
    def get_api_key(cls):
        """Get Tavily API key from environment."""
        return os.getenv("TAVILY_API_KEY", "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")


class TavilyClient:
    """Client for interacting with Tavily Search MCP API."""
    
    def __init__(self):
        self.base_url = TavilyConfig.BASE_URL
        self.api_key = TavilyConfig.get_api_key()
        self.timeout = 30
        
    def _create_ssl_context(self):
        """Create SSL context for HTTPS requests."""
        return ssl.create_default_context()
    
    def _make_request(self, endpoint, data):
        """Make HTTP POST request to Tavily API."""
        url = f"{self.base_url}/{endpoint}"
        
        # Prepare request data
        request_data = json_module.dumps({
            "api_key": self.api_key,
            **data
        }).encode('utf-8')
        
        # Create request
        req = urllib.request.Request(
            url,
            data=request_data,
            headers={'Content-Type': 'application/json'}
        )
        
        # Make request
        try:
            context = self._create_ssl_context()
            with urllib.request.urlopen(req, context=context, timeout=self.timeout) as response:
                return json_module.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            return {"error": f"HTTP Error {e.code}: {e.reason}", "response": e.read().decode('utf-8')}
        except urllib.error.URLError as e:
            return {"error": f"URL Error: {e.reason}"}
        except Exception as e:
            return {"error": f"Request failed: {str(e)}"}
    
    def search(self, query, search_depth="basic", max_results=5, include_answer=False):
        """General web search using Tavily API.
        
        Args:
            query: Search query string
            search_depth: "basic" or "advanced"
            max_results: Maximum number of results (1-10)
            include_answer: Include answer summary
            
        Returns:
            Dict with search results
        """
        data = {
            "query": query,
            "search_depth": search_depth,
            "max_results": min(max(1, max_results), 10),
            "include_answer": include_answer,
        }
        return self._make_request("search", data)
    
    def search_news(self, query, max_results=5, days=7):
        """Search for news articles using Tavily API.
        
        Args:
            query: News search query string
            max_results: Maximum number of results (1-10)
            days: Limit to recent N days
            
        Returns:
            Dict with news results
        """
        data = {
            "query": query,
            "max_results": min(max(1, max_results), 10),
            "days": days,
        }
        return self._make_request("search/news", data)
    
    def fact_check(self, claim):
        """Fact-check claims using Tavily API.
        
        Args:
            claim: Claim or statement to verify
            
        Returns:
            Dict with fact-check results
        """
        data = {
            "query": claim,
            "search_depth": "advanced",
            "max_results": 10,
        }
        return self._make_request("search", data)


# Initialize Tavily client instance
tavily_client = TavilyClient()

# =============================================================================
# LOGGING CONFIGURATION
# =============================================================================

def setup_logging():
    """Setup logging directories and return log manager."""
    # Use workspace log directory
    log_dir = WORKDIR / ".agent_logs" if WORKDIR else Path("./.agent_logs")
    log_dir.mkdir(parents=True, exist_ok=True)
    return log_dir


def generate_log_filename(agent_name: str = "main") -> str:
    """Generate a timestamped log filename."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return LOG_DIR / f"{agent_name}_{timestamp}.jsonl"


def parse_content_block(block: Any) -> Dict[str, Any]:
    """
    Parse a content block from response.content into a human-readable dict.
    
    Handles different block types:
    - text: Plain text content
    - tool_use: Tool/function call with name and input
    - other: Any other block type
    """
    result = {"type": getattr(block, "type", "unknown")}
    bad_flag = False
    if hasattr(block, "type"):
        if block.type == "text":
            result["text"] = getattr(block, "text", "")
    
        elif block.type == "tool_use":
            result["tool_name"] = getattr(block, "name", "unknown")
            result["tool_input"] = getattr(block, "input", {})
            result["tool_id"] = getattr(block, "id", "")
        else:
            bad_flag = True
    
    elif bad_flag or not hasattr(block, "type"):
        # Fallback: convert to dict or string
        try:
            result["data"] = str(block)
        except Exception as e:
            result["data"] = f"<unparseable: {e}>"
    
    return result


def parse_response_content(content: List[Any]) -> List[Dict[str, Any]]:
    """
    Parse response.content list into a list of human-readable dicts.
    
    Args:
        content: List of content blocks from Claude API response
    
    Returns:
        List of parsed block dictionaries
    """
    parsed = []
    for block in content:
        parsed.append(parse_content_block(block))
    return parsed


def parse_messages_for_log(messages: List[Dict]) -> List[Dict]:
    """
    Parse messages list for logging, handling both string and content block formats.
    
    Args:
        messages: List of message dicts with 'role' and 'content' keys
    
    Returns:
        List of parsed message dictionaries
    """
    parsed = []
    for msg in messages:
        parsed_msg = {"role": msg.get("role", "unknown")}
        content = msg.get("content", "")
        
        # Handle different content formats
        if isinstance(content, str):
            parsed_msg["content"] = content
        elif isinstance(content, list):
            # Parse content blocks
            parsed_msg["content_blocks"] = parse_response_content(content)
            # Also extract combined text for quick viewing
            texts = []
            for block in content:
                if hasattr(block, "type") and block.type == "text":
                    texts.append(getattr(block, "text", ""))
            parsed_msg["content_text"] = "\n".join(texts)
        else:
            parsed_msg["content"] = str(content)
        
        parsed.append(parsed_msg)
    
    return parsed


class AgentLogger:
    """Logger for agent interactions."""
    
    MAX_LOG_LINES = 100000  # Maximum number of lines to keep in log file
    
    def __init__(self, agent_name: str = "main"):
        self.agent_name = agent_name
        self.log_file = generate_log_filename(agent_name)
        self.call_count = 0
        self._lock = threading.Lock()
        # Track execution trace for detailed reports
        self.execution_trace = []
        self.current_plan = []
    
    def _trim_log_if_needed(self, f):
        """
        Expert Tip: 不要直接在原本的写入句柄上进行 trim。
        关闭写入句柄，以读写模式 ('r+') 打开文件，或者使用临时文件。
        """
        # 1. 确保写入已完成
        f.flush()
        file_path = f.name
    
        # 2. 如果文件是 append 模式，无法直接 read，必须关闭后重新打开
        # 这里建议在外部统一管理 file_handle，或者在这里进行重新打开
        f.close() 
    
        # 3. 以读写模式打开文件
        with open(file_path, 'r+') as file:
            lines = file.readlines()
            
            # 4. 判断是否需要修剪
            if len(lines) > self.MAX_LOG_LINES:
                # 只保留最后 MAX_LOG_LINES 行
                trimmed_lines = lines[-self.MAX_LOG_LINES:]
                
                # 5. 截断文件并重写
                file.seek(0)
                file.truncate()
                file.writelines(trimmed_lines)
                
        # 6. 重要：函数结束前重新以 append 模式打开，以便后续继续追加
        # 注意：这里需要你重新给 self.file_handle 赋值
        self.file_handle = open(file_path, 'a')
    
    def log_call(self, messages: List[Dict], response: Any, results: List = None):
        """
        Log a single LLM call with input messages and output response.
        
        Args:
            messages: Input messages sent to the LLM
            response: Response object from the LLM
            results: Optional tool execution results
        """
        self.call_count += 1
        
        # Extract plan/content from response
        plan_content = ""
        tool_calls = []
        for block in response.content:
            if block.type == "text":
                plan_content = block.text
            elif block.type == "tool_use":
                tool_calls.append({
                    "name": block.name,
                    "arguments": block.input,
                    "id": block.id,
                })
        
        # Add to execution trace
        if plan_content:
            self.current_plan.append({
                "call_id": self.call_count,
                "plan": plan_content[:500] + "..." if len(plan_content) > 500 else plan_content,
                "timestamp": datetime.now().isoformat(),
            })
        
        for tool_call in tool_calls:
            self.execution_trace.append({
                "type": "tool_call",
                "call_id": self.call_count,
                "name": tool_call["name"],
                "arguments": tool_call["arguments"],
                "timestamp": datetime.now().isoformat(),
            })
        
        log_entry = {
            "call_id": self.call_count,
            "timestamp": datetime.now().isoformat(),
            "agent": self.agent_name,
            "input": {
                "message_count": len(messages),
                "messages": parse_messages_for_log(messages),
            },
            "output": {
                "stop_reason": getattr(response, "stop_reason", "unknown"),
                "content_blocks": parse_response_content(response.content),
                "model": getattr(response, "model", ""),
                "plan": plan_content[:500] + "..." if len(plan_content) > 500 else plan_content,
                "tool_calls": tool_calls,
            },
        }
        
        if results:
            log_entry["tool_results"] = results
        
        with self._lock:
            with open(self.log_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(log_entry, ensure_ascii=False, indent=2) + "\n")
                self._trim_log_if_needed(f)
    
    def log_tool_result(self, tool_name: str, result: str):
        """Log a tool execution result."""
        entry = {
            "type": "tool_result",
            "timestamp": datetime.now().isoformat(),
            "tool_name": tool_name,
            "result": result,
        }
        
        # Add to execution trace
        self.execution_trace.append({
            "type": "tool_result",
            "name": tool_name,
            "result_preview": result[:200] + "..." if len(result) > 200 else result,
            "timestamp": datetime.now().isoformat(),
        })
        
        with self._lock:
            with open(self.log_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
                self._trim_log_if_needed(f)
    
    def log_skill_load(self, skill_name: str):
        """Log a skill load event."""
        entry = {
            "type": "skill_load",
            "timestamp": datetime.now().isoformat(),
            "skill_name": skill_name,
        }
        
        # Add to execution trace
        self.execution_trace.append({
            "type": "skill_load",
            "name": skill_name,
            "timestamp": datetime.now().isoformat(),
        })
        
        with self._lock:
            with open(self.log_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
                self._trim_log_if_needed(f)
    
    def get_execution_trace_markdown(self, query: str) -> str:
        """Generate a markdown report of the execution trace."""
        md = []
        md.append(f"# Agent Execution Report\n")
        md.append(f"**Query**: {query}\n")
        md.append(f"**Timestamp**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        md.append(f"**Agent**: {self.agent_name}\n")
        md.append(f"**Total LLM Calls**: {self.call_count}\n")
        md.append(f"**Total Actions**: {len(self.execution_trace)}\n")
        md.append("")
        
        # Group by plan/LLM call
        md.append("## Execution Plan & Actions\n")
        
        current_plan = None
        action_num = 0
        
        for i, trace_item in enumerate(self.execution_trace, 1):
            if trace_item["type"] == "tool_call":
                action_num += 1
                md.append(f"### Step {action_num}: Tool Call - `{trace_item['name']}`\n")
                md.append(f"**Timestamp**: {trace_item['timestamp']}\n")
                if trace_item.get("arguments"):
                    md.append(f"**Arguments**:\n```json\n{json.dumps(trace_item['arguments'], indent=2, ensure_ascii=False)}\n```\n")
            elif trace_item["type"] == "tool_result":
                md.append(f"**Result**: `{trace_item['result_preview']}`\n")
                md.append("")
            elif trace_item["type"] == "skill_load":
                action_num += 1
                md.append(f"### Step {action_num}: Skill Loaded - `{trace_item['name']}`\n")
                md.append(f"**Timestamp**: {trace_item['timestamp']}\n")
                md.append("")
        
        # Add plan summaries
        if self.current_plan:
            md.append("\n## Plan Summaries\n")
            for idx, plan_item in enumerate(self.current_plan, 1):
                md.append(f"### LLM Call #{plan_item['call_id']}\n")
                md.append(f"**Timestamp**: {plan_item['timestamp']}\n")
                md.append(f"**Plan/Thought**:\n{plan_item['plan']}\n")
                md.append("")
        
        return "\n".join(md)
    
    def reset_trace(self):
        """Reset the execution trace for a new query."""
        self.execution_trace = []
        self.current_plan = []

WORKDIR = Path.cwd()
LOG_DIR = setup_logging()

# Output directory for saving query results
OUTPUT_DIR = Path("/Users/maomin/programs/vscode/learn-claude-code/agents/data/output")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

TEAM_DIR = WORKDIR / ".team"
INBOX_DIR = TEAM_DIR / "inbox"
TASKS_DIR = WORKDIR / ".tasks"
SKILLS_DIR = WORKDIR / "skills"
TRANSCRIPT_DIR = WORKDIR / ".transcripts"
TOKEN_THRESHOLD = 100000
POLL_INTERVAL = 5
IDLE_TIMEOUT = 60

VALID_MSG_TYPES = {"message", "broadcast", "shutdown_request",
                   "shutdown_response", "plan_approval_response"}


def js(data):
    print(json.dumps(data, indent=2, ensure_ascii=False, default=str), flush=True)
# === SECTION: base_tools ===
def safe_path(p: str, allow_outside: bool = False) -> Path:
    """
    Resolve and validate a file path.
    
    Args:
        p: The path to resolve (can be absolute or relative)
        allow_outside: If True, allow paths outside WORKDIR (for reading only)
                       If False (default), restrict to WORKDIR for safety
    
    Returns:
        Resolved Path object
    
    Raises:
        ValueError: If path escapes WORKDIR and allow_outside is False
    """
    # Handle absolute paths directly
    if os.path.isabs(p):
        path = Path(p).resolve()
    else:
        path = (WORKDIR / p).resolve()
    
    # Only restrict paths if WORKDIR is set and allow_outside is False
    if not allow_outside and WORKDIR:
        if not path.is_relative_to(WORKDIR):
            raise ValueError(f"Path escapes workspace: {p}")
    return path

def run_bash(command: str) -> str:
    dangerous = ["rm -rf /", "sudo", "shutdown", "reboot", "> /dev/"]
    if any(d in command for d in dangerous):
        return "Error: Dangerous command blocked"
    try:
        r = subprocess.run(command, shell=True, cwd=WORKDIR,
                           capture_output=True, text=True, timeout=120)
        out = (r.stdout + r.stderr).strip()
        return out[:50000] if out else "(no output)"
    except subprocess.TimeoutExpired:
        return "Error: Timeout (120s)"

def parse_relative_time(query: str) -> tuple[str, int|None]:
    """
    Parse relative time expressions in query and convert to specific dates.
    
    Args:
        query: The search query that may contain relative time expressions
        
    Returns:
        tuple: (modified_query, days_limit)
            - modified_query: Query with relative time replaced by specific dates
            - days_limit: Number of days for news search (None if not applicable)
    
    Supported expressions:
        - 今天/今天/今日/today -> current date
        - 昨天/昨日/yesterday -> 1 day ago
        - 前天 -> 2 days ago
        - 最近/近期/recent/recently -> 7 days
        - 最近一周/近一周/过去一周/last week -> 7 days
        - 最近一个月/近一个月/过去一个月/last month -> 30 days
        - 最近三天/近三天/过去三天 -> 3 days
        - 本周/这周/this week -> days since Monday
        - 本月/这个月/this month -> days since 1st of month
    """
    today = datetime.now()
    days_limit = None
    modified_query = query
    date_str = today.strftime("%Y 年 %m 月 %d 日")
    
    # Patterns for relative time expressions (Chinese and English)
    # NOTE: No spaces around|in regex patterns!
    time_patterns = [
        # Today - highest priority, most specific
        (r'(今天|今日|今天|today|current date)', 1, date_str),
        # Yesterday
        (r'(昨天|昨日|yesterday)', 2, (today - timedelta(days=1)).strftime("%Y 年 %m 月 %d 日")),
        # Day before yesterday
        (r'(前天|the day before yesterday)', 3, (today - timedelta(days=2)).strftime("%Y 年 %m 月 %d 日")),
        # Last 3 days
        (r'(最近三天|近三天|过去三天|last 3 days)', 4, None),
        # Last week / recent 7 days
        (r'(最近一周|近一周|过去一周|最近 7 天|近 7 天|last week|past week|recent week)', 7, None),
        # Last month / recent 30 days
        (r'(最近一个月|近一个月|过去一个月|最近 30 天|近 30 天|last month|past month|recent month)', 30, None),
        # Recent / lately (default 7 days)
        (r'(最近|近期|近来|近日|recent|recently|lately)', 7, None),
        # This week
        (r'(本周|这周|本星期|这个星期|this week)', None, None),
        # This month
        (r'(本月|这个月|当月|this month)', None, None),
    ]
    
    for pattern, days, specific_date in time_patterns:
        match = re.search(pattern, query, re.IGNORECASE)
        if match:
            days_limit = days
            if specific_date:
                # Replace the relative time with specific date
                modified_query = re.sub(pattern, f"{specific_date}", query, flags=re.IGNORECASE)
            else:
                # For week/month/recent, add date context to query
                if 'week' in pattern or '周' in pattern or '星期' in pattern:
                    # Calculate Monday of this week
                    monday = today - timedelta(days=today.weekday())
                    date_context = f"{monday.strftime('%Y 年 %m 月 %d 日')}至今"
                    modified_query = re.sub(pattern, f"{date_context}", query, flags=re.IGNORECASE)
                elif 'month' in pattern or '月' in pattern:
                    # First day of this month
                    first_day = today.replace(day=1)
                    date_context = f"{first_day.strftime('%Y 年 %m 月 %d 日')}至今"
                    modified_query = re.sub(pattern, f"{date_context}", query, flags=re.IGNORECASE)
                elif days is not None:
                    # For "recent" type queries, add date range context
                    start_date = today - timedelta(days=days)
                    date_context = f"{start_date.strftime('%Y 年 %m 月 %d 日')}至今"
                    modified_query = f"{date_context}{query}"
            break  # Use the first (highest priority) match
    
    return modified_query, days_limit


def run_tavily_search(query: str, search_depth: str = "basic", max_results: int = 5, include_answer: bool = False) -> str:
    """Run Tavily general web search."""
    if not query:
        return "Error: query is required"
    try:
        # Parse relative time expressions and add date context to query
        processed_query, _ = parse_relative_time(query)
        result = tavily_client.search(processed_query, search_depth, max_results, include_answer)
        return json_module.dumps(result, indent=2, ensure_ascii=False)
    except Exception as e:
        return f"Error: {str(e)}"


def run_tavily_news(query: str, max_results: int = 5, days: int = 7) -> str:
    """Run Tavily news search."""
    if not query:
        return "Error: query is required"
    try:
        # Parse relative time expressions to automatically set days parameter
        processed_query, parsed_days = parse_relative_time(query)
        # Use parsed days if available, otherwise use default
        if parsed_days is not None:
            days = parsed_days
        result = tavily_client.search_news(processed_query, max_results, days)
        return json_module.dumps(result, indent=2, ensure_ascii=False)
    except Exception as e:
        return f"Error: {str(e)}"


def run_tavily_fact_check(claim: str) -> str:
    """Run Tavily fact check."""
    if not claim:
        return "Error: claim is required"
    try:
        result = tavily_client.fact_check(claim)
        return json_module.dumps(result, indent=2, ensure_ascii=False)
    except Exception as e:
        return f"Error: {str(e)}"



def run_read(path: str, limit: int = None) -> str:
    try:
        # Allow reading files outside WORKDIR (reading is safe)
        lines = safe_path(path, allow_outside=True).read_text(encoding='utf-8').splitlines()
        if limit and limit < len(lines):
            lines = lines[:limit] + [f"... ({len(lines) - limit} more)"]
        return "\n".join(lines)[:50000]
    except Exception as e:
        return f"Error: {e}"

def run_write(path: str, content: str, allow_outside: bool = True) -> str:
    """
    Write content to a file.
    
    Args:
        path: File path (absolute or relative)
        content: Content to write
        allow_outside: If True, allow writing outside WORKDIR (default: True for flexibility)
    """
    try:
        fp = safe_path(path, allow_outside=allow_outside)
        fp.parent.mkdir(parents=True, exist_ok=True)
        fp.write_text(content, encoding='utf-8')
        return f"Wrote {len(content)} bytes to {path}"
    except Exception as e:
        return f"Error: {e}"

def run_edit(path: str, old_text: str, new_text: str, allow_outside: bool = True) -> str:
    """
    Edit a file by replacing text.
    
    Args:
        path: File path (absolute or relative)
        old_text: Text to find and replace
        new_text: Replacement text
        allow_outside: If True, allow editing outside WORKDIR (default: True for flexibility)
    """
    try:
        fp = safe_path(path, allow_outside=allow_outside)
        c = fp.read_text(encoding='utf-8')
        if old_text not in c:
            return f"Error: Text not found in {path}"
        fp.write_text(c.replace(old_text, new_text, 1), encoding='utf-8')
        return f"Edited {path}"
    except Exception as e:
        return f"Error: {e}"

def run_set_workdir(path: str) -> str:
    """
    Set the working directory for the agent.
    
    Args:
        path: New working directory path (absolute or relative to current WORKDIR)
    
    Returns:
        Confirmation message with the new WORKDIR
    """
    global WORKDIR, TEAM_DIR, INBOX_DIR, TASKS_DIR, SKILLS_DIR, TRANSCRIPT_DIR
    try:
        if os.path.isabs(path):
            new_workdir = Path(path).resolve()
        else:
            new_workdir = (WORKDIR / path).resolve()
        
        if not new_workdir.exists():
            return f"Error: Directory does not exist: {new_workdir}"
        if not new_workdir.is_dir():
            return f"Error: Not a directory: {new_workdir}"
        
        WORKDIR = new_workdir
        
        # Re-initialize directory-dependent variables
        TEAM_DIR = WORKDIR / ".team"
        INBOX_DIR = TEAM_DIR / "inbox"
        TASKS_DIR = WORKDIR / ".tasks"
        SKILLS_DIR = WORKDIR / "skills"
        TRANSCRIPT_DIR = WORKDIR / ".transcripts"
        
        # Create necessary directories
        TEAM_DIR.mkdir(parents=True, exist_ok=True)
        INBOX_DIR.mkdir(parents=True, exist_ok=True)
        TASKS_DIR.mkdir(parents=True, exist_ok=True)
        SKILLS_DIR.mkdir(parents=True, exist_ok=True)
        TRANSCRIPT_DIR.mkdir(parents=True, exist_ok=True)
        
        return f"WORKDIR set to: {WORKDIR}"
    except Exception as e:
        return f"Error: {e}"


# === SECTION: todos (s03) ===
class TodoManager:
    def __init__(self):
        self.items = []

    def update(self, items: list) -> str:
        validated, ip = [], 0
        for i, item in enumerate(items):
            content = str(item.get("content", "")).strip()
            status = str(item.get("status", "pending")).lower()
            af = str(item.get("activeForm", "")).strip()
            if not content: raise ValueError(f"Item {i}: content required")
            if status not in ("pending", "in_progress", "completed"):
                raise ValueError(f"Item {i}: invalid status '{status}'")
            if not af: raise ValueError(f"Item {i}: activeForm required")
            if status == "in_progress": ip += 1
            validated.append({"content": content, "status": status, "activeForm": af})
        if len(validated) > 20: raise ValueError("Max 20 todos")
        if ip > 1: raise ValueError("Only one in_progress allowed")
        self.items = validated
        return self.render()

    def render(self) -> str:
        if not self.items: return "No todos."
        lines = []
        for item in self.items:
            m = {"completed": "[x]", "in_progress": "[>]", "pending": "[ ]"}.get(item["status"], "[?]")
            suffix = f" <- {item['activeForm']}" if item["status"] == "in_progress" else ""
            lines.append(f"{m} {item['content']}{suffix}")
        done = sum(1 for t in self.items if t["status"] == "completed")
        lines.append(f"\n({done}/{len(self.items)} completed)")
        return "\n".join(lines)

    def has_open_items(self) -> bool:
        return any(item.get("status") != "completed" for item in self.items)


# === SECTION: subagent (s04) ===
def run_subagent(prompt: str, agent_type: str = "Explore") -> str:
    """
    Run a subagent for isolated exploration or work.
    Logs all LLM interactions.
    """
    sub_tools = [
        {"name": "bash", "description": "Run command.",
         "input_schema": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]}},
        {"name": "read_file", "description": "Read file.",
         "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}},
    ]
    if agent_type != "Explore":
        sub_tools += [
            {"name": "write_file", "description": "Write file.",
             "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]}},
            {"name": "edit_file", "description": "Edit file.",
             "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "old_text": {"type": "string"}, "new_text": {"type": "string"}}, "required": ["path", "old_text", "new_text"]}},
        ]
    sub_handlers = {
        "bash": lambda **kw: run_bash(kw["command"]),
        "read_file": lambda **kw: run_read(kw["path"]),
        "write_file": lambda **kw: run_write(kw["path"], kw["content"]),
        "edit_file": lambda **kw: run_edit(kw["path"], kw["old_text"], kw["new_text"]),
    }
    sub_msgs = [{"role": "user", "content": prompt}]
    resp = None
    # Create logger for subagent
    subagent_id = str(uuid.uuid4())[:8]
    logger = AgentLogger(f"subagent_{agent_type}_{subagent_id}")
    
    for i in range(30):
        resp = client.messages.create(model=MODEL, messages=sub_msgs, tools=sub_tools, max_tokens=8000)
        # Log the LLM call
        logger.log_call(sub_msgs, resp)
        
        sub_msgs.append({"role": "assistant", "content": resp.content})
        if resp.stop_reason != "tool_use":
            break
        results = []
        for b in resp.content:
            if b.type == "tool_use":
                h = sub_handlers.get(b.name, lambda **kw: "Unknown tool")
                result_str = str(h(**b.input))[:50000]
                results.append({"type": "tool_result", "tool_use_id": b.id, "content": result_str})
                # Log tool result
                logger.log_tool_result(b.name, result_str)
        sub_msgs.append({"role": "user", "content": results})
    if resp:
        return "".join(b.text for b in resp.content if hasattr(b, "text")) or "(no summary)"
    return "(subagent failed)"

class SkillLoader:
    def __init__(self, skills_dir: Path):
        self.skills_dir = skills_dir
        self.skills = {}
        self._load_all()

    def _load_all(self):
        #for f in sorted(self.skills_dir.glob("*.md")):
        for _dir in sorted(glob(f"{self.skills_dir}/*")):
            for f in glob(f'{_dir}/*.md'):
                name = Path(f.rsplit('/', 1)[0]).stem
                text = Path(f).read_text(encoding='utf-8')
                meta, body = self._parse_frontmatter(text)
                self.skills[name] = {"meta": meta, "body": body, "path": str(f)}

    def _parse_frontmatter(self, text: str) -> tuple:
        """Parse YAML frontmatter between --- delimiters."""
        match = re.match(r"^---\n(.*?)\n---\n(.*)", text, re.DOTALL)
        if not match:
            return {}, text
        meta = {}
        for line in match.group(1).strip().splitlines():
            if ":" in line:
                key, val = line.split(":", 1)
                meta[key.strip()] = val.strip()
        return meta, match.group(2).strip()

    def descriptions(self) -> str:
        """Layer 1: short descriptions for the system prompt."""
        if not self.skills:
            return "(no skills available)"
        lines = []
        for name, skill in self.skills.items():
            desc = skill["meta"].get("description", "No description")
            tags = skill["meta"].get("tags", "")
            line = f"  - {name}: {desc}"
            if tags:
                line += f" [{tags}]"
            lines.append(line)
        return "\n".join(lines)

    def load(self, name: str) -> str:
        """Layer 2: full skill body returned in tool_result."""
        skill = self.skills.get(name)
        if not skill:
            return f"Error: Unknown skill '{name}'. Available: {', '.join(self.skills.keys())}"
        return f"<skill name=\"{name}\">\n{skill['body']}\n</skill>"


# === SECTION: compression (s06) ===
def estimate_tokens(messages: list) -> int:
    return len(json.dumps(messages, default=str)) // 4

def microcompact(messages: list):
    indices = []
    for i, msg in enumerate(messages):
        if msg["role"] == "user" and isinstance(msg.get("content"), list):
            for part in msg["content"]:
                if isinstance(part, dict) and part.get("type") == "tool_result":
                    indices.append(part)
    if len(indices) <= 3:
        return
    for part in indices[:-3]:
        if isinstance(part.get("content"), str) and len(part["content"]) > 100:
            part["content"] = "[cleared]"

def auto_compact(messages: list) -> list:
    TRANSCRIPT_DIR.mkdir(exist_ok=True)
    path = TRANSCRIPT_DIR / f"transcript_{int(time.time())}.jsonl"
    with open(path, "w", encoding='utf-8') as f:
        for msg in messages:
            f.write(json.dumps(msg, default=str, ensure_ascii=False) + "\n")
    conv_text = json.dumps(messages, default=str, ensure_ascii=False)[:80000]
    resp = client.messages.create(
        model=MODEL,
        messages=[{"role": "user", "content": f"Summarize for continuity:\n{conv_text}"}],
        max_tokens=2000,
    )
    if hasattr(resp.content[0], "text"):
        summary = resp.content[0].text
    else:
        summary = str(resp.content[0])

    return [
        {"role": "user", "content": f"[Compressed. Transcript: {path}]\n{summary}"},
        {"role": "assistant", "content": "Understood. Continuing with summary context."},
    ]


# === SECTION: file_tasks (s07) ===
class TaskManager:
    def __init__(self):
        TASKS_DIR.mkdir(exist_ok=True)

    def _next_id(self) -> int:
        ids = [int(f.stem.split("_")[1]) for f in TASKS_DIR.glob("task_*.json")]
        return max(ids, default=0) + 1

    def _load(self, tid: int) -> dict:
        p = TASKS_DIR / f"task_{tid}.json"
        if not p.exists(): raise ValueError(f"Task {tid} not found")
        return json.loads(p.read_text(encoding='utf-8'))

    def _save(self, task: dict):
        (TASKS_DIR / f"task_{task['id']}.json").write_text(json.dumps(task, indent=2, ensure_ascii=False), encoding='utf-8')

    def create(self, subject: str, description: str = "") -> str:
        task = {"id": self._next_id(), "subject": subject, "description": description,
                "status": "pending", "owner": None, "blockedBy": [], "blocks": []}
        self._save(task)
        return json.dumps(task, indent=2, ensure_ascii=False)

    def get(self, tid: int) -> str:
        return json.dumps(self._load(tid), indent=2, ensure_ascii=False)

    def update(self, tid: int, status: str = None,
               add_blocked_by: list = None, add_blocks: list = None) -> str:
        task = self._load(tid)
        if status:
            task["status"] = status
            if status == "completed":
                for f in TASKS_DIR.glob("task_*.json"):
                    t = json.loads(f.read_text(encoding='utf-8'))
                    if tid in t.get("blockedBy", []):
                        t["blockedBy"].remove(tid)
                        self._save(t)
            if status == "deleted":
                (TASKS_DIR / f"task_{tid}.json").unlink(missing_ok=True)
                return f"Task {tid} deleted"
        if add_blocked_by:
            task["blockedBy"] = list(set(task["blockedBy"] + add_blocked_by))
        if add_blocks:
            task["blocks"] = list(set(task["blocks"] + add_blocks))
        self._save(task)
        return json.dumps(task, indent=2, ensure_ascii=False)

    def list_all(self) -> str:
        tasks = [json.loads(f.read_text(encoding='utf-8')) for f in sorted(TASKS_DIR.glob("task_*.json"))]
        if not tasks: return "No tasks."
        lines = []
        for t in tasks:
            m = {"pending": "[ ]", "in_progress": "[>]", "completed": "[x]"}.get(t["status"], "[?]")
            owner = f" @{t['owner']}" if t.get("owner") else ""
            blocked = f" (blocked by: {t['blockedBy']})" if t.get("blockedBy") else ""
            lines.append(f"{m} #{t['id']}: {t['subject']}{owner}{blocked}")
        return "\n".join(lines)

    def claim(self, tid: int, owner: str) -> str:
        task = self._load(tid)
        task["owner"] = owner
        task["status"] = "in_progress"
        self._save(task)
        return f"Claimed task #{tid} for {owner}"


# === SECTION: background (s08) ===
class BackgroundManager:
    def __init__(self):
        self.tasks = {}
        self.notifications = Queue()

    def run(self, command: str, timeout: int = 120) -> str:
        tid = str(uuid.uuid4())[:8]
        self.tasks[tid] = {"status": "running", "command": command, "result": None}
        threading.Thread(target=self._exec, args=(tid, command, timeout), daemon=True).start()
        return f"Background task {tid} started: {command[:80]}"

    def _exec(self, tid: str, command: str, timeout: int):
        try:
            r = subprocess.run(command, shell=True, cwd=WORKDIR,
                               capture_output=True, text=True, timeout=timeout)
            output = (r.stdout + r.stderr).strip()[:50000]
            self.tasks[tid].update({"status": "completed", "result": output or "(no output)"})
        except Exception as e:
            self.tasks[tid].update({"status": "error", "result": str(e)})
        self.notifications.put({"task_id": tid, "status": self.tasks[tid]["status"],
                                "result": self.tasks[tid]["result"][:500]})

    def check(self, tid: str = None) -> str:
        if tid:
            t = self.tasks.get(tid)
            return f"[{t['status']}] {t.get('result', '(running)')}" if t else f"Unknown: {tid}"
        return "\n".join(f"{k}: [{v['status']}] {v['command'][:60]}" for k, v in self.tasks.items()) or "No bg tasks."

    def drain(self) -> list:
        notifs = []
        while not self.notifications.empty():
            notifs.append(self.notifications.get_nowait())
        return notifs


# === SECTION: messaging (s09) ===
class MessageBus:
    def __init__(self):
        INBOX_DIR.mkdir(parents=True, exist_ok=True)

    def send(self, sender: str, to: str, content: str,
             msg_type: str = "message", extra: dict = None) -> str:
        msg = {"type": msg_type, "from": sender, "content": content,
               "timestamp": time.time()}
        if extra: msg.update(extra)
        with open(INBOX_DIR / f"{to}.jsonl", "a", encoding='utf-8') as f:
            f.write(json.dumps(msg, ensure_ascii=False) + "\n")
        return f"Sent {msg_type} to {to}"

    def read_inbox(self, name: str) -> list:
        path = INBOX_DIR / f"{name}.jsonl"
        if not path.exists(): return []
        msgs = [json.loads(l) for l in path.read_text(encoding='utf-8').strip().splitlines() if l]
        path.write_text("", encoding='utf-8')
        return msgs

    def broadcast(self, sender: str, content: str, names: list) -> str:
        count = 0
        for n in names:
            if n != sender:
                self.send(sender, n, content, "broadcast")
                count += 1
        return f"Broadcast to {count} teammates"


# === SECTION: shutdown + plan tracking (s10) ===
shutdown_requests = {}
plan_requests = {}


# === SECTION: team (s09/s11) ===
class TeammateManager:
    def __init__(self, bus: MessageBus, task_mgr: TaskManager):
        TEAM_DIR.mkdir(exist_ok=True)
        self.bus = bus
        self.task_mgr = task_mgr
        self.config_path = TEAM_DIR / "config.json"
        self.config = self._load()
        self.threads = {}

    def _load(self) -> dict:
        if self.config_path.exists():
            return json.loads(self.config_path.read_text(encoding='utf-8'))
        return {"team_name": "default", "members": []}

    def _save(self):
        self.config_path.write_text(json.dumps(self.config, indent=2, ensure_ascii=False), encoding='utf-8')

    def _find(self, name: str) -> dict:
        for m in self.config["members"]:
            if m["name"] == name: return m
        return None

    def spawn(self, name: str, role: str, prompt: str) -> str:
        member = self._find(name)
        if member:
            if member["status"] not in ("idle", "shutdown"):
                return f"Error: '{name}' is currently {member['status']}"
            member["status"] = "working"
            member["role"] = role
        else:
            member = {"name": name, "role": role, "status": "working"}
            self.config["members"].append(member)
        self._save()
        threading.Thread(target=self._loop, args=(name, role, prompt), daemon=True).start()
        return f"Spawned '{name}' (role: {role})"

    def _set_status(self, name: str, status: str):
        member = self._find(name)
        if member:
            member["status"] = status
            self._save()

    def _loop(self, name: str, role: str, prompt: str):
        team_name = self.config["team_name"]
        sys_prompt = (f"You are '{name}', role: {role}, team: {team_name}, at {WORKDIR}. "
                      f"Use idle when done with current work. You may auto-claim tasks.")
        messages = [{"role": "user", "content": prompt}]
        tools = [
            {"name": "bash", "description": "Run command.", "input_schema": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]}},
            {"name": "read_file", "description": "Read file.", "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}},
            {"name": "write_file", "description": "Write file.", "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]}},
            {"name": "edit_file", "description": "Edit file.", "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "old_text": {"type": "string"}, "new_text": {"type": "string"}}, "required": ["path", "old_text", "new_text"]}},
            {"name": "send_message", "description": "Send message.", "input_schema": {"type": "object", "properties": {"to": {"type": "string"}, "content": {"type": "string"}}, "required": ["to", "content"]}},
            {"name": "idle", "description": "Signal no more work.", "input_schema": {"type": "object", "properties": {}}},
            {"name": "claim_task", "description": "Claim task by ID.", "input_schema": {"type": "object", "properties": {"task_id": {"type": "integer"}}, "required": ["task_id"]}},
        ]
        while True:
            # -- WORK PHASE --
            for _ in range(50):
                inbox = self.bus.read_inbox(name)
                for msg in inbox:
                    if msg.get("type") == "shutdown_request":
                        self._set_status(name, "shutdown")
                        return
                    messages.append({"role": "user", "content": json.dumps(msg)})
                try:
                    response = client.messages.create(
                        model=MODEL, system=sys_prompt, messages=messages,
                        tools=tools, max_tokens=8000)
                except Exception:
                    self._set_status(name, "shutdown")
                    return
                # Print model output for debugging
                print(f"\n{'='*50}", flush=True)
                print(f"[{name}] 模型输出:", flush=True)
                js(response.content)
                print(f"{'='*50}\n", flush=True)
                messages.append({"role": "assistant", "content": response.content})
                if response.stop_reason != "tool_use":
                    break
                results = []
                idle_requested = False
                for block in response.content:
                    if block.type == "tool_use":
                        if block.name == "idle":
                            idle_requested = True
                            output = "Entering idle phase."
                        elif block.name == "claim_task":
                            output = self.task_mgr.claim(block.input["task_id"], name)
                        elif block.name == "send_message":
                            output = self.bus.send(name, block.input["to"], block.input["content"])
                        else:
                            dispatch = {"bash": lambda **kw: run_bash(kw["command"]),
                                        "read_file": lambda **kw: run_read(kw["path"]),
                                        "write_file": lambda **kw: run_write(kw["path"], kw["content"]),
                                        "edit_file": lambda **kw: run_edit(kw["path"], kw["old_text"], kw["new_text"])}
                            output = dispatch.get(block.name, lambda **kw: "Unknown")(**block.input)
                        print(f"  [{name}] {block.name}: {str(output)[:120]}", flush=True)
                        results.append({"type": "tool_result", "tool_use_id": block.id, "content": str(output)})
                messages.append({"role": "user", "content": results})
                if idle_requested:
                    break
            # -- IDLE PHASE: poll for messages and unclaimed tasks --
            self._set_status(name, "idle")
            resume = False
            for _ in range(IDLE_TIMEOUT // max(POLL_INTERVAL, 1)):
                time.sleep(POLL_INTERVAL)
                inbox = self.bus.read_inbox(name)
                if inbox:
                    for msg in inbox:
                        if msg.get("type") == "shutdown_request":
                            self._set_status(name, "shutdown")
                            return
                        messages.append({"role": "user", "content": json.dumps(msg)})
                    resume = True
                    break
                unclaimed = []
                for f in sorted(TASKS_DIR.glob("task_*.json")):
                    t = json.loads(f.read_text(encoding='utf-8'))
                    if t.get("status") == "pending" and not t.get("owner") and not t.get("blockedBy"):
                        unclaimed.append(t)
                if unclaimed:
                    task = unclaimed[0]
                    self.task_mgr.claim(task["id"], name)
                    # Identity re-injection for compressed contexts
                    if len(messages) <= 3:
                        messages.insert(0, {"role": "user", "content":
                            f"<identity>You are '{name}', role: {role}, team: {team_name}.</identity>"})
                        messages.insert(1, {"role": "assistant", "content": f"I am {name}. Continuing."})
                    messages.append({"role": "user", "content":
                        f"<auto-claimed>Task #{task['id']}: {task['subject']}\n{task.get('description', '')}</auto-claimed>"})
                    messages.append({"role": "assistant", "content": f"Claimed task #{task['id']}. Working on it."})
                    resume = True
                    break
            if not resume:
                self._set_status(name, "shutdown")
                return
            self._set_status(name, "working")

    def list_all(self) -> str:
        if not self.config["members"]: return "No teammates."
        lines = [f"Team: {self.config['team_name']}"]
        for m in self.config["members"]:
            lines.append(f"  {m['name']} ({m['role']}): {m['status']}")
        return "\n".join(lines)

    def member_names(self) -> list:
        return [m["name"] for m in self.config["members"]]


# === SECTION: global_instances ===
TODO = TodoManager()
SKILLS = SkillLoader(SKILLS_DIR)
TASK_MGR = TaskManager()
BG = BackgroundManager()
BUS = MessageBus()
TEAM = TeammateManager(BUS, TASK_MGR)

# === SECTION: system_prompt ===
SYSTEM = f"""You are a coding agent at {WORKDIR}. Use tools to solve tasks.

=== MANDATORY WORKFLOW (ALWAYS FOLLOW THIS ORDER) ===

STEP 1 - TASK DECOMPOSITION (REQUIRED FIRST STEP):
When you receive ANY task or user request, you MUST FIRST call:
  load_skill(name="task-decomposer")
This is NOT optional. Do not skip this step. Do not start working on the task before decomposing it.

STEP 2 - GENERATE TODO LIST:
After receiving the task-decomposer skill output, you MUST create a TodoWrite with items based on the decomposition result.
The todo list should reflect the structured plan from task-decomposer.
Set the first actionable item to "in_progress" and others to "pending".

STEP 3 - EXECUTE WITH SKILLS:
Review available skills: {SKILLS.descriptions()}

**Key Skills for Large Projects:**
- architecture-master: Use for large-scale system design, language migration, major refactoring, multi-module projects. Combines with mcp-expert-programmer tools.
- task-decomposer: Always use first to break down complex tasks
- concurrent-execution: Use when tasks can run in parallel

**MCP Tools (via mcp-expert-programmer skill):**
- get_project_map: Scan project structure before any code changes
- apply_incremental_edit: Safe SEARCH/REPLACE for code modifications
- batch_file_operation: Create/move/copy/modify multiple files efficiently

- If a skill matches your current todo item, use load_skill(name="<skill-name>") to load it and follow its guidance.
- If no skill matches, proceed with standard tools (bash, read_file, write_file, edit_file, etc.).

STEP 4 - TRACK PROGRESS:
Update todos via TodoWrite as you complete each item. Keep exactly one item as "in_progress" at a time.

STEP 5 - DELEGATE IF NEEDED:
Use task (subagent) for isolated exploration work that can be delegated.
Use spawn_teammate for persistent autonomous workers.
Use architecture-master + spawn_teammate for large multi-module projects.

=== CRITICAL RULES ===
- NEVER start working on a task without first calling load_skill(name="task-decomposer")
- ALWAYS generate TodoWrite immediately after task decomposition
- The task-decomposer skill provides the structure; your todos must reflect that structure
- Only after todos are set up should you begin execution
- **CRITICAL: For ANY code writing task** (simple scripts, new files, modifications) **MUST load architecture-master skill before writing code**
- Do NOT use write_file or edit_file directly for code without first loading architecture-master
- Before code changes: Use get_project_map to understand project structure (via architecture-master)
- For safe edits: Use apply_incremental_edit instead of direct file modification (via architecture-master)
- For batch operations: Use batch_file_operation instead of multiple write_file calls (via architecture-master)

=== SKILL SELECTION GUIDE ===

**CRITICAL - Code Writing Rule:**
- **ANY task involving code writing** (simple scripts, new files, modifications, even one-line changes) **MUST use architecture-master skill**
- Do NOT write code directly using write_file or edit_file without first loading architecture-master
- This ensures consistent code quality, proper project structure awareness, and architectural thinking

**Architecture & Large Projects:**
- **ANY code writing task** → architecture-master (REQUIRED for ALL coding)
- Building new systems, language migration, major refactoring → architecture-master
- Project structure analysis → architecture-master (uses get_project_map)
- Simple scripts (hello_world.py, etc.) → architecture-master

**Document Creation:**
- Word documents (.docx) → docx
- Presentations (.pptx, slides) → pptx
- PDFs → pdf
- Spreadsheets (.xlsx, .csv) → xlsx

**Research (web-browsing):**
- **DEFAULT/PRIMARY**: Use tavily-search tools for 90% of search tasks
  - tavily_search: General web search (fast, AI-optimized)
  - tavily_news: News and current events search
  - tavily_fact_check: Fact-checking and claim verification
- **BACKUP/SPECIAL CASES**:
  - mcp-fetch: ONLY for known URL content fetching or API calls (deprecated)
  - browser-mcp: ONLY for screenshots, interaction, JavaScript-rendered pages
- Academic papers, literature review → web-browsing (tavily_search first)
- Code repositories, documentation → web-browsing (tavily_search first)
- News, reports, analysis → web-browsing (tavily_news for news)

**Tool Selection Decision Tree for Research:**
```
Need web information?
    │
    ├── Search/Research/Fact-check?
    │   └──→ ✅ tavily-search (PRIMARY - 90% of tasks)
    │
    ├── Fetch known URL content?
    │   ├── Static page/API → ⚠️ mcp-fetch (BACKUP)
    │   └── Dynamic/screenshot → ⚠️ browser-mcp (SPECIAL)
    │
    └── Real-time data?
        ├── Has API → ⚠️ mcp-fetch fetch_json
        └── No API → Try tavily_search first
```

**Performance Comparison:**
| Tool|Speed|Resource|Use Case |
|------|-------|----------|----------|
| tavily-search|⚡ Fast (1-3s)|💚 Low|90% search tasks |
| mcp-fetch|⚡ Fast (1-2s)|💚 Low|Known URLs, APIs |
| browser-mcp|🐌 Slow (5-15s)|🔴 High|Screenshots, interaction |

**Visual/Web:**
- Web UI, dashboards → frontend-design
- Complex web apps → web-artifacts-builder
- Generative art → algorithmic-art
- Posters, designs → canvas-design
- Slack GIFs → slack-gif-creator

**Development:**
- MCP server creation → mcp-builder
- Web app testing → webapp-testing
- Code comments (Chinese) → code-comment

**Communication:**
- Internal comms, status reports → internal-comms
- Collaborative docs → doc-coauthoring

Skills: {SKILLS.descriptions()}"""

# === SECTION: shutdown_protocol (s10) ===
def handle_shutdown_request(teammate: str) -> str:
    req_id = str(uuid.uuid4())[:8]
    shutdown_requests[req_id] = {"target": teammate, "status": "pending"}
    BUS.send("lead", teammate, "Please shut down.", "shutdown_request", {"request_id": req_id})
    return f"Shutdown request {req_id} sent to '{teammate}'"

# === SECTION: plan_approval (s10) ===
def handle_plan_review(request_id: str, approve: bool, feedback: str = "") -> str:
    req = plan_requests.get(request_id)
    if not req: return f"Error: Unknown plan request_id '{request_id}'"
    req["status"] = "approved" if approve else "rejected"
    BUS.send("lead", req["from"], feedback, "plan_approval_response",
             {"request_id": request_id, "approve": approve, "feedback": feedback})
    return f"Plan {req['status']} for '{req['from']}'"


# === SECTION: save query result ===
def sanitize_filename(query: str, max_len: int = 50) -> str:
    """Sanitize user query to create a valid filename."""
    # Remove special characters and replace spaces with underscores
    sanitized = re.sub(r'[^\w\s\u4e00-\u9fff-]', '', query)
    sanitized = re.sub(r'\s+', '_', sanitized.strip())
    # Limit length
    if len(sanitized) > max_len:
        sanitized = sanitized[:max_len]
    return sanitized

def extract_text_from_content(content) -> str:
    """Extract plain text from content blocks."""
    if isinstance(content, list):
        texts = []
        for block in content:
            if hasattr(block, 'type') and block.type == "text":
                texts.append(block.text if hasattr(block, 'text') else str(block))
            elif isinstance(block, dict) and block.get("type") == "text":
                texts.append(block.get("text", ""))
            else:
                texts.append(str(block))
        return "\n".join(texts)
    return str(content)


def save_query_result(query: str, result: str, logger: AgentLogger = None) -> str:
    """
    Save the query result to a markdown file in the output directory.
    
    Args:
        query: The user's query
        result: The result from the agent
        logger: Optional logger instance to include execution trace
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename_part = sanitize_filename(query)
    filename = f"{timestamp}_{filename_part}.md"
    filepath = OUTPUT_DIR / filename
    
    # Build markdown content
    md_parts = []
    
    # Header
    md_parts.append("# Query Result\n")
    md_parts.append(f"**Query**: {query}\n")
    md_parts.append(f"**Timestamp**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    
    # Add execution trace if logger is provided
    if logger:
        md_parts.append(logger.get_execution_trace_markdown(query))
        md_parts.append("\n---\n")
    
    # Result
    md_parts.append(f"\n## Final Result\n\n{result}\n")
    
    markdown_content = "\n".join(md_parts)
    
    try:
        filepath.write_text(markdown_content, encoding='utf-8')
        return f"Saved to {filepath}"
    except Exception as e:
        return f"Error saving result: {e}"


# === SECTION: tool_dispatch (s02) ===
TOOL_HANDLERS = {
    "bash":             lambda **kw: run_bash(kw["command"]),
    "tavily_search":      lambda **kw: run_tavily_search(kw["query"], kw.get("search_depth", "basic"), kw.get("max_results", 5), kw.get("include_answer", False)),
    "tavily_news":        lambda **kw: run_tavily_news(kw["query"], kw.get("max_results", 5), kw.get("days", 7)),
    "tavily_fact_check":  lambda **kw: run_tavily_fact_check(kw["claim"]),
    "read_file":        lambda **kw: run_read(kw["path"], kw.get("limit")),
    "write_file":       lambda **kw: run_write(kw["path"], kw["content"]),
    "edit_file":        lambda **kw: run_edit(kw["path"], kw["old_text"], kw["new_text"]),
    "set_workdir":      lambda **kw: run_set_workdir(kw["path"]),
    "TodoWrite":        lambda **kw: TODO.update(kw["items"]),
    "task":             lambda **kw: run_subagent(kw["prompt"], kw.get("agent_type", "Explore")),
    "load_skill":       lambda **kw: SKILLS.load(kw["name"]),
    "compress":         lambda **kw: "Compressing...",
    "background_run":   lambda **kw: BG.run(kw["command"], kw.get("timeout", 120)),
    "check_background": lambda **kw: BG.check(kw.get("task_id")),
    "task_create":      lambda **kw: TASK_MGR.create(kw["subject"], kw.get("description", "")),
    "task_get":         lambda **kw: TASK_MGR.get(kw["task_id"]),
    "task_update":      lambda **kw: TASK_MGR.update(kw["task_id"], kw.get("status"), kw.get("add_blocked_by"), kw.get("add_blocks")),
    "task_list":        lambda **kw: TASK_MGR.list_all(),
    "spawn_teammate":   lambda **kw: TEAM.spawn(kw["name"], kw["role"], kw["prompt"]),
    "list_teammates":   lambda **kw: TEAM.list_all(),
    "send_message":     lambda **kw: BUS.send("lead", kw["to"], kw["content"], kw.get("msg_type", "message")),
    "read_inbox":       lambda **kw: json.dumps(BUS.read_inbox("lead"), indent=2),
    "broadcast":        lambda **kw: BUS.broadcast("lead", kw["content"], TEAM.member_names()),
    "shutdown_request": lambda **kw: handle_shutdown_request(kw["teammate"]),
    "plan_approval":    lambda **kw: handle_plan_review(kw["request_id"], kw["approve"], kw.get("feedback", "")),
    "idle":             lambda **kw: "Lead does not idle.",
    "claim_task":       lambda **kw: TASK_MGR.claim(kw["task_id"], "lead"),
}

TOOLS = [
    {"name": "bash", "description": "Run a shell command.",
     "input_schema": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]}},
    {"name": "read_file", "description": "Read file contents.",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "limit": {"type": "integer"}}, "required": ["path"]}},
    {"name": "write_file", "description": "Write content to file.",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]}},
    {"name": "edit_file", "description": "Replace exact text in file.",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "old_text": {"type": "string"}, "new_text": {"type": "string"}}, "required": ["path", "old_text", "new_text"]}},
    {"name": "set_workdir", "description": "Set the working directory for file operations. Use this to switch to a different project folder.",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}},
    {"name": "TodoWrite", "description": "Update task tracking list.",
     "input_schema": {"type": "object", "properties": {"items": {"type": "array", "items": {"type": "object", "properties": {"content": {"type": "string"}, "status": {"type": "string", "enum": ["pending", "in_progress", "completed"]}, "activeForm": {"type": "string"}}, "required": ["content", "status", "activeForm"]}}}, "required": ["items"]}},
    {"name": "task", "description": "Spawn a subagent for isolated exploration or work.",
     "input_schema": {"type": "object", "properties": {"prompt": {"type": "string"}, "agent_type": {"type": "string", "enum": ["Explore", "general-purpose"]}}, "required": ["prompt"]}},
    {"name": "load_skill", "description": "Load specialized knowledge by name.",
     "input_schema": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}},
    {"name": "compress", "description": "Manually compress conversation context.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "background_run", "description": "Run command in background thread.",
     "input_schema": {"type": "object", "properties": {"command": {"type": "string"}, "timeout": {"type": "integer"}}, "required": ["command"]}},
    {"name": "check_background", "description": "Check background task status.",
     "input_schema": {"type": "object", "properties": {"task_id": {"type": "string"}}}},
    {"name": "task_create", "description": "Create a persistent file task.",
     "input_schema": {"type": "object", "properties": {"subject": {"type": "string"}, "description": {"type": "string"}}, "required": ["subject"]}},
    {"name": "task_get", "description": "Get task details by ID.",
     "input_schema": {"type": "object", "properties": {"task_id": {"type": "integer"}}, "required": ["task_id"]}},
    {"name": "task_update", "description": "Update task status or dependencies.",
     "input_schema": {"type": "object", "properties": {"task_id": {"type": "integer"}, "status": {"type": "string", "enum": ["pending", "in_progress", "completed", "deleted"]}, "add_blocked_by": {"type": "array", "items": {"type": "integer"}}, "add_blocks": {"type": "array", "items": {"type": "integer"}}}, "required": ["task_id"]}},
    {"name": "task_list", "description": "List all tasks.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "spawn_teammate", "description": "Spawn a persistent autonomous teammate.",
     "input_schema": {"type": "object", "properties": {"name": {"type": "string"}, "role": {"type": "string"}, "prompt": {"type": "string"}}, "required": ["name", "role", "prompt"]}},
    {"name": "list_teammates", "description": "List all teammates.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "send_message", "description": "Send a message to a teammate.",
     "input_schema": {"type": "object", "properties": {"to": {"type": "string"}, "content": {"type": "string"}, "msg_type": {"type": "string", "enum": list(VALID_MSG_TYPES)}}, "required": ["to", "content"]}},
    {"name": "read_inbox", "description": "Read and drain the lead's inbox.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "broadcast", "description": "Send message to all teammates.",
     "input_schema": {"type": "object", "properties": {"content": {"type": "string"}}, "required": ["content"]}},
    {"name": "shutdown_request", "description": "Request a teammate to shut down.",
     "input_schema": {"type": "object", "properties": {"teammate": {"type": "string"}}, "required": ["teammate"]}},
    {"name": "plan_approval", "description": "Approve or reject a teammate's plan.",
     "input_schema": {"type": "object", "properties": {"request_id": {"type": "string"}, "approve": {"type": "boolean"}, "feedback": {"type": "string"}}, "required": ["request_id", "approve"]}},
    {"name": "idle", "description": "Enter idle state.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "claim_task", "description": "Claim a task from the board.",
     "input_schema": {"type": "object", "properties": {"task_id": {"type": "integer"}}, "required": ["task_id"]}},
    # Tavily Search MCP tools
    {"name": "tavily_search", "description": "General web search using Tavily API. Use this for most research tasks, finding information online, or answering questions requiring web knowledge.",
     "input_schema": {"type": "object", "properties": {"query": {"type": "string", "description": "Search query"}, "search_depth": {"type": "string", "enum": ["basic", "advanced"], "description": "Search depth"}, "max_results": {"type": "integer", "description": "Maximum results (1-10)"}, "include_answer": {"type": "boolean", "description": "Include answer summary"}}, "required": ["query"]}},
    {"name": "tavily_news", "description": "Search for news articles using Tavily API. Use for current events, recent news, or time-sensitive information.",
     "input_schema": {"type": "object", "properties": {"query": {"type": "string", "description": "News search query"}, "max_results": {"type": "integer", "description": "Maximum results (1-10)"}, "days": {"type": "integer", "description": "Limit to recent N days"}}, "required": ["query"]}},
    {"name": "tavily_fact_check", "description": "Fact-check claims or statements using Tavily API. Use to verify information accuracy or check specific claims.",
     "input_schema": {"type": "object", "properties": {"claim": {"type": "string", "description": "Claim or statement to verify"}}, "required": ["claim"]}}
]


# === SECTION: agent_loop ===
def agent_loop(messages: list, agent_name: str = "main"):
    """
    Main agent loop with LLM interaction and tool execution.
    
    Args:
        messages: Conversation history messages
        agent_name: Name of the agent for logging purposes
    """
    rounds_without_todo = 0
    logger = AgentLogger(agent_name)
    # Reset execution trace for new query
    logger.reset_trace()
    
    while True:
        # s06: compression pipeline
        microcompact(messages)
        if estimate_tokens(messages) > TOKEN_THRESHOLD:
            print("[auto-compact triggered]", flush=True)
            messages[:] = auto_compact(messages)
        # s08: drain background notifications
        notifs = BG.drain()
        if notifs:
            txt = "\n".join(f"[bg:{n['task_id']}] {n['status']}: {n['result']}" for n in notifs)
            messages.append({"role": "user", "content": f"<background-results>\n{txt}\n</background-results>"})
            messages.append({"role": "assistant", "content": "Noted background results."})
        # s10: check lead inbox
        inbox = BUS.read_inbox("lead")
        if inbox:
            messages.append({"role": "user", "content": f"<inbox>{json.dumps(inbox, indent=2)}</inbox>"})
            messages.append({"role": "assistant", "content": "Noted inbox messages."})
        
        # LLM call - log the call after response
        client.auth_token = client.api_key
        response = client.messages.create(
            model=MODEL, system=SYSTEM, messages=messages,
            tools=TOOLS, max_tokens=8000,
        )
        
        # Log the LLM call (input messages and output response)
        logger.log_call(messages, response)
        
        print('\n'*2, flush=True)
        print('-'*40, flush=True)
        print('模型的输出:', flush=True)
        js(response.content)
        time.sleep(2)
        messages.append({"role": "assistant", "content": response.content})
        if response.stop_reason != "tool_use":
            return  # Final response, exit loop
        # Tool execution
        results = []
        used_todo = False
        manual_compress = False
        for block in response.content:
            if block.type == "tool_use":
                if block.name == "compress":
                    manual_compress = True
                handler = TOOL_HANDLERS.get(block.name)
                try:
                    output = handler(**block.input) if handler else f"Unknown tool: {block.name}"
                except Exception as e:
                    output = f"Error: {e}"
                print(f"> {block.name}: {str(output)[:200]}", flush=True)
                results.append({"type": "tool_result", "tool_use_id": block.id, "content": str(output)})
                # Log tool result
                logger.log_tool_result(block.name, str(output))
                # Log skill load if applicable
                if block.name == "load_skill":
                    skill_name = block.input.get("name", "unknown")
                    logger.log_skill_load(skill_name)
                if block.name == "TodoWrite":
                    used_todo = True
        # s03: nag reminder (only when todo workflow is active)
        rounds_without_todo = 0 if used_todo else rounds_without_todo + 1
        if TODO.has_open_items() and rounds_without_todo >= 3:
            results.insert(0, {"type": "text", "text": "<reminder>Update your todos.</reminder>"})
        messages.append({"role": "user", "content": results})
        # s06: manual compress
        if manual_compress:
            print("[manual compact]", flush=True)
            messages[:] = auto_compact(messages)


# === SECTION: repl ===
if __name__ == "__main__":
    # 确保标准输入输出使用 UTF-8 编码
    import io
    if sys.version_info[0] >= 3:
        sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8', errors='replace')
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
    
    history = []
    while True:
        try:
            # Use \001 and \002 to wrap non-printing ANSI sequences for readline
            query = input("\001\033[36m\002s_full >> \001\033[0m\002")
        except (EOFError, KeyboardInterrupt):
            break
        if query.strip().lower() in ("q", "exit", ""):
            break
        if query.strip() == "/compact":
            if history:
                print("[manual compact via /compact]", flush=True)
                history[:] = auto_compact(history)
            continue
        if query.strip() == "/tasks":
            print(TASK_MGR.list_all(), flush=True)
            continue
        if query.strip() == "/team":
            print(TEAM.list_all(), flush=True)
            continue
        if query.strip() == "/inbox":
            print(json.dumps(BUS.read_inbox("lead"), indent=2), flush=True)
            continue
        history.append({"role": "user", "content": query})
        agent_loop(history, agent_name="lead")
        # Save query result to markdown file
        # Get the last assistant response from history
        result = ""
        for msg in reversed(history):
            if msg.get("role") == "assistant":
                result = extract_text_from_content(msg.get("content", ""))
                break
        if result:
            save_path = save_query_result(query, result, None)
            print(f"\033[90m{save_path}\033[0m", flush=True)
        print()
