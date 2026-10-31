"use client";

import React, { useState } from "react";
import { useThemeContext, DEFAULT_THEME, UserRole } from "@/context/ThemeContext";
import {
  Search,
  Bell,
  Menu,
  ChevronDown,
  Building2,
  Shield,
  UserCheck,
  Check,
  CheckCheck,
  LogOut,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";

interface NavbarProps {
  onMobileMenuOpen: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onMobileMenuOpen }) => {
  const { currentClub, setClub, userRole, setUserRole, isPlatformAdmin, user, clubs, refreshAdminSession } = useThemeContext();
  const [showClubMenu, setShowClubMenu] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const initials = (user.name || user.email || "?").slice(0, 2).toUpperCase();

  const logout = async () => {
    await fetch("/api/admin/login", { method: "DELETE" });
    await refreshAdminSession();
    window.location.href = "/login";
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-border/80 bg-navy-950/80 px-4 backdrop-blur-md">
      {/* Left: Mobile Menu + Search */}
      <div className="flex items-center gap-3 flex-1 max-w-xl">
        <button
          onClick={onMobileMenuOpen}
          className="md:hidden rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-white"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Global Search Input */}
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search players, clubs, matches, or reports... (Cmd + K)"
            className="h-9 w-full rounded-md border border-border/70 bg-navy-900/60 pl-9 pr-4 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
          />
        </div>
      </div>

      {/* Right: Club Switcher, Notifications, Role Simulator & Profile */}
      <div className="flex items-center gap-3">
        {/* Club Switcher (Demonstrating Theme & Multi-Tenancy Customization) */}
        <div className="relative">
          <button
            onClick={() => setShowClubMenu(!showClubMenu)}
            className="flex items-center gap-2 rounded-md border border-border/70 bg-navy-900/70 px-2.5 py-1.5 text-xs text-foreground hover:border-white/20 transition-all"
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: `hsl(${currentClub.primaryColor})` }}
            />
            <span className="font-semibold text-white max-w-[120px] truncate sm:max-w-none">
              {currentClub.shortName}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </button>

          {showClubMenu && (
            <div className="absolute right-0 mt-2 w-56 rounded-md border border-border bg-card p-1 shadow-xl z-50">
              <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/60">
                Switch Club Workspace
              </div>
              {[DEFAULT_THEME, ...clubs].map((club) => (
                <button
                  key={club.id}
                  onClick={() => {
                    setClub(club);
                    setShowClubMenu(false);
                  }}
                  className="flex w-full items-center justify-between px-2.5 py-1.5 text-xs text-left text-foreground hover:bg-secondary/60 rounded transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: `hsl(${club.primaryColor})` }}
                    />
                    <span className="truncate">{club.name}</span>
                  </div>
                  {currentClub.id === club.id && (
                    <Check className="w-3.5 h-3.5 text-primary" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Role Toggle / Preview (Shows Admin Navigation Permissioning) */}
        <div className="relative hidden sm:block">
          <button
            onClick={() => setShowRoleMenu(!showRoleMenu)}
            className="flex items-center gap-1.5 rounded-md border border-border/70 bg-navy-900/70 px-2 py-1.5 text-xs text-muted-foreground hover:text-white"
            title="Simulate permissions"
          >
            <Shield className="w-3.5 h-3.5 text-primary" />
            <span className="capitalize">{userRole.replace("_", " ")}</span>
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          </button>

          {showRoleMenu && (
            <div className="absolute right-0 mt-2 w-48 rounded-md border border-border bg-card p-1 shadow-xl z-50">
              <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/60">
                User Role Guard
              </div>
              {(["chief_scout", "scout", "analyst"] as UserRole[]).map(
                (role) => (
                  <button
                    key={role}
                    onClick={() => {
                      setUserRole(role);
                      setShowRoleMenu(false);
                    }}
                    className="flex w-full items-center justify-between px-2.5 py-1.5 text-xs text-left capitalize text-foreground hover:bg-secondary/60 rounded transition-colors"
                  >
                    <span>{role.replace("_", " ")}</span>
                    {userRole === role && (
                      <Check className="w-3.5 h-3.5 text-primary" />
                    )}
                  </button>
                )
              )}
              <a
                href={isPlatformAdmin ? "/admin" : "/login"}
                className="mt-1 flex w-full items-center gap-1.5 border-t border-border/60 px-2.5 py-1.5 text-xs text-primary hover:bg-secondary/60 rounded"
              >
                <Shield className="w-3.5 h-3.5" />
                {isPlatformAdmin ? "Administration" : "Administrator login"}
              </a>
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative rounded-md border border-border/70 bg-navy-900/70 p-2 text-muted-foreground hover:text-white transition-colors"
          >
            <Bell className="w-4 h-4" />
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 rounded-md border border-border bg-card shadow-2xl z-50">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
                <span className="text-xs font-semibold text-white">
                  Notifications & Alerts
                </span>
              </div>
              <p className="p-4 text-center text-[11px] text-muted-foreground">No notifications yet.</p>
            </div>
          )}
        </div>

        {/* User Profile Avatar */}
        <div className="flex items-center gap-2 pl-2 border-l border-border/60">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 border border-primary/40 text-primary text-xs font-semibold">
            {initials}
          </div>
          <div className="hidden lg:flex flex-col text-left">
            <span className="text-xs font-medium text-white leading-tight">
              {user.name}
            </span>
            <span className="text-[10px] text-muted-foreground leading-tight">
              {user.email || currentClub.shortName}
            </span>
          </div>
          <button
            onClick={logout}
            className="rounded-md p-1.5 text-muted-foreground hover:text-white"
            title="Log out"
            aria-label="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};

