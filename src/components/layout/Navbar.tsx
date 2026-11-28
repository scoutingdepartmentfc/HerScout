"use client";

import React, { useEffect, useState } from "react";
import { ScoutSwitcher } from "./ScoutSwitcher";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useThemeContext, DEFAULT_THEME, UserRole } from "@/context/ThemeContext";
import {
  Bell,
  ChevronDown,
  Shield,
  Check,
  LogOut,
  LayoutDashboard,
  Users,
  FileText,
  Calendar,
  Bookmark,
  Settings,
  Trophy,
  Scale,
  Menu,
  X,
} from "lucide-react";

const navigation = [
  { name: "The Hub", href: "/hub", icon: LayoutDashboard },
  { name: "Player Database", href: "/players", icon: Users },
  { name: "Comparison", href: "/compare", icon: Scale },
  { name: "11 Builder", href: "/builder", icon: Trophy },
  { name: "Reports & Analysis", href: "/reports", icon: FileText },
  { name: "Matches", href: "/matches", icon: Calendar },
  { name: "Watchlist", href: "/watchlist", icon: Bookmark },
  { name: "Settings", href: "/settings", icon: Settings },
  { name: "Administration", href: "/admin", icon: Shield },
];

const pill =
  "flex items-center gap-2 border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-foreground hover:border-primary/60 transition-colors";

