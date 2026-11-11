import React, { useState, useEffect } from "react";
import { Trophy } from "lucide-react";

// Known fallback logos for common competitions / leagues
const KNOWN_COMPETITION_LOGOS: Record<string, string> = {
  // Opta competition IDs / Names
  "55hcphd1ccc6eai1ms77460on": "https://images.fotmob.com/image_resources/logo/leaguelogo/42.png", // Champions League
  "uwcl": "https://images.fotmob.com/image_resources/logo/leaguelogo/42.png",
  "champions league": "https://images.fotmob.com/image_resources/logo/leaguelogo/42.png",
  "uefa women's champions league": "https://images.fotmob.com/image_resources/logo/leaguelogo/42.png",
  
  "6vq8j5p3av14nr3iuyi4okhjt": "https://images.fotmob.com/image_resources/logo/leaguelogo/9227.png", // WSL (Women's Super League)
  "wsl": "https://images.fotmob.com/image_resources/logo/leaguelogo/9227.png",
  "women's super league": "https://images.fotmob.com/image_resources/logo/leaguelogo/9227.png",
  "barclays women's super league": "https://images.fotmob.com/image_resources/logo/leaguelogo/9227.png",
  
  "5k620c7y6dlbmcm88dt3eb7t": "https://images.fotmob.com/image_resources/logo/leaguelogo/9907.png", // Liga F
  "liga f": "https://images.fotmob.com/image_resources/logo/leaguelogo/9907.png",
  "primera división femenina": "https://images.fotmob.com/image_resources/logo/leaguelogo/9907.png",
  
  "2z7257m7hj58zuxcjrsg4erzc": "https://images.fotmob.com/image_resources/logo/leaguelogo/9676.png", // Frauen-Bundesliga
  "frauen bundesliga": "https://images.fotmob.com/image_resources/logo/leaguelogo/9676.png",
  "frauen-bundesliga": "https://images.fotmob.com/image_resources/logo/leaguelogo/9676.png",
  
  "2aso72utuctat2ecs6nahjss6": "https://images.fotmob.com/image_resources/logo/leaguelogo/9677.png", // Première Ligue (D1 Arkema)
  "première ligue": "https://images.fotmob.com/image_resources/logo/leaguelogo/9677.png",
  "premiere ligue": "https://images.fotmob.com/image_resources/logo/leaguelogo/9677.png",
  
  "81txfenlgw75nq3u2nfdkj92o": "https://images.fotmob.com/image_resources/logo/leaguelogo/9678.png", // Serie A Women
  "serie a women": "https://images.fotmob.com/image_resources/logo/leaguelogo/9678.png",
  "serie a femminile": "https://images.fotmob.com/image_resources/logo/leaguelogo/9678.png",

  "7ut48s80k421xixh6ev5i6h62": "https://images.fotmob.com/image_resources/logo/leaguelogo/10251.png", // Liga MX Femenil
  "liga mx femenil": "https://images.fotmob.com/image_resources/logo/leaguelogo/10251.png",

  "135j6qi3ap8i3vc9hwdo4fjtg": "https://images.fotmob.com/image_resources/logo/leaguelogo/11054.png", // NWSL x Liga MX Summer Cup
  "nwsl": "https://images.fotmob.com/image_resources/logo/leaguelogo/8991.png",
  "national women's soccer league": "https://images.fotmob.com/image_resources/logo/leaguelogo/8991.png",
};

export const LogoLiga: React.FC<{
  competitionId?: string | null;
  competitionName?: string | null;
  logoUrl?: string | null;
  size?: number;
  className?: string;
}> = ({ competitionId, competitionName, logoUrl, size = 18, className = "" }) => {
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

  if (!resolvedLogoUrl || error) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`flex items-center justify-center rounded bg-slate-800/80 border border-slate-700/60 text-amber-400 shrink-0 ${className}`}
        title={competitionName || "Competition"}
      >
        <Trophy style={{ width: Math.max(10, size * 0.65), height: Math.max(10, size * 0.65) }} />
      </div>
    );
  }

  return (
    <img
      src={resolvedLogoUrl}
      alt={competitionName || "Competition"}
      title={competitionName || "Competition"}
      style={{ width: size, height: size }}
      onError={() => setError(true)}
      className={`object-contain shrink-0 drop-shadow-sm ${className}`}
      loading="lazy"
    />
  );
};

