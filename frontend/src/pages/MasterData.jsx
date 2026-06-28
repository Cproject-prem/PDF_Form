import React, { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableHeader, TableHead, TableRow, TableBody, TableCell,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Database, Plus, Trash2, Edit3, Search, ArrowLeft, Layers,
} from "lucide-react";

export default function MasterDataPage() {
  const [tables, setTables] = useState([]);
  const [activeTable, setActiveTable] = useState(null);

  const load = async () => {
    const r = await api.get("/master-data/tables");
    setTables(r.data);
  };
  useEffect(() => { load(); }, []);

  if (activeTable) {
    return <MasterTable table={activeTable} onBack={() => { setActiveTable(null); load(); }} />;
  }

  return (
    <AppLayout>
      <div className="max-w-5xl">
        <div className="mb-6">
          <span className="text-xs uppercase tracking-[0.1em] text-slate-400 font-bold">Lookup tables</span>
          <h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight text-slate-900 mt-1">Master Data</h1>
          <p className="text-slate-500 mt-1">Customers, regions, departments, products, and any other reference tables your forms look up.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="master-tables">
          {tables.map((t) => (
            <button
              key={t.table}
              onClick={() => setActiveTable(t.table)}
              data-testid={`master-table-${t.table}`}
              className="text-left p-5 rounded-2xl border border-slate-100 bg-white hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Database className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold text-slate-400">{t.count} rows</span>
              </div>
              <div className="text-sm font-medium text-slate-800 capitalize">{t.table.replace("_", " ")}</div>
              <div className="text-xs text-slate-500 mt-1">Click to edit rows</div>
            </button>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}

function MasterTable({ table, onBack }) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const r = await api.get(`/master-data/${table}`);
    setRows(r.data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [table]);

  // dynamic columns = union of all `data` keys
  const columns = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => Object.keys(r.data || {}).forEach((k) => set.add(k)));
    return Array.from(set);
  }, [rows]);

  const filtered = rows.filter((r) =>
    !q || Object.values(r.data || {}).some((v) => String(v ?? "").toLowerCase().includes(q.toLowerCase())));

  const startNew = () => { setEditing({ data: {} }); setEditOpen(true); };
  const startEdit = (r) => { setEditing({ ...r, data: { ...r.data } }); setEditOpen(true); };

  const save = async () => {
    try {
      if (editing.row_id) {
        await api.put(`/master-data/${editing.row_id}`, editing.data);
      } else {
        await api.post(`/master-data/${table}`, editing.data);
      }
      toast.success("Saved");
      setEditOpen(false); load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    }
  };

  const remove = async (r) => {
    if (!confirm("Delete this row?")) return;
    await api.delete(`/master-data/${r.row_id}`);
    load();
  };

  const setData = (k, v) => setEditing((e) => ({ ...e, data: { ...e.data, [k]: v } }));
  const addField = () => {
    const k = prompt("New field name (snake_case)");
    if (k) setData(k, "");
  };

  return (
    <AppLayout>
      <div className="max-w-6xl">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={onBack} className="p-2 rounded-md hover:bg-slate-100 text-slate-600">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-xs uppercase tracking-[0.1em] text-slate-400 font-bold">Master · {table}</span>
        </div>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight text-slate-900 capitalize">{table.replace("_", " ")}</h1>
          <Button onClick={startNew} className="bg-blue-600 hover:bg-blue-700" data-testid="master-new-row">
            <Plus className="w-4 h-4 mr-1.5" /> Add row
          </Button>
        </div>

        <Card className="rounded-2xl border-slate-100 card-soft bg-white">
          <div className="flex items-center gap-3 p-4 border-b border-slate-100">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search rows…" className="pl-10 h-9" />
            </div>
            <span className="text-xs text-slate-500">{filtered.length} rows</span>
          </div>
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Layers className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-sm text-slate-500 mt-2">No rows yet. Click "Add row" to seed this table.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((c) => <TableHead key={c} className="whitespace-nowrap">{c}</TableHead>)}
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.row_id}>
                      {columns.map((c) => (
                        <TableCell key={c} className="text-sm text-slate-700 max-w-xs truncate" title={r.data?.[c] ?? ""}>
                          {String(r.data?.[c] ?? "—")}
                        </TableCell>
                      ))}
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => startEdit(r)}><Edit3 className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => remove(r)} className="text-red-600"><Trash2 className="w-4 h-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing?.row_id ? "Edit row" : "Add row"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              {[...new Set([...columns, ...Object.keys(editing.data || {})])].map((k) => (
                <div key={k}>
                  <label className="text-xs text-slate-500">{k}</label>
                  <Input value={editing.data[k] ?? ""} onChange={(e) => setData(k, e.target.value)} data-testid={`master-field-${k}`} />
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addField}>
                <Plus className="w-4 h-4 mr-1" /> Add field
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={save} className="bg-blue-600 hover:bg-blue-700" data-testid="master-save">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
