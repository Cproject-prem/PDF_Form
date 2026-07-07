import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { api, getErrorMessage } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Search, MapPin, Zap, Building2, User as UserIcon, Mail, Calendar,
  ArrowLeft, ExternalLink, FileText, FileType2,
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
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/sites/by-code/${encodeURIComponent(siteCode)}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(getErrorMessage(e, "Plant not found")));
  }, [siteCode]);

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

  return (
    <AppLayout>
      <div className="max-w-6xl">
        <Button
          data-testid="plant-back"
          variant="ghost" size="sm" onClick={() => nav("/plants")}
          className="mb-3 -ml-2 text-slate-500"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Plants
        </Button>

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
          <Section title="Location" icon={<MapPin className="w-4 h-4" />}>
            <Row label="State"     value={p.state} />
            <Row label="District"  value={p.district} />
            <Row label="Location"  value={p.location} />
            <Row label="Latitude"  value={p.latitude} />
            <Row label="Longitude" value={p.longitude} />
          </Section>
          <Section title="Vendor & customer" icon={<Building2 className="w-4 h-4" />}>
            <Row label="Vendor" value={p.vendor_name} />
            <Row label="Vendor email" value={p.vendor_email} />
            <Row label="Customer" value={p.customer_name} />
            <Row label="Cluster" value={p.cluster} />
            <Row label="Cluster manager" value={p.cluster_manager_name} />
          </Section>
          <Section title="Approver" icon={<Mail className="w-4 h-4" />}>
            <Row label="Approver email" value={p.approver_email} monospace />
          </Section>
          <Section title="Timeline" icon={<Calendar className="w-4 h-4" />}>
            <Row label="Commissioned" value={p.commission_date} />
            <Row label="O&M start" value={p.om_start_date} />
            <Row label="Warranty end" value={p.warranty_end_date} />
          </Section>
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
    </AppLayout>
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
