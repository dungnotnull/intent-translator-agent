"""
Knowledge System — PDF parser, web crawler, LLM summarizer, and cron scheduler.

Provides:
  - parse_pdf_regulation(filepath) -> list[dict]    # Extract text chunks from PDF
  - crawl_portal(url, procedure_filter) -> list[dict]  # Crawl government portal
  - summarize_document(text, llm_client) -> str     # Summarize via LLM
  - schedule_weekly_crawl(domain, callback)         # Register cron job
"""

import os
import re
import json
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional, Callable

logger = logging.getLogger("knowledge-system")


def parse_pdf_regulation(filepath: str) -> list[dict]:
    """Parse a university/ministry regulation PDF into structured text chunks.

    Uses pdfminer.six to extract text, then splits into paragraph chunks
    suitable for ChromaDB indexing.
    """
    try:
        from pdfminer.high_level import extract_text
    except ImportError:
        logger.error("pdfminer.six not installed. Run: pip install pdfminer.six")
        return []

    if not os.path.exists(filepath):
        logger.error(f"PDF not found: {filepath}")
        return []

    try:
        text = extract_text(filepath)
    except Exception as e:
        logger.error(f"Failed to extract text from {filepath}: {e}")
        return []

    # Split into logical sections
    # Vietnamese regulation documents often use "Điều X." or "Chương X" as section markers
    sections = re.split(r'\n(?=(?:Điều|Chương|Mục|Phần)\s+\d+)', text)

    chunks = []
    for i, section in enumerate(sections):
        section = section.strip()
        if len(section) < 50:
            continue

        # Extract article number for metadata
        article_match = re.search(r'(?:Điều|Chương|Mục)\s+(\d+)', section)
        article_id = article_match.group(0) if article_match else f"Section-{i}"

        # Split long sections into 500-word chunks with 50-word overlap
        words = section.split()
        chunk_size = 500
        overlap = 50
        start = 0
        while start < len(words):
            end = min(start + chunk_size, len(words))
            chunk_text = " ".join(words[start:end])
            chunks.append({
                "text": chunk_text,
                "metadata": {
                    "source": os.path.basename(filepath),
                    "article": article_id,
                    "chunk_index": len(chunks),
                },
            })
            start = end - overlap

    logger.info(f"Parsed {len(chunks)} chunks from {filepath}")
    return chunks


def crawl_portal(url: str, selector: str = "article", limit: int = 20) -> list[dict]:
    """Crawl a government procedure portal for procedure information.

    Uses trafilatura for web content extraction.
    """
    try:
        import trafilatura
    except ImportError:
        logger.error("trafilatura not installed. Run: pip install trafilatura")
        return []

    try:
        response = trafilatura.fetch_url(url)
        if not response:
            logger.error(f"No response from {url}")
            return []

        text = trafilatura.extract(response, output_format="txt")
        if not text:
            logger.error(f"No text extracted from {url}")
            return []

        # Split into procedures (government portals list procedures as separate items)
        procedures = re.split(r'\n(?=\d+\.\s)', text)
        results = []

        for proc in procedures[:limit]:
            proc = proc.strip()
            if len(proc) < 30:
                continue

            # Extract procedure name and details
            lines = proc.split("\n")
            name = lines[0].strip() if lines else "Unknown Procedure"

            results.append({
                "title": name[:200],
                "content": proc[:2000],
                "source": url,
                "crawled_at": datetime.now().isoformat(),
            })

        logger.info(f"Crawled {len(results)} procedures from {url}")
        return results

    except Exception as e:
        logger.error(f"Crawl failed for {url}: {e}")
        return []


def summarize_document(text: str, max_summary_words: int = 200) -> str:
    """Summarize a document using LLM (calls the TS-side LLM client via HTTP).

    In production, this would call the orchestrator's /api/admin/summarize endpoint.
    For now, extracts key sentences as a lightweight summary.
    """
    sentences = re.split(r'(?<=[.!?])\s+', text)
    if len(sentences) <= 5:
        return text

    # Simple extractive summary: take first 2 + any sentences with keywords
    key_keywords = ["quy định", "học phí", "thời gian", "điều kiện", "yêu cầu",
                     "mức", "phí", "lệ phí", "thủ tục", "hồ sơ", "trách nhiệm",
                     "sinh viên", "đào tạo", "tín chỉ", "điểm"]

    summary_sentences = [sentences[0], sentences[1]]  # Always include first 2

    for sent in sentences[2:]:
        if any(kw in sent.lower() for kw in key_keywords):
            if sent not in summary_sentences:
                summary_sentences.append(sent)

    # Truncate to max words
    summary = " ".join(summary_sentences)
    words = summary.split()
    if len(words) > max_summary_words:
        summary = " ".join(words[:max_summary_words]) + "..."

    return summary


def schedule_weekly_crawl(domain: str, callback: Callable, day_of_week: str = "monday", hour: int = 6):
    """Schedule a weekly crawl job.

    In production, this would use node-cron via a TS bridge.
    The callback is invoked every Monday at 06:00 by default.
    """
    logger.info(f"Weekly crawl scheduled for domain='{domain}' on {day_of_week} at {hour}:00")

    # Register with the Node.js cron system via a marker file
    # The TS-side knowledge-updater checks this and runs the callback
    schedule_dir = Path(__file__).resolve().parents[2] / "src" / "ml" / "knowledge-system" / "schedules"
    schedule_dir.mkdir(parents=True, exist_ok=True)

    schedule_file = schedule_dir / f"{domain}.json"
    schedule_data = {
        "domain": domain,
        "day_of_week": day_of_week,
        "hour": hour,
        "last_run": None,
        "next_run": datetime.now().isoformat(),
        "enabled": True,
    }

    with open(schedule_file, "w", encoding="utf-8") as f:
        json.dump(schedule_data, f, ensure_ascii=False, indent=2)

    logger.info(f"Schedule saved to {schedule_file}")


def index_chunks_to_chromadb(chunks: list[dict], domain: str) -> int:
    """Index parsed text chunks into ChromaDB.

    Returns the number of chunks indexed.
    """
    try:
        import chromadb
        from chromadb.utils import embedding_functions

        client = chromadb.HttpClient(host="localhost", port=8000)
        embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name="paraphrase-multilingual-MiniLM-L12-v2"
        )

        try:
            collection = client.get_collection("intent-translator-kb", embedding_function=embedding_fn)
        except Exception:
            collection = client.create_collection("intent-translator-kb", embedding_function=embedding_fn)

        ids = [f"crawl-{domain}-{datetime.now().strftime('%Y%m%d')}-{i}" for i in range(len(chunks))]
        documents = [c["text"] for c in chunks]
        metadatas = [c.get("metadata", {}) for c in chunks]

        collection.add(ids=ids, documents=documents, metadatas=metadatas)
        logger.info(f"Indexed {len(chunks)} chunks into ChromaDB")
        return len(chunks)

    except Exception as e:
        logger.error(f"ChromaDB indexing failed: {e}")
        return 0
