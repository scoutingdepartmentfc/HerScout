"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Navbar } from "./Navbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Full-screen / wide-canvas tools: no restrictive max width
  const fullBleed = pathname?.startsWith("/builder") || pathname?.startsWith("/matches") || pathname?.startsWith("/compare");

  // Login screen: no navigation until signed in
  if (pathname === "/login") {
    return <main className="min-h-screen bg-background antialiased">{children}</main>;
  }

  return (
    <div className="app-backdrop h-screen flex flex-col antialiased selection:bg-primary/30 overflow-hidden">
      <Navbar />
      <main className={`flex-1 overflow-y-auto relative ${fullBleed ? "p-2 md:p-3" : "p-3 md:p-5"}`}>
        {/* Subtle brand watermark behind page headers */}
        <div className="pointer-events-none absolute top-4 right-6 sm:right-12 z-0 opacity-[0.05] select-none">
          <img src="/logo-brand.png" alt="" className="w-72 sm:w-96 max-h-48 object-contain" />
        </div>
        <div className={fullBleed ? "relative z-10 min-h-full lg:h-full" : "relative z-10 max-w-7xl mx-auto space-y-5"}>{children}</div>
      </main>
    </div>
  );
}
