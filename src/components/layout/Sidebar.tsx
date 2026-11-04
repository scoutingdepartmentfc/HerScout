"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useThemeContext } from "@/context/ThemeContext";
import {
  LayoutDashboard,
  Users,
  FileSpreadsheet,
  CalendarDays,
  Bookmark,
  Settings,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  onToggle,
  isMobileOpen,
  onMobileClose,
}) => {
  const pathname = usePathname();
  const { currentClub, isPlatformAdmin } = useThemeContext();

  const navItems = [
    { name: "The Hub", href: "/hub", icon: LayoutDashboard },
    { name: "Player Database", href: "/players", icon: Users },
    { name: "Reports & Analysis", href: "/reports", icon: FileSpreadsheet },
    { name: "Matches", href: "/matches", icon: CalendarDays },
    { name: "Watchlist", href: "/watchlist", icon: Bookmark },
    { name: "Settings", href: "/settings", icon: Settings },
  ];

  if (isPlatformAdmin) {
    navItems.push({
      name: "Administration",
      href: "/admin",
      icon: ShieldAlert,
    });
  }

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/80 md:hidden backdrop-blur-sm"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={cn(
          "fixed top-0 bottom-0 left-0 z-40 flex flex-col border-r border-border/80 bg-navy-950/95 backdrop-blur-md transition-all duration-300 md:static",
          isCollapsed ? "w-16" : "w-64",
          isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Brand / Club Header */}
        <div className="flex h-16 items-center justify-between border-b border-border/80 px-4">
          <Link
            href="/hub"
            className="flex items-center gap-3 overflow-hidden"
            onClick={onMobileClose}
          >
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/20 border border-primary/40 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            {!isCollapsed && (
              <div className="flex flex-col">
                <span className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                  SPONDA
                  <span className="text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded bg-primary/20 text-primary border border-primary/30">
                    PRO
                  </span>
                </span>
                <span className="text-[11px] text-muted-foreground truncate max-w-[150px]">
                  {currentClub.shortName}
                </span>
              </div>
            )}
          </Link>

          {/* Collapse button on desktop */}
          <button
            onClick={onToggle}
            className="hidden md:flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-white transition-colors"
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
          <div className="px-2 mb-2">
            {!isCollapsed && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                Scouting Workspace
              </span>
            )}
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== "/hub" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onMobileClose}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-xs font-medium transition-all group relative",
                  isActive
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "text-muted-foreground hover:bg-white/5 hover:text-white"
                )}
                title={isCollapsed ? item.name : undefined}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 flex-shrink-0 transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground group-hover:text-white"
                  )}
                />
                {!isCollapsed && <span className="truncate">{item.name}</span>}

                {/* Active Indicator Bar */}
                {isActive && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-primary" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Club Active Badge Footer */}
        {!isCollapsed ? (
          <div className="border-t border-border/80 p-3 bg-navy-900/40">
            <div className="flex items-center gap-2.5">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0 animate-pulse"
                style={{ backgroundColor: `hsl(${currentClub.primaryColor})` }}
              />
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-semibold text-white truncate">
                  {currentClub.name}
                </span>
                <span className="text-[10px] text-muted-foreground truncate">
                  Multi-tenant Isolation: Active
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="border-t border-border/80 p-2 flex justify-center">
            <div
              className="w-2.5 h-2.5 rounded-full animate-pulse"
              style={{ backgroundColor: `hsl(${currentClub.primaryColor})` }}
              title={currentClub.name}
            />
          </div>
        )}
      </aside>
    </>
  );
};

