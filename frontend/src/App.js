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
import ManpowerPage from "@/pages/Manpower";
import WelcomeEmailSettingsPage from "@/pages/WelcomeEmailSettings";
import SettingsPage from "@/pages/Settings";
import UsersPage from "@/pages/Users";
import PdfBuilderPage from "@/pages/PdfBuilder";
import PdfSubmissionsPage from "@/pages/PdfSubmissions";
import PublicPdfFormPage from "@/pages/PublicPdfForm";
import EditPdfSubmissionPage from "@/pages/EditPdfSubmission";
import WorkflowsPage from "@/pages/Workflows";
import WorkflowDesignerPage from "@/pages/WorkflowDesigner";
import ApprovalsPage from "@/pages/Approvals";
import AuditLogsPage from "@/pages/AuditLogs";
import SecurityCenterPage from "@/pages/SecurityCenter";
import SecuritySettingsPage from "@/pages/SecuritySettings";
import WorkflowAnalyticsPage from "@/pages/WorkflowAnalytics";
import SmtpSettingsPage from "@/pages/SmtpSettings";
import PublicApprovalPage from "@/pages/PublicApproval";
import AiTrainingPage from "@/pages/AiTraining";
import VendorsPage from "@/pages/Vendors";
import SiteMasterPage from "@/pages/SiteMaster";
import MasterDataPage from "@/pages/MasterData";
import SchedulePage from "@/pages/Schedule";
import InventoryPage from "@/pages/Inventory";
import "@/App.css";

function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role) && !user.access_override) return <Navigate to="/dashboard" replace />;
  return children;
}

// Role constants — keep in sync with usePermissions.js
const SUPER_ADMIN_ONLY       = ["super_admin"];
const ADMIN_PLUS             = ["super_admin", "admin"];
const VENDOR_ADMIN_PLUS      = ["super_admin", "admin", "vendor_admin"];
const ALL_VENDOR_ROLES       = ["super_admin", "admin", "vendor_admin", "vendor_user"];
const BUILDER_ROLES          = ADMIN_PLUS; // FormBuilder / PdfBuilder

function Router() {
  const location = useLocation();
  // Handle session_id from Google Auth synchronously during render (avoids race conditions)
  if (location.hash?.includes("session_id=")) {
    return <AuthCallbackPage />;
  }
  return (
    <Routes>
      {/* ── Public routes ─────────────────────── */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/f/:slug" element={<PublicFormPage />} />
      <Route path="/p/:slug" element={<PublicPdfFormPage />} />
      <Route path="/p/:slug/edit/:submissionId" element={<EditPdfSubmissionPage />} />
      <Route path="/approve/:token" element={<PublicApprovalPage />} />

      {/* ── Admin+ workspace ──────────────────── */}
      <Route path="/dashboard" element={<Protected roles={ADMIN_PLUS}><DashboardPage /></Protected>} />
      <Route path="/workflows" element={<Protected roles={ADMIN_PLUS}><WorkflowsPage /></Protected>} />
      <Route path="/workflows/:id/build" element={<Protected roles={BUILDER_ROLES}><WorkflowDesignerPage /></Protected>} />
      <Route path="/approvals" element={<Protected roles={ADMIN_PLUS}><ApprovalsPage /></Protected>} />
      <Route path="/workflow-analytics" element={<Protected roles={SUPER_ADMIN_ONLY}><WorkflowAnalyticsPage /></Protected>} />
      <Route path="/reports" element={<Protected roles={ADMIN_PLUS}><WorkflowAnalyticsPage /></Protected>} />
      <Route path="/inventory" element={<Protected roles={ADMIN_PLUS}><InventoryPage /></Protected>} />
      <Route path="/master-data" element={<Protected roles={ADMIN_PLUS}><MasterDataPage /></Protected>} />
      <Route path="/users" element={<Protected roles={ADMIN_PLUS}><UsersPage /></Protected>} />
      <Route path="/ai-training" element={<Protected roles={ADMIN_PLUS}><AiTrainingPage /></Protected>} />

      {/* ── Forms / Submissions (all authenticated) ── */}
      <Route path="/submissions" element={<Protected><SubmissionsHubPage /></Protected>} />
      <Route path="/forms" element={<Protected><FormsPage /></Protected>} />
      <Route path="/pdf-forms" element={<Protected><FormsPage /></Protected>} />
      <Route path="/forms/:id/build" element={<Protected roles={BUILDER_ROLES}><FormBuilderPage /></Protected>} />
      <Route path="/forms/:id/submissions" element={<Protected><SubmissionsPage /></Protected>} />
      <Route path="/pdf-forms/:id/build" element={<Protected roles={BUILDER_ROLES}><PdfBuilderPage /></Protected>} />
      <Route path="/pdf-forms/:id/submissions" element={<Protected><PdfSubmissionsPage /></Protected>} />

      {/* ── Plants / Schedule / Manpower (all authenticated) ── */}
      <Route path="/plants" element={<Protected><PlantsPage /></Protected>} />
      <Route path="/plants/:site_code" element={<Protected><PlantsPage /></Protected>} />
      <Route path="/manpower" element={<Protected><ManpowerPage /></Protected>} />
      <Route path="/schedule" element={<Protected><SchedulePage /></Protected>} />

      {/* ── Sites / Vendors (vendor roles can view) ── */}
      <Route path="/sites" element={<Protected roles={ALL_VENDOR_ROLES}><SiteMasterPage /></Protected>} />
      <Route path="/vendors" element={<Protected roles={VENDOR_ADMIN_PLUS}><VendorsPage /></Protected>} />
      <Route path="/team" element={<Protected roles={VENDOR_ADMIN_PLUS}><UsersPage /></Protected>} />

      {/* ── Super-admin only ──────────────────── */}
      <Route path="/security" element={<Protected roles={ADMIN_PLUS}><SecurityCenterPage /></Protected>} />
      <Route path="/security/settings" element={<Protected roles={ADMIN_PLUS}><SecuritySettingsPage /></Protected>} />
      <Route path="/audit-logs" element={<Protected roles={SUPER_ADMIN_ONLY}><AuditLogsPage /></Protected>} />
      <Route path="/settings" element={<Protected roles={SUPER_ADMIN_ONLY}><SettingsPage /></Protected>} />
      <Route path="/settings/smtp" element={<Protected roles={SUPER_ADMIN_ONLY}><SmtpSettingsPage /></Protected>} />
      <Route path="/settings/welcome-email" element={<Protected roles={ADMIN_PLUS}><WelcomeEmailSettingsPage /></Protected>} />

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
