import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/layout/AppLayout";
import { api, API } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableDropdown } from "@/components/ui/SearchableDropdown";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Search, Plus, Edit2, Trash2, ArrowUpDown, History, Package2,
  Zap, AlertTriangle, CheckCircle2, XCircle, Wrench, ChevronRight,
  Filter, RefreshCw, TrendingUp, TrendingDown, Box, Layers,
  FileText, Upload, Download, File as FileIcon, Eye, ArrowRightLeft, Truck, Send, ShieldAlert,
} from "lucide-react";

/* ─────────────── Constants ─────────────── */
const EQUIPMENT_TYPES = [
  "Inverter", "Solar Panel", "Transformer", "ACB", "MCB", "MFM",
  "String Combiner Box", "DC Cable", "AC Cable", "Earthing", "Weather Station",
  "SCADA System", "Battery Storage", "Mounting Structure", "Other",
];

const STATUS_CONFIG = {
  operational:       { label: "Operational",       color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  faulty:            { label: "Faulty",             color: "bg-red-100 text-red-700 border-red-200" },
  under_maintenance: { label: "Under Maintenance",  color: "bg-amber-100 text-amber-700 border-amber-200" },
  decommissioned:    { label: "Decommissioned",     color: "bg-slate-100 text-slate-500 border-slate-200" },
};

const SPARE_STATUS_CONFIG = {
  available:    { label: "Available",     color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  low_stock:    { label: "Low Stock",     color: "bg-amber-100 text-amber-700 border-amber-200",   icon: AlertTriangle },
  out_of_stock: { label: "Out of Stock",  color: "bg-red-100 text-red-700 border-red-200",          icon: XCircle },
};

const EMPTY_ITEM = {
  item_type: "equipment",
  equipment_type: "",
  name: "",
  make: "",
  model: "",
  serial_number: "",
  quantity: 1,
  unit: "nos",
  status: "operational",
  site_code: "",
  linked_equipment_id: "",
  min_stock_level: 0,
  location_in_plant: "",
  warranty_expiry: "",
  installed_date: "",
  notes: "",
};

/* ─────────────── Helpers ─────────────── */
function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: "bg-slate-100 text-slate-600 border-slate-200" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.color}`}>{cfg.label}</span>;
}

function SpareBadge({ status }) {
  if (!status) return null;
  const cfg = SPARE_STATUS_CONFIG[status] || SPARE_STATUS_CONFIG.available;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.color}`}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, sub, color = "blue" }) {
  const colors = {
    blue:   "bg-blue-50 text-blue-600",
    green:  "bg-emerald-50 text-emerald-600",
    red:    "bg-red-50 text-red-600",
    amber:  "bg-amber-50 text-amber-600",
    purple: "bg-purple-50 text-purple-600",
  };
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-2xl font-bold text-slate-800">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
        {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
      </div>
    </Card>
  );
}

