import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import {
  Activity, CheckCircle2, XCircle, Clock, Mail, TrendingUp, Workflow,
} from "lucide-react";

export default function WorkflowAnalyticsPage() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/workflow-analytics").then((r) => setStats(r.data)).catch(() => setStats({}));
  }, []);

  if (!stats) return <AppLayout><div className="text-slate-400">Loading…</div></AppLayout>;

  const cards = [
    { label: "Total executions", value: stats.total_executions || 0, icon: Activity, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Successful",       value: stats.successful || 0,       icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Failed",           value: stats.failed || 0,           icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
    { label: "Waiting approval", value: stats.waiting_approval || 0, icon: Clock, color: "text-violet-600", bg: "bg-violet-50" },
  ];

  return (
    <AppLayout>
      <div className="max-w-7xl">
        <div className="mb-6">
          <span className="text-xs uppercase tracking-[0.1em] text-slate-400 font-bold">Insights</span>
          <h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight text-slate-900 mt-1">
            Workflow Analytics
          </h1>
          <p className="text-slate-500 mt-1">Performance and reliability of your automations.</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {cards.map((c) => (
            <Card key={c.label} className="rounded-2xl border-slate-100 card-soft p-5">
              <div className={`w-10 h-10 ${c.bg} ${c.color} rounded-xl flex items-center justify-center mb-3`}>
                <c.icon className="w-5 h-5" />
              </div>
              <div className="text-3xl font-heading font-bold tracking-tight">{c.value.toLocaleString()}</div>
              <div className="text-xs text-slate-500 mt-1">{c.label}</div>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="rounded-2xl border-slate-100 card-soft p-5 md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-slate-700">Average duration</span>
            </div>
            <div className="text-3xl font-heading font-bold tracking-tight">{stats.avg_duration_ms || 0} <span className="text-base text-slate-400">ms</span></div>
            <p className="text-xs text-slate-500 mt-2">Across successful executions.</p>
          </Card>

          <Card className="rounded-2xl border-slate-100 card-soft p-5 md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <Mail className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-slate-700">Email queue</span>
            </div>
            <div className="text-3xl font-heading font-bold tracking-tight">
              {stats.email?.sent || 0}<span className="text-base text-slate-400">/{stats.email?.total || 0}</span>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {Math.round(stats.email?.success_rate || 0)}% delivery rate · {stats.email?.failed || 0} failed
            </p>
          </Card>

          <Card className="rounded-2xl border-slate-100 card-soft p-5 md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <Workflow className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-slate-700">Most used workflows</span>
            </div>
            {(stats.most_used || []).length === 0 ? (
              <p className="text-xs text-slate-400">No data yet.</p>
            ) : (
              <ul className="space-y-2 mt-1">
                {(stats.most_used || []).map((w, i) => (
                  <li key={w.workflow_id} className="flex items-center justify-between text-sm">
                    <Link to={`/workflows/${w.workflow_id}/build`} className="text-slate-700 hover:text-blue-600 truncate">
                      {i + 1}. {w.name}
                    </Link>
                    <span className="text-xs font-medium text-slate-500">{w.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
