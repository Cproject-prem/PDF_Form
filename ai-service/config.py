"""
FormForge AI Service - Configuration Module
Isolated auxiliary microservice configuration.
"""

import os
from pydantic import BaseModel, Field

class AIServiceSettings(BaseModel):
    # Microservice Server Settings
    SERVICE_NAME: str = Field(default="formforge-ai-service")
    HOST: str = Field(default=os.environ.get("AI_HOST", "0.0.0.0"))
    PORT: int = Field(default=int(os.environ.get("AI_PORT", "9000")))
    DEBUG: bool = Field(default=os.environ.get("AI_DEBUG", "false").lower() == "true")

    # AI Feature Flags & Modes
    AI_ENABLED: bool = Field(default=os.environ.get("AI_ENABLED", "true").lower() == "true")
    AI_PROVIDER: str = Field(default=os.environ.get("AI_PROVIDER", "local"))  # "local" (Ollama/Gemma)
    ENABLE_LOCAL_AI: bool = Field(default=os.environ.get("ENABLE_LOCAL_AI", "true").lower() == "true")

    # Local LLM & Ollama Configuration
    OLLAMA_URL: str = Field(default=os.environ.get("OLLAMA_URL", "http://localhost:11434"))
    OLLAMA_MODEL: str = Field(default=os.environ.get("OLLAMA_MODEL", "gemma"))
    OLLAMA_TIMEOUT_SECONDS: float = Field(default=float(os.environ.get("OLLAMA_TIMEOUT_SECONDS", "25.0")))


    # RAG & Vector Database Settings
    VECTOR_DB_TYPE: str = Field(default=os.environ.get("VECTOR_DB_TYPE", "embedded"))  # "embedded" or "chroma"
    VECTOR_DB_PATH: str = Field(default=os.environ.get("VECTOR_DB_PATH", "./data/vector_db"))
    EMBEDDING_MODEL: str = Field(default=os.environ.get("EMBEDDING_MODEL", "all-MiniLM-L6-v2"))
    CHUNK_SIZE: int = Field(default=int(os.environ.get("CHUNK_SIZE", "512")))
    CHUNK_OVERLAP: int = Field(default=int(os.environ.get("CHUNK_OVERLAP", "64")))
    MAX_RAG_DOCUMENTS: int = Field(default=int(os.environ.get("MAX_RAG_DOCUMENTS", "5")))

    # Resource & Concurrency Controls
    MAX_CONCURRENT_REQUESTS: int = Field(default=int(os.environ.get("MAX_CONCURRENT_REQUESTS", "10")))
    REQUEST_TIMEOUT_SECONDS: float = Field(default=float(os.environ.get("REQUEST_TIMEOUT_SECONDS", "30.0")))
    CONNECT_TIMEOUT_SECONDS: float = Field(default=float(os.environ.get("CONNECT_TIMEOUT_SECONDS", "5.0")))

settings = AIServiceSettings()
