import React, { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_LABELS, ROLES, formatDate } from "@/lib/utils2";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Table, TableHeader, TableHead, TableRow, TableBody, TableCell
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [newU, setNewU] = useState({ name: "", email: "", password: "", role: "user" });

  const load = () => {
    setLoading(true);
    api.get("/users").then((r) => setUsers(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    try {
      await api.post("/users", newU);
      toast.success("User created"); setOpen(false);
      setNewU({ name: "", email: "", password: "", role: "user" });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const updateUser = async (u, patch) => {
    try { await api.patch(`/users/${u.user_id}`, patch); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Update failed"); }
  };

  const del = async (u) => {
    if (!confirm(`Delete ${u.email}?`)) return;
    try { await api.delete(`/users/${u.user_id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Delete failed"); }
  };

  return (
    <AppLayout>
      <div className="max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight">Users</h1>
            <p className="text-slate-500 mt-1">Manage your team members and their roles.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="add-user-btn" className="bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-1.5" /> New user</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create new user</DialogTitle>
                <DialogDescription>The user will be able to log in immediately.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={newU.name} onChange={(e) => setNewU({ ...newU, name: e.target.value })} data-testid="new-user-name" /></div>
                <div><Label>Email</Label><Input type="email" value={newU.email} onChange={(e) => setNewU({ ...newU, email: e.target.value })} data-testid="new-user-email" /></div>
                <div><Label>Password</Label><Input type="password" value={newU.password} onChange={(e) => setNewU({ ...newU, password: e.target.value })} data-testid="new-user-password" /></div>
                <div>
                  <Label>Role</Label>
                  <Select value={newU.role} onValueChange={(v) => setNewU({ ...newU, role: v })}>
                    <SelectTrigger data-testid="new-user-role"><SelectValue /></SelectTrigger>
                    <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={create} className="bg-blue-600 hover:bg-blue-700" data-testid="confirm-add-user">Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="rounded-2xl border-slate-100 card-soft">
          {loading ? <div className="p-8 text-slate-400">Loading…</div> :
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Created</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.user_id} data-testid={`user-row-${u.email}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="w-8 h-8"><AvatarFallback className="text-xs bg-blue-100 text-blue-700">{u.name?.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                      <div>
                        <div className="text-sm font-medium text-slate-800">{u.name}</div>
                        <div className="text-xs text-slate-500">{u.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select value={u.role} onValueChange={(v) => updateUser(u, { role: v })}>
                      <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Switch checked={u.is_active} onCheckedChange={(v) => updateUser(u, { is_active: v })} /></TableCell>
                  <TableCell className="text-xs text-slate-500">{formatDate(u.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => del(u)} className="text-red-600 hover:text-red-700"><Trash2 className="w-4 h-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>}
        </Card>
      </div>
    </AppLayout>
  );
}
