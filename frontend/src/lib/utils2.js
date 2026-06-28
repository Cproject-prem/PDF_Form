export const ROLE_LABELS = {
  super_admin: "Super Admin",
  admin: "Admin",
  vendor_admin: "Vendor Admin",
  vendor_user: "Vendor User",
  vendor: "Vendor",
  member: "Member",
  user: "User",
};

export const ROLES = ["super_admin", "admin", "vendor_admin", "vendor_user", "vendor", "member", "user"];

export function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0; let n = bytes;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}

export function formatDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch { return iso; }
}

export function formatShort(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch { return iso; }
}
