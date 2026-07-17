import React, { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { api, getErrorMessage } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_LABELS, ROLES, formatDate } from "@/lib/utils2";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableHeader, TableHead, TableRow, TableBody, TableCell,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Plus, Trash2, Pencil, Copy, KeyRound, Mail as MailIcon, Search, Shuffle,
  ShieldCheck, ShieldX, Users as UsersIcon,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

/**
 * User Management page.
 *
 * Available to super_admin, admin, vendor_admin.  The backend scopes the
 * user list based on the actor's role (vendor_admin only sees their own
 * vendor).  Region and Cluster Manager values are pulled live from the
 * Sites collection so admins pick from the master data.
 */
export default function UsersPage() {
  const { user: me } = useAuth();
  const myRole = me?.role || "";
  const canApprove = myRole === "super_admin" || myRole === "admin";
  const [tab, setTab] = useState("users"); // "users" | "approvals"
  const [users, setUsers] = useState([]);
  const [regions, setRegions] = useState([]);
  const [clusterMgrs, setClusterMgrs] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [tempPasswordResult, setTempPasswordResult] = useState(null);

  const loadApprovals = () => {
    api.get("/admin-approvals", { params: { status: "pending" } })
      .then((r) => setPendingApprovals(r.data || []))
      .catch(() => setPendingApprovals([]));
  };

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get("/users"),
      api.get("/regions").catch(() => ({ data: [] })),
      api.get("/cluster-managers").catch(() => ({ data: [] })),
      api.get("/vendors").catch(() => ({ data: [] })),
    ])
      .then(([u, r, c, v]) => {
        setUsers(u.data || []);
        setRegions(r.data || []);
        setClusterMgrs(c.data || []);
        setVendors(v.data || []);
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); if (canApprove) loadApprovals(); }, [canApprove]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((u) =>
      [u.name, u.email, u.role, u.region, u.cluster_manager_name, u.vendor_id]
        .some((v) => (v || "").toLowerCase().includes(needle)),
    );
  }, [users, q]);

  const updateUser = async (u, patch) => {
    try {
      const resp = await api.patch(`/users/${u.user_id}`, patch);
      if (resp?.data?.pending_approval) {
        toast.info(resp.data.message || "Request submitted for admin approval");
      }
      load();
    } catch (e) { toast.error(getErrorMessage(e, "Update failed")); }
  };

  const del = async (u) => {
    if (!confirm(`Delete ${u.email}?`)) return;
    try {
      await api.delete(`/users/${u.user_id}`);
      toast.success("Deleted");
      load();
    } catch (e) { toast.error(getErrorMessage(e, "Delete failed")); }
  };

  const availableRoles = useMemo(() => {
    if (myRole === "super_admin") return ROLES;
    if (myRole === "admin") return ROLES.filter((r) => r !== "super_admin");
    if (myRole === "vendor_admin") return ["vendor", "vendor_user"];
    return [];
  }, [myRole]);

  return (
    <AppLayout>
      <div className="max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-xs uppercase tracking-[0.1em] text-slate-400 font-bold mb-1">
              {myRole === "vendor_admin" ? "Team management" : "User management"}
            </div>
            <h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight">
              {myRole === "vendor_admin" ? "My Team" : "Users"}
            </h1>
            <p className="text-slate-500 mt-1">
              {myRole === "vendor_admin"
                ? "Manage vendor users within your organisation. Role changes are limited to vendor scope."
                : "Manage team members, region access, and reset passwords."}
            </p>
          </div>
          <Button
            data-testid="add-user-btn"
            className="bg-blue-600 hover:bg-blue-700"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="w-4 h-4 mr-1.5" /> New user
          </Button>
        </div>

        {canApprove && (
          <div className="flex items-center gap-1 mb-4 bg-slate-100 p-1 rounded-lg w-fit">
            <button
              data-testid="users-tab"
              onClick={() => setTab("users")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition ${
                tab === "users" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <UsersIcon className="w-3.5 h-3.5" /> Users
            </button>
            <button
              data-testid="approvals-tab"
              onClick={() => { setTab("approvals"); loadApprovals(); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition ${
                tab === "approvals" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Approvals
              {pendingApprovals.length > 0 && (
                <Badge variant="secondary" className="bg-amber-100 text-amber-700 h-4 px-1.5 text-[10px] ml-0.5">
                  {pendingApprovals.length}
                </Badge>
              )}
            </button>
          </div>
        )}

        {tab === "approvals" && canApprove ? (
          <ApprovalsCard
            items={pendingApprovals}
            reload={() => { loadApprovals(); load(); }}
          />
        ) : (<Card className="rounded-2xl border-slate-100 card-soft bg-white">
          <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-100">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                data-testid="users-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search users by name, email, region…"
                className="pl-10 h-9"
              />
            </div>
            <div className="text-xs text-slate-500">{filtered.length} of {users.length}</div>
          </div>
          {loading ? (
            <div className="p-8 text-slate-400">Loading…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Access scope</TableHead>
                  <TableHead>Plants</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.user_id} data-testid={`user-row-${u.email}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                            {u.name?.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="text-sm font-medium text-slate-800">{u.name}</div>
                          <div className="text-xs text-slate-500">{u.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {ROLE_LABELS[u.role] || u.role}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      <ScopePill user={u} />
                    </TableCell>
                    <TableCell className="text-xs">
                      <PlantsBadge user={u} />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={u.is_active}
                        onCheckedChange={(v) => updateUser(u, { is_active: v })}
                        data-testid={`user-active-${u.email}`}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{formatDate(u.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditUser(u)}
                        data-testid={`user-edit-${u.email}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => del(u)}
                        className="text-red-600 hover:text-red-700"
                        data-testid={`user-delete-${u.email}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
        )}
      </div>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        availableRoles={availableRoles}
        regions={regions}
        clusterMgrs={clusterMgrs}
        vendors={vendors}
        onCreated={(result) => { load(); if (result?.temp_password) setTempPasswordResult(result); }}
      />

      <EditUserDialog
        user={editUser}
        onOpenChange={(v) => !v && setEditUser(null)}
        availableRoles={availableRoles}
        regions={regions}
        clusterMgrs={clusterMgrs}
        vendors={vendors}
        onSaved={() => { setEditUser(null); load(); }}
      />

      <TempPasswordDialog
        result={tempPasswordResult}
        onOpenChange={(v) => !v && setTempPasswordResult(null)}
      />
    </AppLayout>
  );
}

/* --------------------------- Scope pill --------------------------- */
function ScopePill({ user }) {
  const items = [];
  if (user.region) items.push({ label: "Region", value: user.region });
  if (user.cluster_manager_name) items.push({ label: "Cluster mgr", value: user.cluster_manager_name });
  if (user.vendor_id) items.push({ label: "Vendor", value: user.vendor_id });
  if (items.length === 0 && !user.access_override) return <span className="text-slate-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {user.access_override && (
        <span
          data-testid={`user-override-${user.email}`}
          className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold"
        >
          OVERRIDE
        </span>
      )}
      {items.map((i) => (
        <span key={i.label} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
          <span className="text-slate-400 mr-1">{i.label}:</span>{i.value}
        </span>
      ))}
    </div>
  );
}

/**
 * PlantsBadge — shows the number of plants a user can access at a glance.
 * • Vendor Admin / Admin / Super Admin: "All" (they see the whole vendor /
 *   region / everything).
 * • Vendor Member: exact count from `assignments.sites`.
 */
function PlantsBadge({ user }) {
  const role = user.role;
  if (role === "super_admin" || user.access_override) {
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">All</span>;
  }
  if (role === "admin") {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">
        {user.cluster_manager_name ? "Cluster scope" : (user.region ? "Region scope" : "Any")}
      </span>
    );
  }
  if (role === "vendor_admin") {
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">All vendor plants</span>;
  }
  const n = (user.assignments?.sites || []).length;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
      n === 0 ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-700"
    }`}>
      {n} {n === 1 ? "plant" : "plants"}
    </span>
  );
}


/* --------------------------- Create dialog --------------------------- */
/**
 * ApprovalsCard — lists pending admin-approval requests (currently only
 * `user_disable`) with Approve / Reject controls.  Visible to super_admin
 * and admin only (the parent component gates this).
 */
function ApprovalsCard({ items, reload }) {
  const act = async (id, kind) => {
    try {
      if (kind === "reject") {
        const reason = window.prompt("Reason for rejection (optional):", "") ?? "";
        await api.post(`/admin-approvals/${id}/reject`, { reason });
        toast.success("Request rejected");
      } else {
        if (!window.confirm("Approve this disable request? The user will be deactivated immediately.")) return;
        await api.post(`/admin-approvals/${id}/approve`);
        toast.success("Request approved · user disabled");
      }
      reload();
    } catch (e) { toast.error(getErrorMessage(e, "Action failed")); }
  };

  return (
    <Card className="rounded-2xl border-slate-100 card-soft bg-white" data-testid="approvals-card">
      <div className="p-4 border-b border-slate-100 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-amber-600" />
        <div className="text-sm font-semibold">Pending admin approvals</div>
        <div className="ml-auto text-xs text-slate-400">
          {items.length} pending
        </div>
      </div>
      {items.length === 0 ? (
        <div className="p-8 text-center text-slate-400 text-sm">
          No pending requests.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead>Target user</TableHead>
              <TableHead>Requested by</TableHead>
              <TableHead>When</TableHead>
              <TableHead className="text-right">Decision</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.approval_id} data-testid={`approval-row-${it.approval_id}`}>
                <TableCell>
                  <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50">
                    {it.type === "user_disable" ? "Disable user" : it.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="text-sm font-medium">{it.target_name || "—"}</div>
                  <div className="text-xs text-slate-500">{it.target_email}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{it.requested_by?.name || it.requested_by?.email}</div>
                  <div className="text-xs text-slate-400">{it.requested_by?.role}</div>
                </TableCell>
                <TableCell className="text-xs text-slate-500">
                  {formatDate(it.created_at)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex gap-1.5">
                    <Button
                      size="sm" variant="outline"
                      data-testid={`reject-${it.approval_id}`}
                      className="h-7 px-2 text-[11px] border-slate-200 text-slate-600"
                      onClick={() => act(it.approval_id, "reject")}
                    >
                      <ShieldX className="w-3 h-3 mr-1" /> Reject
                    </Button>
                    <Button
                      size="sm"
                      data-testid={`approve-${it.approval_id}`}
                      className="h-7 px-2 text-[11px] bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => act(it.approval_id, "approve")}
                    >
                      <ShieldCheck className="w-3 h-3 mr-1" /> Approve
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}


function CreateUserDialog({ open, onOpenChange, availableRoles, regions, clusterMgrs, vendors, onCreated }) {
  const { user: me } = useAuth();
  const canGrantOverride = me?.role === "super_admin";
  const emptyForm = () => ({
    name: "", email: "", password: "", role: availableRoles[0] || "user",
    region: "", cluster_manager_name: "", vendor_id: "",
    access_override: false,
    autoGenerate: true, send_welcome_email: true,
  });
  const [form, setForm] = useState(emptyForm());
  useEffect(() => { if (open) setForm(emptyForm()); }, [open]);

  const submit = async () => {
    if (!form.name || !form.email) {
      toast.error("Name and email are required"); return;
    }
    if (!form.autoGenerate && form.password.length < 6) {
      toast.error("Password must be at least 6 characters"); return;
    }
    const body = {
      name: form.name,
      email: form.email,
      role: form.role,
      send_welcome_email: form.send_welcome_email,
      region: form.region || null,
      cluster_manager_name: form.cluster_manager_name || null,
      vendor_id: form.vendor_id || null,
      access_override: !!form.access_override,
    };
    if (!form.autoGenerate) body.password = form.password;
    try {
      const r = await api.post("/users", body);
      toast.success("User created");
      onOpenChange(false);
      onCreated(r.data);
    } catch (e) { toast.error(getErrorMessage(e, "Create failed")); }
  };

  const isVendorRole = form.role?.startsWith("vendor");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create new user</DialogTitle>
          <DialogDescription>
            Region &amp; cluster options are pulled from Site Management — the master for all access.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                     data-testid="new-user-name" />
            </div>
            <div><Label>Email</Label>
              <Input type="email" value={form.email}
                     onChange={(e) => setForm({ ...form, email: e.target.value })}
                     data-testid="new-user-email" />
            </div>
          </div>
          <div><Label>Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger data-testid="new-user-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                {availableRoles.map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r] || r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.role === "admin" && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Region (Site Master)</Label>
                <Select value={form.region} onValueChange={(v) => setForm({ ...form, region: v })}>
                  <SelectTrigger data-testid="new-user-region"><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Any region</SelectItem>
                    {regions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Cluster manager</Label>
                <Select value={form.cluster_manager_name}
                        onValueChange={(v) => setForm({ ...form, cluster_manager_name: v })}>
                  <SelectTrigger data-testid="new-user-cm"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {clusterMgrs.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {isVendorRole && (
            <div><Label>Vendor</Label>
              <Select value={form.vendor_id} onValueChange={(v) => setForm({ ...form, vendor_id: v })}>
                <SelectTrigger data-testid="new-user-vendor"><SelectValue placeholder="Choose vendor" /></SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v.vendor_id} value={v.vendor_id}>{v.vendor_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="border-t border-slate-100 pt-3 space-y-2">
            {canGrantOverride && (
              <label className="flex items-start gap-2 text-sm cursor-pointer bg-amber-50/60 border border-amber-200 rounded-lg p-2.5">
                <input
                  type="checkbox"
                  checked={form.access_override}
                  onChange={(e) => setForm({ ...form, access_override: e.target.checked })}
                  className="mt-0.5"
                  data-testid="new-user-access-override"
                />
                <div className="flex-1">
                  <div className="font-medium text-amber-900">Grant Add-on Access override</div>
                  <div className="text-xs text-amber-700">
                    Bypasses all region / vendor filters AND allows editing every form.
                    Use only for stand-in approvers.
                  </div>
                </div>
              </label>
            )}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.autoGenerate}
                onChange={(e) => setForm({ ...form, autoGenerate: e.target.checked })}
                data-testid="new-user-autogen"
              />
              <Shuffle className="w-3.5 h-3.5" />
              Auto-generate a temp password
            </label>
            {!form.autoGenerate && (
              <div><Label>Password</Label>
                <Input type="password" value={form.password}
                       onChange={(e) => setForm({ ...form, password: e.target.value })}
                       data-testid="new-user-password" />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.send_welcome_email}
                onChange={(e) => setForm({ ...form, send_welcome_email: e.target.checked })}
                data-testid="new-user-welcome"
              />
              <MailIcon className="w-3.5 h-3.5" />
              Send welcome email with credentials (configurable in Settings → Email templates)
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            data-testid="confirm-add-user"
            className="bg-blue-600 hover:bg-blue-700"
            onClick={() => {
              // sanitise sentinels
              const f = { ...form };
              if (f.region === "__any__") f.region = "";
              if (f.cluster_manager_name === "__none__") f.cluster_manager_name = "";
              setForm(f);
              submit();
            }}
          >
            Create user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------- Edit dialog --------------------------- */
function EditUserDialog({ user, onOpenChange, availableRoles, regions, clusterMgrs, vendors, onSaved }) {
  const { user: me } = useAuth();
  const canGrantOverride = me?.role === "super_admin";
  const [form, setForm] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || "",
        role: user.role,
        region: user.region || "",
        cluster_manager_name: user.cluster_manager_name || "",
        vendor_id: user.vendor_id || "",
        is_active: user.is_active,
        access_override: !!user.access_override,
        assigned_sites: (user.assignments?.sites) || [],
      });
      setNewPassword("");
    }
  }, [user]);
  // Load the vendor's plant list when the target is a vendor member (so the
  // Vendor Admin can pick which specific plants they own).  We match by
  // canonical `vendor_id` first, and fall back to `vendor_name` / `email`
  // for legacy sites whose vendor_id was never populated (a bulk-fix is
  // available on the Site Master page — see the "Relink vendors" button).
  const [vendorPlants, setVendorPlants] = useState([]);
  useEffect(() => {
    if (!form?.vendor_id || form.role !== "vendor") { setVendorPlants([]); return; }
    const vendorRow = (vendors || []).find((v) => v.vendor_id === form.vendor_id) || {};
    const vName = String(vendorRow.name || vendorRow.vendor_name || "").trim().toLowerCase();
    const vEmail = String(vendorRow.email || vendorRow.vendor_email || "").trim().toLowerCase();
    api.get("/sites", { params: { show_all: true } })
      .then((r) => setVendorPlants(
        (r.data || []).filter((s) => {
          if (s.vendor_id === form.vendor_id) return true;
          if ((s.assigned_vendor_ids || []).includes(form.vendor_id)) return true;
          if (vName && String(s.vendor_name || "").trim().toLowerCase() === vName) return true;
          if (vEmail && String(s.vendor_email || "").trim().toLowerCase() === vEmail) return true;
          return false;
        }),
      ))
      .catch(() => setVendorPlants([]));
  }, [form?.vendor_id, form?.role, vendors]);
  if (!user || !form) return null;

  const save = async () => {
    const patch = { ...form };
    if (form.region === "__any__") patch.region = "";
    if (form.cluster_manager_name === "__none__") patch.cluster_manager_name = "";
    // access_override is only sent by super_admin (backend also enforces)
    if (!canGrantOverride) delete patch.access_override;
    if (newPassword.trim()) {
      if (newPassword.length < 6) { toast.error("Password must be at least 6 characters"); return; }
      patch.password = newPassword;
    }
    // `assigned_sites` is persisted via a separate endpoint — pull it out
    // before hitting /users so we don't send an unknown field.
    const assignedSites = patch.assigned_sites || [];
    delete patch.assigned_sites;
    try {
      const resp = await api.patch(`/users/${user.user_id}`, patch);
      // Persist plant assignments for vendor members (never blocks main save).
      if (form.role === "vendor") {
        try {
          await api.put(`/vendor-users/${user.user_id}/assignments`, {
            forms: user.assignments?.forms || [],
            pdf_forms: user.assignments?.pdf_forms || [],
            workflows: user.assignments?.workflows || [],
            sites: assignedSites,
          });
        } catch (e) { /* non-fatal */ toast.error(getErrorMessage(e, "Plant assignment save failed")); }
      }
      // Backend may return 202 with { pending_approval: true } when a
      // vendor_admin tried to disable a user — surface that to the operator
      // instead of showing the generic "Saved" toast.
      if (resp?.data?.pending_approval) {
        toast.info(resp.data.message || "Request submitted for admin approval");
      } else {
        toast.success("Saved");
      }
      onSaved();
    } catch (e) { toast.error(getErrorMessage(e, "Update failed")); }
  };
  const isVendorRole = form.role?.startsWith("vendor");

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit user · {user.email}</DialogTitle>
          <DialogDescription>Change access scope, role, or reset the password.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                   data-testid="edit-user-name" />
          </div>
          <div><Label>Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger data-testid="edit-user-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                {availableRoles.map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r] || r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.role === "admin" && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Region</Label>
                <Select value={form.region || "__any__"} onValueChange={(v) => setForm({ ...form, region: v })}>
                  <SelectTrigger data-testid="edit-user-region"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Any region</SelectItem>
                    {regions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Cluster manager</Label>
                <Select value={form.cluster_manager_name || "__none__"}
                        onValueChange={(v) => setForm({ ...form, cluster_manager_name: v })}>
                  <SelectTrigger data-testid="edit-user-cm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {clusterMgrs.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {isVendorRole && (
            <div><Label>Vendor</Label>
              <Select value={form.vendor_id} onValueChange={(v) => setForm({ ...form, vendor_id: v })}>
                <SelectTrigger data-testid="edit-user-vendor"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v.vendor_id} value={v.vendor_id}>{v.vendor_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {form.role === "vendor" && form.vendor_id && (
            <PlantAssignPicker
              plants={vendorPlants}
              selected={form.assigned_sites || []}
              onChange={(next) => setForm({ ...form, assigned_sites: next })}
            />
          )}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              data-testid="edit-user-active"
            />
            <span>Account active</span>
          </label>
          {canGrantOverride && (
            <label className="flex items-start gap-2 text-sm cursor-pointer bg-amber-50/60 border border-amber-200 rounded-lg p-2.5">
              <input
                type="checkbox"
                checked={!!form.access_override}
                onChange={(e) => setForm({ ...form, access_override: e.target.checked })}
                className="mt-0.5"
                data-testid="edit-user-access-override"
              />
              <div className="flex-1">
                <div className="font-medium text-amber-900">Add-on Access override</div>
                <div className="text-xs text-amber-700">
                  Bypasses region / vendor filters AND grants Form-Builder edit rights.
                </div>
              </div>
            </label>
          )}
          <div className="border-t border-slate-100 pt-3">
            <Label>Reset password (leave blank to keep current)</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Type a new password…"
              data-testid="edit-user-password"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={save} data-testid="edit-user-save">
            <KeyRound className="w-4 h-4 mr-1.5" /> Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------- Temp password result dialog -------------------- */
/**
 * PlantAssignPicker — searchable multi-select for vendor member plant
 * assignments.  Reads `plants` (already scoped to the vendor) and calls
 * `onChange(newSelected)` with an array of `site_id`s.
 */
function PlantAssignPicker({ plants, selected, onChange }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return plants;
    return plants.filter((p) =>
      [p.site_name, p.site_code, p.region, p.cluster_manager_name]
        .some((v) => (v || "").toLowerCase().includes(s)));
  }, [plants, q]);
  const toggle = (id) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const allIds = filtered.map((p) => p.site_id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.includes(id));
  const toggleAll = () => {
    if (allSelected) onChange(selected.filter((id) => !allIds.includes(id)));
    else onChange(Array.from(new Set([...selected, ...allIds])));
  };
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden"
         data-testid="plant-assign-picker">
      <div className="flex items-center gap-2 p-2 bg-slate-50 border-b border-slate-100">
        <Label className="text-xs font-semibold text-slate-600">
          Assigned plants <span className="text-slate-400 font-normal">({selected.length} selected)</span>
        </Label>
        <div className="ml-auto flex items-center gap-1.5">
          <Input value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="Search plants…"
                 className="h-7 text-xs w-40"
                 data-testid="plant-picker-search" />
          <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]"
                  onClick={toggleAll} data-testid="plant-picker-toggle-all">
            {allSelected ? "Clear filtered" : "Select all filtered"}
          </Button>
        </div>
      </div>
      <div className="max-h-52 overflow-y-auto p-2 space-y-1 bg-white">
        {plants.length === 0 && (
          <div className="text-xs text-slate-400 py-4 text-center">
            No plants belong to this vendor yet.
          </div>
        )}
        {filtered.map((p) => (
          <label key={p.site_id}
                 className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={selected.includes(p.site_id)}
              onChange={() => toggle(p.site_id)}
              data-testid={`plant-pick-${p.site_id}`}
            />
            <span className="flex-1 truncate">
              <span className="font-medium">{p.site_name}</span>
              {p.site_code && (
                <span className="text-slate-400 text-xs ml-1.5">· {p.site_code}</span>
              )}
              {p.region && (
                <span className="text-slate-400 text-xs ml-1.5">· {p.region}</span>
              )}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}


function TempPasswordDialog({ result, onOpenChange }) {
  if (!result) return null;
  const pwd = result.temp_password;
  const copy = () => {
    navigator.clipboard.writeText(pwd || "");
    toast.success("Copied");
  };
  return (
    <Dialog open={!!result} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>User created — share these credentials</DialogTitle>
          <DialogDescription>
            {result.email_status === "sent"
              ? "The welcome email was sent. Password is also shown below in case you need to hand it off manually."
              : "SMTP is not configured yet — copy this temp password and share it with the new user."}
          </DialogDescription>
        </DialogHeader>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
          <div className="text-xs text-slate-500">Email</div>
          <div className="font-mono text-sm">{result.email}</div>
          <div className="text-xs text-slate-500 mt-2">Temporary password</div>
          <div className="flex items-center gap-2">
            <div className="font-mono text-sm bg-white border border-slate-200 rounded px-3 py-1.5 flex-1" data-testid="temp-password">
              {pwd}
            </div>
            <Button size="sm" variant="outline" onClick={copy} data-testid="copy-password">
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          {result.email_error && (
            <div className="text-xs text-red-600 mt-2">Email error: {result.email_error}</div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
