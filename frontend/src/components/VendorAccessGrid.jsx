import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Users, Check } from "lucide-react";
import { toast } from "sonner";

/**
 * Vendor-access grid — used inside Share dialogs on both FormBuilder and
 * PdfBuilder. Loads /api/vendors, shows a checkbox grid, and PATCHes the
 * form / PDF template's `assigned_vendor_ids` array so vendor-tier users
 * can see and submit that form.
 *
 * Props:
 *   resource:  "form" | "pdf-form"
 *   resourceId: form_id or template_id
 *   value:     current array of vendor_ids
 *   onChange:  (newArray) => void          (parent updates its own state)
 */
export default function VendorAccessGrid({ resource, resourceId, value, onChange }) {
  const [vendors, setVendors] = useState(null);
  const [saving, setSaving] = useState(false);
  const selected = new Set(value || []);

  useEffect(() => {
    api.get("/vendors").then((r) => setVendors(r.data || []))
       .catch(() => setVendors([]));
  }, []);

  const toggle = async (vendorId) => {
    const next = new Set(selected);
    if (next.has(vendorId)) next.delete(vendorId); else next.add(vendorId);
    const arr = Array.from(next);
    setSaving(true);
    try {
      const path = resource === "pdf-form"
        ? `/pdf-forms/${resourceId}`
        : `/forms/${resourceId}`;
      await api.patch(path, { assigned_vendor_ids: arr });
      onChange?.(arr);
      toast.success("Access updated");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not update access");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-2" data-testid="vendor-access-grid">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Users className="w-3.5 h-3.5" />
        <span>Vendors with access to this {resource === "pdf-form" ? "PDF" : "form"}</span>
      </div>
      {vendors === null ? (
        <div className="text-xs text-slate-400 py-2">Loading vendors…</div>
      ) : vendors.length === 0 ? (
        <div className="text-xs text-slate-400 py-2">
          No vendors yet — create one from the Vendors page first.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-1 max-h-52 overflow-y-auto pr-1 nice-scroll">
          {vendors.map((v) => {
            const on = selected.has(v.vendor_id);
            return (
              <button
                key={v.vendor_id}
                type="button"
                disabled={saving}
                data-testid={`vendor-access-toggle-${v.vendor_id}`}
                onClick={() => toggle(v.vendor_id)}
                className={`flex items-center justify-between text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                  on
                    ? "border-blue-500 bg-blue-50 text-blue-800"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{v.vendor_name}</div>
                  <div className="text-[10px] text-slate-500 truncate">{v.vendor_id}</div>
                </div>
                {on && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-slate-400 leading-tight">
        Selected vendors&apos; users will see this {resource === "pdf-form" ? "PDF form" : "form"} in
        their sidebar and be able to submit it. Deselect to revoke access.
      </p>
    </div>
  );
}
