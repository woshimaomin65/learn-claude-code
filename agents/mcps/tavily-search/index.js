#!/usr/bin/env node
/**
 * Tavily Search MCP Server - 优化版
 * 
 * 基于 Tavily API 的高级网页搜索工具
 * 提供快速、准确的搜索结果，专为 AI 助手优化
 * 
 * 优化点：
 * 1. 模块化代码结构，易于维护
 * 2. 完善的错误处理和日志记录
 * 3. 支持多种搜索模式（基础、高级、新闻）
 * 4. 可配置的搜索结果数量和深度
 * 5. 请求超时和重试机制
 * 6. 结果格式优化，便于 AI 理解
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from "axios";

// ============================================
// 配置管理
// ============================================

const CONFIG = {
  // Tavily API 配置
  apiKey: process.env.TAVILY_API_KEY || "",
  baseUrl: "https://api.tavily.com",
  
  // 请求配置
  timeout: 30000, // 30 秒超时
  maxRetries: 2,  // 最大重试次数
  
  // 搜索默认参数
  defaultSearchDepth: "basic", // basic 或 advanced
  defaultMaxResults: 5,        // 默认最大结果数
  maxMaxResults: 10,          // 允许的最大结果数
};

// ============================================
// 工具函数
// ============================================

/**
 * 记录日志
 */
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...(data && { data })
  };
  console.error(`[Tavily-MCP] ${JSON.stringify(logEntry)}`);
}

/**
 * 延迟函数，用于重试
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 带重试的 API 请求
 */
async function requestWithRetry(url, options, retries = CONFIG.maxRetries) {
  try {
    const response = await axios({
      ...options,
      timeout: CONFIG.timeout,
    });
    return response.data;
  } catch (error) {
    const isRetryable = error.code === 'ECONNRESET' || 
                        error.code === 'ETIMEDOUT' ||
                        error.response?.status >= 500;
    
    if (isRetryable && retries > 0) {
      log('warn', `请求失败，${retries}次重试`, { url, error: error.message });
      await delay(1000 * (CONFIG.maxRetries - retries + 1));
      return requestWithRetry(url, options, retries - 1);
    }
    
    throw error;
  }
}

// ============================================
// Tavily API 封装
// ============================================

const TavilyAPI = {
  /**
   * 执行搜索
   * @param {string} query - 搜索查询
   * @param {Object} options - 搜索选项
   * @returns {Promise<Object>} 搜索结果
   */
  async search(query, options = {}) {
    if (!CONFIG.apiKey) {
      throw new Error("TAVILY_API_KEY 环境变量未设置");
    }

    const params = {
      api_key: CONFIG.apiKey,
      query,
      search_depth: options.searchDepth || CONFIG.defaultSearchDepth,
      max_results: Math.min(options.maxResults || CONFIG.defaultMaxResults, CONFIG.maxMaxResults),
      include_domains: options.includeDomains || [],
      exclude_domains: options.excludeDomains || [],
      include_answer: options.includeAnswer ?? true,
      include_raw_content: options.includeRawContent ?? false,
      include_images: options.includeImages ?? false,
    };

    log('info', '执行搜索', { query, searchDepth: params.search_depth, maxResults: params.max_results });

    const data = await requestWithRetry(
      `${CONFIG.baseUrl}/search`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        data: params,
      }
    );

    return data;
  },

  /**
   * 获取新闻搜索结果
   */
  async getNews(query, options = {}) {
    return this.search(query, {
      ...options,
      searchDepth: 'advanced',
      maxResults: options.maxResults || 10,
    });
  },
};

// ============================================
// 结果格式化
// ============================================

const ResultFormatter = {
  /**
   * 格式化搜索结果
   */
  formatResults(results) {
    const formatted = {
      answer: results.answer || null,
      query: results.query,
      followUpQuestions: results.follow_up_questions || [],
      results: (results.results || []).map((result, index) => ({
        rank: index + 1,
        title: result.title,
        url: result.url,
        content: result.content,
        score: result.score,
        publishedDate: result.published_date,
      })),
      images: results.images || [],
      responseTime: results.response_time,
    };

    return formatted;
  },

  /**
   * 生成简洁的文本摘要
   */
  generateSummary(formattedResults) {
    let summary = `搜索结果：${formattedResults.results.length} 条\n`;
    
    if (formattedResults.answer) {
      summary += `\n📝 答案摘要：${formattedResults.answer}\n`;
    }
    
    if (formattedResults.followUpQuestions.length > 0) {
      summary += `\n🔍 相关问题：${formattedResults.followUpQuestions.join(', ')}\n`;
    }

    summary += '\n--- 详细结果 ---\n';
    
    formattedResults.results.forEach(result => {
      summary += `\n[${result.rank}] ${result.title}\n`;
      summary += `URL: ${result.url}\n`;
      if (result.publishedDate) {
        summary += `日期：${result.publishedDate}\n`;
      }
      summary += `摘要：${result.content}\n`;
      if (result.score) {
        summary += `相关度：${(result.score * 100).toFixed(1)}%\n`;
      }
    });

    return summary;
  },
};

// ============================================
// MCP 服务器定义
// ============================================

