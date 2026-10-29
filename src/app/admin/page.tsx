"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/Table";
import { useThemeContext } from "@/context/ThemeContext";
import { ShieldAlert, CheckCircle2 } from "lucide-react";
import { ErrorState } from "@/components/ui/StatusStates";
import { IngestionTargets } from "@/components/admin/IngestionTargets";

export default function AdminPage() {
  const { isPlatformAdmin, setUserRole } = useThemeContext();

  if (!isPlatformAdmin) {
    return (
      <div className="space-y-4 max-w-xl mx-auto py-12">
        <ErrorState
          title="Access Denied"
          message="This module is reserved strictly for HerScout Platform Administrators. Switch your role to Platform Admin in the top bar to inspect this console."
          onRetry={() => setUserRole("platform_admin")}
        />
      </div>
    );
  }

  const clubs = [
    { id: "c-1", name: "Chelsea FC Women", members: 6, status: "Active", tier: "Enterprise" },
    { id: "c-2", name: "FC Barcelona Femení", members: 12, status: "Active", tier: "Enterprise" },
    { id: "c-3", name: "Arsenal Women FC", members: 8, status: "Active", tier: "Enterprise" },
    { id: "c-4", name: "Olympique Lyonnais Féminin", members: 7, status: "Active", tier: "Enterprise" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-lg border border-primary/30 bg-primary/5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center text-primary">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white">Global Administration Console</h1>
              <Badge variant="default" size="sm">Owner Access</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Superadmin console to manage tenant clubs, user permissions, sync pipelines, and system logs.
            </p>
          </div>
        </div>
      </div>

      {/* Tenant Clubs Table */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle>Tenant Clubs & Subscriptions</CardTitle>
          <CardDescription>All onboarded football clubs with isolated databases</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Club Name</TableHead>
                <TableHead>Seat Count</TableHead>
                <TableHead>Subscription Tier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Manage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clubs.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-semibold text-white">{c.name}</TableCell>
                  <TableCell>{c.members} active users</TableCell>
                  <TableCell>
                    <Badge variant="outline" size="sm">{c.tier}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="success" size="sm">{c.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="xs">Settings</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Data pipeline: leagues & seasons to download */}
      <IngestionTargets />

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>System Health & Error Monitoring</CardTitle>
            <CardDescription>Logged from Supabase Edge functions and client errors</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="p-4 rounded-md border border-dashed border-border/80 flex flex-col items-center justify-center text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-2" />
              <p className="text-xs font-semibold text-white">All systems operational</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                0 uncaught server errors recorded in the last 24 hours.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

