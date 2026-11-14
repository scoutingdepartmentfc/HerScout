import fs from "fs";
import path from "path";
import { ScoutingReport } from "@/lib/reports";

const DATA_DIR = path.join(process.cwd(), "data");
const REPORTS_FILE = path.join(DATA_DIR, "scouting_reports.json");

// Ensure directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadReportsFromDisk(): ScoutingReport[] {
  try {
    if (fs.existsSync(REPORTS_FILE)) {
      const data = fs.readFileSync(REPORTS_FILE, "utf-8");
      return JSON.parse(data) || [];
    }
  } catch (err) {
    console.error("Failed to read reports from disk:", err);
  }
  return [];
}

function saveReportsToDisk(reports: ScoutingReport[]) {
  try {
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write reports to disk:", err);
  }
}

// In-memory cache synced with persistent disk file
export const reportsStore: ScoutingReport[] = loadReportsFromDisk();

export function persistReports() {
  saveReportsToDisk(reportsStore);
}
