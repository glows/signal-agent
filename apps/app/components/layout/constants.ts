import {
  BarChart3,
  CalendarDays,
  ContactRound,
  Home,
  Lightbulb,
  Mail,
  PenLine,
  Radar,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";

// Ties the header toggle to the region it controls via `aria-controls`.
export const SIDEBAR_ID = "app-sidebar";

export const sidebarItems = [
  { icon: Home, label: "Home", to: "/", group: "" },
  { icon: CalendarDays, label: "Queue", to: "/queue", group: "" },
  { icon: BarChart3, label: "Analytics", to: "/analytics", group: "" },
  { icon: Sparkles, label: "Workers", to: "/workers", group: "CREATE" },
  { icon: Lightbulb, label: "Inspiration", to: "/inspiration", group: "" },
  { icon: PenLine, label: "Create a post", to: "/compose", group: "" },
  { icon: Radar, label: "Signals", to: "/signals", group: "NETWORK" },
  { icon: ContactRound, label: "Contacts", to: "/contacts", group: "" },
  { icon: Mail, label: "DMs", to: "/dms", group: "" },
  { icon: Users, label: "Daily brief", to: "/brief", group: "" },
  { icon: Settings, label: "Context", to: "/context", group: "SETTINGS" },
  { icon: Settings, label: "Account", to: "/account", group: "" },
] as const;
