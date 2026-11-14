/**
 * HerScout Reports & Analysis Data Model
 * Phase 10: Full dossier structure, 0-10 rating scale with Not Assessed,
 * review workflow, version history, and tenant/scout privacy.
 */

import { SpondaReportData } from "./spondaReportOptions";

export type ReportType =
  | "full_scouting"
  | "match_observation"
  | "live_scouting"
  | "opposition_analysis"
  | "follow_up";

export type ReportStatus = "draft" | "in_review" | "approved" | "archived";

export type RecommendationTier =
  | "sign_tier_a" // Priority Target
  | "monitor_tier_b" // Continued Observation
  | "depth_tier_c" // Squad Depth Option
  | "pass"; // Discard / No fit

export type ConfidenceLevel = "low" | "medium" | "high" | "definitive";

export type VisibilityMode = "club_private" | "author_private";

export interface CategoryAssessment {
  technical: number | null; // null = "Not Assessed", 1.0 - 10.0
  tactical: number | null;
  physical: number | null;
  psychological: number | null; // Mental / professional traits
}

export interface ReviewFeedback {
  id: string;
  reviewerId: string;
  reviewerName: string;
  reviewerRole: string;
  timestamp: string;
  statusChange?: ReportStatus;
  comment: string;
}

export interface ReportVersion {
  version: number;
  timestamp: string;
  authorName: string;
  summary: string;
  changes: string;
}

export interface ScoutingReport {
  id: string;
  organizationId: string; // Tenant isolation key
  reportType: ReportType;
  status: ReportStatus;
  visibility: VisibilityMode;

  // Metadata
  authorId: string;
  authorName: string;
  authorRole: string;
  scoutName?: string; // Specific Scout Name assigned on report
  createdAt: string;
  updatedAt: string;

  // Player & Match Linkage
  playerId: string;
  playerName: string;
  playerClub: string;
  playerCountry?: string;
  playerPhotoUrl?: string | null;
  playerClubBadgeUrl?: string | null;
  playerClubId?: string | null;
  playerDemarcacion?: string | null;
  playerAge?: number | null;
  playerBirthDate?: string | null;
  primaryPosition: string;
  matchId?: string | null;
  matchFixture?: string | null;
  competition: string;
  observationDate: string;
  tacticalContext: string; // Formation role, opponent pressing context

  // Structured Assessments (0.0 to 10.0, or null for Not Assessed)
  ratings: CategoryAssessment;
  overallRating: number | null; // Calculated transparent average of assessed dimensions, or manual override
  confidence: ConfidenceLevel;

  // Analysis Breakdown
  strengths: string[];
  weaknesses: string[];
  developmentAreas: string[];
  recommendation: RecommendationTier;

  // Notes & Evidence
  freeTextNotes: string;
  videoClipsUrls?: string[];

  // Full SPONDA Dossier Profile items (from SPONDA REPORT.xlsx)
  spondaData?: SpondaReportData;

  // Workflow & Versioning
  currentVersion: number;
  versionHistory: ReportVersion[];
  reviews: ReviewFeedback[];
}

/**
 * Transparent calculation of the overall score:
 * Takes the arithmetic mean of all non-null assessed category dimensions.
 * Returns null if no category was assessed.
 */
export function calculateTransparentOverallRating(ratings: CategoryAssessment): number | null {
  const assessedScores = [
    ratings.technical,
    ratings.tactical,
    ratings.physical,
    ratings.psychological,
  ].filter((val): val is number => val !== null && val !== undefined);

  if (assessedScores.length === 0) return null;

  const sum = assessedScores.reduce((acc, score) => acc + score, 0);
  return parseFloat((sum / assessedScores.length).toFixed(1));
}

/**
 * Rating Scale Definitions (Documented standard):
 * 9.0 - 10.0: World-class / Elite European standard
 * 8.0 - 8.9: Top Tier 1 domestic starter / high European impact
 * 7.0 - 7.9: Solid Tier 1 regular / high potential prospect
 * 6.0 - 6.9: Squad rotation / developmental depth
 * 5.0 - 5.9: Below standard for target league
 * < 5.0: Significant technical/tactical deficiencies
 * null: Not Assessed (N/A)
 */
export const RATING_DEFINITIONS: Record<string, string> = {
  elite: "9.0 - 10.0: World-class elite performer",
  starter: "8.0 - 8.9: First-team Tier 1 starter",
  regular: "7.0 - 7.9: High-potential prospect / reliable regular",
  depth: "6.0 - 6.9: Squad rotation / development player",
  below: "5.0 - 5.9: Deficient in current requirements",
  unassessed: "N/A: Category not assessed in this observation",
};

