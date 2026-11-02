import os
import re
import logging
from typing import AsyncGenerator, Dict, Any, List
from dotenv import load_dotenv
from sarvamai import SarvamAI

load_dotenv()

logger = logging.getLogger(__name__)

# Supported language codes and names for Phase 1
SUPPORTED_LANGUAGES = [
    {"code": "en-IN", "name": "English"},
    {"code": "hi-IN", "name": "Hindi (हिंदी)"},
    {"code": "mr-IN", "name": "Marathi (मराठी)"},
    {"code": "ta-IN", "name": "Tamil (தமிழ்)"},
]

# Language name to Sarvam BCP-47 mapping
LANG_NAME_TO_CODE = {
    "english": "en-IN",
    "hindi": "hi-IN",
    "marathi": "mr-IN",
    "tamil": "ta-IN",
    "telugu": "te-IN",
    "bengali": "bn-IN",
    "kannada": "kn-IN",
    "malayalam": "ml-IN",
    "gujarati": "gu-IN",
    "punjabi": "pa-IN",
    "odia": "od-IN",
}

TRANSLATE_CHUNK_SIZE = 1800


class SarvamService:
    def __init__(self):
        api_key = os.getenv("SARVAM_API_KEY")
        if not api_key:
            raise ValueError("SARVAM_API_KEY environment variable is not set.")
        self.client = SarvamAI(api_subscription_key=api_key)

    def resolve_lang_code(self, lang_name_or_code: str) -> str:
        """
        Normalizes a language name or code to a Sarvam BCP-47 code. Defaults to en-IN.
        """
        cleaned = (lang_name_or_code or "").strip().lower()
        if cleaned in LANG_NAME_TO_CODE:
            return LANG_NAME_TO_CODE[cleaned]
        for name, code in LANG_NAME_TO_CODE.items():
            if name in cleaned or code.lower() == cleaned:
                return code
        return "en-IN"

    def parse_analysis_markdown(self, raw_markdown: str) -> Dict[str, Any]:
        """
        Extracts structured fields from the model's standardized markdown response.
        """
        summary = ""
        takeaways: List[str] = []
        entities: Dict[str, List[str]] = {
            "people": [],
            "organizations": [],
            "locations": [],
            "dates": [],
            "statistics": []
        }
        detected_lang = "English"

        # Extract Summary
        sum_match = re.search(r"###\s*Summary\s*\n(.*?)(?=\n###|\Z)", raw_markdown, re.DOTALL | re.IGNORECASE)
        if sum_match:
            summary = sum_match.group(1).strip()

        # Extract Takeaways
        takeaways_match = re.search(r"###\s*Key Takeaways\s*\n(.*?)(?=\n###|\Z)", raw_markdown, re.DOTALL | re.IGNORECASE)
        if takeaways_match:
            lines = takeaways_match.group(1).strip().split("\n")
            for line in lines:
                cleaned = re.sub(r"^[*\-•\d.]\s*", "", line).strip()
                if cleaned:
                    takeaways.append(cleaned)

        # Extract Entities
        entities_match = re.search(r"###\s*Key Entities\s*\n(.*?)(?=\n###|\Z)", raw_markdown, re.DOTALL | re.IGNORECASE)
        if entities_match:
            ent_text = entities_match.group(1).strip()
            for line in ent_text.split("\n"):
                line = line.strip()
                if not line:
                    continue
                # Match patterns like: - **People**: John Doe, Jane Smith
                m_people = re.search(r"\*?\*?People\*?\*?:\s*(.*)", line, re.IGNORECASE)
                m_orgs = re.search(r"\*?\*?Organizations\*?\*?:\s*(.*)", line, re.IGNORECASE)
                m_locs = re.search(r"\*?\*?Locations\*?\*?:\s*(.*)", line, re.IGNORECASE)
                m_dates = re.search(r"\*?\*?Dates\*?\*?:\s*(.*)", line, re.IGNORECASE)
                m_stats = re.search(r"\*?\*?Statistics\*?\*?:\s*(.*)", line, re.IGNORECASE)

                if m_people and m_people.group(1).strip():
                    entities["people"] = [p.strip() for p in m_people.group(1).split(",") if p.strip() and p.strip().lower() != "none"]
                elif m_orgs and m_orgs.group(1).strip():
                    entities["organizations"] = [o.strip() for o in m_orgs.group(1).split(",") if o.strip() and o.strip().lower() != "none"]
                elif m_locs and m_locs.group(1).strip():
                    entities["locations"] = [l.strip() for l in m_locs.group(1).split(",") if l.strip() and l.strip().lower() != "none"]
                elif m_dates and m_dates.group(1).strip():
                    entities["dates"] = [d.strip() for d in m_dates.group(1).split(",") if d.strip() and d.strip().lower() != "none"]
                elif m_stats and m_stats.group(1).strip():
                    entities["statistics"] = [s.strip() for s in m_stats.group(1).split(",") if s.strip() and s.strip().lower() != "none"]

        # Extract Language
        lang_match = re.search(r"###\s*Detected Language\s*\n(.*?)(?=\n###|\Z)", raw_markdown, re.DOTALL | re.IGNORECASE)
        if lang_match:
            detected_lang = lang_match.group(1).strip().split("\n")[0].strip()

        return {
            "summary": summary or raw_markdown,
            "takeaways": takeaways,
            "entities": entities,
            "detected_language": detected_lang,
            "detected_lang_code": self.resolve_lang_code(detected_lang),
            "raw_markdown": raw_markdown
        }

    def stream_analyze_sync(self, text: str, title: str = ""):
        """
        Synchronous generator streaming Sarvam-105B completions.
        """
        prompt = (
            f"You are a professional multilingual news intelligence agent. "
            f"Analyze the following news article carefully.\n"
            f"IMPORTANT: Always write your ENTIRE analysis in English, even if the original article is in another language.\n\n"
            f"Title: {title or 'News Article'}\n"
            f"Content:\n{text}\n\n"
            f"Provide your analysis using EXACTLY this markdown layout:\n"
            f"### Summary\n"
            f"(Provide a concise 5 to 7 sentence factual summary IN ENGLISH. Preserve all critical facts, dates, numbers, and names without editorial bias or hallucination.)\n\n"
            f"### Key Takeaways\n"
            f"- (Takeaway 1)\n"
            f"- (Takeaway 2)\n"
            f"- (Takeaway 3)\n\n"
            f"### Key Entities\n"
            f"- **People**: (Comma separated list of names, or None)\n"
            f"- **Organizations**: (Comma separated list of companies/agencies, or None)\n"
            f"- **Locations**: (Comma separated list of places/countries, or None)\n"
            f"- **Dates**: (Comma separated list of relevant dates, or None)\n"
            f"- **Statistics**: (Comma separated list of key figures/percentages/costs, or None)\n\n"
            f"### Detected Language\n"
            f"(The language of the ORIGINAL article, e.g. English, Hindi, Tamil, Marathi, etc.)"
        )

        response_stream = self.client.chat.completions(
            model="sarvam-105b-conversations",
            messages=[
                {"role": "system", "content": "You are a precise, objective news summarization and entity extraction intelligence agent. You always respond in English."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
            stream=True
        )

        full_content = []
        for chunk in response_stream:
            if chunk.choices and len(chunk.choices) > 0:
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    full_content.append(delta.content)
                    yield ("chunk", delta.content)

        raw_text = "".join(full_content)
        parsed = self.parse_analysis_markdown(raw_text)
        yield ("done", parsed)

    def translate_text(self, text: str, target_lang_code: str, source_lang_code: str = "en-IN") -> str:
        """
        Translates text into target_lang_code using sarvam-translate:v1 with chunking.
        """
        if not text.strip():
            return ""

        src_code = self.resolve_lang_code(source_lang_code)
        tgt_code = self.resolve_lang_code(target_lang_code)

        if src_code == tgt_code:
            return text

        # Chunk text by sentence boundaries if length exceeds TRANSLATE_CHUNK_SIZE
        sentences = re.split(r"(?<=[.!?\n])\s+", text)
        chunks = []
        current_chunk = []
        current_length = 0

        for sentence in sentences:
            if not sentence.strip():
                continue
            if current_length + len(sentence) > TRANSLATE_CHUNK_SIZE and current_chunk:
                chunks.append(" ".join(current_chunk))
                current_chunk = [sentence]
                current_length = len(sentence)
            else:
                current_chunk.append(sentence)
                current_length += len(sentence)

        if current_chunk:
            chunks.append(" ".join(current_chunk))

        translated_chunks = []
        for chunk in chunks:
            try:
                res = self.client.text.translate(
                    input=chunk,
                    source_language_code=src_code,
                    target_language_code=tgt_code,
                    model="sarvam-translate:v1",
                    mode="formal"
                )
                translated_chunks.append(res.translated_text)
            except Exception as e:
                logger.error(f"Translation chunk error: {e}")
                # Fallback: if translation of a chunk fails, keep original or raise
                raise RuntimeError(f"Translation failed: {str(e)}")

        return " ".join(translated_chunks)
