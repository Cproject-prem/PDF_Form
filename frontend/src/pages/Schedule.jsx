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
import { SearchableDropdown } from "@/components/ui/SearchableDropdown";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Calendar as CalendarIcon, CheckCircle2, Send, Save, Unlock, Lock,
  ListChecks, TrendingUp, Download, Grid3x3, Wrench, SprayCan,
  Paperclip, X as XIcon, FileText, Image as ImageIcon, Pencil,
  Search, ChevronRight,
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

export const EQUIPMENT_TESTING_ITEMS = [
  { id: 1, key: "ert",          name: "ERT",                                      countKey: "ert_count" },
  { id: 2, key: "transformer",  name: "Transformer maintenance & Oil Filtration", countKey: "transformer_count" },
  { id: 3, key: "acb",          name: "ACB Maintenance",                          countKey: "acb_count" },
  { id: 4, key: "dc_pm",        name: "DC PM",                                    countKey: "dc_pm_count" },
  { id: 5, key: "meter_cal",    name: "Meter calibration",                        countKey: "meter_cal_count" },
];

/** Returns true when a site has a count > 0 for the given equipment item */
export const eqItemEnabled = (site, item) => {
  const v = site[item.countKey];
  if (!v) return false;
  return parseInt(v, 10) > 0;
};

