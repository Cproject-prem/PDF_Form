import React, { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { api } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/utils2";
import NotificationsBell from "@/components/layout/NotificationsBell";
import AiChatbotWidget from "@/components/layout/AiChatbotWidget";
import {
  LayoutDashboard, FileStack, FileType2, Inbox, FileSignature, Workflow,
  BarChart3, ShieldCheck, MapPin, Building2, Database, ScrollText, Users as UsersIcon,
  Mail, Settings as SettingsIcon, LogOut, ChevronDown, Sparkles, UserCog, Users2,
  CalendarCheck2, Factory, PanelLeftClose, PanelLeftOpen, Bot, MessageSquare, Package2,
  SlidersHorizontal, ArrowUp, ArrowDown, Maximize2, Layers, Compass, Sun, Moon, Monitor,
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
  "plants": Factory,
  "schedule": CalendarCheck2,
  "vendors": Building2,
  "master-data": Database,
  "reports": BarChart3,
  "audit-logs": ScrollText,
  "users": UsersIcon,
  "security": ShieldCheck,
  "smtp": Mail,
  "settings": SettingsIcon,
  "manpower": Users2,
  "team": UserCog,
  "ai-training": Bot,
  "inventory": Package2,
};

const PATH_ALIASES = {
  "/site-master": "/sites",
  "/smtp": "/settings/smtp",
};

export default function AppLayout({ children, fullWidth = false }) {
  const { user, logout, branding } = useAuth();
  const { theme, setTheme, toggleTheme, isDark } = useTheme();
  const nav = useNavigate();
  const [menu, setMenu] = useState([]);
  const [groups, setGroups] = useState([]);
  const [role, setRole] = useState(user?.role);
  
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem("ff_sidebar_collapsed") === "1");

  // Page Height Limit, Page Overlay Scroll, & Dedicated Menu Overlay Scroll preferences
  const [heightMode, setHeightMode] = useState(() =>
    (typeof window !== "undefined" && localStorage.getItem("ff_page_height_mode")) || "viewport"
  );
  const [pageOverlayScroll, setPageOverlayScroll] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem("ff_overlay_scroll") !== "0"
  );
  const [menuOverlayScroll, setMenuOverlayScroll] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem("ff_menu_overlay_scroll") !== "0"
  );

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const n = !c;
      localStorage.setItem("ff_sidebar_collapsed", n ? "1" : "0");
      return n;
    });
  };

  const changeHeightMode = (mode) => {
    setHeightMode(mode);
    localStorage.setItem("ff_page_height_mode", mode);
  };

  const togglePageOverlayScroll = () => {
    setPageOverlayScroll((prev) => {
      const next = !prev;
      localStorage.setItem("ff_overlay_scroll", next ? "1" : "0");
      return next;
    });
  };

  const toggleMenuOverlayScroll = () => {
    setMenuOverlayScroll((prev) => {
      const next = !prev;
      localStorage.setItem("ff_menu_overlay_scroll", next ? "1" : "0");
      return next;
    });
  };

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

  // Update browser tab name based on active page and branding settings
  useEffect(() => {
    if (typeof document === "undefined") return;
    const appName = branding?.app_name || "FormForge";
    const curPath = window.location.pathname;
    const activeItem = (menu || []).find((m) => {
      const target = PATH_ALIASES[m.path] || m.path;
      return curPath === target || (target !== "/" && curPath.startsWith(target + "/"));
    });
    if (activeItem?.label) {
      document.title = `${activeItem.label} | ${appName}`;
    } else {
      document.title = appName;
    }
  }, [menu, branding]);

  const initials = (user?.name || user?.email || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  // Dynamic height class calculation
  let heightContainerClass = "h-[calc(100vh-3rem)] max-h-[calc(100vh-3rem)]";
  if (heightMode === "compact") heightContainerClass = "h-[850px] max-h-[850px]";
  else if (heightMode === "expanded") heightContainerClass = "h-[1100px] max-h-[1100px]";
  else if (heightMode === "auto") heightContainerClass = "min-h-[calc(100vh-3rem)]";

  const appBgUrl = branding?.bg_image_url
    ? (branding.bg_image_url.startsWith("http")
        ? branding.bg_image_url
        : `${process.env.REACT_APP_BACKEND_URL || ""}${branding.bg_image_url}`)
    : null;

  const cleanAppBg = (appBgUrl || "").split("?")[0].toLowerCase();
  const isAppVideo = cleanAppBg.endsWith(".mp4") || cleanAppBg.endsWith(".webm") || cleanAppBg.endsWith(".mov") || cleanAppBg.endsWith(".ogg") || cleanAppBg.endsWith(".m4v");

  return (
    <div
      className="h-screen max-h-screen w-screen overflow-hidden bg-slate-50 flex relative"
      style={appBgUrl && !isAppVideo ? {
        backgroundImage: `url(${appBgUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      } : undefined}
    >
      {isAppVideo && (
        <video
          src={appBgUrl}
          autoPlay
          loop
          muted
          playsInline
          className="fixed inset-0 w-full h-full object-cover pointer-events-none z-0 opacity-30"
        />
      )}
      {/* Sidebar Container */}
      <aside
        data-testid="sidebar"
        className={`${collapsed ? "w-16" : "w-64"} shrink-0 h-screen max-h-screen overflow-hidden border-r border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm text-slate-800 dark:text-slate-100 flex flex-col transition-[width] duration-200`}
      >
        <div className={`${collapsed ? "p-3" : "p-6"} border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2`}>
          <Link to="/dashboard" data-testid="brand-link" className="flex items-center gap-2 min-w-0">
            {branding?.logo_url ? (
              <img
                src={branding.logo_url.startsWith("http")
                  ? branding.logo_url
                  : `${process.env.REACT_APP_BACKEND_URL || ""}${branding.logo_url}`}
                alt="logo"
                className="w-9 h-9 rounded-xl object-contain bg-slate-100 dark:bg-slate-800 shrink-0"
              />
            ) : (
              <div
                className="w-9 h-9 rounded-xl text-white flex items-center justify-center font-bold shrink-0"
                style={{ background: branding?.primary_color || "#2563EB" }}
              >
                <Sparkles className="w-4 h-4" />
              </div>
            )}
            {!collapsed && (
              <span className="font-heading font-bold text-lg tracking-tight truncate dark:text-white">
                {branding?.app_name || "FormForge"}
              </span>
            )}
          </Link>
          {!collapsed && (
            <button
              onClick={toggleCollapsed}
              data-testid="sidebar-collapse-btn"
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Navigation links with group headers */}
        <nav
          className={`flex-1 ${collapsed ? "px-1" : "px-3"} py-4 space-y-6 ${
            menuOverlayScroll
              ? "menu-overlay-scroll overflow-y-auto relative scroll-smooth bg-slate-50/50 dark:bg-slate-900/50"
              : "overflow-y-auto"
          }`}
        >
          {collapsed && (
            <div className="flex justify-center pb-2">
              <button
                onClick={toggleCollapsed}
                data-testid="sidebar-expand-btn"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                title="Expand sidebar"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            </div>
          )}
          {groups.map((g) => {
            const items = menu.filter((m) => (m.group || "workspace") === g.key);
            if (items.length === 0) return null;
            return (
              <div key={g.key} data-testid={`nav-group-${g.key}`}>
                {g.label && !collapsed && (
                  <div className="px-3 pb-1.5 text-[10px] uppercase tracking-[0.12em] font-bold text-slate-400 dark:text-slate-500">
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
                        title={collapsed ? item.label : undefined}
                        className={({ isActive }) =>
                          `flex items-center ${collapsed ? "justify-center px-2" : "gap-3 px-3"} py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                            isActive
                              ? "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 shadow-sm border border-blue-100 dark:border-blue-800"
                              : "text-slate-600 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800"
                          }`
                        }
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {menu.length === 0 && !collapsed && (
            <div className="text-xs text-slate-400 px-3 py-2">Loading menu…</div>
          )}
        </nav>

        {/* User Profile Footer */}
        <div className={`${collapsed ? "p-2" : "p-4"} border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900`}>
          <DropdownMenu>
            <DropdownMenuTrigger
              data-testid="user-menu"
              className={`w-full flex items-center ${collapsed ? "justify-center" : "gap-3 p-2"} rounded-lg hover:bg-slate-50 transition-colors`}
              title={collapsed ? user?.name : undefined}
            >
              <Avatar className="w-8 h-8 shrink-0">
                {user?.picture ? <AvatarImage src={user.picture} alt={user.name} /> : null}
                <AvatarFallback className="text-xs bg-blue-100 text-blue-700">{initials}</AvatarFallback>
              </Avatar>
              {!collapsed && (
                <>
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{user?.name}</div>
                    <div className="text-xs text-slate-500" data-testid="user-role-label">{ROLE_LABELS[role] || role}</div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                </>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 dark:bg-slate-900 dark:border-slate-800">
              <DropdownMenuLabel className="dark:text-slate-200">{user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator className="dark:border-slate-800" />
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-semibold">Theme</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setTheme("light")} className="cursor-pointer dark:focus:bg-slate-800 dark:text-slate-200">
                <Sun className="w-4 h-4 mr-2 text-amber-500" /> Light Mode {theme === "light" && "✓"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("dark")} className="cursor-pointer dark:focus:bg-slate-800 dark:text-slate-200">
                <Moon className="w-4 h-4 mr-2 text-indigo-400" /> Dark Mode {theme === "dark" && "✓"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("system")} className="cursor-pointer dark:focus:bg-slate-800 dark:text-slate-200">
                <Monitor className="w-4 h-4 mr-2 text-slate-400" /> System Default {theme === "system" && "✓"}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="dark:border-slate-800" />
              <DropdownMenuItem data-testid="menu-logout" onClick={() => { logout(); nav("/login"); }} className="dark:focus:bg-slate-800 dark:text-slate-200">
                <LogOut className="w-4 h-4 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
      
      <main className={`flex-1 flex flex-col h-screen overflow-hidden ${appBgUrl ? "bg-slate-950/10" : "bg-slate-50 dark:bg-slate-950"}`}>
        {/* Top Header Control Bar */}
        <div className={`h-12 shrink-0 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 gap-2 ${appBgUrl ? "bg-white/85 dark:bg-slate-900/85 backdrop-blur-md" : "bg-white dark:bg-slate-900"}`}>
          {/* Active Height & Overlay Status Badges */}
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded-full bg-slate-100/90 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-[11px] border border-slate-200 dark:border-slate-700">
              Height: <b>{heightMode}</b>
            </span>
            {pageOverlayScroll && (
              <span className="px-2 py-0.5 rounded-full bg-blue-50/90 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 font-mono text-[11px] border border-blue-200 dark:border-blue-800">
                Page Overlay: <b>ON</b>
              </span>
            )}
            {menuOverlayScroll && (
              <span className="px-2 py-0.5 rounded-full bg-indigo-50/90 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 font-mono text-[11px] border border-indigo-200 dark:border-indigo-800">
                Menu Overlay: <b>ON</b>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {/* Quick Dark / Light Mode Toggle Button */}
            <button
              onClick={toggleTheme}
              title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600 dark:text-slate-300" />}
            </button>

            {/* Page & Menu Height & Overlay Configuration Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition text-slate-700 dark:text-slate-200" title="Configure Page Height Limit & Overlay Scroll">
                <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Page &amp; Menu Overlay</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 p-3.5 space-y-3.5 bg-white dark:bg-slate-900 shadow-xl rounded-xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
                <div>
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Maximize2 className="w-3 h-3 text-blue-600 dark:text-blue-400" /> Page Height Limit
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <button
                      onClick={() => changeHeightMode("viewport")}
                      className={`px-2 py-1.5 rounded-lg border text-left font-medium transition ${
                        heightMode === "viewport"
                          ? "border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold"
                          : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      Viewport (100vh)
                    </button>
                    <button
                      onClick={() => changeHeightMode("compact")}
                      className={`px-2 py-1.5 rounded-lg border text-left font-medium transition ${
                        heightMode === "compact"
                          ? "border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold"
                          : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      Compact (850px)
                    </button>
                    <button
                      onClick={() => changeHeightMode("expanded")}
                      className={`px-2 py-1.5 rounded-lg border text-left font-medium transition ${
                        heightMode === "expanded"
                          ? "border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold"
                          : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      Expanded (1100px)
                    </button>
                    <button
                      onClick={() => changeHeightMode("auto")}
                      className={`px-2 py-1.5 rounded-lg border text-left font-medium transition ${
                        heightMode === "auto"
                          ? "border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold"
                          : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      Auto (Unlimited)
                    </button>
                  </div>
                </div>

                {/* Overlay Toggle Controls */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Layers className="w-3 h-3 text-indigo-600 dark:text-indigo-400" /> Dedicated Overlay Controls
                  </div>
                  
                  {/* Menu Dedicated Overlay Switch */}
                  <label className="flex items-center justify-between cursor-pointer text-xs p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <span className="font-medium text-slate-700 dark:text-slate-200">Menu Panel Dedicated Overlay</span>
                    <input
                      type="checkbox"
                      checked={menuOverlayScroll}
                      onChange={toggleMenuOverlayScroll}
                      className="w-4 h-4 accent-blue-600 rounded"
                    />
                  </label>

                  {/* Main Page Content Overlay Switch */}
                  <label className="flex items-center justify-between cursor-pointer text-xs p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <span className="font-medium text-slate-700 dark:text-slate-200">Main Content Page Overlay</span>
                    <input
                      type="checkbox"
                      checked={pageOverlayScroll}
                      onChange={togglePageOverlayScroll}
                      className="w-4 h-4 accent-blue-600 rounded"
                    />
                  </label>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <NotificationsBell />
          </div>
        </div>

        {/* Main Content Area with Page Height Limit & Page Overlay Scroll */}
        <div
          id="main-page-scroll-container"
          className={`flex-1 ${fullWidth ? "" : "p-8"} ${heightContainerClass} ${
            pageOverlayScroll
              ? "page-overlay-scroll overflow-y-auto relative scroll-smooth shadow-inner"
              : "overflow-y-auto"
          } ${appBgUrl ? "bg-slate-50/60 dark:bg-slate-950/60 backdrop-blur-[2px]" : "bg-slate-50 dark:bg-slate-950"}`}
        >
          {children}

          {/* Floating Overlay Scroll Down / Up Navigation Controls */}
          {pageOverlayScroll && (
            <div className="fixed bottom-6 right-8 flex flex-col gap-2 z-40">
              <button
                onClick={() => {
                  document.getElementById("main-page-scroll-container")?.scrollTo({ top: 0, behavior: "smooth" });
                }}
                title="Scroll to Top"
                className="w-10 h-10 rounded-full bg-white border border-slate-300 shadow-xl flex items-center justify-center text-slate-700 hover:bg-blue-600 hover:text-white transition group"
              >
                <ArrowUp className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  const el = document.getElementById("main-page-scroll-container");
                  if (el) el.scrollTo({ top: el.scrollTop + 450, behavior: "smooth" });
                }}
                title="Scroll Down"
                className="w-10 h-10 rounded-full bg-blue-600 text-white shadow-xl flex items-center justify-center hover:bg-blue-700 transition group"
              >
                <ArrowDown className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </main>
      <AiChatbotWidget />
    </div>
  );
}