export const Navbar: React.FC = () => {
  const pathname = usePathname();
  const { currentClub, setClub, userRole, setUserRole, isPlatformAdmin, user, clubs, refreshAdminSession } = useThemeContext();
  const [showClubMenu, setShowClubMenu] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);

  // Close the mobile menu after navigating
  useEffect(() => setShowMobileNav(false), [pathname]);

  const isActive = (href: string) => pathname === href || (href !== "/hub" && pathname.startsWith(href));
  const activeItem = navigation.find((item) => isActive(item.href)) ?? navigation[0];
  const ActiveIcon = activeItem.icon;

  const initials = (user.name || user.email || "?").slice(0, 2).toUpperCase();

  const logout = async () => {
    await fetch("/api/admin/login", { method: "DELETE" });
    await refreshAdminSession();
    window.location.href = "/login";
  };

  return (
    <header className="sticky top-0 z-30 w-full bg-navy-950/85 backdrop-blur-md">
      {/* Manager bar */}
      <div className="flex items-center justify-between gap-3 px-3 sm:px-5 py-2.5">
        <Link href="/hub" className="flex items-center gap-3 min-w-0 group">
          {/* logo1.png is a 720x405 sheet: crop to the white-on-black "S" mark */}
          <div className="relative h-11 w-11 shrink-0 overflow-hidden border border-white/15 bg-black group-hover:border-primary transition-colors">
            <img
              src="/logo1.png"
              alt="SPONDA"
              className="absolute max-w-none"
              style={{ width: 150, height: "auto", left: -92, top: -20 }}
            />
          </div>
          <div className="min-w-0 leading-none">
            <div className="flex items-center gap-2">
              <span className="font-display text-2xl font-extrabold uppercase tracking-wide text-primary">SPONDA</span>
              <span className="font-display text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-primary text-white">
                PRO
              </span>
            </div>
            <div className="mt-1 font-display text-xs sm:text-sm font-semibold uppercase tracking-wide text-white truncate">
              {currentClub.name}
              <span className="text-muted-foreground"> | </span>
              <span className="text-primary">{userRole.replace("_", " ")}</span>
            </div>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          {/* Club switcher */}
          <div className="relative">
            <button onClick={() => setShowClubMenu(!showClubMenu)} className={pill}>
              <span className="w-2 h-2" style={{ backgroundColor: `hsl(${currentClub.primaryColor})` }} />
              <span className="hidden sm:inline font-display font-bold uppercase tracking-wide text-white">
                {currentClub.shortName}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </button>

            {showClubMenu && (
              <div className="absolute right-0 mt-2 w-56 border border-border bg-card p-1 shadow-xl z-50">
                <div className="px-2 py-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/60">
                  Switch Club Workspace
                </div>
                {[DEFAULT_THEME, ...clubs].map((club) => (
                  <button
                    key={club.id}
                    onClick={() => {
                      setClub(club);
                      setShowClubMenu(false);
                    }}
                    className="flex w-full items-center justify-between px-2.5 py-1.5 text-xs text-left text-foreground hover:bg-secondary/60 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2" style={{ backgroundColor: `hsl(${club.primaryColor})` }} />
                      <span className="truncate">{club.name}</span>
                    </div>
                    {currentClub.id === club.id && <Check className="w-3.5 h-3.5 text-primary" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Scout identity (match reports, attendance, stars) */}
          <ScoutSwitcher pillClass={pill} />

          {/* Role simulator */}
          <div className="relative hidden sm:block">
            <button
              onClick={() => setShowRoleMenu(!showRoleMenu)}
              className={`${pill} text-muted-foreground hover:text-white`}
              title="Simulate permissions"
            >
              <Shield className="w-3.5 h-3.5 text-primary" />
              <span className="font-display font-semibold uppercase tracking-wide">{userRole.replace("_", " ")}</span>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>

            {showRoleMenu && (
              <div className="absolute right-0 mt-2 w-48 border border-border bg-card p-1 shadow-xl z-50">
                <div className="px-2 py-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/60">
                  User Role Guard
                </div>
                {(["chief_scout", "scout", "analyst"] as UserRole[]).map((role) => (
                  <button
                    key={role}
                    onClick={() => {
                      setUserRole(role);
                      setShowRoleMenu(false);
                    }}
                    className="flex w-full items-center justify-between px-2.5 py-1.5 text-xs text-left capitalize text-foreground hover:bg-secondary/60 transition-colors"
                  >
                    <span>{role.replace("_", " ")}</span>
                    {userRole === role && <Check className="w-3.5 h-3.5 text-primary" />}
                  </button>
                ))}
                <a
                  href={isPlatformAdmin ? "/admin" : "/login"}
                  className="mt-1 flex w-full items-center gap-1.5 border-t border-border/60 px-2.5 py-1.5 text-xs text-primary hover:bg-secondary/60"
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
              className={`${pill} px-2 text-muted-foreground hover:text-white`}
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 border border-border bg-card shadow-2xl z-50">
                <div className="px-3 py-2 border-b border-border/60 font-display text-sm font-bold uppercase tracking-wide text-white">
                  Notifications & Alerts
                </div>
                <p className="p-4 text-center text-[11px] text-muted-foreground">No notifications yet.</p>
              </div>
            )}
          </div>

          {/* Profile */}
          <div className="flex items-center gap-2 pl-2 border-l border-white/10">
            <div className="flex h-8 w-8 items-center justify-center bg-primary font-display text-sm font-bold text-white">
              {initials}
            </div>
            <div className="hidden lg:flex flex-col text-left">
              <span className="text-xs font-medium text-white leading-tight">{user.name}</span>
              <span className="text-[10px] text-muted-foreground leading-tight">{user.email || currentClub.shortName}</span>
            </div>
            <button
              onClick={logout}
              className="p-1.5 text-muted-foreground hover:text-white"
              title="Log out"
              aria-label="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Angled tab bar (desktop) */}
      <nav className="relative hidden lg:block border-y border-primary/40 bg-gradient-to-r from-primary/25 via-primary/10 to-primary/25">
        <div className="flex px-4 py-1.5 gap-1">
          {navigation.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`tab-angled flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap px-5 py-1.5 font-display text-sm font-bold uppercase tracking-wider transition-colors ${
                  active ? "bg-white text-navy-950" : "bg-primary/80 text-white hover:bg-primary"
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${active ? "text-primary" : "text-white/80"}`} />
                {item.name}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Mobile / tablet: current section + expandable grid of tabs */}
      <nav className="relative lg:hidden border-y border-primary/40 bg-gradient-to-r from-primary/25 via-primary/10 to-primary/25">
        <div className="flex items-center gap-2 px-3 py-1.5">
          <div className="tab-angled flex flex-1 min-w-0 items-center gap-2 bg-white px-4 py-2 font-display text-base font-bold uppercase tracking-wider text-navy-950">
            <ActiveIcon className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">{activeItem.name}</span>
          </div>
          <button
            onClick={() => setShowMobileNav(!showMobileNav)}
            aria-expanded={showMobileNav}
            aria-label={showMobileNav ? "Close menu" : "Open menu"}
            className="tab-angled flex shrink-0 items-center gap-1.5 bg-primary px-5 py-2 font-display text-base font-bold uppercase tracking-wider text-white active:brightness-110"
          >
            {showMobileNav ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            Menu
          </button>
        </div>

        {showMobileNav && (
          <>
            <div className="absolute inset-x-0 top-full z-30 h-[100dvh] bg-black/60" onClick={() => setShowMobileNav(false)} />
            <div className="absolute inset-x-0 top-full z-40 border-b border-primary/40 bg-navy-950/95 backdrop-blur-md p-3 shadow-2xl shadow-black/60">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {navigation.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setShowMobileNav(false)}
                      className={`tile-cut relative flex min-h-[64px] flex-col justify-between gap-2 border-t-2 p-2.5 font-display text-[15px] font-bold uppercase leading-tight tracking-wide transition-colors ${
                        active
                          ? "border-white bg-white text-navy-950"
                          : "border-primary bg-gradient-to-br from-primary/80 to-primary/40 text-white active:brightness-110"
                      }`}
                    >
                      <Icon className={`h-5 w-5 ${active ? "text-primary" : "text-white/90"}`} />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </nav>
    </header>
  );
};
