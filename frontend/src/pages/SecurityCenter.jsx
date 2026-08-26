import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ShieldCheck, ShieldAlert, ShieldX, Play, RotateCcw, Download, Search,
  ExternalLink, CheckCircle2, AlertTriangle, XCircle, HelpCircle, Lock,
  Settings2, Activity, Server, FileText, Cpu, Eye
} from "lucide-react";

export default function SecurityCenterPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [findings, setFindings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [q, setQ] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [activeSeverity, setActiveSeverity] = useState("all");

  const loadStatus = async () => {
    setLoading(true);
    try {
      const [resStatus, resFind] = await Promise.all([
        api.get("/security/status"),
        api.get("/security/findings")
      ]);
      setStatus(resStatus.data);
      setFindings(resFind.data.findings || []);
    } catch (e) {
      toast.error("Failed to load Security Center status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStatus(); }, []);

  const runScan = async (mode = "full") => {
    setScanning(true);
    toast.info(`Running ${mode} security scan...`);
    try {
      const res = await api.post("/security/scan", { mode });
      toast.success("Security scan completed successfully");
      loadStatus();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Scan execution failed");
    } finally {
      setScanning(false);
    }
  };

  const downloadReport = async (format = "json") => {
    try {
      const token = localStorage.getItem("ff_token");
      const resp = await fetch(`${process.env.REACT_APP_BACKEND_URL || ""}/api/security/report?format=${format}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!resp.ok) throw new Error("Download failed");
      const text = await resp.text();
      const blob = new Blob([text], { type: format === "markdown" ? "text/markdown" : "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `formforge-security-report.${format === "markdown" ? "md" : "json"}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Security report downloaded (${format.toUpperCase()})`);
    } catch {
      toast.error("Failed to export security report");
    }
  };

  if (loading || !status) {
    return (
      <AppLayout>
        <div className="text-slate-400 p-8">Loading Security & Compliance Center…</div>
      </AppLayout>
    );
  }

  const score = status.score || 85;
  const badge = status.status_badge || "Attention Required";
  const counts = status.counts || {};

  const filteredFindings = findings.filter((f) => {
    if (activeTab !== "all" && f.category !== activeTab) return false;
    if (activeSeverity !== "all" && f.severity.toUpperCase() !== activeSeverity.toUpperCase()) return false;
    if (q) {
      const blob = `${f.control_id} ${f.name} ${f.description} ${f.evidence} ${f.remediation}`.toLowerCase();
      if (!blob.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const getStatusBadge = (st) => {
    switch (st) {
      case "PASS":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold"><CheckCircle2 className="w-3.5 h-3.5" /> PASS</span>;
      case "FAIL":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-xs font-bold"><XCircle className="w-3.5 h-3.5" /> FAIL</span>;
      case "PARTIAL":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-bold"><AlertTriangle className="w-3.5 h-3.5" /> PARTIAL</span>;
      case "MANUAL REVIEW REQUIRED":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold"><HelpCircle className="w-3.5 h-3.5" /> MANUAL REVIEW</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">{st}</span>;
    }
  };

  const getSeverityBadge = (sev) => {
    switch (sev?.toUpperCase()) {
      case "CRITICAL":
        return <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-[10px]">CRITICAL</span>;
      case "HIGH":
        return <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-800 font-bold text-[10px]">HIGH</span>;
      case "MEDIUM":
        return <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">MEDIUM</span>;
      case "LOW":
        return <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[10px]">LOW</span>;
      default:
        return <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold text-[10px]">{sev}</span>;
    }
  };

  return (
    <AppLayout>
      <div className="max-w-7xl space-y-6">
        {/* Top Title & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs uppercase tracking-[0.1em] text-slate-400 font-bold">Portal Hardening & Auditing</span>
            <h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight text-slate-900 mt-1 flex items-center gap-2">
              <ShieldCheck className="w-8 h-8 text-blue-600" />
              Security & Compliance Center
            </h1>
            <p className="text-slate-500 mt-1">
              Platform-wide automated control audit, vulnerability monitoring, and evidence verification.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => runScan("full")}
              disabled={scanning}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium"
              data-testid="run-full-scan-btn"
            >
              <Play className="w-4 h-4 mr-1.5" />
              {scanning ? "Scanning…" : "Run Full Security Scan"}
            </Button>
            <Button
              onClick={() => runScan("quick")}
              disabled={scanning}
              variant="outline"
              data-testid="run-quick-scan-btn"
            >
              <RotateCcw className="w-4 h-4 mr-1.5" /> Run Quick Scan
            </Button>
            <Button
              onClick={() => downloadReport("markdown")}
              variant="outline"
              data-testid="export-report-btn"
            >
              <Download className="w-4 h-4 mr-1.5" /> Export Security Report
            </Button>
            <Button
              onClick={() => navigate("/security/settings")}
              variant="ghost"
              className="text-slate-700 hover:bg-slate-100"
            >
              <Settings2 className="w-4 h-4 mr-1.5" /> Security Config
            </Button>
          </div>
        </div>

        {/* Security Score Overview Card */}
        <Card className="p-6 rounded-2xl border-slate-100 card-soft bg-white">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Overall Score */}
            <div className="lg:col-span-1 border-b lg:border-b-0 lg:border-r border-slate-100 pr-6 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Security Score</div>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-heading font-extrabold tracking-tight text-slate-900">{score}%</span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  badge === "Secure" ? "bg-emerald-50 text-emerald-700" :
                  badge === "Attention Required" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"
                }`}>
                  {badge}
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    score >= 90 ? "bg-emerald-500" : score >= 75 ? "bg-amber-500" : "bg-rose-500"
                  }`}
                  style={{ width: `${score}%` }}
                />
              </div>
              <div className="text-[11px] text-slate-400 pt-1">
                Last scan: <span className="text-slate-600 font-medium">{status.last_scan || "Never"}</span>
              </div>
            </div>

            {/* Issue Counters */}
            <div className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 rounded-xl bg-rose-50/50 border border-rose-100 space-y-1">
                <div className="text-xs font-bold text-rose-700 uppercase tracking-wider">Critical Issues</div>
                <div className="text-2xl font-extrabold text-rose-900">{counts.CRITICAL || 0}</div>
                <div className="text-[11px] text-rose-600 font-medium">Immediate remediation</div>
              </div>
              <div className="p-4 rounded-xl bg-orange-50/50 border border-orange-100 space-y-1">
                <div className="text-xs font-bold text-orange-700 uppercase tracking-wider">High Issues</div>
                <div className="text-2xl font-extrabold text-orange-900">{counts.HIGH || 0}</div>
                <div className="text-[11px] text-orange-600 font-medium">Action required</div>
              </div>
              <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-100 space-y-1">
                <div className="text-xs font-bold text-amber-700 uppercase tracking-wider">Medium Issues</div>
                <div className="text-2xl font-extrabold text-amber-900">{counts.MEDIUM || 0}</div>
                <div className="text-[11px] text-amber-600 font-medium">Hardening target</div>
              </div>
              <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-100 space-y-1">
                <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Passed Controls</div>
                <div className="text-2xl font-extrabold text-emerald-900">{counts.PASS_COUNT || 0} / {counts.TOTAL_CONTROLS || 0}</div>
                <div className="text-[11px] text-emerald-600 font-medium">Verified empirical</div>
              </div>
            </div>
          </div>
        </Card>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search controls by ID, name, evidence, or component…"
              className="pl-9 h-9 text-xs"
              data-testid="security-search-input"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="text-xs text-slate-500 font-medium shrink-0">Severity:</span>
            {["all", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setActiveSeverity(sev)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors shrink-0 capitalize ${
                  activeSeverity === sev ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>

        {/* 38 Categories Selector & Findings Table */}
        <Card className="rounded-2xl border-slate-100 card-soft bg-white overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 overflow-x-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-colors ${
                activeTab === "all" ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              All Categories ({status.categories?.length || 38})
            </button>
            {(status.categories || []).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveTab(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-colors ${
                  activeTab === cat.id ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Controls Findings List */}
          <div className="overflow-x-auto">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-bold text-slate-700">Control ID</TableHead>
                  <TableHead className="font-bold text-slate-700">Control Name & Description</TableHead>
                  <TableHead className="font-bold text-slate-700">Severity</TableHead>
                  <TableHead className="font-bold text-slate-700">Status</TableHead>
                  <TableHead className="font-bold text-slate-700">Evidence & Verification</TableHead>
                  <TableHead className="font-bold text-slate-700">Remediation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFindings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-slate-400">
                      No security controls match your search criteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredFindings.map((f) => (
                    <TableRow key={f.control_id} className="hover:bg-slate-50/80">
                      <TableCell className="font-mono font-bold text-slate-900 whitespace-nowrap">
                        {f.control_id}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="font-bold text-slate-800 text-xs">{f.name}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{f.description}</div>
                        <div className="text-[10px] text-slate-400 mt-1 font-mono">{f.affected_component}</div>
                      </TableCell>
                      <TableCell>{getSeverityBadge(f.severity)}</TableCell>
                      <TableCell>{getStatusBadge(f.status)}</TableCell>
                      <TableCell className="max-w-xs">
                        <div className="text-xs text-slate-700 bg-slate-50 p-2 rounded border border-slate-100 font-mono text-[11px]">
                          {f.evidence}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="text-xs text-slate-600">{f.remediation}</div>
                        {f.documentation_reference && (
                          <div className="text-[10px] text-blue-600 mt-1 font-mono flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" /> {f.documentation_reference}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
