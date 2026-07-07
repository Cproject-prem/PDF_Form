import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Bell, CheckCheck, Inbox } from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

/**
 * Bell icon in the header — polls unread count every 30s and shows the
 * list of unread + last-25 notifications in a popover.
 */
export default function NotificationsBell() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const refreshCount = useCallback(async () => {
    try {
      const r = await api.get("/notifications/unread-count");
      setCount(r.data?.count || 0);
    } catch {
      /* ignore */
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/notifications");
      setItems(r.data || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCount();
    const t = setInterval(refreshCount, 30000);
    return () => clearInterval(t);
  }, [refreshCount]);

  useEffect(() => {
    if (open) loadList();
  }, [open, loadList]);

  const openItem = async (n) => {
    try {
      await api.patch(`/notifications/${n.notification_id}/read`);
    } catch {
      /* ignore */
    }
    setOpen(false);
    if (n.link) nav(n.link);
    refreshCount();
  };

  const markAll = async () => {
    await api.post("/notifications/read-all");
    setItems((xs) => xs.map((x) => ({ ...x, read: true })));
    setCount(0);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          data-testid="notif-bell"
          className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5" />
          {count > 0 && (
            <span
              data-testid="notif-badge"
              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center leading-none"
            >
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0" data-testid="notif-popover">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="font-medium text-slate-800">Notifications</div>
          {items.some((n) => !n.read) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAll}
              data-testid="notif-mark-all"
              className="h-7 text-xs"
            >
              <CheckCheck className="w-3.5 h-3.5 mr-1" /> Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-[420px] overflow-y-auto nice-scroll">
          {loading ? (
            <div className="p-6 text-center text-slate-400 text-sm">Loading…</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center">
              <Inbox className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-sm text-slate-500 mt-2">You&apos;re all caught up.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((n) => (
                <li key={n.notification_id}>
                  <button
                    onClick={() => openItem(n)}
                    data-testid={`notif-item-${n.notification_id}`}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${
                      n.read ? "" : "bg-blue-50/40"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read && (
                        <span className="w-2 h-2 rounded-full bg-blue-600 mt-1.5 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">
                          {n.title}
                        </div>
                        {n.body && (
                          <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                            {n.body}
                          </div>
                        )}
                        <div className="text-[10px] text-slate-400 mt-1">
                          {formatWhen(n.created_at)}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function formatWhen(iso) {
  try {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString();
  } catch {
    return "";
  }
}
