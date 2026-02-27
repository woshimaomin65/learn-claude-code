---
name: web-browsing
description: Use this skill when the user needs to browse the web for research purposes. This includes: academic paper research (finding, reading, and summarizing papers from arXiv, Google Scholar, journal websites), code download (finding repositories on GitHub, GitLab, downloading code samples from documentation), news research (gathering current events from news websites, press releases, blogs), research report analysis (financial reports, industry analysis, market research from institutional websites), and multi-hop web browsing (navigating through multiple linked pages to gather comprehensive information, follow citation chains, trace information sources). Make sure to use this skill whenever the user mentions research, literature review, finding papers, downloading code, gathering news, analyzing reports, or needs to navigate multiple web pages to accomplish a goal.
license: Proprietary
---

# Web Browsing Research Guide

## Overview

This skill enables comprehensive web-based research using the MCP Fetch server. It covers academic paper research, code discovery and download, news gathering, research report analysis, and multi-hop browsing strategies to achieve complex research goals.

## Prerequisites

Ensure the MCP Fetch server is configured and running. The server provides these tools:
- `fetch_url`: Get webpage content as Markdown
- `fetch_url_raw`: Get raw HTML
- `fetch_json`: Call JSON APIs
- `search_text`: Search within page content

## Research Workflows

### 1. 论文调研 (Academic Paper Research)

#### Finding Papers

**arXiv Search:**
```
https://arxiv.org/search/?query={keyword}&searchtype=all
```

**Google Scholar:**
```
https://scholar.google.com/scholar?q={keyword}
```

**Semantic Scholar:**
```
https://www.semanticscholar.org/search?q={keyword}
```

#### Paper Analysis Workflow

1. **Search for papers** using the search URLs above
2. **Extract paper titles and abstracts** using `search_text` to find relevant terms
3. **Access paper pages** using `fetch_url` to get full abstract and metadata
4. **Find PDF links** by searching for ".pdf" in the page content
5. **Download PDFs** (use the pdf skill to process downloaded papers)
6. **Track citations** by following citation links (multi-hop)

#### Example: Finding ML Papers

```
1. Use fetch_url to search arXiv for "transformer attention mechanism"
2. Use search_text to find papers with high citation counts
3. Use fetch_url to get paper details from top 5 results
4. Extract: title, authors, abstract, citation count, PDF link
5. Use fetch_json for citation APIs if available
```

#### Key Information to Extract

- **Title and Authors**: For citation and attribution
- **Abstract**: Quick relevance assessment
- **Publication Venue**: Conference/journal quality
- **Citation Count**: Impact measurement
- **PDF Link**: Full text access
- **Code Link**: Implementation availability
- **Related Work**: Citation chain for multi-hop

### 2. 代码下载 (Code Download)

#### GitHub Repository Discovery

**Search Pattern:**
```
https://github.com/search?q={keyword}&type=repositories
```

**Repository Analysis:**
1. Use `fetch_url` to get repository page
2. Extract: stars, forks, last update, description
3. Find README using `search_text` for "README"
4. Locate download/install instructions
5. Identify main code files and structure

#### Code Download Strategies

**Direct Repository:**
```
https://github.com/{user}/{repo}/archive/refs/heads/main.zip
```

**Specific File:**
```
https://raw.githubusercontent.com/{user}/{repo}/{branch}/{path}
```

#### Repository Evaluation Checklist

- ⭐ **Stars**: >100 indicates community interest
- 📅 **Last Update**: <6 months = actively maintained
- 📝 **README Quality**: Clear documentation
- 🔧 **Issues**: Open/closed ratio shows maintenance
- 📦 **Dependencies**: Check requirements.txt, package.json
- 🧪 **Tests**: Presence of test files

#### Example: Download Python Library

```
1. Search GitHub: "python data visualization"
2. Filter by: stars > 1000, updated < 6 months
3. Use fetch_url on top 3 repositories
4. Extract: install command, usage example, API docs
5. Use fetch_url_raw if needed for code structure
6. Download: Provide direct download link or clone command
```

### 3. 新闻调研 (News Research)

#### News Source Categories

**General News:**
- Reuters, AP News, BBC, CNN
- TechCrunch, Wired (technology)
- Bloomberg, WSJ (business)

**Industry-Specific:**
- VentureBeat (AI/tech startups)
- Nature News (science)
- Stat (healthcare/biotech)

#### News Gathering Workflow

