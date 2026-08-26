/**
 * usePermissions — Centralized RBAC hook
 *
 * Single source of truth for all role-based capability flags.
 * Mirrors the backend `capabilities_for(user)` in permissions.py.
 *
 * Usage:
 *   const { canEditForms, canManageSites, isSuperAdmin, role } = usePermissions();
 */
import { useAuth } from "@/contexts/AuthContext";

export function usePermissions() {
  const { user } = useAuth();
  const role = user?.role || "";
  const override = !!user?.access_override;

  const isSuperAdmin = role === "super_admin" || override;
  const isAdmin = role === "admin";
  const isVendorAdmin = role === "vendor_admin";
  const isVendorUser = role === "vendor_user";
  const isVendorRole = isVendorAdmin || isVendorUser;

  // ── Form management ──────────────────────────────────────────────
  const canCreateForms = isSuperAdmin || isAdmin;
  const canEditForms = isSuperAdmin || isAdmin;
  const canDeleteForms = isSuperAdmin || isAdmin;
  const canBuildForms = isSuperAdmin || isAdmin;   // FormBuilder / PdfBuilder access

  // ── Submissions ───────────────────────────────────────────────────
  const canViewAllSubmissions = isSuperAdmin || isAdmin;
  const canViewOwnSubmissions = true;

  // ── Workflows ────────────────────────────────────────────────────
  const canViewWorkflows = (isSuperAdmin || isAdmin) && !isVendorRole;
  const canEditWorkflows = (isSuperAdmin || isAdmin) && !isVendorRole;
  const canViewWorkflowAnalytics = (isSuperAdmin || isAdmin) && !isVendorRole;

  // ── Approvals ────────────────────────────────────────────────────
  const canViewApprovals = isSuperAdmin || isAdmin;

  // ── Site Management ──────────────────────────────────────────────
  // super_admin + admin → full edit; vendor roles → view own portfolio only
  const canViewSites = isSuperAdmin || isAdmin || isVendorAdmin || isVendorUser;
  const canEditSites = isSuperAdmin || isAdmin;          // inline cell editing
  const canCreateSites = isSuperAdmin;                   // POST /sites (new row)
  const canDeleteSites = isSuperAdmin;                   // DELETE /sites/:id
  const canImportSites = isSuperAdmin || isAdmin;        // bulk import
  const canAddSiteColumns = isSuperAdmin || isAdmin;     // add custom column

  // ── Vendor Management ────────────────────────────────────────────
  const canCreateVendors = isSuperAdmin || isAdmin;
  const canEditVendors = isSuperAdmin || isAdmin;        // vendor_admin: own only (handled in component)
  const canDeleteVendors = isSuperAdmin;
  const canManageVendorUsers = isSuperAdmin || isAdmin || isVendorAdmin; // vendor_admin: own team

  // ── User Management ──────────────────────────────────────────────
  const canManageUsers = isSuperAdmin || isAdmin;
  const canManageTeamUsers = isSuperAdmin || isAdmin || isVendorAdmin; // vendor_admin: own team

  // ── Dashboard ────────────────────────────────────────────────────
  const canViewDashboard = isSuperAdmin || isAdmin;

  // ── Inventory ────────────────────────────────────────────────────
  const canViewInventory = isSuperAdmin || isAdmin;
  const canEditInventory = isSuperAdmin || isAdmin;

  // ── Plants / Schedule / Manpower ─────────────────────────────────
  const canViewPlants = true;           // all authenticated users
  const canViewSchedule = true;
  const canViewManpower = true;

  // ── Master Data ──────────────────────────────────────────────────
  const canViewMasterData = isSuperAdmin || isAdmin;
  const canEditMasterData = isSuperAdmin;               // super_admin only (enforced backend too)

  // ── Reports ──────────────────────────────────────────────────────
  const canViewReports = isSuperAdmin || isAdmin;

  // ── Admin-only areas ─────────────────────────────────────────────
  const canViewAuditLogs = isSuperAdmin;
  const canViewSettings = isSuperAdmin;
  const canViewSmtp = isSuperAdmin;
  const canManageWelcomeEmail = isSuperAdmin || isAdmin;
  const canManageAiTraining = isSuperAdmin || isAdmin;

  return {
    // Identity
    role,
    user,
    isSuperAdmin,
    isAdmin,
    isVendorAdmin,
    isVendorUser,
    isVendorRole,

    // Forms
    canCreateForms,
    canEditForms,
    canDeleteForms,
    canBuildForms,

    // Submissions
    canViewAllSubmissions,
    canViewOwnSubmissions,

    // Workflows
    canViewWorkflows,
    canEditWorkflows,
    canViewWorkflowAnalytics,

    // Approvals
    canViewApprovals,

    // Sites
    canViewSites,
    canEditSites,
    canCreateSites,
    canDeleteSites,
    canImportSites,
    canAddSiteColumns,

    // Vendors
    canCreateVendors,
    canEditVendors,
    canDeleteVendors,
    canManageVendorUsers,

    // Users
    canManageUsers,
    canManageTeamUsers,

    // Dashboard
    canViewDashboard,

    // Inventory
    canViewInventory,
    canEditInventory,

    // Plants / Schedule / Manpower
    canViewPlants,
    canViewSchedule,
    canViewManpower,

    // Master Data
    canViewMasterData,
    canEditMasterData,

    // Reports
    canViewReports,

    // Admin areas
    canViewAuditLogs,
    canViewSettings,
    canViewSmtp,
    canManageWelcomeEmail,
    canManageAiTraining,
  };
}
