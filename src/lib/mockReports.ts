import { ScoutingReport } from "@/lib/reports";

export const INITIAL_REPORTS: ScoutingReport[] = [
  {
    id: "rep-101",
    organizationId: "org-chelsea",
    reportType: "match_observation",
    status: "approved",
    visibility: "club_private",

    authorId: "user-marcus",
    authorName: "Marcus Vance",
    authorRole: "Senior Field Scout",
    createdAt: "2026-10-24T14:30:00Z",
    updatedAt: "2026-10-25T10:15:00Z",

    playerId: "p-1",
    playerName: "Vicky López",
    playerClub: "FC Barcelona",
    playerCountry: "Spain",
    primaryPosition: "Attacking Midfielder (AMF)",
    matchId: "m-uwcl-4",
    matchFixture: "FC Barcelona vs St. Pölten (UWCL)",
    competition: "UEFA Women's Champions League",
    observationDate: "2026-10-24",
    tacticalContext: "Operated as right-sided interior #10 in a fluid 4-3-3 against a deep 5-4-1 low block.",

    ratings: {
      technical: 9.2,
      tactical: 8.8,
      physical: 7.5,
      psychological: 8.9,
    },
    overallRating: 8.6,
    confidence: "high",

    strengths: [
      "Exceptional first touch under high pressure in half-spaces",
      "Progressive passing between defensive lines",
      "Rapid body feints and tight-space deceleration",
    ],
    weaknesses: [
      "Aerial duel contestation against physical low blocks",
      "Defensive transition tracking when overloaded on counter-attacks",
    ],
    developmentAreas: [
      "Upper body strength conditioning for Premier League physical duels",
    ],
    recommendation: "sign_tier_a",

    freeTextNotes:
      "Vicky demonstrated world-class decision-making under pressing traps. She repeatedly exploited the space behind St. Pölten's double pivot, generating 4 key passes and completing 6 of 7 dribbles.",

    currentVersion: 2,
    versionHistory: [
      {
        version: 1,
        timestamp: "2026-10-24T16:00:00Z",
        authorName: "Marcus Vance",
        summary: "Initial match observation draft filed from stadium box.",
        changes: "Initial submission.",
      },
      {
        version: 2,
        timestamp: "2026-10-25T10:15:00Z",
        authorName: "Elena Rostova",
        summary: "Chief Scout review and sign-off.",
        changes: "Approved for Recruitment Committee dossier.",
      },
    ],
    reviews: [
      {
        id: "rev-1",
        reviewerId: "user-elena",
        reviewerName: "Elena Rostova",
        reviewerRole: "Chief Scout",
        timestamp: "2026-10-25T10:15:00Z",
        statusChange: "approved",
        comment: "Outstanding assessment. Confirmed as top target for the upcoming summer window.",
      },
    ],
  },
  {
    id: "rep-102",
    organizationId: "org-chelsea",
    reportType: "full_scouting",
    status: "in_review",
    visibility: "club_private",

    authorId: "user-elena",
    authorName: "Elena Rostova",
    authorRole: "Chief Scout",
    createdAt: "2026-10-26T09:00:00Z",
    updatedAt: "2026-10-28T16:45:00Z",

    playerId: "p-2",
    playerName: "Melchie Dumornay",
    playerClub: "Olympique Lyonnais",
    playerCountry: "Haiti",
    primaryPosition: "Centre Forward / Second Striker (CF)",
    matchId: "m-prem-8",
    matchFixture: "Lyon vs Paris FC",
    competition: "Première Ligue",
    observationDate: "2026-10-26",
    tacticalContext: "Centre-forward leading high press in 4-2-3-1.",

    ratings: {
      technical: 9.0,
      tactical: 8.9,
      physical: 9.4,
      psychological: 9.1,
    },
    overallRating: 9.1,
    confidence: "definitive",

    strengths: [
      "Explosive acceleration over 15–30m distances",
      "Two-footed finishing inside the 18-yard box",
      "Relentless pressing intensity triggers",
    ],
    weaknesses: [
      "Occasionally over-dribbles in crowded central corridors",
    ],
    developmentAreas: [
      "Set-piece aerial heading consistency",
    ],
    recommendation: "sign_tier_a",

    freeTextNotes:
      "Dumornay matches all athletic and technical benchmarks required for our high-intensity tactical setup. Physical durability and composure under pressure are elite.",

    currentVersion: 1,
    versionHistory: [
      {
        version: 1,
        timestamp: "2026-10-26T09:00:00Z",
        authorName: "Elena Rostova",
        summary: "Full scouting dossier compiled for Sporting Director review.",
        changes: "Created dossier.",
      },
    ],
    reviews: [],
  },
  {
    id: "rep-103",
    organizationId: "org-chelsea",
    reportType: "opposition_analysis",
    status: "draft",
    visibility: "author_private",

    authorId: "user-marcus",
    authorName: "Marcus Vance",
    authorRole: "Senior Field Scout",
    createdAt: "2026-10-28T11:00:00Z",
    updatedAt: "2026-10-28T11:00:00Z",

    playerId: "p-3",
    playerName: "Rosa Kafaji",
    playerClub: "Arsenal WFC",
    playerCountry: "Sweden",
    primaryPosition: "Left Winger (LW)",
    matchId: "m-wsl-6",
    matchFixture: "Arsenal vs Everton (FA WSL)",
    competition: "FA Women's Super League",
    observationDate: "2026-10-28",
    tacticalContext: "Inverted left winger in high possession phase.",

    ratings: {
      technical: 8.5,
      tactical: 8.0,
      physical: 7.8,
      psychological: null, // Demonstrated "Not Assessed"
    },
    overallRating: 8.1,
    confidence: "medium",

    strengths: [
      "Direct carrying towards penalty box",
      "Unpredictable 1v1 separation",
    ],
    weaknesses: [
      "Defensive cover on wing counter-attacks",
    ],
    developmentAreas: [
      "Decision speed when double-teamed by full-back and winger",
    ],
    recommendation: "monitor_tier_b",

    freeTextNotes:
      "Draft observation. Requires a second live scouting trip before issuing formal board recommendation.",

    currentVersion: 1,
    versionHistory: [
      {
        version: 1,
        timestamp: "2026-10-28T11:00:00Z",
        authorName: "Marcus Vance",
        summary: "Private draft created.",
        changes: "Initial notes.",
      },
    ],
    reviews: [],
  },
];

