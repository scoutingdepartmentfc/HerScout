/**
 * SPONDA Scouting Report Constants & Options
 * Extracted directly from SPONDA REPORT.xlsx
 */

export interface SpondaReportData {
  scoutName?: string;
  ratingStars?: number; // 1 to 5, 0.5 step
  bestPosition?: string[];
  secondaryPositions?: string[];
  role?: string;
  reputation?: string;
  reputationPotential?: string;
  developmentPotential?: string;
  scoutingStatus?: string;
  typeOfPlayer?: string;
  positionalProfile?: string;
  tecTacTags?: string[];
  debilities?: string[];
  transferRisk?: string;
  scoutDecision?: string;
  specialities?: string[];
  clubsStatus?: string;
  pros?: string;
  cons?: string;
  scoutOpinion?: string;
  videoUrl?: string;
}

export const SPONDA_ROLES = [
  "Key Player",
  "Starter",
  "Bench",
  "Depth",
  "To Develop",
];

export const SPONDA_REPUTATION = [
  "Global",
  "National",
  "Regional",
];

export const SPONDA_DEVELOPMENT_POTENTIAL = [
  "High",
  "Short",
  "Established",
  "Decreasing",
];

export const SPONDA_SCOUTING_STATUS = [
  "Priority",
  "To Watch",
  "Monitoring",
  "Declined",
  "Signed",
];

export const SPONDA_TYPE_OF_PLAYER = [
  "Wide Player",
  "Attacking Player",
  "Defensive Player",
  "Box-to-Box Player",
  "Creative Player",
  "Physical Player",
];

export const SPONDA_POSITIONAL_PROFILES: { group: string; options: string[] }[] = [
  {
    group: "Goalkeeper (GK)",
    options: ["Classic GK", "Offensive GK", "Advanced GK"],
  },
  {
    group: "Full-Back (RB/LB)",
    options: [
      "Attacking Full-Back",
      "Defensive Full-Back",
      "Balance Full-Back",
      "Can Play Inverted",
    ],
  },
  {
    group: "Centre-Back (CB)",
    options: ["Offensive CB", "Classic CB"],
  },
  {
    group: "Defensive Midfield (DMF)",
    options: ["Creative", "Stopper", "Box To Box", "Complete"],
  },
  {
    group: "Midfield (MF)",
    options: ["Controler", "Box To Box", "2nd Line Arrival"],
  },
  {
    group: "Attacking Midfield (OMF)",
    options: ["Classic 10", "Second Striker", "3 AMF Positions"],
  },
  {
    group: "Winger (WIN)",
    options: ["Classic Winger", "Inverted Winger"],
  },
  {
    group: "Centre-Forward (CF)",
    options: ["Classic Number 9", "False 9", "3 Attacking Positions"],
  },
];

export const SPONDA_TEC_TAC_TAGS: { category: string; tags: string[] }[] = [
  {
    category: "01. ON THE BALL",
    tags: [
      "Skill",
      "Oriented Reception",
      "Between-Lines Reception",
      "Pressure Reception",
      "Line-Breaking Pass",
      "Quick Turns",
      "Driving Line-Breaker",
      "1v1",
      "Tight-Space Dribbling",
      "First Control Offensive",
      "Ball Protector",
      "Weak-Foot dominant",
      "Magic Pass",
      "Long pass",
      "Magic foot",
      "Penetring the area",
      "Long Shooter",
      "Back pass into de area",
      "Goal Hunter",
      "First-Touch Passer",
      "Header",
      "Crosser",
      "MF Passer",
      "Ground Balls",
      "Penalty Specialist",
    ],
  },
  {
    category: "02. OFF THE BALL",
    tags: [
      "Runs in Behind",
      "Blind-Side Movement",
      "Between-Lines Movement",
      "Width Creation",
      "Space Creation",
      "Box Arrival",
      "Late Box Arrival",
      "Overlapping Runs",
      "Interior Runs",
      "Defensive Duels",
      "Pressing Orientation",
      "Pressing Activation",
      "Counter-Pressing",
      "Defensive Recovery",
      "Scanning",
      "Defensive Positioning",
      "Defensive Anticipation",
      "Defensive Covering",
      "Tracking Back",
      "Aerial Balls",
    ],
  },
  {
    category: "03. GAME INTELLIGENCE",
    tags: [
      "Decision Making Constancy",
      "Game Vision",
      "Spatial Awareness",
      "Wants the ball",
      "Tactical Adaptability",
      "Risk Assessment",
      "Transitions",
      "Anticipation",
    ],
  },
  {
    category: "04. PERSONALITY",
    tags: [
      "Leader",
      "Veteran",
      "Key Moments Decisive",
      "Team Player",
      "Top Star",
    ],
  },
  {
    category: "GOALKEEPER SPECIFIC",
    tags: ["GK 1V1", "Advanced GK", "Aerial Balls"],
  },
];

export const SPONDA_DEBILITIES = [
  "Aerial Balls",
  "Balls behind defense",
  "Limited Passer",
  "Penalties",
  "Defensive 1v1",
  "Slow Transitions",
  "Weak-Foot Reliance",
  "Inconsistent Decision Making",
  "Physical Stamina",
  "Tactical Rigidity",
];

export const SPONDA_TRANSFER_RISK = [
  "Low",
  "Medium",
  "High",
];

export const SPONDA_SCOUT_DECISION = [
  "To Sign",
  "To Monitor",
  "To Decline",
];

export const SPONDA_SPECIALITIES: { group: string; items: string[] }[] = [
  {
    group: "Offensive",
    items: [
      "Bomber",
      "Final Pass",
      "Crosser",
      "Shooter",
      "Set Piece",
      "Metronome",
      "Dribbler",
      "Game Changer",
      "Arrival Finisher",
      "Cross Finisher",
      "The 10",
      "Multipositional",
    ],
  },
  {
    group: "Defensive",
    items: [
      "The Wall",
      "Tackling",
      "Defensive Playmaker",
      "Old School Defense",
      "Positional",
      "Regista",
      "Aerial Leader",
    ],
  },
  {
    group: "Goalkeeper",
    items: [
      "Goalkeeper",
      "Aerial Balls",
      "Acrobatic",
      "Penalty Stopper",
      "1V1 Wall",
    ],
  },
  {
    group: "Physical & Athletic",
    items: [
      "Flash",
      "Engine",
      "90' Guarantee",
      "Electric",
      "Field Player",
    ],
  },
];

export const SPONDA_CLUBS_STATUS = [
  "FINISH 1ST",
  "TOP 3",
  "TOP 5",
  "MIDDLE TABLE",
  "SAVE THE RELEGATION",
  "PROMOTION TO 1ST DIVISION",
  "TOP 6 SECOND DIVISION",
];

export const SPONDA_POSITIONS = [
  "Goalkeeper (GK)",
  "Right-Back (RB)",
  "Left-Back (LB)",
  "Centre-Back (CB)",
  "Defensive Midfielder (DMF)",
  "Central Midfielder (CM)",
  "Attacking Midfielder (CAM)",
  "Right Winger (RW)",
  "Left Winger (LW)",
  "Striker / Centre-Forward (ST/CF)",
];

