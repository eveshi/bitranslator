# BiTranslator – AI-Powered Full-Book Translation

BiTranslator is an AI-driven whole-book translation tool. Unlike simple chapter-by-chapter machine translation, it mimics a professional translator's workflow: read the entire book first, understand the context, craft a translation strategy, then translate chapter by chapter — ensuring consistent terminology, coherent style, and contextual continuity throughout.

## Key Features

- **Deep Analysis** – AI reads the entire book and identifies genre, themes, characters, writing style, cultural context, etc.
- **Translation Strategy** – Automatically generates a translation strategy based on analysis (glossary, character names, tone & style guidelines)
- **User Control** – Edit the strategy, modify the glossary, specify character name translations, set the desired tone
- **Sample Review** – Translates the first chapter as a sample; refine the strategy based on your feedback
- **Context Continuity** – Carries forward summaries of previous chapters during translation to maintain plot and terminology consistency
- **EPUB Output** – Preserves the original book's structure and formatting, outputs a fully translated EPUB
- **Multi-Model Support** – Works with OpenAI API, Google Gemini, DeepSeek, Ollama (local models), and more

## Workflow

```
Upload EPUB → Deep Analysis → Generate Strategy → Edit Strategy → Translate Sample → Review/Feedback → Full Translation → Download EPUB
```

## Quick Start

### 1. Prerequisites

Requires Python 3.10+.

```bash
cd bitranslator
pip install -r requirements.txt
```

### 2. Configuration

Copy the environment variable template and fill in your API details:

```bash
cp .env.example .env
# Edit .env and fill in your API Key, etc.
```

You can also configure LLM settings through the sidebar in the web UI after launching.

### 3. Launch

```bash
python run.py
```

Open http://127.0.0.1:8000 in your browser.

### 4. Usage

1. **Upload** – Select an EPUB file, set the source and target languages
2. **Analysis** – Wait for AI to analyze the book (may take a few minutes depending on length)
3. **Strategy** – Review the translation strategy; edit character names, glossary, tone, etc.
4. **Sample** – Review the first chapter's translation; provide feedback to regenerate the strategy if needed
5. **Full Translation** – Confirm the strategy and start translating the entire book
6. **Download** – Download the translated EPUB once complete

## Supported LLMs

| Provider | Configuration |
|----------|---------------|
| OpenAI | Base URL: `https://api.openai.com/v1`, enter your API Key |
| Google Gemini | Base URL: `https://generativelanguage.googleapis.com/v1beta/openai/`, enter your API Key |
| DeepSeek | Base URL: `https://api.deepseek.com/v1`, enter your API Key |
| Ollama (local) | Select "Ollama" as provider, Base URL: `http://localhost:11434/v1` |
| Other OpenAI-compatible APIs | Enter the corresponding Base URL and API Key |

## Project Structure

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
│       ├── llm_service.py          # LLM client
│       ├── epub_service.py         # EPUB parsing & building
│       ├── analysis_service.py     # Book deep analysis
│       ├── strategy_service.py     # Translation strategy generation
│       └── translation_service.py  # Translation engine
├── frontend/
│   ├── index.html          # UI
│   ├── style.css           # Styles
│   └── app.js              # Frontend logic
├── data/                   # Runtime data (uploads, database)
├── requirements.txt
├── run.py                  # Entry point
└── .env.example            # Environment variable template
```

## Technical Details

### Translation Context Continuity

The system ensures cross-chapter consistency through the following mechanisms:

1. **Full-Book Analysis** – Generates a summary for each chapter, then produces a holistic analysis of the entire book
2. **Unified Translation Strategy** – The glossary and character name mappings are applied across all chapters
3. **Rolling Context** – When translating each chapter, summaries of the preceding chapters are included as context
4. **Long Chapter Splitting** – Oversized chapters are automatically split at paragraph boundaries for translation

### Data Storage

All data is stored locally in the `data/` directory:
- SQLite database stores project info, chapter content, analysis, and strategy
- Uploaded EPUBs and translated EPUBs are stored in per-project subdirectories