/* ─────────────── Main Component ─────────────── */
export default function InventoryPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const isAdmin = user?.role === "super_admin" || user?.role === "admin";

  // Data
  const [items, setItems] = useState([]);
  const [sites, setSites] = useState([]);
  const [equipTypes, setEquipTypes] = useState([]);
  const [summary, setSummary] = useState(null);
  const [movements, setMovements] = useState([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(searchParams.get("tab") || "equipment");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState("add"); // add | edit
  const [editItem, setEditItem] = useState(EMPTY_ITEM);
  const [movementOpen, setMovementOpen] = useState(false);
  const [movementItem, setMovementItem] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItem, setHistoryItem] = useState(null);
  const [saving, setSaving] = useState(false);

  // Filters
  const [search, setSearch]         = useState(searchParams.get("search") || "");
  const [filterSite, setFilterSite] = useState(searchParams.get("site_code") || "");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus]   = useState("");
  const [filterSpare, setFilterSpare]     = useState("");
  const [filterStock, setFilterStock]     = useState("");
  const [regionScope, setRegionScope]     = useState("inner");  // inner | outer

  const [movForm, setMovForm] = useState({ movement_type: "in", quantity_change: 1, reason: "" });

  // Inter-Plant Movement Registration state
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferForm, setTransferForm] = useState({
    from_site_code: "",
    to_site_code: "",
    item_id: "",
    quantity: 1,
    reason: "",
    reference_no: "",
  });
  const [transferring, setTransferring] = useState(false);

  // Transfer modal step-state
  const [transferRegionScope, setTransferRegionScope] = useState("inner");  // inner | outer
  const [selectedItemName, setSelectedItemName]       = useState("");         // Step 1
  const [itemNames, setItemNames]                     = useState([]);          // [{name, total_qty}]
  const [itemNamesLoading, setItemNamesLoading]       = useState(false);
  const [spareSites, setSpareSites]                   = useState([]);          // [{site_code, site_name, quantity}]
  const [spareSitesLoading, setSpareSitesLoading]     = useState(false);

  // Transfers log state
  const [transfersOpen, setTransfersOpen] = useState(false);
  const [transfersList, setTransfersList] = useState([]);
  const [transfersLoading, setTransfersLoading] = useState(false);

  // docs state
  const [docsOpen, setDocsOpen]   = useState(false);
  const [docsItem, setDocsItem]   = useState(null);
  const [docs, setDocs]           = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = React.useRef(null);

  const openDocs = async (item) => {
    setDocsItem(item);
    setDocsOpen(true);
    setDocsLoading(true);
    try {
      const r = await api.get(`/inventory/items/${item.id}/docs`);
      setDocs(r.data || []);
    } catch { setDocs([]); }
    finally { setDocsLoading(false); }
  };

  const uploadDoc = async (file) => {
    if (!file || !docsItem) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await api.post(`/inventory/items/${docsItem.id}/docs`, form, { headers: { "Content-Type": "multipart/form-data" } });
      const r = await api.get(`/inventory/items/${docsItem.id}/docs`);
      setDocs(r.data || []);
      toast.success(`"${file.name}" uploaded`);
    } catch { toast.error("Upload failed"); }
    finally { setUploading(false); }
  };

  const deleteDoc = async (filename) => {
    if (!window.confirm(`Delete "${filename}"?`)) return;
    try {
      await api.delete(`/inventory/items/${docsItem.id}/docs/${encodeURIComponent(filename)}`);
      setDocs(d => d.filter(f => f.name !== filename));
      toast.success("Deleted");
    } catch { toast.error("Delete failed"); }
  };

  const downloadDoc = (filename) => {
    const url = `${process.env.REACT_APP_BACKEND_URL || ""}/api/inventory/items/${docsItem.id}/docs/${encodeURIComponent(filename)}`;
    window.open(url, "_blank");
  };

  const fmtSize = (bytes) => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes/1024).toFixed(1)} KB` : `${(bytes/1048576).toFixed(1)} MB`;

  const fileIcon = (mime) => {
    if (!mime) return "📄";
    if (mime.startsWith("image/")) return "🖼️";
    if (mime === "application/pdf") return "📑";
    if (mime.includes("word") || mime.includes("document")) return "📝";
    if (mime.includes("sheet") || mime.includes("excel")) return "📊";
    if (mime.includes("zip") || mime.includes("compressed")) return "🗜️";
    return "📄";
  };

  const [moduleDisabled, setModuleDisabled] = useState(false);

  // ── Load data ──
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [itemsR, sitesR, typesR, summaryR] = await Promise.all([
        api.get("/inventory/items", { params: {
          search: search || undefined,
          site_code: filterSite || undefined,
          item_type: tab === "equipment" ? "equipment" : "spare",
          equipment_type: filterType || undefined,
          status: filterStatus || undefined,
          spare_availability: filterSpare || undefined,
          stock_level: filterStock || undefined,
          region_scope: regionScope,
        }}),
        api.get("/sites"),
        api.get("/inventory/equipment-types"),
        api.get("/inventory/summary"),
      ]);
      setItems(itemsR.data || []);
      setSites(sitesR.data || []);
      setEquipTypes(typesR.data || []);
      setSummary(summaryR.data || null);
      setModuleDisabled(false);
    } catch (e) {
      if (e.response?.status === 403 && e.response?.data?.detail?.includes("disabled")) {
        setModuleDisabled(true);
      } else {
        toast.error("Failed to load inventory");
      }
    } finally {
      setLoading(false);
    }
  }, [search, filterSite, filterType, filterStatus, filterSpare, filterStock, tab, regionScope]);

  useEffect(() => { load(); }, [load]);


  // ── Computed ──
  const equipmentItems = useMemo(() => items.filter(i => i.item_type === "equipment"), [items]);
  const spareItems     = useMemo(() => items.filter(i => i.item_type === "spare"),     [items]);

  // ── Handlers ──
  const openAdd = (defaultType = tab === "equipment" ? "equipment" : "spare") => {
    setEditItem({ ...EMPTY_ITEM, item_type: defaultType, site_code: filterSite });
    setSheetMode("add");
    setSheetOpen(true);
  };

  const openEdit = (item) => {
    setEditItem({ ...item });
    setSheetMode("edit");
    setSheetOpen(true);
  };

  const saveItem = async () => {
    if (!editItem.name.trim()) return toast.error("Name is required");
    if (!editItem.site_code) return toast.error("Plant/Site is required");
    setSaving(true);
    try {
      if (sheetMode === "add") {
        await api.post("/inventory/items", editItem);
        toast.success("Item added successfully");
      } else {
        await api.put(`/inventory/items/${editItem.id}`, editItem);
        toast.success("Item updated successfully");
      }
      setSheetOpen(false);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (item) => {
    if (!window.confirm(`Delete "${item.name}"? This will also delete all linked spares.`)) return;
    try {
      await api.delete(`/inventory/items/${item.id}`);
      toast.success("Deleted");
      load();
    } catch (e) {
      toast.error("Delete failed");
    }
  };

  const openMovement = (item) => {
    setMovementItem(item);
    setMovForm({ movement_type: "in", quantity_change: 1, reason: "" });
    setMovementOpen(true);
  };

  const submitMovement = async () => {
    try {
      await api.post(`/inventory/items/${movementItem.id}/movement`, movForm);
      toast.success("Stock movement recorded");
      setMovementOpen(false);
      load();
    } catch (e) {
      toast.error("Failed to record movement");
    }
  };

  const openHistory = async (item) => {
    setHistoryItem(item);
    setHistoryOpen(true);
    try {
      const r = await api.get(`/inventory/items/${item.id}/movements`);
      setMovements(r.data || []);
    } catch { setMovements([]); }
  };

  // ── Transfer helpers ──
  const fetchItemNames = async (scope) => {
    setItemNamesLoading(true);
    try {
      const r = await api.get("/inventory/item-names", { params: { region_scope: scope || "inner" } });
      setItemNames(r.data || []);
    } catch {
      setItemNames([]);
    } finally {
      setItemNamesLoading(false);
    }
  };

  const onItemNameSelect = async (name, scope) => {
    setSelectedItemName(name);
    setTransferForm(p => ({ ...p, from_site_code: "", item_id: name, to_site_code: p.to_site_code }));
    if (!name) { setSpareSites([]); return; }
    setSpareSitesLoading(true);
    try {
      const r = await api.get("/inventory/spare-sites", { params: { name, region_scope: scope || "inner" } });
      setSpareSites(r.data || []);
    } catch {
      setSpareSites([]);
    } finally {
      setSpareSitesLoading(false);
    }
  };

  const openTransferModal = (defaultItem = null) => {
    const scope = "inner";
    setTransferRegionScope(scope);
    setSelectedItemName(defaultItem ? defaultItem.name : "");
    setSpareSites([]);
    setTransferForm({
      from_site_code: defaultItem ? defaultItem.site_code : "",
      to_site_code: "",
      item_id: defaultItem ? defaultItem.name : "",  // use name as the id-key for new flow
      quantity: 1,
      reason: "",
      reference_no: "",
    });
    setTransferOpen(true);
    fetchItemNames(scope);
    if (defaultItem?.name) {
      onItemNameSelect(defaultItem.name, scope);
    }
  };

  const onTransferRegionScopeChange = (newScope) => {
    setTransferRegionScope(newScope);
    setSelectedItemName("");
    setSpareSites([]);
    setTransferForm(p => ({ ...p, from_site_code: "", item_id: "", to_site_code: "" }));
    fetchItemNames(newScope);
  };

  const submitTransfer = async () => {
    if (!selectedItemName) return toast.error("Please select an Equipment / Spare item name");
    if (!transferForm.from_site_code) return toast.error("Please select Source Plant (Plant A)");
    if (!transferForm.to_site_code) return toast.error("Please select Destination Plant (Plant B)");
    if (transferForm.quantity <= 0) return toast.error("Quantity must be at least 1");

    // Get item_id from the source site's items matching the name
    const matchItem = items.find(i => i.site_code === transferForm.from_site_code && i.name === selectedItemName && i.quantity > 0);
    const payload = {
      ...transferForm,
      item_id: matchItem ? matchItem.id : selectedItemName,  // fallback to name if not in loaded items
      item_name: selectedItemName,
    };

    setTransferring(true);
    try {
      const res = await api.post("/inventory/transfer", payload);
      toast.success(res.data?.message || "Inter-plant movement registered and stock updated!");
      setTransferOpen(false);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Transfer failed");
    } finally {
      setTransferring(false);
    }
  };


  const openTransfersLog = async () => {
    setTransfersOpen(true);
    setTransfersLoading(true);
    try {
      const r = await api.get("/inventory/transfers");
      setTransfersList(r.data || []);
    } catch {
      setTransfersList([]);
    } finally {
      setTransfersLoading(false);
    }
  };

  // Plants that have stock available (quantity > 0)
  const sitesWithStock = useMemo(() => {
    const counts = {};
    items.forEach(it => {
      if (it.quantity > 0) {
        counts[it.site_code] = (counts[it.site_code] || 0) + 1;
      }
    });

    if (Object.keys(counts).length === 0) {
      return sites.map(s => ({ label: s.site_name || s.site_code, value: s.site_code }));
    }

    return sites
      .filter(s => (counts[s.site_code] || 0) > 0)
      .map(s => {
        const cnt = counts[s.site_code];
        return {
          label: `${s.site_name || s.site_code} (${cnt} item${cnt > 1 ? "s" : ""} in stock)`,
          value: s.site_code,
        };
      });
  }, [sites, items]);

  // Excel Bulk Import & Export state
  const fileImportRef = React.useRef(null);
  const [importing, setImporting] = useState(false);

  const authedDownload = async (path, defaultFilename) => {
    try {
      const token = localStorage.getItem("ff_token");
      const resp = await fetch(`${API}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Download failed");
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = defaultFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      toast.error(e.message || "Download failed");
    }
  };

  const downloadTemplate = () => {
    authedDownload("/inventory/template.xlsx", "inventory-template.xlsx");
  };

  const exportInventory = () => {
    const params = new URLSearchParams();
    if (filterSite) params.append("site_code", filterSite);
    params.append("item_type", tab === "equipment" ? "equipment" : "spare");
    authedDownload(`/inventory/export.xlsx?${params.toString()}`, "inventory-export.xlsx");
  };

  const handleBulkImport = async (file) => {
    if (!file) return;
    setImporting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api.post("/inventory/import.xlsx", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(res.data?.message || "Import complete!");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  // ── Summary totals ──
  const tot = summary?.totals || {};

  if (moduleDisabled) {
    return (
      <AppLayout>
        <div className="p-12 text-center max-w-md mx-auto my-12 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <ShieldAlert className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-800">Module Disabled</h2>
          <p className="text-slate-500 mt-2 text-sm">
            Inventory Management is currently disabled by Super Admin. Enable it under Settings → General to access this module.
          </p>
          <Button onClick={() => navigate("/dashboard")} className="mt-6 bg-slate-900 text-white">
            Return to Dashboard
          </Button>
        </div>
      </AppLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="p-12 text-center max-w-md mx-auto my-12 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <ShieldAlert className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-800">Access Restricted</h2>
          <p className="text-slate-500 mt-2 text-sm">
            Inventory Management is restricted to Administrators only. Contact your system administrator if you require access.
          </p>
          <Button onClick={() => navigate("/dashboard")} className="mt-6 bg-slate-900 text-white">
            Return to Dashboard
          </Button>
        </div>
      </AppLayout>
    );
  }


  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-[1400px]">
        {/* ─── Header ─── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-2">
              <Package2 className="w-7 h-7 text-blue-600" />
              Inventory Management
            </h1>
            <p className="text-slate-500 text-sm mt-1">Manage equipment and spare parts across all plants</p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            {/* Excel Actions */}
            <Button variant="outline" size="sm" onClick={downloadTemplate} title="Download Excel template for bulk equipment/spares import">
              <Download className="w-3.5 h-3.5 mr-1 text-slate-500" /> Template
            </Button>

            <input
              ref={fileImportRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={e => { if (e.target.files?.[0]) handleBulkImport(e.target.files[0]); e.target.value = ""; }}
            />
            <Button variant="outline" size="sm" onClick={() => fileImportRef.current?.click()} disabled={importing} className="border-emerald-200 text-emerald-700 bg-emerald-50/50 hover:bg-emerald-100" title="Bulk import equipment/spares from Excel">
              <Upload className="w-3.5 h-3.5 mr-1 text-emerald-600" /> {importing ? "Importing…" : "Import Excel"}
            </Button>

            <Button variant="outline" size="sm" onClick={exportInventory} title="Export current inventory to Excel">
              <FileText className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Export Excel
            </Button>

            <div className="w-px h-6 bg-slate-200 mx-1 hidden sm:block" />

            <Button variant="outline" size="sm" onClick={openTransfersLog} className="border-purple-200 text-purple-700 bg-purple-50/40 hover:bg-purple-100">
              <ArrowRightLeft className="w-3.5 h-3.5 mr-1 text-purple-600" /> Movement Log
            </Button>
            <Button variant="outline" size="sm" onClick={() => openTransferModal()} className="border-blue-200 text-blue-700 bg-blue-50/50 hover:bg-blue-100">
              <Truck className="w-3.5 h-3.5 mr-1 text-blue-600" /> Register Movement
            </Button>
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-3.5 h-3.5 mr-1" />Refresh</Button>
            <Button onClick={() => openAdd()} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Item
            </Button>
          </div>
        </div>

        {/* ─── Summary Cards ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard icon={Layers}        label="Total Equipment"    value={tot.total_equipment || 0}   color="blue"   />
          <StatCard icon={CheckCircle2}  label="Operational"        value={tot.operational || 0}       color="green"  />
          <StatCard icon={AlertTriangle} label="Faulty"             value={tot.faulty || 0}            color="red"    />
          <StatCard icon={Wrench}        label="Under Maintenance"  value={tot.under_maintenance || 0} color="amber"  />
          <StatCard icon={Box}           label="Spare Parts"        value={tot.total_spares || 0}      color="purple" />
          <StatCard icon={TrendingDown}  label="Low / Out of Stock" value={(tot.spares_low || 0) + (tot.spares_out || 0)} color="red" sub={`${tot.spares_out || 0} out of stock`} />
        </div>

        {/* ─── Filters ─── */}
        <Card className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
              <Input placeholder="Search name, serial, make…" className="pl-8 w-56" value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            {/* Region Scope Toggle — only for admin (super_admin sees all by default) */}
            {user?.role === "admin" && (
              <div className="flex border border-slate-300 rounded-md overflow-hidden h-10">
                <button
                  className={`px-3 py-1 text-sm font-medium transition-colors ${regionScope === "inner" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                  onClick={() => setRegionScope("inner")}
                  title="Show only your region's plants"
                >
                  🏢 My Region
                </button>
                <button
                  className={`px-3 py-1 text-sm font-medium transition-colors ${regionScope === "outer" ? "bg-purple-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                  onClick={() => setRegionScope("outer")}
                  title="Show other regions' plants"
                >
                  🌐 Other Regions
                </button>
              </div>
            )}

            <div className="w-48">
              <SearchableDropdown
                options={[{ label: "All Plants", value: "" }, ...sites.map(s => ({ label: s.site_name || s.site_code, value: s.site_code }))] }
                value={filterSite}
                onChange={setFilterSite}
                placeholder="All Plants"
                className="h-10 text-sm"
              />
            </div>

            <div className="w-44">
              <SearchableDropdown
                options={[{ label: "All Types", value: "" }, ...(equipTypes.length ? equipTypes : EQUIPMENT_TYPES).map(t => ({ label: t, value: t }))] }
                value={filterType}
                onChange={setFilterType}
                placeholder="All Types"
                className="h-10 text-sm"
              />
            </div>

            {tab === "equipment" && (
              <div className="w-44">
                <SearchableDropdown
                  options={[{ label: "All Statuses", value: "" }, ...Object.entries(STATUS_CONFIG).map(([k, v]) => ({ label: v.label, value: k }))] }
                  value={filterStatus}
                  onChange={setFilterStatus}
                  placeholder="All Statuses"
                  className="h-10 text-sm"
                />
              </div>
            )}

            {tab === "spares" && (
              <>
                <div className="w-44">
                  <SearchableDropdown
                    options={[
                      { label: "All", value: "" },
                      { label: "Available", value: "available" },
                      { label: "Low Stock", value: "low_stock" },
                      { label: "Out of Stock", value: "out_of_stock" },
                    ]}
                    value={filterSpare}
                    onChange={setFilterSpare}
                    placeholder="Availability"
                    className="h-10 text-sm"
                  />
                </div>
                <div className="w-36">
                  <SearchableDropdown
                    options={[
                      { label: "Any Stock", value: "" },
                      { label: "Low / Out", value: "low" },
                    ]}
                    value={filterStock}
                    onChange={setFilterStock}
                    placeholder="Stock Level"
                    className="h-10 text-sm"
                  />
                </div>
              </>
            )}

            {(filterSite || filterType || filterStatus || filterSpare || filterStock || search) && (
              <Button variant="ghost" size="sm" onClick={() => { setFilterSite(""); setFilterType(""); setFilterStatus(""); setFilterSpare(""); setFilterStock(""); setSearch(""); }}>
                Clear filters
              </Button>
            )}
          </div>
        </Card>

        {/* ─── Tabs ─── */}
        <Tabs value={tab} onValueChange={v => { setTab(v); setFilterStatus(""); setFilterSpare(""); }}>
          <TabsList>
            <TabsTrigger value="equipment" className="gap-1.5">
              <Zap className="w-4 h-4" />Equipment
              <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-full font-semibold">{equipmentItems.length}</span>
            </TabsTrigger>
            <TabsTrigger value="spares" className="gap-1.5">
              <Box className="w-4 h-4" />Spare Parts
              <span className="bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0.5 rounded-full font-semibold">{spareItems.length}</span>
            </TabsTrigger>
          </TabsList>

          {/* ── Equipment Tab ── */}
          <TabsContent value="equipment" className="mt-4">
            {loading ? (
              <div className="py-20 text-center text-slate-400">Loading inventory…</div>
            ) : equipmentItems.length === 0 ? (
              <EmptyState type="equipment" onAdd={() => openAdd("equipment")} />
            ) : (
              <EquipmentTable items={equipmentItems} sites={sites} onEdit={openEdit} onDelete={deleteItem} onAddSpare={(item) => { setEditItem({ ...EMPTY_ITEM, item_type: "spare", site_code: item.site_code, linked_equipment_id: item.id }); setSheetMode("add"); setSheetOpen(true); }} onHistory={openHistory} onDocs={openDocs} onTransfer={openTransferModal} />
            )}
          </TabsContent>

          {/* ── Spares Tab ── */}
          <TabsContent value="spares" className="mt-4">
            {loading ? (
              <div className="py-20 text-center text-slate-400">Loading inventory…</div>
            ) : spareItems.length === 0 ? (
              <EmptyState type="spare" onAdd={() => openAdd("spare")} />
            ) : (
              <SparesTable items={spareItems} sites={sites} equipmentItems={items.filter(i => i.item_type === "equipment")} onEdit={openEdit} onDelete={deleteItem} onMovement={openMovement} onHistory={openHistory} onDocs={openDocs} onTransfer={openTransferModal} />
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ─── Add / Edit Sheet ─── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Package2 className="w-5 h-5 text-blue-600" />
              {sheetMode === "add" ? "Add Inventory Item" : "Edit Item"}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-4 py-4">
            {/* Type toggle */}
            <div>
              <Label>Item Type</Label>
              <div className="flex gap-2 mt-1">
                {["equipment", "spare"].map(t => (
                  <button key={t} onClick={() => setEditItem(p => ({ ...p, item_type: t }))}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${editItem.item_type === t ? "bg-blue-600 text-white border-blue-600" : "text-slate-600 border-slate-300 hover:bg-slate-50"}`}>
                    {t === "equipment" ? "Equipment" : "Spare Part"}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="mb-1 block">Plant / Site *</Label>
                <SearchableDropdown
                  options={sites.map(s => ({ label: s.site_name || s.site_code, value: s.site_code }))}
                  value={editItem.site_code}
                  onChange={v => setEditItem(p => ({ ...p, site_code: v }))}
                  placeholder="Select plant..."
                  className="h-10 text-sm"
                />
              </div>

              <div className="col-span-2">
                <Label>Name *</Label>
                <Input value={editItem.name} onChange={e => setEditItem(p => ({ ...p, name: e.target.value }))} placeholder="e.g. SMA Inverter Unit 1" />
              </div>

              <div className="col-span-2">
                <Label className="mb-1 block">Equipment Type</Label>
                <SearchableDropdown
                  options={EQUIPMENT_TYPES.map(t => ({ label: t, value: t }))}
                  value={editItem.equipment_type}
                  onChange={v => setEditItem(p => ({ ...p, equipment_type: v }))}
                  placeholder="Select type..."
                  className="h-10 text-sm"
                />
              </div>

              <div>
                <Label>Make / Brand</Label>
                <Input value={editItem.make} onChange={e => setEditItem(p => ({ ...p, make: e.target.value }))} placeholder="e.g. SMA, ABB" />
              </div>
              <div>
                <Label>Model</Label>
                <Input value={editItem.model} onChange={e => setEditItem(p => ({ ...p, model: e.target.value }))} placeholder="Model number" />
              </div>

              <div>
                <Label>Serial Number</Label>
                <Input value={editItem.serial_number} onChange={e => setEditItem(p => ({ ...p, serial_number: e.target.value }))} />
              </div>
              <div>
                <Label>Location in Plant</Label>
                <Input value={editItem.location_in_plant} onChange={e => setEditItem(p => ({ ...p, location_in_plant: e.target.value }))} placeholder="e.g. Room A" />
              </div>

              <div>
                <Label>Quantity</Label>
                <Input type="number" min={0} value={editItem.quantity} onChange={e => setEditItem(p => ({ ...p, quantity: Number(e.target.value) }))} />
              </div>
              <div>
                <Label>Unit</Label>
                <Input value={editItem.unit} onChange={e => setEditItem(p => ({ ...p, unit: e.target.value }))} placeholder="nos, pcs, m…" />
              </div>

              {editItem.item_type === "equipment" && (
                <div className="col-span-2">
                  <Label className="mb-1 block">Status</Label>
                  <SearchableDropdown
                    options={Object.entries(STATUS_CONFIG).map(([k, v]) => ({ label: v.label, value: k }))}
                    value={editItem.status}
                    onChange={v => setEditItem(p => ({ ...p, status: v }))}
                    placeholder="Select status..."
                    className="h-10 text-sm"
                  />
                </div>
              )}

              {editItem.item_type === "spare" && (
                <>
                  <div>
                    <Label>Min Stock Level</Label>
                    <Input type="number" min={0} value={editItem.min_stock_level} onChange={e => setEditItem(p => ({ ...p, min_stock_level: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <Label className="mb-1 block">Linked Equipment</Label>
                    <SearchableDropdown
                      options={[
                        { label: "None", value: "" },
                        ...items.filter(i => i.item_type === "equipment" && i.site_code === editItem.site_code).map(e => ({ label: e.name, value: e.id })),
                      ]}
                      value={editItem.linked_equipment_id || ""}
                      onChange={v => setEditItem(p => ({ ...p, linked_equipment_id: v }))}
                      placeholder="None"
                      className="h-10 text-sm"
                    />
                  </div>
                </>
              )}

              <div>
                <Label>Installed Date</Label>
                <Input type="date" value={editItem.installed_date} onChange={e => setEditItem(p => ({ ...p, installed_date: e.target.value }))} />
              </div>
              <div>
                <Label>Warranty Expiry</Label>
                <Input type="date" value={editItem.warranty_expiry} onChange={e => setEditItem(p => ({ ...p, warranty_expiry: e.target.value }))} />
              </div>

              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea value={editItem.notes} onChange={e => setEditItem(p => ({ ...p, notes: e.target.value }))} rows={2} />
              </div>
            </div>
          </div>

          <SheetFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancel</Button>
            <Button onClick={saveItem} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
              {saving ? "Saving…" : sheetMode === "add" ? "Add Item" : "Save Changes"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ─── Stock Movement Dialog ─── */}
      <Dialog open={movementOpen} onOpenChange={setMovementOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log Stock Movement</DialogTitle>
          </DialogHeader>
          {movementItem && (
            <div className="space-y-3 py-2">
              <div className="bg-slate-50 rounded-lg p-3 text-sm">
                <span className="font-medium">{movementItem.name}</span>
                <span className="text-slate-500 ml-2">Current stock: <strong>{movementItem.quantity}</strong> {movementItem.unit}</span>
              </div>
              <div>
                <Label>Movement Type</Label>
                <div className="flex gap-2 mt-1">
                  {[["in", "Stock In", "text-emerald-600"], ["out", "Stock Out", "text-red-600"], ["adjustment", "Adjustment", "text-blue-600"]].map(([v, l, c]) => (
                    <button key={v} onClick={() => setMovForm(p => ({ ...p, movement_type: v }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${movForm.movement_type === v ? "bg-slate-800 text-white border-slate-800" : `border-slate-200 ${c} hover:bg-slate-50`}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>{movForm.movement_type === "adjustment" ? "New Quantity" : "Quantity"}</Label>
                <Input type="number" min={0} value={movForm.quantity_change} onChange={e => setMovForm(p => ({ ...p, quantity_change: Number(e.target.value) }))} />
              </div>
              <div>
                <Label>Reason / Notes</Label>
                <Input value={movForm.reason} onChange={e => setMovForm(p => ({ ...p, reason: e.target.value }))} placeholder="e.g. Received from vendor" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovementOpen(false)}>Cancel</Button>
            <Button onClick={submitMovement} className="bg-blue-600 hover:bg-blue-700">Record Movement</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── History Dialog ─── */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-4 h-4 text-blue-600" />
              Full Audit History — {historyItem?.name}
              <span className="text-xs font-normal text-slate-400 ml-1">({historyItem?.site_code})</span>
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
            {movements.length === 0 ? (
              <div className="text-center text-slate-400 py-10 text-sm">No history recorded yet</div>
            ) : movements.map((m, i) => {
              const mt = m.movement_type || "";
              // ─ badge config per type ─
              const badge = {
                added:         { bg: "bg-emerald-500",  icon: "✚", label: "Added"          },
                updated:       { bg: "bg-blue-500",     icon: "✎", label: "Updated"         },
                deleted:       { bg: "bg-red-600",      icon: "✕", label: "Deleted"         },
                in:            { bg: "bg-teal-500",     icon: "+", label: "Stock In"         },
                out:           { bg: "bg-orange-500",   icon: "−", label: "Stock Out"        },
                adjustment:    { bg: "bg-purple-500",   icon: "~", label: "Adjustment"       },
                transfer_out:  { bg: "bg-amber-500",    icon: "→", label: "Transferred Out"  },
                transfer_in:   { bg: "bg-cyan-500",     icon: "←", label: "Transferred In"   },
              }[mt] || { bg: "bg-slate-400", icon: "•", label: mt.replace(/_/g, " ") };

              const qtyLine = mt === "adjustment"
                ? `Set to ${m.quantity_after}`
                : mt === "added"
                  ? `Initial qty: ${m.quantity_after}`
                  : mt === "updated"
                    ? (m.quantity_before !== m.quantity_after ? `Qty: ${m.quantity_before} → ${m.quantity_after}` : "")
                    : mt === "deleted"
                      ? `Had qty: ${m.quantity_before}`
                      : `${m.quantity_change > 0 ? "+" : ""}${m.quantity_change} (${m.quantity_before} → ${m.quantity_after})`;

              const dateStr = m.performed_at
                ? new Date(m.performed_at).toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })
                : "";

              return (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 bg-slate-50 text-sm hover:bg-white transition-colors">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5 ${badge.bg}`}>
                    {badge.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-700">{badge.label}</span>
                      {qtyLine && <span className="text-slate-500 text-xs">{qtyLine}</span>}
                      {m.changed_fields && m.changed_fields.length > 0 && (
                        <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                          fields: {m.changed_fields.filter(f => f !== "updated_at").join(", ")}
                        </span>
                      )}
                    </div>
                    {m.reason && <div className="text-slate-500 text-xs mt-0.5 truncate">{m.reason}</div>}
                    <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                      <span>👤 {m.performed_by || "System"}</span>
                      {dateStr && <><span>·</span><span>{dateStr}</span></>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Documents Dialog ─── */}
      <Dialog open={docsOpen} onOpenChange={setDocsOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              Documents — {docsItem?.name}
            </DialogTitle>
          </DialogHeader>

          {/* Upload Area */}
          <div
            className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) uploadDoc(f); }}
          >
            <input ref={fileInputRef} type="file" className="hidden" onChange={e => { if (e.target.files?.[0]) uploadDoc(e.target.files[0]); e.target.value = ""; }} />
            <Upload className={`w-8 h-8 mx-auto mb-2 ${uploading ? "text-blue-500 animate-bounce" : "text-slate-300"}`} />
            <p className="text-sm text-slate-500">{uploading ? "Uploading…" : "Click or drag & drop to upload"}</p>
            <p className="text-xs text-slate-400 mt-1">PDF, Word, Excel, Images — any file type</p>
          </div>

          {/* File List */}
          <div className="max-h-72 overflow-y-auto space-y-2 pr-1 mt-2">
            {docsLoading ? (
              <div className="text-center text-slate-400 text-sm py-6">Loading…</div>
            ) : docs.length === 0 ? (
              <div className="text-center text-slate-400 text-sm py-6">No documents attached yet. Upload one above.</div>
            ) : docs.map((doc, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 bg-white hover:bg-slate-50 group transition-colors">
                <span className="text-2xl leading-none">{fileIcon(doc.mime_type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{doc.name}</div>
                  <div className="text-[10px] text-slate-400">{fmtSize(doc.size_bytes)} · {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : ""}</div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-blue-600" title="Download / Preview" onClick={() => downloadDoc(doc.name)}><Download className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-500" title="Delete" onClick={() => deleteDoc(doc.name)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Inter-Plant Movement Registration Dialog ─── */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800">
              <Truck className="w-5 h-5 text-blue-600" />
              Inter-Plant Stock Movement Registration
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">

            {/* Region Scope Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-600">Region Scope:</span>
              <div className="flex border border-slate-300 rounded-md overflow-hidden">
                <button
                  className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                    transferRegionScope === "inner"
                      ? "bg-blue-600 text-white"
                      : "bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                  onClick={() => onTransferRegionScopeChange("inner")}
                >
                  🏢 Inner Region
                </button>
                <button
                  className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                    transferRegionScope === "outer"
                      ? "bg-purple-600 text-white"
                      : "bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                  onClick={() => onTransferRegionScopeChange("outer")}
                >
                  🌐 Outer Region
                </button>
              </div>
              {transferRegionScope === "outer" && (
                <span className="text-xs text-purple-600 font-medium">Showing sites from other regions</span>
              )}
            </div>

            {/* Step 1 — Equipment / Spare Name */}
            <div>
              <Label className="mb-1 block text-slate-700">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">1</span>
                  Equipment / Spare Model Name *
                </span>
              </Label>
              <SearchableDropdown
                options={
                  itemNamesLoading
                    ? [{ label: "Loading…", value: "" }]
                    : itemNames.map(n => ({
                        label: `${n.name}  (Total stock: ${n.total_qty})`,
                        value: n.name,
                      }))
                }
                value={selectedItemName}
                onChange={v => onItemNameSelect(v, transferRegionScope)}
                placeholder="Select equipment or spare part..."
                className="h-10 text-sm"
              />
            </div>

            {/* Step 2 — Source Plant */}
            <div>
              <Label className="mb-1 block text-slate-700">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">2</span>
                  Spare Available Plant — Source (Plant A) *
                </span>
              </Label>
              <SearchableDropdown
                options={
                  spareSitesLoading
                    ? [{ label: "Loading sites with stock…", value: "" }]
                    : spareSites.map(s => ({
                        label: `${s.site_name || s.site_code}${s.region ? ` [${s.region}]` : ""} — ${s.quantity} available`,
                        value: s.site_code,
                      }))
                }
                value={transferForm.from_site_code}
                onChange={v => setTransferForm(p => ({ ...p, from_site_code: v }))}
                placeholder={selectedItemName ? "Select source plant with stock…" : "First select an item name above"}
                disabled={!selectedItemName}
                className="h-10 text-sm"
              />
              {selectedItemName && !spareSitesLoading && spareSites.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">⚠ No plants have available stock of this item in the selected region.</p>
              )}
            </div>

            {/* Step 3 — Destination Plant */}
            <div>
              <Label className="mb-1 block text-slate-700">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">3</span>
                  Spare Required Site — Destination (Plant B) *
                </span>
              </Label>
              <SearchableDropdown
                options={sites
                  .filter(s => s.site_code !== transferForm.from_site_code)
                  .map(s => ({ label: `${s.site_name || s.site_code}${s.region ? ` [${s.region}]` : ""}`, value: s.site_code }))}
                value={transferForm.to_site_code}
                onChange={v => setTransferForm(p => ({ ...p, to_site_code: v }))}
                placeholder="Select destination plant..."
                className="h-10 text-sm"
              />
            </div>

            {/* Step 4 — Quantity & Reference */}
            <div>
              <Label className="mb-1 block text-slate-700">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">4</span>
                  Quantity & Details
                </span>
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-slate-500 mb-1 block">Quantity to Move *</Label>
                  <Input
                    type="number"
                    min={1}
                    max={spareSites.find(s => s.site_code === transferForm.from_site_code)?.quantity || undefined}
                    value={transferForm.quantity}
                    onChange={e => setTransferForm(p => ({ ...p, quantity: Number(e.target.value) }))}
                  />
                  {transferForm.from_site_code && spareSites.length > 0 && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      Max available: {spareSites.find(s => s.site_code === transferForm.from_site_code)?.quantity ?? "—"}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-slate-500 mb-1 block">Reference / Gate Pass #</Label>
                  <Input
                    value={transferForm.reference_no}
                    onChange={e => setTransferForm(p => ({ ...p, reference_no: e.target.value }))}
                    placeholder="e.g. GP-2026-99"
                  />
                </div>
              </div>
            </div>

            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Movement Reason / Notes</Label>
              <Textarea
                value={transferForm.reason}
                onChange={e => setTransferForm(p => ({ ...p, reason: e.target.value }))}
                placeholder="e.g. Urgent spare needed for inverter repair at destination site"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
            <Button onClick={submitTransfer} disabled={transferring} className="bg-blue-600 hover:bg-blue-700">
              {transferring ? "Processing…" : "✅ Apply Movement & Update Stock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Inter-Plant Movement Log Dialog ─── */}
      <Dialog open={transfersOpen} onOpenChange={setTransfersOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-purple-600" />
              Inter-Plant Movement Tracking Log
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1 space-y-2 my-2 nice-scroll">
            {transfersLoading ? (
              <div className="py-12 text-center text-slate-400 text-sm">Loading logs…</div>
            ) : transfersList.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">No inter-plant movements logged yet.</div>
            ) : (
              <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <th className="px-3 py-2 text-left font-semibold">Date &amp; Time</th>
                      <th className="px-3 py-2 text-left font-semibold">Item</th>
                      <th className="px-3 py-2 text-left font-semibold">Source (From)</th>
                      <th className="px-3 py-2 text-left font-semibold">Destination (To)</th>
                      <th className="px-3 py-2 text-left font-semibold">Qty</th>
                      <th className="px-3 py-2 text-left font-semibold">Ref / Reason</th>
                      <th className="px-3 py-2 text-left font-semibold">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfersList.map((t, idx) => (
                      <tr key={t.id || idx} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{t.transferred_at ? new Date(t.transferred_at).toLocaleString() : ""}</td>
                        <td className="px-3 py-2 font-medium text-slate-800">{t.item_name}</td>
                        <td className="px-3 py-2 text-amber-700 font-medium">{t.from_site_name || t.from_site_code}</td>
                        <td className="px-3 py-2 text-emerald-700 font-medium">{t.to_site_name || t.to_site_code}</td>
                        <td className="px-3 py-2 font-bold text-slate-800">{t.quantity} {t.unit}</td>
                        <td className="px-3 py-2 text-slate-500">{t.reference_no ? `[${t.reference_no}] ` : ""}{t.reason || "—"}</td>
                        <td className="px-3 py-2 text-slate-400">{t.transferred_by || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

/* ─────────────── Equipment Table ─────────────── */
function EquipmentTable({ items, sites, onEdit, onDelete, onAddSpare, onHistory, onDocs, onTransfer }) {
  const siteMap = Object.fromEntries(sites.map(s => [s.site_code, s.site_name || s.site_code]));
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left px-4 py-3 text-slate-600 font-semibold">Name</th>
            <th className="text-left px-4 py-3 text-slate-600 font-semibold">Type</th>
            <th className="text-left px-4 py-3 text-slate-600 font-semibold hidden md:table-cell">Make / Model</th>
            <th className="text-left px-4 py-3 text-slate-600 font-semibold hidden lg:table-cell">Serial No.</th>

            <th className="text-left px-4 py-3 text-slate-600 font-semibold">Plant</th>
            <th className="text-left px-4 py-3 text-slate-600 font-semibold">Status</th>
            <th className="text-left px-4 py-3 text-slate-600 font-semibold hidden md:table-cell">Qty</th>
            <th className="text-right px-4 py-3 text-slate-600 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? "" : "bg-slate-50/40"}`}>
              <td className="px-4 py-3 font-medium text-slate-800">{item.name}</td>
              <td className="px-4 py-3 text-slate-500">{item.equipment_type || "—"}</td>
              <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{[item.make, item.model].filter(Boolean).join(" / ") || "—"}</td>
              <td className="px-4 py-3 text-slate-500 font-mono text-xs hidden lg:table-cell">{item.serial_number || "—"}</td>
              <td className="px-4 py-3 text-slate-600 text-xs">{siteMap[item.site_code] || item.site_code}</td>
              <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
              <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{item.quantity} {item.unit}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-blue-600" title="Add Spare" onClick={() => onAddSpare(item)}><Box className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-blue-600" title="Transfer Stock to Another Plant" onClick={() => onTransfer(item)}><Truck className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-indigo-600" title="Documents" onClick={() => onDocs(item)}><FileText className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-purple-600" title="Movement History" onClick={() => onHistory(item)}><History className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-700" title="Edit" onClick={() => onEdit(item)}><Edit2 className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600" title="Delete" onClick={() => onDelete(item)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────── Spares Table ─────────────── */
function SparesTable({ items, sites, equipmentItems, onEdit, onDelete, onMovement, onHistory, onDocs, onTransfer }) {
  const siteMap = Object.fromEntries(sites.map(s => [s.site_code, s.site_name || s.site_code]));
  const equipMap = Object.fromEntries(equipmentItems.map(e => [e.id, e.name]));
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left px-4 py-3 text-slate-600 font-semibold">Name</th>
            <th className="text-left px-4 py-3 text-slate-600 font-semibold">Type</th>
            <th className="text-left px-4 py-3 text-slate-600 font-semibold hidden lg:table-cell">Linked Equipment</th>
            <th className="text-left px-4 py-3 text-slate-600 font-semibold">Plant</th>
            <th className="text-left px-4 py-3 text-slate-600 font-semibold">Qty</th>
            <th className="text-left px-4 py-3 text-slate-600 font-semibold hidden md:table-cell">Min Stock</th>
            <th className="text-left px-4 py-3 text-slate-600 font-semibold">Availability</th>
            <th className="text-right px-4 py-3 text-slate-600 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? "" : "bg-slate-50/40"}`}>
              <td className="px-4 py-3 font-medium text-slate-800">{item.name}</td>
              <td className="px-4 py-3 text-slate-500">{item.equipment_type || "—"}</td>
              <td className="px-4 py-3 text-slate-500 text-xs hidden lg:table-cell">{equipMap[item.linked_equipment_id] || "—"}</td>
              <td className="px-4 py-3 text-slate-600 text-xs">{siteMap[item.site_code] || item.site_code}</td>
              <td className="px-4 py-3 font-semibold text-slate-800">{item.quantity} <span className="font-normal text-slate-400 text-xs">{item.unit}</span></td>
              <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{item.min_stock_level}</td>
              <td className="px-4 py-3"><SpareBadge status={item.spare_status} /></td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-emerald-600" title="Log Stock Adjustment" onClick={() => onMovement(item)}><ArrowUpDown className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-blue-600" title="Transfer Stock to Another Plant" onClick={() => onTransfer(item)}><Truck className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-indigo-600" title="Documents" onClick={() => onDocs(item)}><FileText className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-purple-600" title="Movement History" onClick={() => onHistory(item)}><History className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-700" title="Edit" onClick={() => onEdit(item)}><Edit2 className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600" title="Delete" onClick={() => onDelete(item)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────── Empty State ─────────────── */
function EmptyState({ type, onAdd }) {
  return (
    <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-xl">
      <Package2 className="w-12 h-12 mx-auto text-slate-300 mb-3" />
      <p className="text-slate-500 font-medium">No {type === "equipment" ? "equipment" : "spare parts"} found</p>
      <p className="text-slate-400 text-sm mt-1 mb-4">Add your first {type === "equipment" ? "equipment item" : "spare part"} to get started</p>
      <Button onClick={onAdd} className="bg-blue-600 hover:bg-blue-700">
        <Plus className="w-4 h-4 mr-1" />Add {type === "equipment" ? "Equipment" : "Spare Part"}
      </Button>
    </div>
  );
}
