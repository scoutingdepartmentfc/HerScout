"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Navbar } from "./Navbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const pathname = usePathname();

  // Login screen: no navigation until signed in
  if (pathname === "/login") {
    return <main className="min-h-screen bg-background antialiased">{children}</main>;
  }

  return (
    <div className="h-screen bg-background flex flex-col md:flex-row antialiased selection:bg-primary/30 overflow-hidden">
      {/* Sidebar Navigation */}
      <Sidebar
        isCollapsed={isCollapsed}
        onToggle={() => setIsCollapsed(!isCollapsed)}
        isMobileOpen={isMobileOpen}
        onMobileClose={() => setIsMobileOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen relative overflow-hidden">
        {/* Subtle Brand Watermark Logo behind page headers */}
        <div className="pointer-events-none absolute top-4 right-6 sm:right-12 z-0 opacity-[0.06] select-none">
          <img
            src="/logo-brand.png"
            alt=""
            className="w-72 sm:w-96 max-h-48 object-contain filter drop-shadow-2xl"
          />
        </div>

        <Navbar onMobileMenuOpen={() => setIsMobileOpen(true)} />
        <main className="flex-1 p-4 md:p-6 overflow-y-auto relative z-10">
          <div className="max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

