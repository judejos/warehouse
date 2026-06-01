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
  ShieldAlert,
  ShoppingCart,
} from "lucide-react";

const allModules = {
  dashboard:        { title: "Dashboard",        url: "/dashboard",         icon: LayoutDashboard },
  products:         { title: "Product",           url: "/products",          icon: Package },
  inventory:        { title: "Inventory",         url: "/inventory",         icon: Package },
  purchaseRequests: { title: "Purchase Requests", url: "/purchase-requests", icon: FileText },
  asn:              { title: "ASN",               url: "/asn",               icon: Truck },
  grn:              { title: "GRN",               url: "/grn",               icon: ClipboardCheck },
  qualityCheck:     { title: "QC",                url: "/quality-check",     icon: CheckSquare },
  users:            { title: "Users",             url: "/users",             icon: Users },
  vendors:          { title: "Vendor",            url: "/vendors",           icon: Building2 },
  suppliers:        { title: "Customer",          url: "/suppliers",         icon: UserCheck },
  warehouses:       { title: "Warehouse",         url: "/warehouses",        icon: Warehouse },
  outbound:         { title: "Outbound Orders",   url: "/outbound",          icon: PackageOpen },
  finance:          { title: "Finance",           url: "/finance",           icon: DollarSign },
  settings:         { title: "Settings",          url: "/settings",          icon: Settings },
  scanner:          { title: "Barcode Scanner",   url: "/barcode-scanner",   icon: ScanLine },
  rejections:       { title: "QC Rejections",     url: "/rejections",        icon: ShieldAlert },
  
  // Sales Flow Modules
  salesManager:     { title: "Sales Dashboard",   url: "/sales",             icon: ShoppingCart },
  stockCheck:       { title: "Stock Check",       url: "/stock-check",       icon: CheckSquare },
  orderApproval:    { title: "Order Approval",    url: "/order-approval",    icon: ClipboardCheck },
  salesFinance:     { title: "Sales Finance",     url: "/sales-finance",     icon: DollarSign },
};

const roleModules = {
  // Full access
  admin: [
    "dashboard",
    "users",
    "purchaseRequests",
    "asn",
    "grn",
    "qualityCheck",
    "scanner",
    "vendors",
    "suppliers",
    "inventory",
    "products",
    "outbound",
    "warehouses",
    "finance",
    "rejections",
    "settings",
    "salesManager",
    "stockCheck",
    "orderApproval",
    "salesFinance"
  ],
  // Operational managers
  manager: [
    "dashboard", "purchaseRequests", "asn", "outbound", "rejections", "vendors", "suppliers", "products", "inventory"
  ],
  // Warehouse supervisor
  supervisor: [
    "dashboard", "asn", "grn", "rejections", "inventory", "orderApproval"
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
    "dashboard", "purchaseRequests", "finance", "salesFinance"
  ],
  // Inventory manager
  inventory_manager: [
    "dashboard", "vendors", "suppliers", "scanner", "inventory", "products", "warehouses", "stockCheck"
  ],
  // Sales manager
  sales_manager: [
    "dashboard", "salesManager"
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
  sales_manager:     "Sales Manager",
};

export const canManageVendors = (role) =>
  ["admin", "inventory_manager", "manager"].includes(role);

export const canApproveFinance = (role) =>
  ["admin", "finance_director"].includes(role);

export const isAdmin = (role) => role === "admin";