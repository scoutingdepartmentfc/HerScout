"use client";

import { useCallback, useEffect, useState } from "react";
import { useThemeContext } from "@/context/ThemeContext";

export interface Scout {
  id: string;
  name: string;
}

const KEY = "hs_scout_id";
const EVENT = "hs-scout-changed";

function readStored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/**
 * The scout the app is "viewing as" (simple identity until per-scout login exists).
 * Kept in localStorage and shared across components through a window event.
 */
export function useCurrentScout() {
  const { currentClub } = useThemeContext();
  const [scouts, setScouts] = useState<Scout[]>([]);
  const [scoutId, setScoutId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/scouts", { headers: { "x-user-org-id": currentClub.id }, cache: "no-store" });
      const j = await res.json();
      setScouts(Array.isArray(j.scouts) ? j.scouts : []);
    } catch {
      setScouts([]);
    } finally {
      setLoaded(true);
    }
  }, [currentClub.id]);

  useEffect(() => {
    setScoutId(readStored());
    load();
    const onChange = () => {
      setScoutId(readStored());
      load();
    };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, [load]);

  const select = useCallback((id: string | null) => {
    try {
      if (id) localStorage.setItem(KEY, id);
      else localStorage.removeItem(KEY);
    } catch {}
    setScoutId(id);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const create = useCallback(
    async (name: string) => {
      const res = await fetch("/api/scouts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-org-id": currentClub.id },
        body: JSON.stringify({ name }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not create scout");
      select(j.scout.id);
      return j.scout as Scout;
    },
    [currentClub.id, select]
  );

  const scout = scouts.find((s) => s.id === scoutId) || null;
  return { scouts, scout, scoutId: scout ? scoutId : null, select, create, loaded, reload: load };
}
