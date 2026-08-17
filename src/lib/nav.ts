import {
  Users,
  Briefcase,
  TrendingUp,
  UserCircle,
  Building2,
  Wallet,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
  Puzzle,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/hrms", label: "HRMS", icon: Users },
  { href: "/dashboard/crm", label: "CRM / Sales", icon: TrendingUp },
  { href: "/dashboard/projects", label: "Projects", icon: Briefcase },
  { href: "/dashboard/accounting", label: "Accounting", icon: Wallet },
  { href: "/dashboard/clients", label: "Clients", icon: Building2 },
  { href: "/dashboard/staff", label: "Staff", icon: UserCircle },
  { href: "/dashboard/logs", label: "Activity Logs", icon: ScrollText },
  { href: "/dashboard/admin/wai-access", label: "WAI Data Access", icon: ShieldCheck },
  { href: "/dashboard/admin/api-keys", label: "WAI Embed Plugin", icon: Puzzle },
];
