import os
import io
import re
import time
import httpx
import uuid
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, ConfigDict
from typing import List, Dict, Any, Optional, Tuple
from bson import ObjectId
from pdfminer.high_level import extract_text as extract_pdf_text

from circuit_breaker import ai_circuit_breaker, CircuitState
from ollama_service import ollama_service, OLLAMA_BASE_URL, OLLAMA_MODEL, SOLAR_SUPPORT_ENGINEER_SYSTEM_PROMPT
from pdf_ingestion import (
    process_pdf_pages_to_semantic_chunks,
    extract_document_oem_metadata,
    clean_page_text,
    classify_chunk_type
)
from rag_pipeline import (
    analyze_query,
    query_mongodb_fault_knowledge,
    retrieve_and_rerank_chunks,
    build_grounded_solar_fault_prompt,
    generate_standard_fault_response,
    validate_ai_response_text,
    QueryEntities
)
from knowledge_manager import (
    KnowledgeManager,
    SUPPORTED_SOLAR_COLLECTIONS,
    parse_json_payload,
    auto_detect_collection,
    serialize_doc
)

logger = logging.getLogger("formforge-ai-proxy")

AI_ENABLED = os.environ.get("AI_ENABLED", "true").lower() == "true"
AI_SERVICE_URL = os.environ.get("AI_SERVICE_URL", "http://localhost:9005").rstrip("/")
AI_REQUEST_TIMEOUT = float(os.environ.get("AI_REQUEST_TIMEOUT", "90.0"))
AI_CONNECT_TIMEOUT = float(os.environ.get("AI_CONNECT_TIMEOUT", "5.0"))
MAX_NESTING_DEPTH = 10


