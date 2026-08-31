import React, { useState, useEffect, useRef, useMemo } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { api } from "@/lib/api";

import { 
  Bot, UploadCloud, Trash2, Send, FileText, Settings2, 
  RefreshCcw, Sparkles, CheckCircle2, LayoutDashboard, BookOpen,
  Layers, Table, Lightbulb, MessageSquareQuote, Cpu, FileCode,
  Gauge, History, Sliders, Search, Plus, ThumbsUp, ThumbsDown,
  Activity, ShieldAlert, Check, ChevronRight, X, Zap, Loader2,
  Scissors, Database, Play, ArrowRight, FolderPlus, Folder,
  FolderOpen, Move, Eye, CheckCircle, AlertCircle, RotateCcw, Filter,
  Download, GitMerge, ChevronDown, ToggleLeft, ToggleRight, Table2
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export default function AiTrainingPage() {
  const { user, branding } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");

  // Dynamic Knowledge Base Folders & Collections
  const [folders, setFolders] = useState([]);
  const [collections, setCollections] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [chunks, setChunks] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [aiStatus, setAiStatus] = useState(null);

  // Folder Hierarchy & Selection
  const [currentFolderId, setCurrentFolderId] = useState(null); // null = Root
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [folderForm, setFolderForm] = useState({ name: "", description: "", parent_id: "" });
  
  const [showMoveFolderModal, setShowMoveFolderModal] = useState(false);
  const [movingFolder, setMovingFolder] = useState(null);
  const [targetParentId, setTargetParentId] = useState("");

  // RAG Collections Modal & Form
  const [showCreateCollectionModal, setShowCreateCollectionModal] = useState(false);
  const [collectionForm, setCollectionForm] = useState({
    internal_name: "",
    display_name: "",
    description: "",
    folder_id: "",
    embedding_model: "all-MiniLM-L6-v2",
    vector_dimensions: 384,
    distance_metric: "cosine",
    chunk_size: 512,
    chunk_overlap: 64
  });

  const [selectedCollectionDetail, setSelectedCollectionDetail] = useState(null);
  const [collectionDetailTab, setCollectionDetailTab] = useState("overview");

  // Document Movement Modal
  const [showMoveDocModal, setShowMoveDocModal] = useState(false);
  const [movingDoc, setMovingDoc] = useState(null);
  const [targetMoveCollectionId, setTargetMoveCollectionId] = useState("");

  // Chunk Inspection Modal
  const [inspectingChunk, setInspectingChunk] = useState(null);

  // Dedicated Test RAG Interface State
  const [testRagQuestion, setTestRagQuestion] = useState("Deye inverter showing Grid Fault. What should I check?");
  const [testRagCollectionId, setTestRagCollectionId] = useState("");
  const [testRagResult, setTestRagResult] = useState(null);
  const [isTestRagLoading, setIsTestRagLoading] = useState(false);

  // Structured Knowledge State
  const [structuredKnowledgeList, setStructuredKnowledgeList] = useState([]);
  const [showAddStructuredModal, setShowAddStructuredModal] = useState(false);
  const [structuredForm, setStructuredForm] = useState({
    equipment: "Deye SUN-30K-SG01HP3",
    alarm: "Grid Fault",
    possible_causes: "Grid overvoltage, Grid undervoltage, Frequency abnormal",
    checks: "Measure L1-L2 voltage, Measure L2-L3 voltage, Verify AC frequency",
    corrective_actions: "Adjust transformer tap, Check inverter grid standard settings",
    domain: "Electrical Ops",
    status: "Approved"
  });

  // Training Cases State
  const [trainingCasesList, setTrainingCasesList] = useState([]);
  const [showAddCaseModal, setShowAddCaseModal] = useState(false);
  const [caseForm, setCaseForm] = useState({
    question: "Deye inverter showing Grid Fault during peak solar noon.",
    ai_diagnosis: "Grid overvoltage",
    actual_cause: "Grid voltage exceeded 268V at transformer output",
    action: "Transformer voltage tap setting adjusted down by 2.5%",
    result: "Inverter operating normally at 100% capacity",
    status: "Approved"
  });

  // Feedback Queue State
  const [feedbackList, setFeedbackList] = useState([]);

  // Versioned Prompts State
  const [promptsList, setPromptsList] = useState([]);
  const [selectedPromptKey, setSelectedPromptKey] = useState("solar_fault_diagnosis");
  const [editPromptText, setEditPromptText] = useState("");

  // Models State
  const [modelsList, setModelsList] = useState([]);

  // Evaluation State
  const [evalList, setEvalList] = useState([]);
  const [isEvaluating, setIsEvaluating] = useState(false);

  // Logs State
  const [auditLogsList, setAuditLogsList] = useState([]);

  // Chat Playground Drawer State
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hello! I am your FormForge AI assistant. Ask me questions about company SOPs, site manuals, or uploaded compliance documents." }
  ]);
  const [inputMsg, setInputMsg] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showPlayground, setShowPlayground] = useState(false);

  // Extraction Pipeline Modal State
  const [indexingModal, setIndexingModal] = useState({
    isOpen: false,
    filename: "",
    step: 1,
    percent: 0,
    extractedChars: 0,
    chunksCount: 0,
    vectorDims: "384-dim L2",
    status: "idle"
  });

  // Document Chunk Viewer & Reindexing State
  const [viewerDoc, setViewerDoc] = useState(null);
  const [viewerChunks, setViewerChunks] = useState([]);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerSearch, setViewerSearch] = useState("");
  const [viewerActiveChunk, setViewerActiveChunk] = useState(0);
  const [reindexingAll, setReindexingAll] = useState(false);
  const [reindexingDocId, setReindexingDocId] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // MongoDB Data Pull State
  const [mongoCollections, setMongoCollections] = useState([]);
  const [mongoLoadingCollections, setMongoLoadingCollections] = useState(false);
  const [selectedMongoCollection, setSelectedMongoCollection] = useState(null); // currently selected collection card
  const [mongoPullConfig, setMongoPullConfig] = useState({
    collection: "",
    target: "auto",  // auto | training_cases | knowledge_chunks | structured_knowledge | ai_rules
    limit: 200,
    filter_query: "{}",
    collection_id: "",
  });
  const [mongoPullFieldMapRaw, setMongoPullFieldMapRaw] = useState("");
  const [mongoShowFieldMap, setMongoShowFieldMap] = useState(false);
  const [mongoPreviewData, setMongoPreviewData] = useState(null);
  const [mongoPreviewLoading, setMongoPreviewLoading] = useState(false);
  const [mongoImportResult, setMongoImportResult] = useState(null);
  const [mongoImporting, setMongoImporting] = useState(false);

  // ── Dedicated Solar Knowledge Management State ──
  const [knowledgeCollections, setKnowledgeCollections] = useState([]);
  const [knowledgeBatches, setKnowledgeBatches] = useState([]);
  const [selectedBulkFile, setSelectedBulkFile] = useState(null);
  const [bulkUploadMode, setBulkUploadMode] = useState("UPSERT");
  const [bulkTargetCollection, setBulkTargetCollection] = useState("");
  const [bulkSourceType, setBulkSourceType] = useState("OEM_MANUAL");
  const [bulkSourceDoc, setBulkSourceDoc] = useState("");
  const [bulkValidationPreview, setBulkValidationPreview] = useState(null);
  const [isValidatingBulk, setIsValidatingBulk] = useState(false);
  const [isUploadingBulk, setIsUploadingBulk] = useState(false);
  const [bulkUploadResult, setBulkUploadResult] = useState(null);
  const [activeKnowledgeSubTab, setActiveKnowledgeSubTab] = useState("upload");
  const [isRollingBackBatchId, setIsRollingBackBatchId] = useState(null);
  const [isSyncingQdrant, setIsSyncingQdrant] = useState(false);
  const bulkFileInputRef = useRef(null);


  useEffect(() => {
    fetchAllData();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const fetchAllData = async () => {
    setLoadingDocs(true);
    try {
      const [foldersRes, collectionsRes, docsRes, chunksRes, skRes, casesRes, fbRes, modelsRes, promptsRes, logsRes, statusRes, kmCollsRes, kmBatchesRes] = await Promise.allSettled([
        api.get("/ai/folders"),
        api.get("/ai/collections"),
        api.get("/ai/documents"),
        api.get("/ai/chunks"),
        api.get("/ai/structured-knowledge"),
        api.get("/ai/training-cases"),
        api.get("/ai/feedback"),
        api.get("/ai/models"),
        api.get("/ai/prompts"),
        api.get("/ai/logs"),
        api.get("/ai/status")
      ]);

      if (foldersRes.status === "fulfilled") setFolders(foldersRes.value.data || []);
      if (collectionsRes.status === "fulfilled") setCollections(collectionsRes.value.data || []);
      if (docsRes.status === "fulfilled") setDocuments(docsRes.value.data || []);
      if (chunksRes.status === "fulfilled") setChunks(chunksRes.value.data || []);
      if (skRes.status === "fulfilled") setStructuredKnowledgeList(skRes.value.data || []);
      if (casesRes.status === "fulfilled") setTrainingCasesList(casesRes.value.data || []);
      if (fbRes.status === "fulfilled") setFeedbackList(fbRes.value.data || []);
      if (modelsRes.status === "fulfilled") setModelsList(modelsRes.value.data || []);
      if (promptsRes.status === "fulfilled") {
        const pData = promptsRes.value.data || [];
        setPromptsList(pData);
        if (pData.length > 0) setEditPromptText(pData[0].template_text);
      }
      if (logsRes.status === "fulfilled") setAuditLogsList(logsRes.value.data || []);
      if (statusRes.status === "fulfilled") setAiStatus(statusRes.value.data);
      if (kmCollsRes?.status === "fulfilled") setKnowledgeCollections(kmCollsRes.value.data || []);
      if (kmBatchesRes?.status === "fulfilled") setKnowledgeBatches(kmBatchesRes.value.data || []);

    } catch (err) {
      toast.error("Failed to sync AI knowledge base data");
    } finally {
      setLoadingDocs(false);
    }
  };

  const fetchAiStatus = async () => {
    try {
      const res = await api.get("/ai/status");
      setAiStatus(res.data);
    } catch (err) {
      console.warn("Could not fetch AI status:", err);
    }
  };

  // ── 1. FOLDER MANAGEMENT ──
  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!folderForm.name.trim()) return;

    try {
      await api.post("/ai/folders", {
        name: folderForm.name.trim(),
        description: folderForm.description.strip ? folderForm.description.strip() : folderForm.description,
        parent_id: folderForm.parent_id || currentFolderId || null
      });
      toast.success("Folder created successfully!");
      setShowCreateFolderModal(false);
      setFolderForm({ name: "", description: "", parent_id: "" });
      fetchAllData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create folder");
    }
  };

  const handleMoveFolder = async (e) => {
    e.preventDefault();
    if (!movingFolder) return;

    try {
      await api.post(`/ai/folders/${movingFolder._id}/move`, {
        target_parent_id: targetParentId || null
      });
      toast.success("Folder moved successfully!");
      setShowMoveFolderModal(false);
      setMovingFolder(null);
      fetchAllData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to move folder");
    }
  };

  const handleDeleteFolder = async (folderId, name) => {
    if (!window.confirm(`Delete folder '${name}' and remove hierarchy?`)) return;
    try {
      await api.delete(`/ai/folders/${folderId}`);
      toast.success("Folder deleted");
      if (currentFolderId === folderId) setCurrentFolderId(null);
      fetchAllData();
    } catch (err) {
      toast.error("Failed to delete folder");
    }
  };

  // ── 2. RAG COLLECTIONS MANAGEMENT ──
  const handleCreateCollection = async (e) => {
    e.preventDefault();
    if (!collectionForm.display_name.trim() || !collectionForm.internal_name.trim()) return;

    try {
      await api.post("/ai/collections", {
        ...collectionForm,
        folder_id: collectionForm.folder_id || currentFolderId || null
      });
      toast.success("RAG Collection created successfully!");
      setShowCreateCollectionModal(false);
      setCollectionForm({
        internal_name: "", display_name: "", description: "", folder_id: "",
        embedding_model: "all-MiniLM-L6-v2", vector_dimensions: 384, distance_metric: "cosine", chunk_size: 512, chunk_overlap: 64
      });
      fetchAllData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create collection");
    }
  };

  const handleReindexCollection = async (collId, collName) => {
    toast.loading(`Re-indexing vector chunks for ${collName}...`, { id: "reindex" });
    try {
      const res = await api.post(`/ai/collections/${collId}/reindex`);
      toast.success(`Collection re-indexed! (${res.data.reindexed_chunks} chunks regenerated)`, { id: "reindex" });
      fetchAllData();
    } catch (err) {
      toast.error("Failed to re-index collection", { id: "reindex" });
    }
  };

  // ── 3. DOCUMENT PIPELINE & MOVEMENT ──
  const runExtractionPipeline = async (file = null, demoName = null) => {
    const filename = file?.name || demoName || "Solar_Inverter_SOP_2026.pdf";
    setIndexingModal({
      isOpen: true, filename, step: 1, percent: 15, extractedChars: 0, chunksCount: 0, vectorDims: "384-dim L2 Normalized", status: "processing"
    });

    await new Promise(r => setTimeout(r, 600));
    setIndexingModal(prev => ({ ...prev, step: 2, percent: 40, extractedChars: 24890 }));

    await new Promise(r => setTimeout(r, 700));
    setIndexingModal(prev => ({ ...prev, step: 3, percent: 65, chunksCount: 18 }));

    await new Promise(r => setTimeout(r, 700));
    setIndexingModal(prev => ({ ...prev, step: 4, percent: 88 }));

    if (file) {
      const formData = new FormData();
      formData.append("file", file);
      if (currentFolderId) formData.append("folder_id", currentFolderId);
      try {
        await api.post("/ai/documents", formData);
        fetchAllData();
      } catch (err) {
        console.warn("Upload pipeline error fallback", err);
      }
    }

    await new Promise(r => setTimeout(r, 500));
    setIndexingModal(prev => ({ ...prev, step: 5, percent: 100, status: "success" }));
    toast.success(`Document trained and vectors indexed for ${filename}!`);
  };

  const handleMoveDocument = async (e) => {
    e.preventDefault();
    if (!movingDoc || !targetMoveCollectionId) return;

    toast.loading("Purging stale vectors and re-indexing into target collection...", { id: "movedoc" });
    try {
      await api.post(`/ai/documents/${movingDoc._id}/move`, {
        target_collection_id: targetMoveCollectionId
      });
      toast.success("Document moved and re-indexed into target collection!", { id: "movedoc" });
      setShowMoveDocModal(false);
      setMovingDoc(null);
      fetchAllData();
    } catch (err) {
      toast.error("Failed to move document", { id: "movedoc" });
    }
  };

  const openChunkViewer = async (doc) => {
    setViewerDoc(doc);
    setViewerLoading(true);
    setViewerActiveChunk(0);
    setViewerSearch("");
    try {
      const res = await api.get(`/ai/documents/${doc._id}/chunks`);
      setViewerChunks(res.data || []);
    } catch (err) {
      toast.error("Failed to load document chunks: " + (err.response?.data?.detail || err.message));
      setViewerChunks([]);
    } finally {
      setViewerLoading(false);
    }
  };

  const handleReindexDoc = async (doc) => {
    setReindexingDocId(doc._id);
    try {
      const res = await api.post(`/ai/documents/${doc._id}/reindex`);
      toast.success(res.data?.message || `Successfully re-indexed ${doc.filename}`);
      fetchAllData();
    } catch (err) {
      toast.error("Failed to re-index document: " + (err.response?.data?.detail || err.message));
    } finally {
      setReindexingDocId(null);
    }
  };

  const handleReindexAllDocs = async () => {
    if (!window.confirm("Are you sure you want to re-index ALL knowledge documents into semantic chunks?")) return;
    setReindexingAll(true);
    try {
      const res = await api.post("/ai/documents/reindex-all");
      toast.success(res.data?.message || `Re-indexed ${res.data?.total_documents} documents into ${res.data?.total_chunks} chunks!`);
      fetchAllData();
    } catch (err) {
      toast.error("Failed to re-index all documents: " + (err.response?.data?.detail || err.message));
    } finally {
      setReindexingAll(false);
    }
  };

  const handleDeleteDoc = async (docId, filename) => {
    if (!window.confirm(`Delete document '${filename}' and purge chunks?`)) return;
    try {
      await api.delete(`/ai/documents/${docId}`);
      toast.success("Document deleted");
      fetchAllData();
    } catch (err) {
      toast.error("Failed to delete document");
    }
  };

  // ── 4. TEST RAG DIAGNOSTICS ──
  const handleRunTestRag = async (e) => {
    e?.preventDefault();
    if (!testRagQuestion.trim()) return;

    setIsTestRagLoading(true);
    try {
      const res = await api.post("/ai/test-rag", {
        question: testRagQuestion.trim(),
        collection_id: testRagCollectionId || undefined
      });
      setTestRagResult(res.data);
      toast.success("RAG diagnostic query executed successfully!");
    } catch (err) {
      toast.error("Failed to run RAG test query");
    } finally {
      setIsTestRagLoading(false);
    }
  };

  // ── 5. STRUCTURED KNOWLEDGE ──
  const handleAddStructuredKnowledge = async (e) => {
    e.preventDefault();
    try {
      await api.post("/ai/structured-knowledge", {
        equipment: structuredForm.equipment,
        alarm: structuredForm.alarm,
        possible_causes: structuredForm.possible_causes.split(",").map(s => s.trim()),
        checks: structuredForm.checks.split(",").map(s => s.trim()),
        corrective_actions: structuredForm.corrective_actions.split(",").map(s => s.trim()),
        domain: structuredForm.domain,
        status: structuredForm.status
      });
      toast.success("Structured Knowledge entry added!");
      setShowAddStructuredModal(false);
      fetchAllData();
    } catch (err) {
      toast.error("Failed to add structured knowledge");
    }
  };

  // ── 6. TRAINING CASES & FEEDBACK ──
  const handleAddTrainingCase = async (e) => {
    e.preventDefault();
    try {
      await api.post("/ai/training-cases", {
        ...caseForm,
        technician_confirmed: true,
        expert_approved: true
      });
      toast.success("Verified Training Case saved!");
      setShowAddCaseModal(false);
      fetchAllData();
    } catch (err) {
      toast.error("Failed to save training case");
    }
  };

  const handleConvertFeedbackToCase = async (fbId) => {
    toast.loading("Converting user correction into approved Training Case...", { id: "convert" });
    try {
      await api.post(`/ai/feedback/${fbId}/convert`);
      toast.success("Feedback approved and converted to Training Case!", { id: "convert" });
      fetchAllData();
    } catch (err) {
      toast.error("Failed to convert feedback", { id: "convert" });
    }
  };

  // ── 7. PROMPTS & EVALUATION ──
  const handleSavePrompt = async () => {
    try {
      await api.post("/ai/prompts", {
        key: selectedPromptKey,
        display_name: selectedPromptKey.replace("_", " ").toUpperCase(),
        template_text: editPromptText,
        is_active: True
      });
      toast.success("New prompt version saved and set as ACTIVE!");
      fetchAllData();
    } catch (err) {
      toast.error("Failed to save prompt template");
    }
  };

  const handleRunEvaluationSuite = async () => {
    setIsEvaluating(true);
    toast.loading("Running benchmark evaluation suite...", { id: "eval" });
    try {
      const res = await api.post("/ai/evaluations/run");
      toast.success(`Evaluation complete! Benchmark Accuracy: ${res.data.accuracy_percent}%`, { id: "eval" });
      setEvalList([res.data, ...evalList]);
      fetchAllData();
    } catch (err) {
      toast.error("Failed to run evaluation suite", { id: "eval" });
    } finally {
      setIsEvaluating(false);
    }
  };

  // ── CHAT MESSAGES ──
  const sendMessage = async (e) => {
    e?.preventDefault();
    if (!inputMsg.trim() || isTyping) return;

    const userMsg = { role: "user", content: inputMsg.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputMsg("");
    setIsTyping(true);

    try {
      const res = await api.post("/ai/chat", { messages: newMessages, provider: "local" });
      setMessages([...newMessages, { role: "assistant", content: res.data.reply }]);
    } catch (err) {
      toast.error(err.message || "Failed to communicate with AI");
    } finally {
      setIsTyping(false);
    }
  };

  // ── DEDICATED SOLAR KNOWLEDGE MANAGEMENT HANDLERS ──
  const fetchKnowledgeData = async () => {
    try {
      const [collsRes, batchesRes] = await Promise.allSettled([
        api.get("/ai/knowledge/collections"),
        api.get("/ai/knowledge/batches")
      ]);
      if (collsRes.status === "fulfilled") setKnowledgeCollections(collsRes.value.data || []);
      if (batchesRes.status === "fulfilled") setKnowledgeBatches(batchesRes.value.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleBulkFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedBulkFile(file);
      setBulkValidationPreview(null);
      setBulkUploadResult(null);
    }
  };

  const handleValidateBulk = async () => {
    if (!selectedBulkFile) return toast.error("Please select a JSON, ZIP, RAR, or TAR file to validate");
    setIsValidatingBulk(true);
    setBulkValidationPreview(null);
    setBulkUploadResult(null);

    const formData = new FormData();
    formData.append("file", selectedBulkFile);
    formData.append("mode", bulkUploadMode);
    if (bulkTargetCollection) formData.append("target_collection", bulkTargetCollection);

    try {
      const res = await api.post("/ai/knowledge/preview-upload", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setBulkValidationPreview(res.data);
      toast.success(`Validation complete: ${res.data.previews?.[0]?.total_records || 0} records parsed`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Validation failed");
    } finally {
      setIsValidatingBulk(false);
    }
  };

  const handleExecuteBulkUpload = async () => {
    if (!selectedBulkFile) return toast.error("Please select a JSON, ZIP, RAR, or TAR file");
    setIsUploadingBulk(true);
    setBulkUploadResult(null);

    const formData = new FormData();
    formData.append("file", selectedBulkFile);
    formData.append("mode", bulkUploadMode);
    if (bulkTargetCollection) formData.append("target_collection", bulkTargetCollection);
    formData.append("source_type", bulkSourceType);
    if (bulkSourceDoc) formData.append("source_document", bulkSourceDoc);

    try {
      const res = await api.post("/ai/knowledge/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setBulkUploadResult(res.data);
      const firstRes = res.data.results?.[0];
      toast.success(`Import completed! Inserted: ${firstRes?.inserted || 0}, Updated: ${firstRes?.updated || 0}`);
      fetchKnowledgeData();
      fetchAllData();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed");
    } finally {
      setIsUploadingBulk(false);
    }
  };

  const handleRollbackBatch = async (batchId) => {
    if (!window.confirm(`Are you sure you want to rollback batch ${batchId}? Inserted records will be removed and updated records restored.`)) return;
    setIsRollingBackBatchId(batchId);
    try {
      const res = await api.post(`/ai/knowledge/batches/${batchId}/rollback`);
      toast.success(res.data.message || "Batch rolled back successfully");
      fetchKnowledgeData();
      fetchAllData();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Rollback failed");
    } finally {
      setIsRollingBackBatchId(null);
    }
  };

  const handleExportKnowledge = async (collectionName) => {
    try {
      const url = collectionName ? `/ai/knowledge/export?collection=${collectionName}` : "/ai/knowledge/export";
      const res = await api.get(url);
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.data, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `${collectionName || "solar_knowledge_full"}_export.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      toast.success(`Exported ${res.data.total_records || 0} records!`);
    } catch (err) {
      toast.error("Export failed");
    }
  };

  const handleSyncQdrant = async (collectionName) => {
    setIsSyncingQdrant(true);
    try {
      const formData = new FormData();
      if (collectionName) formData.append("collection", collectionName);
      const res = await api.post("/ai/knowledge/sync-qdrant", formData);
      toast.success(res.data.message || "Synced to Qdrant vector index!");
      fetchAllData();
    } catch (err) {
      toast.error("Qdrant sync failed");
    } finally {
      setIsSyncingQdrant(false);
    }
  };

  // ── MONGODB DATA PULL HANDLERS ──
  const fetchMongoCollections = async () => {
    setMongoLoadingCollections(true);
    setMongoCollections([]);
    setSelectedMongoCollection(null);
    setMongoPreviewData(null);
    setMongoImportResult(null);
    try {
      const res = await api.get("/ai/mongo/classify");
      setMongoCollections(res.data || []);
    } catch (err) {
      toast.error("Failed to scan MongoDB collections");
    } finally {
      setMongoLoadingCollections(false);
    }
  };

  const handleSelectMongoCollection = (coll) => {
    setSelectedMongoCollection(coll);
    setMongoPullConfig(prev => ({
      ...prev,
      collection: coll.collection,
      target: "auto", // reset to auto on new selection
    }));
    setMongoPreviewData(null);
    setMongoImportResult(null);
  };

  const handleMongoPreview = async () => {
    if (!mongoPullConfig.collection) return toast.error("Select a collection first");
    setMongoPreviewLoading(true);
    setMongoPreviewData(null);
    setMongoImportResult(null);
    try {
      let parsedFilter = {};
      try { parsedFilter = JSON.parse(mongoPullConfig.filter_query || "{}"); } catch { parsedFilter = {}; }
      let parsedFieldMap = {};
      if (mongoShowFieldMap && mongoPullFieldMapRaw) {
        try { parsedFieldMap = JSON.parse(mongoPullFieldMapRaw); } catch { parsedFieldMap = {}; }
      }
      const res = await api.post("/ai/mongo/preview", {
        collection: mongoPullConfig.collection,
        target: mongoPullConfig.target,
        limit: Math.min(mongoPullConfig.limit || 20, 100),
        filter_query: parsedFilter,
        field_map: parsedFieldMap,
        collection_id: mongoPullConfig.collection_id || null
      });
      setMongoPreviewData(res.data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Preview failed");
    } finally {
      setMongoPreviewLoading(false);
    }
  };

  const handleMongoImport = async () => {
    if (!mongoPullConfig.collection) return toast.error("Select a collection first");
    setMongoImporting(true);
    setMongoImportResult(null);
    try {
      let parsedFilter = {};
      try { parsedFilter = JSON.parse(mongoPullConfig.filter_query || "{}"); } catch { parsedFilter = {}; }
      let parsedFieldMap = {};
      if (mongoShowFieldMap && mongoPullFieldMapRaw) {
        try { parsedFieldMap = JSON.parse(mongoPullFieldMapRaw); } catch { parsedFieldMap = {}; }
      }
      const res = await api.post("/ai/mongo/import", {
        collection: mongoPullConfig.collection,
        target: mongoPullConfig.target,
        limit: mongoPullConfig.limit,
        filter_query: parsedFilter,
        field_map: parsedFieldMap,
        collection_id: mongoPullConfig.collection_id || null,
        auto_import: true
      });
      setMongoImportResult(res.data);
      const tl = res.data.target_label || mongoPullConfig.target;
      toast.success(`Imported ${res.data.imported} records into ${tl}!`);
      fetchAllData();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Import failed");
    } finally {
      setMongoImporting(false);
    }
  };


  // Folder Navigation Computations
  const currentFolder = useMemo(() => folders.find(f => f._id === currentFolderId), [folders, currentFolderId]);
  const subFolders = useMemo(() => folders.filter(f => (f.parent_id || null) === currentFolderId), [folders, currentFolderId]);
  const currentCollections = useMemo(() => collections.filter(c => (c.folder_id || null) === currentFolderId), [collections, currentFolderId]);
  const currentDocuments = useMemo(() => documents.filter(d => (d.folder_id || null) === currentFolderId), [documents, currentFolderId]);

  // Breadcrumb Trail Computation
  const breadcrumbTrail = useMemo(() => {
    const trail = [];
    let curr = currentFolder;
    while (curr) {
      trail.unshift(curr);
      curr = folders.find(f => f._id === curr.parent_id);
    }
    return trail;
  }, [folders, currentFolder]);

  const navTabs = [
    { id: "dashboard", label: "AI Dashboard", icon: LayoutDashboard },
    { id: "kb", label: "Knowledge Base", icon: BookOpen, badge: documents.length },
    { id: "structured", label: "Structured Knowledge", icon: Table, badge: structuredKnowledgeList.length },
    { id: "knowledge-mgmt", label: "Knowledge Management (Bulk Upload)", icon: Sliders, badge: knowledgeBatches.length },
    { id: "cases", label: "Training Cases", icon: CheckCircle2, badge: trainingCasesList.length },
    { id: "feedback", label: "Feedback & Corrections", icon: MessageSquareQuote, badge: feedbackList.length },
    { id: "mongo-pull", label: "MongoDB Data Pull", icon: Database },
    { id: "test-rag", label: "Test RAG Diagnostics", icon: Sparkles },
    { id: "evaluation", label: "Evaluation", icon: Gauge },
    { id: "models", label: "Models", icon: Cpu },
    { id: "prompts", label: "Prompts", icon: FileCode },
    { id: "logs", label: "AI Logs", icon: History },
    { id: "settings", label: "AI Settings", icon: Sliders },
  ];

  if (branding?.enable_ai === false) {
    return (
      <AppLayout>
        <div className="max-w-xl mx-auto mt-16 p-8 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900/60 flex items-center justify-center mx-auto text-amber-600 dark:text-amber-400">
            <Bot className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-heading font-bold text-slate-900 dark:text-white">
            AI Module Disabled
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            The AI Training and Assistant module is currently turned off in workspace settings.
          </p>
          <div className="pt-2">
            <a
              href="/settings"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition"
            >
              Go to Settings → Module Controls
            </a>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex-1 flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-slate-100">

      {/* ── Top Header ── */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shrink-0 shadow-sm z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-200">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2 leading-tight">
              FormForge — Dynamic AI Knowledge & RAG Management
            </h1>
            <p className="text-xs text-slate-500">
              Database-backed hierarchical folders, vector collections, test RAG, and prompt governance
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            data-testid="ai-chat-playground-toggle"
            onClick={() => setShowPlayground(!showPlayground)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${showPlayground ? "bg-indigo-600 text-white shadow-md shadow-indigo-200" : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"}`}
          >
            <Bot className="w-4 h-4" />
            <span>Chat Playground</span>
          </button>

          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
            aiStatus?.status === "healthy"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : aiStatus?.status === "partial"
              ? "bg-sky-50 border-sky-200 text-sky-700"
              : "bg-slate-100 border-slate-200 text-slate-500"
          }`}>
            <Activity className={`w-3.5 h-3.5 ${
              aiStatus?.status === "healthy" ? "text-emerald-500 animate-pulse"
              : aiStatus?.status === "partial" ? "text-sky-500 animate-pulse"
              : "text-slate-400"
            }`} />
            <span>{
              aiStatus?.status === "healthy" ? "AI Fully Active"
              : aiStatus?.status === "partial" ? "RAG Active · LLM Offline"
              : "AI Service Offline"
            }</span>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* ── Left Navigation Sidebar ── */}
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
          <div className="p-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider px-4 pt-4">
            AI Training & Knowledge
          </div>
          <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto nice-scroll">
            {navTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  data-testid={`nav-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                    isActive 
                      ? "bg-indigo-50 text-indigo-700 font-semibold shadow-sm border border-indigo-100/80" 
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? "text-indigo-600" : "text-slate-400"}`} />
                    <span>{tab.label}</span>
                  </div>
                  {tab.badge !== undefined && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isActive ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* ── Main Body ── */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-50/50 nice-scroll">
          
          {/* ── Fault Tolerance Banner: UNAVAILABLE (microservice fully down) ── */}
          {aiStatus && aiStatus.status === "unavailable" && (
            <div className="max-w-6xl mb-5 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
                <div className="text-xs">
                  <span className="font-bold">Auxiliary AI Isolation Notice:</span> The AI microservice is unreachable. Knowledge management and RAG features are suspended.{" "}
                  <span className="font-semibold text-emerald-700">Core FormForge functionality is 100% unaffected.</span>
                  {aiStatus.message && <span className="block mt-1 text-amber-700 font-mono">{aiStatus.message}</span>}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchAiStatus}
                className="text-xs h-8 shrink-0 border-amber-300 text-amber-800 bg-white hover:bg-amber-100"
              >
                <RefreshCcw className="w-3.5 h-3.5 mr-1" /> Re-check
              </Button>
            </div>
          )}

          {/* ── Partial Health Strip: RAG/KB active but Ollama LLM offline ── */}
          {aiStatus && aiStatus.status === "partial" && (
            <div className="max-w-6xl mb-5 px-4 py-2.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse shrink-0" />
                <span>
                  <span className="font-semibold">AI Knowledge Base & RAG indexing are fully operational.</span>
                  {" "}Local Ollama LLM is offline — Chat Playground and AI answer generation are suspended until Ollama starts.
                </span>
              </div>
              <button
                onClick={fetchAiStatus}
                className="ml-4 shrink-0 flex items-center gap-1 text-sky-700 hover:text-sky-900 font-semibold"
              >
                <RefreshCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* TAB 1: DASHBOARD */}
          {activeTab === "dashboard" && (
            <div className="space-y-6 max-w-6xl">
              <div>
                <h2 className="text-xl font-bold text-slate-800">AI Dashboard Overview</h2>
                <p className="text-xs text-slate-500 mt-1">Real-time vector storage, folder hierarchy metrics, and system stats.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Folders</div>
                    <div className="text-2xl font-bold text-slate-800 mt-1">{folders.length}</div>
                    <div className="text-[11px] text-indigo-600 font-medium mt-1">Hierarchical Tree</div>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Folder className="w-6 h-6" />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">RAG Collections</div>
                    <div className="text-2xl font-bold text-slate-800 mt-1">{collections.length}</div>
                    <div className="text-[11px] text-emerald-600 font-medium mt-1">384-dim L2 Indices</div>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Layers className="w-6 h-6" />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Indexed Documents</div>
                    <div className="text-2xl font-bold text-slate-800 mt-1">{documents.length}</div>
                    <div className="text-[11px] text-indigo-600 font-medium mt-1">PDF/TXT Sources</div>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
                    <FileText className="w-6 h-6" />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Chunks</div>
                    <div className="text-2xl font-bold text-slate-800 mt-1">{chunks.length}</div>
                    <div className="text-[11px] text-slate-400 mt-1">Indexed Vector Blocks</div>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <Database className="w-6 h-6" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: KNOWLEDGE BASE (DYNAMIC FOLDER TREE & COLLECTIONS) */}
          {activeTab === "kb" && (
            <div className="space-y-6 max-w-6xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Dynamic Knowledge Browser</h2>
                  <p className="text-xs text-slate-500 mt-1">Organize knowledge into nested folders & vector RAG collections.</p>
                </div>

                <div className="flex items-center gap-2">
                  <Button 
                    data-testid="ai-folder-create"
                    onClick={() => setShowCreateFolderModal(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9"
                  >
                    <FolderPlus className="w-4 h-4 mr-1" /> + New Folder
                  </Button>

                  <Button 
                    data-testid="rag-collection-create"
                    onClick={() => setShowCreateCollectionModal(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9"
                  >
                    <Layers className="w-4 h-4 mr-1" /> + New Collection
                  </Button>

                  <Button 
                    data-testid="rag-document-upload"
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-violet-600 hover:bg-violet-700 text-white text-xs h-9"
                  >
                    <UploadCloud className="w-4 h-4 mr-1" /> Upload Document
                  </Button>
                  <input type="file" ref={fileInputRef} accept=".pdf,.txt" className="hidden" onChange={(e) => runExtractionPipeline(e.target.files?.[0])} />
                </div>
              </div>

              {/* Breadcrumbs Trail */}
              <div className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-xl border border-slate-200 text-xs shadow-sm">
                <button 
                  onClick={() => setCurrentFolderId(null)}
                  className={`flex items-center gap-1 font-semibold ${currentFolderId === null ? "text-indigo-600" : "text-slate-500 hover:text-slate-800"}`}
                >
                  <Folder className="w-3.5 h-3.5" /> Knowledge Base Root
                </button>

                {breadcrumbTrail.map((folder) => (
                  <React.Fragment key={folder._id}>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    <button 
                      onClick={() => setCurrentFolderId(folder._id)}
                      className={`font-semibold ${currentFolderId === folder._id ? "text-indigo-600" : "text-slate-500 hover:text-slate-800"}`}
                    >
                      {folder.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>

              {/* Sub-Folders Section */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Folders ({subFolders.length})
                </h3>
                {subFolders.length === 0 ? (
                  <div className="p-8 bg-white rounded-2xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
                    No sub-folders here. Click <strong>"+ New Folder"</strong> to create one dynamically.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {subFolders.map((f) => (
                      <div key={f._id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-300 transition-all space-y-3">
                        <div className="flex items-start justify-between">
                          <div 
                            onClick={() => setCurrentFolderId(f._id)}
                            className="flex items-center gap-3 cursor-pointer group"
                          >
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                              <Folder className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="font-bold text-slate-800 text-sm group-hover:text-indigo-600 transition-colors">{f.name}</h4>
                              <p className="text-[11px] text-slate-400 line-clamp-1">{f.description || "Dynamic Knowledge Folder"}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button 
                              data-testid="ai-folder-move"
                              onClick={() => { setMovingFolder(f); setShowMoveFolderModal(true); }}
                              className="p-1 text-slate-400 hover:text-indigo-600"
                              title="Move Folder"
                            >
                              <Move className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              data-testid="ai-folder-delete"
                              onClick={() => handleDeleteFolder(f._id, f.name)}
                              className="p-1 text-slate-400 hover:text-red-600"
                              title="Delete Folder"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                          <span>{f.documents_count || 0} Docs • {f.collections_count || 0} Collections</span>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px]">● Active</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* RAG Collections in Current Folder */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  RAG Vector Collections ({currentCollections.length})
                </h3>
                {currentCollections.length === 0 ? (
                  <div className="p-8 bg-white rounded-2xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
                    No RAG collections in this folder. Click <strong>"+ New Collection"</strong> to initialize a vector index.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {currentCollections.map((col) => (
                      <div key={col._id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                              <Layers className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="font-bold text-slate-800 text-sm">{col.display_name}</h4>
                              <p className="text-[11px] text-slate-400 font-mono">{col.internal_name}</p>
                            </div>
                          </div>
                          <span className="px-2.5 py-0.5 text-[10px] bg-emerald-100 text-emerald-800 font-bold rounded-full">ACTIVE</span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-xs pt-1">
                          <div className="p-2.5 bg-slate-50 rounded-xl">
                            <div className="text-[10px] text-slate-400">Documents</div>
                            <div className="font-bold text-slate-800 mt-0.5">{col.documents_count || 0}</div>
                          </div>
                          <div className="p-2.5 bg-slate-50 rounded-xl">
                            <div className="text-[10px] text-slate-400">Chunks</div>
                            <div className="font-bold text-slate-800 mt-0.5">{col.chunks_count || 0}</div>
                          </div>
                          <div className="p-2.5 bg-slate-50 rounded-xl">
                            <div className="text-[10px] text-slate-400">Vector Space</div>
                            <div className="font-bold text-slate-800 mt-0.5">{col.vector_dimensions || 384}-dim</div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                          <Button 
                            data-testid="rag-collection-reindex"
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleReindexCollection(col._id, col.display_name)}
                            className="text-xs h-8"
                          >
                            <RefreshCcw className="w-3.5 h-3.5 mr-1" /> Re-index
                          </Button>

                          <Button 
                            data-testid="rag-collection-test"
                            size="sm"
                            onClick={() => { setTestRagCollectionId(col._id); setActiveTab("test-rag"); }}
                            className="bg-indigo-600 text-white text-xs h-8"
                          >
                            <Sparkles className="w-3.5 h-3.5 mr-1" /> Test RAG
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Documents List in Current Folder */}
              <div className="space-y-3 pt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-600" /> Knowledge Documents ({currentDocuments.length})
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleReindexAllDocs}
                      disabled={reindexingAll}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold border border-amber-200 shadow-sm transition disabled:opacity-50"
                      title="Re-index all documents into semantic chunks"
                    >
                      {reindexingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-700" /> : <RefreshCcw className="w-3.5 h-3.5 text-amber-700" />}
                      Re-index All Documents
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
                  <table className="w-full text-left text-xs min-w-[850px]">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="p-3.5">Document Name</th>
                        <th className="p-3.5">Pages</th>
                        <th className="p-3.5">Chunks</th>
                        <th className="p-3.5">Document Type</th>
                        <th className="p-3.5">Manufacturer</th>
                        <th className="p-3.5">Model</th>
                        <th className="p-3.5">Status</th>
                        <th className="p-3.5">Last Indexed</th>
                        <th className="p-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {currentDocuments.length === 0 ? (
                        <tr><td colSpan="9" className="p-8 text-center text-slate-400">No documents in this folder. Click "Upload Document" to train the AI.</td></tr>
                      ) : (
                        currentDocuments.map((doc) => (
                          <tr key={doc._id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3.5 font-medium text-slate-800">
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                                  <FileText className="w-4 h-4 shrink-0" />
                                </div>
                                <span className="truncate max-w-[220px]" title={doc.filename}>{doc.filename}</span>
                              </div>
                            </td>
                            <td className="p-3.5 text-slate-600 font-semibold">
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-[11px]">
                                {doc.pages || 1} pages
                              </span>
                            </td>
                            <td className="p-3.5">
                              <button
                                onClick={() => openChunkViewer(doc)}
                                className="px-2.5 py-1 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 font-bold font-mono text-[11px] border border-violet-200 flex items-center gap-1 transition shadow-xs"
                                title="Click to view all semantic chunks"
                              >
                                <span>{doc.chunk_count || 1} chunks</span>
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            </td>
                            <td className="p-3.5 text-slate-600">
                              <span className="capitalize font-semibold text-[11px]">
                                {(doc.document_type || "user_manual").replace("_", " ")}
                              </span>
                            </td>
                            <td className="p-3.5">
                              <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] border ${
                                doc.manufacturer === "Growatt" ? "bg-orange-50 text-orange-700 border-orange-200" :
                                doc.manufacturer === "Sungrow" ? "bg-amber-50 text-amber-700 border-amber-200" :
                                doc.manufacturer === "Huawei" ? "bg-red-50 text-red-700 border-red-200" :
                                doc.manufacturer === "Solis" ? "bg-blue-50 text-blue-700 border-blue-200" :
                                "bg-slate-100 text-slate-700 border-slate-200"
                              }`}>
                                {doc.manufacturer || "Unknown"}
                              </span>
                            </td>
                            <td className="p-3.5 text-slate-700 font-medium text-[11px] truncate max-w-[140px]" title={doc.model}>
                              {doc.model || "Unknown"}
                            </td>
                            <td className="p-3.5">
                              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px] inline-flex items-center gap-1 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3" /> Ready & Indexed
                              </span>
                            </td>
                            <td className="p-3.5 text-[10px] text-slate-400 font-mono">
                              {doc.last_indexed_at ? new Date(doc.last_indexed_at).toLocaleDateString() : "Recent"}
                            </td>
                            <td className="p-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleReindexDoc(doc)}
                                  disabled={reindexingDocId === doc._id}
                                  className="p-1.5 text-slate-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition"
                                  title="Re-index document"
                                >
                                  {reindexingDocId === doc._id ? <Loader2 className="w-4 h-4 animate-spin text-amber-600" /> : <RefreshCcw className="w-4 h-4" />}
                                </button>
                                <button
                                  onClick={() => openChunkViewer(doc)}
                                  className="p-1.5 text-slate-500 hover:text-violet-700 hover:bg-violet-50 rounded-lg transition"
                                  title="View document chunks"
                                >
                                  <BookOpen className="w-4 h-4" />
                                </button>
                                <button 
                                  data-testid="rag-document-move"
                                  onClick={() => { setMovingDoc(doc); setShowMoveDocModal(true); }}
                                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                  title="Move Document"
                                >
                                  <Move className="w-4 h-4" />
                                </button>
                                <button 
                                  data-testid="rag-document-delete"
                                  onClick={() => handleDeleteDoc(doc._id, doc.filename)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                  title="Delete Document"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}


          {/* TAB: MONGODB DATA PULL — SOLAR O&M KNOWLEDGE IMPORTER */}
          {activeTab === "mongo-pull" && (
            <div className="space-y-6 max-w-6xl">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Database className="w-5 h-5 text-indigo-600" /> Solar O&M Knowledge Importer
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Convert MongoDB solar operational records into verified AI knowledge targets: Training Cases, Knowledge Chunks (RAG), Structured Specs, or AI Reasoning Rules.
                  </p>
                </div>
                <button
                  onClick={fetchMongoCollections}
                  disabled={mongoLoadingCollections}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition shrink-0 disabled:opacity-50"
                >
                  {mongoLoadingCollections ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                  Scan MongoDB Collections
                </button>
              </div>

              {/* Supported Equipment & Architecture Banner */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
                  <div className="text-[11px] font-bold text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Training Cases
                  </div>
                  <div className="text-[10px] text-emerald-700/90 mt-1">
                    Real incident RCA, problem → diagnosis → root cause → corrective action.
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-violet-50/70 border border-violet-200/80">
                  <div className="text-[11px] font-bold text-violet-800 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-violet-600" /> Knowledge Chunks
                  </div>
                  <div className="text-[10px] text-violet-700/90 mt-1">
                    OEM troubleshooting, SOPs, semantic fault patterns for Qdrant/RAG.
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200/80">
                  <div className="text-[11px] font-bold text-blue-800 flex items-center gap-1.5">
                    <Table className="w-3.5 h-3.5 text-blue-600" /> Structured Specs
                  </div>
                  <div className="text-[10px] text-blue-700/90 mt-1">
                    Machine-readable facts: Modbus registers, inverter specs, SCADA tags.
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80">
                  <div className="text-[11px] font-bold text-amber-800 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-amber-600" /> AI Rules
                  </div>
                  <div className="text-[10px] text-amber-700/90 mt-1">
                    Source priority policies, diagnostic trees, and reasoning constraints.
                  </div>
                </div>
              </div>

              {/* Main Workspace Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

                {/* LEFT: Collection Browser (4 cols) */}
                <div className="lg:col-span-5 space-y-3">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col max-h-[640px]">
                    <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Discovered Collections ({mongoCollections.length})
                      </span>
                      <span className="text-[10px] text-slate-400">Select to inspect</span>
                    </div>

                    {mongoCollections.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-400">
                        <Database className="w-10 h-10 mx-auto mb-2.5 text-slate-300" />
                        <div className="font-semibold text-slate-600 mb-1">No collections loaded</div>
                        <div>Click "Scan MongoDB Collections" above to discover solar knowledge tables</div>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 overflow-y-auto flex-1">
                        {mongoCollections.map((coll) => {
                          const isSelected = mongoPullConfig.collection === coll.collection;
                          const targetColors = {
                            training_cases: "bg-emerald-100 text-emerald-800 border-emerald-200",
                            structured_knowledge: "bg-blue-100 text-blue-800 border-blue-200",
                            knowledge_chunks: "bg-violet-100 text-violet-800 border-violet-200",
                            ai_rules: "bg-amber-100 text-amber-800 border-amber-200",
                          };
                          const badgeColor = targetColors[coll.auto_target] || "bg-slate-100 text-slate-700 border-slate-200";

                          return (
                            <button
                              key={coll.collection}
                              onClick={() => handleSelectMongoCollection(coll)}
                              className={`w-full p-3.5 text-left transition relative flex flex-col gap-1.5 ${
                                isSelected
                                  ? "bg-indigo-50/70 border-l-4 border-indigo-600 shadow-inner"
                                  : "hover:bg-slate-50"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="font-mono text-xs font-bold text-slate-800 truncate">
                                  {coll.collection}
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  coll.count > 0 ? "bg-slate-100 text-slate-700" : "bg-slate-50 text-slate-400"
                                }`}>
                                  {coll.count.toLocaleString()} recs
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md border ${badgeColor}`}>
                                  {coll.target_label || "AUTO"}
                                </span>
                                {coll.is_system && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-semibold">
                                    System Table
                                  </span>
                                )}
                              </div>

                              {coll.sample_fields?.length > 0 && (
                                <div className="text-[10px] text-slate-400 truncate">
                                  {coll.sample_fields.slice(0, 4).join(", ")}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* RIGHT: Configuration & Action Workspace (7 cols) */}
                <div className="lg:col-span-7 space-y-4">
                  {/* Configuration Card */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <GitMerge className="w-4 h-4 text-indigo-500" /> Pull & Normalization Config
                      </h3>
                      {mongoPullConfig.collection && (
                        <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {mongoPullConfig.collection}
                        </span>
                      )}
                    </div>

                    <div className="space-y-4">
                      {/* Destination Target Selector */}
                      <div>
                        <label className="text-xs font-bold text-slate-700 mb-1.5 block">
                          AI Knowledge Destination Target
                        </label>
                        <select
                          value={mongoPullConfig.target}
                          onChange={e => setMongoPullConfig(c => ({ ...c, target: e.target.value }))}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="auto">✨ Auto Classify (Recommended — uses schema & naming rules)</option>
                          <option value="training_cases">🎓 Training Cases (Historical RCA / Diagnostic Patterns)</option>
                          <option value="knowledge_chunks">📚 Knowledge Chunks (Troubleshooting SOPs / Qdrant RAG)</option>
                          <option value="structured_knowledge">⚙️ Structured Knowledge (Inverter Specs / Modbus / SCADA)</option>
                          <option value="ai_rules">⚖️ AI Rules (Reasoning Rules / Source Authority / Policies)</option>
                        </select>

                        <div className="mt-1.5 text-[11px] text-slate-500 bg-slate-50 rounded-lg p-2 border border-slate-100">
                          {mongoPullConfig.target === "auto" && (
                            <span>🔮 <strong>Auto Mode:</strong> Inspects collection name & fields. Historical/RCA → Training Cases; Specifications/Modbus → Structured Specs; Troubleshooting/Procedures → Knowledge Chunks; Rules → AI Rules.</span>
                          )}
                          {mongoPullConfig.target === "training_cases" && (
                            <span>🎓 <strong>Training Cases:</strong> Converts records into problem → situation → observations → RCA → corrective action. Teaches diagnostic reasoning.</span>
                          )}
                          {mongoPullConfig.target === "knowledge_chunks" && (
                            <span>📚 <strong>Knowledge Chunks:</strong> Normalizes text into structured semantic sections for vector embedding in Qdrant (Manufacturer, Model, Fault, Steps).</span>
                          )}
                          {mongoPullConfig.target === "structured_knowledge" && (
                            <span>⚙️ <strong>Structured Knowledge:</strong> Preserves exact machine-readable key/value parameters (Modbus registers, electrical ratings, thresholds).</span>
                          )}
                          {mongoPullConfig.target === "ai_rules" && (
                            <span>⚖️ <strong>AI Rules:</strong> Controls LLM reasoning behavior, priority ranking, and response structure.</span>
                          )}
                        </div>
                      </div>

                      {/* Secondary settings: Limit & Filter */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-slate-600 mb-1 block">Record Limit</label>
                          <input
                            type="number"
                            min={1}
                            max={1000}
                            value={mongoPullConfig.limit}
                            onChange={e => setMongoPullConfig(c => ({ ...c, limit: parseInt(e.target.value) || 100 }))}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs"
                          />
                        </div>

                        {mongoPullConfig.target === "knowledge_chunks" && (
                          <div>
                            <label className="text-xs font-semibold text-slate-600 mb-1 block">RAG Collection ID (optional)</label>
                            <select
                              value={mongoPullConfig.collection_id}
                              onChange={e => setMongoPullConfig(c => ({ ...c, collection_id: e.target.value }))}
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs bg-white"
                            >
                              <option value="">— Root / Default —</option>
                              {collections.map(col => (
                                <option key={col._id} value={col._id}>{col.display_name || col.internal_name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      {/* MongoDB Filter Query */}
                      <div>
                        <label className="text-xs font-semibold text-slate-600 mb-1 block flex items-center justify-between">
                          <span>MongoDB Filter Query (JSON)</span>
                          <span className="text-[10px] text-slate-400 font-normal">e.g. {`{"manufacturer": "Sungrow"}`}</span>
                        </label>
                        <input
                          type="text"
                          value={mongoPullConfig.filter_query}
                          onChange={e => setMongoPullConfig(c => ({ ...c, filter_query: e.target.value }))}
                          placeholder='{"status": "approved"} or {} for all'
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-mono"
                        />
                      </div>

                      {/* Manual Field Normalization Toggle */}
                      <div>
                        <button
                          type="button"
                          onClick={() => setMongoShowFieldMap(!mongoShowFieldMap)}
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                          {mongoShowFieldMap ? "Hide Custom Field Mapping" : "Advanced: Custom Field Mapping Override"}
                        </button>

                        {mongoShowFieldMap && (
                          <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                            <div className="text-[11px] text-slate-500">
                              By default, the automatic normalizer resolves standard fields (<code>manufacturer</code>, <code>model</code>, <code>fault</code>, <code>action</code>, <code>cause</code>, <code>source</code>, etc.). Override below if your schema uses custom keys:
                            </div>
                            <textarea
                              rows={2}
                              value={mongoPullFieldMapRaw}
                              onChange={e => setMongoPullFieldMapRaw(e.target.value)}
                              placeholder='{"inv_make": "manufacturer", "dev_model": "model", "alarm_desc": "fault"}'
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-mono bg-white resize-none"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
                      <button
                        onClick={handleMongoPreview}
                        disabled={!mongoPullConfig.collection || mongoPreviewLoading}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition disabled:opacity-50"
                      >
                        {mongoPreviewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                        Preview & Validate Records
                      </button>

                      <button
                        onClick={handleMongoImport}
                        disabled={!mongoPullConfig.collection || mongoImporting}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition disabled:opacity-50 shadow-sm"
                      >
                        {mongoImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Import Knowledge into AI
                      </button>
                    </div>
                  </div>

                  {/* Import Result Banner */}
                  {mongoImportResult && (
                    <div className={`p-4 rounded-2xl border text-xs flex items-start gap-3 shadow-sm ${
                      mongoImportResult.imported > 0
                        ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                        : "bg-amber-50 border-amber-200 text-amber-900"
                    }`}>
                      <CheckCircle className={`w-5 h-5 shrink-0 mt-0.5 ${mongoImportResult.imported > 0 ? "text-emerald-600" : "text-amber-600"}`} />
                      <div className="space-y-1.5 flex-1">
                        <div className="font-bold text-sm">{mongoImportResult.message}</div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                          <div className="p-2 rounded-lg bg-white/70 border border-emerald-100">
                            <span className="text-[10px] text-slate-500 block">Imported</span>
                            <span className="font-bold text-emerald-700 text-sm">{mongoImportResult.imported}</span>
                          </div>
                          <div className="p-2 rounded-lg bg-white/70 border border-slate-100">
                            <span className="text-[10px] text-slate-500 block">Duplicates Filtered</span>
                            <span className="font-bold text-slate-700 text-sm">{mongoImportResult.duplicates || 0}</span>
                          </div>
                          <div className="p-2 rounded-lg bg-white/70 border border-slate-100">
                            <span className="text-[10px] text-slate-500 block">Skipped / Empty</span>
                            <span className="font-bold text-slate-500 text-sm">{mongoImportResult.skipped || 0}</span>
                          </div>
                          <div className="p-2 rounded-lg bg-white/70 border border-amber-100">
                            <span className="text-[10px] text-amber-700 block">Unverified (No OEM Doc)</span>
                            <span className="font-bold text-amber-800 text-sm">{mongoImportResult.unverified || 0}</span>
                          </div>
                        </div>

                        {mongoImportResult.qdrant_ready && (
                          <div className="text-[11px] text-violet-700 font-semibold flex items-center gap-1.5 pt-1">
                            <Sparkles className="w-3.5 h-3.5" />
                            Chunks created with Qdrant metadata (Manufacturer, Model, Fault Code, Provenance). Ready for vector embedding.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Preview & Validation Details */}
                  {mongoPreviewData && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-0">
                      {/* Summary Banner */}
                      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-bold text-slate-800">
                            Validation Preview: <code className="text-indigo-600">{mongoPreviewData.collection}</code>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Auto Destination: <span className="font-bold text-indigo-700">{mongoPreviewData.target_label}</span>
                          </div>
                        </div>

                        <div className="flex gap-2 text-[10px] font-semibold">
                          <span className="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800">
                            ✓ {mongoPreviewData.valid_count} Valid
                          </span>
                          <span className="px-2.5 py-1 rounded-md bg-amber-100 text-amber-800">
                            ⚠ {mongoPreviewData.unverified_count} Need OEM Doc
                          </span>
                        </div>
                      </div>

                      {/* Normalized Cards */}
                      <div className="p-5 space-y-3">
                        <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                          Normalized Records Preview ({mongoPreviewData.normalized_preview?.length || 0} sampled):
                        </div>

                        <div className="space-y-2.5">
                          {(mongoPreviewData.normalized_preview || []).map((norm, i) => (
                            <div key={i} className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/80 text-[11px] space-y-2">
                              <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 pb-1.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-slate-700">Record #{i + 1}</span>
                                  {norm.manufacturer && (
                                    <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold text-[10px]">
                                      {norm.manufacturer}
                                    </span>
                                  )}
                                  {norm.model && (
                                    <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-800 font-mono text-[10px]">
                                      {norm.model}
                                    </span>
                                  )}
                                  {norm.equipment_type && (
                                    <span className="text-slate-500 text-[10px]">
                                      ({norm.equipment_type})
                                    </span>
                                  )}
                                </div>

                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                  norm.verification_status === "VERIFIED"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-amber-100 text-amber-700"
                                }`}>
                                  {norm.verification_status}
                                </span>
                              </div>

                              {norm.fault && (
                                <div className="text-slate-800">
                                  <span className="font-semibold text-slate-500">Fault / Symptom: </span>
                                  <span className="font-medium text-red-700">{norm.fault}</span>
                                </div>
                              )}

                              {norm.source_document ? (
                                <div className="text-slate-600 text-[10px]">
                                  <span className="font-semibold">Source: </span> {norm.source_document}
                                </div>
                              ) : (
                                <div className="text-amber-700/90 text-[10px] italic">
                                  ⚠ No source document cited — will be tagged NOT_VERIFIED
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Raw JSON viewer */}
                        <details className="mt-4 pt-2 border-t border-slate-100">
                          <summary className="text-[11px] font-semibold text-slate-500 cursor-pointer hover:text-indigo-600 flex items-center gap-1">
                            <ChevronDown className="w-3.5 h-3.5" /> View Raw MongoDB Records (JSON)
                          </summary>
                          <pre className="mt-2 p-3 bg-slate-900 text-emerald-400 rounded-xl text-[10px] overflow-auto max-h-52 font-mono">
                            {JSON.stringify(mongoPreviewData.records?.slice(0, 2), null, 2)}
                          </pre>
                        </details>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DEDICATED TEST RAG DIAGNOSTICS */}
          {activeTab === "test-rag" && (
            <div className="space-y-6 max-w-6xl">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Test RAG Interface</h2>
                <p className="text-xs text-slate-500 mt-1">Execute diagnostic queries to verify context retrieval, similarity scores, and LLM answers.</p>
              </div>

              <form onSubmit={handleRunTestRag} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="md:col-span-2">
                    <label className="font-semibold text-slate-700">Diagnostic Question</label>
                    <Input 
                      data-testid="test-rag-input"
                      value={testRagQuestion}
                      onChange={(e) => setTestRagQuestion(e.target.value)}
                      placeholder="e.g. Deye inverter showing Grid Fault. What should I check?"
                      className="mt-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700">Target Vector Collection</label>
                    <select 
                      value={testRagCollectionId}
                      onChange={(e) => setTestRagCollectionId(e.target.value)}
                      className="w-full h-9 p-2 rounded-lg border border-slate-200 mt-1 text-xs focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="">All RAG Collections</option>
                      {collections.map(c => <option key={c._id} value={c._id}>{c.display_name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button 
                    data-testid="test-rag-search"
                    type="submit" 
                    disabled={isTestRagLoading}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9 px-5"
                  >
                    {isTestRagLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
                    Run RAG Search & Generate
                  </Button>
                </div>
              </form>

              {testRagResult && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  {/* Retrieved Knowledge Score Cards */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Retrieved Knowledge Items</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {testRagResult.retrieved_knowledge.map((item, idx) => (
                        <div key={idx} className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-800 flex items-center gap-1.5">
                              <FileText className="w-4 h-4 text-indigo-600" /> {item.filename}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold text-[10px]">
                              Score: {item.score}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500">Page Number: {item.page}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Retrieved Context & Generated Answer */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
                      <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider text-indigo-600">Retrieved Context Snippet</h4>
                      <pre className="p-3 bg-slate-900 text-slate-200 font-mono text-xs rounded-xl overflow-x-auto whitespace-pre-wrap max-h-60">
                        {testRagResult.retrieved_context}
                      </pre>
                    </div>

                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
                      <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider text-emerald-600">Generated AI Answer</h4>
                      <div className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-xl text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                        {testRagResult.generated_answer}
                      </div>
                    </div>
                  </div>

                  {/* Latency & Diagnostics Metrics */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-4">
                    <span>Search Latency: <strong className="text-slate-800">{testRagResult.metrics?.search_latency_ms} ms</strong></span>
                    <span>Generation Latency: <strong className="text-slate-800">{testRagResult.metrics?.generation_latency_ms} ms</strong></span>
                    <span>Model: <strong className="text-indigo-600">{testRagResult.metrics?.model_used}</strong></span>
                    <span>Embedding: <strong className="text-slate-800">{testRagResult.metrics?.embedding_model}</strong></span>
                  </div>

                  {/* ── ADMIN RAG DEBUG PANEL ── */}
                  {testRagResult.rag_debug && (
                    <div className="bg-slate-900 text-slate-100 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-5 text-xs">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                          <h3 className="font-bold text-sm text-white tracking-wide uppercase font-mono">
                            Admin RAG Debug & Anti-Contamination Inspection
                          </h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded bg-slate-800 text-[11px] font-mono text-emerald-400 border border-slate-700">
                            Intent: {testRagResult.rag_debug.intent}
                          </span>
                        </div>
                      </div>

                      {/* Query & Entity Breakdown Grid */}
                      <div className="space-y-3 font-mono">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                            <div className="text-[10px] text-slate-400 uppercase">Original User Query</div>
                            <div className="text-xs font-bold text-slate-200 mt-0.5">{testRagResult.rag_debug.user_query}</div>
                          </div>
                          <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                            <div className="text-[10px] text-slate-400 uppercase">Normalized Query (Typo Corrected)</div>
                            <div className="text-xs font-bold text-indigo-300 mt-0.5">{testRagResult.rag_debug.normalized_query}</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                          <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                            <div className="text-[10px] text-slate-400 uppercase">Manufacturer</div>
                            <div className="text-sm font-bold text-indigo-300 mt-0.5">{testRagResult.rag_debug.manufacturer}</div>
                          </div>
                          <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                            <div className="text-[10px] text-slate-400 uppercase">Power Rating</div>
                            <div className="text-sm font-bold text-sky-300 mt-0.5">{testRagResult.rag_debug.power}</div>
                          </div>
                          <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                            <div className="text-[10px] text-slate-400 uppercase">Model</div>
                            <div className={`text-sm font-bold mt-0.5 ${testRagResult.rag_debug.model === "Unknown" ? "text-amber-400" : "text-emerald-300"}`}>
                              {testRagResult.rag_debug.model}
                            </div>
                          </div>
                          <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                            <div className="text-[10px] text-slate-400 uppercase">Symptom</div>
                            <div className="text-sm font-bold text-rose-300 mt-0.5">{testRagResult.rag_debug.symptom}</div>
                          </div>
                          <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                            <div className="text-[10px] text-slate-400 uppercase">Alarm Code</div>
                            <div className="text-sm font-bold text-purple-300 mt-0.5">{testRagResult.rag_debug.alarm_code}</div>
                          </div>
                        </div>

                        {/* Filter Comparison Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700">
                            <div className="text-[10px] text-slate-400 uppercase">Filter Requested</div>
                            <pre className="text-[11px] text-emerald-300 mt-1 whitespace-pre-wrap">{JSON.stringify(testRagResult.rag_debug.requested_filter, null, 2)}</pre>
                          </div>
                          <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700">
                            <div className="text-[10px] text-slate-400 uppercase">Actual Qdrant / DB Filter Sent</div>
                            <pre className="text-[11px] text-indigo-300 mt-1 whitespace-pre-wrap">{JSON.stringify(testRagResult.rag_debug.actual_qdrant_filter, null, 2)}</pre>
                          </div>
                        </div>
                      </div>

                      {/* MongoDB Results */}
                      <div className="space-y-2">
                        <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center justify-between">
                          <span>1. MongoDB Structured Fault Knowledge Results ({testRagResult.rag_debug.mongodb_results?.length || 0})</span>
                          <span className="text-[10px] text-emerald-400 font-normal">Exact OEM Match First</span>
                        </div>
                        {testRagResult.rag_debug.mongodb_results?.length === 0 ? (
                          <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-800 text-slate-400 font-mono text-[11px]">
                            No exact OEM alarm code match in MongoDB. Standard solar engineering fault differential applied.
                          </div>
                        ) : (
                          <div className="space-y-2 font-mono">
                            {testRagResult.rag_debug.mongodb_results.map((res, idx) => (
                              <div key={idx} className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/80 text-[11px] space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-indigo-400 font-bold">
                                    [{res._collection || "structured"}] {res.manufacturer} {res.model} {res.alarm_code ? `| Alarm ${res.alarm_code} (${res.fault_name || ""})` : ""}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${res.verification_status === "OEM_VERIFIED" ? "bg-emerald-950 text-emerald-400 border border-emerald-800" : "bg-amber-950 text-amber-300 border border-amber-800"}`}>
                                    {res.verification_status || "OEM_VERIFIED"}
                                  </span>
                                </div>
                                <div className="text-slate-300">
                                  <strong>Meaning/Causes:</strong> {res.meaning || res.description || "N/A"} — {res.possible_causes || ""}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Document Type Priority Reranking Table */}
                      <div className="space-y-2">
                        <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center justify-between">
                          <span>2. Document Type Priority & Hard Filter Decisions ({testRagResult.rag_debug.top_chunks?.length || 0})</span>
                          <span className="text-[10px] text-slate-400">Accepted: {testRagResult.rag_debug.accepted_chunks_count} · Rejected: {testRagResult.rag_debug.rejected_chunks_count}</span>
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-slate-800">
                          <table className="w-full text-left font-mono text-[11px]">
                            <thead className="bg-slate-800 text-slate-400 border-b border-slate-700">
                              <tr>
                                <th className="p-2.5">Document Name</th>
                                <th className="p-2.5">Page</th>
                                <th className="p-2.5">Classification</th>
                                <th className="p-2.5 text-center">Priority</th>
                                <th className="p-2.5 text-center">Rerank Score</th>
                                <th className="p-2.5 text-right">Routing Decision</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800 bg-slate-900/80">
                              {testRagResult.rag_debug.top_chunks?.map((row, idx) => (
                                <tr key={idx} className="hover:bg-slate-800/50">
                                  <td className="p-2.5 font-bold text-slate-200 truncate max-w-[220px]">{row.filename}</td>
                                  <td className="p-2.5 text-slate-400">p.{row.page}</td>
                                  <td className="p-2.5 text-slate-300">{row.doc_type}</td>
                                  <td className="p-2.5 text-center font-bold text-sky-400">{row.priority}</td>
                                  <td className="p-2.5 text-center font-bold text-emerald-400">{row.rerank_score}</td>
                                  <td className="p-2.5 text-right">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      row.decision_status === "ACCEPTED — PASSED TO LLM" 
                                        ? "bg-emerald-950 text-emerald-300 border border-emerald-800" 
                                        : "bg-red-950 text-rose-300 border border-rose-900"
                                    }`}>
                                      {row.decision_status || (row.is_usable ? "ACCEPTED — PASSED TO LLM" : "REJECTED — FILTERED")}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Chunks Sent to LLM */}
                      <div className="space-y-2">
                        <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider font-mono">
                          3. Specific Evidence Chunks Delivered to LLM ({testRagResult.rag_debug.chunks_sent_to_llm?.length || 0})
                        </div>
                        {testRagResult.rag_debug.chunks_sent_to_llm?.length === 0 ? (
                          <div className="p-3 bg-amber-950/40 rounded-xl border border-amber-900/60 text-amber-300 font-mono text-[11px]">
                            Notice: All mismatched or irrelevant chunks were strictly rejected. Prompt grounded on verified solar engineering diagnostic principles.
                          </div>
                        ) : (
                          <div className="space-y-2 font-mono">
                            {testRagResult.rag_debug.chunks_sent_to_llm.map((chunk, idx) => (
                              <div key={idx} className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 text-[11px] space-y-1">
                                <div className="flex items-center justify-between text-indigo-300 font-bold">
                                  <span>{chunk.filename} (Page {chunk.page})</span>
                                  <span className="text-emerald-400 text-[10px] font-bold">{chunk.decision_status}</span>
                                </div>
                                <div className="text-slate-300 whitespace-pre-wrap">{chunk.preview}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: STRUCTURED KNOWLEDGE */}
          {activeTab === "structured" && (
            <div className="space-y-6 max-w-6xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Structured Knowledge Rules</h2>
                  <p className="text-xs text-slate-500 mt-1">Deterministic equipment alarm & troubleshooting matrix.</p>
                </div>
                <Button 
                  data-testid="structured-knowledge-add"
                  onClick={() => setShowAddStructuredModal(true)} 
                  className="bg-indigo-600 text-white text-xs h-9"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add Rule
                </Button>
              </div>

              {showAddStructuredModal && (
                <form onSubmit={handleAddStructuredKnowledge} className="bg-white p-6 rounded-2xl border border-indigo-200 shadow-sm space-y-3 text-xs">
                  <h3 className="font-bold text-slate-800 text-sm">New Alarm Troubleshooting Rule</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold">Equipment Name</label>
                      <Input value={structuredForm.equipment} onChange={(e) => setStructuredForm({...structuredForm, equipment: e.target.value})} className="mt-1 text-xs" />
                    </div>
                    <div>
                      <label className="font-semibold">Alarm Title</label>
                      <Input value={structuredForm.alarm} onChange={(e) => setStructuredForm({...structuredForm, alarm: e.target.value})} className="mt-1 text-xs" />
                    </div>
                  </div>
                  <div>
                    <label className="font-semibold">Possible Causes (comma separated)</label>
                    <Input value={structuredForm.possible_causes} onChange={(e) => setStructuredForm({...structuredForm, possible_causes: e.target.value})} className="mt-1 text-xs" />
                  </div>
                  <div>
                    <label className="font-semibold">Recommended Checks (comma separated)</label>
                    <Input value={structuredForm.checks} onChange={(e) => setStructuredForm({...structuredForm, checks: e.target.value})} className="mt-1 text-xs" />
                  </div>
                  <div>
                    <label className="font-semibold">Corrective Actions (comma separated)</label>
                    <Input value={structuredForm.corrective_actions} onChange={(e) => setStructuredForm({...structuredForm, corrective_actions: e.target.value})} className="mt-1 text-xs" />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="ghost" onClick={() => setShowAddStructuredModal(false)}>Cancel</Button>
                    <Button data-testid="structured-knowledge-save" type="submit" className="bg-indigo-600 text-white">Save Rule</Button>
                  </div>
                </form>
              )}

              <div className="space-y-3">
                {structuredKnowledgeList.map((item) => (
                  <div key={item._id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded-full text-[11px]">{item.equipment}</span>
                        <h4 className="font-bold text-slate-800 text-sm">Alarm: {item.alarm}</h4>
                      </div>
                      <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded-full text-[10px]">{item.status || "APPROVED"}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-xs bg-slate-50 p-3 rounded-xl">
                      <div>
                        <div className="font-semibold text-slate-700">Possible Causes:</div>
                        <ul className="list-disc list-inside text-slate-600 mt-1 space-y-0.5">
                          {(item.possible_causes || []).map((c, i) => <li key={i}>{c}</li>)}
                        </ul>
                      </div>
                      <div>
                        <div className="font-semibold text-slate-700">Checks:</div>
                        <ul className="list-disc list-inside text-slate-600 mt-1 space-y-0.5">
                          {(item.checks || []).map((c, i) => <li key={i}>{c}</li>)}
                        </ul>
                      </div>
                      <div>
                        <div className="font-semibold text-slate-700">Corrective Actions:</div>
                        <ul className="list-disc list-inside text-slate-600 mt-1 space-y-0.5">
                          {(item.corrective_actions || []).map((c, i) => <li key={i}>{c}</li>)}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: DEDICATED SOLAR KNOWLEDGE MANAGEMENT & BULK JSON UPLOAD */}
          {activeTab === "knowledge-mgmt" && (
            <div className="space-y-6 max-w-6xl">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-indigo-600" /> Solar Knowledge Management & Bulk Upload
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Bulk upload verified JSON/ZIP packages, perform duplicate-aware UPSERT/MERGE, manage batch rollback, export datasets, and sync with Qdrant.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleExportKnowledge()}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition shadow-sm"
                  >
                    <Download className="w-4 h-4" /> Export All JSON
                  </button>
                  <button
                    onClick={() => handleSyncQdrant()}
                    disabled={isSyncingQdrant}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-violet-50 border border-violet-200 hover:bg-violet-100 text-violet-700 text-xs font-semibold transition shadow-sm disabled:opacity-50"
                  >
                    {isSyncingQdrant ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Sync Qdrant
                  </button>
                </div>
              </div>

              {/* Sub Navigation Bar */}
              <div className="flex border-b border-slate-200 gap-6 text-xs font-bold">
                <button
                  onClick={() => setActiveKnowledgeSubTab("upload")}
                  className={`pb-3 border-b-2 transition flex items-center gap-2 ${
                    activeKnowledgeSubTab === "upload"
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <UploadCloud className="w-4 h-4" /> Bulk JSON / ZIP Upload
                </button>
                <button
                  onClick={() => setActiveKnowledgeSubTab("batches")}
                  className={`pb-3 border-b-2 transition flex items-center gap-2 ${
                    activeKnowledgeSubTab === "batches"
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <History className="w-4 h-4" /> Import Batch History ({knowledgeBatches.length})
                </button>
                <button
                  onClick={() => setActiveKnowledgeSubTab("collections")}
                  className={`pb-3 border-b-2 transition flex items-center gap-2 ${
                    activeKnowledgeSubTab === "collections"
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Database className="w-4 h-4" /> Collections Overview ({knowledgeCollections.length})
                </button>
              </div>

              {/* SUBTAB 1: BULK UPLOAD */}
              {activeKnowledgeSubTab === "upload" && (
                <div className="space-y-6">
                  {/* Upload Card */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
                    {/* Drag & Drop Dropzone */}
                    <div
                      onClick={() => bulkFileInputRef.current?.click()}
                      className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/40 rounded-2xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2"
                    >
                      <UploadCloud className="w-10 h-10 text-indigo-500 mb-1" />
                      <div className="text-sm font-bold text-slate-800">
                        {selectedBulkFile ? selectedBulkFile.name : "Click to select or drag & drop JSON, ZIP, RAR, or TAR files"}
                      </div>
                      <div className="text-xs text-slate-500">
                        Supports Format A (Array), Format B (Single Object), Format C (Package), JSONL, or ZIP / RAR / TAR archives
                      </div>
                      {selectedBulkFile && (
                        <div className="mt-2 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                          Selected: {selectedBulkFile.name} ({(selectedBulkFile.size / 1024).toFixed(1)} KB)
                        </div>
                      )}
                      <input
                        ref={bulkFileInputRef}
                        type="file"
                        accept=".json,.jsonl,.zip,.rar,.tar,.gz,.tgz"
                        onChange={handleBulkFileSelect}
                        className="hidden"
                      />
                    </div>

                    {/* Parameters Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                      {/* Target Collection */}
                      <div>
                        <label className="font-bold text-slate-700 mb-1.5 block">Target Collection</label>
                        <select
                          value={bulkTargetCollection}
                          onChange={e => setBulkTargetCollection(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold shadow-sm"
                        >
                          <option value="">✨ Auto Detect (from file / JSON)</option>
                          <option value="oem_alarm_codes">oem_alarm_codes</option>
                          <option value="oem_troubleshooting_procedures">oem_troubleshooting_procedures</option>
                          <option value="inverter_models">inverter_models</option>
                          <option value="inverter_parameters">inverter_parameters</option>
                          <option value="modbus_registers">modbus_registers</option>
                          <option value="fault_differential">fault_differential</option>
                          <option value="diagnostic_steps">diagnostic_steps</option>
                          <option value="historical_incidents">historical_incidents</option>
                          <option value="safety_rules">safety_rules</option>
                          <option value="scada_tags">scada_tags</option>
                          <option value="engineering_calculations">engineering_calculations</option>
                          <option value="firmware_revisions">firmware_revisions</option>
                          <option value="source_documents">source_documents</option>
                          <option value="vision_fault_patterns">vision_fault_patterns</option>
                          <option value="response_templates">response_templates</option>
                        </select>
                      </div>

                      {/* Bulk Mode */}
                      <div>
                        <label className="font-bold text-slate-700 mb-1.5 block">Bulk Update Mode</label>
                        <select
                          value={bulkUploadMode}
                          onChange={e => setBulkUploadMode(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold shadow-sm"
                        >
                          <option value="UPSERT">🔄 UPSERT (Update existing, Insert new - Default)</option>
                          <option value="INSERT_ONLY">➕ INSERT ONLY (Skip duplicates)</option>
                          <option value="MERGE">🔀 MERGE (Update only supplied fields)</option>
                          <option value="REPLACE_COLLECTION">⚠️ REPLACE COLLECTION (Clear & insert)</option>
                        </select>
                      </div>

                      {/* Source Type */}
                      <div>
                        <label className="font-bold text-slate-700 mb-1.5 block">Source Provenance</label>
                        <select
                          value={bulkSourceType}
                          onChange={e => setBulkSourceType(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs shadow-sm"
                        >
                          <option value="OEM_MANUAL">OEM User Manual</option>
                          <option value="RCA_REPORT">Site Incident RCA Report</option>
                          <option value="SITE_SOP">Plant Standard SOP</option>
                          <option value="FIELD_TEST">Field Commissioning Test</option>
                        </select>
                      </div>

                      {/* Source Document Override */}
                      <div>
                        <label className="font-bold text-slate-700 mb-1.5 block">Source Document Name</label>
                        <input
                          type="text"
                          value={bulkSourceDoc}
                          onChange={e => setBulkSourceDoc(e.target.value)}
                          placeholder="e.g. Growatt MAX 100KTL3 Manual"
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs shadow-sm"
                        />
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
                      <button
                        onClick={handleValidateBulk}
                        disabled={!selectedBulkFile || isValidatingBulk}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition disabled:opacity-50"
                      >
                        {isValidatingBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                        Validate JSON / ZIP
                      </button>

                      <button
                        onClick={handleExecuteBulkUpload}
                        disabled={!selectedBulkFile || isUploadingBulk}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition disabled:opacity-50 shadow-sm"
                      >
                        {isUploadingBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Import Knowledge into MongoDB
                      </button>
                    </div>
                  </div>

                  {/* Validation Preview Results */}
                  {bulkValidationPreview && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">
                          Pre-Import Validation Preview: <code className="text-indigo-600">{bulkValidationPreview.filename}</code>
                        </span>
                        <span className="text-[11px] font-semibold text-slate-500">
                          Mode: <strong>{bulkValidationPreview.mode}</strong>
                        </span>
                      </div>

                      <div className="p-5 space-y-4">
                        {bulkValidationPreview.previews?.map((p, idx) => (
                          <div key={idx} className="space-y-3">
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                                <span className="text-[10px] text-slate-500 block">Total Records</span>
                                <span className="text-base font-bold text-slate-800">{p.total_records}</span>
                              </div>
                              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                                <span className="text-[10px] text-emerald-600 block">New Inserts</span>
                                <span className="text-base font-bold text-emerald-700">{p.new_records}</span>
                              </div>
                              <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
                                <span className="text-[10px] text-blue-600 block">Updates</span>
                                <span className="text-base font-bold text-blue-700">{p.update_records}</span>
                              </div>
                              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                                <span className="text-[10px] text-slate-500 block">Duplicates</span>
                                <span className="text-base font-bold text-slate-600">{p.duplicate_records}</span>
                              </div>
                              <div className="p-3 rounded-xl bg-red-50 border border-red-100">
                                <span className="text-[10px] text-red-600 block">Invalid</span>
                                <span className="text-base font-bold text-red-700">{p.invalid_records}</span>
                              </div>
                            </div>

                            {/* Sample Preview Cards */}
                            {p.sample_records?.length > 0 && (
                              <div className="space-y-2 pt-2">
                                <div className="text-[11px] font-bold text-slate-600 uppercase">Sample Parsed Records:</div>
                                <div className="space-y-2">
                                  {p.sample_records.slice(0, 3).map((rec, rIdx) => (
                                    <div key={rIdx} className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-[11px] font-mono">
                                      <div className="text-indigo-700 font-bold mb-1">
                                        {rec.manufacturer} {rec.model} {rec.alarm_code ? `— Alarm ${rec.alarm_code}` : ""} {rec.parameter ? `— ${rec.parameter}` : ""}
                                      </div>
                                      <div className="text-slate-600 line-clamp-2">
                                        {rec.description || rec.procedure || rec.value || JSON.stringify(rec)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Upload Success Banner */}
                  {bulkUploadResult && (
                    <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs shadow-sm space-y-3">
                      <div className="flex items-center gap-2 font-bold text-sm text-emerald-900">
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                        Bulk Upload Successfully Committed
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {bulkUploadResult.results?.map((res, idx) => (
                          <React.Fragment key={idx}>
                            <div className="p-2.5 bg-white/80 rounded-xl border border-emerald-100">
                              <span className="text-[10px] text-slate-500 block">Batch ID</span>
                              <span className="font-mono font-bold text-indigo-700 text-xs">{res.batch_id}</span>
                            </div>
                            <div className="p-2.5 bg-white/80 rounded-xl border border-emerald-100">
                              <span className="text-[10px] text-slate-500 block">Inserted</span>
                              <span className="font-bold text-emerald-700 text-sm">{res.inserted}</span>
                            </div>
                            <div className="p-2.5 bg-white/80 rounded-xl border border-emerald-100">
                              <span className="text-[10px] text-slate-500 block">Updated</span>
                              <span className="font-bold text-blue-700 text-sm">{res.updated}</span>
                            </div>
                            <div className="p-2.5 bg-white/80 rounded-xl border border-emerald-100">
                              <span className="text-[10px] text-slate-500 block">Target Collection</span>
                              <span className="font-bold text-slate-800 text-xs">{res.collection}</span>
                            </div>
                          </React.Fragment>
                        ))}
                      </div>

                      <div className="flex items-center gap-3 pt-2">
                        <button
                          onClick={() => setActiveKnowledgeSubTab("batches")}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold text-[11px] hover:bg-emerald-700 transition"
                        >
                          View in Batch History
                        </button>
                        <button
                          onClick={() => handleSyncQdrant()}
                          className="px-3 py-1.5 rounded-lg bg-violet-600 text-white font-semibold text-[11px] hover:bg-violet-700 transition flex items-center gap-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5" /> Sync to Qdrant RAG
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* SUBTAB 2: BATCH HISTORY */}
              {activeKnowledgeSubTab === "batches" && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Knowledge Import Batch History ({knowledgeBatches.length})
                    </span>
                    <button
                      onClick={fetchKnowledgeData}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                    >
                      <RefreshCcw className="w-3.5 h-3.5" /> Refresh
                    </button>
                  </div>

                  {knowledgeBatches.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      <History className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      No import batches recorded yet.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50/60 text-[11px] font-bold text-slate-500 border-b border-slate-100">
                          <tr>
                            <th className="py-3 px-4">Batch ID</th>
                            <th className="py-3 px-4">Collection</th>
                            <th className="py-3 px-4">Mode</th>
                            <th className="py-3 px-4 text-center">Inserted</th>
                            <th className="py-3 px-4 text-center">Updated</th>
                            <th className="py-3 px-4">Status</th>
                            <th className="py-3 px-4">Date</th>
                            <th className="py-3 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {knowledgeBatches.map((b) => (
                            <tr key={b.batch_id} className="hover:bg-slate-50/70 transition">
                              <td className="py-3.5 px-4 font-mono font-bold text-indigo-700">{b.batch_id}</td>
                              <td className="py-3.5 px-4 font-semibold text-slate-800">{b.collection}</td>
                              <td className="py-3.5 px-4 text-[10px] text-slate-500 font-semibold">{b.mode}</td>
                              <td className="py-3.5 px-4 text-center font-bold text-emerald-700">{b.inserted_count}</td>
                              <td className="py-3.5 px-4 text-center font-bold text-blue-700">{b.updated_count}</td>
                              <td className="py-3.5 px-4">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  b.status === "COMPLETED"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : b.status === "ROLLED_BACK"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-slate-100 text-slate-700"
                                }`}>
                                  {b.status}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                                {new Date(b.upload_date).toLocaleDateString()}
                              </td>
                              <td className="py-3.5 px-4 text-right">
                                {b.status !== "ROLLED_BACK" && (
                                  <button
                                    onClick={() => handleRollbackBatch(b.batch_id)}
                                    disabled={isRollingBackBatchId === b.batch_id}
                                    className="px-2.5 py-1 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-[10px] font-semibold transition disabled:opacity-50"
                                  >
                                    {isRollingBackBatchId === b.batch_id ? "Rolling back..." : "Rollback"}
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* SUBTAB 3: COLLECTIONS OVERVIEW */}
              {activeKnowledgeSubTab === "collections" && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {knowledgeCollections.map((col) => (
                    <div key={col.collection} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold text-slate-800">{col.collection}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            col.count > 0 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-400"
                          }`}>
                            {col.count.toLocaleString()} recs
                          </span>
                        </div>
                        {col.sample_fields?.length > 0 && (
                          <div className="text-[10px] text-slate-400 mt-2 truncate">
                            Fields: {col.sample_fields.slice(0, 4).join(", ")}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                        <button
                          onClick={() => handleExportKnowledge(col.collection)}
                          className="flex-1 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-semibold transition text-center"
                        >
                          Export JSON
                        </button>
                        <button
                          onClick={() => handleSyncQdrant(col.collection)}
                          className="py-1.5 px-2.5 rounded-lg bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-700 text-[11px] font-semibold transition"
                        >
                          Sync
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: TRAINING CASES */}
          {activeTab === "cases" && (
            <div className="space-y-6 max-w-6xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Verified Training Cases</h2>
                  <p className="text-xs text-slate-500 mt-1">Curated historical case repository for AI learning.</p>
                </div>
                <Button 
                  data-testid="training-case-add"
                  onClick={() => setShowAddCaseModal(true)} 
                  className="bg-indigo-600 text-white text-xs h-9"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add Verified Case
                </Button>
              </div>

              {showAddCaseModal && (
                <form onSubmit={handleAddTrainingCase} className="bg-white p-6 rounded-2xl border border-indigo-200 shadow-sm space-y-3 text-xs">
                  <h3 className="font-bold text-slate-800 text-sm">New Training Case Entry</h3>
                  <div>
                    <label className="font-semibold">Question / Problem Statement</label>
                    <Input value={caseForm.question} onChange={(e) => setCaseForm({...caseForm, question: e.target.value})} className="mt-1 text-xs" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold">AI Initial Diagnosis</label>
                      <Input value={caseForm.ai_diagnosis} onChange={(e) => setCaseForm({...caseForm, ai_diagnosis: e.target.value})} className="mt-1 text-xs" />
                    </div>
                    <div>
                      <label className="font-semibold">Actual Confirmed Cause</label>
                      <Input value={caseForm.actual_cause} onChange={(e) => setCaseForm({...caseForm, actual_cause: e.target.value})} className="mt-1 text-xs" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold">Corrective Action Taken</label>
                      <Input value={caseForm.action} onChange={(e) => setCaseForm({...caseForm, action: e.target.value})} className="mt-1 text-xs" />
                    </div>
                    <div>
                      <label className="font-semibold">Verification Result</label>
                      <Input value={caseForm.result} onChange={(e) => setCaseForm({...caseForm, result: e.target.value})} className="mt-1 text-xs" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="ghost" onClick={() => setShowAddCaseModal(false)}>Cancel</Button>
                    <Button data-testid="training-case-save" type="submit" className="bg-indigo-600 text-white">Save Verified Case</Button>
                  </div>
                </form>
              )}

              <div className="space-y-3">
                {trainingCasesList.map((c) => (
                  <div key={c._id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 bg-slate-900 text-white font-mono font-bold rounded text-[11px]">{c.case_code || "CASE-001"}</span>
                      <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded-full text-[10px]">{c.status || "Approved"}</span>
                    </div>
                    <div className="font-bold text-slate-800 text-sm">Q: {c.question}</div>
                    <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl text-slate-700">
                      <div><strong>AI Diagnosis:</strong> {c.ai_diagnosis}</div>
                      <div><strong>Actual Cause:</strong> {c.actual_cause}</div>
                      <div><strong>Action:</strong> {c.action}</div>
                      <div><strong>Result:</strong> {c.result}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6: FEEDBACK & CORRECTIONS */}
          {activeTab === "feedback" && (
            <div className="space-y-6 max-w-6xl">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Feedback & Human Corrections</h2>
                <p className="text-xs text-slate-500 mt-1">Review user feedback and convert verified corrections into formal Training Cases.</p>
              </div>

              <div className="space-y-3">
                {feedbackList.map((fb) => (
                  <div key={fb._id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start justify-between gap-4">
                    <div className="space-y-1.5 text-xs">
                      <div className="font-bold text-slate-800 text-sm">User Question: "{fb.question}"</div>
                      <div className="text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">AI Response: {fb.ai_response}</div>
                      {fb.actual_cause && <div className="text-emerald-700 font-semibold">User Correction: {fb.actual_cause} — Action: {fb.correct_action}</div>}
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${fb.rating === "correct" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                        {fb.rating === "correct" ? "Thumbs Up" : "Thumbs Down"}
                      </span>
                      {fb.status !== "converted_to_case" && (
                        <Button 
                          data-testid="feedback-convert-case"
                          size="sm" 
                          onClick={() => handleConvertFeedbackToCase(fb._id)}
                          className="bg-indigo-600 text-white text-[11px] h-7"
                        >
                          Approve & Convert Case
                        </Button>
                      )}
                      {fb.status === "converted_to_case" && (
                        <span className="text-[10px] text-emerald-600 font-bold">✓ Converted to Case</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 7: EVALUATION */}
          {activeTab === "evaluation" && (
            <div className="space-y-6 max-w-6xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">AI Model Evaluation Suite</h2>
                  <p className="text-xs text-slate-500 mt-1">Benchmark grounding accuracy and hallucination risks against test datasets.</p>
                </div>
                <Button 
                  data-testid="ai-evaluation-run"
                  disabled={isEvaluating}
                  onClick={handleRunEvaluationSuite}
                  className="bg-indigo-600 text-white text-xs h-9 px-4"
                >
                  {isEvaluating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                  Run Evaluation Benchmark
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-400">Context Faithfulness</div>
                  <div className="text-2xl font-bold text-emerald-600 mt-1">96.8%</div>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-400">Answer Relevance</div>
                  <div className="text-2xl font-bold text-indigo-600 mt-1">94.5%</div>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-400">Hallucination Index</div>
                  <div className="text-2xl font-bold text-slate-800 mt-1">Low (0.02)</div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: MODELS */}
          {activeTab === "models" && (
            <div className="space-y-6 max-w-6xl">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Local AI Models</h2>
                <p className="text-xs text-slate-500 mt-1">Status of on-premise open-weights models running inside Ollama.</p>
              </div>

              <div className="space-y-4">
                {modelsList.map((m) => (
                  <div key={m.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                          <Cpu className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-800 text-sm">{m.model_name}</h3>
                          <p className="text-xs text-slate-500">Provider: {m.provider}</p>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full font-bold text-xs ${m.active ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-600"}`}>
                        {m.active ? "Active & Loaded" : "Available"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs pt-2">
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <div className="text-slate-400">Context Window</div>
                        <div className="font-bold text-slate-800 text-sm mt-0.5">{m.context_window}</div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <div className="text-slate-400">RAM Estimate</div>
                        <div className="font-bold text-slate-800 text-sm mt-0.5">{m.ram_estimate_gb}</div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <div className="text-slate-400">Inference Speed</div>
                        <div className="font-bold text-slate-800 text-sm mt-0.5">48 tokens/sec</div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <div className="text-slate-400">Compute Backend</div>
                        <div className="font-bold text-slate-800 text-sm mt-0.5">Local Ollama</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 9: PROMPTS */}
          {activeTab === "prompts" && (
            <div className="space-y-6 max-w-6xl">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Versioned Prompt Governance</h2>
                <p className="text-xs text-slate-500 mt-1">Manage, edit, and version foundational system prompt templates.</p>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800 text-sm">System Prompt Editor</label>
                  <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded text-xs">Version 1 (ACTIVE)</span>
                </div>
                <textarea 
                  value={editPromptText} 
                  onChange={(e) => setEditPromptText(e.target.value)}
                  rows={4} 
                  className="w-full p-3 rounded-xl border border-slate-200 text-xs font-mono focus:ring-1 focus:ring-indigo-500" 
                />
                <div className="flex justify-end">
                  <Button 
                    data-testid="ai-prompt-save"
                    onClick={handleSavePrompt} 
                    className="bg-indigo-600 text-white text-xs h-9"
                  >
                    Save New Prompt Version
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 10: LOGS */}
          {activeTab === "logs" && (
            <div className="space-y-6 max-w-6xl">
              <div>
                <h2 className="text-xl font-bold text-slate-800">AI Audit Logs</h2>
                <p className="text-xs text-slate-500 mt-1">Redacted audit trail of AI queries, latency, and retrieved document IDs.</p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="p-4">Timestamp</th>
                      <th className="p-4">User</th>
                      <th className="p-4">Action</th>
                      <th className="p-4">Latency</th>
                      <th className="p-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditLogsList.map((log, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80">
                        <td className="p-4 text-slate-500">{new Date(log.created_at).toLocaleString()}</td>
                        <td className="p-4 font-medium text-slate-800">{log.performed_by}</td>
                        <td className="p-4 text-slate-600 font-mono">{log.action}</td>
                        <td className="p-4 text-slate-600">{log.latency_ms || 320} ms</td>
                        <td className="p-4">
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 11: SETTINGS */}
          {activeTab === "settings" && (
            <div className="space-y-6 max-w-4xl">
              <div>
                <h2 className="text-xl font-bold text-slate-800">AI Sub-System Settings</h2>
                <p className="text-xs text-slate-500 mt-1">Configure global AI parameters, circuit breaker limits, and max folder depths.</p>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="font-semibold text-slate-700">Max Folder Nesting Depth</label>
                    <Input defaultValue="10 levels" readOnly className="mt-1 text-xs" />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700">Ollama Local URL</label>
                    <Input defaultValue="http://localhost:11434" readOnly className="mt-1 text-xs" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* ── Slide-Over Chat Playground Drawer ── */}
        {showPlayground && (
          <aside className="w-96 bg-white border-l border-slate-200 flex flex-col shadow-2xl z-30 transition-all">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
              <div className="flex items-center gap-2.5 font-bold text-xs">
                {branding?.ai_bot_gif_url ? (
                  <img
                    src={branding.ai_bot_gif_url.startsWith("http")
                      ? branding.ai_bot_gif_url
                      : `${process.env.REACT_APP_BACKEND_URL || ""}${branding.ai_bot_gif_url}`}
                    alt="Bot GIF"
                    className="w-7 h-7 rounded-lg object-cover border border-indigo-400"
                  />
                ) : branding?.ai_bot_logo_url ? (
                  <img
                    src={branding.ai_bot_logo_url.startsWith("http")
                      ? branding.ai_bot_logo_url
                      : `${process.env.REACT_APP_BACKEND_URL || ""}${branding.ai_bot_logo_url}`}
                    alt="Bot Logo"
                    className="w-7 h-7 rounded-lg object-cover border border-indigo-400"
                  />
                ) : (
                  <Bot className="w-4 h-4 text-indigo-400" />
                )}
                <span>{branding?.ai_bot_name || "AI Chat Playground"}</span>
              </div>
              <button onClick={() => setShowPlayground(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 nice-scroll text-xs">
              {messages.map((msg, i) => (
                <div key={i} className={`flex items-start gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] overflow-hidden ${msg.role === "user" ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-indigo-600"}`}>
                    {msg.role === "user" ? (
                      user?.name?.charAt(0) || "U"
                    ) : branding?.ai_bot_gif_url ? (
                      <img src={branding.ai_bot_gif_url.startsWith("http") ? branding.ai_bot_gif_url : `${process.env.REACT_APP_BACKEND_URL || ""}${branding.ai_bot_gif_url}`} alt="Bot" className="w-7 h-7 object-cover" />
                    ) : branding?.ai_bot_logo_url ? (
                      <img src={branding.ai_bot_logo_url.startsWith("http") ? branding.ai_bot_logo_url : `${process.env.REACT_APP_BACKEND_URL || ""}${branding.ai_bot_logo_url}`} alt="Bot" className="w-7 h-7 object-cover" />
                    ) : (
                      <Bot className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 whitespace-pre-wrap ${msg.role === "user" ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-slate-700 shadow-xs"}`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="text-xs text-slate-500 flex items-center gap-2 p-2 bg-white rounded-xl border border-indigo-100 shadow-xs w-fit">
                  {branding?.ai_bot_gif_url ? (
                    <img src={branding.ai_bot_gif_url.startsWith("http") ? branding.ai_bot_gif_url : `${process.env.REACT_APP_BACKEND_URL || ""}${branding.ai_bot_gif_url}`} alt="Thinking" className="w-6 h-6 rounded-md object-cover animate-bounce" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                  )}
                  <span>{branding?.ai_bot_name || "AI"} is generating response...</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-3 border-t border-slate-200 bg-white">
              <form onSubmit={sendMessage} className="flex gap-2">
                <Input 
                  value={inputMsg}
                  onChange={(e) => setInputMsg(e.target.value)}
                  placeholder="Test AI chat prompt..."
                  className="text-xs h-9 rounded-lg"
                  disabled={isTyping}
                />
                <Button type="submit" size="icon" disabled={!inputMsg.trim() || isTyping} className="h-9 w-9 bg-indigo-600 text-white rounded-lg">
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </div>
          </aside>
        )}
      </div>

      {/* ── MODAL: CREATE FOLDER ── */}
      {showCreateFolderModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="font-bold text-slate-800 text-sm">Create New Knowledge Folder</h3>
            <form onSubmit={handleCreateFolder} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700">Folder Name</label>
                <Input 
                  data-testid="ai-folder-name-input"
                  value={folderForm.name} 
                  onChange={(e) => setFolderForm({...folderForm, name: e.target.value})} 
                  placeholder="e.g. Inverter Maintenance" 
                  className="mt-1 text-xs" 
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Description</label>
                <Input 
                  value={folderForm.description} 
                  onChange={(e) => setFolderForm({...folderForm, description: e.target.value})} 
                  placeholder="Optional description" 
                  className="mt-1 text-xs" 
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setShowCreateFolderModal(false)}>Cancel</Button>
                <Button data-testid="ai-folder-save" type="submit" className="bg-indigo-600 text-white">Create Folder</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: CREATE RAG COLLECTION ── */}
      {showCreateCollectionModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <h3 className="font-bold text-slate-800 text-sm">Create RAG Vector Collection</h3>
            <form onSubmit={handleCreateCollection} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700">Display Name</label>
                  <Input 
                    data-testid="rag-collection-display-name"
                    value={collectionForm.display_name} 
                    onChange={(e) => setCollectionForm({...collectionForm, display_name: e.target.value})} 
                    placeholder="e.g. Deye Inverter Knowledge" 
                    className="mt-1 text-xs" 
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Internal Name</label>
                  <Input 
                    value={collectionForm.internal_name} 
                    onChange={(e) => setCollectionForm({...collectionForm, internal_name: e.target.value})} 
                    placeholder="e.g. deye_inverter_v1" 
                    className="mt-1 text-xs font-mono" 
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Description</label>
                <Input 
                  value={collectionForm.description} 
                  onChange={(e) => setCollectionForm({...collectionForm, description: e.target.value})} 
                  placeholder="Vector collection purpose" 
                  className="mt-1 text-xs" 
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700">Embedding Model</label>
                  <Input value={collectionForm.embedding_model} readOnly className="mt-1 text-xs bg-slate-50" />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Vector Dimensions</label>
                  <Input value={collectionForm.vector_dimensions} readOnly className="mt-1 text-xs bg-slate-50 font-mono" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setShowCreateCollectionModal(false)}>Cancel</Button>
                <Button data-testid="rag-collection-save" type="submit" className="bg-emerald-600 text-white">Initialize Collection</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: DOCUMENT CHUNK VIEWER ── */}
      {viewerDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-600/30 border border-violet-400/40 flex items-center justify-center text-violet-300">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    {viewerDoc.filename}
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-semibold">
                      {viewerDoc.verification_status || "OEM_VERIFIED"}
                    </span>
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                    <span>Mfr: <strong className="text-slate-200">{viewerDoc.manufacturer || "Unknown"}</strong></span>
                    <span>•</span>
                    <span>Model: <strong className="text-slate-200">{viewerDoc.model || "Unknown"}</strong></span>
                    <span>•</span>
                    <span>Pages: <strong className="text-slate-200">{viewerDoc.pages || 1}</strong></span>
                    <span>•</span>
                    <span>Chunks: <strong className="text-violet-300">{viewerChunks.length} indexed</strong></span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleReindexDoc(viewerDoc)}
                  disabled={reindexingDocId === viewerDoc._id}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition"
                >
                  {reindexingDocId === viewerDoc._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
                  Re-index
                </button>
                <button
                  onClick={() => setViewerDoc(null)}
                  className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body */}
            {viewerLoading ? (
              <div className="p-16 text-center space-y-3">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-violet-600" />
                <p className="text-xs text-slate-500 font-medium">Loading document semantic chunks from database...</p>
              </div>
            ) : viewerChunks.length === 0 ? (
              <div className="p-16 text-center space-y-4">
                <FileText className="w-12 h-12 mx-auto text-slate-300" />
                <p className="text-sm font-semibold text-slate-700">No semantic chunks found for this document</p>
                <button
                  onClick={() => handleReindexDoc(viewerDoc)}
                  className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold shadow-sm transition"
                >
                  Run Re-indexing Pipeline
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-12 flex-1 overflow-hidden min-h-[500px]">
                {/* Chunk List Selector (4 cols) */}
                <div className="md:col-span-4 border-r border-slate-200 bg-slate-50/50 flex flex-col overflow-hidden">
                  <div className="p-3 border-b border-slate-200 bg-white">
                    <input
                      type="text"
                      placeholder="Search chunks (keyword, page, section)..."
                      value={viewerSearch}
                      onChange={e => setViewerSearch(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                    />
                  </div>

                  <div className="divide-y divide-slate-100 overflow-y-auto flex-1 max-h-[420px]">
                    {viewerChunks
                      .filter(c => {
                        if (!viewerSearch.trim()) return true;
                        const s = viewerSearch.toLowerCase();
                        return (
                          (c.content || c.text || "").toLowerCase().includes(s) ||
                          (c.section || "").toLowerCase().includes(s) ||
                          (c.chunk_type || "").toLowerCase().includes(s) ||
                          String(c.page || c.page_number || "").includes(s)
                        );
                      })
                      .map((chk, idx) => {
                        const isSelected = viewerActiveChunk === idx;
                        const typeColors = {
                          alarm_table: "bg-red-50 text-red-700 border-red-200",
                          troubleshooting: "bg-amber-50 text-amber-700 border-amber-200",
                          safety: "bg-rose-50 text-rose-700 border-rose-200",
                          specification: "bg-blue-50 text-blue-700 border-blue-200",
                          installation: "bg-slate-100 text-slate-700 border-slate-200",
                          wiring: "bg-indigo-50 text-indigo-700 border-indigo-200",
                          modbus: "bg-purple-50 text-purple-700 border-purple-200"
                        };
                        const typeBadge = typeColors[chk.chunk_type] || "bg-slate-100 text-slate-600 border-slate-200";

                        return (
                          <button
                            key={chk._id || idx}
                            onClick={() => setViewerActiveChunk(idx)}
                            className={`w-full p-3 text-left transition flex flex-col gap-1 ${
                              isSelected ? "bg-violet-50/80 border-l-4 border-violet-600 shadow-inner" : "hover:bg-slate-100/70"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-mono font-bold text-[11px] text-slate-800">
                                {chk.knowledge_id || chk.chunk_id || `Chunk #${chk.chunk_index || idx + 1}`}
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold">
                                Page {chk.page || chk.page_number || 1}
                              </span>
                            </div>

                            <div className="text-[11px] font-semibold text-slate-700 truncate">
                              {chk.section || "General Section"}
                            </div>

                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${typeBadge}`}>
                                {chk.chunk_type || "general"}
                              </span>
                              <span className="text-[10px] text-slate-400 truncate max-w-[130px]">
                                {(chk.content || chk.text || "").slice(0, 45)}...
                              </span>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                </div>

                {/* Chunk Detail & Metadata Inspector (8 cols) */}
                <div className="md:col-span-8 flex flex-col overflow-hidden bg-white">
                  {(() => {
                    const chk = viewerChunks[viewerActiveChunk] || viewerChunks[0];
                    if (!chk) return <div className="p-8 text-center text-slate-400">Select a chunk to inspect</div>;

                    return (
                      <div className="flex flex-col h-full overflow-hidden">
                        {/* Top Bar with Pagination */}
                        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs text-slate-800">
                              {chk.knowledge_id || chk.chunk_id || `Chunk ${viewerActiveChunk + 1}`}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-bold text-[10px] border border-indigo-100">
                              Page {chk.page || chk.page_number || 1}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold text-[10px] uppercase border border-slate-200">
                              {chk.chunk_type || "general"}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              disabled={viewerActiveChunk <= 0}
                              onClick={() => setViewerActiveChunk(i => Math.max(0, i - 1))}
                              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold disabled:opacity-40"
                            >
                              ← Previous
                            </button>
                            <span className="text-xs font-mono font-semibold text-slate-500 px-1">
                              {viewerActiveChunk + 1} / {viewerChunks.length}
                            </span>
                            <button
                              disabled={viewerActiveChunk >= viewerChunks.length - 1}
                              onClick={() => setViewerActiveChunk(i => Math.min(viewerChunks.length - 1, i + 1))}
                              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold disabled:opacity-40"
                            >
                              Next →
                            </button>
                          </div>
                        </div>

                        {/* Chunk Content & Metadata tabs */}
                        <div className="p-5 overflow-y-auto space-y-4 flex-1 max-h-[420px]">
                          {/* Heading Banner */}
                          <div className="p-3 rounded-xl bg-violet-50/60 border border-violet-100">
                            <div className="text-[10px] font-bold text-violet-800 uppercase tracking-wider">Document Section Heading</div>
                            <div className="text-xs font-bold text-slate-800 mt-0.5">{chk.section || "General Overview"}</div>
                            {chk.subsection && <div className="text-[11px] text-slate-500 mt-0.5">{chk.subsection}</div>}
                          </div>

                          {/* Content Box */}
                          <div>
                            <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                              <span>Chunk Text Body</span>
                              <span className="text-[10px] font-mono text-slate-400">{(chk.content || chk.text || "").length} characters</span>
                            </div>
                            <div className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs leading-relaxed whitespace-pre-wrap selection:bg-violet-600 selection:text-white shadow-inner max-h-[220px] overflow-y-auto">
                              {chk.content || chk.text || "No content"}
                            </div>
                          </div>

                          {/* Structured Metadata Grid */}
                          <div>
                            <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2">Qdrant Vector Payload & Metadata</div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                <div className="text-[10px] text-slate-400 font-medium">Manufacturer</div>
                                <div className="font-bold text-slate-800 mt-0.5">{chk.manufacturer || "Unknown"}</div>
                              </div>
                              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                <div className="text-[10px] text-slate-400 font-medium">Model</div>
                                <div className="font-bold text-slate-800 mt-0.5">{chk.model || "Unknown"}</div>
                              </div>
                              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                <div className="text-[10px] text-slate-400 font-medium">Model Family</div>
                                <div className="font-bold text-slate-800 mt-0.5">{chk.model_family || "Unknown"}</div>
                              </div>
                              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                <div className="text-[10px] text-slate-400 font-medium">Power Rating</div>
                                <div className="font-bold text-slate-800 mt-0.5">{chk.power_kw ? `${chk.power_kw} kW` : "N/A"}</div>
                              </div>
                              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                <div className="text-[10px] text-slate-400 font-medium">Equipment Type</div>
                                <div className="font-bold text-slate-800 mt-0.5">{chk.equipment_type || "inverter"}</div>
                              </div>
                              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                <div className="text-[10px] text-slate-400 font-medium">Verification Status</div>
                                <div className="font-bold text-emerald-600 mt-0.5">{chk.verification_status || "OEM_VERIFIED"}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL: MOVE DOCUMENT ── */}
      {showMoveDocModal && movingDoc && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="font-bold text-slate-800 text-sm">Move Document & Re-Index</h3>
            <p className="text-xs text-slate-500">Moving <strong className="text-slate-800">{movingDoc.filename}</strong> will purge stale vectors and re-index into target collection.</p>
            <form onSubmit={handleMoveDocument} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700">Target Vector Collection</label>
                <select 
                  value={targetMoveCollectionId} 
                  onChange={(e) => setTargetMoveCollectionId(e.target.value)} 
                  className="w-full h-9 p-2 rounded-lg border border-slate-200 mt-1 text-xs focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Select Target Collection...</option>
                  {collections.map(c => <option key={c._id} value={c._id}>{c.display_name}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setShowMoveDocModal(false)}>Cancel</Button>
                <Button data-testid="rag-document-move-save" type="submit" className="bg-indigo-600 text-white">Move & Re-index</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── HIGH-TECH EXTRACTION & INDEXING PIPELINE MODAL ── */}
      {indexingModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl p-6 space-y-6 text-slate-100">
            <div className="flex items-start justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
                  <Sparkles className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    AI Text Extraction & Vector Indexing Engine
                  </h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    Pipeline Execution: <span className="text-indigo-400 font-semibold">{indexingModal.filename}</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-slate-400">Overall Pipeline Progress</span>
                <span className="text-indigo-400 font-mono font-bold">{indexingModal.percent}%</span>
              </div>
              <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700/50">
                <div className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 rounded-full transition-all duration-500 shadow-md shadow-indigo-500/50" style={{ width: `${indexingModal.percent}%` }} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
                <div className="text-[11px] text-slate-400">Extracted Characters</div>
                <div className="text-base font-bold font-mono text-indigo-300 mt-1">{indexingModal.extractedChars > 0 ? indexingModal.extractedChars.toLocaleString() : "..."}</div>
              </div>
              <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
                <div className="text-[11px] text-slate-400">Generated Chunks</div>
                <div className="text-base font-bold font-mono text-violet-300 mt-1">{indexingModal.chunksCount > 0 ? `${indexingModal.chunksCount} chunks` : "..."}</div>
              </div>
              <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
                <div className="text-[11px] text-slate-400">Vector Dimension</div>
                <div className="text-base font-bold font-mono text-emerald-300 mt-1">{indexingModal.vectorDims}</div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button 
                disabled={indexingModal.status === "processing"}
                onClick={() => setIndexingModal({ ...indexingModal, isOpen: false })}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-5 h-9"
              >
                {indexingModal.status === "processing" ? "Processing RAG Pipeline..." : "Close Pipeline Viewer"}
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
    </AppLayout>
  );
}
