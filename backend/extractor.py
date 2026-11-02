import json
import logging
from typing import Dict, Any
import httpx
import trafilatura
from backend.utils.security import validate_url, MAX_ARTICLE_PROCESS_CHARS

logger = logging.getLogger(__name__)

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"


def extract_from_url(url: str) -> Dict[str, Any]:
    """
    Safely fetches and extracts news article content and metadata from a URL.
    Returns:
        {
            "title": str,
            "source": str,
            "author": str,
            "text": str,
            "was_truncated": bool
        }
    """
    safe_url = validate_url(url)
    
    # Fetch with timeout & browser user-agent
    try:
        with httpx.Client(follow_redirects=True, timeout=12.0) as client:
            headers = {"User-Agent": USER_AGENT}
            response = client.get(safe_url, headers=headers)
            response.raise_for_status()
            html_content = response.text
    except Exception as exc:
        logger.error(f"Failed to fetch URL {url}: {exc}")
        raise ValueError(f"Unable to retrieve article from the given URL. Please check the URL or paste the text directly. Error: {str(exc)}")

    # Extract content and metadata via Trafilatura
    extracted_json = trafilatura.extract(
        html_content,
        url=safe_url,
        output_format="json",
        include_comments=False,
        include_tables=False,
        with_metadata=True,
    )

    title = ""
    source = ""
    author = ""
    text = ""

    if extracted_json:
        try:
            data = json.loads(extracted_json)
            title = data.get("title") or ""
            source = data.get("sitename") or data.get("hostname") or ""
            author = data.get("author") or ""
            text = data.get("text") or ""
        except Exception:
            pass

    # Fallback to plain text extraction if JSON extraction didn't yield text
    if not text:
        text = trafilatura.extract(html_content, include_comments=False) or ""

    if not text or len(text.strip()) < 100:
        raise ValueError("Could not extract sufficient article text from this page. The site may be behind a paywall, require JavaScript, or block automated readers. Please paste the article text directly.")

    text = text.strip()
    was_truncated = False
    if len(text) > MAX_ARTICLE_PROCESS_CHARS:
        text = text[:MAX_ARTICLE_PROCESS_CHARS]
        was_truncated = True

    return {
        "title": title or "Untitled Article",
        "source": source or "Web Source",
        "author": author,
        "text": text,
        "was_truncated": was_truncated
    }