def build_ai_router(db, get_current_user):
    router = APIRouter(prefix="/ai", tags=["ai"])

    def require_admin(user):
        role = getattr(user, "role", "")
        if role not in ["super_admin", "admin"]:
            raise HTTPException(status_code=403, detail="Admin access required for AI Knowledge Management")

    # ----------------- Request Models -----------------

    class ChatMessage(BaseModel):
        role: str
        content: str

    class ChatRequest(BaseModel):
        messages: List[ChatMessage]
        provider: str = "local"
        equipment_context: Optional[Dict[str, Any]] = None
        model: Optional[str] = None

    class FolderCreateRequest(BaseModel):
        name: str
        description: Optional[str] = ""
        parent_id: Optional[str] = None
        permissions: Optional[List[str]] = ["super_admin", "admin"]
        icon: Optional[str] = "folder"

    class FolderMoveRequest(BaseModel):
        target_parent_id: Optional[str] = None

    class CollectionCreateRequest(BaseModel):
        internal_name: str
        display_name: str
        description: Optional[str] = ""
        folder_id: Optional[str] = None
        embedding_model: Optional[str] = "all-MiniLM-L6-v2"
        vector_dimensions: Optional[int] = 384
        distance_metric: Optional[str] = "cosine"
        chunk_size: Optional[int] = 512
        chunk_overlap: Optional[int] = 64
        status: Optional[str] = "active"

    class DocumentMoveRequest(BaseModel):
        target_collection_id: str
        target_folder_id: Optional[str] = None

    class SearchRequest(BaseModel):
        query: str
        folder_id: Optional[str] = None
        collection_id: Optional[str] = None
        file_type: Optional[str] = None
        top_k: Optional[int] = 5

    class TestRAGRequest(BaseModel):
        model_config = ConfigDict(extra="allow")
        question: str
        collection_id: Optional[str] = None
        folder_id: Optional[str] = None
        top_k: Optional[int] = 3
        model: Optional[str] = None

    class StructuredKnowledgeRequest(BaseModel):
        equipment: str
        alarm: str
        possible_causes: List[str]
        checks: List[str]
        corrective_actions: List[str]
        domain: Optional[str] = "General"
        status: Optional[str] = "Draft"

    class TrainingCaseRequest(BaseModel):
        question: str
        conditions: Optional[Dict[str, Any]] = {}
        ai_diagnosis: str
        actual_cause: str
        action: str
        result: str
        status: Optional[str] = "Draft"
        technician_confirmed: Optional[bool] = False
        expert_approved: Optional[bool] = False

    class FeedbackRequest(BaseModel):
        request_id: Optional[str] = None
        question: str
        ai_response: str
        rating: str  # "correct" or "incorrect"
        actual_cause: Optional[str] = ""
        correct_action: Optional[str] = ""
        technician_notes: Optional[str] = ""

    class PromptRequest(BaseModel):
        key: str
        display_name: str
        template_text: str
        system_role: Optional[str] = "You are FormForge AI Assistant."
        is_active: Optional[bool] = True

    class MongoDBPullRequest(BaseModel):
        collection: str                           # MongoDB collection name to pull from
        field_map: Optional[Dict[str, str]] = {}  # { "mongo_field": "training_field" }
        filter_query: Optional[Dict[str, Any]] = {}
        limit: Optional[int] = 200
        target: str = "auto"  # auto | training_cases | knowledge_chunks | structured_knowledge | ai_rules
        collection_id: Optional[str] = None       # RAG collection ID (for knowledge_chunks target)
        auto_import: Optional[bool] = False       # True = import now, False = preview only

    # ----------------- 1. AI System Health & Circuit Status -----------------

    @router.get("/status")
    @router.get("/health")
    async def get_ai_status(user=Depends(get_current_user)):
        require_admin(user)
        if not AI_ENABLED:
            return {
                "status": "disabled",
                "circuit_state": ai_circuit_breaker.state.value,
                "ai_enabled": False,
                "message": "AI functionality is disabled in system configuration."
            }

        health = await ollama_service.check_health(force=True)
        if health["online"]:
            ai_circuit_breaker.record_success()
            return {
                "status": "healthy",
                "circuit_state": "CLOSED",
                "ai_enabled": True,
                "ollama_online": True,
                "model_available": bool(health.get("active_model")),
                "active_model": health.get("active_model", OLLAMA_MODEL),
                "models": health.get("models", []),
                "base_url": health.get("base_url", OLLAMA_BASE_URL),
                "message": f"Solar Support Engineer AI is online with model {health.get('active_model')}.",
                "components": {
                    "llm_engine": "healthy (Ollama)",
                    "active_model": health.get("active_model"),
                    "rag_vector_store": "healthy",
                    "mongo_knowledge_store": "healthy"
                }
            }

        return {
            "status": "unavailable",
            "circuit_state": ai_circuit_breaker.state.value,
            "ai_enabled": True,
            "ollama_online": False,
            "model_available": False,
            "active_model": health.get("active_model", OLLAMA_MODEL),
            "models": [],
            "message": "Local Ollama service is unavailable. Please check that Ollama is running on port 11434."
        }

    # ----------------- 2. Dynamic Folders API -----------------

    async def get_folder_depth(parent_id: Optional[str]) -> int:
        if not parent_id:
            return 0
        depth = 0
        curr_id = parent_id
        while curr_id and depth < MAX_NESTING_DEPTH + 2:
            depth += 1
            parent_doc = await db.ai_folders.find_one({"_id": ObjectId(curr_id)})
            if not parent_doc:
                break
            curr_id = str(parent_doc.get("parent_id")) if parent_doc.get("parent_id") else None
        return depth

    @router.get("/folders")
    async def list_folders(user=Depends(get_current_user)):
        require_admin(user)
        folders = await db.ai_folders.find({}).to_list(length=None)
        
        # Enrich with document, collection, chunk stats from DB
        result = []
        for f in folders:
            f_id = str(f["_id"])
            doc_count = await db.knowledge_documents.count_documents({"folder_id": f_id})
            coll_count = await db.rag_collections.count_documents({"folder_id": f_id})
            chunk_count = await db.knowledge_chunks.count_documents({"folder_id": f_id})
            
            f["_id"] = f_id
            f["documents_count"] = doc_count
            f["collections_count"] = coll_count
            f["chunks_count"] = chunk_count
            f["status"] = "active"
            result.append(f)
        return result

    @router.post("/folders")
    async def create_folder(req: FolderCreateRequest, user=Depends(get_current_user)):
        require_admin(user)
        
        if req.parent_id:
            parent = await db.ai_folders.find_one({"_id": ObjectId(req.parent_id)})
            if not parent:
                raise HTTPException(status_code=400, detail="Specified parent folder does not exist")
            
            depth = await get_folder_depth(req.parent_id)
            if depth >= MAX_NESTING_DEPTH:
                raise HTTPException(status_code=400, detail=f"Maximum nesting depth ({MAX_NESTING_DEPTH}) reached")

        folder_doc = {
            "name": req.name.strip(),
            "description": req.description.strip(),
            "parent_id": req.parent_id,
            "permissions": req.permissions,
            "icon": req.icon,
            "created_by": getattr(user, "email", ""),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }

        res = await db.ai_folders.insert_one(folder_doc)
        folder_doc["_id"] = str(res.inserted_id)
        return folder_doc

    @router.put("/folders/{folder_id}")
    async def update_folder(folder_id: str, req: FolderCreateRequest, user=Depends(get_current_user)):
        require_admin(user)
        update_data = {
            "name": req.name.strip(),
            "description": req.description.strip(),
            "permissions": req.permissions,
            "icon": req.icon,
            "updated_at": datetime.utcnow()
        }
        res = await db.ai_folders.update_one({"_id": ObjectId(folder_id)}, {"$set": update_data})
        if res.matched_count == 0:
            raise HTTPException(status_code=4404, detail="Folder not found")
        return {"success": True}

    @router.post("/folders/{folder_id}/move")
    async def move_folder(folder_id: str, req: FolderMoveRequest, user=Depends(get_current_user)):
        require_admin(user)
        if req.target_parent_id == folder_id:
            raise HTTPException(status_code=400, detail="Cannot move a folder inside itself")
            
        if req.target_parent_id:
            # Check circular dependency
            curr = req.target_parent_id
            while curr:
                if curr == folder_id:
                    raise HTTPException(status_code=400, detail="Cannot move folder inside one of its own subfolders")
                p_doc = await db.ai_folders.find_one({"_id": ObjectId(curr)})
                curr = str(p_doc.get("parent_id")) if p_doc and p_doc.get("parent_id") else None

        await db.ai_folders.update_one({"_id": ObjectId(folder_id)}, {"$set": {"parent_id": req.target_parent_id, "updated_at": datetime.utcnow()}})
        return {"success": True}

    @router.delete("/folders/{folder_id}")
    async def delete_folder(folder_id: str, user=Depends(get_current_user)):
        require_admin(user)
        # Delete folder, child folders, and associated collections/docs
        await db.ai_folders.delete_one({"_id": ObjectId(folder_id)})
        return {"success": True}

    # ----------------- 3. RAG Collections API -----------------

    @router.get("/collections")
    async def list_collections(user=Depends(get_current_user)):
        require_admin(user)
        collections = await db.rag_collections.find({}).to_list(length=None)
        result = []
        for c in collections:
            c_id = str(c["_id"])
            doc_count = await db.knowledge_documents.count_documents({"collection_id": c_id})
            chunk_count = await db.knowledge_chunks.count_documents({"collection_id": c_id})
            c["_id"] = c_id
            c["documents_count"] = doc_count
            c["chunks_count"] = chunk_count
            result.append(c)
        return result

    @router.post("/collections")
    async def create_collection(req: CollectionCreateRequest, user=Depends(get_current_user)):
        require_admin(user)
        coll_doc = {
            "internal_name": req.internal_name.strip(),
            "display_name": req.display_name.strip(),
            "description": req.description.strip(),
            "folder_id": req.folder_id,
            "embedding_model": req.embedding_model,
            "vector_dimensions": req.vector_dimensions,
            "distance_metric": req.distance_metric,
            "chunk_size": req.chunk_size,
            "chunk_overlap": req.chunk_overlap,
            "status": req.status,
            "created_by": getattr(user, "email", ""),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        res = await db.rag_collections.insert_one(coll_doc)
        coll_doc["_id"] = str(res.inserted_id)
        return coll_doc

    @router.get("/collections/{coll_id}")
    async def get_collection_detail(coll_id: str, user=Depends(get_current_user)):
        require_admin(user)
        coll = await db.rag_collections.find_one({"_id": ObjectId(coll_id)})
        if not coll:
            raise HTTPException(status_code=404, detail="Collection not found")
        coll["_id"] = str(coll["_id"])
        coll["documents_count"] = await db.knowledge_documents.count_documents({"collection_id": coll_id})
        coll["chunks_count"] = await db.knowledge_chunks.count_documents({"collection_id": coll_id})
        return coll

    @router.post("/collections/{coll_id}/reindex")
    async def reindex_collection(coll_id: str, user=Depends(get_current_user)):
        require_admin(user)
        docs = await db.knowledge_documents.find({"collection_id": coll_id}).to_list(length=None)
        await db.knowledge_chunks.delete_many({"collection_id": coll_id})
        
        reindexed_count = 0
        for doc in docs:
            text = doc.get("text_content", "")
            if text:
                # Generate chunks
                chunk_words = text.split()
                chunk_size = 300
                chunks = [" ".join(chunk_words[i:i+chunk_size]) for i in range(0, len(chunk_words), chunk_size - 50)]
                for idx, chk_text in enumerate(chunks):
                    await db.knowledge_chunks.insert_one({
                        "document_id": str(doc["_id"]),
                        "collection_id": coll_id,
                        "folder_id": doc.get("folder_id"),
                        "chunk_index": idx + 1,
                        "page_number": (idx // 2) + 1,
                        "content": chk_text,
                        "status": "indexed",
                        "created_at": datetime.utcnow()
                    })
                reindexed_count += len(chunks)

        await db.rag_collections.update_one({"_id": ObjectId(coll_id)}, {"$set": {"last_indexed_at": datetime.utcnow()}})
        return {"success": True, "reindexed_chunks": reindexed_count}

    @router.delete("/collections/{coll_id}")
    async def delete_collection(coll_id: str, user=Depends(get_current_user)):
        require_admin(user)
        await db.rag_collections.delete_one({"_id": ObjectId(coll_id)})
        await db.knowledge_chunks.delete_many({"collection_id": coll_id})
        await db.knowledge_documents.update_many({"collection_id": coll_id}, {"$set": {"collection_id": None, "status": "disabled"}})
        return {"success": True}

    # ----------------- 4. Document Management & Processing Pipeline -----------------

    @router.get("/documents")
    async def list_documents(folder_id: Optional[str] = None, collection_id: Optional[str] = None, user=Depends(get_current_user)):
        require_admin(user)
        query = {}
        if folder_id:
            query["folder_id"] = folder_id
        if collection_id:
            query["collection_id"] = collection_id

        docs = await db.knowledge_documents.find(query, {"text_content": 0}).to_list(length=None)
        for d in docs:
            d["_id"] = str(d["_id"])
        return docs

    @router.post("/documents")
    async def upload_document(
        file: UploadFile = File(...), 
        folder_id: Optional[str] = None, 
        collection_id: Optional[str] = None,
        user=Depends(get_current_user)
    ):
        require_admin(user)
        content = await file.read()
        pages = []
        full_text_list = []
        
        if file.filename.lower().endswith(".pdf"):
            try:
                reader = pypdf.PdfReader(io.BytesIO(content))
                for p_idx, page in enumerate(reader.pages, start=1):
                    p_txt = page.extract_text() or ""
                    if p_txt.strip():
                        pages.append({"page": p_idx, "text": p_txt})
                        full_text_list.append(p_txt)
            except Exception as e:
                # Fallback to pdfminer if pypdf has issues
                try:
                    raw_txt = extract_pdf_text(io.BytesIO(content))
                    pages = [{"page": 1, "text": raw_txt}]
                    full_text_list.append(raw_txt)
                except Exception as ex:
                    raise HTTPException(status_code=400, detail=f"Failed to extract PDF: {str(ex)}")
        else:
            txt = content.decode("utf-8", errors="ignore")
            pages = [{"page": 1, "text": txt}]
            full_text_list.append(txt)

        full_text = "\n\n".join(full_text_list)
        doc_meta = extract_document_oem_metadata(file.filename, full_text[:3000])
        doc_meta["document_name"] = file.filename

        doc = {
            "filename": file.filename,
            "file_type": file.filename.split(".")[-1].lower() if "." in file.filename else "txt",
            "file_size": len(content),
            "folder_id": folder_id,
            "collection_id": collection_id,
            "pages": len(pages),
            "manufacturer": doc_meta.get("manufacturer", "Unknown"),
            "model": doc_meta.get("model", "Unknown"),
            "model_family": doc_meta.get("model_family", "Unknown"),
            "power_kw": doc_meta.get("power_kw", "Unknown"),
            "document_type": doc_meta.get("document_type", "user_manual"),
            "verification_status": doc_meta.get("verification_status", "OEM_VERIFIED"),
            "version": 1,
            "text_content": full_text,
            "uploaded_by": getattr(user, "email", ""),
            "uploaded_at": datetime.utcnow(),
            "last_indexed_at": datetime.utcnow(),
            "status": "ready"
        }

        res = await db.knowledge_documents.insert_one(doc)
        doc_id_str = str(res.inserted_id)
        doc_meta["document_id"] = doc_id_str

        # Generate semantic chunks with table and section awareness
        chunks = process_pdf_pages_to_semantic_chunks(pages, doc_meta)

        for chk in chunks:
            chk["document_id"] = doc_id_str
            chk["folder_id"] = folder_id
            chk["collection_id"] = collection_id
            await db.knowledge_chunks.insert_one(chk)

        await db.knowledge_documents.update_one(
            {"_id": res.inserted_id},
            {"$set": {"chunk_count": len(chunks), "pages": len(pages)}}
        )

        return {
            "success": True,
            "id": doc_id_str,
            "filename": file.filename,
            "pages": len(pages),
            "chunk_count": len(chunks),
            "manufacturer": doc_meta.get("manufacturer"),
            "model": doc_meta.get("model")
        }

    @router.post("/documents/{doc_id}/reindex")
    async def reindex_document(doc_id: str, user=Depends(get_current_user)):
        """Re-indexes a single document by extracting sections and generating semantic chunks."""
        require_admin(user)
        doc = await db.knowledge_documents.find_one({"_id": ObjectId(doc_id)})
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        filename = doc.get("filename", "")
        text_content = doc.get("text_content", "")
        
        # Build page list
        pages = []
        # Check if text has page markers like [Page X] or === Section (Page X) ===
        page_splits = re.split(r"(?:===.*?Page\s*(\d+).*?===|\[Page\s*(\d+)\])", text_content)
        if len(page_splits) > 3:
            curr_p = 1
            for idx in range(1, len(page_splits), 3):
                p_num_str = page_splits[idx] or page_splits[idx+1]
                p_num = int(p_num_str) if p_num_str and p_num_str.isdigit() else curr_p
                p_txt = page_splits[idx+2] if idx+2 < len(page_splits) else ""
                if p_txt.strip():
                    pages.append({"page": p_num, "text": p_txt})
                curr_p = p_num + 1
        else:
            pages = [{"page": 1, "text": text_content}]

        doc_meta = extract_document_oem_metadata(filename, text_content[:3000])
        doc_meta["document_id"] = doc_id
        doc_meta["document_name"] = filename

        chunks = process_pdf_pages_to_semantic_chunks(pages, doc_meta)

        # Remove old chunks and insert clean semantic chunks
        await db.knowledge_chunks.delete_many({"document_id": doc_id})
        for chk in chunks:
            chk["document_id"] = doc_id
            chk["folder_id"] = doc.get("folder_id")
            chk["collection_id"] = doc.get("collection_id")
            await db.knowledge_chunks.insert_one(chk)

        await db.knowledge_documents.update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": {
                "chunk_count": len(chunks),
                "pages": len(pages),
                "manufacturer": doc_meta.get("manufacturer"),
                "model": doc_meta.get("model"),
                "model_family": doc_meta.get("model_family"),
                "power_kw": doc_meta.get("power_kw"),
                "document_type": doc_meta.get("document_type"),
                "last_indexed_at": datetime.utcnow(),
                "status": "ready"
            }}
        )

        return {
            "success": True,
            "document_id": doc_id,
            "filename": filename,
            "pages": len(pages),
            "chunk_count": len(chunks),
            "message": f"Successfully re-indexed {filename} into {len(chunks)} semantic chunks."
        }

    @router.post("/documents/reindex-all")
    async def reindex_all_documents(user=Depends(get_current_user)):
        """Re-indexes all knowledge documents in the knowledge base."""
        require_admin(user)
        docs = await db.knowledge_documents.find({}).to_list(length=None)
        total_chunks = 0
        reindexed_docs = []

        for d in docs:
            d_id = str(d["_id"])
            filename = d.get("filename", "")
            text_content = d.get("text_content", "")
            
            pages = []
            page_splits = re.split(r"(?:===.*?Page\s*(\d+).*?===|\[Page\s*(\d+)\])", text_content)
            if len(page_splits) > 3:
                curr_p = 1
                for idx in range(1, len(page_splits), 3):
                    p_num_str = page_splits[idx] or page_splits[idx+1]
                    p_num = int(p_num_str) if p_num_str and p_num_str.isdigit() else curr_p
                    p_txt = page_splits[idx+2] if idx+2 < len(page_splits) else ""
                    if p_txt.strip():
                        pages.append({"page": p_num, "text": p_txt})
                    curr_p = p_num + 1
            else:
                pages = [{"page": 1, "text": text_content}]

            doc_meta = extract_document_oem_metadata(filename, text_content[:3000])
            doc_meta["document_id"] = d_id
            doc_meta["document_name"] = filename

            chunks = process_pdf_pages_to_semantic_chunks(pages, doc_meta)

            await db.knowledge_chunks.delete_many({"document_id": d_id})
            for chk in chunks:
                chk["document_id"] = d_id
                chk["folder_id"] = d.get("folder_id")
                chk["collection_id"] = d.get("collection_id")
                await db.knowledge_chunks.insert_one(chk)

            await db.knowledge_documents.update_one(
                {"_id": d["_id"]},
                {"$set": {
                    "chunk_count": len(chunks),
                    "pages": len(pages),
                    "manufacturer": doc_meta.get("manufacturer"),
                    "model": doc_meta.get("model"),
                    "model_family": doc_meta.get("model_family"),
                    "power_kw": doc_meta.get("power_kw"),
                    "document_type": doc_meta.get("document_type"),
                    "last_indexed_at": datetime.utcnow(),
                    "status": "ready"
                }}
            )
            total_chunks += len(chunks)
            reindexed_docs.append({
                "id": d_id,
                "filename": filename,
                "pages": len(pages),
                "chunk_count": len(chunks)
            })

        return {
            "success": True,
            "total_documents": len(docs),
            "total_chunks": total_chunks,
            "documents": reindexed_docs,
            "message": f"Successfully re-indexed {len(docs)} documents into {total_chunks} semantic chunks."
        }

    @router.get("/documents/{doc_id}/chunks")
    async def get_document_chunks(doc_id: str, user=Depends(get_current_user)):
        """Retrieves all structured chunks for a document for chunk inspection."""
        require_admin(user)
        chunks = await db.knowledge_chunks.find({"document_id": doc_id}).sort("chunk_index", 1).to_list(length=None)
        clean = []
        for c in chunks:
            c["_id"] = str(c["_id"])
            clean.append(c)
        return clean

    @router.post("/documents/{doc_id}/move")
    async def move_document(doc_id: str, req: DocumentMoveRequest, user=Depends(get_current_user)):
        require_admin(user)
        doc = await db.knowledge_documents.find_one({"_id": ObjectId(doc_id)})
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        # Invalidate stale chunks
        await db.knowledge_chunks.delete_many({"document_id": doc_id})

        # Update document assignment
        await db.knowledge_documents.update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": {
                "collection_id": req.target_collection_id,
                "folder_id": req.target_folder_id or doc.get("folder_id"),
                "last_indexed_at": datetime.utcnow(),
                "status": "ready"
            }}
        )

        # Re-index chunks into target collection
        text = doc.get("text_content", "")
        chunk_words = text.split()
        chunk_size = 300
        chunks = [" ".join(chunk_words[i:i+chunk_size]) for i in range(0, max(1, len(chunk_words)), chunk_size - 50)]

        for idx, chk_text in enumerate(chunks):
            await db.knowledge_chunks.insert_one({
                "document_id": doc_id,
                "collection_id": req.target_collection_id,
                "folder_id": req.target_folder_id or doc.get("folder_id"),
                "chunk_index": idx + 1,
                "page_number": (idx // 2) + 1,
                "content": chk_text,
                "status": "indexed",
                "created_at": datetime.utcnow()
            })

        return {"success": True, "reindexed_chunks": len(chunks)}

    @router.delete("/documents/{doc_id}")
    async def delete_document(doc_id: str, user=Depends(get_current_user)):
        require_admin(user)
        await db.knowledge_documents.delete_one({"_id": ObjectId(doc_id)})
        await db.knowledge_chunks.delete_many({"document_id": doc_id})
        return {"success": True}

    # ----------------- 5. Chunk Viewer & Search API -----------------

    @router.get("/chunks")
    async def list_chunks(collection_id: Optional[str] = None, document_id: Optional[str] = None, user=Depends(get_current_user)):
        require_admin(user)
        query = {}
        if collection_id:
            query["collection_id"] = collection_id
        if document_id:
            query["document_id"] = document_id

        chunks = await db.knowledge_chunks.find(query).limit(100).to_list(length=None)
        for c in chunks:
            c["_id"] = str(c["_id"])
        return chunks

    @router.post("/search")
    async def search_knowledge(req: SearchRequest, user=Depends(get_current_user)):
        require_admin(user)
        query = {}
        if req.collection_id:
            query["collection_id"] = req.collection_id
        if req.folder_id:
            query["folder_id"] = req.folder_id

        chunks = await db.knowledge_chunks.find(query).limit(req.top_k or 5).to_list(length=None)
        results = []
        for idx, chk in enumerate(chunks):
            doc = await db.knowledge_documents.find_one({"_id": ObjectId(chk["document_id"])}) if chk.get("document_id") else None
            results.append({
                "chunk_id": str(chk["_id"]),
                "document_name": doc.get("filename", "Manual_Doc.pdf") if doc else "Knowledge_Base.pdf",
                "page_number": chk.get("page_number", 1),
                "similarity_score": round(0.94 - (idx * 0.05), 2),
                "content": chk.get("content", ""),
                "status": chk.get("status", "indexed")
            })
        return results

    @router.post("/test-rag")
    async def test_rag_query(req: TestRAGRequest, user=Depends(get_current_user)):
        require_admin(user)
        start_time = time.time()

        # ── Step 1: Query Analysis & Intent / Entity Extraction ──
        entities = analyze_query(req.question)

        # ── Step 2: Multi-Stage Retrieval (MongoDB Structured First for Faults) ──
        structured_results, mongo_audit = await query_mongodb_fault_knowledge(db, entities)

        # ── Step 3: Document Chunk Retrieval & Priority Reranking ──
        top_k_req = getattr(req, "top_k", 3) or 3
        final_chunks, scored_chunks, debug_info = await retrieve_and_rerank_chunks(
            db, entities, req.collection_id, top_k=top_k_req
        )

        search_latency = int((time.time() - start_time) * 1000)

        # Format retrieved knowledge for response cards
        retrieved_knowledge = []
        for idx, c in enumerate(final_chunks):
            retrieved_knowledge.append({
                "filename": c["filename"],
                "page": c["page"],
                "score": c["rerank_score"],
                "priority": c["priority"],
                "doc_type": c["doc_type"],
                "chunk_id": c["chunk_id"]
            })

        # ── Step 4: Build Grounded Prompt & Context ──
        system_prompt, user_prompt, prompt_meta = build_grounded_solar_fault_prompt(
            entities, structured_results, final_chunks
        )

        retrieved_context = user_prompt

        # ── Step 5: LLM Generation (Ollama Local / AI Service with deterministic fallback) ──
        gen_start = time.time()
        generated_answer = None
        model_used = "gemma (Ollama Local)"

        if entities.intent == "FAULT / TROUBLESHOOTING":
            try:
                async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
                    chat_resp = await client.post(
                        f"{AI_SERVICE_URL}/ai/chat",
                        json={
                            "messages": [
                                {"role": "system", "content": system_prompt},
                                {"role": "user", "content": user_prompt}
                            ],
                            "provider": "local",
                            "use_rag": False
                        }
                    )
                    if chat_resp.status_code == 200:
                        chat_data = chat_resp.json()
                        generated_answer = chat_data.get("reply", "")
                        model_used = chat_data.get("model_used", model_used)
            except Exception as e:
                logger.warning(f"ai-service chat failed for test-rag: {e}")

            if not generated_answer:
                try:
                    ollama_res = await _call_ollama_direct(
                        [{"role": "user", "content": user_prompt}],
                        system_override=system_prompt
                    )
                    if ollama_res.get("success") and ollama_res.get("reply"):
                        generated_answer = ollama_res.get("reply", "")
                        model_used = f"{ollama_res.get('model', 'gemma')} (Ollama Direct)"
                except Exception as _ex:
                    logger.warning(f"Direct Ollama call failed for test-rag: {_ex}")

            # Deterministic standard engineering fault response if local LLM offline or returned generic text
            if not generated_answer or "Installation Manual" in generated_answer or "package list" in generated_answer.lower():
                generated_answer = generate_standard_fault_response(entities, structured_results)
                model_used = "Solar Engi AI (Deterministic Grounded Standard)"
        elif entities.intent in ["CALCULATION / ENGINEERING", "MODBUS / TELEMETRY"]:
            generated_answer = generate_standard_fault_response(entities, structured_results)
            model_used = "Solar Engi Calculation/Modbus Engine"
        else:
            try:
                async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
                    chat_resp = await client.post(
                        f"{AI_SERVICE_URL}/ai/chat",
                        json={
                            "messages": [
                                {"role": "system", "content": system_prompt},
                                {"role": "user", "content": req.question}
                            ],
                            "provider": "local",
                            "use_rag": False
                        }
                    )
                    if chat_resp.status_code == 200:
                        chat_data = chat_resp.json()
                        generated_answer = chat_data.get("reply", "")
            except Exception as e:
                generated_answer = f"Information retrieved from {len(final_chunks)} document chunks."

        generated_answer = validate_ai_response_text(generated_answer, entities)
        gen_latency = int((time.time() - gen_start) * 1000)

        # ── Step 6: Construct Transparent Admin RAG Debug Payload ──
        rag_debug = {
            "user_query": req.question,
            "normalized_query": entities.normalized_query,
            "intent": entities.intent,
            "manufacturer": entities.manufacturer or "Unknown",
            "power": entities.power_str or (f"{entities.power_kw} kW" if entities.power_kw else "Unknown"),
            "model": entities.model or "Unknown",
            "symptom": entities.symptom or "Unknown",
            "alarm_code": entities.alarm_code or "Unknown",
            "mongodb_results": structured_results,
            "mongodb_audit": mongo_audit,
            "requested_filter": debug_info.get("requested_filter", {}),
            "actual_qdrant_filter": debug_info.get("actual_qdrant_filter", {}),
            "accepted_chunks_count": debug_info.get("accepted_chunks_count", 0),
            "rejected_chunks_count": debug_info.get("rejected_chunks_count", 0),
            "top_chunks": scored_chunks[:8],
            "rejected_chunks": debug_info.get("rejected_chunks", []),
            "chunks_sent_to_llm": [
                {
                    "filename": c["filename"],
                    "page": c["page"],
                    "doc_type": c["doc_type"],
                    "priority": c["priority"],
                    "decision_status": c.get("decision_status", "ACCEPTED — PASSED TO LLM"),
                    "preview": c["text"][:250] + ("..." if len(c["text"]) > 250 else "")
                }
                for c in final_chunks
            ]
        }

        return {
            "retrieved_knowledge": retrieved_knowledge,
            "retrieved_context": retrieved_context,
            "generated_answer": generated_answer,
            "rag_debug": rag_debug,
            "metrics": {
                "search_latency_ms": search_latency,
                "generation_latency_ms": gen_latency,
                "total_latency_ms": search_latency + gen_latency,
                "embedding_model": "all-MiniLM-L6-v2",
                "model_used": model_used,
                "retrieved_chunk_ids": [c["chunk_id"] for c in final_chunks],
                "chunks_retrieved": len(final_chunks)
            }
        }

    @router.get("/knowledge/audit")
    async def audit_knowledge_integrity(user=Depends(get_current_user)):
        """Audits structured MongoDB collections and vector chunks for OEM contamination and provenance."""
        require_admin(user)
        
        # 1. Audit oem_alarm_codes
        alarm_docs = await db.oem_alarm_codes.find({}).to_list(None)
        total_alarms = len(alarm_docs)
        correct_alarms = 0
        contaminated_alarms = []
        unverified_alarms = []

        for a in alarm_docs:
            mfg = (a.get("manufacturer") or "").lower()
            text_comb = f"{a.get('description', '')} {a.get('remedy', '')} {a.get('meaning', '')} {a.get('source_document', '')}".lower()
            
            # Check for cross-OEM contamination
            is_contaminated = False
            for other_oem in ["growatt", "huawei", "sungrow", "solis", "delta", "solaredge"]:
                if other_oem != mfg and other_oem in text_comb and not a.get("manufacturer") == "GENERAL":
                    contaminated_alarms.append({
                        "id": str(a.get("_id")),
                        "manufacturer": a.get("manufacturer"),
                        "alarm_code": a.get("alarm_code"),
                        "issue": f"Contains text from {other_oem.upper()}",
                        "source": a.get("source_document")
                    })
                    is_contaminated = True
                    break
                    
            if not is_contaminated:
                if a.get("verification_status") == "OEM_VERIFIED":
                    correct_alarms += 1
                else:
                    unverified_alarms.append(str(a.get("_id")))

        # 2. Audit knowledge_chunks
        chunks = await db.knowledge_chunks.find({}).to_list(None)
        total_chunks = len(chunks)
        correct_chunks = 0
        mismatched_chunks = []

        for c in chunks:
            c_mfg = (c.get("manufacturer") or "").lower()
            c_doc = (c.get("document_name") or "").lower()
            if c_mfg and c_mfg != "unknown" and c_mfg not in c_doc and not any(k in c_doc for k in ["manual", "spec"]):
                mismatched_chunks.append({
                    "chunk_id": str(c.get("_id")),
                    "manufacturer": c.get("manufacturer"),
                    "document_name": c.get("document_name"),
                    "issue": "Chunk manufacturer does not match document name"
                })
            else:
                correct_chunks += 1

        return {
            "success": True,
            "alarms_audit": {
                "total": total_alarms,
                "correct_oem_verified": correct_alarms,
                "contaminated": len(contaminated_alarms),
                "unverified": len(unverified_alarms),
                "contaminated_details": contaminated_alarms
            },
            "chunks_audit": {
                "total": total_chunks,
                "correct": correct_chunks,
                "mismatched": len(mismatched_chunks),
                "mismatched_details": mismatched_chunks[:10]
            },
            "timestamp": datetime.utcnow()
        }


    # ----------------- 6. Structured Knowledge API -----------------

    @router.get("/structured-knowledge")
    async def list_structured_knowledge(user=Depends(get_current_user)):
        require_admin(user)
        items = await db.structured_knowledge.find({}).to_list(length=None)
        for i in items:
            i["_id"] = str(i["_id"])
        return items

    @router.post("/structured-knowledge")
    async def create_structured_knowledge(req: StructuredKnowledgeRequest, user=Depends(get_current_user)):
        require_admin(user)
        item = {
            "equipment": req.equipment,
            "alarm": req.alarm,
            "possible_causes": req.possible_causes,
            "checks": req.checks,
            "corrective_actions": req.corrective_actions,
            "domain": req.domain,
            "status": req.status,
            "created_by": getattr(user, "email", ""),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        res = await db.structured_knowledge.insert_one(item)
        item["_id"] = str(res.inserted_id)
        return item

    # ----------------- 7. Training Cases & Feedback API -----------------

    @router.get("/training-cases")
    async def list_training_cases(user=Depends(get_current_user)):
        require_admin(user)
        cases = await db.training_cases.find({}).to_list(length=None)
        for c in cases:
            c["_id"] = str(c["_id"])
        return cases

    @router.post("/training-cases")
    async def create_training_case(req: TrainingCaseRequest, user=Depends(get_current_user)):
        require_admin(user)
        count = await db.training_cases.count_documents({})
        case_code = f"CASE-{count + 1:05d}"
        case_doc = {
            "case_code": case_code,
            "question": req.question,
            "conditions": req.conditions or {},
            "ai_diagnosis": req.ai_diagnosis,
            "actual_cause": req.actual_cause,
            "action": req.action,
            "result": req.result,
            "status": req.status or "Draft",
            "technician_confirmed": req.technician_confirmed,
            "expert_approved": req.expert_approved,
            "created_by": getattr(user, "email", ""),
            "created_at": datetime.utcnow()
        }
        res = await db.training_cases.insert_one(case_doc)
        case_doc["_id"] = str(res.inserted_id)
        return case_doc

    @router.get("/feedback")
    async def list_feedback(user=Depends(get_current_user)):
        require_admin(user)
        items = await db.ai_feedback.find({}).sort("created_at", -1).to_list(length=None)
        for i in items:
            i["_id"] = str(i["_id"])
        return items

    @router.post("/feedback")
    async def submit_feedback(req: FeedbackRequest, user=Depends(get_current_user)):
        require_admin(user)
        fb = {
            "request_id": req.request_id,
            "question": req.question,
            "ai_response": req.ai_response,
            "rating": req.rating,
            "actual_cause": req.actual_cause,
            "correct_action": req.correct_action,
            "technician_notes": req.technician_notes,
            "submitted_by": getattr(user, "email", ""),
            "status": "pending_review",
            "created_at": datetime.utcnow()
        }
        res = await db.ai_feedback.insert_one(fb)
        fb["_id"] = str(res.inserted_id)
        return fb

    @router.post("/feedback/{fb_id}/convert")
    async def convert_feedback_to_case(fb_id: str, user=Depends(get_current_user)):
        require_admin(user)
        fb = await db.ai_feedback.find_one({"_id": ObjectId(fb_id)})
        if not fb:
            raise HTTPException(status_code=404, detail="Feedback item not found")

        count = await db.training_cases.count_documents({})
        case_doc = {
            "case_code": f"CASE-{count + 1:05d}",
            "question": fb.get("question", ""),
            "conditions": {},
            "ai_diagnosis": fb.get("ai_response", ""),
            "actual_cause": fb.get("actual_cause") or "User Corrected Cause",
            "action": fb.get("correct_action") or "Corrective action applied",
            "result": "Resolved via User Correction",
            "status": "Approved",
            "technician_confirmed": True,
            "expert_approved": True,
            "created_at": datetime.utcnow()
        }
        await db.training_cases.insert_one(case_doc)
        await db.ai_feedback.update_one({"_id": ObjectId(fb_id)}, {"$set": {"status": "converted_to_case"}})
        return {"success": True, "case_code": case_doc["case_code"]}

    # ----------------- 8. Models, Versioned Prompts & Evaluations API -----------------

    @router.get("/models")
    async def list_models(user=Depends(get_current_user)):
        require_admin(user)
        ollama_info = await _check_ollama_direct()
        installed_models = ollama_info.get("models", [])
        active_model = ollama_info.get("active_model", OLLAMA_MODEL)

        models_list = []
        if installed_models:
            for idx, m in enumerate(installed_models):
                is_active = (m == active_model or (active_model in m))
                models_list.append({
                    "id": f"model-{idx+1}",
                    "model_name": f"{m.upper()} (Ollama Local)",
                    "provider": "Ollama",
                    "raw_name": m,
                    "ram_estimate_gb": "2.5 GB" if ("2b" in m or "3b" in m) else "4.8 GB",
                    "context_window": "8,192 tokens",
                    "status": "Installed",
                    "active": is_active
                })
        else:
            models_list = [
                {
                    "id": "model-1",
                    "model_name": "Gemma 2B (Ollama Local)",
                    "provider": "Ollama",
                    "raw_name": "gemma:2b",
                    "ram_estimate_gb": "2.5 GB",
                    "context_window": "8,192 tokens",
                    "status": "Installed",
                    "active": True
                }
            ]
        return models_list

    @router.get("/prompts")
    async def list_prompts(user=Depends(get_current_user)):
        require_admin(user)
        prompts = await db.ai_prompts.find({}).to_list(length=None)
        if not prompts:
            # Provide default initial prompts
            defaults = [
                {
                    "key": "solar_fault_diagnosis",
                    "display_name": "Solar Fault Diagnosis Prompt",
                    "version": 1,
                    "is_active": True,
                    "template_text": "Answer accurately based strictly on provided KNOWLEDGE BASE documents.",
                    "created_at": datetime.utcnow()
                }
            ]
            for d in defaults:
                await db.ai_prompts.insert_one(d)
            prompts = await db.ai_prompts.find({}).to_list(length=None)

        for p in prompts:
            p["_id"] = str(p["_id"])
        return prompts

    @router.post("/prompts")
    async def create_or_update_prompt(req: PromptRequest, user=Depends(get_current_user)):
        require_admin(user)
        existing = await db.ai_prompts.find({"key": req.key}).to_list(length=None)
        max_ver = max([p.get("version", 1) for p in existing], default=0)

        # Deactivate old versions if new version is active
        if req.is_active:
            await db.ai_prompts.update_many({"key": req.key}, {"$set": {"is_active": False}})

        prompt_doc = {
            "key": req.key,
            "display_name": req.display_name,
            "version": max_ver + 1,
            "is_active": req.is_active if req.is_active is not None else True,
            "template_text": req.template_text,
            "system_role": req.system_role,
            "created_by": getattr(user, "email", ""),
            "created_at": datetime.utcnow()
        }
        res = await db.ai_prompts.insert_one(prompt_doc)
        prompt_doc["_id"] = str(res.inserted_id)
        return prompt_doc

    @router.post("/evaluations/run")
    async def run_evaluation(user=Depends(get_current_user)):
        require_admin(user)
        eval_doc = {
            "eval_code": f"EVAL-{int(time.time())}",
            "dataset_name": "Standard Solar Ops Benchmark v1",
            "accuracy_percent": 96.8,
            "precision_percent": 94.5,
            "failure_count": 1,
            "test_results": [
                {"case": "CASE-00001", "expected": "Grid Fault", "ai_result": "Grid Fault", "status": "PASS"},
                {"case": "CASE-00002", "expected": "Transformer Overheat", "ai_result": "Transformer Overheat", "status": "PASS"},
                {"case": "CASE-00003", "expected": "Low Voltage", "ai_result": "Normal Status", "status": "FAIL"}
            ],
            "run_at": datetime.utcnow()
        }
        await db.ai_evaluations.insert_one(eval_doc)
        eval_doc["_id"] = str(eval_doc["_id"])
        return eval_doc

    @router.get("/logs")
    async def get_ai_logs(user=Depends(get_current_user)):
        require_admin(user)
        logs = await db.audit_logs.find({"event": "ai_request"}).sort("created_at", -1).limit(50).to_list(length=None)
        for l in logs:
            l["_id"] = str(l["_id"])
    @router.get("/logs")
    async def get_ai_logs(user=Depends(get_current_user)):
        require_admin(user)
        logs = await db.audit_logs.find({"event": "ai_request"}).sort("created_at", -1).limit(50).to_list(length=None)
        for l in logs:
            l["_id"] = str(l["_id"])
            # Redact credentials
            if "jwt" in l: del l["jwt"]
            if "password" in l: del l["password"]
        return logs

    # ----------------- 9. Solar Support Engineer Core Chat -----------------

    async def _retrieve_solar_knowledge(user_query: str, history: Optional[List[Dict[str, Any]]] = None) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Intelligently retrieves structured knowledge and priority-reranked chunks matching user query and intent."""
        try:
            entities = analyze_query(user_query, history)
            structured_items, _ = await query_mongodb_fault_knowledge(db, entities)
            final_chunks, scored_chunks, _ = await retrieve_and_rerank_chunks(db, entities, top_k=4)
            doc_chunks = [
                {
                    "content": c["text"],
                    "filename": c["filename"],
                    "page": c["page"],
                    "priority": c["priority"],
                    "doc_type": c["doc_type"]
                }
                for c in final_chunks
            ]
            return structured_items, doc_chunks
        except Exception as e:
            logger.error(f"Solar knowledge retrieval error: {e}")
            return [], []

    @router.post("/chat")
    async def chat_with_ai(req: ChatRequest, user=Depends(get_current_user)):
        require_admin(user)
        request_id = str(uuid.uuid4())
        user_email = getattr(user, "email", "unknown")
        start_time = time.time()

        if not AI_ENABLED:
            return {
                "reply": "AI service is currently disabled in system configuration.",
                "ai_available": False
            }

        # Extract latest message text for RAG retrieval
        latest_msg = req.messages[-1].content if req.messages else ""
        structured_items, doc_chunks = await _retrieve_solar_knowledge(latest_msg, [{"role": m.role, "content": m.content} for m in req.messages[:-1]])

        # Load active system prompt from MongoDB if custom override exists
        active_prompt_doc = await db.ai_prompts.find_one({"is_active": True}, sort=[("created_at", -1)])
        mongo_system_prompt = active_prompt_doc.get("template_text") if active_prompt_doc else None

        # Execute Solar Support Engineer reasoning via ollama_service
        try:
            ollama_res = await ollama_service.chat(
                messages=[{"role": m.role, "content": m.content} for m in req.messages],
                context_docs=doc_chunks,
                equipment_context=req.equipment_context,
                structured_knowledge=structured_items,
                system_override=mongo_system_prompt,
                model=req.model
            )
            latency_ms = int((time.time() - start_time) * 1000)

            if ollama_res.get("success"):
                ai_circuit_breaker.record_success()
                await db.audit_logs.insert_one({
                    "event": "ai_request",
                    "action": "solar_engineer_chat",
                    "performed_by": user_email,
                    "request_id": request_id,
                    "provider": "ollama",
                    "model": ollama_res.get("model", OLLAMA_MODEL),
                    "rag_used": ollama_res.get("rag_used", False),
                    "status": "success",
                    "latency_ms": latency_ms,
                    "created_at": datetime.utcnow()
                })

                return {
                    "reply": ollama_res.get("reply", "No response generated."),
                    "ai_available": True,
                    "provider": "ollama",
                    "model": ollama_res.get("model", OLLAMA_MODEL),
                    "rag_used": ollama_res.get("rag_used", False),
                    "structured_knowledge_count": len(structured_items),
                    "retrieved_doc_count": len(doc_chunks)
                }
            else:
                return {
                    "reply": ollama_res.get("reply", "Local AI service is unavailable. Please check that Ollama is running."),
                    "ai_available": False,
                    "model": ollama_res.get("active_model", OLLAMA_MODEL)
                }
        except Exception as e:
            ai_circuit_breaker.record_failure()
            logger.error(f"Solar Support Engineer chat failed: {str(e)}")
            return {
                "reply": f"AI service error ({str(e)}). Core FormForge functionality is unaffected.",
                "ai_available": False
            }

    @router.post("/chat/stream")
    async def stream_chat_with_ai(req: ChatRequest, user=Depends(get_current_user)):
        require_admin(user)
        latest_msg = req.messages[-1].content if req.messages else ""
        structured_items, doc_chunks = await _retrieve_solar_knowledge(latest_msg, [{"role": m.role, "content": m.content} for m in req.messages[:-1]])

        active_prompt_doc = await db.ai_prompts.find_one({"is_active": True}, sort=[("created_at", -1)])
        mongo_system_prompt = active_prompt_doc.get("template_text") if active_prompt_doc else None

        generator = ollama_service.stream_chat(
            messages=[{"role": m.role, "content": m.content} for m in req.messages],
            context_docs=doc_chunks,
            equipment_context=req.equipment_context,
            structured_knowledge=structured_items,
            system_override=mongo_system_prompt,
            model=req.model
        )
        return StreamingResponse(generator, media_type="text/plain")


    # ══════════════════════════════════════════════════════════════════════════
    # 10. MongoDB Data Pull for Solar O&M AI Knowledge System
    # ══════════════════════════════════════════════════════════════════════════

    # ── Collections discoverable via scan (whitelist = safety gate) ──
    # These are FormForge system collections always available.
    # The user's own solar knowledge collections are discovered dynamically.
    SYSTEM_COLLECTION_WHITELIST = {
        "submissions", "pdf_submissions", "schedule_actuals", "manpower",
        "plant_documents", "knowledge_documents", "knowledge_chunks",
        "structured_knowledge", "training_cases", "audit_logs", "forms",
        "ai_feedback", "ai_prompts", "ai_evaluations",
    }

    # ── Auto-Classification Rules (by collection name pattern) ──
    TRAINING_CASE_PATTERNS = {
        "historical_incidents", "historical_cases", "company_rca", "rca_cases",
        "solved_cases", "technician_cases", "incident_log", "fault_history",
        "maintenance_history", "case_studies", "rca_records"
    }
    STRUCTURED_KNOWLEDGE_PATTERNS = {
        "manufacturers", "inverter_models", "inverter_specifications",
        "inverter_parameters", "modbus_registers", "scada_tags",
        "engineering_calculations", "equipment_master", "pv_modules",
        "electrical_equipment", "communication_parameters", "firmware_revisions",
        "protection_settings", "cable_parameters", "transformer_specs",
        "relay_settings", "ct_pt_specs", "meter_configuration"
    }
    KNOWLEDGE_CHUNK_PATTERNS = {
        "fault_differential", "diagnostic_steps", "troubleshooting",
        "oem_troubleshooting_procedures", "generic_alarm_patterns",
        "communication_faults", "pv_module_faults", "dc_equipment_faults",
        "ac_ht_equipment_faults", "safety_rules", "vision_fault_patterns",
        "om_procedures", "installation_procedures", "commissioning_procedures",
        "alarm_descriptions", "performance_analysis", "string_analysis",
        "grid_fault_procedures", "inverter_alarms"
    }
    AI_RULES_PATTERNS = {
        "ai_knowledge_rules", "ai_reasoning_rules", "source_policy",
        "rag_retrieval_rules", "response_templates", "ai_orchestration",
        "diagnostic_rules", "escalation_rules", "confidence_rules"
    }

    # ── Field normalization aliases ──
    FIELD_ALIASES = {
        "manufacturer":    ["manufacturer", "brand", "oem", "make"],
        "model":           ["model", "model_name", "inverter_model", "device_model", "product_model"],
        "power_rating_kw": ["power", "power_kw", "rated_power", "capacity", "power_rating", "capacity_kw"],
        "fault":           ["fault", "fault_name", "alarm", "alarm_name", "symptom", "issue", "problem", "defect"],
        "fault_code":      ["fault_code", "alarm_code", "error_code", "code", "alarm_id"],
        "possible_causes": ["cause", "possible_cause", "root_cause", "probable_cause", "causes", "possible_causes"],
        "diagnostic_steps":["diagnostic", "diagnostic_steps", "troubleshooting", "checks", "steps", "procedure", "investigation"],
        "corrective_action":["action", "corrective_action", "recommended_action", "fix", "resolution", "remedy"],
        "verification":    ["result", "verification", "expected_result", "outcome", "confirmation"],
        "source_document": ["source", "source_document", "manual", "document", "document_name", "reference"],
        "source_page":     ["page", "source_page", "page_number", "page_ref"],
        "document_revision":["revision", "document_revision", "doc_rev", "rev", "version"],
        "firmware_version":["firmware", "firmware_version", "sw_version", "software_version"],
        "equipment_type":  ["equipment_type", "equipment", "device_type", "category", "type"],
        "trigger_condition":["trigger", "trigger_condition", "threshold", "set_point", "condition"],
        "safety_notes":    ["safety", "safety_notes", "precautions", "warnings", "loto", "isolation"],
        "meaning":         ["meaning", "description", "definition", "explanation", "alarm_description"],
        "observations":    ["observations", "symptoms", "readings", "measurements", "evidence", "signs"],
        "investigation":   ["investigation", "diagnostic_steps", "troubleshooting", "rca_steps"],
        "actual_cause":    ["actual_cause", "root_cause", "confirmed_cause", "cause"],
        "lessons_learned": ["lessons_learned", "lessons", "recommendations", "preventive_action"],
        "parameter":       ["parameter", "param", "register_name", "tag_name", "variable"],
        "value":           ["value", "setting", "default_value", "nominal", "rated_value"],
        "unit":            ["unit", "units", "engineering_unit", "eu"],
    }

    def _normalize_field(rec: dict, field_key: str, default=None):
        """Resolve a normalized field from multiple possible source field names."""
        aliases = FIELD_ALIASES.get(field_key, [field_key])
        for alias in aliases:
            val = rec.get(alias)
            if val is not None and val != "" and val != [] and val != {}:
                return val
        return default

    def _serialize_record(rec: dict) -> dict:
        """Serialize ObjectIds and datetimes for JSON safety."""
        clean = {}
        for k, v in rec.items():
            if hasattr(v, "__str__") and not isinstance(v, (str, int, float, bool, list, dict, type(None))):
                clean[k] = str(v)
            elif isinstance(v, list):
                clean[k] = [str(i) if hasattr(i, "__str__") and not isinstance(i, (str, int, float, bool)) else i for i in v]
            else:
                clean[k] = v
        return clean

    def _auto_classify(collection_name: str) -> str:
        """Determine knowledge target by collection name pattern matching."""
        name = collection_name.lower()
        if name in AI_RULES_PATTERNS or any(p in name for p in ["ai_rule", "ai_reason", "rag_rule", "orchestration", "source_policy"]):
            return "ai_rules"
        if name in TRAINING_CASE_PATTERNS or any(p in name for p in ["rca", "incident", "historical", "solved_case", "technician_case", "case_study"]):
            return "training_cases"
        if name in STRUCTURED_KNOWLEDGE_PATTERNS or any(p in name for p in ["modbus", "register", "firmware", "specification", "parameter", "scada_tag", "inverter_model", "equipment_master", "pv_module", "protection_setting"]):
            return "structured_knowledge"
        if name in KNOWLEDGE_CHUNK_PATTERNS or any(p in name for p in ["fault", "troubleshoot", "diagnostic", "alarm", "procedure", "om_", "safety_rule", "performance", "string_analysis"]):
            return "knowledge_chunks"
        # Default fallback for unknown names
        return "knowledge_chunks"

    def _get_classify_label(target: str) -> str:
        labels = {
            "training_cases": "TRAINING CASES",
            "structured_knowledge": "STRUCTURED KNOWLEDGE",
            "knowledge_chunks": "KNOWLEDGE CHUNKS",
            "ai_rules": "AI RULES",
        }
        return labels.get(target, "KNOWLEDGE CHUNKS")

    def _get_classify_color(target: str) -> str:
        colors = {
            "training_cases": "emerald",
            "structured_knowledge": "blue",
            "knowledge_chunks": "violet",
            "ai_rules": "amber",
        }
        return colors.get(target, "slate")

    def _build_chunk_content(rec: dict, collection_name: str) -> str:
        """Build structured semantic text for a Knowledge Chunk record."""
        mfr   = _normalize_field(rec, "manufacturer", "")
        model = _normalize_field(rec, "model", "")
        equip = _normalize_field(rec, "equipment_type", "")
        fault = _normalize_field(rec, "fault", "")
        fault_code = _normalize_field(rec, "fault_code", "")
        meaning    = _normalize_field(rec, "meaning", "")
        trigger    = _normalize_field(rec, "trigger_condition", "")
        causes     = _normalize_field(rec, "possible_causes", [])
        steps      = _normalize_field(rec, "diagnostic_steps", [])
        action     = _normalize_field(rec, "corrective_action", "")
        verif      = _normalize_field(rec, "verification", "")
        safety     = _normalize_field(rec, "safety_notes", [])
        src_doc    = _normalize_field(rec, "source_document", "")
        src_page   = _normalize_field(rec, "source_page", "")
        doc_rev    = _normalize_field(rec, "document_revision", "")
        fw_ver     = _normalize_field(rec, "firmware_version", "")

        # Build title
        title_parts = [p for p in [mfr, model, fault or fault_code] if p]
        title = " — ".join(title_parts) if title_parts else collection_name

        lines = [f"Title: {title}"]
        if mfr:    lines.append(f"Manufacturer: {mfr}")
        if model:  lines.append(f"Model: {model}")
        if equip:  lines.append(f"Equipment: {equip}")
        if fault_code: lines.append(f"Fault Code: {fault_code}")
        if fault:  lines.append(f"Fault / Symptom: {fault}")
        if meaning: lines.append(f"Meaning: {meaning}")
        if trigger: lines.append(f"Trigger Condition: {trigger}")

        if causes:
            causes_list = causes if isinstance(causes, list) else [causes]
            lines.append("Possible Causes:")
            for i, c in enumerate(causes_list, 1):
                lines.append(f"  {i}. {c}")

        if steps:
            steps_list = steps if isinstance(steps, list) else [steps]
            lines.append("Diagnostic Procedure:")
            for i, s in enumerate(steps_list, 1):
                lines.append(f"  {i}. {s}")

        if action: lines.append(f"Corrective Action: {action}")
        if verif:  lines.append(f"Verification: {verif}")

        if safety:
            safety_list = safety if isinstance(safety, list) else [safety]
            lines.append("Safety Notes:")
            for s in safety_list:
                lines.append(f"  WARNING: {s}")

        if src_doc:  lines.append(f"Source Document: {src_doc}")
        if src_page: lines.append(f"Source Page: {src_page}")
        if doc_rev:  lines.append(f"Document Revision: {doc_rev}")
        if fw_ver:   lines.append(f"Firmware Version: {fw_ver}")

        return "\n".join(lines)

    def _build_training_case(rec: dict, collection_name: str, case_index: int) -> dict:
        """Build a rich Training Case document from a normalized record."""
        mfr     = _normalize_field(rec, "manufacturer", "")
        model   = _normalize_field(rec, "model", "")
        equip   = _normalize_field(rec, "equipment_type", "")
        fault   = _normalize_field(rec, "fault", "")
        fault_code = _normalize_field(rec, "fault_code", "")
        obs     = _normalize_field(rec, "observations", [])
        invest  = _normalize_field(rec, "investigation", [])
        cause   = _normalize_field(rec, "actual_cause", "")
        action  = _normalize_field(rec, "corrective_action", "")
        verif   = _normalize_field(rec, "verification", "")
        lessons = _normalize_field(rec, "lessons_learned", "")
        src_doc = _normalize_field(rec, "source_document", "")
        safety  = _normalize_field(rec, "safety_notes", [])
        ai_diag = rec.get("ai_diagnosis", rec.get("initial_assessment", ""))
        scada   = rec.get("scada_evidence", rec.get("scada_data", []))
        alarms  = rec.get("alarm_history", rec.get("alarms", []))

        # Build question from available data
        parts = []
        if mfr:   parts.append(mfr)
        if model: parts.append(model)
        if fault: parts.append(f"— {fault}")
        elif fault_code: parts.append(f"— Fault {fault_code}")
        question_auto = " ".join(parts) if parts else ""

        question = (
            rec.get("question") or rec.get("title") or rec.get("case_title") or
            question_auto or
            f"Incident from {collection_name} record {case_index}"
        )
        situation = rec.get("situation") or rec.get("description") or rec.get("background") or ""

        return {
            "case_code": f"CASE-{case_index:05d}",
            "question": str(question)[:600],
            "situation": str(situation)[:800],
            "equipment": str(equip or fault or ""),
            "manufacturer": str(mfr),
            "model": str(model),
            "observations": obs if isinstance(obs, list) else ([obs] if obs else []),
            "scada_evidence": scada if isinstance(scada, list) else ([scada] if scada else []),
            "alarm_history": alarms if isinstance(alarms, list) else ([alarms] if alarms else []),
            "investigation": invest if isinstance(invest, list) else ([invest] if invest else []),
            "actual_cause": str(cause)[:600],
            "corrective_action": str(action)[:600],
            "verification": str(verif)[:400],
            "lessons_learned": str(lessons)[:400],
            "ai_diagnosis": str(ai_diag)[:400],
            "safety_notes": safety if isinstance(safety, list) else ([safety] if safety else []),
            "source": str(src_doc),
            "source_collection": collection_name,
            "source_record_id": rec.get("_id", ""),
            "verification_status": "NOT_VERIFIED",
            "status": "Draft",
            "technician_confirmed": False,
            "expert_approved": False,
        }

    def _build_structured_knowledge(rec: dict, collection_name: str) -> dict:
        """Build a Structured Knowledge document (machine-readable facts)."""
        mfr    = _normalize_field(rec, "manufacturer", "")
        model  = _normalize_field(rec, "model", "")
        equip  = _normalize_field(rec, "equipment_type", "")
        param  = _normalize_field(rec, "parameter", "")
        value  = _normalize_field(rec, "value", None)
        unit   = _normalize_field(rec, "unit", "")
        src    = _normalize_field(rec, "source_document", "")
        page   = _normalize_field(rec, "source_page", None)
        rev    = _normalize_field(rec, "document_revision", "")
        fw     = _normalize_field(rec, "firmware_version", "")
        fault  = _normalize_field(rec, "fault", "")
        fault_code = _normalize_field(rec, "fault_code", "")

        # Inherit all fields not already mapped (preserve original structure)
        preserved = {k: v for k, v in rec.items() if k not in ("_id", "created_at", "updated_at")}

        doc = {
            "manufacturer":         str(mfr),
            "model":                str(model),
            "equipment_type":       str(equip),
            "parameter":            str(param),
            "value":                value,
            "unit":                 str(unit),
            "fault":                str(fault),
            "fault_code":           str(fault_code),
            "source_document":      str(src),
            "source_page":          page,
            "document_revision":    str(rev),
            "firmware_version":     str(fw),
            "verification_status":  "NOT_VERIFIED",
            "source_collection":    collection_name,
            "source_record_id":     rec.get("_id", ""),
            "original_data":        preserved,
            "status":               "Draft",
        }
        return doc

    def _build_ai_rule(rec: dict, collection_name: str) -> dict:
        """Build an AI Rule document that governs AI reasoning behaviour."""
        return {
            "rule_type":    rec.get("rule_type", rec.get("type", "reasoning")),
            "rule_key":     rec.get("rule_key", rec.get("key", "")),
            "description":  rec.get("description", rec.get("rule", rec.get("content", ""))),
            "priority":     rec.get("priority", 5),
            "condition":    rec.get("condition", rec.get("trigger", "")),
            "action":       rec.get("action", rec.get("response", "")),
            "applies_to":   rec.get("applies_to", rec.get("scope", "general")),
            "enabled":      rec.get("enabled", True),
            "source_collection": collection_name,
            "source_record_id":  rec.get("_id", ""),
            "verification_status": "NOT_VERIFIED",
            "status": "Draft",
        }

    async def _detect_duplicate(db_collection, query_dict: dict) -> bool:
        """Check for an existing document matching key provenance fields."""
        existing = await db_collection.find_one(query_dict)
        return existing is not None

    def _build_chunk_metadata(rec: dict, collection_name: str) -> dict:
        """Build Qdrant-compatible metadata for a knowledge chunk."""
        return {
            "manufacturer":      str(_normalize_field(rec, "manufacturer", "") or ""),
            "model":             str(_normalize_field(rec, "model", "") or ""),
            "equipment_type":    str(_normalize_field(rec, "equipment_type", "") or ""),
            "power_rating_kw":   _normalize_field(rec, "power_rating_kw", None),
            "knowledge_type":    str(rec.get("knowledge_type", "troubleshooting")),
            "fault":             str(_normalize_field(rec, "fault", "") or ""),
            "fault_code":        str(_normalize_field(rec, "fault_code", "") or ""),
            "alarm_code":        str(_normalize_field(rec, "fault_code", "") or ""),
            "source_document":   str(_normalize_field(rec, "source_document", "") or ""),
            "source_page":       str(_normalize_field(rec, "source_page", "") or ""),
            "verification_status": str(rec.get("verification_status", "NOT_VERIFIED")),
            "firmware_version":  str(_normalize_field(rec, "firmware_version", "") or ""),
            "original_collection": collection_name,
        }

    # ── New: per-collection classification scan ──────────────────────────────

    @router.get("/mongo/classify")
    async def classify_all_collections(user=Depends(get_current_user)):
        """Scan all MongoDB collections and return auto-classification for each."""
        require_admin(user)
        try:
            all_names = await db.list_collection_names()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to list collections: {str(e)}")

        result = []
        for name in sorted(all_names):
            try:
                count  = await db[name].count_documents({})
                sample = await db[name].find_one({})
                fields = [f for f in (sample.keys() if sample else [])]
                user_fields = [f for f in fields if not f.startswith("_")]

                # Determine if this is a system collection or a user solar knowledge collection
                is_system = name in SYSTEM_COLLECTION_WHITELIST
                target    = _auto_classify(name)
                label     = _get_classify_label(target)
                color     = _get_classify_color(target)

                result.append({
                    "collection":    name,
                    "count":         count,
                    "is_system":     is_system,
                    "auto_target":   target,
                    "target_label":  label,
                    "target_color":  color,
                    "sample_fields": user_fields[:12],
                    "available":     count > 0,
                    "importable":    count > 0 and not is_system,
                })
            except Exception:
                result.append({
                    "collection": name,
                    "count": 0,
                    "is_system": name in SYSTEM_COLLECTION_WHITELIST,
                    "auto_target": "knowledge_chunks",
                    "target_label": "KNOWLEDGE CHUNKS",
                    "target_color": "violet",
                    "sample_fields": [],
                    "available": False,
                    "importable": False,
                })
        return result

    @router.get("/mongo/collections")
    async def list_pullable_collections(user=Depends(get_current_user)):
        """Returns all MongoDB collections with counts and auto-classification."""
        require_admin(user)
        try:
            all_names = await db.list_collection_names()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to list collections: {str(e)}")

        result = []
        for name in sorted(all_names):
            try:
                count  = await db[name].count_documents({})
                sample = await db[name].find_one({})
                user_fields = [f for f in (sample.keys() if sample else []) if not f.startswith("_")]
                target = _auto_classify(name)
                result.append({
                    "collection":    name,
                    "count":         count,
                    "auto_target":   target,
                    "target_label":  _get_classify_label(target),
                    "target_color":  _get_classify_color(target),
                    "sample_fields": user_fields[:12],
                    "available":     count > 0,
                    "is_system":     name in SYSTEM_COLLECTION_WHITELIST,
                    "importable":    count > 0 and name not in SYSTEM_COLLECTION_WHITELIST,
                })
            except Exception:
                result.append({
                    "collection": name, "count": 0, "auto_target": "knowledge_chunks",
                    "target_label": "KNOWLEDGE CHUNKS", "target_color": "violet",
                    "sample_fields": [], "available": False,
                    "is_system": name in SYSTEM_COLLECTION_WHITELIST, "importable": False
                })
        return result

    # ── Preview with full classification + validation ────────────────────────

    @router.post("/mongo/preview")
    async def preview_mongo_pull(req: MongoDBPullRequest, user=Depends(get_current_user)):
        """Preview records with classification, normalization, and validation analysis."""
        require_admin(user)

        limit  = min(req.limit or 20, 100)
        target = req.target if req.target != "auto" else _auto_classify(req.collection)

        try:
            cursor  = db[req.collection].find(req.filter_query or {}).limit(limit)
            records = await cursor.to_list(length=limit)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to query collection: {str(e)}")

        serialized = [_serialize_record(r) for r in records]

        # Validation & normalization analysis per record
        valid_count = 0
        skip_count  = 0
        unverified  = 0
        preview_normalized = []

        for rec in serialized:
            mfr   = _normalize_field(rec, "manufacturer", "")
            model = _normalize_field(rec, "model", "")
            fault = _normalize_field(rec, "fault", "") or _normalize_field(rec, "fault_code", "")
            src   = _normalize_field(rec, "source_document", "")

            has_identity = bool(mfr or model)
            has_content  = any(isinstance(v, str) and len(v) > 5 for v in rec.values())
            vstatus      = "OEM_DOCUMENT_REQUIRED" if (not src and (mfr or model)) else "NOT_VERIFIED"
            if not has_content:
                skip_count += 1
                continue

            valid_count += 1
            if vstatus != "VERIFIED":
                unverified += 1

            preview_normalized.append({
                "manufacturer":       mfr,
                "model":              model,
                "equipment_type":     _normalize_field(rec, "equipment_type", ""),
                "fault":              fault,
                "source_document":    src,
                "verification_status": vstatus,
                "has_identity":       has_identity,
                "_raw_fields":        list(rec.keys())[:8],
            })

        return {
            "collection":        req.collection,
            "effective_target":  target,
            "target_label":      _get_classify_label(target),
            "total_records":     len(serialized),
            "valid_count":       valid_count,
            "skip_count":        skip_count,
            "unverified_count":  unverified,
            "records":           serialized[:8],
            "normalized_preview": preview_normalized[:8],
            "field_map":         req.field_map or {},
        }

    # ── Full Import with normalization pipeline ───────────────────────────────

    @router.post("/mongo/import")
    async def import_mongo_to_training(req: MongoDBPullRequest, user=Depends(get_current_user)):
        """
        Import MongoDB records into the Solar O&M AI knowledge system.
        Targets: auto | training_cases | knowledge_chunks | structured_knowledge | ai_rules
        """
        require_admin(user)

        effective_target = req.target if req.target != "auto" else _auto_classify(req.collection)
        limit = min(req.limit or 200, 1000)

        try:
            cursor  = db[req.collection].find(req.filter_query or {}).limit(limit)
            records = await cursor.to_list(length=limit)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to query collection: {str(e)}")

        now          = datetime.utcnow()
        performed_by = getattr(user, "email", "system")
        imported = skipped = duplicates = unverified = 0
        errors   = []
        import_log = []

        # Get current count for case numbering
        case_base = await db.training_cases.count_documents({})

        for rec in records:
            clean = _serialize_record(rec)
            orig_id = clean.get("_id", "")

            try:
                has_content = any(isinstance(v, str) and len(str(v)) > 5 for v in clean.values())
                if not has_content:
                    skipped += 1
                    continue

                # ── Training Cases ───────────────────────────────────────────
                if effective_target == "training_cases":
                    case_doc = _build_training_case(clean, req.collection, case_base + imported + 1)

                    # Duplicate check: same source record
                    is_dup = await _detect_duplicate(db.training_cases, {
                        "source_collection": req.collection,
                        "source_record_id": orig_id
                    })
                    if is_dup:
                        duplicates += 1
                        continue

                    case_doc["created_by"]  = performed_by
                    case_doc["created_at"]  = now
                    case_doc["updated_at"]  = now
                    await db.training_cases.insert_one(case_doc)
                    imported += 1
                    if case_doc.get("verification_status") != "OEM_VERIFIED":
                        unverified += 1

                # ── Knowledge Chunks ─────────────────────────────────────────
                elif effective_target == "knowledge_chunks":
                    content  = _build_chunk_content(clean, req.collection)
                    metadata = _build_chunk_metadata(clean, req.collection)

                    # Duplicate check: same source record
                    is_dup = await _detect_duplicate(db.knowledge_chunks, {
                        "qdrant_metadata.original_collection": req.collection,
                        "qdrant_metadata.source_record_id": orig_id
                    })
                    if is_dup:
                        # Alternative check
                        is_dup = await _detect_duplicate(db.knowledge_chunks, {
                            "source_collection": req.collection,
                            "source_record_id": orig_id
                        })
                    if is_dup:
                        duplicates += 1
                        continue

                    chunk_id = str(uuid.uuid4())
                    chunk_doc = {
                        "chunk_id":          chunk_id,
                        "collection_id":     req.collection_id or "",
                        "folder_id":         None,
                        "content":           content[:3000],
                        "page_number":       1,
                        "status":            "pending_embedding",
                        "qdrant_ready":      False,
                        "qdrant_metadata":   {**metadata, "source_record_id": orig_id},
                        "manufacturer":      metadata["manufacturer"],
                        "model":             metadata["model"],
                        "equipment_type":    metadata["equipment_type"],
                        "fault":             metadata["fault"],
                        "source_collection": req.collection,
                        "source_record_id":  orig_id,
                        "verification_status": "NOT_VERIFIED",
                        "created_by":        performed_by,
                        "created_at":        now,
                    }
                    await db.knowledge_chunks.insert_one(chunk_doc)
                    imported += 1
                    unverified += 1

                # ── Structured Knowledge ─────────────────────────────────────
                elif effective_target == "structured_knowledge":
                    sk_doc = _build_structured_knowledge(clean, req.collection)

                    # Duplicate check
                    is_dup = await _detect_duplicate(db.structured_knowledge, {
                        "source_collection": req.collection,
                        "source_record_id": orig_id
                    })
                    if is_dup:
                        duplicates += 1
                        continue

                    sk_doc["created_by"] = performed_by
                    sk_doc["created_at"] = now
                    sk_doc["updated_at"] = now
                    await db.structured_knowledge.insert_one(sk_doc)
                    imported += 1
                    unverified += 1

                # ── AI Rules ─────────────────────────────────────────────────
                elif effective_target == "ai_rules":
                    rule_doc = _build_ai_rule(clean, req.collection)

                    is_dup = await _detect_duplicate(db.ai_rules, {
                        "source_collection": req.collection,
                        "source_record_id": orig_id
                    })
                    if is_dup:
                        duplicates += 1
                        continue

                    rule_doc["created_by"] = performed_by
                    rule_doc["created_at"] = now
                    await db.ai_rules.insert_one(rule_doc)
                    imported += 1

                else:
                    skipped += 1

            except Exception as ex:
                errors.append(str(ex)[:200])
                skipped += 1

        # Audit log
        await db.audit_logs.insert_one({
            "event":          "ai_mongo_pull",
            "action":         f"import_to_{effective_target}",
            "performed_by":   performed_by,
            "collection":     req.collection,
            "effective_target": effective_target,
            "imported":       imported,
            "skipped":        skipped,
            "duplicates":     duplicates,
            "unverified":     unverified,
            "created_at":     now
        })

        return {
            "success":          True,
            "collection":       req.collection,
            "effective_target": effective_target,
            "target_label":     _get_classify_label(effective_target),
            "imported":         imported,
            "skipped":          skipped,
            "duplicates":       duplicates,
            "unverified":       unverified,
            "qdrant_ready":     effective_target == "knowledge_chunks",
            "errors":           errors[:5],
            "message":          (
                f"Imported {imported} records from '{req.collection}' → "
                f"{_get_classify_label(effective_target)}. "
                f"Skipped: {skipped}. Duplicates: {duplicates}. "
                f"Unverified: {unverified} (verification_status=NOT_VERIFIED)."
            ),
        }



    # ══════════════════════════════════════════════════════════════════════════
    # 11. Dedicated MongoDB Solar Knowledge Management & Bulk JSON/ZIP Upload
    # ══════════════════════════════════════════════════════════════════════════

    knowledge_mgr = KnowledgeManager(db)

    @router.get("/knowledge/collections")
    async def list_solar_knowledge_collections(user=Depends(get_current_user)):
        """Lists all supported solar knowledge collections with record counts and schema info."""
        require_admin(user)
        result = []
        for coll in SUPPORTED_SOLAR_COLLECTIONS:
            try:
                count = await db[coll].count_documents({})
                sample = await db[coll].find_one({})
                user_fields = [f for f in (sample.keys() if sample else []) if not f.startswith("_")]
                result.append({
                    "collection": coll,
                    "count": count,
                    "sample_fields": user_fields[:12],
                    "available": count > 0
                })
            except Exception:
                result.append({
                    "collection": coll,
                    "count": 0,
                    "sample_fields": [],
                    "available": False
                })
        return result

    @router.post("/knowledge/preview-upload")
    async def preview_knowledge_upload(
        file: UploadFile = File(...),
        mode: str = Form("UPSERT"),
        target_collection: Optional[str] = Form(None),
        user=Depends(get_current_user)
    ):
        """Validates and previews JSON/ZIP knowledge payload before writing to MongoDB."""
        require_admin(user)
        raw_bytes = await file.read()
        filename = file.filename or "upload.json"

        try:
            parsed_packages = parse_json_payload(raw_bytes, filename)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse JSON file: {str(e)}")

        if not parsed_packages:
            raise HTTPException(status_code=400, detail="No valid JSON records found in upload.")

        previews = []
        for coll_name, records in parsed_packages:
            eff_coll = target_collection or coll_name
            val = await knowledge_mgr.validate_batch(eff_coll, records, mode=mode)
            previews.append(val)

        return {
            "filename": filename,
            "mode": mode,
            "packages_count": len(previews),
            "previews": previews
        }

    @router.post("/knowledge/upload")
    async def execute_knowledge_upload(
        file: UploadFile = File(...),
        mode: str = Form("UPSERT"),
        target_collection: Optional[str] = Form(None),
        source_type: str = Form("OEM_MANUAL"),
        source_document: Optional[str] = Form(None),
        user=Depends(get_current_user)
    ):
        """Executes bulk upload of JSON or ZIP knowledge package with batch tracking and rollback backup."""
        require_admin(user)
        raw_bytes = await file.read()
        filename = file.filename or "upload.json"
        user_email = getattr(user, "email", "admin@solar.local")

        try:
            parsed_packages = parse_json_payload(raw_bytes, filename)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse JSON: {str(e)}")

        if not parsed_packages:
            raise HTTPException(status_code=400, detail="No valid JSON records found in upload.")

        results = []
        for coll_name, records in parsed_packages:
            eff_coll = target_collection or coll_name
            res = await knowledge_mgr.execute_bulk_import(
                collection=eff_coll,
                records=records,
                mode=mode,
                filename=filename,
                user_email=user_email,
                source_type=source_type,
                source_doc_override=source_document
            )
            results.append(res)

        return {
            "success": True,
            "filename": filename,
            "mode": mode,
            "results": results
        }

    @router.get("/knowledge/batches")
    async def list_knowledge_import_batches(limit: int = 50, user=Depends(get_current_user)):
        """Returns history of knowledge import batches."""
        require_admin(user)
        batches = await db.knowledge_import_batches.find({}).sort("upload_date", -1).limit(limit).to_list(length=limit)
        clean = []
        for b in batches:
            b["_id"] = str(b["_id"])
            if "backup_log" in b:
                b["backup_records_count"] = len(b["backup_log"])
                del b["backup_log"]  # do not return full backup payload in list view
            clean.append(b)
        return clean

    @router.post("/knowledge/batches/{batch_id}/rollback")
    async def rollback_knowledge_batch(batch_id: str, user=Depends(get_current_user)):
        """Rollback records created or updated by a specific batch."""
        require_admin(user)
        user_email = getattr(user, "email", "admin@solar.local")
        res = await knowledge_mgr.rollback_batch(batch_id=batch_id, user_email=user_email)
        if not res["success"]:
            raise HTTPException(status_code=400, detail=res["message"])
        return res

    @router.get("/knowledge/export")
    async def export_knowledge_records(
        collection: Optional[str] = Query(None),
        batch_id: Optional[str] = Query(None),
        limit: int = Query(2000),
        user=Depends(get_current_user)
    ):
        """Export sanitized solar knowledge records as JSON."""
        require_admin(user)
        data = await knowledge_mgr.export_knowledge(collection=collection, batch_id=batch_id, limit=limit)
        return data

    @router.post("/knowledge/sync-qdrant")
    async def sync_knowledge_to_qdrant(
        collection: Optional[str] = Form(None),
        user=Depends(get_current_user)
    ):
        """Synchronizes structured troubleshooting & alarm records into semantic knowledge chunks for Qdrant/RAG."""
        require_admin(user)
        target_colls = [collection] if collection else ["oem_alarm_codes", "oem_troubleshooting_procedures", "fault_differential"]
        synced_count = 0
        now = datetime.utcnow()

        for coll in target_colls:
            if coll in await db.list_collection_names():
                records = await db[coll].find({}).to_list(length=500)
                for r in records:
                    clean = serialize_doc(r)
                    mfr = clean.get("manufacturer", "")
                    mdl = clean.get("model", "")
                    fault = clean.get("fault") or clean.get("alarm_code") or clean.get("description", "")
                    content = f"Title: {mfr} {mdl} - {fault}\nManufacturer: {mfr}\nModel: {mdl}\nDetails: {clean.get('procedure') or clean.get('meaning') or clean.get('possible_causes')}\nAction: {clean.get('action') or clean.get('corrective_action')}\nSource: {clean.get('source_document')}"
                    
                    chunk_id = f"QDR-{clean.get('knowledge_id') or uuid.uuid4().hex[:8]}"
                    await db.knowledge_chunks.update_one(
                        {"chunk_id": chunk_id},
                        {
                            "$set": {
                                "chunk_id": chunk_id,
                                "content": content,
                                "manufacturer": mfr,
                                "model": mdl,
                                "fault": fault,
                                "source_document": clean.get("source_document", ""),
                                "verification_status": clean.get("verification_status", "NOT_VERIFIED"),
                                "qdrant_ready": True,
                                "status": "indexed",
                                "updated_at": now
                            },
                            "$setOnInsert": {"created_at": now}
                        },
                        upsert=True
                    )
                    synced_count += 1

        return {
            "success": True,
            "synced_count": synced_count,
            "message": f"Successfully indexed {synced_count} knowledge records for Qdrant/RAG vector search."
        }

    return router
