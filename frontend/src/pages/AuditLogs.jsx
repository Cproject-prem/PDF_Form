import React, { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableHeader, TableHead, TableRow, TableBody, TableCell,
} from "@/components/ui/table";
import { ScrollText, Search } from "lucide-react";
import { formatDate } from "@/lib/utils2";

export default function AuditLogsPage() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/audit?limit=500")
      .then((r) => setRows(r.data))
      .finally(() => setLoading(false));
  }, []);

  const filtered = rows.filter((r) => {
    if (!q) return true;
    const blob = `${r.action} ${r.target_type} ${r.target_id} ${r.actor_email} ${JSON.stringify(r.details || {})}`.toLowerCase();
    return blob.includes(q.toLowerCase());
  });

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
                  <TableHead>Time</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.audit_id} data-testid={`audit-row-${r.audit_id}`}>
                    <TableCell className="text-xs text-slate-600">{formatDate(r.created_at)}</TableCell>
                    <TableCell className="text-sm">{r.actor_email || r.actor_id || "system"}</TableCell>
                    <TableCell>
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-blue-50 text-blue-700">{r.action}</span>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      <div>{r.target_type}</div>
                      {r.target_id && <code className="text-[10px] text-slate-400">{r.target_id}</code>}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 font-mono">{r.ip || "—"}</TableCell>
                    <TableCell className="text-xs text-slate-500 max-w-xs truncate" title={JSON.stringify(r.details)}>
                      {Object.keys(r.details || {}).length ? JSON.stringify(r.details).slice(0, 100) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
