"use client";

import React from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useThemeContext } from "@/context/ThemeContext";
import { useRouter } from "next/navigation";
import { ShieldAlert, LogOut } from "lucide-react";
import { ClubsManager } from "@/components/admin/ClubsManager";
import { ClubTiersManager } from "@/components/admin/ClubTiersManager";
import { SoccerdonnaLeagues } from "@/components/admin/SoccerdonnaLeagues";
import { WyscoutManualImport } from "@/components/admin/WyscoutManualImport";

export default function AdminPage() {
  const router = useRouter();
  const { refreshAdminSession } = useThemeContext();

  const logout = async () => {
    await fetch("/api/admin/login", { method: "DELETE" });
    await refreshAdminSession();
    router.replace("/login");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-lg border border-primary/30 bg-primary/5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center text-primary">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-extrabold text-white">Global Administration Console</h1>
              <Badge variant="default" size="sm">Owner Access</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage subscribed clubs, the leagues each one has, and the leagues the data pipeline downloads.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" leftIcon={<LogOut className="w-3.5 h-3.5" />} onClick={logout}>
          Log out
        </Button>
      </div>

      {/* Clubs with a subscription and their contracted leagues */}
      <ClubsManager />

      {/* Club Tiers T1–T7 (match context, SPEC §6.7) */}
      <ClubTiersManager />

      {/* Players: Soccerdonna leagues to download (with FotMob photos) */}
      <SoccerdonnaLeagues />

      {/* Manual league import from local Wyscout Excel */}
      <WyscoutManualImport />

    </div>
  );
}