1. **Identify sources** relevant to topic
2. **Use fetch_url** to get news page content
3. **Use search_text** to find specific keywords
4. **Extract key information**:
   - Headline and date
   - Key facts and figures
   - Quotes from sources
   - Related article links
5. **Cross-reference** multiple sources
6. **Track timeline** for developing stories

#### Information Extraction Template

```markdown
## News Item: [Headline]

**Source**: [Publication]
**Date**: [Publication Date]
**Author**: [Author if available]

### Key Points
- Point 1
- Point 2
- Point 3

### Quotes
> "Direct quote from article"

### Related Links
- [Link 1](url)
- [Link 2](url)
```

#### Multi-Source Verification

For important news:
1. Find 3+ independent sources
2. Compare facts and figures
3. Note any discrepancies
4. Identify original source if possible

### 4. 研报调研 (Research Report Analysis)

#### Report Sources

**Financial Research:**
- Goldman Sachs Research
- Morgan Stanley Insights
- J.P. Morgan Research

**Industry Analysis:**
- Gartner
- Forrester
- IDC
- McKinsey & Company

**Government/Institutional:**
- World Bank Reports
- IMF Publications
- National Bureau of Statistics

#### Report Analysis Workflow

1. **Find report** using search or direct URL
2. **Use fetch_url** to get summary/landing page
3. **Identify PDF link** for full report
4. **Extract key sections**:
   - Executive summary
   - Market size/growth data
   - Key findings
   - Recommendations
5. **Use pdf skill** to process full report
6. **Create summary table** of key metrics

#### Key Metrics to Extract

| Metric Type | What to Look For |
|-------------|------------------|
| Market Size | Total addressable market, current value |
| Growth Rate | CAGR, YoY growth |
| Segments | Market breakdown by category |
| Trends | Key industry trends identified |
| Forecasts | Future projections with timelines |
| Risks | Identified risks and challenges |

### 5. 多跳浏览 (Multi-Hop Browsing)

#### What is Multi-Hop Browsing?

Multi-hop browsing means navigating through multiple linked pages to gather comprehensive information. Each "hop" is one page navigation.

#### When to Use Multi-Hop

- **Citation chasing**: Paper → Citations → Citing papers
- **Source tracing**: News article → Original source → Primary data
- **Documentation depth**: Overview → API docs → Code examples
- **Company research**: Homepage → About → Team → Press releases
- **Product research**: Main page → Features → Specs → Reviews

#### Multi-Hop Strategy

```
Hop 0: Starting page (search results, landing page)
  ↓
Hop 1: First level links (paper pages, article pages)
  ↓
Hop 2: Second level (PDFs, full articles, detailed specs)
  ↓
Hop 3: Third level (citations, references, related work)
```

#### Information Tracking

Create a navigation map:

```markdown
## Research Path

**Goal**: [What you're trying to find]

**Hop 0**: [Starting URL]
- Found: [Key findings]
- Next: [Links to follow]

**Hop 1**: [Second URL]
- Found: [Key findings]
- Next: [Links to follow]

**Hop 2**: [Third URL]
- Found: [Final information]
- Conclusion: [Summary]
```

#### Multi-Hop Example: Research Paper Deep Dive

```
Goal: Understand transformer architecture evolution

Hop 0: "Attention is All You Need" paper page
- Found: Original transformer paper
- Links: Citations (80,000+), Related work

Hop 1: Top 5 cited papers from citations list
- Found: BERT, GPT, T5, ViT, etc.
- Links: Their citations, code repositories

Hop 2: BERT paper + code repository
- Found: Pre-training methodology, implementation
- Links: Fine-tuning examples, downstream tasks

Hop 3: Fine-tuning guides and benchmarks
- Found: Best practices, performance metrics
- Conclusion: Complete evolution chain documented
```

#### Avoiding Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Getting lost in links | Keep a navigation log |
| Too many hops (10+) | Limit to 3-5 most relevant |
| Missing original source | Always trace back to primary |
| Outdated information | Check publication dates |
| Circular references | Recognize and break loops |

## Tool Usage Guide

### fetch_url - Main Content Retrieval

```
Best for: Articles, documentation, paper abstracts, news
Output: Clean Markdown format
Use when: You need readable text content
```

### fetch_url_raw - HTML Analysis

```
Best for: Finding specific elements, debugging, custom parsing
Output: Raw HTML
Use when: Markdown conversion loses important structure
```

### fetch_json - API Calls

```
Best for: GitHub API, arXiv API, data services
Output: Structured JSON data
Use when: Website has a public API
```

