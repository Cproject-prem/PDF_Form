import React, { useEffect, useMemo, useState, useCallback } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { api, getErrorMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Calendar as CalendarIcon, ChevronDown, ChevronUp, CheckCircle2,
  Send, Save, Unlock, Lock, ListChecks, TrendingUp,
} from "lucide-react";

const MONTHS = [
  { v: 1,  n: "Jan" }, { v: 2,  n: "Feb" }, { v: 3,  n: "Mar" },
  { v: 4,  n: "Apr" }, { v: 5,  n: "May" }, { v: 6,  n: "Jun" },
  { v: 7,  n: "Jul" }, { v: 8,  n: "Aug" }, { v: 9,  n: "Sep" },
  { v: 10, n: "Oct" }, { v: 11, n: "Nov" }, { v: 12, n: "Dec" },
];

/** Build [prevYear, currentYear, nextYear] + auto-add next year when the
 *  current date is past Sep so end-of-year planning works smoothly. */
function useYears() {
  return useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const startFrom = y - 1;
    const endAt = now.getMonth() >= 8 ? y + 2 : y + 1;   // Sep → Dec adds y+2
    const arr = [];
    for (let i = startFrom; i <= endAt; i++) arr.push(i);
    return arr;
  }, []);
}

const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

const statusPill = (st) => {
  const map = {
    draft:     "bg-slate-100 text-slate-600 border-slate-200",
    submitted: "bg-amber-100 text-amber-800 border-amber-200",
    approved:  "bg-emerald-100 text-emerald-800 border-emerald-200",
  };
  return map[st] || map.draft;
};

export default function SchedulePage() {
  const { user } = useAuth();
  const years = useYears();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);   // 1..12 or 0 for yearly
  const [view, setView] = useState("month");                // "month" | "year"
  const [data, setData] = useState({ sites: [], cycles: [] });
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);

  const isAdminOrMore =
    ["super_admin", "admin"].includes(user?.role) || !!user?.access_override;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (view === "month") {
        const r = await api.get(`/site-cycles?year=${year}&month=${month}`);
        setData(r.data);
      } else {
        const r = await api.get(`/site-cycles/summary?year=${year}`);
        setSummary(r.data || []);
      }
    } catch (e) {
      toast.error(getErrorMessage(e, "Failed to load schedule"));
    } finally {
      setLoading(false);
    }
  }, [year, month, view]);

  useEffect(() => { load(); }, [load]);

  return (
    <AppLayout>
      <div className="max-w-[1600px]">
        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.1em] text-slate-400 font-bold mb-1">
              Compliance & operations
            </div>
            <h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight">
              Schedule vs Actual
            </h1>
            <p className="text-slate-500 mt-1 text-sm">
              Plan & record monthly cycles per plant. Vendors submit, admins approve.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 p-1 bg-white">
              <button
                data-testid="view-toggle-month"
                onClick={() => setView("month")}
                className={`px-3 py-1.5 text-xs rounded-md transition ${
                  view === "month" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <ListChecks className="w-3.5 h-3.5 inline mr-1" />
                Monthly
              </button>
              <button
                data-testid="view-toggle-year"
                onClick={() => setView("year")}
                className={`px-3 py-1.5 text-xs rounded-md transition ${
                  view === "year" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5 inline mr-1" />
                Yearly summary
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-4 rounded-2xl border-slate-100 card-soft bg-white">
          <div className="flex flex-wrap items-center gap-3 p-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 uppercase tracking-wider">Year</span>
              <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v))}>
                <SelectTrigger data-testid="year-select" className="h-9 w-[110px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {view === "month" && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 uppercase tracking-wider">Month</span>
                <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v))}>
                  <SelectTrigger data-testid="month-select" className="h-9 w-[130px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m) => (
                      <SelectItem key={m.v} value={String(m.v)}>{m.n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </Card>

        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading…</div>
        ) : view === "month" ? (
          <MonthlyTable
            data={data}
            year={year}
            month={month}
            reload={load}
            isAdminOrMore={isAdminOrMore}
            role={user?.role}
          />
        ) : (
          <YearlySummary summary={summary} year={year} />
        )}
      </div>
    </AppLayout>
  );
}

