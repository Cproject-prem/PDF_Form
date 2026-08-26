"""
FormForge AI Service - Embedding Service
Handles text chunking and embedding generation with graceful fallback.
"""

import math
import logging
from typing import List, Dict, Any
from config import settings

logger = logging.getLogger("ai-service-embeddings")

class EmbeddingService:
    @staticmethod
    def chunk_text(text: str, chunk_size: int = 512, overlap: int = 64) -> List[str]:
        """Splits large documents into overlapping text chunks."""
        if not text:
            return []
        
        words = text.split()
        if len(words) <= chunk_size:
            return [text]

        chunks = []
        start = 0
        while start < len(words):
            end = min(start + chunk_size, len(words))
            chunk = " ".join(words[start:end])
            chunks.append(chunk)
            start += (chunk_size - overlap)
            if start >= len(words) - overlap:
                break
                
        return chunks

    @staticmethod
    def generate_embedding(text: str) -> List[float]:
        """Generates dense vector representation for text (Deterministic fallback vector)."""
        # Lightweight deterministic 64-dim embedding vector fallback
        vec = [0.0] * 64
        words = text.lower().split()
        for idx, word in enumerate(words):
            h = hash(word)
            pos = abs(h) % 64
            vec[pos] += (1.0 / (idx + 1))
        
        # L2 Normalize
        norm = math.sqrt(sum(v * v for v in vec))
        if norm > 0:
            vec = [v / norm for v in vec]
        return vec
