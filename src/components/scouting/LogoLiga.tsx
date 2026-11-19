import React, { useState, useEffect } from "react";
import { Trophy } from "lucide-react";

// Reliable Supabase Storage bucket path for league logos
const SUPABASE_LIGAS_BASE = "https://pgrrozynqsqcgfyrpnts.supabase.co/storage/v1/object/public/team-badges/ligas/";

// Known fallback logos for common competitions / leagues
const KNOWN_COMPETITION_LOGOS: Record<string, string> = {
  // Opta competition IDs / Names
  "55hcphd1ccc6eai1ms77460on": "https://images.fotmob.com/image_resources/logo/leaguelogo/42.png", // Champions League
  "uwcl": "https://images.fotmob.com/image_resources/logo/leaguelogo/42.png",
  "champions league": "https://images.fotmob.com/image_resources/logo/leaguelogo/42.png",
  "uefa women's champions league": "https://images.fotmob.com/image_resources/logo/leaguelogo/42.png",
  "uefa women's championship": "https://images.fotmob.com/image_resources/logo/leaguelogo/42.png",
  "uefa women's europa cup": "https://images.fotmob.com/image_resources/logo/leaguelogo/42.png",
  "uefa u19 championship women": "https://images.fotmob.com/image_resources/logo/leaguelogo/42.png",
  "conmebol libertadores femenina": "https://images.fotmob.com/image_resources/logo/leaguelogo/42.png",
  "caf women's champions league": "https://images.fotmob.com/image_resources/logo/leaguelogo/42.png",
  "fifa women's champions cup": "https://images.fotmob.com/image_resources/logo/leaguelogo/42.png",

  // England - Women's Super League (WSL)
  "6vq8j5p3av14nr3iuyi4okhjt": `${SUPABASE_LIGAS_BASE}sd-ENG1.jpg`,
  "wsl": `${SUPABASE_LIGAS_BASE}sd-ENG1.jpg`,
  "women's super league": `${SUPABASE_LIGAS_BASE}sd-ENG1.jpg`,
  "women’s super league": `${SUPABASE_LIGAS_BASE}sd-ENG1.jpg`,
  "barclays women's super league": `${SUPABASE_LIGAS_BASE}sd-ENG1.jpg`,

  // Spain - Liga F, Primera Fed, Segunda Fed, Copa de la Reina
  "5k620c7y6dlbmcm88dt3eb7t": `${SUPABASE_LIGAS_BASE}sd-ESP1.jpg`,
  "liga f": `${SUPABASE_LIGAS_BASE}sd-ESP1.jpg`,
  "primera división femenina": `${SUPABASE_LIGAS_BASE}sd-ESP1.jpg`,

  "6v78kbs8d4hspxdgcti23a5n8": `${SUPABASE_LIGAS_BASE}sd-ESPR.jpg`,
  "primera federación femenina": `${SUPABASE_LIGAS_BASE}sd-ESPR.jpg`,
  "primera federación": `${SUPABASE_LIGAS_BASE}sd-ESPR.jpg`,

  "2fhhxvyhwkxd6gpgg9nbb2p2i": `${SUPABASE_LIGAS_BASE}sd-ES31.jpg`,
  "segunda federación femenina": `${SUPABASE_LIGAS_BASE}sd-ES31.jpg`,
  "segunda federación": `${SUPABASE_LIGAS_BASE}sd-ES31.jpg`,

  "2kfd1pg7ymajwbxlfy1j2dhio": `${SUPABASE_LIGAS_BASE}sd-ESP1.jpg`,
  "copa de la reina": `${SUPABASE_LIGAS_BASE}sd-ESP1.jpg`,

  // Germany - Frauen-Bundesliga
  "2z7257m7hj58zuxcjrsg4erzc": `${SUPABASE_LIGAS_BASE}sd-A1.jpg`,
  "frauen bundesliga": `${SUPABASE_LIGAS_BASE}sd-A1.jpg`,
  "frauen-bundesliga": `${SUPABASE_LIGAS_BASE}sd-A1.jpg`,

  // France - Première Ligue (D1 Arkema)
  "2aso72utuctat2ecs6nahjss6": `${SUPABASE_LIGAS_BASE}sd-DAN1.jpg`,
  "première ligue": `${SUPABASE_LIGAS_BASE}sd-DAN1.jpg`,
  "premiere ligue": `${SUPABASE_LIGAS_BASE}sd-DAN1.jpg`,

  // Italy - Serie A Women
  "81txfenlgw75nq3u2nfdkj92o": `${SUPABASE_LIGAS_BASE}sd-IT1.jpg`,
  "serie a women": `${SUPABASE_LIGAS_BASE}sd-IT1.jpg`,
  "serie a femminile": `${SUPABASE_LIGAS_BASE}sd-IT1.jpg`,

  // Mexico - Liga MX Femenil
  "7ut48s80k421xixh6ev5i6h62": `${SUPABASE_LIGAS_BASE}sd-MXAP.jpg`,
  "liga mx femenil": `${SUPABASE_LIGAS_BASE}sd-MXAP.jpg`,
  "liga femenil": `${SUPABASE_LIGAS_BASE}sd-MXAP.jpg`,
  "liga mx": `${SUPABASE_LIGAS_BASE}sd-MXAP.jpg`,

  // Australia - A-League Women
  "9p3nnxhdjahfn8qswpzy8oyc3": `${SUPABASE_LIGAS_BASE}sd-WL.jpg`,
  "a-league women": `${SUPABASE_LIGAS_BASE}sd-WL.jpg`,
  "a-league": `${SUPABASE_LIGAS_BASE}sd-WL.jpg`,

  // Scotland - SWPL 1
  "cydr5rltozch9qnzjurt1r7d9": `${SUPABASE_LIGAS_BASE}sd-SWPL.jpg`,
  "swpl 1": `${SUPABASE_LIGAS_BASE}sd-SWPL.jpg`,
  "swpl": `${SUPABASE_LIGAS_BASE}sd-SWPL.jpg`,

  // Canada - Northern Super League
  "9q5tcfz0w9ku2xq49c0df48b8": `${SUPABASE_LIGAS_BASE}sd-CA1.jpg`,
  "northern super league": `${SUPABASE_LIGAS_BASE}sd-CA1.jpg`,

  // USA - NWSL
  "135j6qi3ap8i3vc9hwdo4fjtg": `${SUPABASE_LIGAS_BASE}sd-NWSL.jpg`,
  "nwsl": `${SUPABASE_LIGAS_BASE}sd-NWSL.jpg`,
  "national women's soccer league": `${SUPABASE_LIGAS_BASE}sd-NWSL.jpg`,
};

