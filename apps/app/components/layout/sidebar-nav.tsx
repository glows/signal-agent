import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

import type { FileRoutesByTo } from "#lib/routeTree.gen";

interface SidebarNavItem {
  icon: LucideIcon;
  label: string;
  to: keyof FileRoutesByTo;
  group: string;
}

interface SidebarNavProps {
  items: readonly SidebarNavItem[];
}

export function SidebarNav({ items }: SidebarNavProps) {
  return (
    <nav className="flex-1 overflow-auto px-3 py-3 space-y-1">
      {items.map((item) => (
        <div key={item.to}>
          {item.group && (
            <p className="px-3 pt-5 pb-1 text-[10px] font-bold tracking-[.11em] text-zinc-400">
              {item.group}
            </p>
          )}
          <Link
            to={item.to}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            activeProps={{
              className:
                "bg-zinc-100 text-zinc-950 dark:bg-zinc-800 dark:text-white",
            }}
          >
            <item.icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        </div>
      ))}
    </nav>
  );
}
