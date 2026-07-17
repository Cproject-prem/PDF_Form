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
  Calendar as CalendarIcon, CheckCircle2, Send, Save, Unlock, Lock,
  ListChecks, TrendingUp, Download, Grid3x3, Wrench, SprayCan,
  Paperclip, X as XIcon, FileText, Image as ImageIcon,
} from "lucide-react";
import { API } from "@/lib/api";

const MONTHS = [
  { v: 1,  n: "Jan" }, { v: 2,  n: "Feb" }, { v: 3,  n: "Mar" },
  { v: 4,  n: "Apr" }, { v: 5,  n: "May" }, { v: 6,  n: "Jun" },
  { v: 7,  n: "Jul" }, { v: 8,  n: "Aug" }, { v: 9,  n: "Sep" },
  { v: 10, n: "Oct" }, { v: 11, n: "Nov" }, { v: 12, n: "Dec" },
];

const PM_QUARTERS = [
  { v: 3,  n: "Q1 (Jan–Mar)" },
  { v: 6,  n: "Q2 (Apr–Jun)" },
  { v: 9,  n: "Q3 (Jul–Sep)" },
  { v: 12, n: "Q4 (Oct–Dec)" },
];

const ACTIVITIES = [
  { v: "cleaning", n: "Module Cleaning (monthly)" },
  { v: "pm",       n: "PM (quarterly)" },
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
  // For PM the month defaults to the current quarter-end. For cleaning: current month.
  const [activity, setActivity] = useState("cleaning");
  const [month, setMonth] = useState(() => {
    const m = now.getMonth() + 1;
    return m;
  });
  const [view, setView] = useState("month");   // "month" | "grid" | "year"
  const [data, setData] = useState({ sites: [], cycles: [] });
  const [summary, setSummary] = useState([]);
  const [gridData, setGridData] = useState({ sites: [], cycles: [] });
  const [loading, setLoading] = useState(true);

  const monthOptions = activity === "pm" ? PM_QUARTERS : MONTHS;

  // Snap month to a valid option when activity changes
  useEffect(() => {
    if (activity === "pm" && ![3, 6, 9, 12].includes(month)) {
      // pick the quarter-end matching the current selection
      setMonth(month <= 3 ? 3 : month <= 6 ? 6 : month <= 9 ? 9 : 12);
    }
  }, [activity, month]);

  const isAdminOrMore =
    ["super_admin", "admin"].includes(user?.role) || !!user?.access_override;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (view === "month") {
        const r = await api.get(`/site-cycles?year=${year}&month=${month}&activity=${activity}`);
        setData(r.data);
      } else if (view === "grid") {
        // fetch full year, then group client-side
        const r = await api.get(`/site-cycles?year=${year}&activity=${activity}`);
        setGridData(r.data);
      } else {
        const r = await api.get(`/site-cycles/summary?year=${year}&activity=${activity}`);
        setSummary(r.data || []);
      }
    } catch (e) {
      toast.error(getErrorMessage(e, "Failed to load schedule"));
    } finally {
      setLoading(false);
    }
  }, [year, month, view, activity]);

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
            <Button
              data-testid="export-xlsx-btn"
              variant="outline"
              className="h-9"
              onClick={() => {
                const token = localStorage.getItem("ff_token");
                const qs = view === "month"
                  ? `year=${year}&month=${month}&activity=${activity}`
                  : `year=${year}&activity=${activity}`;
                fetch(`${API}/site-cycles/export.xlsx?${qs}`, {
                  headers: { Authorization: `Bearer ${token}` },
                })
                  .then((r) => r.blob())
                  .then((blob) => {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${activity}-${year}${view === "month" ? `-${String(month).padStart(2,"0")}` : "-full"}.xlsx`;
                    a.click();
                    URL.revokeObjectURL(url);
                  })
                  .catch(() => toast.error("Export failed"));
              }}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export Excel
            </Button>
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
                data-testid="view-toggle-grid"
                onClick={() => setView("grid")}
                className={`px-3 py-1.5 text-xs rounded-md transition ${
                  view === "grid" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Grid3x3 className="w-3.5 h-3.5 inline mr-1" />
                Yearly grid
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
              <span className="text-xs text-slate-500 uppercase tracking-wider">Activity</span>
              <Select value={activity} onValueChange={setActivity}>
                <SelectTrigger data-testid="activity-select" className="h-9 w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITIES.map((a) => (
                    <SelectItem key={a.v} value={a.v}>
                      {a.v === "pm"
                        ? <span className="inline-flex items-center gap-1.5"><Wrench className="w-3.5 h-3.5" /> {a.n}</span>
                        : <span className="inline-flex items-center gap-1.5"><SprayCan className="w-3.5 h-3.5" /> {a.n}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
                <span className="text-xs text-slate-500 uppercase tracking-wider">
                  {activity === "pm" ? "Quarter" : "Month"}
                </span>
                <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v))}>
                  <SelectTrigger data-testid="month-select" className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((m) => (
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
            activity={activity}
            reload={load}
            isAdminOrMore={isAdminOrMore}
            role={user?.role}
          />
        ) : view === "grid" ? (
          <YearlyGrid
            data={gridData}
            year={year}
            activity={activity}
            onCellClick={(m) => { setMonth(m); setView("month"); }}
          />
        ) : (
          <YearlySummary summary={summary} year={year} activity={activity} />
        )}
      </div>
    </AppLayout>
  );
}

/* --------------------------- Monthly Table ------------------------------- */
function MonthlyTable({ data, year, month, activity, reload, isAdminOrMore, role }) {
  const { sites, cycles } = data;

  const byKey = useMemo(() => {
    const m = {};
    for (const c of cycles) m[`${c.site_id}::${c.cycle_number}`] = c;
    return m;
  }, [cycles]);

  const capOf = (s) => Math.max(1, parseInt(
    activity === "pm" ? s.pm_cycles_per_quarter : s.cycles_per_month, 10) || 1);

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
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-50 border-b-2 border-slate-200 text-slate-700">
            <tr className="text-left">
              <th className="p-3 font-semibold w-[220px] border-r border-slate-200">Site</th>
              <th className="p-3 font-semibold w-[110px] border-r border-slate-200">Cycle</th>
              <th className="p-3 font-semibold w-[150px] border-r border-slate-200">Schedule</th>
              <th className="p-3 font-semibold w-[210px] border-r border-slate-200">Actual</th>
              <th className="p-3 font-semibold border-r border-slate-200">Remark</th>
              <th className="p-3 font-semibold w-[130px] border-r border-slate-200">Status</th>
              <th className="p-3 font-semibold w-[220px] text-right">Save / Submit</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => {
              const cap = capOf(s);
              return Array.from({ length: cap }).map((_, i) => {
                const cn = i + 1;
                const cyc = byKey[`${s.site_id}::${cn}`] || null;
                return (
                  <CycleRow
                    key={`${s.site_id}-${cn}`}
                    site={s}
                    cn={cn}
                    cap={cap}
                    cyc={cyc}
                    year={year}
                    month={month}
                    activity={activity}
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
function CycleRow({ site, cn, cap, cyc, year, month, activity, reload, isAdminOrMore, role, showPlant }) {
  const [saving, setSaving] = useState(false);
  const sch = cyc?.schedule || {};
  const act = cyc?.actual || {};

  const [form, setForm] = useState({
    planned_date: sch.planned_date || "",
    sch_notes:    sch.notes || "",
    actual_date:  act.actual_date || "",
    result:       act.result || "",
    act_notes:    act.notes || "",
  });
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
  const isVendor   = ["vendor_admin", "vendor_user"].includes(role);
  void isVendor;

  const save = async (which) => {
    setSaving(true);
    try {
      const body = { site_id: site.site_id, year, month, cycle_number: cn, activity };
      if (which === "schedule") body.schedule = {
        planned_date: form.planned_date || null, notes: form.sch_notes || null,
      };
      else body.actual = {
        actual_date: form.actual_date || null,
        result:      form.result || null,
        notes:       form.act_notes || null,
      };
      await api.post("/site-cycles/upsert", body);
      toast.success(which === "schedule" ? "Schedule saved" : "Actual saved");
      await reload();
    } catch (e) {
      toast.error(getErrorMessage(e, "Save failed"));
    } finally { setSaving(false); }
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
    } finally { setSaving(false); }
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

  const [unlockDlg, setUnlockDlg] = useState(null);

  const schHasAttachments = ((sch.evidence_files || []).length > 0);
  const actHasAttachments = ((act.evidence_files || []).length > 0);
  void schHasAttachments;

  const minDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const maxDate = `${year}-${String(month).padStart(2, "0")}-${monthLastDay(year, month)}`;

  return (
    <>
      <tr className="border-b border-slate-200 align-middle hover:bg-slate-50/40">
        {/* Site column — merged across every cycle of this plant */}
        {showPlant && (
          <td rowSpan={cap} className="p-3 border-r border-slate-200 align-middle bg-slate-50/40">
            <div className="font-semibold text-slate-900">{site.site_name}</div>
            <div className="text-[11px] text-slate-500 font-mono mt-0.5">{site.site_code}</div>
            <div className="text-[10px] text-slate-400 mt-1">
              {cap} {activity === "pm" ? "PM cycle" : "cycle"}{cap > 1 ? "s" : ""}
              {activity === "pm" ? " / quarter" : " / month"}
            </div>
          </td>
        )}

        {/* Cycle label */}
        <td className="p-3 border-r border-slate-200 text-slate-700 font-medium">
          {ordinal(cn)} cycle
        </td>

        {/* Schedule — planned date */}
        <td className="p-2 border-r border-slate-200">
          <Input
            type="date"
            data-testid={`sch-date-${site.site_id}-${cn}`}
            value={form.planned_date || ""}
            disabled={!canEditSch}
            min={minDate}
            max={maxDate}
            onChange={(e) => setForm({ ...form, planned_date: e.target.value })}
            className="h-9 text-xs"
          />
        </td>

        {/* Actual — actual date + Done/Missed result */}
        <td className="p-2 border-r border-slate-200">
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              data-testid={`act-date-${site.site_id}-${cn}`}
              value={form.actual_date || ""}
              disabled={!canEditAct}
              min={minDate}
              max={maxDate}
              onChange={(e) => setForm({ ...form, actual_date: e.target.value })}
              className="h-9 text-xs flex-1"
            />
            <Select
              value={form.result || ""}
              disabled={!canEditAct}
              onValueChange={(v) => setForm({ ...form, result: v })}
            >
              <SelectTrigger
                data-testid={`act-result-${site.site_id}-${cn}`}
                className="h-9 w-[80px] text-xs"
              >
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Done">Done</SelectItem>
                <SelectItem value="Missed">Missed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </td>

        {/* Remark — stacked notes for Schedule + Actual */}
        <td className="p-2 border-r border-slate-200">
          <div className="space-y-1">
            <div>
              <div className="flex items-start gap-1">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider mt-2 w-8">Sch</span>
                <Textarea
                  data-testid={`sch-notes-${site.site_id}-${cn}`}
                  value={form.sch_notes || ""}
                  disabled={!canEditSch}
                  onChange={(e) => setForm({ ...form, sch_notes: e.target.value })}
                  placeholder="Schedule remark…"
                  className="h-9 text-xs resize-none"
                />
              </div>
              <AttachStrip
                cycleId={cyc?.cycle_id}
                which="schedule"
                canEdit={canEditSch}
                files={sch.evidence_files}
                reload={reload}
                required={false}
              />
            </div>
            <div>
              <div className="flex items-start gap-1">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider mt-2 w-8">Act</span>
                <Textarea
                  data-testid={`act-notes-${site.site_id}-${cn}`}
                  value={form.act_notes || ""}
                  disabled={!canEditAct}
                  onChange={(e) => setForm({ ...form, act_notes: e.target.value })}
                  placeholder="Actual remark…"
                  className="h-9 text-xs resize-none"
                />
              </div>
              <AttachStrip
                cycleId={cyc?.cycle_id}
                which="actual"
                canEdit={canEditAct}
                files={act.evidence_files}
                reload={reload}
                required={true}
              />
            </div>
          </div>
        </td>

        {/* Status — stacked pills */}
        <td className="p-2 border-r border-slate-200">
          <div className="flex flex-col gap-1">
            <Badge
              className={`text-[10px] justify-start ${statusPill(sch.status || "draft")}`}
              data-testid={`sch-status-${site.site_id}-${cn}`}
            >
              Sch · {sch.status || "draft"}
            </Badge>
            <Badge
              className={`text-[10px] justify-start ${statusPill(act.status || "draft")}`}
              data-testid={`act-status-${site.site_id}-${cn}`}
            >
              Act · {act.status || "draft"}
            </Badge>
          </div>
        </td>

        {/* Save / Submit — two rows, one per block */}
        <td className="p-2 whitespace-nowrap">
          <div className="flex flex-col items-end gap-1">
            {/* Schedule action strip */}
            <div className="flex items-center gap-1">
              {canEditSch && (
                <Button
                  size="sm" variant="outline"
                  data-testid={`save-sch-${site.site_id}-${cn}`}
                  disabled={saving}
                  onClick={() => save("schedule")}
                  className="h-7 px-2 text-[11px]"
                ><Save className="w-3 h-3 mr-1" /> Save</Button>
              )}
              {sch.status === "draft" && sch.planned_date && (
                <Button
                  size="sm" variant="outline"
                  data-testid={`submit-sch-${site.site_id}-${cn}`}
                  disabled={saving || !cyc?.cycle_id}
                  title="Submit for approval"
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
            {/* Actual action strip */}
            <div className="flex items-center gap-1">
              {canEditAct && (
                <Button
                  size="sm" variant="outline"
                  data-testid={`save-act-${site.site_id}-${cn}`}
                  disabled={saving}
                  onClick={() => save("actual")}
                  className="h-7 px-2 text-[11px]"
                ><Save className="w-3 h-3 mr-1" /> Save</Button>
              )}
              {act.status === "draft" && act.actual_date && act.result && (
                <Button
                  size="sm" variant="outline"
                  data-testid={`submit-act-${site.site_id}-${cn}`}
                  disabled={saving || !cyc?.cycle_id || !actHasAttachments}
                  title={!actHasAttachments ? "Attach a proof image/PDF first" : "Submit for approval"}
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

/* --------------------------- Yearly Grid (12-month × site×cycle heatmap) - */
function YearlyGrid({ data, year, activity, onCellClick }) {
  const { sites, cycles } = data;

  // For PM the columns are Q1..Q4 mapped to months 3,6,9,12.
  const cols = activity === "pm"
    ? [{ v: 3, n: "Q1" }, { v: 6, n: "Q2" }, { v: 9, n: "Q3" }, { v: 12, n: "Q4" }]
    : MONTHS.map((m) => ({ v: m.v, n: m.n }));

  // Look-up: (site_id, month, cycle_number) → cycle doc
  const byKey = useMemo(() => {
    const m = {};
    for (const c of cycles) {
      m[`${c.site_id}::${c.month}::${c.cycle_number}`] = c;
    }
    return m;
  }, [cycles]);

  const capOf = (s) => Math.max(1, parseInt(
    activity === "pm" ? s.pm_cycles_per_quarter : s.cycles_per_month, 10) || 1);

  if (!sites.length) {
    return (
      <div className="p-16 text-center bg-white rounded-2xl border border-dashed border-slate-200">
        <Grid3x3 className="w-10 h-10 mx-auto text-slate-300" />
        <p className="text-sm text-slate-500 mt-3">
          No plants visible for {year}.
        </p>
      </div>
    );
  }

  const dot = (status) => {
    const map = {
      approved:  "bg-emerald-500",
      submitted: "bg-amber-500",
      draft:     "bg-slate-300",
      empty:     "bg-slate-100",
    };
    return map[status] || map.empty;
  };

  return (
    <Card className="rounded-2xl border-slate-100 card-soft bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse" data-testid="yearly-grid-table">
          <thead className="bg-slate-50 border-b-2 border-slate-200 text-slate-700 sticky top-0">
            <tr className="text-left">
              <th className="p-3 font-semibold w-[220px] border-r border-slate-200">Site</th>
              <th className="p-3 font-semibold w-[90px] border-r border-slate-200">Cycle</th>
              {cols.map((c) => (
                <th key={c.v} className="p-2 font-semibold text-center border-r border-slate-200">
                  {c.n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => {
              const cap = capOf(s);
              return Array.from({ length: cap }).map((_, i) => {
                const cn = i + 1;
                return (
                  <tr key={`${s.site_id}-${cn}`} className="border-b border-slate-100">
                    {i === 0 && (
                      <td
                        rowSpan={cap}
                        className="p-3 border-r border-slate-200 align-middle bg-slate-50/40"
                      >
                        <div className="font-semibold text-slate-900">{s.site_name}</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          {s.site_code}
                        </div>
                      </td>
                    )}
                    <td className="p-2 border-r border-slate-200 text-slate-700 font-medium">
                      {ordinal(cn)}
                    </td>
                    {cols.map((c) => {
                      const cy  = byKey[`${s.site_id}::${c.v}::${cn}`] || null;
                      const sch = cy?.schedule?.status || (cy?.schedule?.planned_date ? "draft" : "empty");
                      const act = cy?.actual?.status   || (cy?.actual?.actual_date   ? "draft" : "empty");
                      const tooltip = [
                        cy?.schedule?.planned_date ? `Sch: ${cy.schedule.planned_date} (${cy.schedule.status || "draft"})` : null,
                        cy?.actual?.actual_date   ? `Act: ${cy.actual.actual_date} (${cy.actual.status || "draft"})${cy.actual.result ? " · " + cy.actual.result : ""}` : null,
                      ].filter(Boolean).join(" · ") || "No data";
                      return (
                        <td
                          key={c.v}
                          className="p-1.5 border-r border-slate-100 text-center hover:bg-slate-50 cursor-pointer transition"
                          title={tooltip}
                          data-testid={`grid-cell-${s.site_id}-${cn}-${c.v}`}
                          onClick={() => onCellClick(c.v)}
                        >
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                              <span className={`w-2 h-2 rounded-full ${dot(sch)}`} />
                              <span className="w-6 text-left">Sch</span>
                            </span>
                            <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                              <span className={`w-2 h-2 rounded-full ${dot(act)}`} />
                              <span className="w-6 text-left">Act</span>
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-3 text-[11px] text-slate-500 border-t border-slate-100 bg-slate-50/40">
        <span className="font-medium text-slate-700">Legend:</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Approved
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Submitted
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-300" /> Draft
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-100 border border-slate-200" /> No data
        </span>
        <span className="ml-auto text-slate-400">Click any cell to open that {activity === "pm" ? "quarter" : "month"} for editing.</span>
      </div>
    </Card>
  );
}

/* --------------------------- Yearly summary -------------------------------- */
function YearlySummary({ summary, year, activity }) {
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

/* --------------------------- Attachments strip ---------------------------- */
function AttachStrip({ cycleId, which, canEdit, files, reload, required = false }) {
  const [busy, setBusy] = useState(false);

  const upload = async (file) => {
    if (!file || !cycleId) {
      if (!cycleId) toast.error("Save the cycle first (any date), then attach.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post(`/site-cycles/${cycleId}/attachments?which=${which}`, fd,
        { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Attached");
      await reload();
    } catch (e) {
      toast.error(getErrorMessage(e, "Upload failed"));
    } finally { setBusy(false); }
  };

  const remove = async (fileId) => {
    setBusy(true);
    try {
      await api.delete(`/site-cycles/${cycleId}/attachments/${fileId}?which=${which}`);
      toast.success("Removed");
      await reload();
    } catch (e) {
      toast.error(getErrorMessage(e, "Delete failed"));
    } finally { setBusy(false); }
  };

  const backendBase = (process.env.REACT_APP_BACKEND_URL || "");

  return (
    <div className="mt-1 space-y-1">
      <div className="flex flex-wrap items-center gap-1">
        {(files || []).map((f) => (
          <a
            key={f.file_id}
            href={`${backendBase}${f.url}`}
            target="_blank"
            rel="noreferrer"
            data-testid={`attach-${which}-${f.file_id}`}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 text-[10px] hover:bg-blue-100 max-w-[130px]"
            title={f.filename}
          >
            {(f.content_type || "").startsWith("image/")
              ? <ImageIcon className="w-2.5 h-2.5 shrink-0" />
              : <FileText className="w-2.5 h-2.5 shrink-0" />}
            <span className="truncate">{f.filename}</span>
            {canEdit && (
              <button
                onClick={(e) => { e.preventDefault(); remove(f.file_id); }}
                className="text-blue-500 hover:text-red-600"
              ><XIcon className="w-2.5 h-2.5" /></button>
            )}
          </a>
        ))}
        {canEdit && (
          <label
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-dashed text-[10px] cursor-pointer ${
              required && (files || []).length === 0
                ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                : "border-slate-300 text-slate-500 hover:bg-slate-50"
            }`}
            data-testid={`attach-btn-${which}`}
          >
            <Paperclip className="w-2.5 h-2.5" />
            {busy
              ? "Uploading…"
              : (files || []).length === 0
                ? (required ? "Upload proof *" : "Attach (optional)")
                : "Add file"}
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }}
            />
          </label>
        )}
      </div>
    </div>
  );
}
