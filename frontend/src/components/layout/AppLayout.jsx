import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ROLE_LABELS } from "@/lib/utils2";
import {
  LayoutDashboard, FileStack, Settings as SettingsIcon, Users as UsersIcon,
  LogOut, ChevronDown, Sparkles, Workflow, ShieldCheck, BarChart3, ScrollText, Mail,
  Building2, MapPin, Database, FileType2,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/forms", icon: FileStack, label: "Forms" },
  { to: "/workflows", icon: Workflow, label: "Workflow Automation" },
  { to: "/approvals", icon: ShieldCheck, label: "Approvals" },
];
const adminItems = [
  { to: "/vendors", icon: Building2, label: "Vendor Management", role: "admin" },
  { to: "/sites", icon: MapPin, label: "Site Management", role: "admin" },
  { to: "/master-data", icon: Database, label: "Master Data", role: "admin" },
  { to: "/workflow-analytics", icon: BarChart3, label: "Analytics", role: "admin" },
  { to: "/audit-logs", icon: ScrollText, label: "Audit Logs", role: "admin" },
  { to: "/settings/smtp", icon: Mail, label: "Email / SMTP", role: "super_admin" },
  { to: "/users", icon: UsersIcon, label: "Users", role: "super_admin" },
  { to: "/settings", icon: SettingsIcon, label: "Settings", role: "super_admin" },
];

export default function AppLayout({ children, fullWidth = false }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const initials = (user?.name || user?.email || "?").split(" ").map(s => s[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside data-testid="sidebar" className="w-64 shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="p-6 border-b border-slate-100">
          <Link to="/dashboard" data-testid="brand-link" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
              <Sparkles className="w-4 h-4" />
            </div>
            <span className="font-heading font-bold text-lg tracking-tight">FormForge</span>
          </Link>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              data-testid={`nav-${it.label.toLowerCase().replace(/\s+/g, "-")}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"
                }`
              }
            >
              <it.icon className="w-4 h-4" />
              {it.label}
            </NavLink>
          ))}
          {(user?.role === "super_admin" || user?.role === "admin") && (
            <>
              <div className="pt-4 pb-1 px-3 text-xs font-bold uppercase tracking-[0.1em] text-slate-400">Admin</div>
              {adminItems.filter((it) => it.role === "admin" || user?.role === "super_admin").map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  data-testid={`nav-${it.label.toLowerCase()}`}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isActive ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"
                    }`
                  }
                >
                  <it.icon className="w-4 h-4" />
                  {it.label}
                </NavLink>
              ))}
            </>
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
                <div className="text-xs text-slate-500">{ROLE_LABELS[user?.role]}</div>
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

      {/* Main */}
      <main className={`flex-1 ${fullWidth ? "" : "p-8"} overflow-x-hidden`}>
        {children}
      </main>
    </div>
  );
}
