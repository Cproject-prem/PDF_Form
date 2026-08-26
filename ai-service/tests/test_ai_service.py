"""
FormForge AI Service - Automated Unit & Fault Tolerance Tests
"""

import sys
import os

# Ensure ai-service root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from fastapi.testclient import TestClient
from main import app
from health import get_system_health
from embeddings.embedding_service import EmbeddingService
from rag.vector_store import VectorStore

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "ai_service" in data

def test_readiness_endpoint():
    response = client.get("/ready")
    assert response.status_code in (200, 503)

def test_embedding_service():
    chunks = EmbeddingService.chunk_text("Hello world testing chunking strategy", chunk_size=5, overlap=1)
    assert len(chunks) >= 1
    vec = EmbeddingService.generate_embedding("Sample query text")
    assert len(vec) == 64

def test_vector_store_fallback(tmp_path):
    v_store = VectorStore(storage_path=str(tmp_path))
    ok = v_store.add_document("doc1", "test.txt", "Solar plant maintenance procedure text.")
    assert ok is True
    results = v_store.query("maintenance", top_k=1)
    assert len(results) >= 1

def test_chat_endpoint_fault_tolerance():
    payload = {
        "messages": [{"role": "user", "content": "Hello"}],
        "provider": "local",
        "use_rag": False
    }
    response = client.post("/ai/chat", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "reply" in data
    assert "success" in data
