# Vaani — Multilingual News Intelligence Agent

> **"Every story. Every language. One perspective."**

An AI-powered multilingual news intelligence platform designed to eliminate language barriers and information overload by transforming complex news articles into structured briefings, key facts, extracted entities, and regional Indic translations using **Sarvam AI**.

---

## Features

- **Triple Input Modes**: Extract content cleanly from any article URL (using Trafilatura with SSRF protections), paste raw article text directly, or **dictate using voice** powered by Sarvam **Saaras v4** speech recognition.
- **Sarvam-105B Reasoning**: Real-time token-by-token streaming of executive summaries (5–7 sentences), key takeaways, and detected source language.
- **Audio News Briefing (Text-to-Speech)**: Interactive regional-language voice player powered by Sarvam **Bulbul v4 Flash** with scrubbable controls, playback speeds, and replay.
- **Extracted Intelligence Entities**: Automatically groups People, Organizations, Locations, Relevant Dates, and Key Figures / Statistics.
- **Instant Indic Translations (All 23 Languages)**: One-click translation of the summary into **any of the 22 Scheduled Indian Languages + English** powered by `sarvam-translate:v1` with sentence-boundary chunking.
- **Editorial UI**: Clean, responsive layout inspired by modern news intelligence dashboards with live streaming output cards, interactive voice widgets, and feedback collection.

---

## Project Structure

```text
Vaani/
├── backend/
│   ├── main.py              # FastAPI app with SSE streaming & rate limiter
│   ├── extractor.py         # URL article extraction via Trafilatura
│   ├── services/
│   │   └── sarvam_service.py # SarvamAI SDK (Sarvam-105B + Sarvam Translate)
│   ├── utils/
│   │   └── security.py      # SSRF validation & input length controls
│   └── requirements.txt     # Python backend dependencies
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Main editorial news dashboard
│   │   ├── types.ts         # TypeScript interfaces
│   │   └── index.css        # Tailwind styling & typography
│   ├── vite.config.ts       # Vite proxy config
│   └── package.json
├── run_dev.py               # One-command dual dev runner
├── .env                     # SARVAM_API_KEY (never commit)
└── .gitignore
```

---

## Getting Started

### 1. Environment Setup
Ensure your `.env` contains your Sarvam AI API subscription key:
```env
SARVAM_API_KEY=your_sarvam_api_key_here
```

### 2. Run Both Backend & Frontend
Run the development runner:
```bash
python run_dev.py
```

This launches:
- **Frontend Dashboard**: [http://localhost:5173](http://localhost:5173)
- **Backend Swagger API**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

Alternatively, run each service independently:
- **Backend**: `uvicorn backend.main:app --reload --port 8000`
- **Frontend**: `cd frontend && npm run dev`
