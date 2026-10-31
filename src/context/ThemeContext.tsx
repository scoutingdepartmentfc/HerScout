"use client";

import React, { createContext, useCallback, useContext, useState, useEffect } from "react";

export type ClubTheme = {
  id: string;
  name: string;
  shortName: string;
  badgeUrl?: string;
  primaryColor: string; // HSL e.g. "217 91% 60%"
  secondaryColor: string;
  accentColor: string;
};

export const DEFAULT_THEME: ClubTheme = {
  id: "herscout-default",
  name: "HerScout Elite Intelligence",
  shortName: "HerScout",
  primaryColor: "217 91% 60%", // Electric scouting blue
  secondaryColor: "215 28% 17%",
  accentColor: "160 84% 39%", // Pitch emerald
};

export type UserRole = "chief_scout" | "scout" | "analyst";

export interface UserContextType {
  currentClub: ClubTheme;
  setClub: (club: ClubTheme) => void;
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  isPlatformAdmin: boolean;
  refreshAdminSession: () => Promise<void>;
  // Clubs with a subscription (organizations table), to view the app as each club
  clubs: ClubTheme[];
  user: {
    name: string;
    email: string;
    avatarUrl?: string;
  };
}

const ThemeContext = createContext<UserContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [currentClub, setClub] = useState<ClubTheme>(DEFAULT_THEME);
  const [userRole, setUserRole] = useState<UserRole>("chief_scout");
  // Platform admin = logged in at /login (HTTP-only session cookie checked by the server)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  const refreshAdminSession = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/login", { cache: "no-store" });
      const data = await res.json();
      setIsPlatformAdmin(Boolean(data.admin));
      setUser(data.admin ? { name: "Administrator", email: data.email || "" } : { name: "", email: "" });
    } catch {
      setIsPlatformAdmin(false);
    }
  }, []);

  useEffect(() => {
    refreshAdminSession();
  }, [refreshAdminSession]);

  useEffect(() => {
    if (!isPlatformAdmin) return setClubs([]);
    fetch("/api/admin/clubs")
      .then((res) => (res.ok ? res.json() : { clubs: [] }))
      .then((data) =>
        setClubs(
          (data.clubs || []).map((c: any) => ({
            id: c.id,
            name: c.name,
            shortName: c.short_name || c.name,
            primaryColor: c.primary_color || DEFAULT_THEME.primaryColor,
            secondaryColor: c.secondary_color || DEFAULT_THEME.secondaryColor,
            accentColor: c.accent_color || DEFAULT_THEME.accentColor,
          }))
        )
      )
      .catch(() => setClubs([]));
  }, [isPlatformAdmin]);

  const [user, setUser] = useState<{ name: string; email: string }>({ name: "", email: "" });
  const [clubs, setClubs] = useState<ClubTheme[]>([]);

  useEffect(() => {
    // Apply dynamic club CSS variables
    const root = document.documentElement;
    root.style.setProperty("--primary", currentClub.primaryColor);
  }, [currentClub]);

  return (
    <ThemeContext.Provider
      value={{
        currentClub,
        setClub,
        userRole,
        setUserRole,
        isPlatformAdmin,
        refreshAdminSession,
        clubs,
        user,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useThemeContext must be used within ThemeProvider");
  }
  return context;
}

