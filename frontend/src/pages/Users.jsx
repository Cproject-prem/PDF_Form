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
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

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
  const [users, setUsers] = useState([]);
  const [regions, setRegions] = useState([]);
  const [clusterMgrs, setClusterMgrs] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [tempPasswordResult, setTempPasswordResult] = useState(null);

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
  useEffect(() => { load(); }, []);

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
      await api.patch(`/users/${u.user_id}`, patch);
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

        <Card className="rounded-2xl border-slate-100 card-soft bg-white">
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
  if (items.length === 0) return <span className="text-slate-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((i) => (
        <span key={i.label} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
          <span className="text-slate-400 mr-1">{i.label}:</span>{i.value}
        </span>
      ))}
    </div>
  );
}

/* --------------------------- Create dialog --------------------------- */
function CreateUserDialog({ open, onOpenChange, availableRoles, regions, clusterMgrs, vendors, onCreated }) {
  const emptyForm = () => ({
    name: "", email: "", password: "", role: availableRoles[0] || "user",
    region: "", cluster_manager_name: "", vendor_id: "",
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
      });
      setNewPassword("");
    }
  }, [user]);
  if (!user || !form) return null;

  const save = async () => {
    const patch = { ...form };
    if (form.region === "__any__") patch.region = "";
    if (form.cluster_manager_name === "__none__") patch.cluster_manager_name = "";
    if (newPassword.trim()) {
      if (newPassword.length < 6) { toast.error("Password must be at least 6 characters"); return; }
      patch.password = newPassword;
    }
    try {
      await api.patch(`/users/${user.user_id}`, patch);
      toast.success("Saved");
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
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              data-testid="edit-user-active"
            />
            <span>Account active</span>
          </label>
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
