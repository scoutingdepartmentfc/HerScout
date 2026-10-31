import { ScoutingReport } from "@/lib/reports";

// In-memory reports shared by /api/reports and /api/reports/[id] (not persisted yet: lost on server restart)
export const reportsStore: ScoutingReport[] = [];