/* --------------------------- Monthly Table ------------------------------- */
function MonthlyTable({ data, year, month, reload, isAdminOrMore, role }) {
  const { sites, cycles } = data;

  // Group cycles by (site_id, cycle_number) for quick lookup.
  const byKey = useMemo(() => {
    const m = {};
    for (const c of cycles) m[`${c.site_id}::${c.cycle_number}`] = c;
    return m;
  }, [cycles]);

  if (!sites.length) {
    return (
      <div className="p-16 text-center bg-white rounded-2xl border border-dashed border-slate-200">
        <CalendarIcon className="w-10 h-10 mx-auto text-slate-300" />
        <p className="text-sm text-slate-500 mt-3">
          No plants visible for your access scope.
        </p>
      </div>
    );
  }

  return (
    <Card className="rounded-2xl border-slate-100 card-soft bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-600">
            <tr className="text-left">
              <th className="p-3 font-semibold w-[240px]">Plant</th>
              <th className="p-3 font-semibold w-[70px]">Cycle</th>
              <th className="p-3 font-semibold" colSpan={2}>Schedule</th>
              <th className="p-3 font-semibold" colSpan={3}>Actual</th>
              <th className="p-3 font-semibold w-[140px] text-right">Actions</th>
            </tr>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
              <th />
              <th />
              <th className="p-2 pl-3">Planned date</th>
              <th className="p-2">Notes</th>
              <th className="p-2 pl-3">Actual date</th>
              <th className="p-2">Result</th>
              <th className="p-2">Notes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => {
              const cap = Math.max(1, parseInt(s.cycles_per_month || 1));
              return Array.from({ length: cap }).map((_, i) => {
                const cn = i + 1;
                const cyc = byKey[`${s.site_id}::${cn}`] || null;
                return (
                  <CycleRow
                    key={`${s.site_id}-${cn}`}
                    site={s}
                    cn={cn}
                    cyc={cyc}
                    year={year}
                    month={month}
                    reload={reload}
                    isAdminOrMore={isAdminOrMore}
                    role={role}
                    showPlant={i === 0}
                  />
                );
              });
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* --------------------------- Row -------------------------------------- */
function CycleRow({ site, cn, cyc, year, month, reload, isAdminOrMore, role, showPlant }) {
  const [saving, setSaving] = useState(false);
  const sch = cyc?.schedule || {};
  const act = cyc?.actual || {};

  // Local editable form state, seeded from server on every render
  const [form, setForm] = useState({
    planned_date: sch.planned_date || "",
    sch_notes:    sch.notes || "",
    actual_date:  act.actual_date || "",
    result:       act.result || "",
    act_notes:    act.notes || "",
  });
  // Reset when cyc identity changes (year/month/site swap)
  useEffect(() => {
    setForm({
      planned_date: sch.planned_date || "",
      sch_notes:    sch.notes || "",
      actual_date:  act.actual_date || "",
      result:       act.result || "",
      act_notes:    act.notes || "",
    });
  }, [cyc?.cycle_id, year, month, sch.planned_date, sch.notes,
      act.actual_date, act.result, act.notes]);

  const canEditSch = sch.status !== "approved" && (sch.status !== "submitted" || isAdminOrMore);
  const canEditAct = act.status !== "approved" && (act.status !== "submitted" || isAdminOrMore);
  const isVendor = ["vendor_admin", "vendor_user"].includes(role);

  const save = async (which) => {
    setSaving(true);
    try {
      const body = { site_id: site.site_id, year, month, cycle_number: cn };
      if (which === "schedule") body.schedule = {
        planned_date: form.planned_date || null, notes: form.sch_notes || null,
      };
      else body.actual = {
        actual_date: form.actual_date || null,
        result:      form.result || null,
        notes:       form.act_notes || null,
      };
      await api.post("/site-cycles/upsert", body);
      toast.success("Saved");
      await reload();
    } catch (e) {
      toast.error(getErrorMessage(e, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  const submit = async (which) => {
    if (!cyc?.cycle_id) return toast.error("Save a draft first");
    setSaving(true);
    try {
      await api.post(`/site-cycles/${cyc.cycle_id}/submit-${which}`);
      toast.success("Submitted for approval");
      await reload();
    } catch (e) {
      toast.error(getErrorMessage(e, "Submit failed"));
    } finally {
      setSaving(false);
    }
  };

  const approve = async (which) => {
    if (!cyc?.cycle_id) return;
    setSaving(true);
    try {
      await api.post(`/site-cycles/${cyc.cycle_id}/approve-${which}`);
      toast.success("Approved");
      await reload();
    } catch (e) {
      toast.error(getErrorMessage(e, "Approve failed"));
    } finally { setSaving(false); }
  };

  const [unlockDlg, setUnlockDlg] = useState(null);   // "schedule" | "actual" | null

  return (
    <>
      <tr className="border-b border-slate-100 align-top hover:bg-slate-50/40">
        {/* Plant column — only on first cycle row for that plant */}
        <td className="p-3">
          {showPlant && (
            <div>
              <div className="font-medium text-slate-900">{site.site_name}</div>
              <div className="text-[11px] text-slate-400 font-mono">
                {site.site_code} · {site.cycles_per_month} cyc/mo
              </div>
            </div>
          )}
        </td>
        <td className="p-3 whitespace-nowrap">
          <Badge className="bg-blue-50 text-blue-700 border-blue-100" data-testid={`cycle-badge-${site.site_id}-${cn}`}>
            {ordinal(cn)} cycle
          </Badge>
          <div className="mt-1 flex flex-col gap-1">
            <Badge className={`text-[10px] ${statusPill(sch.status || "draft")}`}>
              Sch · {sch.status || "draft"}
            </Badge>
            <Badge className={`text-[10px] ${statusPill(act.status || "draft")}`}>
              Act · {act.status || "draft"}
            </Badge>
          </div>
        </td>

        {/* --------- Schedule block --------- */}
        <td className="p-2 pl-3 w-[140px]">
          <Input
            type="date"
            data-testid={`sch-date-${site.site_id}-${cn}`}
            value={form.planned_date || ""}
            disabled={!canEditSch}
            min={`${year}-${String(month).padStart(2, "0")}-01`}
            max={`${year}-${String(month).padStart(2, "0")}-${monthLastDay(year, month)}`}
            onChange={(e) => setForm({ ...form, planned_date: e.target.value })}
            className="h-8 text-xs"
          />
        </td>
        <td className="p-2 min-w-[160px]">
          <Textarea
            data-testid={`sch-notes-${site.site_id}-${cn}`}
            value={form.sch_notes || ""}
            disabled={!canEditSch}
            onChange={(e) => setForm({ ...form, sch_notes: e.target.value })}
            className="h-8 text-xs resize-none"
            placeholder="Optional notes…"
          />
        </td>

        {/* --------- Actual block --------- */}
        <td className="p-2 pl-3 w-[140px]">
          <Input
            type="date"
            data-testid={`act-date-${site.site_id}-${cn}`}
            value={form.actual_date || ""}
            disabled={!canEditAct}
            min={`${year}-${String(month).padStart(2, "0")}-01`}
            max={`${year}-${String(month).padStart(2, "0")}-${monthLastDay(year, month)}`}
            onChange={(e) => setForm({ ...form, actual_date: e.target.value })}
            className="h-8 text-xs"
          />
        </td>
        <td className="p-2 w-[110px]">
          <Select
            value={form.result || ""}
            disabled={!canEditAct}
            onValueChange={(v) => setForm({ ...form, result: v })}
          >
            <SelectTrigger data-testid={`act-result-${site.site_id}-${cn}`} className="h-8 text-xs">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Done">Done</SelectItem>
              <SelectItem value="Missed">Missed</SelectItem>
            </SelectContent>
          </Select>
        </td>
        <td className="p-2 min-w-[160px]">
          <Textarea
            data-testid={`act-notes-${site.site_id}-${cn}`}
            value={form.act_notes || ""}
            disabled={!canEditAct}
            onChange={(e) => setForm({ ...form, act_notes: e.target.value })}
            className="h-8 text-xs resize-none"
            placeholder="Optional notes…"
          />
        </td>

        {/* --------- Actions --------- */}
        <td className="p-2 pr-3 text-right whitespace-nowrap">
          <div className="flex flex-col items-end gap-1">
            {/* Schedule row */}
            <div className="flex items-center gap-1">
              {canEditSch && (
                <Button
                  size="sm" variant="outline"
                  data-testid={`save-sch-${site.site_id}-${cn}`}
                  disabled={saving}
                  onClick={() => save("schedule")}
                  className="h-7 px-2 text-[11px]"
                ><Save className="w-3 h-3 mr-1" /> Sch</Button>
              )}
              {sch.status === "draft" && sch.planned_date && !isVendor === false && (
                <Button
                  size="sm" variant="outline"
                  data-testid={`submit-sch-${site.site_id}-${cn}`}
                  disabled={saving || !cyc?.cycle_id}
                  onClick={() => submit("schedule")}
                  className="h-7 px-2 text-[11px]"
                ><Send className="w-3 h-3 mr-1" /> Submit</Button>
              )}
              {sch.status === "submitted" && isAdminOrMore && (
                <Button
                  size="sm"
                  data-testid={`approve-sch-${site.site_id}-${cn}`}
                  disabled={saving}
                  onClick={() => approve("schedule")}
                  className="h-7 px-2 text-[11px] bg-emerald-600 hover:bg-emerald-700"
                ><CheckCircle2 className="w-3 h-3 mr-1" /> Approve</Button>
              )}
              {(sch.status === "approved" || sch.status === "submitted") && isAdminOrMore && (
                <Button
                  size="sm" variant="ghost"
                  data-testid={`unlock-sch-${site.site_id}-${cn}`}
                  disabled={saving}
                  onClick={() => setUnlockDlg("schedule")}
                  className="h-7 px-2 text-[11px] text-amber-700 hover:bg-amber-50"
                ><Unlock className="w-3 h-3" /></Button>
              )}
            </div>
            {/* Actual row */}
            <div className="flex items-center gap-1">
              {canEditAct && (
                <Button
                  size="sm" variant="outline"
                  data-testid={`save-act-${site.site_id}-${cn}`}
                  disabled={saving}
                  onClick={() => save("actual")}
                  className="h-7 px-2 text-[11px]"
                ><Save className="w-3 h-3 mr-1" /> Act</Button>
              )}
              {act.status === "draft" && act.actual_date && act.result && (
                <Button
                  size="sm" variant="outline"
                  data-testid={`submit-act-${site.site_id}-${cn}`}
                  disabled={saving || !cyc?.cycle_id}
                  onClick={() => submit("actual")}
                  className="h-7 px-2 text-[11px]"
                ><Send className="w-3 h-3 mr-1" /> Submit</Button>
              )}
              {act.status === "submitted" && isAdminOrMore && (
                <Button
                  size="sm"
                  data-testid={`approve-act-${site.site_id}-${cn}`}
                  disabled={saving}
                  onClick={() => approve("actual")}
                  className="h-7 px-2 text-[11px] bg-emerald-600 hover:bg-emerald-700"
                ><CheckCircle2 className="w-3 h-3 mr-1" /> Approve</Button>
              )}
              {(act.status === "approved" || act.status === "submitted") && isAdminOrMore && (
                <Button
                  size="sm" variant="ghost"
                  data-testid={`unlock-act-${site.site_id}-${cn}`}
                  disabled={saving}
                  onClick={() => setUnlockDlg("actual")}
                  className="h-7 px-2 text-[11px] text-amber-700 hover:bg-amber-50"
                ><Unlock className="w-3 h-3" /></Button>
              )}
            </div>
          </div>
        </td>
      </tr>
      {unlockDlg && (
        <UnlockDialog
          cycleId={cyc?.cycle_id}
          which={unlockDlg}
          onClose={() => setUnlockDlg(null)}
          onDone={reload}
        />
      )}
    </>
  );
}

/* --------------------------- Unlock dialog -------------------------------- */
function UnlockDialog({ cycleId, which, onClose, onDone }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      await api.post(`/site-cycles/${cycleId}/unlock`, { which, note });
      toast.success(`${which} unlocked`);
      onDone();
      onClose();
    } catch (e) {
      toast.error(getErrorMessage(e, "Unlock failed"));
    } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent data-testid="unlock-dialog">
        <DialogHeader>
          <DialogTitle>
            <Lock className="w-4 h-4 inline mr-1" />
            Unlock {which} — audit note required
          </DialogTitle>
        </DialogHeader>
        <Textarea
          data-testid="unlock-note-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reason for unlocking (kept in audit trail)…"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            data-testid="unlock-confirm"
            onClick={submit}
            disabled={saving || note.trim().length < 3}
            className="bg-amber-600 hover:bg-amber-700"
          >Unlock</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------- Yearly summary -------------------------------- */
function YearlySummary({ summary, year }) {
  if (!summary.length) {
    return (
      <div className="p-16 text-center bg-white rounded-2xl border border-dashed border-slate-200">
        <TrendingUp className="w-10 h-10 mx-auto text-slate-300" />
        <p className="text-sm text-slate-500 mt-3">
          No plants visible for {year}.
        </p>
      </div>
    );
  }
  return (
    <Card className="rounded-2xl border-slate-100 card-soft bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="yearly-summary-table">
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-600">
            <tr className="text-left">
              <th className="p-3 font-semibold">Plant</th>
              <th className="p-3 font-semibold">Region</th>
              <th className="p-3 font-semibold text-right">Total slots</th>
              <th className="p-3 font-semibold" colSpan={3}>Schedule</th>
              <th className="p-3 font-semibold" colSpan={3}>Actual</th>
              <th className="p-3 font-semibold text-right">Completion</th>
            </tr>
            <tr className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100 text-left">
              <th /><th /><th />
              <th className="p-2 pl-3">Draft</th>
              <th className="p-2">Submitted</th>
              <th className="p-2">Approved</th>
              <th className="p-2 pl-3">Draft</th>
              <th className="p-2">Submitted</th>
              <th className="p-2">Approved</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {summary.map((r) => {
              const pct = r.total_slots
                ? Math.round((r.actual.approved / r.total_slots) * 100)
                : 0;
              return (
                <tr key={r.site_id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="p-3">
                    <div className="font-medium">{r.site_name}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{r.site_code}</div>
                  </td>
                  <td className="p-3 text-slate-600">{r.region || "—"}</td>
                  <td className="p-3 text-right font-mono text-slate-500">{r.total_slots}</td>
                  <td className="p-2 pl-3 text-slate-500">{r.schedule.draft}</td>
                  <td className="p-2 text-amber-700">{r.schedule.submitted}</td>
                  <td className="p-2 text-emerald-700 font-medium">{r.schedule.approved}</td>
                  <td className="p-2 pl-3 text-slate-500">{r.actual.draft}</td>
                  <td className="p-2 text-amber-700">{r.actual.submitted}</td>
                  <td className="p-2 text-emerald-700 font-medium">{r.actual.approved}</td>
                  <td className="p-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      <div className="w-20 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-600 font-medium w-8 text-right">{pct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function monthLastDay(year, month) {
  return String(new Date(year, month, 0).getDate()).padStart(2, "0");
}
