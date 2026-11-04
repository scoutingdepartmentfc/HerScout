"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useThemeContext } from "@/context/ThemeContext";
import {
  LayoutDashboard,
  Users,
  FileText,
  Calendar,
  Bookmark,
  Settings,
  Shield,
  ChevronLeft,
  ChevronRight,
  LogOut,
  X,
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
  const { currentClub } = useThemeContext();

  const navigation = [
    { name: "The Hub", href: "/hub", icon: LayoutDashboard },
    { name: "Player Database", href: "/players", icon: Users },
    { name: "Reports & Analysis", href: "/reports", icon: FileText },
    { name: "Matches", href: "/matches", icon: Calendar },
    { name: "Watchlist", href: "/watchlist", icon: Bookmark },
    { name: "Settings", href: "/settings", icon: Settings },
    { name: "Administration", href: "/admin", icon: Shield },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border/80 bg-navy-950 transition-all duration-300 md:static ${
          isCollapsed ? "w-20" : "w-64"
        } ${
          isMobileOpen
            ? "translate-x-0"
            : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* Brand / Logo Header */}
        <div className="flex h-20 items-center justify-between border-b border-border/80 px-3.5 bg-gradient-to-b from-white/[0.03] to-transparent">
          <Link
            href="/hub"
            className="flex items-center gap-3 overflow-hidden group min-w-0"
            onClick={onMobileClose}
          >
            {/* Primary Isotype / App Icon (logo1) */}
            <div className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/15 p-1 shadow-md shadow-black/40 overflow-hidden group-hover:border-primary/50 transition-all">
              <img
                src="/logo1.png"
                alt="SPONDA"
                className="h-full w-full object-contain filter drop-shadow-sm transition-transform duration-200 group-hover:scale-105"
              />
            </div>

            {!isCollapsed && (
              <div className="flex flex-col min-w-0">
                {/* Secondary Brand Logo (logo2 / logo-brand) with PRO pill */}
                <div className="flex items-center gap-1.5">
                  <div className="h-7 max-w-[120px] flex items-center overflow-hidden">
                    <img
                      src="/logo-brand.png"
                      alt="SPONDA"
                      className="h-full w-auto object-contain filter drop-shadow-sm"
                    />
                  </div>
                  <span className="text-[9px] font-black tracking-wider uppercase px-1.5 py-0.5 rounded bg-primary/20 text-sky-300 border border-primary/30 shrink-0">
                    PRO
                  </span>
                </div>
                <span className="text-[10px] font-medium text-slate-400 truncate max-w-[140px] mt-0.5">
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

          {navigation.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/hub" && pathname.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onMobileClose}
                className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all group ${
                  isActive
                    ? "bg-primary/15 text-white font-semibold"
                    : "text-muted-foreground hover:bg-white/5 hover:text-white"
                }`}
                title={isCollapsed ? item.name : undefined}
              >
                <Icon
                  className={`h-5 w-5 flex-shrink-0 transition-colors ${
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground group-hover:text-white"
                  }`}
                />
                {!isCollapsed && (
                  <span className="truncate">{item.name}</span>
                )}

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
