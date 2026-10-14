import { Link } from "@tanstack/react-router";

import { UserMenu } from "#components/user-menu";

import { SIDEBAR_ID, sidebarItems } from "./constants";
import { SidebarNav } from "./sidebar-nav";

interface SidebarProps {
  isOpen: boolean;
}

export function Sidebar({ isOpen }: SidebarProps) {
  return (
    // Collapsing to zero width keeps the sidebar mounted so the transition can
    // run, which leaves its links focusable and readable by screen readers
    // while invisible. `inert` takes the whole subtree out of the tab order.
    <aside
      id={SIDEBAR_ID}
      inert={!isOpen}
      className={`${
        isOpen ? "w-56" : "w-0"
      } transition-all duration-300 ease-in-out bg-white dark:bg-zinc-950 border-r overflow-hidden shrink-0`}
    >
      <div className="h-full flex flex-col">
        <div className="h-14 flex items-center px-4 border-b">
          <h2 className="font-bold text-xl">🔥 Signal Agent</h2>
        </div>
        <Link
          to="/compose"
          className="mx-3 mt-4 rounded-xl bg-[#dc3c22] px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-[#bf321b]"
        >
          Create a post
        </Link>
        <SidebarNav items={sidebarItems} />
        <UserMenu />
      </div>
    </aside>
  );
}
