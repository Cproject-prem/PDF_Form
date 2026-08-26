import React, { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableHeader, TableHead, TableRow, TableBody, TableCell,
} from "@/components/ui/table";
import { ScrollText, Search, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { formatDate } from "@/lib/utils2";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function AuditLogsPage() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [restoring, setRestoring] = useState(null);

  const load = () => {
    setLoading(true);
    api.get("/audit?limit=500")
      .then((r) => setRows(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = rows.filter((r) => {
    if (!q) return true;
    const blob = `${r.action} ${r.target_type} ${r.target_id} ${r.actor_name || ""} ${r.actor_email || ""} ${JSON.stringify(r.details || {})}`.toLowerCase();
    return blob.includes(q.toLowerCase());
  });

  const doRestore = async (auditId) => {
    if (!confirm("Are you sure you want to restore the target to the state exactly before this update?")) return;
    setRestoring(auditId);
    try {
      const res = await api.post(`/audit/${auditId}/restore`);
      toast.success(res.data.message || "Restored successfully");
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message || "Failed to restore");
    } finally {
      setRestoring(null);
    }
  };

  const renderDetails = (details) => {
    if (details?.diff) {
      return (
        <div className="space-y-2 w-full max-w-full">
          {details.name && <div className="text-sm font-semibold text-slate-800 mb-2">Target: {details.name}</div>}
          <div className="grid gap-2">
            {Object.entries(details.diff).map(([key, change]) => (
              <div key={key} className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 bg-white rounded-md border text-sm">
                <span className="font-semibold text-slate-700 w-48 shrink-0 truncate" title={key}>{key}</span>
                <div className="flex flex-wrap items-center gap-2 flex-1 font-mono text-xs">
                  <span className="line-through text-red-500 bg-red-50 px-1.5 py-0.5 rounded max-w-[200px] sm:max-w-xs truncate" title={String(change.old ?? '—')}>{String(change.old ?? '—')}</span>
                  <span className="text-slate-400">➔</span>
                  <span className="text-green-600 bg-green-50 px-1.5 py-0.5 rounded max-w-[200px] sm:max-w-xs truncate" title={String(change.new ?? '—')}>{String(change.new ?? '—')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className="bg-white p-3 rounded-md border shadow-sm text-sm font-mono text-slate-700 whitespace-pre-wrap break-all">
        {JSON.stringify(details, null, 2)}
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="max-w-7xl">
        <div className="mb-6">
          <span className="text-xs uppercase tracking-[0.1em] text-slate-400 font-bold">Security</span>
          <h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight text-slate-900 mt-1">
            Audit Logs
          </h1>
          <p className="text-slate-500 mt-1">Immutable trail of every workflow, approval and admin action.</p>
        </div>

        <Card className="rounded-2xl border-slate-100 card-soft bg-white">
          <div className="flex items-center gap-3 p-4 border-b border-slate-100">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Filter by action, actor, target…"
                className="pl-10 h-9"
                data-testid="audit-search"
              />
            </div>
            <span className="text-xs text-slate-500">{filtered.length} events</span>
          </div>

          {loading ? (
            <div className="p-8 text-slate-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <ScrollText className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-sm text-slate-500 mt-2">No audit events yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Details Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const isExpanded = expandedId === r.audit_id;
                  const canRestore = r.action === "site.update" || r.action === "master.update";
                  return (
                    <React.Fragment key={r.audit_id}>
                      <TableRow 
                        data-testid={`audit-row-${r.audit_id}`}
                        className="cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => setExpandedId(isExpanded ? null : r.audit_id)}
                      >
                        <TableCell>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600 whitespace-nowrap">{formatDate(r.created_at)}</TableCell>
                        <TableCell className="text-sm font-medium text-slate-800">
                          {r.actor_name || r.actor_email || (r.actor_id && !r.actor_id.startsWith("usr_") ? r.actor_id : "System")}
                          {r.actor_email && r.actor_name && r.actor_email !== r.actor_name && (
                            <div className="text-[10px] text-slate-400 font-normal">{r.actor_email}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-medium px-2 py-1 rounded-full bg-blue-50 text-blue-700 whitespace-nowrap">{r.action}</span>
                        </TableCell>
                        <TableCell className="text-sm text-slate-600 max-w-[200px] truncate">
                          <div>{r.target_type}</div>
                          {r.target_id && <code className="text-[10px] text-slate-400">{r.target_id}</code>}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 font-mono">{r.ip || "—"}</TableCell>
                        <TableCell className="text-xs text-slate-500 max-w-xs truncate" title={JSON.stringify(r.details)}>
                          {Object.keys(r.details || {}).length ? JSON.stringify(r.details).slice(0, 100) : "—"}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow className="bg-slate-50/50">
                          <TableCell colSpan={7} className="p-0 border-b">
                            <div className="p-4 pl-14 flex flex-col lg:flex-row gap-6 items-start justify-between">
                              <div className="space-y-3 flex-1 overflow-x-auto">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Detailed Changes</h4>
                                {renderDetails(r.details)}
                              </div>
                              {canRestore && (
                                <div className="shrink-0 pt-6">
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                                    onClick={() => doRestore(r.audit_id)}
                                    disabled={restoring === r.audit_id}
                                  >
                                    <RotateCcw className="w-4 h-4 mr-2" />
                                    {restoring === r.audit_id ? "Restoring..." : "Restore to previous state"}
                                  </Button>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
