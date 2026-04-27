import {
  LayoutDashboard,
  Package,
  FileText,
  Truck,
  ClipboardCheck,
  Users,
  Building2,
  UserCheck,
  Warehouse,
  PackageOpen,
  Settings,
  DollarSign,
  CheckSquare,
  ScanLine,
} from "lucide-react";

const allModules = {
  dashboard:        { title: "Dashboard",        url: "/dashboard",         icon: LayoutDashboard },
  products:         { title: "Products",         url: "/products",          icon: Package },
  inventory:        { title: "Inventory",        url: "/inventory",         icon: Package },
  purchaseRequests: { title: "Purchase Requests",url: "/purchase-requests", icon: FileText },
  asn:              { title: "ASN",              url: "/asn",               icon: Truck },
  grn:              { title: "GRN",              url: "/grn",               icon: ClipboardCheck },
  qualityCheck:     { title: "Quality Check",    url: "/quality-check",     icon: CheckSquare },
  users:            { title: "Users",            url: "/users",             icon: Users },
  vendors:          { title: "Vendors",          url: "/vendors",           icon: Building2 },
  suppliers:        { title: "Suppliers",        url: "/suppliers",         icon: UserCheck },
  warehouses:       { title: "Warehouses",       url: "/warehouses",        icon: Warehouse },
  outbound:         { title: "Outbound Orders",  url: "/outbound",          icon: PackageOpen },
  finance:          { title: "Finance",          url: "/finance",           icon: DollarSign },
  settings:         { title: "Settings",         url: "/settings",          icon: Settings },
  scanner:          { title: "Barcode Scanner", url: "/barcode-scanner", icon: ScanLine }
};

const roleModules = {
  // Full access
  admin: [
    "dashboard", "products", "inventory", "purchaseRequests", "asn", "grn",
    "users", "vendors", "suppliers", "warehouses", "outbound",
    "qualityCheck", "finance", "settings","scanner"
  ],
  // Operational managers
  manager: [
    "dashboard", "products", "inventory", "purchaseRequests",
    "asn", "outbound", "vendors", "suppliers",
  ],
  // Warehouse supervisor
  supervisor: [
    "dashboard", "inventory", "asn", "grn",
  ],
  // QC roles — backend may return either of these strings
  quality_checker: [
    "dashboard", "qualityCheck", "grn",
  ],
  quality_assistant: [
    "dashboard", "qualityCheck", "grn",
  ],
  // Finance
  finance_director: [
    "dashboard", "finance", "purchaseRequests",
  ],
  // Inventory manager
  inventory_manager: [
    "dashboard", "products", "inventory", "vendors", "suppliers", "warehouses", "scanner"
  ],
};

export function getNavItemsForRole(role) {
  const modules = roleModules[role];

  if (!modules) {
    console.warn(`Role "${role}" not found in roleModules — defaulting to dashboard only.`);
    return [allModules.dashboard];
  }

  return modules.map((key) => allModules[key]).filter(Boolean);
}

/* ── Helpers used elsewhere ── */
export const ROLE_DISPLAY = {
  admin:             "Admin",
  manager:           "Manager",
  supervisor:        "Supervisor",
  quality_checker:   "Quality Checker",
  quality_assistant: "Quality Assistant",
  finance_director:  "Finance Director",
  inventory_manager: "Inventory Manager",
};

export const canManageVendors = (role) =>
  ["admin", "inventory_manager", "manager"].includes(role);

export const canApproveFinance = (role) =>
  ["admin", "finance_director"].includes(role);

export const isAdmin = (role) => role === "admin";