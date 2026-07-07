import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import LoginPage from "@/pages/Login";
import RegisterPage from "@/pages/Register";
import AuthCallbackPage from "@/pages/AuthCallback";
import DashboardPage from "@/pages/Dashboard";
import FormsPage from "@/pages/Forms";
import FormBuilderPage from "@/pages/FormBuilder";
import PublicFormPage from "@/pages/PublicForm";
import SubmissionsPage from "@/pages/Submissions";
import SubmissionsHubPage from "@/pages/SubmissionsHub";
import PlantsPage from "@/pages/Plants";
import SettingsPage from "@/pages/Settings";
import UsersPage from "@/pages/Users";
import PdfBuilderPage from "@/pages/PdfBuilder";
import PdfSubmissionsPage from "@/pages/PdfSubmissions";
import PublicPdfFormPage from "@/pages/PublicPdfForm";
import WorkflowsPage from "@/pages/Workflows";
import WorkflowDesignerPage from "@/pages/WorkflowDesigner";
import ApprovalsPage from "@/pages/Approvals";
import AuditLogsPage from "@/pages/AuditLogs";
import WorkflowAnalyticsPage from "@/pages/WorkflowAnalytics";
import SmtpSettingsPage from "@/pages/SmtpSettings";
import PublicApprovalPage from "@/pages/PublicApproval";
import VendorsPage from "@/pages/Vendors";
import SiteMasterPage from "@/pages/SiteMaster";
import MasterDataPage from "@/pages/MasterData";
import "@/App.css";

function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

function Router() {
  const location = useLocation();
  // Handle session_id from Google Auth synchronously during render (avoids race conditions)
  if (location.hash?.includes("session_id=")) {
    return <AuthCallbackPage />;
  }
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/f/:slug" element={<PublicFormPage />} />
      <Route path="/p/:slug" element={<PublicPdfFormPage />} />
      <Route path="/approve/:token" element={<PublicApprovalPage />} />

      <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
      <Route path="/submissions" element={<Protected><SubmissionsHubPage /></Protected>} />
      <Route path="/forms" element={<Protected><FormsPage /></Protected>} />
      <Route path="/pdf-forms" element={<Protected><FormsPage /></Protected>} />
      <Route path="/forms/:id/build" element={<Protected><FormBuilderPage /></Protected>} />
      <Route path="/forms/:id/submissions" element={<Protected><SubmissionsPage /></Protected>} />
      <Route path="/pdf-forms/:id/build" element={<Protected><PdfBuilderPage /></Protected>} />
      <Route path="/pdf-forms/:id/submissions" element={<Protected><PdfSubmissionsPage /></Protected>} />
      <Route path="/workflows" element={<Protected><WorkflowsPage /></Protected>} />
      <Route path="/workflows/:id/build" element={<Protected><WorkflowDesignerPage /></Protected>} />
      <Route path="/approvals" element={<Protected><ApprovalsPage /></Protected>} />
      <Route path="/workflow-analytics" element={<Protected><WorkflowAnalyticsPage /></Protected>} />
      <Route path="/reports" element={<Protected><WorkflowAnalyticsPage /></Protected>} />
      <Route path="/audit-logs" element={<Protected><AuditLogsPage /></Protected>} />
      <Route path="/settings/smtp" element={<Protected><SmtpSettingsPage /></Protected>} />
      <Route path="/vendors" element={<Protected><VendorsPage /></Protected>} />
      <Route path="/sites" element={<Protected><SiteMasterPage /></Protected>} />
      <Route path="/plants" element={<Protected><PlantsPage /></Protected>} />
      <Route path="/plants/:site_code" element={<Protected><PlantsPage /></Protected>} />
      <Route path="/master-data" element={<Protected><MasterDataPage /></Protected>} />
      <Route path="/team" element={<Protected><UsersPage /></Protected>} />
      <Route path="/settings" element={<Protected roles={["super_admin"]}><SettingsPage /></Protected>} />
      <Route path="/users" element={<Protected roles={["super_admin", "admin"]}><UsersPage /></Protected>} />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Router />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </BrowserRouter>
  );
}
