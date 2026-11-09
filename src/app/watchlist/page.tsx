"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Bookmark, Star, ArrowUpRight, Plus, FolderPlus, Download } from "lucide-react";
import Link from "next/link";

export default function WatchlistPage() {
  // Watchlists are saved per club (watchlists table) once clubs have their own logins
  const watchlistGroups: {
    id: string;
    title: string;
    targets: { id: string; name: string; pos: string; club: string; age: number; rating: number; tier: "tier-a" | "tier-b" | "tier-c" }[];
  }[] = [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Club Watchlists</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Organised pipeline of prioritized targets isolated to your club.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" leftIcon={<Download className="w-3.5 h-3.5" />}>
            Export Pipeline
          </Button>
          <Button size="sm" leftIcon={<FolderPlus className="w-3.5 h-3.5" />}>
            New Watchlist
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {watchlistGroups.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-xs text-muted-foreground">
              No watchlists yet.
            </CardContent>
          </Card>
        )}
        {watchlistGroups.map((group) => (
          <Card key={group.id}>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <div className="flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-primary" />
                <CardTitle className="text-sm">{group.title}</CardTitle>
                <Badge variant="secondary" size="sm">
                  {group.targets.length} targets
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/40">
                {group.targets.map((target) => (
                  <div
                    key={target.id}
                    className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-secondary/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-xs text-primary">
                        {target.pos}
                      </div>
                      <div>
                        <div className="font-semibold text-white flex items-center gap-2">
                          {target.name}
                          <Badge variant={target.tier} size="sm">
                            {target.tier.replace("tier-", "Tier ").toUpperCase()}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {target.club} • Age {target.age}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Rating</div>
                        <div className="text-sm font-bold text-emerald-400">{target.rating}</div>
                      </div>
                      <Link href="/players">
                        <Button variant="outline" size="xs" rightIcon={<ArrowUpRight className="w-3 h-3" />}>
                          Profile
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

