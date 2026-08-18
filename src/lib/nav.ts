import {
  TrendingUp,
  ScrollText,
  Puzzle,
  Building,
  Database,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { href: "/dashboard/crm", label: "CRM / Sales", icon: TrendingUp },
  { href: "/dashboard/logs", label: "Activity Logs", icon: ScrollText },
  { href: "/dashboard/admin/api-keys", label: "WAI Embed Plugin", icon: Puzzle },
  { href: "/dashboard/admin/organizations", label: "Organizations", icon: Building },
  { href: "/dashboard/admin/data-source", label: "WAI Data Source", icon: Database },
];
