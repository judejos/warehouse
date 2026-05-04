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
  products:         { title: "Product",           url: "/products",          icon: Package },
  inventory:        { title: "Inventory",         url: "/inventory",         icon: Package },
  purchaseRequests: { title: "PR",                url: "/purchase-requests", icon: FileText },
  asn:              { title: "ASN",               url: "/asn",               icon: Truck },
  grn:              { title: "GRN",               url: "/grn",               icon: ClipboardCheck },
  qualityCheck:     { title: "QC",                url: "/quality-check",     icon: CheckSquare },
  users:            { title: "Users",             url: "/users",             icon: Users },
  vendors:          { title: "Vendor",            url: "/vendors",           icon: Building2 },
  suppliers:        { title: "Supplier",          url: "/suppliers",         icon: UserCheck },
  warehouses:       { title: "Warehouse",         url: "/warehouses",        icon: Warehouse },
  outbound:         { title: "Outbound Orders",   url: "/outbound",          icon: PackageOpen },
  finance:          { title: "Finance",           url: "/finance",           icon: DollarSign },
  settings:         { title: "Settings",          url: "/settings",          icon: Settings },
  scanner:          { title: "Barcode Scanner",   url: "/barcode-scanner",   icon: ScanLine }
};

const roleModules = {
  // Full access
  admin: [
    "dashboard",
    "purchaseRequests",
    "asn",
    "grn",
    "vendors",
    "suppliers",
    "qualityCheck",
    "scanner",
    "inventory",
    "products",
    "outbound",
    "warehouses",
    "finance",
    "users",
    "settings"
  ],
  // Operational managers
  manager: [
    "dashboard", "purchaseRequests", "asn", "outbound", "vendors", "suppliers", "products", "inventory"
  ],
  // Warehouse supervisor
  supervisor: [
    "dashboard", "asn", "grn", "inventory"
  ],
  // QC roles
  quality_checker: [
    "dashboard", "qualityCheck", "grn"
  ],
  quality_assistant: [
    "dashboard", "qualityCheck", "grn"
  ],
  // Finance
  finance_director: [
    "dashboard", "purchaseRequests", "finance"
  ],
  // Inventory manager
  inventory_manager: [
    "dashboard", "vendors", "suppliers", "scanner", "inventory", "products", "warehouses"
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