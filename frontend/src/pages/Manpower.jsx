/**
 * Manpower Portal (read-only mirror of the external `cmes_mp_db`).
 *
 * Layout requested by product:
 *   • Table with the Manpower ID on the LEFT and the person's photo
 *     rendered on the RIGHT of that ID cell.
 *   • Clicking a row opens a full-details dialog (expiry dates, documents,
 *     approval history, all the raw fields from the upstream doc).
 *
 * The whole page is read-only.  The upstream Manpower Portal remains the
 * sole editor.
 */
import React, { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { api } from "@/lib/api";
import { SearchableDropdown } from "@/components/ui/SearchableDropdown";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, Users2, MapPin, Building2, RefreshCw, X, User as UserIcon } from "lucide-react";
import { formatDate } from "@/lib/utils2";

const API_BASE = process.env.REACT_APP_BACKEND_URL + "/api";

export default function Manpower() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ states: [], locations: [], companies: [] });
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [location, setLocation] = useState("");
  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [selected, setSelected] = useState(null);

  const load = async (isRefresh = false) => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search) q.set("search", search);
      if (state) q.set("state", state);
      if (location) q.set("location", location);
      if (company) q.set("company", company);
      if (isRefresh) q.set("_t", Date.now().toString());
      const r = await api.get(`/manpower?${q.toString()}`);
      setRows(r.data.items || []);
      setEnabled(r.data.enabled !== false);
      return r.data.items || [];
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load manpower");
      return [];
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    try {
      await Promise.all([load(true), loadFilters()]);
      toast.success("Manpower data refreshed live from DB");
    } catch {
      toast.error("Failed to refresh manpower data");
    } finally {
      setLoading(false);
    }
  };

  const loadFilters = async () => {
    try {
      const r = await api.get(`/manpower/filters?_t=${Date.now()}`);
      setFilters(r.data);
    } catch { /* silent */ }
  };

  useEffect(() => { loadFilters(); /* one-time */ }, []);
  // Reload whenever filters change (debounced by the button-click and select-change model).
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [state, location, company]);
  // Search on Enter or debounced 400ms
  useEffect(() => {
    const t = setTimeout(() => load(), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [search]);

  const clearFilters = () => { setSearch(""); setState(""); setLocation(""); setCompany(""); };

  // Auth-aware photo URL — attach the JWT via query string so <img src=...>
  // renders directly (browsers don't forward Authorization headers to <img>).
  const photoUrl = (mp) => {
    if (!mp?.has_photo) return null;
    const t = localStorage.getItem("ff_token") || localStorage.getItem("token") || "";
    return `${API_BASE}/manpower/${encodeURIComponent(mp.manpower_id)}/photo?_=${t}`;
  };

  const badge = (status) => {
    const s = (status || "").toLowerCase();
    const cls = s === "active"
      ? "bg-emerald-100 text-emerald-700"
      : s === "inactive" || s === "disabled"
      ? "bg-slate-200 text-slate-600"
      : s === "pending"
      ? "bg-amber-100 text-amber-700"
      : "bg-blue-100 text-blue-700";
    return (
      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
        {status || "—"}
      </span>
    );
  };

  const getEligibility = (mp) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expired = [];

    const isExpired = (dateStr) => {
      if (!dateStr) return true; // Missing is treated as expired
      const d = new Date(dateStr);
      return d < today;
    };

    if (isExpired(mp.medical_expiry_date)) expired.push("Medical");
    if (isExpired(mp.safety_belt_expiry_date)) expired.push("Safety Belt");
    if (isExpired(mp.height_work_expiry_date)) expired.push("Height Work");

    if (expired.length === 0) {
      return { status: "Eligible", remark: "" };
    } else {
      return { status: "Ineligible", remark: expired.join(", ") + " Expired" };
    }
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-heading font-semibold tracking-tight text-slate-900 flex items-center gap-2">
              <Users2 className="w-6 h-6 text-blue-600" />
              Manpower
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Live read-only view of the external Manpower Portal directory.
              Edits are made in the source portal.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="manpower-refresh"
                  disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh Data
          </Button>
        </div>

        {/* Not-configured banner */}
        {!enabled && !loading && (
          <Card className="p-4 mb-6 border-amber-300 bg-amber-50 text-amber-800 text-sm" data-testid="manpower-disabled-banner">
            <b>Manpower integration is disabled.</b> Set <code>MANPOWER_ENABLED=true</code> in
            <code> backend/.env</code> and configure <code>MANPOWER_DB_NAME</code> +
            <code> MANPOWER_PHOTO_ROOT</code> to enable it.
          </Card>
        )}

        {/* Filters */}
        <Card className="p-4 mb-4 rounded-2xl border-slate-100 card-soft" data-testid="manpower-filters">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input value={search}
                     onChange={(e) => setSearch(e.target.value)}
                     placeholder="Search by ID, name, designation, company, state, location…"
                     className="pl-9"
                     data-testid="manpower-search" />
            </div>
            <Filter label="State" value={state} onChange={setState}
                    options={filters.states} testid="manpower-filter-state" />
            <Filter label="Location" value={location} onChange={setLocation}
                    options={filters.locations} testid="manpower-filter-location" />
            <Filter label="Company" value={company} onChange={setCompany}
                    options={filters.companies} testid="manpower-filter-company" />
            {(search || state || location || company) && (
              <Button variant="ghost" size="sm" onClick={clearFilters}
                      data-testid="manpower-filters-clear">
                <X className="w-3.5 h-3.5 mr-1" /> Clear
              </Button>
            )}
            <div className="text-xs text-slate-500 ml-auto">
              {loading ? "Loading…" : `${rows.length} record${rows.length === 1 ? "" : "s"}`}
            </div>
          </div>
        </Card>

        {/* Table */}
        <Card className="rounded-2xl border-slate-100 card-soft overflow-hidden">
          <div className="max-h-[calc(100vh-260px)] overflow-auto nice-scroll">
            <table className="w-full text-sm" data-testid="manpower-table">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 w-[280px]">Manpower</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Designation</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Vendor ID</th>
                  <th className="px-4 py-3">Eligibility</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && (
                  <tr><td colSpan={8} className="text-center text-slate-400 py-10">Loading…</td></tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-slate-400 py-10">
                    No manpower records match your filters.
                  </td></tr>
                )}
                {!loading && rows.map((mp) => (
                  <tr key={mp.id || mp.manpower_id}
                      onClick={() => setSelected(mp.manpower_id)}
                      className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                      data-testid={`manpower-row-${mp.manpower_id}`}>
                    {/* Left cell: Manpower ID + Photo (side-by-side) */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-900 tabular-nums truncate">
                            {mp.manpower_id}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {mp.blood_group ? `Blood ${mp.blood_group}` : ""}
                          </div>
                        </div>
                        <ManpowerPhoto mp={mp} src={photoUrl(mp)} size={44} />
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {mp.full_name || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 truncate max-w-[160px]">
                      {mp.designation || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 truncate max-w-[180px]">
                      {mp.company_name || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {mp.location || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-mono text-xs">
                      {mp.vendor_id || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const eligibility = getEligibility(mp);
                        return (
                          <div className="flex flex-col gap-1">
                            <span className={`inline-block w-fit px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${eligibility.status === 'Eligible' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                              {eligibility.status}
                            </span>
                            {eligibility.remark && (
                              <span className="text-[10px] text-red-500 max-w-[120px] leading-tight font-medium">
                                {eligibility.remark}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">{badge(mp.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <ManpowerDetailDialog
        open={!!selected}
        manpowerId={selected}
        photoUrlBuilder={photoUrl}
        onClose={() => setSelected(null)}
      />
    </AppLayout>
  );
}

/* -------------------------------------------------------------------------- */
function Filter({ label, value, onChange, options, testid }) {
  const opts = [{ label: `All ${label}s`, value: "" }, ...(options || []).map((o) => ({ label: String(o), value: String(o) }))];
  return (
    <div className="w-44">
      <SearchableDropdown
        options={opts}
        value={value}
        onChange={onChange}
        placeholder={`All ${label}s`}
        className="h-9 text-xs"
        testId={testid}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
function ManpowerPhoto({ mp, src, size = 44 }) {
  const [errored, setErrored] = useState(false);
  const px = { width: size, height: size };
  if (!src || errored) {
    return (
      <div className="rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center shrink-0"
           style={px} title={mp?.full_name || mp?.manpower_id}>
        <UserIcon className="w-1/2 h-1/2" />
      </div>
    );
  }
  return (
    <img src={src} alt={mp.full_name || mp.manpower_id}
         className="rounded-lg object-cover shrink-0 border border-slate-200"
         style={px}
         onError={() => setErrored(true)} />
  );
}

/* -------------------------------------------------------------------------- */
function ManpowerDetailDialog({ open, manpowerId, photoUrlBuilder, onClose }) {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !manpowerId) { setDoc(null); return; }
    let alive = true;
    setLoading(true);
    api.get(`/manpower/${encodeURIComponent(manpowerId)}`)
       .then((r) => alive && setDoc(r.data))
       .catch(() => alive && setDoc(null))
       .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [open, manpowerId]);

  const kv = (label, value) => (
    <div className="flex items-start gap-2 text-sm py-1">
      <div className="w-40 shrink-0 text-slate-500">{label}</div>
      <div className="text-slate-800 break-words">{value || <span className="text-slate-300">—</span>}</div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] p-0 overflow-hidden flex flex-col bg-white"
                     data-testid="manpower-detail-dialog">
        {loading || !doc ? (
          <div className="p-8 text-center text-slate-400">Loading…</div>
        ) : (
          <>
            <div className="p-5 border-b border-slate-100 flex items-start gap-4">
              <ManpowerPhoto mp={{ has_photo: !!doc._photo, full_name: doc.full_name, manpower_id: doc.manpower_id }}
                             src={doc._photo ? photoUrlBuilder({ has_photo: true, manpower_id: doc.manpower_id }) : null}
                             size={96} />
              <div className="min-w-0 flex-1 pr-8">
                <div className="text-xs text-slate-500 tabular-nums">{doc.manpower_id}</div>
                <div className="text-xl font-semibold text-slate-900">{doc.full_name || "(no name)"}</div>
                <div className="text-sm text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center gap-1"><Building2 className="w-3 h-3" /> {doc.company_name || "—"}</span>
                  <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {doc.location || doc.city || "—"}</span>
                </div>
              </div>
            </div>

            <div className="p-5 overflow-y-auto nice-scroll grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
              {kv("Status", doc.status)}
              {kv("Designation", doc.designation)}
              {kv("Company", doc.company_name)}
              {kv("Work State", doc.work_state)}
              {kv("Location", doc.location)}
              {kv("City", doc.city)}
              {kv("Vendor ID", doc.vendor_id)}
              {kv("State (Home)", doc.state)}
              {kv("Phone", doc.phone)}
              {kv("Blood Group", doc.blood_group)}
              {kv("Subvendor", doc.subvendor)}
              {kv("Reporting Manager", doc.reporting_cluster_manager)}
              {kv("Manager Email", doc.reporting_manager_email)}
              {kv("Reference", doc.reference)}
              {kv("Postal Code", doc.postal_code)}
              {kv("Street", doc.street_address)}
              {kv("Renewal Pending", String(doc.renewal_pending || false))}
              {kv("Created At", doc.created_at && formatDate(doc.created_at))}
              {kv("Updated At", doc.updated_at && formatDate(doc.updated_at))}

              {/* Expiry dates */}
              <div className="md:col-span-2 mt-3 mb-1 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                Certifications & Expiry
              </div>
              {kv("Medical Test",        doc.medical_test_date && formatDate(doc.medical_test_date))}
              {kv("Medical Expiry",      doc.medical_expiry_date && formatDate(doc.medical_expiry_date))}
              {kv("Height Work Expiry",  doc.height_work_expiry_date && formatDate(doc.height_work_expiry_date))}
              {kv("Safety Belt Expiry",  doc.safety_belt_expiry_date && formatDate(doc.safety_belt_expiry_date))}
              {kv("Ext. Rope Expiry",    doc.extension_rope_expiry_date && formatDate(doc.extension_rope_expiry_date))}
              {kv("PPE Register Expiry", doc.ppe_register_expiry_date && formatDate(doc.ppe_register_expiry_date))}

              {/* Documents list */}
              <div className="md:col-span-2 mt-4">
                <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
                  Uploaded Documents ({(doc.documents || []).length})
                </div>
                {(doc.documents || []).length === 0 ? (
                  <div className="text-xs text-slate-400">No documents uploaded yet.</div>
                ) : (
                  <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                    {doc.documents.map((d) => (
                      <li key={d.id} className="p-2 flex items-center gap-2 text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-medium text-slate-800">{d.file_name}</div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {d.doc_type} · {formatDate(d.uploaded_at)} · by {d.uploaded_by_email}
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400">{Math.round((d.size || 0) / 1024)} KB</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
