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
} from "lucide-react";
import { formatDate } from "@/lib/utils2";

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
          </div>
        </Card>

        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center bg-white rounded-2xl border border-dashed border-slate-200">
            <MapPin className="w-12 h-12 mx-auto text-slate-300" />
            <p className="text-sm text-slate-500 mt-3">No plants available for your access scope.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((p) => <PlantCard key={p.site_code || p.site_id} plant={p} />)}
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
            <ul className="divide-y divide-slate-100">
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
