"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

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

export const AVAILABLE_CLUBS: ClubTheme[] = [
  DEFAULT_THEME,
  {
    id: "chelsea-wfc",
    name: "Chelsea FC Women",
    shortName: "Chelsea",
    primaryColor: "217 95% 45%",
    secondaryColor: "215 28% 17%",
    accentColor: "160 84% 39%",
  },
  {
    id: "barcelona-femeni",
    name: "FC Barcelona Femení",
    shortName: "Barça",
    primaryColor: "348 83% 47%",
    secondaryColor: "217 91% 40%",
    accentColor: "45 93% 47%",
  },
  {
    id: "arsenal-wfc",
    name: "Arsenal Women FC",
    shortName: "Arsenal",
    primaryColor: "354 80% 48%",
    secondaryColor: "215 28% 17%",
    accentColor: "45 93% 47%",
  },
  {
    id: "ol-lyon",
    name: "Olympique Lyonnais Féminin",
    shortName: "Lyon",
    primaryColor: "214 85% 40%",
    secondaryColor: "350 80% 50%",
    accentColor: "45 90% 50%",
  },
];

export type UserRole = "platform_admin" | "chief_scout" | "scout" | "analyst";

export interface UserContextType {
  currentClub: ClubTheme;
  setClub: (club: ClubTheme) => void;
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  isPlatformAdmin: boolean;
  user: {
    name: string;
    email: string;
    avatarUrl?: string;
  };
}

const ThemeContext = createContext<UserContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [currentClub, setClub] = useState<ClubTheme>(DEFAULT_THEME);
  // No real auth yet: the owner works as platform admin (Administration menu: leagues to download)
  const [userRole, setUserRole] = useState<UserRole>("platform_admin");

  const user = {
    name: "Elena Rostova",
    email: "elena.rostova@herscout.pro",
  };

  const isPlatformAdmin = userRole === "platform_admin";

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

