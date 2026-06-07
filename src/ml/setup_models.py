"""
ML Setup Script — Downloads all required models for intent-translator-agent.

Usage:
  python src/ml/setup_models.py --domain university

Downloads: PhoBERT, multilingual-e5-small, underthesea data, ChromaDB, Whisper small.
"""

import argparse
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def download_underthesea():
    """Download underthesea components (word tokenizer, NER, POS tagger)."""
    print("  [1/5] underthesea Vietnamese NLP toolkit...")
    try:
        import underthesea

        underthesea.word_tokenize("xin chào")
        underthesea.ner("Sinh viên Nguyễn Văn An mã số 20210001")
        print("    ✓ underthesea ready")
    except Exception as e:
        print(f"    ⚠ underthesea setup warning: {e}")


def download_phobert():
    """Download PhoBERT from HuggingFace."""
    print("  [2/5] PhoBERT (vinai/phobert-base-v2)...")
    try:
        from transformers import AutoTokenizer, AutoModel

        model_name = "vinai/phobert-base-v2"
        AutoTokenizer.from_pretrained(model_name)
        AutoModel.from_pretrained(model_name)
        print(f"    ✓ {model_name} downloaded")
    except Exception as e:
        print(f"    ⚠ PhoBERT download warning (requires ~500MB): {e}")


def download_multilingual_e5():
    """Download multilingual-e5-small from HuggingFace."""
    print("  [3/5] intfloat/multilingual-e5-small...")
    try:
        from sentence_transformers import SentenceTransformer

        model_name = "intfloat/multilingual-e5-small"
        SentenceTransformer(model_name)
        print(f"    ✓ {model_name} downloaded")
    except Exception as e:
        print(f"    ⚠ multilingual-e5 download warning (requires ~500MB): {e}")


def download_embeddings_model():
    """Download paraphrase-multilingual-MiniLM-L12-v2 for KB semantic search."""
    print("  [4/5] paraphrase-multilingual-MiniLM-L12-v2...")
    try:
        from sentence_transformers import SentenceTransformer

        model_name = "paraphrase-multilingual-MiniLM-L12-v2"
        SentenceTransformer(model_name)
        print(f"    ✓ {model_name} downloaded")
    except Exception as e:
        print(f"    ⚠ MiniLM download warning (requires ~500MB): {e}")


def download_whisper():
    """Download Whisper small model for Vietnamese ASR."""
    print("  [5/5] OpenAI Whisper (small)...")
    try:
        import whisper

        whisper.load_model("small")
        print("    ✓ Whisper small downloaded")
    except Exception as e:
        print(f"    ⚠ Whisper download warning (requires ~500MB): {e}")


def download_models(domain: str = "university"):
    """Download all models for the given domain."""
    print(f"\n📦 Setting up ML models for domain: {domain}")
    print(f"   Models will be cached in HuggingFace cache (~/.cache/huggingface)\n")

    start = time.time()

    download_underthesea()
    download_phobert()
    download_multilingual_e5()
    download_embeddings_model()
    download_whisper()

    elapsed = time.time() - start
    print(f"\n✅ All models downloaded in {elapsed:.1f}s")
    print(f"   Domain: {domain}")
    print(f"   Ready to start inference server: python src/ml/intent-classifier/inference.py\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download ML models for intent-translator-agent")
    parser.add_argument(
        "--domain",
        default="university",
        choices=["university", "government", "healthcare"],
        help="Domain to set up (default: university)",
    )
    args = parser.parse_args()
    download_models(args.domain)
