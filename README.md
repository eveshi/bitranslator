# BiTranslator – AI-Powered Full-Book Translation

**[English](#english) | [中文](#中文) | [更新日志 / Changelog](#changelog)**

---

<a id="english"></a>
## English

BiTranslator is an AI-driven whole-book translation tool that works with **EPUB files**. Unlike simple chapter-by-chapter machine translation, it mimics a professional translator's workflow: read the entire book first, understand the context, craft a translation strategy, then translate chapter by chapter — ensuring consistent terminology, coherent style, and contextual continuity throughout.

> **Supported format: EPUB only.** PDF, MOBI, and other formats are not supported. You can convert other formats to EPUB using tools like [Calibre](https://calibre-ebook.com/) before importing.

### Key Features

- **Deep Analysis** – AI reads the book and performs online research to identify genre, themes, characters, writing style, cultural context, etc.
- **Translation Strategy** – Automatically generates a translation strategy (glossary, character names, tone & style guidelines) with user feedback loops
- **User Control** – Edit the strategy, modify the glossary, specify character name translations, set the desired tone. Provide corrections at every step.
- **Translation Style Preference** – Choose between faithful translation or free translation that prioritizes readability for complex sentences
- **Translator's Annotations** – AI generates explanatory notes for difficult sentences, idioms, and cultural references alongside translation; viewable inline or in a dedicated panel; exportable as a standalone EPUB
- **Sample Review** – Translates a sample chapter for preview; refine the strategy based on your feedback before full translation
- **Chapter Range Selection** – Choose which chapters to translate (e.g., chapters 3–10); save strategy and continue later
- **Context Continuity** – Carries forward summaries of previous chapters during translation to maintain consistency
- **EPUB Reader** – Built-in reader with side-by-side original/translation view, AI Q&A, and title editing
- **Bilingual Titles** – Chapter titles displayed in both source and target languages in the editor and generated EPUBs
- **Chapter Type Management** – Mark chapters as front matter, body chapters, or back matter; body chapters are auto-numbered
- **EPUB Output** – Chapter-by-chapter EPUB output with stop/resume, individual downloads, and combined full-book EPUB
- **Multi-Model Support** – Google Gemini (native SDK), OpenAI, DeepSeek, Ollama (local), and any OpenAI-compatible API
- **Bilingual UI** – Interface available in Chinese and English

### Workflow

```
Upload EPUB → Deep Analysis (with online research) → Generate Strategy → Edit Strategy
→ Translate Sample → Review/Feedback → Full Translation → Reader & Review → Download EPUB
```

### Screenshots

**Deep Analysis** – AI identifies genre, themes, characters, writing style, and cultural context with bilingual output:

![Analysis Page](images/analysis_page.png)

![Analysis – Characters](images/analysis_page_2.png)

![Analysis – Key Terms & Cultural Notes](images/analysis_page_3.png)

**Sample Review** – Preview translation quality with side-by-side original/translation; select chapter range for full translation:

![Sample Page](images/sample_page.png)

**Review** – Browse all chapters, manage chapter types and bilingual titles:

![Review Page](images/review_page.png)

**Title Editor** – Set chapter types (front matter/body/back matter), edit bilingual titles, auto-number, AI translate:

![Title Editor](images/title_editor.png)

**Built-in Reader** – Side-by-side reading with AI Q&A assistant for translation questions:

![Reader](images/reader.png)

**Translator's Annotations** – Annotated sentences highlighted in translation; click to view the note inline:

![Annotation Highlight](images/annotation_highlight.png)

![Annotation Inline Panel](images/annotation_inline_panel.png)

**All Annotations Panel** – View all translator's notes for the current chapter at once:

![Annotation Panel](images/annotation_panel.png)

**Download** – Chapter-by-chapter downloads or combine into a complete translated EPUB:

![Finish Page](images/finish_page.png)

### Quick Start

#### 1. Prerequisites

Requires Python 3.10+.

```bash
cd bitranslator
pip install -r requirements.txt
```

#### 2. Configuration

Copy the environment variable template and fill in your API details:

```bash
cp .env.example .env
# Edit .env and fill in your API Key, etc.
```

You can also configure LLM settings through the sidebar in the web UI after launching.

#### 3. Launch

```bash
python run.py
```

Open http://127.0.0.1:8000 in your browser.

#### 4. Usage

1. **Upload** – Select an EPUB file, set the target language (source auto-detected)
2. **Analysis** – AI analyzes the book with online research (may take a few minutes)
3. **Strategy** – Review and customize the translation strategy; provide feedback to regenerate if needed
4. **Sample** – Select a sample chapter and review translation quality; iterate as needed
5. **Translate** – Select chapter range and start translating; stop/resume anytime
6. **Review** – Read chapters in the built-in reader; re-translate individual chapters if needed
7. **Download** – Download individual chapter EPUBs or combine into a full translated book

### Supported LLMs

| Provider | Configuration |
|----------|---------------|
| Google Gemini | Select "Google Gemini" provider, enter your API Key (default: gemini-2.5-pro) |
| OpenAI | Select "OpenAI / Compatible API", Base URL: `https://api.openai.com/v1` |
| DeepSeek | Select "OpenAI / Compatible API", Base URL: `https://api.deepseek.com/v1` |
| Ollama (local) | Select "Ollama", Base URL: `http://localhost:11434/v1` |
| Other | Enter any OpenAI-compatible Base URL and API Key |

### Project Structure

```
bitranslator/
├── backend/
│   ├── app.py              # FastAPI application
│   ├── config.py           # Configuration management
│   ├── database.py         # SQLite database
│   ├── models.py           # Data models
│   ├── routers/
│   │   ├── books.py        # Project/book management API
│   │   └── translation.py  # Analysis/strategy/translation API
│   └── services/
│       ├── llm_service.py          # LLM client (Gemini native + OpenAI)
│       ├── epub_service.py         # EPUB parsing & building
│       ├── analysis_service.py     # Book deep analysis with online research
│       ├── strategy_service.py     # Translation strategy generation
│       └── translation_service.py  # Translation engine with auto-continuation
├── frontend/
│   ├── index.html          # UI
│   ├── style.css           # Styles
│   ├── app.js              # Entry point & routing
│   └── modules/            # Frontend modules (upload, analysis, strategy, etc.)
├── data/                   # Runtime data (uploads, database)
├── output/                 # Translated EPUB output
├── requirements.txt
├── run.py                  # Entry point
└── .env.example            # Environment variable template
```

---

<a id="中文"></a>
## 中文

BiTranslator 是一款 AI 驱动的整书翻译工具，支持 **EPUB 格式**。不同于简单的逐章机器翻译，它模拟专业译者的工作流程：先通读全书、理解上下文、制定翻译策略，再逐章翻译——确保术语一致、风格连贯、上下文通顺。

> **仅支持 EPUB 格式。** 不支持 PDF、MOBI 等其他格式。可使用 [Calibre](https://calibre-ebook.com/) 等工具将其他格式转换为 EPUB 后再导入。

### 主要功能

- **深度分析** – AI 阅读书籍并进行在线调研，识别体裁、主题、角色、写作风格、文化背景等
- **翻译策略** – 自动生成翻译策略（术语表、角色名称、语气风格指南），支持用户反馈迭代
- **用户控制** – 可编辑策略、修改术语表、指定角色名翻译、设定语气。每个步骤都可以提供修正意见
- **翻译风格偏好** – 可选择忠实原文翻译或优先可读性的意译模式，针对长难句自动拆分重组
- **翻译附注** – AI 翻译时同步生成长难句、惯用语、文化背景的意译分析注释；可在阅读器内高亮查看或弹窗浏览全部附注；支持导出为独立 EPUB
- **样章审阅** – 翻译样章供预览；根据反馈调整策略后可重新翻译
- **章节范围选择** – 选择翻译特定章节（如第3-10章）；保存策略后可随时继续
- **上下文连贯** – 翻译时携带前面章节的摘要，保持情节和术语一致性
- **EPUB 阅读器** – 内置阅读器，支持原文/译文对照阅读、AI 问答、标题编辑
- **双语标题** – 章节标题在编辑器和生成的 EPUB 中以原文/译文双语显示
- **章节类型管理** – 可将章节标记为前言、正文或附录；正文章节自动编号
- **EPUB 输出** – 逐章输出 EPUB，支持停止/恢复、单章下载、合并为完整译本
- **多模型支持** – Google Gemini（原生 SDK）、OpenAI、DeepSeek、Ollama（本地模型）及任意 OpenAI 兼容 API
- **双语界面** – 支持中文和英文界面切换

### 工作流程

```
上传 EPUB → 深度分析（含在线调研）→ 生成翻译策略 → 编辑策略
→ 翻译样章 → 审阅/反馈 → 全书翻译 → 阅读器审阅 → 下载 EPUB
```

### 界面截图

**深度分析** – AI 识别体裁、主题、角色、写作风格和文化背景，中英双语输出：

![分析页面](images/analysis_page.png)

![分析 – 主要角色](images/analysis_page_2.png)

![分析 – 关键术语与文化笔记](images/analysis_page_3.png)

**样章审阅** – 原文/译文对照预览翻译质量；选择章节范围进行全书翻译：

![样章页面](images/sample_page.png)

**审阅** – 浏览所有章节，管理章节类型和双语标题：

![审阅页面](images/review_page.png)

**标题编辑器** – 设置章节类型（前言/正文/附录），编辑双语标题，自动编号，AI 翻译：

![标题编辑器](images/title_editor.png)

**内置阅读器** – 原文/译文对照阅读，AI 翻译助手随时解答翻译疑问：

![阅读器](images/reader.png)

**翻译附注** – 有注释的译文句子高亮显示，点击即可查看该句注释：

![附注高亮](images/annotation_highlight.png)

![附注内联面板](images/annotation_inline_panel.png)

**全部附注面板** – 一次查看当前章节的所有翻译注释：

![附注面板](images/annotation_panel.png)

**下载** – 逐章下载或合并为完整译本 EPUB：

![完成页面](images/finish_page.png)

### 快速开始

#### 1. 环境要求

需要 Python 3.10+。

```bash
cd bitranslator
pip install -r requirements.txt
```

#### 2. 配置

复制环境变量模板并填入 API 信息：

```bash
cp .env.example .env
# 编辑 .env 文件，填入你的 API Key 等信息
```

也可以在启动后通过网页侧边栏配置 LLM 设置。

#### 3. 启动

```bash
python run.py
```

在浏览器中打开 http://127.0.0.1:8000。

#### 4. 使用方法

1. **上传** – 选择 EPUB 文件，设置目标语言（源语言自动检测）
2. **分析** – AI 分析书籍并进行在线调研（可能需要几分钟）
3. **策略** – 审阅并自定义翻译策略；可提交反馈重新生成
4. **样章** – 选择样章并审阅翻译质量；可反复调整
5. **翻译** – 选择章节范围开始翻译；随时可停止/恢复
6. **审阅** – 在内置阅读器中阅读；可对单章重新翻译
7. **下载** – 下载单章 EPUB 或合并为完整译本

### 支持的 LLM

| 提供商 | 配置方式 |
|--------|----------|
| Google Gemini | 选择"Google Gemini"提供商，输入 API Key（默认：gemini-2.5-pro） |
| OpenAI | 选择"OpenAI / 兼容 API"，Base URL: `https://api.openai.com/v1` |
| DeepSeek | 选择"OpenAI / 兼容 API"，Base URL: `https://api.deepseek.com/v1` |
| Ollama（本地）| 选择"Ollama"，Base URL: `http://localhost:11434/v1` |
| 其他 | 输入任意 OpenAI 兼容的 Base URL 和 API Key |

### 项目结构

```
bitranslator/
├── backend/
│   ├── app.py              # FastAPI 应用
│   ├── config.py           # 配置管理
│   ├── database.py         # SQLite 数据库
│   ├── models.py           # 数据模型
│   ├── routers/
│   │   ├── books.py        # 项目/书籍管理 API
│   │   └── translation.py  # 分析/策略/翻译 API
│   └── services/
│       ├── llm_service.py          # LLM 客户端（Gemini 原生 + OpenAI）
│       ├── epub_service.py         # EPUB 解析与构建
│       ├── analysis_service.py     # 书籍深度分析（含在线调研）
│       ├── strategy_service.py     # 翻译策略生成
│       └── translation_service.py  # 翻译引擎（含自动续写）
├── frontend/
│   ├── index.html          # 用户界面
│   ├── style.css           # 样式
│   ├── app.js              # 入口与路由
│   └── modules/            # 前端模块（上传、分析、策略等）
├── data/                   # 运行时数据（上传文件、数据库）
├── output/                 # 翻译输出的 EPUB
├── requirements.txt
├── run.py                  # 启动入口
└── .env.example            # 环境变量模板
```

### 技术细节

#### 翻译上下文连贯性

系统通过以下机制确保跨章节一致性：

1. **全书分析** – 为每章生成摘要，再结合在线调研产出全书整体分析
2. **统一翻译策略** – 术语表和角色名映射在所有章节中统一应用
3. **滚动上下文** – 翻译每章时，携带前面章节的摘要作为上下文
4. **长章节拆分** – 过长章节自动在段落边界拆分翻译，并支持截断检测和自动续写

#### 数据存储

所有数据存储在本地：
- SQLite 数据库存储项目信息、章节内容、分析结果和翻译策略
- 上传的 EPUB 和翻译后的 EPUB 存储在各项目子目录中

---

<a id="changelog"></a>
## 更新日志 / Changelog

#### 2026-02-24

| 类型 | 内容 |
|------|------|
| feat | **Translator's annotations**: AI generates explanatory notes for difficult sentences, idioms, and cultural references alongside each translation chunk / **翻译附注**：AI 在翻译时同步生成长难句、惯用语、文化背景的意译分析注释 |
| feat | **Inline annotation highlights**: toggle "Show Annotations" to highlight annotated sentences in the translation; click to view the note in a tooltip at the bottom / **内联附注高亮**：勾选"显示附注"可在译文中高亮有注释的句子，点击后在底部显示该句注释 |
| feat | **All annotations panel**: click "View All Notes" to open a modal showing all annotations for the current chapter / **全部附注面板**：点击"查看所有附注"弹窗显示当前章节的全部注释 |
| feat | **Annotations EPUB export**: download all translator's notes as a standalone EPUB / **附注 EPUB 导出**：可将全部翻译注释下载为独立 EPUB |
| feat | **Free-translation preference**: new strategy option to prioritize readability — restructure long/complex sentences for clarity / **意译偏好选项**：新增翻译策略选项，优先可读性，长难句自动拆分重组 |
| fix | Fix annotation tooltip text color invisible in dark theme / 修复暗色主题下附注提示框文字不可见的问题 |

#### 2025-02-22

| 类型 | 内容 |
|------|------|
| fix | Resolve API key input recognition issue / 修复 API Key 输入识别问题 |
| refactor | Reorganize frontend structure and introduce `modules/` directory / 重构前端结构，新增 `modules/` 目录 |
| feat | Add routing to enable direct navigation to specific books and pages / 增加路由，支持直接跳转到指定项目和页面 |
| feat | Introduce subpages with back navigation support / 支持子页面及返回导航 |
| feat | Support multi-part book structures (e.g., Part I, Part II) in addition to chapters / 支持多“部”结构（如第一部、第二部）以及普通章节 |
| feat | Refine annotation rules: only annotate terms/places without standard translations; names annotated once per request with selective coverage / 细化标注规则：仅标注无通用译名的术语/地名；人名每请求一次且选择性标注 |
| feat | Allow users to edit character names and unify translated character names / 支持用户编辑角色名并统一译文中的人名 |
