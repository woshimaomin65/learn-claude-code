#!/usr/bin/env python3
"""
llm_config.py - 通用的 LLM 配置模块

提供统一的 LLM 客户端配置，包括 BASE_URL、API_KEY、MODEL 和 client 实例。
所有 agents 文件夹中的 Python 文件都应该使用此模块来访问 LLM 服务。

使用方法:
    from llm_config import client, MODEL, BASE_URL, API_KEY

配置优先级:
    1. 环境变量 BASE_URL, API_KEY, MODEL
    2. 默认值 (DashScope Qwen Plus)
"""

import os
from anthropic import Anthropic

# LLM 配置 - 使用环境变量或默认值
BASE_URL = os.getenv("BASE_URL", "https://coding.dashscope.aliyuncs.com/apps/anthropic")
API_KEY = os.getenv("API_KEY", "sk-sp-9744b2d2a3834fe1875f74fc43689dbf")
MODEL = os.getenv("MODEL", "qwen3.5-plus")
#MODEL = os.getenv("MODEL", "MiniMax-M2.5")
#MODEL = os.getenv("MODEL", "glm-5")

# 初始化 Anthropic 客户端
client = Anthropic(base_url=BASE_URL, api_key=API_KEY)