export const LogoLiga: React.FC<{
  competitionId?: string | null;
  competitionName?: string | null;
  logoUrl?: string | null;
  size?: number;
  className?: string;
  whiteBg?: boolean;
}> = ({ competitionId, competitionName, logoUrl, size = 18, className = "", whiteBg = true }) => {
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
  }, [logoUrl, competitionId, competitionName]);

  const resolvedLogoUrl = React.useMemo(() => {
    if (logoUrl) return logoUrl;
    if (competitionId) {
      const byId = KNOWN_COMPETITION_LOGOS[competitionId.toLowerCase()];
      if (byId) return byId;
    }
    if (competitionName) {
      const cleanName = competitionName.toLowerCase().trim();
      const direct = KNOWN_COMPETITION_LOGOS[cleanName];
      if (direct) return direct;
      for (const [key, url] of Object.entries(KNOWN_COMPETITION_LOGOS)) {
        if (cleanName.includes(key)) return url;
      }
    }
    return null;
  }, [logoUrl, competitionId, competitionName]);

  const innerSize = Math.max(10, size - 4);

  if (!resolvedLogoUrl || error) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`flex items-center justify-center rounded-md ${
          whiteBg ? "bg-white shadow-xs border border-white/40" : "bg-slate-800/80 border border-slate-700/60"
        } text-amber-500 shrink-0 ${className}`}
        title={competitionName || "Competition"}
      >
        <Trophy style={{ width: Math.max(10, innerSize * 0.75), height: Math.max(10, innerSize * 0.75) }} />
      </div>
    );
  }

  return (
    <div
      style={{ width: size, height: size }}
      className={`flex items-center justify-center rounded-md overflow-hidden ${
        whiteBg ? "bg-white p-0.5 shadow-xs border border-white/40" : ""
      } shrink-0 ${className}`}
      title={competitionName || "Competition"}
    >
      <img
        src={resolvedLogoUrl}
        alt={competitionName || "Competition"}
        style={{ width: innerSize, height: innerSize }}
        onError={() => setError(true)}
        className="object-contain"
        loading="lazy"
      />
    </div>
  );
};

