import React, { useEffect, useMemo, useRef, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { api, API, getErrorMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
} from "ag-grid-community";
import {
  MapPin, Download, Upload, Plus, Trash2, Save, FilePlus2, RotateCcw,
  History, FileSpreadsheet, Columns3, Link2, ArrowRightLeft, Search, RefreshCw, UserCheck, Building2, Calendar
} from "lucide-react";

ModuleRegistry.registerModules([AllCommunityModule]);

const ffTheme = themeQuartz.withParams({
  fontFamily: "Inter, system-ui, sans-serif",
  headerFontWeight: 700,
  spacing: 8,
  borderRadius: 8,
  wrapperBorderRadius: 12,
  accentColor: "#2563eb",
});

export default function SiteMasterPage() {
  const { user: me } = useAuth();
  const canEdit = me?.role === "super_admin" || me?.role === "admin";

  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [originalRows, setOriginalRows] = useState([]);
  const [search, setSearch] = useState("");
  const [showHidden, setShowHidden] = useState(false);

  const [vendorNames, setVendorNames] = useState([]);
  const [vendorDetailsMap, setVendorDetailsMap] = useState({});
  const [clusterManagers, setClusterManagers] = useState([]);
  const [clusterManagerMap, setClusterManagerMap] = useState({});
  const [clusterManagerDetailsMap, setClusterManagerDetailsMap] = useState({});

  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [replace, setReplace] = useState(false);
  const [addColOpen, setAddColOpen] = useState(false);
  const [newColLabel, setNewColLabel] = useState("");
  const [importing, setImporting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [imports, setImports] = useState([]);

  const [roofImportOpen, setRoofImportOpen] = useState(false);
  const [roofImportFile, setRoofImportFile] = useState(null);
  const [roofImporting, setRoofImporting] = useState(false);

  const [freqImportOpen, setFreqImportOpen] = useState(false);
  const [freqImportFile, setFreqImportFile] = useState(null);
  const [freqImporting, setFreqImporting] = useState(false);

  const roofFileRef = useRef(null);
  const freqFileRef = useRef(null);
  const gridRef = useRef(null);
  const fileRef = useRef(null);

  // --- Site Handover / Transfer State ---
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [handoverSite, setHandoverSite] = useState(null);
  const [handoverTab, setHandoverTab] = useState("vendor"); // "vendor" | "cluster_manager" | "history"
  const [handoverForm, setHandoverForm] = useState({
    vendor_name: "",
    vendor_email: "",
    cc_email: "",
    approver_email: "",
    vendor_approver_l1: "",
    vendor_approver_l2: "",
    cluster_manager_name: "",
    cluster: "",
    region: "",
    effective_date: "",
    reason: "",
  });
  const [handoverHistory, setHandoverHistory] = useState([]);
  const [handoverSubmitting, setHandoverSubmitting] = useState(false);
  const [handoverLoadingHistory, setHandoverLoadingHistory] = useState(false);

  const openHandoverModal = (site, tab = "vendor") => {
    setHandoverSite(site);
    setHandoverTab(tab);
    setHandoverForm({
      vendor_name: site.vendor_name || "",
      vendor_email: site.vendor_email || "",
      cc_email: site.cc_email || "",
      approver_email: site.approver_email || "",
      vendor_approver_l1: site.vendor_approver_l1 || "",
      vendor_approver_l2: site.vendor_approver_l2 || "",
      cluster_manager_name: site.cluster_manager_name || "",
      cluster: site.cluster || "",
      region: site.region || "",
      effective_date: new Date().toISOString().slice(0, 10),
      reason: "",
    });
    setHandoverOpen(true);
    fetchHandoverHistory(site.site_id);
  };

  const fetchHandoverHistory = async (siteId) => {
    if (!siteId) return;
    setHandoverLoadingHistory(true);
    try {
      const res = await api.get(`/sites/${siteId}/transfers`);
      setHandoverHistory(res.data.transfers || []);
    } catch (e) {
      setHandoverHistory([]);
    } finally {
      setHandoverLoadingHistory(false);
    }
  };

  const submitHandover = async () => {
    if (!handoverSite?.site_id) return;
    setHandoverSubmitting(true);
    try {
      const payload = {
        type: handoverTab === "cluster_manager" ? "cluster_manager" : "vendor",
        effective_date: handoverForm.effective_date,
        reason: handoverForm.reason,
        ...(handoverTab === "cluster_manager"
          ? {
              cluster_manager_name: handoverForm.cluster_manager_name,
              cluster: handoverForm.cluster,
              region: handoverForm.region,
              approver_email: handoverForm.approver_email,
            }
          : {
              vendor_name: handoverForm.vendor_name,
              vendor_email: handoverForm.vendor_email,
              cc_email: handoverForm.cc_email,
              approver_email: handoverForm.approver_email,
              vendor_approver_l1: handoverForm.vendor_approver_l1,
              vendor_approver_l2: handoverForm.vendor_approver_l2,
            }),
      };
      await api.post(`/sites/${handoverSite.site_id}/transfer`, payload);
      toast.success(
        `${
          handoverTab === "cluster_manager" ? "Cluster Manager" : "Vendor"
        } handover recorded successfully`
      );
      setHandoverOpen(false);
      await load();
    } catch (e) {
      toast.error(getErrorMessage(e, "Handover failed"));
    } finally {
      setHandoverSubmitting(false);
    }
  };

  const authedDownload = async (endpoint, filename) => {
    try {
      const token = localStorage.getItem("ff_token");
      const res = await fetch(`${API}${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e.message || "Download failed");
    }
  };

  const load = async () => {
    try {
      const [c, r, vRes, uRes] = await Promise.all([
        api.get("/sites/columns?include_hidden=true").catch(() => ({ data: [] })),
        api.get("/sites?show_all=true").catch(() => ({ data: [] })),
        api.get("/vendors").catch(() => ({ data: [] })),
        api.get("/users").catch(() => ({ data: [] }))
      ]);
      const columnsData = Array.isArray(c.data) ? c.data : (c.data?.columns || []);
      setColumns(columnsData);
      
      const vendorsList = Array.isArray(vRes.data) ? vRes.data : (vRes.data?.vendors || []);
      const usersList = Array.isArray(uRes.data) ? uRes.data : (uRes.data?.users || []);

      const vnames = vendorsList.map(v => v.name || v.vendor_name).filter(Boolean);
      setVendorNames([...new Set(vnames)]);
      
      const vmap = {};
      vendorsList.forEach(v => {
        const vn = v.name || v.vendor_name;
        const ve = v.email || v.vendor_email;
        if (vn && ve) {
          vmap[vn] = ve;
          vmap[vn.toLowerCase()] = ve;
        }
      });
      setVendorDetailsMap(vmap);
      
      const adminUsers = usersList.filter(u => (u.role === "admin" || u.role === "super_admin") && u.name);
      const cnames = adminUsers.map(u => u.name).filter(Boolean);
      const cmMap = {};
      const cmDetailsMap = {};
      usersList.forEach(u => {
        const details = {
          email: u.email || "",
          cluster: u.cluster || "",
          region: u.region || "",
        };
        const keys = [
          u.name,
          u.cluster_manager_name,
          u.name ? u.name.split('(')[0].trim() : "",
          u.cluster_manager_name ? u.cluster_manager_name.split('(')[0].trim() : ""
        ];
        keys.forEach(k => {
          if (k) {
            if (u.email) cmMap[k] = u.email;
            cmDetailsMap[k] = details;
            cmDetailsMap[k.toLowerCase()] = details;
          }
        });
      });
      setClusterManagers([...new Set(cnames)]);
      setClusterManagerMap(cmMap);
      setClusterManagerDetailsMap(cmDetailsMap);
      
      const siteData = Array.isArray(r.data) ? r.data : (r.data?.sites || r.data?.rows || []);
      const rows = siteData.map((row) => {
        const list = Array.isArray(row.allowed_emails) ? row.allowed_emails : [];
        if (list.length > 1) row = { ...row, vendor_email: list.join("; ") };
        return row;
      });
      setRows(rows);
      setOriginalRows(JSON.parse(JSON.stringify(rows)));
    } catch (err) {
      console.error("SiteMaster load error:", err);
    }
  };
  useEffect(() => { load(); }, []);

  // Build AG Grid column definitions
  const colDefs = useMemo(() => {
    const cols = [
      { headerCheckboxSelection: true, checkboxSelection: true, width: 50, pinned: "left",
        suppressMovable: true, sortable: false, filter: false, editable: false, resizable: false },
      ...(canEdit ? [{
        headerName: "Action",
        field: "_actions",
        width: 125,
        minWidth: 120,
        pinned: "left",
        suppressMovable: true,
        sortable: false,
        filter: false,
        editable: false,
        resizable: true,
        cellRenderer: (params) => {
          if (!params.data || params.data.__new) return null;
          return (
            <div className="flex items-center justify-center h-full w-full py-1">
              <button
                type="button"
                className="px-2.5 py-1 text-[11px] font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-900 dark:text-emerald-100 dark:bg-emerald-900/80 dark:hover:bg-emerald-800 rounded-md border border-emerald-300 dark:border-emerald-700/80 transition cursor-pointer flex items-center gap-1 shadow-xs whitespace-nowrap"
                title="Handover site to another vendor or cluster manager"
                onClick={(e) => {
                  e.stopPropagation();
                  openHandoverModal(params.data, "vendor");
                }}
              >
                <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-800 dark:text-emerald-300 shrink-0" /> Handover
              </button>
            </div>
          );
        }
      }] : []),
      ...columns.map((c) => {
        let editorProps = {};
        if (c.key === "vendor_name") {
          editorProps = { cellEditor: 'agSelectCellEditor', cellEditorParams: { values: vendorNames } };
        } else if (c.key === "cluster_manager_name") {
          editorProps = { cellEditor: 'agSelectCellEditor', cellEditorParams: { values: clusterManagers } };
        }
        
        return {
          field: c.key,
          headerName: c.label,
          headerTooltip: c.key === "vendor_email"
            ? "Multiple vendor contacts allowed — separate emails with a semicolon (;). Every listed user under the same vendor will get access to this site."
            : undefined,
          editable: canEdit,
          filter: true,
          sortable: true,
          resizable: true,
          minWidth: 130,
          ...(["latitude", "longitude", "ac_capacity", "dc_capacity", "inverter_capacity"].includes(c.key) ? { type: "numericColumn" } : {}),
          ...editorProps,
          hide: c.hidden && !showHidden,
          cellClass: (params) =>
            canEdit && isModified(params.data, c.key) ? "ff-cell-modified" : "",
        };
      }),
    ];
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, originalRows, vendorNames, clusterManagers, showHidden]);

  const isModified = (row, key) => {
    const orig = originalRows.find((r) => r.site_id === row.site_id);
    if (!orig) return key === "site_name" && row.__new; // mark new rows
    return String(orig[key] ?? "") !== String(row[key] ?? "");
  };

  const dirtyCount = useMemo(() => {
    let n = 0;
    for (const r of rows) {
      const orig = originalRows.find((o) => o.site_id === r.site_id);
      if (!orig || r.__new) { n++; continue; }
      for (const c of columns) {
        if (String(orig[c.key] ?? "") !== String(r[c.key] ?? "")) { n++; break; }
      }
    }
    return n;
  }, [rows, originalRows, columns]);

  const filtered = useMemo(() => {
    if (!search) return rows;
    const s = search.toLowerCase();
    return rows.filter((r) =>
      Object.values(r).some((v) => v !== null && v !== undefined && String(v).toLowerCase().includes(s)),
    );
  }, [rows, search]);

  const addRow = () => {
    setRows((r) => [
      { site_id: `_new_${Math.random().toString(36).slice(2, 8)}`, site_name: "", site_code: "", __new: true },
      ...r,
    ]);
  };

  const deleteSelected = async () => {
    const api_ = gridRef.current?.api;
    if (!api_) return;
    const selected = api_.getSelectedRows();
    if (selected.length === 0) { toast.error("Select at least one row"); return; }
    if (!confirm(`Delete ${selected.length} site(s)?`)) return;
    const ids = selected.filter((r) => !r.__new).map((r) => r.site_id);
    if (ids.length) await api.post("/sites/bulk-delete", { site_ids: ids });
    toast.success(`Deleted ${selected.length}`);
    await load();
  };

  const saveAll = async () => {
    const modified = rows.filter((r) => {
      const orig = originalRows.find((o) => o.site_id === r.site_id);
      if (!orig || r.__new) return true;
      return columns.some((c) => String(orig[c.key] ?? "") !== String(r[c.key] ?? ""));
    });
    if (modified.length === 0) { toast.info("No changes to save"); return; }
    try {
      const r = await api.post("/sites/bulk", { rows: modified });
      toast.success(`Saved ${r.data.upserted} row(s)`);
      await load();
    } catch (e) {
      toast.error(getErrorMessage(e, "Save failed"));
    }
  };

  const discard = () => {
    setRows(JSON.parse(JSON.stringify(originalRows)));
    toast.success("Reverted");
  };

  const downloadTemplate = () => authedDownload(`/sites/template.xlsx?include_hidden=${showHidden}`, "sites-template.xlsx");
  const exportXlsx = () => authedDownload(`/sites/export.xlsx?include_hidden=${showHidden}`, "sites-export.xlsx");
  const exportCsv = () => authedDownload(`/sites/export.csv?include_hidden=${showHidden}`, "sites-export.csv");

  const doImport = async () => {
    if (!importFile) { toast.error("Choose a file"); return; }
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      fd.append("replace", String(replace));
      const r = await api.post("/sites/import", fd, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      toast.success(`${r.data.rows} row(s) imported`);
      setImportOpen(false); setImportFile(null); setReplace(false);
      await load();
    } catch (e) {
      toast.error(getErrorMessage(e, "Import failed"));
    } finally {
      setImporting(false);
    }
  };

  const addColumn = async () => {
    if (!newColLabel.trim()) return;
    try {
      await api.post("/sites/columns", { label: newColLabel });
      toast.success("Column added");
      setAddColOpen(false); setNewColLabel("");
      await load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const loadHistory = async () => {
    const r = await api.get("/sites/_imports");
    setImports(r.data);
    setHistoryOpen(true);
  };

  return (
    <AppLayout>
      <div className="max-w-[1400px]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-xs uppercase tracking-[0.1em] text-slate-400 font-bold">Master data</span>
            <h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight text-slate-900 mt-1">Site Master</h1>
            <p className="text-slate-500 mt-1">
              {canEdit
                ? "Edit sites inline like a spreadsheet — every cell change is tracked in version history."
                : "Viewing your portfolio sites (read-only). Contact your admin to make changes."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select onValueChange={(val) => {
              if (val === "sites-xlsx") exportXlsx();
              else if (val === "sites-csv") exportCsv();
              else if (val === "sites-tpl") downloadTemplate();
              else if (val === "roofs-xlsx") authedDownload("/sites/roofs/export.xlsx", "roofs-export.xlsx");
              else if (val === "roofs-tpl") authedDownload("/sites/roofs/template.xlsx", "roofs-template.xlsx");
            }}>
              <SelectTrigger className="h-9 px-3 text-xs bg-white border border-slate-200 rounded-lg flex items-center gap-1.5 shadow-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
                <Download className="w-4 h-4 text-blue-600" />
                <span>Export & Templates</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sites-xlsx">📊 Export Sites (Excel)</SelectItem>
                <SelectItem value="sites-csv">📄 Export Sites (CSV)</SelectItem>
                <SelectItem value="sites-tpl">📋 Sites Template</SelectItem>
                <SelectItem value="roofs-xlsx">🏠 Export Roofs (Excel)</SelectItem>
                <SelectItem value="roofs-tpl">📋 Roofs Template</SelectItem>
              </SelectContent>
            </Select>

            {canEdit && (
              <Select onValueChange={(val) => {
                if (val === "import-sites") setImportOpen(true);
                else if (val === "import-roofs") setRoofImportOpen(true);
                else if (val === "import-history") loadHistory();
              }}>
                <SelectTrigger className="h-9 px-3 text-xs bg-white border border-slate-200 rounded-lg flex items-center gap-1.5 shadow-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
                  <Upload className="w-4 h-4 text-emerald-600" />
                  <span>Import Data</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="import-sites">📥 Import Sites</SelectItem>
                  <SelectItem value="import-roofs">🏠 Import Roofs</SelectItem>
                  <SelectItem value="import-history">📜 Import History Log</SelectItem>
                </SelectContent>
              </Select>
            )}

            <Select onValueChange={async (val) => {
              if (val === "add-col") setAddColOpen(true);
              else if (val === "toggle-hidden") setShowHidden(!showHidden);
            }}>
              <SelectTrigger className="h-9 px-3 text-xs bg-white border border-slate-200 rounded-lg flex items-center gap-1.5 shadow-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
                <Columns3 className="w-4 h-4 text-purple-600" />
                <span>Tools & Options</span>
              </SelectTrigger>
              <SelectContent>
                {canEdit && <SelectItem value="add-col">➕ Add Custom Column</SelectItem>}
                <SelectItem value="toggle-hidden">
                  {showHidden ? "👁️‍🗨️ Hide System Data" : "👁️ Show Hidden Data"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="rounded-2xl border-slate-100 card-soft bg-white">
          <div className="flex items-center justify-between p-3 border-b border-slate-100 gap-2 flex-wrap">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search rows…"
              className="h-9 max-w-xs"
            />
            <div className="flex items-center gap-1.5">
              {canEdit && dirtyCount > 0 && (
                <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
                  {dirtyCount} unsaved change{dirtyCount !== 1 && "s"}
                </span>
              )}
              {canEdit && (
                <>
                  <Button variant="ghost" size="sm" onClick={addRow}>
                    <Plus className="w-4 h-4 mr-1" /> Row
                  </Button>
                  <Button variant="ghost" size="sm" onClick={deleteSelected} className="text-red-600 hover:text-red-700">
                    <Trash2 className="w-4 h-4 mr-1" /> Delete
                  </Button>
                  <Button variant="ghost" size="sm" onClick={discard} disabled={dirtyCount === 0}>
                    <RotateCcw className="w-4 h-4 mr-1" /> Discard
                  </Button>
                  <Button size="sm" onClick={saveAll} className="bg-blue-600 hover:bg-blue-700">
                    <Save className="w-4 h-4 mr-1" /> Save {dirtyCount > 0 && `(${dirtyCount})`}
                  </Button>
                </>
              )}
            </div>
          </div>
          <div style={{ height: "calc(100vh - 240px)", minHeight: 420 }}>
            <AgGridReact
              theme={ffTheme}
              ref={gridRef}
              rowData={filtered}
              columnDefs={colDefs}
              rowSelection={{ mode: "multiRow", checkboxes: false, headerCheckbox: false }}
              getRowId={(p) => p.data.site_id}
              defaultColDef={{ flex: 1, minWidth: 110, resizable: true, sortable: true, filter: true }}
              animateRows={true}
              undoRedoCellEditing={true}
              undoRedoCellEditingLimit={50}
              onCellValueChanged={(e) => {
                const { field, newValue } = e;
                let updatedData = { ...e.data };
                if (field === "cluster_manager_name" && newValue) {
                  const details = clusterManagerDetailsMap[newValue] || clusterManagerDetailsMap[newValue.toLowerCase()];
                  if (details) {
                    if (details.email) updatedData.approver_email = details.email;
                    if (details.cluster) updatedData.cluster = details.cluster;
                    if (details.region) updatedData.region = details.region;
                  }
                }
                setRows((r) => r.map((x) => x.site_id === e.data.site_id ? updatedData : x));
              }}
            />
          </div>
        </Card>
      </div>

      {/* --- Site Handover / Transfer Modal --- */}
      <Dialog open={handoverOpen} onOpenChange={setHandoverOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <ArrowRightLeft className="w-5 h-5 text-emerald-600" />
              Site Handover &amp; Responsibility Transfer
            </DialogTitle>
            <DialogDescription>
              Transfer responsibility for <span className="font-semibold text-slate-900">{handoverSite?.site_name || handoverSite?.site_code}</span> to another Vendor or Cluster Manager.
            </DialogDescription>
          </DialogHeader>

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-200 gap-4 mb-4 text-sm font-medium">
            <button
              type="button"
              className={`pb-2 border-b-2 transition-colors flex items-center gap-1.5 ${
                handoverTab === "vendor"
                  ? "border-emerald-600 text-emerald-600 font-bold"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
              onClick={() => setHandoverTab("vendor")}
            >
              <Building2 className="w-4 h-4" /> Vendor Handover
            </button>
            <button
              type="button"
              className={`pb-2 border-b-2 transition-colors flex items-center gap-1.5 ${
                handoverTab === "cluster_manager"
                  ? "border-emerald-600 text-emerald-600 font-bold"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
              onClick={() => setHandoverTab("cluster_manager")}
            >
              <UserCheck className="w-4 h-4" /> Cluster Manager Handover
            </button>
            <button
              type="button"
              className={`pb-2 border-b-2 transition-colors flex items-center gap-1.5 ${
                handoverTab === "history"
                  ? "border-emerald-600 text-emerald-600 font-bold"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
              onClick={() => setHandoverTab("history")}
            >
              <History className="w-4 h-4" /> Transfer Log ({handoverHistory.length})
            </button>
          </div>

          {/* Tab 1: Vendor Handover */}
          {handoverTab === "vendor" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">New Vendor Name</Label>
                  <Select
                    value={handoverForm.vendor_name}
                    onValueChange={(val) => {
                      const autoEmail = vendorDetailsMap[val] || vendorDetailsMap[val.toLowerCase()] || "";
                      setHandoverForm({
                        ...handoverForm,
                        vendor_name: val,
                        vendor_email: autoEmail || handoverForm.vendor_email,
                      });
                    }}
                  >
                    <SelectTrigger className="h-9 text-xs mt-1">
                      <SelectValue placeholder="Select Vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendorNames.map((vn) => (
                        <SelectItem key={vn} value={vn}>
                          {vn}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold">Vendor Email Contact (Auto-populated / Editable)</Label>
                  <Input
                    value={handoverForm.vendor_email}
                    onChange={(e) => setHandoverForm({ ...handoverForm, vendor_email: e.target.value })}
                    placeholder="ops@vendor.com"
                    className="h-9 text-xs mt-1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">CC Email (Optional)</Label>
                <Input
                  value={handoverForm.cc_email}
                  onChange={(e) => setHandoverForm({ ...handoverForm, cc_email: e.target.value })}
                  placeholder="manager@vendor.com"
                  className="h-9 text-xs mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">L1 Approver</Label>
                  <Input
                    value={handoverForm.vendor_approver_l1}
                    onChange={(e) => setHandoverForm({ ...handoverForm, vendor_approver_l1: e.target.value })}
                    placeholder="L1 Approver Name/Email"
                    className="h-9 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">L2 Approver</Label>
                  <Input
                    value={handoverForm.vendor_approver_l2}
                    onChange={(e) => setHandoverForm({ ...handoverForm, vendor_approver_l2: e.target.value })}
                    placeholder="L2 Approver Name/Email"
                    className="h-9 text-xs mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Effective Date</Label>
                  <Input
                    type="date"
                    value={handoverForm.effective_date}
                    onChange={(e) => setHandoverForm({ ...handoverForm, effective_date: e.target.value })}
                    className="h-9 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Handover Reason</Label>
                  <Input
                    value={handoverForm.reason}
                    onChange={(e) => setHandoverForm({ ...handoverForm, reason: e.target.value })}
                    placeholder="e.g. O&M Contract Renewal"
                    className="h-9 text-xs mt-1"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Cluster Manager Handover */}
          {handoverTab === "cluster_manager" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">New Cluster Manager</Label>
                  <Select
                    value={handoverForm.cluster_manager_name}
                    onValueChange={(val) => {
                      const details = clusterManagerDetailsMap[val] || clusterManagerDetailsMap[val.toLowerCase()];
                      setHandoverForm({
                        ...handoverForm,
                        cluster_manager_name: val,
                        approver_email: details?.email || clusterManagerMap[val] || handoverForm.approver_email,
                        cluster: details?.cluster || handoverForm.cluster,
                        region: details?.region || handoverForm.region,
                      });
                    }}
                  >
                    <SelectTrigger className="h-9 text-xs mt-1">
                      <SelectValue placeholder="Select Cluster Manager" />
                    </SelectTrigger>
                    <SelectContent>
                      {clusterManagers.map((cm) => (
                        <SelectItem key={cm} value={cm}>
                          {cm}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold">Approver Email (Auto-populated)</Label>
                  <Input
                    value={handoverForm.approver_email}
                    onChange={(e) => setHandoverForm({ ...handoverForm, approver_email: e.target.value })}
                    placeholder="approver@cleanmax.com"
                    className="h-9 text-xs mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Cluster Group</Label>
                  <Input
                    value={handoverForm.cluster}
                    onChange={(e) => setHandoverForm({ ...handoverForm, cluster: e.target.value })}
                    placeholder="e.g. South-1, West-1"
                    className="h-9 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Region</Label>
                  <Input
                    value={handoverForm.region}
                    onChange={(e) => setHandoverForm({ ...handoverForm, region: e.target.value })}
                    placeholder="e.g. South, West"
                    className="h-9 text-xs mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Effective Date</Label>
                  <Input
                    type="date"
                    value={handoverForm.effective_date}
                    onChange={(e) => setHandoverForm({ ...handoverForm, effective_date: e.target.value })}
                    className="h-9 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Handover Reason</Label>
                  <Input
                    value={handoverForm.reason}
                    onChange={(e) => setHandoverForm({ ...handoverForm, reason: e.target.value })}
                    placeholder="e.g. Organizational Re-alignment"
                    className="h-9 text-xs mt-1"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Transfer Log History */}
          {handoverTab === "history" && (
            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {handoverLoadingHistory ? (
                <div className="p-8 text-center text-slate-400 text-xs">Loading handover history…</div>
              ) : handoverHistory.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">No prior transfers recorded for this site.</div>
              ) : (
                handoverHistory.map((item, idx) => (
                  <div key={item.transfer_id || idx} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
                    <div className="flex items-center justify-between font-semibold text-slate-800">
                      <span className="capitalize">{item.type?.replace("_", " ")} Handover</span>
                      <span className="text-slate-500 font-normal">{item.effective_date}</span>
                    </div>
                    <p className="text-slate-600">
                      <span className="font-medium text-slate-700">Reason:</span> {item.reason || "N/A"}
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-200 pt-1 mt-1">
                      <span>Changed by: {item.changed_by_name || item.changed_by_email}</span>
                      <span>{new Date(item.changed_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          <DialogFooter className="mt-6 border-t border-slate-100 pt-3">
            <Button variant="outline" size="sm" onClick={() => setHandoverOpen(false)}>
              Cancel
            </Button>
            {handoverTab !== "history" && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={submitHandover}
                disabled={handoverSubmitting}
              >
                {handoverSubmitting ? "Submitting..." : "Confirm & Execute Handover"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
