"""Configuration management for NLP Processor."""

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import List


class Config:
    """Central configuration for the NLP processing service."""
    
    # Weaviate Configuration
    WEAVIATE_HOST_URL = os.getenv("WEAVIATE_HOST_URL", "weaviate")
    WEAVIATE_PORT = os.getenv("WEAVIATE_PORT", "8080")
    WEAVIATE_SECURE = os.getenv("WEAVIATE_SECURE", "false").lower() == "true"
    WEAVIATE_URL = f"{'https' if WEAVIATE_SECURE else 'http'}://{WEAVIATE_HOST_URL}:{WEAVIATE_PORT}"
    
    # Chunking Configuration
    MIN_WORDS_PER_CHUNK = int(os.getenv("MIN_WORDS_PER_CHUNK", "10"))
    MIN_CHARS_PER_CHUNK = int(os.getenv("MIN_CHARS_PER_CHUNK", "50"))
    MAX_WORDS_PER_CHUNK = int(os.getenv("MAX_WORDS_PER_CHUNK", "200"))

    # Sentence-based chunking configuration
    DEFAULT_SENTENCE_CHUNK_SIZE = int(os.getenv("SENTENCE_CHUNK_SIZE", "10"))
    DEFAULT_SENTENCE_OVERLAP = int(os.getenv("SENTENCE_OVERLAP", "5"))
    
    # NER Configuration
    CONFIG_PATH = os.getenv("CONFIG_PATH", "../config.json")
    DEFAULT_NER_LABELS_ENV = os.getenv(
        "NER_LABELS",
        "person,organization,location,date,event,technology",
    )
    DEFAULT_NER_LABELS = [x.strip() for x in DEFAULT_NER_LABELS_ENV.split(",") if x.strip()]
    
    # Claude NER Configuration
    NER_PROVIDER = os.getenv("NER_PROVIDER", "anthropic").strip().lower()
    NER_MODEL = os.getenv("NER_MODEL", "claude-opus-5").strip()
    NER_PROVIDER_API_KEY = os.getenv(
        "NER_PROVIDER_API_KEY",
        os.getenv("ANTHROPIC_API_KEY", ""),
    )
    # Words of transcript sent to the model per request. Wide enough that the
    # model can tell a named entity from a passing pronoun.
    NER_WORDS_PER_WINDOW = int(os.getenv("NER_WORDS_PER_WINDOW", "1200"))
    NER_WINDOW_CONCURRENCY = int(os.getenv("NER_WINDOW_CONCURRENCY", "4"))
    NER_MAX_OUTPUT_TOKENS = int(os.getenv("NER_MAX_OUTPUT_TOKENS", "16000"))
    NER_TIMEOUT_SECONDS = int(os.getenv("NER_TIMEOUT_SECONDS", "120"))
    NER_MAX_RETRIES = int(os.getenv("NER_MAX_RETRIES", "3"))
    # Empty leaves the API's own effort default in place. Lower values cut cost
    # on long transcripts: low | medium | high | xhigh | max
    NER_EFFORT = os.getenv("NER_EFFORT", "").strip()
    MIN_TEXT_LENGTH_FOR_NER = int(os.getenv("MIN_TEXT_LENGTH_FOR_NER", "50"))
    # Single-word surface forms to never treat as entities. The prompt asks the
    # model to skip generic nouns, but a few slip through on every run, so the
    # archive's own noise words are filtered deterministically instead.
    NER_STOPLIST = {
        term.strip().lower()
        for term in os.getenv(
            "NER_STOPLIST",
            "web,website,websites,internet,email,video,audio,software,hardware,"
            "metadata,data,technology,online,digital,computer,computers",
        ).split(",")
        if term.strip()
    }
    
    # HuggingFace Local Embeddings Configuration
    EMBEDDING_MODEL = os.getenv(
        "EMBEDDING_MODEL",
        "sentence-transformers/LaBSE",
    )
    USE_GPU = os.getenv("USE_GPU", "false").lower() == "true"
    EMBEDDING_LOAD_TIMEOUT_SECONDS = int(
        os.getenv("EMBEDDING_LOAD_TIMEOUT_SECONDS", "180")
    )
    
   
    
    @classmethod
    def load_ner_labels(cls) -> List[str]:
        """Load NER labels from config file or environment variables.
        
        Priority order:
        1. config.json -> ner.labels[].id
        2. Environment variable NER_LABELS (comma-separated)
        
        Returns:
            List of NER label strings
        """
        try:
            config_path = Path(cls.CONFIG_PATH)
            if config_path.exists():
                config_data = json.loads(config_path.read_text(encoding="utf-8"))
                labels = [
                    label["id"]
                    for label in config_data.get("ner", {}).get("labels", [])
                    if isinstance(label, dict) and label.get("id")
                ]
                labels = [str(label).strip() for label in labels if str(label).strip()]
                if labels:
                    print(f"[Config] Loaded {len(labels)} NER labels from {cls.CONFIG_PATH}")
                    return labels
        except Exception as e:
            print(f"[Config] Warning: Could not load NER labels from config file: {e}")
        
        return cls.DEFAULT_NER_LABELS
    
    @classmethod
    def print_config(cls):
        """Print current configuration for debugging."""
        print(f"[Config] NER provider: {cls.NER_PROVIDER}")
        print(f"[Config] NER model: {cls.NER_MODEL}")
        print(f"[Config] NER API key configured: {bool(cls.NER_PROVIDER_API_KEY)}")
        print(f"[Config] NER words per window: {cls.NER_WORDS_PER_WINDOW}")
        print(f"[Config] NER window concurrency: {cls.NER_WINDOW_CONCURRENCY}")
        print(f"[Config] NER effort: {cls.NER_EFFORT or '(api default)'}")
        print(f"[Config] Min text length for NER: {cls.MIN_TEXT_LENGTH_FOR_NER}")
        print(f"[Config] NER stoplist terms: {len(cls.NER_STOPLIST)}")
        print(f"[Config] Weaviate URL: {cls.WEAVIATE_URL}")
        print(f"[Config] Embedding model: {cls.EMBEDDING_MODEL}")
        print(f"[Config] Use GPU: {cls.USE_GPU}")
        print(f"[Config] Embedding load timeout (s): {cls.EMBEDDING_LOAD_TIMEOUT_SECONDS}")


@lru_cache(maxsize=1)
def get_ner_labels() -> List[str]:
    """Load NER labels only for code paths that actually run entity extraction."""
    labels = Config.load_ner_labels()
    print(f"[Config] Using {len(labels)} NER labels: {labels}")
    return labels
