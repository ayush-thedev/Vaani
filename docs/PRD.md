# Product Requirements Document (PRD)
## Vaani — Multilingual News Intelligence Agent

**Version:** 1.1  
**Status:** Approved Specification  
**Product Type:** AI-powered multilingual news summarization platform  
**AI Provider:** Sarvam AI

---

## 1. Product Overview

### 1.1 Description

Vaani is an AI-powered multilingual news intelligence platform that enables users to consume news from different sources and languages through concise, accessible, and personalized summaries.

Users can submit news articles through URLs or pasted text. Vaani extracts the content, identifies its language, generates a structured summary with key takeaways, and translates it into the user's preferred language.

The platform aims to eliminate language barriers and information overload by making news easier to understand and consume.

### 1.2 Problem Statement

News consumption presents three major challenges:

- **Language barriers:** Important news is often published in languages users may not understand.
- **Information overload:** Long articles require significant time to read and understand.
- **Accessibility:** Users may prefer listening to news or consuming it in a different language than the source.

### 1.3 Proposed Solution

Vaani provides a unified interface where users can:

1. Submit news articles via URL or pasted text.
2. Automatically detect the source language.
3. Generate concise AI summaries with key takeaways and entities.
4. Translate summaries into their preferred language.
5. *(Phase 2)* Listen to summaries through natural regional-language audio narration.
6. *(Phase 3)* Upload PDFs and newspaper screenshots as input.

---

## 2. Product Objectives

### Primary Objectives

- Reduce the time required to understand lengthy news articles.
- Make news accessible across language barriers.
- Provide accurate, context-preserving summaries.
- Support multilingual news consumption.

### Success Metrics

| Metric | Target | Measurement Method |
|---|---|---|
| Article extraction success | ≥ 90% | Automated test suite against a curated corpus of 100 URLs from top Indian news sites (tested weekly in CI) |
| Summary generation latency | First token < 3s; full summary < 12s | Backend instrumentation: timestamps on request receipt → first SSE chunk → final chunk |
| Language detection accuracy | ≥ 95% | Validated against a 100-article labeled test set covering all supported languages, re-evaluated per release |
| Translation quality | ≥ 4.0 / 5.0 Likert score | Human evaluation on a 50-sample review set per language pair, conducted before each phase launch |
| User satisfaction | ≥ 80% positive | In-app thumbs-up/down on each summary; tracked from day one |

---

## 3. Target Audience

| User Segment | Primary Need |
|---|---|
| Students | Quickly understand national and international news |
| Working professionals | Consume news efficiently with limited time |
| Regional-language readers | Access English and other-language news in their preferred language |
| Researchers | Extract key information from multiple news articles |
| General readers | Understand complex news through simplified summaries |

---

## 4. Phased Feature Plan

### Phase 1 — MVP

The minimum required to validate the core value proposition.

| Feature | Details |
|---|---|
| **Article URL input** | Paste a URL; backend extracts article text and metadata |
| **Pasted text input** | Paste raw article text directly |
| **Auto language detection** | Via `sarvam-translate:v1`'s `auto` source detection — no separate detection step |
| **AI summarization** | Standard summary (5–7 sentences) + key takeaways + entity extraction, generated in a single Sarvam-105B call |
| **Translation** | Into all 23 Sarvam AI supported languages (English + 22 Scheduled Indian languages) |
| **Single-page UI** | Input area → processing indicator → results panel with quick pills and 23-language selector. Responsive layout |

**Explicitly excluded from Phase 1:**
- PDF upload, image/screenshot input
- Summary length toggles (Quick Brief / Detailed)
- Audio narration
- Authentication, user accounts, article history

### Phase 2 — Full Summarization + Audio

| Feature | Details |
|---|---|
| PDF upload | Extract text via PyMuPDF |
| Summary format selector | Quick Brief (2–3 sentences), Standard (5–7), Detailed (comprehensive) |
| Full language support | Add Telugu, Bengali, Kannada, Malayalam, Gujarati, Punjabi, Odia (11 total) |
| Audio narration | Bulbul v4 Flash TTS; generated as a background job after summary is displayed |
| Playback controls | Play, pause, replay; language selector for narration |

### Phase 3 — Accounts + Advanced Input

| Feature | Details |
|---|---|
| Authentication | Supabase Auth (email + Google OAuth) |
| Article history | Save/retrieve/delete processed articles per user |
| Image input | Newspaper screenshots via Sarvam Vision 2.1 Document Intelligence API |
| Voice input | Dictate article text via Saaras v4 STT |
| Manual language correction | Override auto-detected source language |
| Side-by-side view | Original and translated summaries displayed together |

---

## 5. Core Functional Requirements

### FR-01: Article Input (Phase 1)

**Supported inputs (MVP):**
- Article URL
- Pasted article text

**Requirements:**
- Validate URL format before fetching.
- Extract article text, headline, and source publication using Trafilatura.
- Display the extracted headline and source before summarization.
- Show a clear error when extraction fails (paywall, unsupported site, timeout), with a prompt to paste the text manually instead.
- Cap pasted text input at 50,000 characters. Display character count.

