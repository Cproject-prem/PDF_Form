import React, { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { api } from "@/lib/api";
import { formatBytes, formatDate } from "@/lib/utils2";
import { Card } from "@/components/ui/card";
import {
  FileStack, MessagesSquare, CalendarClock, AlarmClock, Users as UsersIcon, HardDrive, ArrowUpRight
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from "recharts";
import { Link } from "react-router-dom";

const StatCard = ({ icon: Icon, label, value, accent = "blue", testid }) => (
  <Card data-testid={testid} className="p-6 bg-white border-slate-100 card-soft rounded-2xl">
    <div className="flex items-start justify-between">
      <div>
        <div className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{label}</div>
        <div className="text-3xl font-heading font-bold tracking-tight mt-2 text-slate-900">{value}</div>
      </div>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-${accent}-50 text-${accent}-600`}>
        <Icon className="w-5 h-5" />
      </div>
    </div>
  </Card>
);

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/dashboard/stats").then((r) => setStats(r.data)).finally(() => setLoading(false));
  }, []);

  return (
    <AppLayout>
      <div className="max-w-7xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight text-slate-900">Dashboard</h1>
            <p className="text-slate-500 mt-1">A quick look at your forms and submissions.</p>
          </div>
          <Link to="/forms" data-testid="dashboard-cta" className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            Go to My Forms <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>

        {loading || !stats ? (
          <div className="text-slate-400">Loading…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
              <StatCard testid="stat-forms" icon={FileStack} label="Total Forms" value={stats.totals.forms} accent="blue" />
              <StatCard testid="stat-submissions" icon={MessagesSquare} label="Submissions" value={stats.totals.submissions} accent="indigo" />
              <StatCard testid="stat-today" icon={CalendarClock} label="Today" value={stats.totals.today} accent="emerald" />
              <StatCard testid="stat-pending" icon={AlarmClock} label="Pending" value={stats.totals.pending} accent="amber" />
              <StatCard testid="stat-users" icon={UsersIcon} label="Users" value={stats.totals.users} accent="violet" />
              <StatCard testid="stat-storage" icon={HardDrive} label="Storage" value={formatBytes(stats.totals.storage_bytes)} accent="sky" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              <Card className="lg:col-span-2 p-6 rounded-2xl border-slate-100 card-soft">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-heading font-semibold tracking-tight">Submission Trends</h2>
                    <p className="text-xs text-slate-500">Last 14 days</p>
                  </div>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats.trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                      <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} />
                      <Line type="monotone" dataKey="count" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card className="p-6 rounded-2xl border-slate-100 card-soft">
                <h2 className="text-lg font-heading font-semibold tracking-tight mb-4">Top Forms</h2>
                {stats.per_form.length === 0 ? (
                  <div className="text-sm text-slate-400">No forms yet.</div>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.per_form} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis type="number" stroke="#94a3b8" fontSize={12} allowDecimals={false} />
                        <YAxis dataKey="title" type="category" width={120} stroke="#94a3b8" fontSize={11} />
                        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} />
                        <Bar dataKey="count" fill="#2563EB" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
            </div>

            <Card className="p-6 rounded-2xl border-slate-100 card-soft" data-testid="recent-activity">
              <h2 className="text-lg font-heading font-semibold tracking-tight mb-4">Recent Activity</h2>
              {stats.activity.length === 0 ? (
                <div className="text-sm text-slate-400">No activity yet — publish a form to start collecting submissions.</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {stats.activity.map((a) => (
                    <li key={a.submission_id} className="py-3 flex items-center gap-4">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><MessagesSquare className="w-4 h-4" /></div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-800 truncate">New submission to <span className="font-semibold">{a.form_title}</span></div>
                        <div className="text-xs text-slate-500">{formatDate(a.created_at)}</div>
                      </div>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        a.status === "approved" ? "bg-emerald-50 text-emerald-700"
                        : a.status === "rejected" ? "bg-red-50 text-red-700"
                        : "bg-amber-50 text-amber-700"}`}>{a.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