async function createServer() {
  const server = new McpServer({
    name: "tavily-search",
    version: "1.0.0",
    description: "优化版 Tavily 网页搜索工具 - 提供快速、准确的搜索结果",
  });

  // --------------------------------------------
  // 工具 1: 基础搜索
  // --------------------------------------------
  server.tool(
    "tavily_search",
    "使用 Tavily API 进行网页搜索。适合获取最新的网络信息、事实核查、研究查询等。返回结构化的搜索结果，包括答案摘要和相关网页链接。",
    {
      query: z.string().describe("搜索查询语句，支持自然语言"),
      maxResults: z.number().min(1).max(10).optional().default(5)
        .describe("返回的最大结果数量（1-10）"),
      searchDepth: z.enum(["basic", "advanced"]).optional().default("basic")
        .describe("搜索深度：basic=快速搜索，advanced=深度搜索（更准确但较慢）"),
      includeDomains: z.array(z.string()).optional()
        .describe("限定搜索范围的域名列表，例如 ['wikipedia.org']"),
      excludeDomains: z.array(z.string()).optional()
        .describe("要排除的域名列表"),
    },
    async ({ query, maxResults, searchDepth, includeDomains, excludeDomains }) => {
      try {
        const results = await TavilyAPI.search(query, {
          maxResults,
          searchDepth,
          includeDomains,
          excludeDomains,
        });

        const formatted = ResultFormatter.formatResults(results);
        const summary = ResultFormatter.generateSummary(formatted);

        return {
          content: [
            {
              type: "text",
              text: summary,
            },
            {
              type: "text",
              text: JSON.stringify(formatted, null, 2),
            },
          ],
        };
      } catch (error) {
        log('error', '搜索失败', { query, error: error.message });
        return {
          content: [
            {
              type: "text",
              text: `搜索失败：${error.message}\n\n请检查：\n1. TAVILY_API_KEY 是否正确设置\n2. 网络连接是否正常\n3. 查询语句是否有效`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --------------------------------------------
  // 工具 2: 新闻搜索
  // --------------------------------------------
  server.tool(
    "tavily_news",
    "搜索最新新闻资讯。专门用于获取新闻报道、时事动态、行业动态等。自动使用深度搜索模式，返回带发布日期的新闻结果。",
    {
      query: z.string().describe("新闻搜索查询，例如 'AI 技术最新进展'"),
      maxResults: z.number().min(1).max(10).optional().default(10)
        .describe("返回的最大新闻数量（1-10）"),
      days: z.number().min(1).max(365).optional()
        .describe("限制最近 N 天的新闻（可选）"),
    },
    async ({ query, maxResults, days }) => {
      try {
        let searchQuery = query;
        if (days) {
          const date = new Date();
          date.setDate(date.getDate() - days);
          searchQuery = `${query} after:${date.toISOString().split('T')[0]}`;
        }

        const results = await TavilyAPI.getNews(searchQuery, { maxResults });
        const formatted = ResultFormatter.formatResults(results);
        
        let summary = `📰 新闻搜索结果：${formatted.results.length} 条\n`;
        summary += `查询：${formatted.query}\n`;
        
        if (days) {
          summary += `时间范围：最近 ${days} 天\n`;
        }
        
        summary += '\n--- 新闻列表 ---\n';
        
        formatted.results.forEach(result => {
          summary += `\n[${result.rank}] ${result.title}\n`;
          summary += `来源：${result.url}\n`;
          if (result.publishedDate) {
            summary += `发布：${result.publishedDate}\n`;
          }
          summary += `摘要：${result.content}\n`;
        });

        return {
          content: [
            {
              type: "text",
              text: summary,
            },
          ],
        };
      } catch (error) {
        log('error', '新闻搜索失败', { query, error: error.message });
        return {
          content: [
            {
              type: "text",
              text: `新闻搜索失败：${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --------------------------------------------
  // 工具 3: 快速事实核查
  // --------------------------------------------
  server.tool(
    "tavily_fact_check",
    "快速事实核查工具。用于验证信息的真实性，获取权威来源的确认。自动使用高级搜索模式并优先返回高可信度来源。",
    {
      claim: z.string().describe("需要核实的信息或声明"),
    },
    async ({ claim }) => {
      try {
        const results = await TavilyAPI.search(claim, {
          searchDepth: 'advanced',
          maxResults: 5,
        });

        const formatted = ResultFormatter.formatResults(results);
        
        let summary = `🔍 事实核查结果\n`;
        summary += `声明：${claim}\n\n`;
        
        if (formatted.answer) {
          summary += `✅ 核查结论：${formatted.answer}\n\n`;
        }
        
        summary += `信息来源（${formatted.results.length} 个）:\n`;
        
        formatted.results.forEach(result => {
          summary += `\n• ${result.title}\n`;
          summary += `  ${result.url}\n`;
          summary += `  "${result.content}"\n`;
        });

        return {
          content: [
            {
              type: "text",
              text: summary,
            },
          ],
        };
      } catch (error) {
        log('error', '事实核查失败', { claim, error: error.message });
        return {
          content: [
            {
              type: "text",
              text: `事实核查失败：${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}

// ============================================
// 启动服务器
// ============================================

async function main() {
  try {
    log('info', '启动 Tavily MCP 服务器');
    
    if (!CONFIG.apiKey) {
      log('warn', 'TAVILY_API_KEY 未设置，部分功能可能不可用');
    } else {
      log('info', 'API Key 已配置');
    }

    const server = await createServer();
    
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    log('info', 'Tavily MCP 服务器已启动并连接');
  } catch (error) {
    log('error', '服务器启动失败', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// ============================================
// 导出模块（用于测试）
// ============================================

export { TavilyAPI, ResultFormatter, CONFIG, createServer };

main();
