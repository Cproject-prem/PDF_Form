import React, { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/utils2";
import NotificationsBell from "@/components/layout/NotificationsBell";
import {
  LayoutDashboard, FileStack, FileType2, Inbox, FileSignature, Workflow,
  BarChart3, ShieldCheck, MapPin, Building2, Database, ScrollText, Users as UsersIcon,
  Mail, Settings as SettingsIcon, LogOut, ChevronDown, Sparkles, UserCog, Users2,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Map menu keys (returned by GET /api/auth/menu) to lucide icons.
const ICONS = {
  "dashboard": LayoutDashboard,
  "forms": FileStack,
  "pdf-forms": FileType2,
  "submissions": Inbox,
  "pdf-submissions": FileSignature,
  "workflows": Workflow,
  "workflow-analytics": BarChart3,
  "approvals": ShieldCheck,
  "site-master": MapPin,
  "vendors": Building2,
  "master-data": Database,
  "reports": BarChart3,
  "audit-logs": ScrollText,
  "users": UsersIcon,
  "smtp": Mail,
  "settings": SettingsIcon,
  "manpower": Users2,
  "team": UserCog,
};

// Aliases — the backend menu uses semantic keys; the React routes use slightly
// different paths in some places. Map them here so the sidebar links to the
// real route.
const PATH_ALIASES = {
  "/site-master": "/sites",
  "/smtp": "/settings/smtp",
};

export default function AppLayout({ children, fullWidth = false }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [menu, setMenu] = useState([]);
  const [groups, setGroups] = useState([]);
  const [role, setRole] = useState(user?.role);
  useEffect(() => {
    if (!user) return;
    api.get("/auth/menu")
      .then((r) => {
        setMenu(r.data.menu || []);
        setGroups(r.data.groups || []);
        setRole(r.data.role);
      })
      .catch(() => setMenu([]));
  }, [user]);

  const initials = (user?.name || user?.email || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside data-testid="sidebar" className="w-64 shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="p-6 border-b border-slate-100">
          <Link to="/dashboard" data-testid="brand-link" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
              <Sparkles className="w-4 h-4" />
            </div>
            <span className="font-heading font-bold text-lg tracking-tight">FormForge</span>
          </Link>
        </div>
        <nav className="flex-1 p-4 space-y-4 overflow-y-auto" data-testid="sidebar-nav">
          {(groups.length ? groups : [{ key: "workspace", label: "" }]).map((g) => {
            const items = menu.filter((m) => (m.group || "workspace") === g.key);
            if (items.length === 0) return null;
            return (
              <div key={g.key} data-testid={`nav-group-${g.key}`}>
                {g.label && (
                  <div className="px-3 pb-1.5 text-[10px] uppercase tracking-[0.12em] font-bold text-slate-400">
                    {g.label}
                  </div>
                )}
                <div className="space-y-1">
                  {items.map((item) => {
                    const Icon = ICONS[item.key] || FileStack;
                    const path = PATH_ALIASES[item.path] || item.path;
                    return (
                      <NavLink
                        key={item.key}
                        to={path}
                        data-testid={`nav-${item.key}`}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                            isActive ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"
                          }`
                        }
                      >
                        <Icon className="w-4 h-4" />
                        {item.label}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {menu.length === 0 && (
            <div className="text-xs text-slate-400 px-3 py-2">Loading menu…</div>
          )}
        </nav>
        <div className="p-4 border-t border-slate-100">
          <DropdownMenu>
            <DropdownMenuTrigger data-testid="user-menu" className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
              <Avatar className="w-8 h-8">
                {user?.picture ? <AvatarImage src={user.picture} alt={user.name} /> : null}
                <AvatarFallback className="text-xs bg-blue-100 text-blue-700">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left">
                <div className="text-sm font-medium text-slate-800 truncate">{user?.name}</div>
                <div className="text-xs text-slate-500" data-testid="user-role-label">{ROLE_LABELS[role] || role}</div>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem data-testid="menu-logout" onClick={() => { logout(); nav("/login"); }}>
                <LogOut className="w-4 h-4 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
      <main className={`flex-1 flex flex-col overflow-x-hidden`}>
        <div className="h-12 shrink-0 border-b border-slate-100 bg-white flex items-center justify-end px-4 gap-2">
          <NotificationsBell />
        </div>
        <div className={`flex-1 ${fullWidth ? "" : "p-8"} overflow-x-hidden`}>
          {children}
        </div>
      </main>
    </div>
  );
}
