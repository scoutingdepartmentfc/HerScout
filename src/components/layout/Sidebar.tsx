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
  Trophy,
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
    { name: "11 Builder", href: "/builder", icon: Trophy },
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
        className={`fixed inset-y-0 left-0 z-50 flex flex-col h-screen border-r border-border/80 bg-navy-950 transition-all duration-300 md:sticky md:top-0 shrink-0 select-none ${
          isCollapsed ? "w-20" : "w-64"
        } ${
          isMobileOpen
            ? "translate-x-0"
            : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* Brand Header */}
        <div className="relative border-b border-border/80 p-3 bg-gradient-to-b from-white/[0.04] to-transparent">
          {/* Collapse button on desktop (top right corner) */}
          <button
            onClick={onToggle}
            className="hidden md:flex absolute top-3 right-2.5 z-20 h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-white transition-colors"
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5" />
            )}
          </button>

          <Link
            href="/hub"
            className="flex flex-col items-center group select-none"
            onClick={onMobileClose}
          >
            {/* Top: Logo1 spanning wide */}
            <div className={`w-full flex items-center justify-center overflow-hidden rounded-xl bg-white/[0.06] border border-white/10 shadow-lg shadow-black/30 p-1.5 transition-all duration-300 group-hover:border-primary/40 ${isCollapsed ? "h-12" : "h-20"}`}>
              <img
                src="/logo1.png"
                alt="SPONDA"
                className="w-full h-full object-contain filter drop-shadow-md transition-transform duration-300 group-hover:scale-105"
              />
            </div>

            {/* Below Logo1: SPONDA Modern Typography */}
            {!isCollapsed && (
              <div className="mt-2.5 flex items-center justify-center gap-2 w-full">
                <span className="text-lg font-black tracking-[0.22em] text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-sky-300 drop-shadow-[0_2px_8px_rgba(56,189,248,0.3)]">
                  SPONDA
                </span>
                <span className="text-[9px] font-black tracking-wider uppercase px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-400/30">
                  PRO
                </span>
              </div>
            )}
          </Link>
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

        {/* Bottom of Sidebar: Logo2 spanning full width of the menu column */}
        <div className="border-t border-border/80 p-0 bg-navy-950 overflow-hidden">
          {!isCollapsed ? (
            <div className="w-full flex flex-col items-center">
              <div className="w-full flex items-center justify-center overflow-hidden bg-black/60 group">
                <img
                  src="/logo2.png"
                  alt="SPONDA"
                  className="w-full h-auto max-h-28 object-cover object-center filter drop-shadow-md transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <div className="flex items-center gap-2 w-full justify-center py-2 px-3 bg-navy-900/60 border-t border-white/5">
                <div
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ backgroundColor: `hsl(${currentClub.primaryColor})` }}
                />
                <span className="text-[10px] font-semibold text-slate-300 truncate">
                  {currentClub.shortName} Workspace
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-2 gap-2">
              <div className="w-full aspect-square rounded-lg bg-black/40 border border-white/10 p-1 flex items-center justify-center overflow-hidden">
                <img
                  src="/logo2.png"
                  alt="SPONDA"
                  className="w-full h-full object-cover"
                />
              </div>
              <div
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: `hsl(${currentClub.primaryColor})` }}
                title={currentClub.name}
              />
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
