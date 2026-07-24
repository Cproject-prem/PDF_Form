import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { api, getErrorMessage } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Search, MapPin, Zap, Building2, User as UserIcon, Mail, Calendar,
  ArrowLeft, ExternalLink, FileText, FileType2, Pencil, Plus, Save,
  History, ChevronRight, ChevronDown, LayoutGrid, Rows3,
  Folder, FolderPlus, Upload, Trash2, Download, X, Check, FolderArchive, Eye,
} from "lucide-react";
import { formatDate } from "@/lib/utils2";
import DocFileViewer from "@/components/plants/DocFileViewer";

/**
 * Plants — a friendlier, read-only view of Site Master.
 *
 *   /plants          → grid of plant cards (filtered by user's RLS)
 *   /plants/{code}   → detailed plant view with grouped sections + recent
 *                      submissions from the linked forms/pdf-forms
 */
export default function PlantsPage() {
  const { site_code } = useParams();
  if (site_code) return <PlantDetail siteCode={site_code} />;
  return <PlantsList />;
}

/* ------------------------------ LIST VIEW ------------------------------- */
function PlantsList() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem("ff_plants_view") === "table" ? "table" : "cards"
  );
  const setViewSticky = (v) => {
    setView(v);
    localStorage.setItem("ff_plants_view", v);
  };

  useEffect(() => {
    setLoading(true);
    api.get("/sites")
      .then((r) => setRows(r.data || []))
      .catch((e) => toast.error(getErrorMessage(e, "Failed to load plants")))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && r.site_status !== status) return false;
      if (!needle) return true;
      return [
        r.site_name, r.site_code, r.asset_id, r.customer_name,
        r.vendor_name, r.state, r.district, r.location,
      ].some((v) => (v || "").toLowerCase().includes(needle));
    });
  }, [rows, q, status]);

  const totalMw = filtered.reduce(
    (s, r) => s + (parseFloat(r.ac_capacity) || 0), 0,
  );
  const statuses = ["all", ...new Set(rows.map((r) => r.site_status).filter(Boolean))];

  return (
    <AppLayout>
      <div className="max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-xs uppercase tracking-[0.1em] text-slate-400 font-bold mb-1">Plant view</div>
            <h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight">Plants</h1>
            <p className="text-slate-500 mt-1">
              {filtered.length} plant{filtered.length === 1 ? "" : "s"} · {totalMw.toFixed(1)} MW total
            </p>
          </div>
        </div>

        <Card className="mb-6 rounded-2xl border-slate-100 card-soft bg-white">
          <div className="flex flex-wrap items-center gap-3 p-4">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                data-testid="plants-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name, code, vendor, location…"
                className="pl-10 h-9"
              />
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-1 text-xs">
              {statuses.map((s) => (
                <button
                  key={s}
                  data-testid={`plants-status-${s}`}
                  onClick={() => setStatus(s)}
                  className={`px-3 py-1.5 rounded-md capitalize transition-colors ${
                    status === s ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-1 text-xs ml-auto">
              <button
                data-testid="plants-view-cards"
                onClick={() => setViewSticky("cards")}
                title="Card view"
                className={`px-2.5 py-1.5 rounded-md transition-colors ${
                  view === "cards" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5 inline mr-1" /> Cards
              </button>
              <button
                data-testid="plants-view-table"
                onClick={() => setViewSticky("table")}
                title="Table view"
                className={`px-2.5 py-1.5 rounded-md transition-colors ${
                  view === "table" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Rows3 className="w-3.5 h-3.5 inline mr-1" /> Table
              </button>
            </div>
          </div>
        </Card>

        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center bg-white rounded-2xl border border-dashed border-slate-200">
            <MapPin className="w-12 h-12 mx-auto text-slate-300" />
            <p className="text-sm text-slate-500 mt-3">No plants available for your access scope.</p>
          </div>
        ) : view === "table" ? (
          <PlantsTable rows={filtered} />
        ) : (
          <div className="max-h-[calc(100vh-260px)] overflow-y-auto nice-scroll pr-1 -mr-1">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((p) => <PlantCard key={p.site_code || p.site_id} plant={p} />)}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function PlantCard({ plant }) {
  const stColor = statusColor(plant.site_status);
  return (
    <Link
      to={`/plants/${encodeURIComponent(plant.site_code || plant.site_id)}`}
      data-testid={`plant-card-${plant.site_code || plant.site_id}`}
      className="group"
    >
      <Card className="rounded-2xl border-slate-100 card-soft bg-white hover:shadow-lg hover:border-blue-200 transition-all">
        <div className="p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-heading font-bold text-lg text-slate-900 group-hover:text-blue-700 truncate">
                {plant.site_name || "—"}
              </div>
              <div className="text-xs text-slate-400 font-mono mt-0.5">
                {plant.site_code || plant.asset_id || "—"}
              </div>
            </div>
            <Badge className={`${stColor} shrink-0 capitalize`}>{plant.site_status || "—"}</Badge>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <Metric icon={<Zap className="w-3.5 h-3.5" />}
                    label="AC Capacity" value={plant.ac_capacity ? `${plant.ac_capacity} MW` : "—"} />
            <Metric icon={<MapPin className="w-3.5 h-3.5" />}
                    label="Region" value={plant.region || "—"} />
            <Metric icon={<Building2 className="w-3.5 h-3.5" />}
                    label="Vendor" value={plant.vendor_name || "—"} />
            <Metric icon={<UserIcon className="w-3.5 h-3.5" />}
                    label="Cluster Mgr" value={plant.cluster_manager_name || "—"} />
          </div>
        </div>
      </Card>
    </Link>
  );
}

function Metric({ icon, label, value }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-slate-400 uppercase tracking-wider text-[10px]">
        {icon}<span>{label}</span>
      </div>
      <div className="text-slate-800 font-medium truncate">{value}</div>
    </div>
  );
}

function statusColor(s) {
  const k = String(s || "").toLowerCase();
  if (k.includes("operational")) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (k.includes("commission")) return "bg-blue-100 text-blue-700 border-blue-200";
  if (k.includes("hold") || k.includes("issue")) return "bg-amber-100 text-amber-700 border-amber-200";
  if (k.includes("decommission")) return "bg-slate-100 text-slate-600 border-slate-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

/* Preferred column order + human labels. Any additional key found on the
 * rows is appended in first-seen order so custom Site Master fields flow
 * through automatically. */
const PLANT_PREFERRED_COLS = [
  ["site_name",             "Plant"],
  ["site_code",             "Code"],
  ["asset_id",              "Asset ID"],
  ["region",                "Region"],
  ["state",                 "State"],
  ["district",              "District"],
  ["site_status",           "Status"],
  ["ac_capacity",           "AC Capacity"],
  ["dc_capacity",           "DC Capacity"],
  ["vendor_name",           "Vendor"],
  ["cluster_manager_name",  "Cluster Mgr"],
  ["approver_email",        "Approver"],
  ["cycles_per_month",      "Cleaning /mo"],
  ["pm_cycles_per_quarter", "PM /qtr"],
  ["commission_date",       "Commissioned"],
];

function PlantsTable({ rows }) {
  const cols = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const [k, l] of PLANT_PREFERRED_COLS) {
      // include only if at least one row has a non-empty value for it
      if (rows.some((r) => r[k] !== undefined && r[k] !== null && r[k] !== "")) {
        out.push([k, l]);
        seen.add(k);
      }
    }
    // Append any custom fields present on the row objects
    for (const r of rows) {
      for (const k of Object.keys(r)) {
        if (seen.has(k)) continue;
        if (["_id", "site_id", "assigned_admin_ids", "assigned_vendor_ids",
             "assigned_vendor_user_ids", "created_at", "updated_at",
             "vendor_id", "vendor_email"].includes(k)) continue;
        if (r[k] === null || r[k] === undefined || r[k] === "") continue;
        out.push([k, prettify(k)]);
        seen.add(k);
      }
    }
    return out;
  }, [rows]);

  return (
    <Card className="rounded-2xl border-slate-100 card-soft bg-white overflow-hidden">
      <div className="max-h-[calc(100vh-260px)] overflow-auto nice-scroll">
        <table className="w-full text-sm" data-testid="plants-table">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 sticky top-0">
            <tr className="text-left">
              {cols.map(([k, l]) => (
                <th key={k} className="p-3 font-semibold whitespace-nowrap">{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr
                key={p.site_code || p.site_id}
                className="border-b border-slate-100 hover:bg-slate-50/60 cursor-pointer"
                data-testid={`plants-row-${p.site_code || p.site_id}`}
              >
                {cols.map(([k]) => (
                  <td key={k} className="p-3 align-top whitespace-nowrap">
                    {renderCell(p, k)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function renderCell(row, key) {
  const v = row[key];
  if (key === "site_name") {
    return (
      <Link
        to={`/plants/${encodeURIComponent(row.site_code || row.site_id)}`}
        className="font-medium text-slate-900 hover:text-blue-700"
      >{v || "—"}</Link>
    );
  }
  if (key === "site_code" || key === "asset_id") {
    return <span className="text-xs font-mono text-slate-500">{v || "—"}</span>;
  }
  if (key === "site_status") {
    return <Badge className={`${statusColor(v)} capitalize`}>{v || "—"}</Badge>;
  }
  if (Array.isArray(v)) return v.join(", ") || "—";
  if (typeof v === "object" && v !== null) return JSON.stringify(v);
  return v === null || v === undefined || v === "" ? <span className="text-slate-300">—</span> : String(v);
}

function prettify(k) {
  return String(k).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ----------------------------- DETAIL VIEW ------------------------------ */
function PlantDetail({ siteCode }) {
  const nav = useNavigate();
  const { user } = useAuth();
  const canEdit = user && (user.role === "super_admin" || user.role === "admin");
  const [data, setData] = useState(null);
  const [columns, setColumns] = useState([]);
  const [error, setError] = useState(null);
  const [editOpen, setEditOpen] = useState(false);

  const load = () => {
    Promise.all([
      api.get(`/sites/by-code/${encodeURIComponent(siteCode)}`),
      api.get("/sites/columns").catch(() => ({ data: [] })),
    ])
      .then(([site, cols]) => {
        setData(site.data);
        setColumns(cols.data || []);
      })
      .catch((e) => setError(getErrorMessage(e, "Plant not found")));
  };
  useEffect(load, [siteCode]);

  if (error) {
    return (
      <AppLayout>
        <div className="max-w-3xl mx-auto py-12 text-center">
          <p className="text-slate-500">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => nav("/plants")}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Plants
          </Button>
        </div>
      </AppLayout>
    );
  }
  if (!data) {
    return <AppLayout><div className="p-8 text-slate-400">Loading…</div></AppLayout>;
  }
  const p = data.site || {};
  const subs = data.recent_submissions || [];

  // Group columns into curated sections; any remaining custom columns
  // (added later via Site Management) land in "Additional details".
  const SECTIONS = [
    { title: "Capacity", icon: <Zap className="w-4 h-4" />,
      keys: ["ac_capacity", "dc_capacity", "inverter_capacity"] },
    { title: "Location", icon: <MapPin className="w-4 h-4" />,
      keys: ["state", "district", "location", "latitude", "longitude"] },
    { title: "Vendor & customer", icon: <Building2 className="w-4 h-4" />,
      keys: ["vendor_name", "vendor_email", "vendor_login_user", "customer_name",
             "cluster", "cluster_manager_name"] },
    { title: "Approver", icon: <Mail className="w-4 h-4" />,
      keys: ["approver_email"] },
    { title: "Timeline", icon: <Calendar className="w-4 h-4" />,
      keys: ["commission_date", "om_start_date", "warranty_end_date"] },
  ];
  const skip = new Set([
    "site_id", "site_name", "site_code", "asset_id", "plant_name",
    "site_status", "region", "created_at", "updated_at", "_id",
    "assigned_admin_ids", "assigned_vendor_ids", "is_deleted",
  ]);
  const knownKeys = new Set(SECTIONS.flatMap((s) => s.keys));
  const labelsByKey = Object.fromEntries((columns || []).map((c) => [c.key, c.label]));
  const extras = Object.keys(p)
    .filter((k) => !skip.has(k) && !knownKeys.has(k))
    .filter((k) => p[k] !== null && p[k] !== undefined && p[k] !== "");
  const humanize = (k) => labelsByKey[k] || k.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

  return (
    <AppLayout>
      <div className="max-w-6xl">
        <div className="flex items-center justify-between mb-3">
          <Button
            data-testid="plant-back"
            variant="ghost" size="sm" onClick={() => nav("/plants")}
            className="-ml-2 text-slate-500"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Plants
          </Button>
          {canEdit && (
            <Button
              data-testid="plant-edit-btn"
              variant="outline" size="sm"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="w-4 h-4 mr-1.5" /> Edit plant
            </Button>
          )}
        </div>

        {/* Hero card */}
        <Card className="rounded-2xl border-slate-100 card-soft bg-gradient-to-br from-white via-slate-50 to-blue-50/40 p-6 mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.1em] text-blue-600 font-bold mb-1">
                {p.plant_name || "Solar plant"}
              </div>
              <h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight text-slate-900">
                {p.site_name || "Untitled site"}
              </h1>
              <div className="text-sm text-slate-500 mt-1 font-mono">
                {p.site_code || p.asset_id}
              </div>
            </div>
            <Badge className={`${statusColor(p.site_status)} capitalize text-xs`}>
              {p.site_status || "—"}
            </Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <HeroStat label="AC Capacity" value={p.ac_capacity ? `${p.ac_capacity} MW` : "—"} />
            <HeroStat label="DC Capacity" value={p.dc_capacity ? `${p.dc_capacity} MW` : "—"} />
            <HeroStat label="Inverter" value={p.inverter_capacity ? `${p.inverter_capacity} MW` : "—"} />
            <HeroStat label="Region" value={p.region || "—"} />
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {SECTIONS.map((s) => {
            const rows = s.keys
              .filter((k) => p[k] !== undefined)
              .map((k) => ({
                key: k,
                label: labelsByKey[k] || humanize(k),
                value: p[k],
                mono: k === "approver_email" || k === "vendor_email",
              }));
            if (rows.length === 0) return null;
            return (
              <Section key={s.title} title={s.title} icon={s.icon}>
                {rows.map((r) => <Row key={r.key} label={r.label} value={r.value} monospace={r.mono} />)}
              </Section>
            );
          })}
          {extras.length > 0 && (
            <Section title="Additional details" icon={<FileText className="w-4 h-4" />}>
              {extras.map((k) => (
                <Row key={k} label={humanize(k)} value={renderMaybe(p[k])} />
              ))}
            </Section>
          )}
        </div>

        {/* Recent submissions */}
        <Card className="rounded-2xl border-slate-100 card-soft bg-white">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <div className="font-heading font-semibold text-slate-900">Recent submissions</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Submissions that mention this plant (form / PDF)
              </div>
            </div>
            <Link to="/submissions" className="text-xs text-blue-600 hover:underline">
              Open Submissions Hub <ExternalLink className="w-3 h-3 inline" />
            </Link>
          </div>
          {subs.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              No submissions reference this plant yet.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto nice-scroll">
              {subs.map((s) => (
                <li key={s.submission_id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                  <div className="flex items-center gap-3 min-w-0">
                    {s.kind === "pdf" ? (
                      <FileType2 className="w-4 h-4 text-violet-500 shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">
                        {s.submission_id}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatDate(s.created_at)} · {s.status}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Documents vault */}
        <PlantDocumentsCard siteId={p.site_id} />

        {/* Edit history timeline */}
        <PlantEditHistory siteCode={siteCode} />
      </div>

      {editOpen && (
        <EditPlantDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          site={p}
          columns={columns}
          onSaved={() => { setEditOpen(false); load(); }}
          onColumnsChanged={(cols) => setColumns(cols)}
        />
      )}
    </AppLayout>
  );
}

/* --------------------------- Edit history timeline --------------------- */
function PlantEditHistory({ siteCode }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({}); // snapshot_id -> bool

  useEffect(() => {
    let cancelled = false;
    api.get(`/sites/by-code/${encodeURIComponent(siteCode)}/history`)
      .then((r) => { if (!cancelled) setRows(r.data?.history || []); })
      .catch((e) => { if (!cancelled) setError(getErrorMessage(e, "Failed to load history")); });
    return () => { cancelled = true; };
  }, [siteCode]);

  const humanize = (k) => k.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  const short = (v) => {
    if (v === null || v === undefined || v === "") return "—";
    if (Array.isArray(v)) return v.join(", ");
    if (typeof v === "object") return JSON.stringify(v);
    const s = String(v);
    return s.length > 60 ? s.slice(0, 57) + "…" : s;
  };

  return (
    <Card className="rounded-2xl border-slate-100 card-soft bg-white mt-4" data-testid="plant-history-card">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-slate-500" />
          <div>
            <div className="font-heading font-semibold text-slate-900">Edit history</div>
            <div className="text-xs text-slate-500 mt-0.5">
              Who changed what, and when
            </div>
          </div>
        </div>
        {rows && (
          <Badge variant="outline" className="text-xs" data-testid="plant-history-count">
            {rows.length} {rows.length === 1 ? "edit" : "edits"}
          </Badge>
        )}
      </div>
      {error ? (
        <div className="p-6 text-sm text-slate-400">{error}</div>
      ) : rows === null ? (
        <div className="p-6 text-sm text-slate-400">Loading history…</div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-400">
          No edits yet — this plant hasn&apos;t been modified since it was imported.
        </div>
      ) : (
        <ol className="divide-y divide-slate-100" data-testid="plant-history-list">
          {rows.map((r) => {
            const isOpen = !!expanded[r.snapshot_id];
            return (
              <li key={r.snapshot_id} className="p-4 hover:bg-slate-50">
                <button
                  type="button"
                  onClick={() => setExpanded((s) => ({ ...s, [r.snapshot_id]: !isOpen }))}
                  className="w-full flex items-start gap-3 text-left"
                  data-testid={`plant-history-row-${r.snapshot_id}`}
                >
                  <div className="mt-0.5">
                    {isOpen
                      ? <ChevronDown className="w-4 h-4 text-slate-400" />
                      : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-sm font-medium text-slate-800 truncate">
                        {r.saved_by_name || r.saved_by_email || "Unknown user"}
                      </span>
                      <span className="text-xs text-slate-500">
                        {r.change_count === 0
                          ? "no field changes"
                          : `${r.change_count} field${r.change_count === 1 ? "" : "s"} changed`}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      v{r.version} → v{r.version + 1} · {formatDate(r.saved_at)}
                    </div>
                  </div>
                </button>
                {isOpen && r.changes && r.changes.length > 0 && (
                  <div className="mt-3 ml-7 space-y-2">
                    {r.changes.map((c, i) => (
                      <div
                        key={`${r.snapshot_id}-${c.field}-${i}`}
                        className="text-xs bg-slate-50 rounded-md p-2 border border-slate-100"
                        data-testid="plant-history-change"
                      >
                        <div className="font-medium text-slate-700 mb-1">{humanize(c.field)}</div>
                        <div className="flex items-center gap-2 text-slate-600">
                          <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 line-through decoration-red-300">
                            {short(c.from)}
                          </span>
                          <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                            {short(c.to)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

function renderMaybe(v) {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/* --------------------------- Edit Plant dialog --------------------------- */
function EditPlantDialog({ open, onOpenChange, site, columns, onSaved, onColumnsChanged }) {
  const humanize = (k) => k.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  const SKIP = new Set(["site_id", "created_at", "updated_at", "_id",
    "assigned_admin_ids", "assigned_vendor_ids", "is_deleted", "version",
    "updated_by",
  ]);
  const editable = (columns || []).filter((c) => !SKIP.has(c.key));
  const [form, setForm] = useState(() =>
    Object.fromEntries(editable.map((c) => [c.key, site[c.key] ?? ""])),
  );
  const [newColLabel, setNewColLabel] = useState("");
  const [addingCol, setAddingCol] = useState(false);
  const [saving, setSaving] = useState(false);

  const addColumn = async () => {
    const label = newColLabel.trim();
    if (!label) { toast.error("Column label required"); return; }
    setAddingCol(true);
    try {
      await api.post("/sites/columns", { label });
      const cols = (await api.get("/sites/columns")).data || [];
      onColumnsChanged(cols);
      const newKey = cols.find((c) => c.label === label)?.key;
      if (newKey) setForm((f) => ({ ...f, [newKey]: "" }));
      setNewColLabel("");
      toast.success(`Column "${label}" added`);
    } catch (e) { toast.error(getErrorMessage(e, "Failed to add column")); }
    finally { setAddingCol(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      // Only send fields that changed
      const patch = {};
      for (const [k, v] of Object.entries(form)) {
        if ((site[k] ?? "") !== v) patch[k] = v;
      }
      if (Object.keys(patch).length === 0) {
        toast.info("Nothing to save");
        setSaving(false);
        return;
      }
      await api.put(`/sites/by-code/${encodeURIComponent(site.site_code)}`, patch);
      toast.success("Plant updated");
      onSaved();
    } catch (e) { toast.error(getErrorMessage(e, "Update failed")); }
    finally { setSaving(false); }
  };

  // group columns like the read view so the editor looks familiar
  const GROUPS = [
    { title: "Identity",  keys: ["site_name", "site_code", "asset_id", "plant_name",
      "customer_name", "site_status", "region"] },
    { title: "Capacity",  keys: ["ac_capacity", "dc_capacity", "inverter_capacity"] },
    { title: "Location",  keys: ["state", "district", "location", "latitude", "longitude"] },
    { title: "Vendor",    keys: ["vendor_name", "vendor_email", "vendor_login_user",
      "cluster", "cluster_manager_name"] },
    { title: "Approver",  keys: ["approver_email"] },
    { title: "Timeline",  keys: ["commission_date", "om_start_date", "warranty_end_date"] },
    { title: "Notes",     keys: ["remarks"] },
  ];
  const known = new Set(GROUPS.flatMap((g) => g.keys));
  const custom = editable.filter((c) => !known.has(c.key));
  if (custom.length) GROUPS.push({ title: "Custom", keys: custom.map((c) => c.key) });

  const labelFor = (k) => (columns.find((c) => c.key === k)?.label) || humanize(k);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit plant · {site.site_name}</DialogTitle>
          <DialogDescription>
            Fields come from Site Management. Add a new column below and it will
            appear here plus in the plant view read layout.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto nice-scroll pr-1 space-y-5">
          {GROUPS.map((g) => {
            const keys = g.keys.filter((k) => editable.some((c) => c.key === k));
            if (keys.length === 0) return null;
            return (
              <div key={g.title}>
                <div className="text-[10px] uppercase tracking-[0.12em] font-bold text-slate-400 pb-2">
                  {g.title}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {keys.map((k) => (
                    <div key={k}>
                      <Label className="text-xs">{labelFor(k)}</Label>
                      <Input
                        data-testid={`edit-plant-${k}`}
                        value={form[k] ?? ""}
                        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="border-t border-slate-100 pt-4">
            <div className="text-[10px] uppercase tracking-[0.12em] font-bold text-slate-400 pb-2">
              Add a new column to Site Master
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label className="text-xs">Column label</Label>
                <Input
                  data-testid="new-column-label"
                  value={newColLabel}
                  onChange={(e) => setNewColLabel(e.target.value)}
                  placeholder="e.g. Insurance expiry"
                  className="mt-1"
                />
              </div>
              <Button
                data-testid="new-column-add"
                variant="outline"
                onClick={addColumn}
                disabled={addingCol || !newColLabel.trim()}
              >
                <Plus className="w-4 h-4 mr-1.5" />
                {addingCol ? "Adding…" : "Add column"}
              </Button>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Added columns become fields for every plant in Site Management.
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            data-testid="edit-plant-save"
            className="bg-blue-600 hover:bg-blue-700"
            onClick={save}
            disabled={saving}
          >
            <Save className="w-4 h-4 mr-1.5" />
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HeroStat({ label, value }) {
  return (
    <div className="bg-white rounded-xl p-3 border border-slate-100">
      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{label}</div>
      <div className="text-lg font-heading font-bold text-slate-900 mt-1">{value}</div>
    </div>
  );
}

function Section({ title, icon, children }) {
  return (
    <Card className="rounded-2xl border-slate-100 card-soft bg-white p-5">
      <div className="flex items-center gap-2 pb-3 border-b border-slate-100 mb-3 text-slate-700 font-semibold">
        {icon}<span>{title}</span>
      </div>
      <div className="space-y-2 text-sm">{children}</div>
    </Card>
  );
}

function Row({ label, value, monospace }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="text-slate-500">{label}</div>
      <div className={`text-slate-800 ${monospace ? "font-mono text-xs" : ""}`}>
        {value || "—"}
      </div>
    </div>
  );
}


/* -----------------------------------------------------------------------
   PlantDocumentsCard — per-plant document vault. Admin & super_admin can
   create/upload/delete; other roles get read-only.  Wire-format matches
   /app/backend/plant_docs_routes.py.
   ----------------------------------------------------------------------- */
function PlantDocumentsCard({ siteId }) {
  const { user: me } = useAuth();
  const canEdit = me?.role === "super_admin" || me?.role === "admin";
  const [folders, setFolders] = useState([]);
  const [openFolder, setOpenFolder] = useState(null);
  const [files, setFiles] = useState([]);
  const [newFolder, setNewFolder] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [renameFor, setRenameFor] = useState(null);   // folder name being edited
  const [renameDraft, setRenameDraft] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [viewFile, setViewFile] = useState(null);      // { name } or null

  const load = () => {
    api.get(`/plants/${siteId}/folders`)
      .then((r) => setFolders(r.data.folders || []))
      .catch(() => setFolders([]));
  };
  useEffect(() => { if (siteId) load(); }, [siteId]);

  const loadFiles = (name) => {
    setOpenFolder(name);
    api.get(`/plants/${siteId}/folders/${encodeURIComponent(name)}/files`)
      .then((r) => setFiles(r.data.files || []))
      .catch(() => setFiles([]));
  };

  const addFolder = async () => {
    const name = newFolder.trim();
    if (!name) return;
    setBusy(true);
    try {
      await api.post(`/plants/${siteId}/folders`, { name });
      setNewFolder("");
      setCreating(false);
      load();
      toast.success(`Folder "${name}" created`);
    } catch (e) { toast.error(getErrorMessage(e, "Create failed")); }
    finally { setBusy(false); }
  };

  const removeFolder = async (name) => {
    if (!window.confirm(`Delete folder "${name}" and everything inside?`)) return;
    try {
      await api.delete(`/plants/${siteId}/folders/${encodeURIComponent(name)}`);
      if (openFolder === name) { setOpenFolder(null); setFiles([]); }
      load();
      toast.success(`Folder "${name}" deleted`);
    } catch (e) { toast.error(getErrorMessage(e, "Delete failed")); }
  };

  const startRename = (name) => {
    setRenameFor(name);
    setRenameDraft(name);
  };
  const cancelRename = () => {
    setRenameFor(null);
    setRenameDraft("");
  };
  const commitRename = async () => {
    const oldName = renameFor;
    const newName = renameDraft.trim();
    if (!oldName || !newName || oldName === newName) { cancelRename(); return; }
    try {
      await api.patch(
        `/plants/${siteId}/folders/${encodeURIComponent(oldName)}`,
        { name: newName },
      );
      if (openFolder === oldName) setOpenFolder(newName);
      cancelRename();
      load();
      toast.success(`Renamed to "${newName}"`);
    } catch (e) { toast.error(getErrorMessage(e, "Rename failed")); }
  };

  const downloadFolderZip = async (name) => {
    try {
      const r = await api.get(
        `/plants/${siteId}/folders/${encodeURIComponent(name)}/download`,
        { responseType: "blob" },
      );
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url; a.download = `${name}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(getErrorMessage(e, "Download failed")); }
  };

  /**
   * Upload one or more files.  Accepts either an <input> change event OR a
   * plain FileList (from the drag-and-drop drop handler).  Uploads run
   * serially so the toast counts stay accurate and the server is never hit
   * with a stampede of parallel writes.
   */
  const uploadFiles = async (fileListOrEvent) => {
    const list = fileListOrEvent?.target
      ? fileListOrEvent.target.files
      : fileListOrEvent;
    if (fileListOrEvent?.target) fileListOrEvent.target.value = "";
    if (!list || list.length === 0 || !openFolder) return;
    setBusy(true);
    let ok = 0, fail = 0;
    for (const file of Array.from(list)) {
      const fd = new FormData();
      fd.append("file", file);
      try {
        await api.post(
          `/plants/${siteId}/folders/${encodeURIComponent(openFolder)}/upload`,
          fd, { headers: { "Content-Type": "multipart/form-data" } },
        );
        ok++;
      } catch (e) {
        fail++;
        toast.error(`${file.name}: ${getErrorMessage(e, "Upload failed")}`);
      }
    }
    if (ok) toast.success(`Uploaded ${ok} file${ok === 1 ? "" : "s"}${fail ? ` (${fail} failed)` : ""}`);
    loadFiles(openFolder);
    load();
    setBusy(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!canEdit || !openFolder) return;
    if (e.dataTransfer?.files?.length) uploadFiles(e.dataTransfer.files);
  };
  const onDragOver = (e) => {
    if (!canEdit || !openFolder) return;
    e.preventDefault();
    if (!isDragOver) setIsDragOver(true);
  };
  const onDragLeave = (e) => {
    // Only clear when leaving the drop container itself (not children).
    if (e.currentTarget === e.target) setIsDragOver(false);
  };

  const removeFile = async (name) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    try {
      await api.delete(
        `/plants/${siteId}/folders/${encodeURIComponent(openFolder)}/files/${encodeURIComponent(name)}`,
      );
      loadFiles(openFolder);
      load();
    } catch (e) { toast.error(getErrorMessage(e, "Delete failed")); }
  };

  const downloadUrl = (name) => {
    const token = localStorage.getItem("ff_token") || "";
    return `${api.defaults.baseURL}/plants/${siteId}/folders/${encodeURIComponent(openFolder)}/files/${encodeURIComponent(name)}?_t=${token}`;
  };

  const download = async (name) => {
    // Use axios so the Authorization header is sent; then trigger a save.
    try {
      const r = await api.get(
        `/plants/${siteId}/folders/${encodeURIComponent(openFolder)}/files/${encodeURIComponent(name)}`,
        { responseType: "blob" },
      );
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(getErrorMessage(e, "Download failed")); }
    void downloadUrl;
  };

  return (
    <Card className="rounded-2xl border-slate-100 card-soft bg-white mt-4"
          data-testid="plant-documents-card">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <div>
          <div className="font-heading font-semibold text-slate-900 flex items-center gap-2">
            <Folder className="w-4 h-4 text-blue-500" />
            Documents
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {canEdit
              ? "Organise contracts, certifications and photos per plant. Admin-only."
              : "Read-only view of documents uploaded by your admin."}
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-1.5">
            {!creating ? (
              <Button size="sm" variant="outline" data-testid="plant-doc-new-folder"
                      onClick={() => setCreating(true)}>
                <FolderPlus className="w-3.5 h-3.5 mr-1" /> New folder
              </Button>
            ) : (
              <div className="flex items-center gap-1">
                <Input value={newFolder} onChange={(e) => setNewFolder(e.target.value)}
                       placeholder="Folder name" className="h-8 text-xs w-40"
                       data-testid="plant-doc-folder-input"
                       onKeyDown={(e) => e.key === "Enter" && addFolder()} />
                <Button size="sm" onClick={addFolder} disabled={busy}
                        data-testid="plant-doc-folder-save"
                        className="bg-blue-600 hover:bg-blue-700">Add</Button>
                <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewFolder(""); }}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3">
        {/* Folders column */}
        <div className="lg:col-span-1 lg:border-r border-slate-100 p-3 min-h-[220px] max-h-[520px] overflow-y-auto nice-scroll">
          {folders.length === 0 ? (
            <div className="text-xs text-slate-400 text-center py-8">
              No folders yet.
            </div>
          ) : folders.map((f) => (
            <div
              key={f.name}
              className={`group px-2.5 py-2 rounded-lg flex items-center gap-2 text-sm ${
                openFolder === f.name ? "bg-blue-50 text-blue-900" : "hover:bg-slate-50 text-slate-700"
              }`}
              data-testid={`plant-doc-folder-${f.name}`}
            >
              {renameFor === f.name ? (
                <>
                  <Folder className="w-4 h-4 shrink-0 text-slate-400" />
                  <Input
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    autoFocus
                    className="h-7 text-xs flex-1"
                    data-testid={`plant-doc-folder-rename-input-${f.name}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") cancelRename();
                    }}
                  />
                  <button onClick={commitRename}
                          className="text-emerald-600 hover:text-emerald-700"
                          data-testid={`plant-doc-folder-rename-save-${f.name}`}
                          title="Save">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={cancelRename}
                          className="text-slate-400 hover:text-slate-600"
                          title="Cancel">
                    <X className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => loadFiles(f.name)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <Folder className="w-4 h-4 shrink-0 text-slate-400" />
                    <span className="flex-1 truncate">{f.name}</span>
                    <span className="text-[10px] text-slate-400">{f.file_count}</span>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); downloadFolderZip(f.name); }}
                    className="text-slate-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Download folder as .zip"
                    data-testid={`plant-doc-folder-dl-${f.name}`}
                  >
                    <FolderArchive className="w-3.5 h-3.5" />
                  </button>
                  {canEdit && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); startRename(f.name); }}
                        className="text-slate-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Rename"
                        data-testid={`plant-doc-folder-rename-${f.name}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFolder(f.name); }}
                        className="text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete folder"
                        data-testid={`plant-doc-folder-del-${f.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
        {/* Files column */}
        <div className="lg:col-span-2 p-3 min-h-[220px] max-h-[520px] overflow-y-auto nice-scroll">
          {!openFolder ? (
            <div className="text-xs text-slate-400 text-center py-8">
              Select a folder to see its files.
            </div>
          ) : (
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              className={`rounded-lg transition-colors ${
                isDragOver && canEdit
                  ? "bg-blue-50/70 ring-2 ring-blue-400 ring-dashed"
                  : ""
              }`}
              data-testid="plant-doc-drop-zone"
            >
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  {openFolder}
                  {isDragOver && canEdit && (
                    <span className="text-xs text-blue-600 font-medium animate-pulse">
                      · Drop to upload
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" className="h-7 text-xs"
                          onClick={() => downloadFolderZip(openFolder)}
                          data-testid="plant-doc-folder-dl-current"
                          title="Download this folder as .zip">
                    <FolderArchive className="w-3.5 h-3.5 mr-1" /> Zip
                  </Button>
                  {canEdit && (
                    <label className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
                                      bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
                           data-testid="plant-doc-upload-btn">
                      <Upload className="w-3.5 h-3.5" />
                      {busy ? "Uploading…" : "Upload files"}
                      <input type="file" className="hidden" onChange={uploadFiles}
                             disabled={busy} multiple />
                    </label>
                  )}
                </div>
              </div>
              {files.length === 0 ? (
                <div className={`text-xs text-center py-8 rounded-lg border border-dashed ${
                  canEdit ? "border-slate-200 text-slate-500" : "border-slate-100 text-slate-400"
                }`}>
                  {canEdit
                    ? "This folder is empty — drag & drop files here or use \"Upload files\"."
                    : "This folder is empty."}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                  {files.map((f) => (
                    <div key={f.name} className="flex items-center gap-2 p-2 hover:bg-slate-50">
                      <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => setViewFile({ name: f.name })}
                          className="text-sm text-left truncate w-full hover:text-blue-700 hover:underline"
                          title="Open preview"
                          data-testid={`plant-doc-file-open-${f.name}`}
                        >
                          {f.name}
                        </button>
                        <div className="text-[10px] text-slate-400">
                          {formatBytes(f.size_bytes)} · {formatDate(f.modified_at)}
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                              onClick={() => setViewFile({ name: f.name })}
                              data-testid={`plant-doc-file-view-${f.name}`}
                              title="Open in viewer">
                        <Eye className="w-3.5 h-3.5 text-slate-600" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                              onClick={() => download(f.name)}
                              data-testid={`plant-doc-file-dl-${f.name}`}
                              title="Download">
                        <Download className="w-3.5 h-3.5 text-slate-600" />
                      </Button>
                      {canEdit && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                                onClick={() => removeFile(f.name)}
                                data-testid={`plant-doc-file-del-${f.name}`}
                                title="Delete">
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <DocFileViewer
        open={!!viewFile}
        onClose={() => setViewFile(null)}
        fetchUrl={viewFile && openFolder
          ? `/plants/${siteId}/folders/${encodeURIComponent(openFolder)}/files/${encodeURIComponent(viewFile.name)}`
          : null}
        fileName={viewFile?.name || ""}
      />
    </Card>
  );
}

function formatBytes(n) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}
