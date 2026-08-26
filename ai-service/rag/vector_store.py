"""
FormForge AI Service - RAG & Vector Store Module
Handles knowledge document indexing and context retrieval. Completely isolated from core app.
"""

import os
import json
import logging
from typing import List, Dict, Any, Optional
from config import settings
from embeddings.embedding_service import EmbeddingService

logger = logging.getLogger("ai-service-rag")

class VectorStore:
    def __init__(self, storage_path: str = None):
        self.storage_path = storage_path or settings.VECTOR_DB_PATH
        self.documents: List[Dict[str, Any]] = []
        self._ensure_storage()

    def _ensure_storage(self):
        os.makedirs(self.storage_path, exist_ok=True)
        self.index_file = os.path.join(self.storage_path, "index.json")
        self.load_index()

    def load_index(self):
        try:
            if os.path.exists(self.index_file):
                with open(self.index_file, "r", encoding="utf-8") as f:
                    self.documents = json.load(f)
        except Exception as e:
            logger.error(f"Failed to load vector index: {str(e)}")
            self.documents = []

    def save_index(self):
        try:
            with open(self.index_file, "w", encoding="utf-8") as f:
                json.dump(self.documents, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save vector index: {str(e)}")

    def add_document(self, doc_id: str, filename: str, text_content: str, metadata: Dict[str, Any] = None) -> bool:
        """Chunks and indexes document text into vector store."""
        try:
            chunks = EmbeddingService.chunk_text(text_content, settings.CHUNK_SIZE, settings.CHUNK_OVERLAP)
            for idx, chunk in enumerate(chunks):
                vec = EmbeddingService.generate_embedding(chunk)
                self.documents.append({
                    "doc_id": doc_id,
                    "chunk_id": f"{doc_id}_{idx}",
                    "filename": filename,
                    "text": chunk,
                    "vector": vec,
                    "metadata": metadata or {}
                })
            self.save_index()
            return True
        except Exception as e:
            logger.error(f"Failed to add document to vector store: {str(e)}")
            return False

    def query(self, query_text: str, top_k: int = 3) -> List[Dict[str, Any]]:
        """Retrieves most relevant document chunks for query."""
        if not self.documents or not query_text:
            return []

        try:
            q_vec = EmbeddingService.generate_embedding(query_text)
            scored_chunks = []

            for doc in self.documents:
                d_vec = doc.get("vector", [])
                if len(d_vec) == len(q_vec):
                    # Cosine similarity (vectors are normalized)
                    score = sum(a * b for a, b in zip(q_vec, d_vec))
                    scored_chunks.append({
                        "doc_id": doc.get("doc_id"),
                        "filename": doc.get("filename"),
                        "text": doc.get("text"),
                        "score": score,
                        "metadata": doc.get("metadata", {})
                    })

            scored_chunks.sort(key=lambda x: x["score"], reverse=True)
            return scored_chunks[:top_k]
        except Exception as e:
            logger.error(f"Vector search failed: {str(e)}")
            return []

vector_store = VectorStore()
