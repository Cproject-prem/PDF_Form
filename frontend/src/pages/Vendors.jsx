import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import AppLayout from "@/components/layout/AppLayout";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableHeader, TableHead, TableRow, TableBody, TableCell,
} from "@/components/ui/table";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SearchableDropdown } from "@/components/ui/SearchableDropdown";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Building2, Plus, Search, Edit3, Trash2, Users as UsersIcon,
  KeyRound, ShieldCheck, Mail, Phone, MapPin, ArrowLeft, UserPlus, Power,
} from "lucide-react";
import { formatDate } from "@/lib/utils2";

export default function VendorsPage() {
  const { user: authUser } = useAuth();
  const { canCreateVendors, canEditVendors, canDeleteVendors, isVendorAdmin } = usePermissions();

  const [vendors, setVendors] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailVendor, setDetailVendor] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/vendors");
      setVendors(r.data);
      // vendor_admin: immediately open their own vendor detail
      if (isVendorAdmin && r.data.length > 0 && !detailVendor) {
        setDetailVendor(r.data[0]);
      }
    } catch (e) {
      toast.error("Failed to load vendors");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line


  const filtered = vendors.filter((v) =>
    !q || `${v.name} ${v.code} ${v.email}`.toLowerCase().includes(q.toLowerCase()));

  const startNew = () => {
    setEditing({ name: "", code: "", contact_person: "", email: "", phone: "", address: "", status: "active", notes: "" });
    setEditOpen(true);
  };

  const startEdit = (v) => { setEditing({ ...v, _orig_vendor_id: v.vendor_id }); setEditOpen(true); };

  const save = async () => {
    if (!editing.name?.trim()) { toast.error("Vendor name required"); return; }
    try {
      if (editing._orig_vendor_id) {
        await api.put(`/vendors/${editing._orig_vendor_id}`, editing);
        toast.success("Saved");
      } else {
        const r = await api.post("/vendors", editing);
        toast.success("Vendor created");
        setEditing(r.data);
      }
      setEditOpen(false);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    }
  };

  const remove = async (v) => {
    if (!confirm(`Delete ${v.name}? Their users will be deactivated.`)) return;
    await api.delete(`/vendors/${v.vendor_id}`);
    toast.success("Deleted");
    load();
  };

  if (detailVendor) {
    return (
      <VendorDetail
        vendor={detailVendor}
        isVendorAdmin={isVendorAdmin}
        onBack={isVendorAdmin ? null : () => { setDetailVendor(null); load(); }}
      />
    );
  }

  return (
    <AppLayout>
      <div className="max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <span className="text-xs uppercase tracking-[0.1em] text-slate-400 font-bold">Partners</span>
            <h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight text-slate-900 mt-1">Vendor Management</h1>
            <p className="text-slate-500 mt-1">Vendors, their portal users and per-vendor data access scopes.</p>
          </div>
          {canCreateVendors && (
            <Button onClick={startNew} className="bg-blue-600 hover:bg-blue-700" data-testid="vendor-new-btn">
              <Plus className="w-4 h-4 mr-1.5" /> New vendor
            </Button>
          )}
        </div>

        <Card className="rounded-2xl border-slate-100 card-soft bg-white">
          <div className="flex items-center gap-3 p-4 border-b border-slate-100">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input data-testid="vendor-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vendors…" className="pl-10 h-9" />
            </div>
            <span className="text-xs text-slate-500">{filtered.length} vendors</span>
          </div>

          {loading ? (
            <div className="p-8 text-slate-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Building2 className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-sm text-slate-500 mt-2">No vendors yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((v) => (
                  <TableRow key={v.vendor_id} data-testid={`vendor-row-${v.vendor_id}`}>
                    <TableCell>
                      <button onClick={() => setDetailVendor(v)} className="font-medium text-slate-800 hover:text-blue-600 text-left">
                        {v.name}
                      </button>
                      {v.email && <div className="text-xs text-slate-500 mt-0.5">{v.email}</div>}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">{v.code || "—"}</TableCell>
                    <TableCell className="text-sm">
                      {v.contact_person}{v.phone && <span className="text-xs text-slate-400 ml-1">{v.phone}</span>}
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${v.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {v.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">{formatDate(v.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" title="Open" onClick={() => setDetailVendor(v)} data-testid={`vendor-open-${v.vendor_id}`}>
                        <UsersIcon className="w-4 h-4" />
                      </Button>
                      {canEditVendors && (
                        <Button variant="ghost" size="sm" title="Edit" onClick={() => startEdit(v)} data-testid={`vendor-edit-${v.vendor_id}`}>
                          <Edit3 className="w-4 h-4" />
                        </Button>
                      )}
                      {canDeleteVendors && (
                        <Button variant="ghost" size="sm" title="Delete" onClick={() => remove(v)} className="text-red-600 hover:text-red-700" data-testid={`vendor-del-${v.vendor_id}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.vendor_id ? "Edit vendor" : "Create vendor"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Vendor name"><Input data-testid="vendor-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
              <Field label="Scope Name (Vendor ID)">
                <Input value={editing.vendor_id || ""} onChange={(e) => setEditing({ ...editing, vendor_id: e.target.value })} placeholder="Leave blank to auto-generate" />
                <p className="text-[10px] text-slate-400 mt-1">Updates to this ID will automatically apply to all linked users and sites.</p>
              </Field>
              <Field label="Code"><Input data-testid="vendor-code" value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} /></Field>
              <Field label="Contact person"><Input value={editing.contact_person} onChange={(e) => setEditing({ ...editing, contact_person: e.target.value })} /></Field>
              <Field label="Email"><Input data-testid="vendor-email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></Field>
              <Field label="Phone"><Input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
              <Field label="Status">
                <SearchableDropdown
                  options={[
                    { label: "Active", value: "active" },
                    { label: "Inactive", value: "inactive" },
                    { label: "Suspended", value: "suspended" },
                  ]}
                  value={editing.status || "active"}
                  onChange={(v) => setEditing({ ...editing, status: v })}
                  placeholder="Select status..."
                  className="h-10 text-sm"
                />
              </Field>
              <Field label="Address" className="col-span-2"><Textarea rows={2} value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></Field>
              <Field label="Logo URL (optional)" className="col-span-2"><Input value={editing.logo_url || ""} onChange={(e) => setEditing({ ...editing, logo_url: e.target.value })} placeholder="https://…/logo.png" /></Field>
              <Field label="Notes" className="col-span-2"><Textarea rows={2} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={save} className="bg-blue-600 hover:bg-blue-700" data-testid="vendor-save">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function Field({ label, children, className = "" }) {
  return (
    <div className={className}>
      <Label className="text-xs text-slate-500">{label}</Label>
      {children}
    </div>
  );
}

// ---------- Vendor detail (users + assignments) ----------

function VendorDetail({ vendor: v0, onBack, isVendorAdmin = false }) {
  const [vendor, setVendor] = useState(v0);
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [forms, setForms] = useState([]);
  const [pdfForms, setPdfForms] = useState([]);
  const [sites, setSites] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [newUserOpen, setNewUserOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", name: "", password: "", role: "vendor" });
  const [editingUser, setEditingUser] = useState(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState(null);

  const load = async () => {
    const [v, u, fr, pf, s, wf] = await Promise.all([
      api.get(`/vendors/${v0.vendor_id}`),
      api.get(`/vendor-users/${v0.vendor_id}`),
      api.get("/forms").catch(() => ({ data: [] })),
      api.get("/pdf-forms").catch(() => ({ data: [] })),
      api.get("/sites").catch(() => ({ data: [] })),
      api.get("/workflows").catch(() => ({ data: [] })),
    ]);
    setVendor(v.data);
    setUsers(u.data);
    setForms(fr.data); setPdfForms(pf.data);
    setSites(s.data || []);
    setWorkflows(wf.data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const createUser = async () => {
    if (!newUser.email || !newUser.name) { toast.error("Email and name required"); return; }
    try {
      const r = await api.post(`/vendor-users/${vendor.vendor_id}`, newUser);
      if (r.data.initial_password) {
        toast.success(`User created. Initial password: ${r.data.initial_password}`);
      } else {
        toast.success("User created");
      }
      setNewUserOpen(false); setNewUser({ email: "", name: "", password: "", role: "vendor" });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Create failed");
    }
  };

  const resetPassword = async (u) => {
    const pw = prompt(`New password for ${u.email}:`, "Welcome@" + Math.random().toString(36).slice(2, 8));
    if (!pw) return;
    await api.patch(`/vendor-users/${u.user_id}`, { password: pw });
    toast.success("Password reset");
  };

  const toggleActive = async (u) => {
    await api.patch(`/vendor-users/${u.user_id}`, { is_active: !u.is_active });
    load();
  };

  const removeUser = async (u) => {
    if (!confirm(`Delete user ${u.email}?`)) return;
    await api.delete(`/vendor-users/${u.user_id}`);
    load();
  };

  const openAssign = (u) => {
    const a = u.assignments || { forms: [], pdf_forms: [], sites: [], workflows: [] };
    if (!a.sites?.length && sites.length === 1) {
      a.sites = [sites[0].site_id];
    }
    setAssignTarget({ ...u, assignments: a });
    setAssignOpen(true);
  };
  const toggleAssign = (kind, id) => {
    setAssignTarget((t) => {
      const set = new Set(t.assignments?.[kind] || []);
      set.has(id) ? set.delete(id) : set.add(id);
      return { ...t, assignments: { ...t.assignments, [kind]: Array.from(set) } };
    });
  };
  const saveAssignments = async () => {
    await api.put(`/vendor-users/${assignTarget.user_id}/assignments`, assignTarget.assignments);
    toast.success("Assignments saved");
    setAssignOpen(false);
    load();
  };

  return (
    <AppLayout>
      <div className="max-w-7xl">
        <div className="flex items-center gap-3 mb-2">
          {onBack && (
            <button onClick={onBack} className="p-2 rounded-md hover:bg-slate-100 text-slate-600" data-testid="vendor-back">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <span className="text-xs uppercase tracking-[0.1em] text-slate-400 font-bold">
            {isVendorAdmin ? "My Vendor" : "Vendor"}
          </span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight text-slate-900">{vendor.name}</h1>
        <div className="flex gap-4 text-sm text-slate-500 mt-1 mb-6">
          {vendor.code && <span>Code: <b className="text-slate-700">{vendor.code}</b></span>}
          {vendor.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{vendor.email}</span>}
          {vendor.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{vendor.phone}</span>}
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="users" data-testid="tab-users">
              <UsersIcon className="w-3.5 h-3.5 mr-1" /> Users ({users.length})
            </TabsTrigger>
            <TabsTrigger value="info" data-testid="tab-info">
              <Building2 className="w-3.5 h-3.5 mr-1" /> Vendor info
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-4">
            <Card className="rounded-2xl border-slate-100 card-soft bg-white">
              <div className="flex items-center justify-between p-4 border-b border-slate-100">
                <span className="text-sm text-slate-600">{users.length} portal users</span>
                <Button onClick={() => setNewUserOpen(true)} size="sm" className="bg-blue-600 hover:bg-blue-700" data-testid="vendor-user-new">
                  <UserPlus className="w-4 h-4 mr-1" /> Add user
                </Button>
              </div>
              {users.length === 0 ? (
                <div className="p-10 text-center text-slate-400">No portal users yet.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Assignments</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => {
                      const a = u.assignments || {};
                      const total = (a.forms?.length || 0) + (a.pdf_forms?.length || 0) + (a.sites?.length || 0);
                      return (
                        <TableRow key={u.user_id}>
                          <TableCell>
                            <div className="font-medium text-slate-800">{u.name}</div>
                            <div className="text-xs text-slate-500">{u.email}</div>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs font-medium px-2 py-1 rounded-full bg-violet-50 text-violet-700">{u.role}</span>
                          </TableCell>
                          <TableCell className="text-xs text-slate-500">
                            {a.forms?.length || 0} forms · {a.pdf_forms?.length || 0} PDFs · {a.sites?.length || 0} sites · {a.workflows?.length || 0} workflows
                          </TableCell>
                          <TableCell>
                            <span className={`text-xs px-2 py-1 rounded-full ${u.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                              {u.is_active ? "active" : "inactive"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" title="Assignments" onClick={() => openAssign(u)} data-testid={`vu-assign-${u.user_id}`}>
                              <ShieldCheck className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" title="Reset password" onClick={() => resetPassword(u)}>
                              <KeyRound className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" title="Toggle active" onClick={() => toggleActive(u)}>
                              <Power className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" title="Delete" onClick={() => removeUser(u)} className="text-red-600">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="info" className="mt-4">
            <Card className="rounded-2xl border-slate-100 card-soft bg-white p-6">
              <p className="text-sm text-slate-500 mb-3">
                Edit vendor information by clicking the pencil icon on the vendors list page.
              </p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {Object.entries({
                  Name: vendor.name, Code: vendor.code, "Contact person": vendor.contact_person,
                  Email: vendor.email, Phone: vendor.phone, Status: vendor.status,
                  "Created at": vendor.created_at ? new Date(vendor.created_at).toLocaleString() : "—",
                  "Stats": vendor._stats ? `${vendor._stats.users} users · ${vendor._stats.sites} sites` : "—",
                }).map(([k, val]) => (
                  <div key={k}>
                    <div className="text-xs text-slate-400 uppercase tracking-wider">{k}</div>
                    <div className="mt-0.5 text-slate-700">{val || "—"}</div>
                  </div>
                ))}
                {vendor.address && (
                  <div className="col-span-2">
                    <div className="text-xs text-slate-400 uppercase tracking-wider">Address</div>
                    <div className="mt-0.5 text-slate-700 whitespace-pre-line">{vendor.address}</div>
                  </div>
                )}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add user */}
      <Dialog open={newUserOpen} onOpenChange={setNewUserOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add portal user</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Name"><Input data-testid="vu-name" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} /></Field>
            <Field label="Email"><Input data-testid="vu-email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} /></Field>
            <Field label="Initial password (blank = auto-generated)">
              <Input type="text" data-testid="vu-password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
            </Field>
            <Field label="Role">
              <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vendor">Vendor (limited)</SelectItem>
                  <SelectItem value="vendor_admin">Vendor admin (manages own org)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewUserOpen(false)}>Cancel</Button>
            <Button onClick={createUser} className="bg-blue-600 hover:bg-blue-700" data-testid="vu-create">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assignments */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assignments for {assignTarget?.email}</DialogTitle>
            <DialogDescription>Vendor users only see resources you explicitly grant here.</DialogDescription>
          </DialogHeader>
          {assignTarget && (
            <div className="space-y-4">
              <AssignSection label="Forms" items={forms.map((f) => ({ id: f.form_id, label: f.title }))} selected={assignTarget.assignments?.forms || []} onToggle={(id) => toggleAssign("forms", id)} />
              <AssignSection label="PDF Forms" items={pdfForms.map((f) => ({ id: f.template_id, label: f.title }))} selected={assignTarget.assignments?.pdf_forms || []} onToggle={(id) => toggleAssign("pdf_forms", id)} />
              <AssignSection label="Sites" items={sites.map((s) => ({ id: s.site_id, label: `${s.site_name} (${s.site_code || "—"})` }))} selected={assignTarget.assignments?.sites || []} onToggle={(id) => toggleAssign("sites", id)} />
              <AssignSection label="Workflows" items={workflows.map((w) => ({ id: w.workflow_id, label: w.name }))} selected={assignTarget.assignments?.workflows || []} onToggle={(id) => toggleAssign("workflows", id)} />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={saveAssignments} className="bg-blue-600 hover:bg-blue-700" data-testid="vu-assign-save">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function AssignSection({ label, items, selected, onToggle }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider font-bold text-slate-500 mb-2">{label} ({selected.length}/{items.length})</div>
      {items.length === 0 ? (
        <div className="text-xs text-slate-400 px-2">No {label.toLowerCase()} available.</div>
      ) : (
        <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100">
          {items.map((it) => (
            <label key={it.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm">
              <Checkbox
                checked={selected.includes(it.id)}
                onCheckedChange={() => onToggle(it.id)}
                data-testid={`assign-${label.toLowerCase().replace(' ', '-')}-${it.id}`}
              />
              <span className="text-slate-700">{it.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