const ACTIVITIES = [
  { v: "cleaning",          n: "Module Cleaning (monthly)" },
  { v: "pm",                n: "PM (quarterly)" },
  { v: "equipment_testing", n: "Equipment Testing (annual)" },
  { v: "grasscutting",      n: "Grasscutting (yearly)" },
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
  const [q, setQ] = useState("");
  const [selectedClusters, setSelectedClusters] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");

  const [selectedCycleIds, setSelectedCycleIds] = useState(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);

  const clusterManagers = useMemo(() => {
    const set = new Set();
    for (const s of [...(data.sites || []), ...(gridData.sites || []), ...(summary || [])]) {
      const cm = s.cluster_manager_name || s.cluster_manager || s.cluster || s.cluster_name || s.region;
      if (cm && String(cm).trim()) {
        set.add(String(cm).trim());
      } else {
        set.add("Unassigned");
      }
    }
    const list = Array.from(set).sort();
    return list.length > 0 ? list : ["All Cluster Managers", "Unassigned"];
  }, [data.sites, gridData.sites, summary]);

  // Default to selecting all cluster managers when options are populated or updated
  useEffect(() => {
    if (clusterManagers.length > 0) {
      setSelectedClusters(clusterManagers);
    }
  }, [clusterManagers]);

  const isClusterSelected = useCallback((site) => {
    if (selectedClusters.length === 0 || selectedClusters.length === clusterManagers.length) return true;
    const cm = (site.cluster_manager_name || site.cluster_manager || site.cluster || site.cluster_name || site.region || "").trim() || "Unassigned";
    return selectedClusters.includes(cm);
  }, [selectedClusters, clusterManagers]);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const toggleSelect = useCallback((cycle_id) => {
    setSelectedCycleIds((prev) => {
      const next = new Set(prev);
      if (next.has(cycle_id)) next.delete(cycle_id);
      else next.add(cycle_id);
      return next;
    });
  }, []);

  const selectAllSubmitted = useCallback(() => {
    const ids = new Set();
    for (const c of data.cycles || []) {
      if (c.cycle_id && (c.schedule?.status === "submitted" || c.actual?.status === "submitted")) {
        ids.add(c.cycle_id);
      }
    }
    setSelectedCycleIds(ids);
  }, [data.cycles]);

  const clearSelection = useCallback(() => {
    setSelectedCycleIds(new Set());
  }, []);

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
        let qs = `year=${year}&activity=${activity}`;
        if (activity !== "equipment_testing" && activity !== "grasscutting") qs += `&month=${month}`;
        const r = await api.get(`/site-cycles?${qs}`);
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

  const isSiteActiveForActivity = (s, act) => {
    if (act === "grasscutting") {
      const v = String(s.grass_cutting_enabled ?? "0").trim().toLowerCase();
      return v === "1" || v === "true" || v === "yes";
    }
    if (act === "equipment_testing") {
      return EQUIPMENT_TESTING_ITEMS.some(it => eqItemEnabled(s, it));
    }
    return true; // cleaning, pm always active for all sites
  };

  const filteredData = useMemo(() => {
    let sites = data.sites.filter(s => isSiteActiveForActivity(s, activity));
    if (selectedClusters.length > 0 && selectedClusters.length < clusterManagers.length) {
      sites = sites.filter(isClusterSelected);
    }
    if (q.trim()) {
      const needle = q.toLowerCase();
      sites = sites.filter(s => 
        (s.site_name || "").toLowerCase().includes(needle) || 
        (s.site_code || "").toLowerCase().includes(needle) || 
        (s.asset_id || "").toLowerCase().includes(needle)
      );
    }
    return { sites, cycles: data.cycles };
  }, [data, q, activity, selectedClusters, clusterManagers.length, isClusterSelected]);

  const filteredGridData = useMemo(() => {
    let sites = gridData.sites.filter(s => isSiteActiveForActivity(s, activity));
    if (selectedClusters.length > 0 && selectedClusters.length < clusterManagers.length) {
      sites = sites.filter(isClusterSelected);
    }
    if (q.trim()) {
      const needle = q.toLowerCase();
      sites = sites.filter(s => 
        (s.site_name || "").toLowerCase().includes(needle) || 
        (s.site_code || "").toLowerCase().includes(needle) || 
        (s.asset_id || "").toLowerCase().includes(needle)
      );
    }
    return { sites, cycles: gridData.cycles };
  }, [gridData, q, activity, selectedClusters, clusterManagers.length, isClusterSelected]);

  const filteredSummary = useMemo(() => {
    let sites = summary.filter(s => isSiteActiveForActivity(s, activity));
    if (selectedClusters.length > 0 && selectedClusters.length < clusterManagers.length) {
      sites = sites.filter(isClusterSelected);
    }
    if (q.trim()) {
      const needle = q.toLowerCase();
      sites = sites.filter(s => 
        (s.site_name || "").toLowerCase().includes(needle) || 
        (s.site_code || "").toLowerCase().includes(needle)
      );
    }
    return sites;
  }, [summary, q, activity, selectedClusters, clusterManagers.length, isClusterSelected]);

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
                onClick={() => { setQ(""); setView("month"); }}
                className={`px-3 py-1.5 text-xs rounded-md transition ${
                  view === "month" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <ListChecks className="w-3.5 h-3.5 inline mr-1" />
                Monthly
              </button>
              <button
                data-testid="view-toggle-grid"
                onClick={() => { setQ(""); setView("grid"); }}
                className={`px-3 py-1.5 text-xs rounded-md transition ${
                  view === "grid" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Grid3x3 className="w-3.5 h-3.5 inline mr-1" />
                Yearly grid
              </button>
              <button
                data-testid="view-toggle-year"
                onClick={() => { setQ(""); setView("year"); }}
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
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                data-testid="schedule-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by plant name or ID…"
                className="pl-10 pr-16 h-9"
              />
              {q && (
                <button
                  onClick={() => setQ("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs flex items-center gap-1 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-full transition"
                  title="Clear plant filter"
                >
                  <XIcon className="w-3 h-3" />
                  <span className="text-[10px] font-medium">Clear</span>
                </button>
              )}
            </div>
            <div className="w-px h-6 bg-slate-200 mx-2 hidden sm:block" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 uppercase tracking-wider">Activity</span>
              <div className="w-[220px]">
                <SearchableDropdown
                  options={ACTIVITIES.map(a => ({ label: a.n, value: a.v }))}
                  value={activity}
                  onChange={setActivity}
                  placeholder="Select activity..."
                  className="h-9 text-xs"
                  testId="activity-select"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 uppercase tracking-wider">Year</span>
              <div className="w-[110px]">
                <SearchableDropdown
                  options={years.map(y => ({ label: String(y), value: String(y) }))}
                  value={String(year)}
                  onChange={v => setYear(parseInt(v))}
                  placeholder="Year"
                  className="h-9 text-xs"
                  testId="year-select"
                />
              </div>
            </div>
            {isAdminOrMore && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 uppercase tracking-wider">Cluster Mgr</span>
                <MultiSelectClusterDropdown
                  options={clusterManagers}
                  selected={selectedClusters}
                  onChange={setSelectedClusters}
                />
              </div>
            )}
            {view === "month" && !["equipment_testing", "grasscutting"].includes(activity) && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 uppercase tracking-wider">
                  {activity === "pm" ? "Quarter" : "Month"}
                </span>
                <div className="w-[170px]">
                  <SearchableDropdown
                    options={monthOptions.map(m => ({ label: m.n, value: String(m.v) }))}
                    value={String(month)}
                    onChange={v => setMonth(parseInt(v))}
                    placeholder="Select..."
                    className="h-9 text-xs"
                    testId="month-select"
                  />
                </div>
              </div>
            )}

            {/* Quick Status Filter Pills */}
            <div className="w-full pt-3 mt-2 border-t border-slate-100 flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider mr-1">Filter By Status:</span>
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`px-3 py-1 text-xs rounded-full border transition cursor-pointer ${
                  statusFilter === "all"
                    ? "bg-slate-900 text-white border-slate-900 font-semibold shadow-xs"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                All Records
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("unscheduled")}
                className={`px-3 py-1 text-xs rounded-full border transition cursor-pointer ${
                  statusFilter === "unscheduled"
                    ? "bg-amber-600 text-white border-amber-600 font-semibold shadow-xs"
                    : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
                }`}
                title="Filter items where Schedule Date is not mentioned"
              >
                ⚠️ Unscheduled (No Date)
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("pending_actual")}
                className={`px-3 py-1 text-xs rounded-full border transition cursor-pointer ${
                  statusFilter === "pending_actual"
                    ? "bg-blue-600 text-white border-blue-600 font-semibold shadow-xs"
                    : "bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100"
                }`}
                title="Filter items where Actual Date is not updated"
              >
                ⏳ Actual Not Updated
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("overdue")}
                className={`px-3 py-1 text-xs rounded-full border transition cursor-pointer ${
                  statusFilter === "overdue"
                    ? "bg-red-600 text-white border-red-600 font-semibold shadow-xs"
                    : "bg-red-50 text-red-800 border-red-200 hover:bg-red-100"
                }`}
                title="Filter items where Actual Date is crossed / Overdue / Missed"
              >
                🔴 Overdue / Date Crossed
              </button>

              {statusFilter !== "all" && (
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className="text-xs text-slate-400 hover:text-slate-600 ml-2 underline cursor-pointer"
                >
                  Reset Status Filter
                </button>
              )}
            </div>
          </div>
        </Card>

        {/* Bulk Approval Bar for Admins */}
        {isAdminOrMore && (
          <Card className="mb-4 rounded-2xl border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/90 dark:bg-emerald-950/80 backdrop-blur-md p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/80 text-emerald-800 dark:text-emerald-200 border border-emerald-200/50 dark:border-emerald-700/50 flex items-center justify-center font-bold text-xs">
                  {selectedCycleIds.size}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-emerald-100">Bulk Approval Manager</h4>
                  <p className="text-xs text-slate-500 dark:text-emerald-300/80">Select pending cycles to approve multiple items at once.</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAllSubmitted}
                  className="ml-2 text-xs h-8 bg-white dark:bg-emerald-900/60 border-emerald-300 dark:border-emerald-700/80 text-emerald-900 dark:text-emerald-100 hover:bg-emerald-100 dark:hover:bg-emerald-800"
                >
                  <ListChecks className="w-3.5 h-3.5 mr-1" />
                  Select All Submitted
                </Button>
              </div>

              {selectedCycleIds.size > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      setBulkApproving(true);
                      try {
                        const res = await api.post("/site-cycles/bulk-approve", { cycle_ids: Array.from(selectedCycleIds), which: "schedule" });
                        toast.success(`Approved ${res.data.approved_count || 0} schedule(s)!`);
                        clearSelection();
                        load();
                      } catch (e) { toast.error(getErrorMessage(e, "Bulk approve failed")); }
                      finally { setBulkApproving(false); }
                    }}
                    disabled={bulkApproving}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    Approve Schedules ({selectedCycleIds.size})
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      setBulkApproving(true);
                      try {
                        const res = await api.post("/site-cycles/bulk-approve", { cycle_ids: Array.from(selectedCycleIds), which: "actual" });
                        toast.success(`Approved ${res.data.approved_count || 0} actual(s)!`);
                        clearSelection();
                        load();
                      } catch (e) { toast.error(getErrorMessage(e, "Bulk approve failed")); }
                      finally { setBulkApproving(false); }
                    }}
                    disabled={bulkApproving}
                    className="bg-teal-600 hover:bg-teal-700 text-white text-xs h-8"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    Approve Actuals ({selectedCycleIds.size})
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      setBulkApproving(true);
                      try {
                        const res = await api.post("/site-cycles/bulk-approve", { cycle_ids: Array.from(selectedCycleIds), which: "both" });
                        toast.success(`Approved ${res.data.approved_count || 0} cycle item(s)!`);
                        clearSelection();
                        load();
                      } catch (e) { toast.error(getErrorMessage(e, "Bulk approve failed")); }
                      finally { setBulkApproving(false); }
                    }}
                    disabled={bulkApproving}
                    className="bg-slate-900 hover:bg-black text-white text-xs h-8"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                    Approve All Selected ({selectedCycleIds.size})
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSelection}
                    className="text-xs text-slate-500 hover:text-slate-700 h-8"
                  >
                    Clear
                  </Button>
                </div>
              )}
            </div>
          </Card>
        )}

        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading…</div>
        ) : view === "month" ? (
          activity === "equipment_testing" ? (
            <EquipmentMonthlyTable
              data={filteredData}
              year={year}
              month={12}
              activity={activity}
              reload={load}
              isAdminOrMore={isAdminOrMore}
              role={user?.role}
            />
          ) : activity === "grasscutting" ? (
            <GrasscuttingTable
              data={filteredData}
              year={year}
              activity={activity}
              reload={load}
              isAdminOrMore={isAdminOrMore}
              role={user?.role}
              selectedCycleIds={selectedCycleIds}
              toggleSelect={toggleSelect}
              statusFilter={statusFilter}
              todayStr={todayStr}
            />
          ) : (
            <MonthlyTable
              data={filteredData}
              year={year}
              month={month}
              activity={activity}
              reload={load}
              isAdminOrMore={isAdminOrMore}
              role={user?.role}
              selectedCycleIds={selectedCycleIds}
              toggleSelect={toggleSelect}
              statusFilter={statusFilter}
              todayStr={todayStr}
            />
          )
        ) : view === "grid" ? (
          <YearlyGrid
            data={filteredGridData}
            year={year}
            activity={activity}
            onCellClick={(m, site) => {
              if (m) setMonth(m);
              if (site) setQ(site.site_name || site.site_code || "");
              setView("month");
            }}
          />
        ) : (
          <YearlySummary summary={filteredSummary} year={year} activity={activity} />
        )}
      </div>
    </AppLayout>
  );
}

/* ------------------------- Grasscutting Table ---------------------------- */
function GrasscuttingTable({ data, year, activity, reload, isAdminOrMore, role, selectedCycleIds, toggleSelect, statusFilter, todayStr }) {
  const { sites, cycles } = data;

  // Only show sites where grass_cutting_enabled is truthy
  const activeSites = sites.filter(s => {
    const v = String(s.grass_cutting_enabled ?? "0").trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes";
  });

  const byKey = useMemo(() => {
    const m = {};
    for (const c of cycles) m[`${c.site_id}::${c.cycle_number}`] = c;
    return m;
  }, [cycles]);

  if (!activeSites.length) {
    return (
      <div className="p-16 text-center bg-white rounded-2xl border border-dashed border-slate-200">
        <SprayCan className="w-10 h-10 mx-auto text-slate-300" />
        <p className="text-sm text-slate-500 mt-3">
          No plants have Grasscutting enabled. Set <code>grass_cutting_enabled = 1</code> in Site Management.
        </p>
      </div>
    );
  }

  return (
    <Card className="rounded-2xl border-slate-100 card-soft bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse" data-testid="grasscutting-table">
          <thead className="bg-slate-50 border-b-2 border-slate-200 text-slate-700">
            <tr className="text-left">
              {isAdminOrMore && <th className="p-3 font-semibold w-[40px] border-r border-slate-200 text-center">Select</th>}
              <th className="p-3 font-semibold w-[220px] border-r border-slate-200">Site</th>
              <th className="p-3 font-semibold w-[180px] border-r border-slate-200">Occurrence</th>
              <th className="p-3 font-semibold w-[150px] border-r border-slate-200">Schedule</th>
              <th className="p-3 font-semibold w-[210px] border-r border-slate-200">Actual</th>
              <th className="p-3 font-semibold border-r border-slate-200">Remark</th>
              <th className="p-3 font-semibold w-[130px] border-r border-slate-200">Status</th>
              <th className="p-3 font-semibold w-[220px] text-right">Save / Submit</th>
            </tr>
          </thead>
          <tbody>
            {activeSites.map((site) => {
              const cap = parseInt(site.grass_cutting_frequency, 10) || 1;
              return Array.from({ length: cap }).map((_, i) => {
                const cn = i + 1;
                const cyc = byKey[`${site.site_id}::${cn}`];
                return (
                  <CycleRow
                    key={`${site.site_id}-${cn}`}
                    site={site}
                    cn={cn}
                    cap={cap}
                    cyc={cyc}
                    year={year}
                    month={12}
                    activity={activity}
                    reload={reload}
                    isAdminOrMore={isAdminOrMore}
                    role={role}
                    showPlant={i === 0}
                    selectedCycleIds={selectedCycleIds}
                    toggleSelect={toggleSelect}
                    statusFilter={statusFilter}
                    todayStr={todayStr}
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

/* --------------------------- Monthly Table ------------------------------- */
function MonthlyTable({ data, year, month, activity, reload, isAdminOrMore, role, selectedCycleIds, toggleSelect, statusFilter, todayStr }) {
  const { sites, cycles } = data;

  const byKey = useMemo(() => {
    const m = {};
    for (const c of cycles) m[`${c.site_id}::${c.cycle_number}`] = c;
    return m;
  }, [cycles]);

  const capOf = (s) => {
    if (activity === "equipment_testing") return 5;
    if (activity === "grasscutting") return parseInt(s.grass_cutting_frequency, 10) || 1;
    if (activity === "pm") return Math.max(1, parseInt(s.pm_cycles_per_quarter, 10) || 1);
    return Math.max(1, parseInt(s.cycles_per_month, 10) || 1);
  };

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
              {isAdminOrMore && <th className="p-3 font-semibold w-[40px] border-r border-slate-200 text-center">Select</th>}
              <th className="p-3 font-semibold w-[220px] border-r border-slate-200">Site</th>
              <th className="p-3 font-semibold w-[180px] border-r border-slate-200">
                {activity === "equipment_testing" ? "Equipment Test" : "Cycle"}
              </th>
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
                    selectedCycleIds={selectedCycleIds}
                    toggleSelect={toggleSelect}
                    statusFilter={statusFilter}
                    todayStr={todayStr}
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
function CycleRow({ site, cn, cap, cyc, year, month, activity, reload, isAdminOrMore, role, showPlant, selectedCycleIds, toggleSelect, statusFilter, todayStr }) {
  // ── ALL hooks MUST come first (React Rules of Hooks) ──
  const [saving, setSaving] = useState(false);
  const [unlockDlg, setUnlockDlg] = useState(null);

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

  // ── Status filter (after all hooks) ──
  const schDate = sch.planned_date;
  const actDate = act.actual_date;
  const result  = act.result;

  let matchesFilter = true;
  if (statusFilter && statusFilter !== "all") {
    if (statusFilter === "unscheduled") matchesFilter = !schDate;
    else if (statusFilter === "pending_actual") matchesFilter = !actDate;
    else if (statusFilter === "overdue") {
      matchesFilter = Boolean(
        (schDate && schDate < (todayStr || "") && !actDate) ||
        result === "Missed" || act.status === "missed" || act.status === "delayed"
      );
    }
  }

  if (!matchesFilter) return null;

  const eqItem = activity === "equipment_testing" ? EQUIPMENT_TESTING_ITEMS[cn - 1] : null;
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

  const schHasAttachments = ((sch.evidence_files || []).length > 0);
  const actHasAttachments = ((act.evidence_files || []).length > 0);
  void schHasAttachments;

  const isYearly = ["equipment_testing", "grasscutting"].includes(activity);
  const minDate = isYearly ? `${year}-01-01` : `${year}-${String(month).padStart(2, "0")}-01`;
  const maxDate = isYearly ? `${year}-12-31` : `${year}-${String(month).padStart(2, "0")}-${monthLastDay(year, month)}`;

  return (
    <>
      <tr className="border-b border-slate-200 align-middle hover:bg-slate-50/40">
        {isAdminOrMore && (
          <td className="p-3 border-r border-slate-200 text-center w-[40px]">
            {cyc?.cycle_id && (sch.status === "submitted" || act.status === "submitted") ? (
              <input
                type="checkbox"
                checked={selectedCycleIds?.has(cyc.cycle_id)}
                onChange={() => toggleSelect && toggleSelect(cyc.cycle_id)}
                className="w-4 h-4 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500 cursor-pointer"
              />
            ) : null}
          </td>
        )}
        {showPlant && (
          <td rowSpan={cap} className="p-3 border-r border-slate-200 align-middle bg-slate-50/40">
            <div className="font-semibold text-slate-900">{site.site_name}</div>
            <div className="text-[11px] text-slate-500 font-mono mt-0.5">{site.site_code}</div>
            <div className="text-[10px] text-slate-400 mt-1">
              {activity === "equipment_testing"
                ? "5 Equipment Tests"
                : activity === "grasscutting"
                ? `${cap} grasscut${cap > 1 ? "s" : ""} / year`
                : `${cap} ${activity === "pm" ? "PM cycle" : "cycle"}${cap > 1 ? "s" : ""} ${activity === "pm" ? "/ quarter" : "/ month"}`}
            </div>
          </td>
        )}

        {/* Cycle / Equipment item label */}
        <td className="p-3 border-r border-slate-200 text-slate-700 font-medium">
          {eqItem ? (
            <div>
              <div className="font-semibold text-slate-900 text-xs">{eqItem.name}</div>
              <div className="text-[10px] text-blue-600 mt-0.5 font-normal">
                Count: {site[eqItem?.countKey] || 0}
              </div>
            </div>
          ) : activity === "grasscutting" ? (
            `Occurrence ${cn} of ${cap}`
          ) : (
            `${ordinal(cn)} cycle`
          )}
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
          <div className="flex items-center gap-2">
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

  const capOf = (s) => {
    if (activity === "equipment_testing") return 5;
    if (activity === "grasscutting") return parseInt(s.grass_cutting_frequency, 10) || 1;
    return Math.max(1, parseInt(
      activity === "pm" ? s.pm_cycles_per_quarter : s.cycles_per_month, 10) || 1);
  };

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

  // ── Dot colour map ──
  const dot = (status) => {
    const map = {
      approved:         "bg-emerald-500",
      submitted:        "bg-amber-500",
      draft:            "bg-slate-300",
      empty:            "bg-slate-100 border border-slate-200",
      missed:           "bg-red-500",
      delayed:          "bg-yellow-400",
      delay_completed:  "bg-teal-400",
    };
    return map[status] || map.empty;
  };

  // ── Derive actual execution state from schedule vs actual comparison ──
  const cellActState = (cy) => {
    const schDate  = cy?.schedule?.planned_date;
    const actDate  = cy?.actual?.actual_date;
    const result   = cy?.actual?.result;
    const actStatus = cy?.actual?.status || (actDate ? "draft" : "empty");

    if (!schDate) return actStatus; // no schedule → just show plain status

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sDate = new Date(schDate + "T00:00:00");

    if (actDate) {
      // Activity was done — check if marked Missed explicitly
      if (result === "Missed") return "missed";
      // Check how many days after scheduled date it was done
      const aDate = new Date(actDate + "T00:00:00");
      const diffDays = (aDate - sDate) / (1000 * 60 * 60 * 24);
      if (diffDays > 3) return "delay_completed"; // done but late
      return actStatus; // done on time — approved/submitted/draft
    }

    // Not done yet — check overdue
    const diffDays = (today - sDate) / (1000 * 60 * 60 * 24);
    if (diffDays > 7) return "missed";   // 7+ days overdue → missed
    if (diffDays > 2) return "delayed";  // 2–7 days overdue → delayed
    return actStatus; // upcoming / within window
  };

  return (
    <Card className="rounded-2xl border-slate-100 card-soft bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse" data-testid="yearly-grid-table">
          <thead className="bg-slate-50 border-b-2 border-slate-200 text-slate-700 sticky top-0">
            <tr className="text-left">
              <th className="p-3 font-semibold w-[220px] border-r border-slate-200">Site</th>
              <th className="p-3 font-semibold w-[160px] border-r border-slate-200">
                 {activity === "equipment_testing" ? "Equipment Test" : "Cycle"}
              </th>
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
                        className="p-3 border-r border-slate-200 align-middle bg-slate-50/40 cursor-pointer hover:bg-slate-100/60"
                        title={`Filter ${s.site_name} in Monthly View`}
                        onClick={() => onCellClick(null, s)}
                      >
                        <div className="font-semibold text-slate-900 hover:text-blue-600 transition">{s.site_name}</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          {s.site_code}
                        </div>
                      </td>
                    )}
                    <td className="p-2 border-r border-slate-200 text-slate-700 font-medium whitespace-pre-wrap">
                      {activity === "equipment_testing" ? EQUIPMENT_TESTING_ITEMS[cn - 1]?.name : ordinal(cn)}
                    </td>
                    {cols.map((c) => {
                      const cy  = byKey[`${s.site_id}::${c.v}::${cn}`] || null;
                      const sch = cy?.schedule?.status || (cy?.schedule?.planned_date ? "draft" : "empty");
                      const act = cellActState(cy);

                      // Glassy cell tint for execution states
                      const cellGlass = {
                        missed:          "bg-red-50/80 backdrop-blur-sm border-l-2 border-red-400 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.15)]",
                        delayed:         "bg-yellow-50/80 backdrop-blur-sm border-l-2 border-yellow-400 shadow-[inset_0_0_0_1px_rgba(234,179,8,0.15)]",
                        delay_completed: "bg-teal-50/80 backdrop-blur-sm border-l-2 border-teal-400 shadow-[inset_0_0_0_1px_rgba(20,184,166,0.15)]",
                      }[act] || "";

                      // For the Act dot: delay_completed → green (done), missed/delayed → neutral
                      const actDotState = act === "delay_completed" ? "approved"
                        : (act === "missed" || act === "delayed") ? "empty"
                        : act;

                      const tooltip = [
                        cy?.schedule?.planned_date ? `Sch: ${cy.schedule.planned_date} (${cy.schedule.status || "draft"})` : null,
                        cy?.actual?.actual_date   ? `Act: ${cy.actual.actual_date} (${cy.actual.status || "draft"})${cy.actual.result ? " · " + cy.actual.result : ""}` : null,
                        (act === "missed" || act === "delayed" || act === "delay_completed")
                          ? `⚠ ${act === "delay_completed" ? "Delay Completed" : act.charAt(0).toUpperCase() + act.slice(1)}` : null,
                      ].filter(Boolean).join(" · ") || "No data";

                      return (
                        <td
                          key={c.v}
                          className={`p-1.5 border-r border-slate-100 text-center cursor-pointer transition-all hover:brightness-95 ${cellGlass || "hover:bg-slate-50"}`}
                          title={tooltip}
                          data-testid={`grid-cell-${s.site_id}-${cn}-${c.v}`}
                          onClick={() => onCellClick(c.v, s)}
                        >
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                              <span className={`w-2 h-2 rounded-full ${dot(sch)}`} />
                              <span className="w-6 text-left">Sch</span>
                            </span>
                            <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                              <span className={`w-2 h-2 rounded-full ${dot(actDotState)}`} />
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
      {/* ─── Legend ─── */}
      <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/40">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-slate-500">
          <span className="font-semibold text-slate-700 text-xs">Legend:</span>

          {/* Schedule / Submission states */}
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
            <span>Approved</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
            <span>Submitted</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-300 shrink-0" />
            <span>Draft</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-100 border border-slate-300 shrink-0" />
            <span>No data</span>
          </span>

          {/* Divider */}
          <span className="w-px h-4 bg-slate-200 shrink-0" />

          {/* Execution states — show mini glassy pill to match actual cell look */}
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-7 h-5 rounded border-l-2 border-yellow-400 bg-yellow-50/80 shadow-[inset_0_0_0_1px_rgba(234,179,8,0.2)] text-[8px] text-yellow-600 font-bold shrink-0">
              SCH
            </span>
            <span className="font-medium text-yellow-700">Delayed</span>
            <span className="text-slate-400">(2–7 days overdue, not done)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-7 h-5 rounded border-l-2 border-red-400 bg-red-50/80 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.2)] text-[8px] text-red-600 font-bold shrink-0">
              SCH
            </span>
            <span className="font-medium text-red-700">Missed</span>
            <span className="text-slate-400">(7+ days overdue / marked missed)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-7 h-5 rounded border-l-2 border-teal-400 bg-teal-50/80 shadow-[inset_0_0_0_1px_rgba(20,184,166,0.2)] text-[8px] text-teal-600 font-bold shrink-0">
              SCH
            </span>
            <span className="font-medium text-teal-700">Delay Completed</span>
            <span className="text-slate-400">(done 3+ days after schedule)</span>
          </span>
        </div>
        <div className="mt-1.5 text-[10px] text-slate-400">
          Sch = Scheduled entry status &nbsp;·&nbsp; Act = Actual execution status &nbsp;·&nbsp; Click any cell to open that {activity === "pm" ? "quarter" : "month"} for editing.
        </div>
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

/* --------------------------- Equipment Monthly Table --------------------------- */
function EquipmentMonthlyTable({ data, year, month, activity, reload, isAdminOrMore, role }) {
  const { sites, cycles } = data;

  const byKey = useMemo(() => {
    const m = {};
    for (const c of cycles) m[`${c.site_id}::${c.cycle_number}`] = c;
    return m;
  }, [cycles]);

  // Only show columns where at least 1 site has that item enabled
  const visibleItems = useMemo(() =>
    EQUIPMENT_TESTING_ITEMS.filter(it => sites.some(s => eqItemEnabled(s, it))),
  [sites]);

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

  if (!visibleItems.length) {
    return (
      <div className="p-16 text-center bg-white rounded-2xl border border-dashed border-slate-200">
        <Wrench className="w-10 h-10 mx-auto text-slate-300" />
        <p className="text-sm text-slate-500 mt-3">
          No equipment items are enabled. Set <code>ert_enabled = 1</code>, <code>transformer_enabled = 1</code>, etc. in Site Management.
        </p>
      </div>
    );
  }

  return (
    <Card className="rounded-2xl border-slate-100 card-soft bg-white overflow-hidden">
      <div className="overflow-x-auto nice-scroll">
        <table className="w-full text-sm border-collapse min-w-[1000px]">
          <thead className="bg-slate-50 border-b-2 border-slate-200 text-slate-700">
            <tr className="text-left">
              <th className="p-3 font-semibold w-[220px] border-r border-slate-200 bg-white sticky left-0 z-10 shadow-[1px_0_0_0_#e2e8f0]">Site</th>
              {visibleItems.map((it) => (
                <th key={it.id} className="p-3 font-semibold min-w-[180px] border-r border-slate-200">
                  {it.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s.site_id} className="border-b border-slate-200 hover:bg-slate-50/40">
                <td className="p-3 border-r border-slate-200 bg-white sticky left-0 z-10 shadow-[1px_0_0_0_#e2e8f0] align-top">
                  <div className="font-semibold text-slate-900">{s.site_name}</div>
                  <div className="text-[11px] text-slate-500 font-mono mt-0.5">{s.site_code}</div>
                </td>
                {visibleItems.map((it) => {
                  const cn = it.id;
                  const enabled = eqItemEnabled(s, it);
                  const cyc = byKey[`${s.site_id}::${cn}`] || null;
                  return (
                    <td key={it.id} className={`p-2 border-r border-slate-200 align-top h-full ${!enabled ? "bg-slate-50" : ""}`}>
                      {enabled ? (
                        <EquipmentCycleCell
                          site={s} cn={cn} eqItem={it} cyc={cyc} year={year} month={month}
                          activity={activity} reload={reload} isAdminOrMore={isAdminOrMore} role={role}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full min-h-[60px] text-[10px] text-slate-300 italic">N/A</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function EquipmentCycleCell({ site, cn, eqItem, cyc, year, month, activity, reload, isAdminOrMore, role }) {
  const [open, setOpen] = useState(false);

  const sch = cyc?.schedule || {};
  const act = cyc?.actual || {};
  const status = act.status || sch.status || "pending";
  
  const schDate = sch.planned_date;
  const actDate = act.actual_date;
  const result = act.result;

  const statusPillLocal = (st) => {
    const map = {
      draft:     "bg-slate-100 text-slate-600 border-slate-200",
      submitted: "bg-amber-100 text-amber-800 border-amber-200",
      approved:  "bg-emerald-100 text-emerald-800 border-emerald-200",
      pending:   "bg-slate-100 text-slate-400 border-slate-200",
    };
    return map[st] || map.pending;
  };

  const getExecutionStatus = () => {
    if (!schDate) return null;
    const sDate = new Date(schDate + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (actDate) {
      if (result === 'Missed') return { label: "Missed", color: "bg-red-100 text-red-800 border-red-200" };
      
      const aDate = new Date(actDate + "T00:00:00");
      const diffDays = (aDate - sDate) / (1000 * 60 * 60 * 24);
      if (diffDays > 3) return { label: "Delayed Completed", color: "bg-green-100 text-green-800 border-green-200" };
      return null;
    }

    const diffDays = (today - sDate) / (1000 * 60 * 60 * 24);
    if (diffDays > 7) return { label: "Missed", color: "bg-red-100 text-red-800 border-red-200" };
    if (diffDays > 2) return { label: "Delayed", color: "bg-yellow-100 text-yellow-800 border-yellow-200" };
    return null;
  };
  const execStatus = getExecutionStatus();

  return (
    <>
      <div 
        className="group relative flex flex-col gap-1.5 p-2 rounded-lg border border-transparent hover:border-blue-200 hover:bg-blue-50/50 cursor-pointer transition-colors h-full min-h-[60px]"
        onClick={() => setOpen(true)}
      >
         <div className="flex items-center justify-between flex-wrap gap-1">
           <div className="flex gap-1 flex-wrap">
             <Badge className={`text-[9px] px-1 py-0 capitalize ${statusPillLocal(status)}`}>{status}</Badge>
             {execStatus && <Badge className={`text-[9px] px-1 py-0 capitalize ${execStatus.color}`}>{execStatus.label}</Badge>}
           </div>
           <div className="text-[9px] text-slate-400 font-mono whitespace-nowrap">Count: {site[eqItem.countKey] || 0}</div>
         </div>
         {schDate || actDate ? (
            <div className="text-xs space-y-1 mt-1">
              {schDate && <div><span className="text-slate-400 inline-block w-3">P:</span> <span className="font-mono">{schDate}</span></div>}
              {actDate && <div><span className="text-slate-400 inline-block w-3">A:</span> <span className="font-mono">{actDate}</span> {result === 'Done' ? <span className="text-emerald-600 font-bold ml-1 text-[10px]">✔</span> : result === 'Missed' ? <span className="text-red-600 font-bold ml-1 text-[10px]">✖</span> : null}</div>}
            </div>
         ) : (
            <div className="text-[10px] text-slate-300 italic mt-1 text-center py-2 border border-dashed border-transparent group-hover:border-blue-200 rounded">Unscheduled</div>
         )}
         <div className="absolute inset-0 bg-blue-500/5 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
           <span className="bg-white text-blue-600 text-[10px] font-medium px-2 py-1 rounded shadow-sm flex items-center gap-1 border border-blue-100"><Pencil className="w-3 h-3"/> Edit</span>
         </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
           <DialogHeader>
             <DialogTitle className="flex flex-col gap-1">
               <span className="text-lg">{site.site_name}</span>
               <span className="text-sm text-slate-500 font-normal">{eqItem.name} (Count: {site[eqItem.countKey] || 0})</span>
             </DialogTitle>
           </DialogHeader>
           <div className="mt-2">
             <EquipmentCycleEditForm 
                site={site} cn={cn} cyc={cyc} year={year} month={month} activity={activity} 
                reload={() => { reload(); setOpen(false); }} 
                isAdminOrMore={isAdminOrMore} role={role}
                onCancel={() => setOpen(false)}
             />
           </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EquipmentCycleEditForm({ site, cn, cyc, year, month, activity, reload, isAdminOrMore, role, onCancel }) {
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

  const canEditSch = sch.status !== "approved" && (sch.status !== "submitted" || isAdminOrMore);
  const canEditAct = act.status !== "approved" && (act.status !== "submitted" || isAdminOrMore);

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

  const statusPillLocal = (st) => {
    const map = {
      draft:     "bg-slate-100 text-slate-600 border-slate-200",
      submitted: "bg-amber-100 text-amber-800 border-amber-200",
      approved:  "bg-emerald-100 text-emerald-800 border-emerald-200",
      pending:   "bg-slate-100 text-slate-400 border-slate-200",
    };
    return map[st] || map.pending;
  };

  const isYearly = ["equipment_testing", "grasscutting"].includes(activity);
  const minDate = isYearly ? `${year}-01-01` : `${year}-${String(month).padStart(2, "0")}-01`;
  const monthLastDay = (y, m) => new Date(y, m, 0).getDate();
  const maxDate = isYearly ? `${year}-12-31` : `${year}-${String(month).padStart(2, "0")}-${monthLastDay(year, month)}`;

  return (
    <div className="space-y-4">
      {/* SCHEDULE */}
      <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200">
        <h4 className="font-semibold text-slate-800 mb-3 flex items-center justify-between">
          <span>Schedule</span>
          <Badge className={`capitalize ${statusPillLocal(sch.status || "draft")}`}>{sch.status || "draft"}</Badge>
        </h4>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs text-slate-500 mb-1 block font-medium">Planned Date</label>
            <Input
              type="date"
              value={form.planned_date || ""}
              disabled={!canEditSch}
              min={minDate} max={maxDate}
              onChange={(e) => setForm({ ...form, planned_date: e.target.value })}
              className="text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block font-medium">Notes</label>
            <Input
              placeholder="Remarks..."
              value={form.sch_notes || ""}
              disabled={!canEditSch}
              onChange={(e) => setForm({ ...form, sch_notes: e.target.value })}
              className="text-sm"
            />
          </div>
        </div>
        <div className="flex gap-2">
           {canEditSch && <Button size="sm" onClick={() => save("schedule")} disabled={saving} variant="outline">Save Draft</Button>}
           {sch.status === "draft" && <Button size="sm" onClick={() => submit("schedule")} disabled={saving}>Submit</Button>}
           {sch.status === "submitted" && isAdminOrMore && <Button size="sm" onClick={() => approve("schedule")} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">Approve</Button>}
        </div>
        <div className="mt-4 pt-4 border-t border-slate-200 border-dashed">
          <label className="text-xs text-slate-500 mb-2 block font-medium">Attachments</label>
          <AttachStrip
            cycleId={cyc?.cycle_id}
            which="schedule"
            canEdit={canEditSch}
            files={sch.evidence_files}
            reload={reload}
            required={false}
          />
        </div>
      </div>

      {/* ACTUAL */}
      <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200">
        <h4 className="font-semibold text-slate-800 mb-3 flex items-center justify-between">
          <span>Actual Work</span>
          <Badge className={`capitalize ${statusPillLocal(act.status || "draft")}`}>{act.status || "draft"}</Badge>
        </h4>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="text-xs text-slate-500 mb-1 block font-medium">Actual Date</label>
            <Input
              type="date"
              value={form.actual_date || ""}
              disabled={!canEditAct}
              min={minDate} max={maxDate}
              onChange={(e) => setForm({ ...form, actual_date: e.target.value })}
              className="text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block font-medium">Result</label>
            <Select value={form.result || ""} onValueChange={(v) => setForm({ ...form, result: v })} disabled={!canEditAct}>
              <SelectTrigger className="text-sm h-9"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Done">Done</SelectItem>
                <SelectItem value="Missed">Missed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block font-medium">Notes</label>
            <Input
              placeholder="Remarks..."
              value={form.act_notes || ""}
              disabled={!canEditAct}
              onChange={(e) => setForm({ ...form, act_notes: e.target.value })}
              className="text-sm"
            />
          </div>
        </div>
        <div className="flex gap-2">
           {canEditAct && <Button size="sm" onClick={() => save("actual")} disabled={saving} variant="outline">Save Draft</Button>}
           {act.status === "draft" && <Button size="sm" onClick={() => submit("actual")} disabled={saving}>Submit</Button>}
           {act.status === "submitted" && isAdminOrMore && <Button size="sm" onClick={() => approve("actual")} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">Approve</Button>}
        </div>
        <div className="mt-4 pt-4 border-t border-slate-200 border-dashed">
          <label className="text-xs text-slate-500 mb-2 block font-medium">Attachments</label>
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
    </div>
  );
}

/* ------------------- Multi-Select Cluster Manager Dropdown ------------------- */
function MultiSelectClusterDropdown({ options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = React.useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isAllSelected = options.length > 0 && selected.length === options.length;

  const toggleAll = () => {
    if (isAllSelected) {
      onChange([]);
    } else {
      onChange([...options]);
    }
  };

  const toggleOption = (opt) => {
    if (selected.includes(opt)) {
      onChange(selected.filter((o) => o !== opt));
    } else {
      onChange([...selected, opt]);
    }
  };

  return (
    <div className="relative inline-block text-left w-[220px]" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full h-9 px-3 text-xs bg-white border border-slate-200 rounded-lg flex items-center justify-between shadow-xs hover:bg-slate-50 transition cursor-pointer"
      >
        <span className="truncate text-slate-700 font-medium">
          {selected.length === 0
            ? "No Cluster Manager"
            : isAllSelected
            ? "All Cluster Managers"
            : `${selected.length} Selected`}
        </span>
        <ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-64 rounded-xl bg-white border border-slate-200 shadow-xl p-2 space-y-1 text-xs left-0 sm:left-auto">
          <div
            onClick={toggleAll}
            className="flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-slate-100 cursor-pointer font-semibold border-b border-slate-100 text-slate-800"
          >
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={() => {}}
              className="w-3.5 h-3.5 rounded text-emerald-600 cursor-pointer"
            />
            <span>Select All ({options.length})</span>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-0.5 pt-1">
            {options.map((opt) => {
              const checked = selected.includes(opt);
              return (
                <div
                  key={opt}
                  onClick={() => toggleOption(opt)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-slate-50 cursor-pointer text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {}}
                    className="w-3.5 h-3.5 rounded text-emerald-600 cursor-pointer"
                  />
                  <span className="truncate">{opt}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

