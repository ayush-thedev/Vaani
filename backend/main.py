import os
import json
import time
import asyncio
import logging
from typing import Optional
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from backend.utils.security import validate_text
from backend.extractor import extract_from_url
from backend.services.sarvam_service import (
    SarvamService,
    SUPPORTED_LANGUAGES,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vaani")

app = FastAPI(
    title="Vaani - Multilingual News Intelligence API",
    version="1.1.0",
    description="API for extracting, summarizing, and translating multilingual news articles using Sarvam AI."
)

# Enable CORS for local dev and frontend deployment
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory Token Bucket Rate Limiter (60 requests/min capacity)
class TokenBucket:
    def __init__(self, capacity: int = 60, fill_rate: float = 1.0):
        self.capacity = capacity
        self.fill_rate = fill_rate  # tokens per second
        self.tokens = float(capacity)
        self.last_update = time.time()
        self.lock = asyncio.Lock()

    async def acquire(self) -> bool:
        async with self.lock:
            now = time.time()
            elapsed = now - self.last_update
            self.last_update = now
            self.tokens = min(self.capacity, self.tokens + elapsed * self.fill_rate)
            if self.tokens >= 1.0:
                self.tokens -= 1.0
                return True
            return False

rate_limiter = TokenBucket(capacity=60, fill_rate=1.0)
sarvam_service: Optional[SarvamService] = None

@app.on_event("startup")
def startup_event():
    global sarvam_service
    try:
        sarvam_service = SarvamService()
        logger.info("SarvamService successfully initialized.")
    except Exception as exc:
        logger.error(f"Error initializing SarvamService: {exc}")

class ProcessRequest(BaseModel):
    url: Optional[str] = Field(None, description="Article URL to extract and process")
    text: Optional[str] = Field(None, description="Raw article text to process directly")
    title: Optional[str] = Field(None, description="Optional article title if submitting raw text")

class TranslateRequest(BaseModel):
    text: str = Field(..., description="Text to translate (summary or takeaways)")
    target_language: str = Field(..., description="BCP-47 target language code, e.g. hi-IN, ta-IN, mr-IN, en-IN")
    source_language: Optional[str] = Field("en-IN", description="BCP-47 source language code or name")

@app.get("/api/v1/health")
def health_check():
    return {"status": "ok", "app": "Vaani", "version": "1.1.0"}

@app.get("/api/v1/languages")
def get_languages():
    return {"languages": SUPPORTED_LANGUAGES}

@app.post("/api/v1/process")
async def process_article(req: ProcessRequest):
    """
    Extracts article content (if URL provided) and streams the Sarvam-105B
    analysis (summary, key takeaways, entities, language) via Server-Sent Events.
    """
    if not req.url and not req.text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either 'url' or 'text' must be provided."
        )

    if not await rate_limiter.acquire():
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit reached. Please wait a moment before submitting again."
        )

    if not sarvam_service:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Sarvam AI service is not initialized. Check server SARVAM_API_KEY."
        )

    async def event_generator():
        title = req.title or ""
        source = "Pasted Text"
        content_text = ""
        was_truncated = False

        # Step 1: Content Extraction
        if req.url:
            yield {
                "event": "message",
                "data": json.dumps({"type": "status", "message": "Extracting article from URL..."})
            }
            try:
                loop = asyncio.get_event_loop()
                extracted = await loop.run_in_executor(None, extract_from_url, req.url)
                title = extracted["title"]
                source = extracted["source"]
                content_text = extracted["text"]
                was_truncated = extracted["was_truncated"]
            except Exception as exc:
                logger.warning(f"Extraction failed for {req.url}: {exc}")
                yield {
                    "event": "message",
                    "data": json.dumps({
                        "type": "error",
                        "error_type": "extraction_error",
                        "message": str(exc)
                    })
                }
                return
        else:
            try:
                content_text = validate_text(req.text)
                if len(content_text) > 15000:
                    content_text = content_text[:15000]
                    was_truncated = True
                if not title:
                    # Use first line or snippet as title
                    first_line = content_text.split("\n")[0].strip()
                    title = first_line[:100] if first_line else "Submitted Article"
            except Exception as exc:
                yield {
                    "event": "message",
                    "data": json.dumps({
                        "type": "error",
                        "error_type": "validation_error",
                        "message": str(exc)
                    })
                }
                return

        # Emit metadata event
        yield {
            "event": "message",
            "data": json.dumps({
                "type": "meta",
                "title": title,
                "source": source,
                "was_truncated": was_truncated
            })
        }

        yield {
            "event": "message",
            "data": json.dumps({"type": "status", "message": "Analyzing article with Sarvam-105B..."})
        }

        # Step 2: Stream Analysis from Sarvam-105B in real time via an async queue
        try:
            loop = asyncio.get_running_loop()
            queue = asyncio.Queue()
            sentinel = object()

            def producer():
                try:
                    for item in sarvam_service.stream_analyze_sync(content_text, title=title):
                        loop.call_soon_threadsafe(queue.put_nowait, item)
                except Exception as ex:
                    loop.call_soon_threadsafe(queue.put_nowait, ("internal_error", ex))
                finally:
                    loop.call_soon_threadsafe(queue.put_nowait, sentinel)

            # Start producer thread
            loop.run_in_executor(None, producer)

            while True:
                item = await queue.get()
                if item is sentinel:
                    break
                event_type, payload = item
                if event_type == "internal_error":
                    raise payload
                elif event_type == "chunk":
                    yield {
                        "event": "message",
                        "data": json.dumps({"type": "chunk", "text": payload})
                    }
                elif event_type == "done":
                    payload["title"] = title
                    payload["source"] = source
                    payload["was_truncated"] = was_truncated
                    yield {
                        "event": "message",
                        "data": json.dumps({"type": "done", "data": payload})
                    }
        except Exception as exc:
            logger.error(f"Sarvam-105B analysis failed: {exc}", exc_info=True)
            yield {
                "event": "message",
                "data": json.dumps({
                    "type": "error",
                    "error_type": "model_error",
                    "message": f"AI summarization service encountered an error: {str(exc)}"
                })
            }

    return EventSourceResponse(event_generator())

@app.post("/api/v1/translate")
async def translate_content(req: TranslateRequest):
    """
    Translates text into the target language using sarvam-translate:v1 with sentence chunking.
    """
    if not req.text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text cannot be empty."
        )

    if not await rate_limiter.acquire():
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit reached. Please wait a moment."
        )

    if not sarvam_service:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Sarvam AI service is not initialized."
        )

    try:
        loop = asyncio.get_event_loop()
        translated = await loop.run_in_executor(
            None,
            sarvam_service.translate_text,
            req.text,
            req.target_language,
            req.source_language or "en-IN"
        )
        return {
            "translated_text": translated,
            "target_language": req.target_language
        }
    except Exception as exc:
        logger.error(f"Translation failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Translation error: {str(exc)}"
        )