### search_text - In-Page Search

```
Best for: Finding specific terms in long pages
Output: Context snippets around matches
Use when: Looking for specific keywords/data points
```

## Research Quality Checklist

### Source Evaluation (CRAAP Test)

- **Currency**: When was it published? Updated?
- **Relevance**: Does it answer your research question?
- **Authority**: Who published it? What are their credentials?
- **Accuracy**: Is it supported by evidence? Peer-reviewed?
- **Purpose**: Why was it created? Any bias?

### Information Triangulation

For critical claims:
1. Find 3+ independent sources
2. Verify facts match across sources
3. Note any contradictions
4. Identify most authoritative source

### Documentation Standards

Always record:
- Full URL of each source
- Access date (web content can change)
- Key quotes (with page/section)
- Summary in your own words

## Output Templates

### Research Summary Template

```markdown
# Research Summary: [Topic]

## Executive Summary
[Brief 2-3 sentence overview]

## Key Findings

### Finding 1: [Title]
- Source: [Publication/Site]
- Date: [Date]
- Details: [Summary]

### Finding 2: [Title]
- Source: [Publication/Site]
- Date: [Date]
- Details: [Summary]

## Data Points
| Metric | Value | Source |
|--------|-------|--------|
| [Metric 1] | [Value] | [Source] |
| [Metric 2] | [Value] | [Source] |

## Sources
1. [Source 1 Name](URL) - [Brief description]
2. [Source 2 Name](URL) - [Brief description]
3. [Source 3 Name](URL) - [Brief description]

## Research Path
[Hop 0 → Hop 1 → Hop 2 summary]
```

### Literature Review Template

```markdown
# Literature Review: [Topic]

## Search Strategy
- Databases: [arXiv, Google Scholar, etc.]
- Keywords: [list of search terms]
- Date Range: [from - to]
- Results: [number of papers found]

## Key Papers

### [Paper Title 1]
**Authors**: [Author list]
**Venue**: [Conference/Journal]
**Year**: [Year]
**Citations**: [Count]
**Summary**: [2-3 sentences]
**Key Contribution**: [Main contribution]

### [Paper Title 2]
...

## Trends Identified
- [Trend 1]
- [Trend 2]
- [Trend 3]

## Gaps and Future Work
- [Gap 1]
- [Gap 2]
```

## Best Practices

### Efficiency Tips

1. **Start broad, then narrow**: Begin with overview pages, then dive into specifics
2. **Use APIs when available**: Faster and more structured than scraping
3. **Parallel fetches**: When researching multiple sources, fetch them in parallel
4. **Save intermediate results**: Don't re-fetch the same pages
5. **Set timeout limits**: Don't wait forever for slow pages

### Quality Tips

1. **Check dates**: Web content ages quickly
2. **Verify against multiple sources**: Don't trust single sources
3. **Look for primary sources**: Go to original when possible
4. **Note limitations**: Acknowledge what you couldn't verify
5. **Document everything**: Keep detailed research logs

### Ethical Considerations

1. **Respect robots.txt**: Follow website crawling policies
2. **Rate limiting**: Don't overwhelm servers with requests
3. **Attribution**: Always cite sources properly
4. **Terms of service**: Comply with website ToS
5. **Paywalls**: Don't attempt to bypass access controls

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Page won't load | Try fetch_url_raw, check if JavaScript required |
| Content missing | Site may require login or have anti-bot measures |
| API rate limited | Add delays between requests, use authentication |
| PDF links broken | Try alternative sources, institutional repositories |
| Too much content | Use search_text to find specific sections |

## Quick Reference

### Common Search URLs

```
arXiv: https://arxiv.org/search/?query={term}
GitHub: https://github.com/search?q={term}
Google Scholar: https://scholar.google.com/scholar?q={term}
Semantic Scholar: https://www.semanticscholar.org/search?q={term}
```

### Common API Endpoints

```
GitHub API: https://api.github.com/repos/{owner}/{repo}
arXiv API: http://export.arxiv.org/api/query?search_query={term}
```

### Key Commands

```
# Get page content
fetch_url(url="https://example.com")

# Search within page
search_text(url="https://example.com", query="keyword")

# Get API data
fetch_json(url="https://api.example.com/data")

# Get raw HTML
fetch_url_raw(url="https://example.com")
```

---

*For PDF processing after download, use the pdf skill.*
*For data analysis of extracted information, use the xlsx skill.*
