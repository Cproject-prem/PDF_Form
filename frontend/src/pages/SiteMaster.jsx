import React, { useEffect, useMemo, useRef, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { api, API } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
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
  History, FileSpreadsheet, Columns3,
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
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [originalRows, setOriginalRows] = useState([]);
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [replace, setReplace] = useState(false);
  const [addColOpen, setAddColOpen] = useState(false);
  const [newColLabel, setNewColLabel] = useState("");
  const [importing, setImporting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [imports, setImports] = useState([]);
  const gridRef = useRef(null);
  const fileRef = useRef(null);

  const load = async () => {
    const [c, r] = await Promise.all([
      api.get("/sites/columns"),
      api.get("/sites"),
    ]);
    setColumns(c.data);
    setRows(r.data);
    setOriginalRows(JSON.parse(JSON.stringify(r.data)));
  };
  useEffect(() => { load(); }, []);

  // Build AG Grid column definitions
  const colDefs = useMemo(() => {
    const cols = [
      { headerCheckboxSelection: true, checkboxSelection: true, width: 50, pinned: "left",
        suppressMovable: true, sortable: false, filter: false, editable: false, resizable: false },
      ...columns.map((c) => ({
        field: c.key,
        headerName: c.label,
        editable: true,
        filter: true,
        sortable: true,
        resizable: true,
        minWidth: 130,
        ...(["latitude", "longitude", "ac_capacity", "dc_capacity", "inverter_capacity"].includes(c.key) ? { type: "numericColumn" } : {}),
        cellClass: (params) =>
          isModified(params.data, c.key) ? "ff-cell-modified" : "",
      })),
    ];
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, originalRows]);

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

  // --- mutations ---
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
    // collect dirty (changed or new) rows
    const dirty = [];
    for (const r of rows) {
      const orig = originalRows.find((o) => o.site_id === r.site_id);
      let changed = !orig || r.__new;
      if (!changed && orig) {
        for (const c of columns) {
          if (String(orig[c.key] ?? "") !== String(r[c.key] ?? "")) { changed = true; break; }
        }
      }
      if (changed) {
        const cleaned = { ...r };
        if (r.__new) delete cleaned.site_id;
        delete cleaned.__new;
        dirty.push(cleaned);
      }
    }
    if (dirty.length === 0) { toast.success("Nothing to save"); return; }
    try {
      await api.post("/sites/bulk", { rows: dirty, delete_missing: false });
      toast.success(`${dirty.length} row(s) saved`);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    }
  };

  const discard = () => {
    setRows(JSON.parse(JSON.stringify(originalRows)));
    toast.success("Reverted");
  };

  // --- import/export ---
  const downloadTemplate = async () => {
    await authedDownload(`${API}/sites/template.xlsx`, "sites-template.xlsx");
  };
  const exportXlsx = async () => {
    await authedDownload(`${API}/sites/export.xlsx`, "sites-export.xlsx");
  };
  const exportCsv = async () => {
    await authedDownload(`${API}/sites/export.csv`, "sites-export.csv");
  };

  const doImport = async () => {
    if (!importFile) { toast.error("Choose a file"); return; }
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      fd.append("replace", String(replace));
      const token = localStorage.getItem("ff_token");
      const r = await fetch(`${API}/sites/import`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!r.ok) throw new Error((await r.json()).detail || "Import failed");
      const data = await r.json();
      toast.success(`${data.rows} row(s) imported`);
      setImportOpen(false); setImportFile(null); setReplace(false);
      await load();
    } catch (e) {
      toast.error(e.message || "Import failed");
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
              Edit sites inline like a spreadsheet — every cell change is tracked in version history.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={downloadTemplate} data-testid="sites-template">
              <FileSpreadsheet className="w-4 h-4 mr-1" /> Template
            </Button>
            <Button variant="outline" size="sm" onClick={exportXlsx} data-testid="sites-export-xlsx">
              <Download className="w-4 h-4 mr-1" /> Export Excel
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} data-testid="sites-export-csv">
              <Download className="w-4 h-4 mr-1" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} data-testid="sites-import">
              <Upload className="w-4 h-4 mr-1" /> Import
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAddColOpen(true)} data-testid="sites-add-col">
              <Columns3 className="w-4 h-4 mr-1" /> Add column
            </Button>
            <Button variant="outline" size="sm" onClick={loadHistory} data-testid="sites-history">
              <History className="w-4 h-4 mr-1" /> Imports
            </Button>
          </div>
        </div>

        <Card className="rounded-2xl border-slate-100 card-soft bg-white">
          <div className="flex items-center justify-between p-3 border-b border-slate-100 gap-2 flex-wrap">
            <Input
              data-testid="sites-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search rows…"
              className="h-9 max-w-xs"
            />
            <div className="flex items-center gap-1.5">
              {dirtyCount > 0 && (
                <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
                  {dirtyCount} unsaved change{dirtyCount !== 1 && "s"}
                </span>
              )}
              <Button variant="ghost" size="sm" onClick={addRow} data-testid="sites-add-row">
                <Plus className="w-4 h-4 mr-1" /> Row
              </Button>
              <Button variant="ghost" size="sm" onClick={deleteSelected} className="text-red-600 hover:text-red-700" data-testid="sites-del-row">
                <Trash2 className="w-4 h-4 mr-1" /> Delete
              </Button>
              <Button variant="ghost" size="sm" onClick={discard} disabled={dirtyCount === 0} data-testid="sites-discard">
                <RotateCcw className="w-4 h-4 mr-1" /> Discard
              </Button>
              <Button size="sm" onClick={saveAll} className="bg-blue-600 hover:bg-blue-700" data-testid="sites-save">
                <Save className="w-4 h-4 mr-1" /> Save {dirtyCount > 0 && `(${dirtyCount})`}
              </Button>
            </div>
          </div>
          <div style={{ height: "calc(100vh - 240px)", minHeight: 420 }} data-testid="sites-grid">
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
              copyHeadersToClipboard={false}
              enableCellTextSelection={true}
              suppressHorizontalScroll={false}
              pagination={true}
              paginationPageSize={50}
              paginationPageSizeSelector={[20, 50, 100, 500]}
              onCellValueChanged={(e) => {
                setRows((r) => r.map((x) => x.site_id === e.data.site_id ? { ...e.data } : x));
              }}
            />
          </div>
        </Card>
      </div>

      <style>{`
        .ff-cell-modified { background: rgba(251, 191, 36, 0.12) !important; }
      `}</style>

      {/* Import dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Import sites</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-500">Accepts .xlsx or .csv. Use the same column headers as the template (or column keys).</p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setImportFile(e.target.files?.[0])}
              data-testid="sites-import-file"
              className="block w-full text-sm border border-slate-200 rounded-lg p-2"
            />
            {importFile && <p className="text-xs text-slate-500">{importFile.name} ({Math.round(importFile.size / 1024)} KB)</p>}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
              Replace all existing sites
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button onClick={doImport} disabled={importing || !importFile} className="bg-blue-600 hover:bg-blue-700" data-testid="sites-import-go">
              {importing ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add column */}
      <Dialog open={addColOpen} onOpenChange={setAddColOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add custom column</DialogTitle></DialogHeader>
          <Input
            data-testid="sites-new-col"
            value={newColLabel}
            onChange={(e) => setNewColLabel(e.target.value)}
            placeholder="e.g. PPA Expiry"
            onKeyDown={(e) => e.key === "Enter" && addColumn()}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddColOpen(false)}>Cancel</Button>
            <Button onClick={addColumn} className="bg-blue-600 hover:bg-blue-700">Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import history */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Recent imports</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
            {imports.length === 0 ? (
              <div className="text-sm text-slate-400 p-4">No imports yet.</div>
            ) : imports.map((im) => (
              <div key={im.import_id} className="py-2 text-sm flex justify-between">
                <span>{im.filename}</span>
                <span className="text-slate-500">{im.rows} rows · {new Date(im.at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

async function authedDownload(url, filename) {
  const token = localStorage.getItem("ff_token");
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) { toast.error("Download failed"); return; }
  const blob = await r.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 5000);
}