### FR-02: AI Summarization (Phase 1)

The system generates a summary, key takeaways, and entity extraction in a **single Sarvam-105B API call** using a structured prompt.

**Output structure:**

| Field | Description |
|---|---|
| Summary | 5–7 sentence overview (Standard format) |
| Key Takeaways | 3–5 bullet points |
| Entities | People, organizations, locations, dates, statistics extracted from the article |
| Detected Language | Source language as identified by the model |

**Requirements:**
- Preserve original meaning; do not introduce unsupported information.
- Retain important dates, figures, and names.
- Separate reported facts from editorial interpretation.
- Stream the response via SSE so the user sees text appearing in real time.

### FR-03: Translation (Phase 1)

**Supported languages:** All 23 languages supported by Sarvam AI (`sarvam-translate:v1`): English, Hindi, Bengali, Marathi, Telugu, Tamil, Gujarati, Urdu, Kannada, Odia, Malayalam, Punjabi, Assamese, Maithili, Santali, Kashmiri, Nepali, Konkani, Sindhi, Dogri, Manipuri, Bodo, and Sanskrit.

**Requirements:**
- Use `sarvam-translate:v1` (formal mode) as the primary translation model.
- Chunk input at sentence boundaries to stay within the 2,000-character-per-request limit. Reassemble translated chunks before displaying.
- Translate only the generated summary and takeaways — not the full original article.
- Allow switching target language without re-submitting the article.
- Display translation alongside the original summary.

### FR-04: Audio Narration (Phase 2)

**Requirements:**
- Convert the translated (or original) summary to speech using **Bulbul v4 Flash**.
- Generate audio as a background job — display a loading state, then reveal playback controls when ready.
- Support narration in the same language as the displayed summary.
- Provide play, pause, and replay controls.
- Serve audio files from Supabase Storage (or equivalent blob store); do not generate on every playback.

### FR-05: Article History (Phase 3)

**Requirements:**
- Requires authenticated session.
- Save: headline, source URL, original language, generated summary, selected translation, processing timestamp.
- Do **not** store full original article text (copyright and storage concerns).
- Display history as a paginated list sorted by date.
- Allow deletion of individual entries.

---

## 6. AI Model Integration

| Model | SDK Identifier | Responsibility | Phase |
|---|---|---|---|
| Sarvam-105B | `sarvam-105b-conversations` | Summarization, entity extraction, key takeaways, language identification | Phase 1 |
| Sarvam Translate | `sarvam-translate:v1` | Formal multilingual translation (all 22 scheduled languages) | Phase 1 |
| Bulbul v4 Flash | `bulbul:v4-flash` | Text-to-speech narration (low-latency, 200+ voices) | Phase 2 |
| Sarvam Vision 2.1 | `sarvam-vision:2.1` | Newspaper screenshot / image text extraction via Document Intelligence pipeline | Phase 3 |
| Saaras v4 | `saaras:v4` | Voice-based article input (speech-to-text) | Phase 3 |

---

## 7. Technical Architecture

### 7.1 Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React + TypeScript + Tailwind CSS | Vite for build tooling |
| Backend | Python + FastAPI | Async endpoints; SSE for streaming |
| AI Models | Sarvam AI APIs via `sarvamai` SDK | All keys backend-only |
| Article Extraction | Trafilatura | Boilerplate removal |
| PDF Extraction | PyMuPDF | Phase 2 |
| Database | Supabase (PostgreSQL) | Phase 3 (history + auth) |
| Authentication | Supabase Auth | Phase 3 |
| File Storage | Supabase Storage | Phase 2 (audio files) |
| Deployment | Vercel (frontend) + Render (backend) | |

### 7.2 Backend API (Phase 1)

| Endpoint | Method | Purpose | Response Type |
|---|---|---|---|
| `/api/v1/process` | POST | Extract article + summarize + extract entities | SSE stream |
| `/api/v1/translate` | POST | Translate a summary into target language | JSON |
| `/api/v1/languages` | GET | List supported target languages | JSON |

---

## 8. Development Roadmap

| Phase | Duration | Deliverables | Depends On |
|---|---|---|---|
| **Phase 1: MVP** | Weeks 1–3 | Project scaffold, FastAPI backend, React frontend, Trafilatura extraction, Sarvam-105B summarization (streamed), sarvam-translate:v1 translation (4 languages), single-page responsive UI | Sarvam API key |
| **Phase 2: Audio + Full Languages** | Weeks 4–5 | PDF upload, summary format selector, 11 languages, Bulbul v4 Flash TTS, Supabase Storage for audio, playback UI | Phase 1 deployed |
| **Phase 3: Accounts + Advanced Input** | Weeks 6–8 | Supabase Auth, article history (CRUD), Sarvam Vision 2.1 for images, Saaras v4 for voice input, side-by-side translation view | Phase 2 deployed |

---

**Vaani — Every story. Every language. One perspective.**
