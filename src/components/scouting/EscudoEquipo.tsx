import React, { useEffect, useState } from "react";
import { Shield } from "lucide-react";

export const EscudoEquipo: React.FC<{
  teamId?: string | null;
  badgeUrl?: string | null;
  name?: string;
  size?: number;
  className?: string;
}> = ({ teamId, badgeUrl, name = "", size = 20, className = "" }) => {
  const [errorCount, setErrorCount] = useState(0);

  useEffect(() => setErrorCount(0), [badgeUrl, teamId]);

  const isRealMadrid =
    teamId === "vaikl8nl7hdr4y9jj4jyb9ey" ||
    name.toLowerCase().includes("real madrid");

  // Opta has a missing badge placeholder (grey shield) for Real Madrid Femenino; omit it
  const optaHighRes =
    teamId && !isRealMadrid
      ? `https://omo.akamai.opta.net/image.php?secure=true&h=omo.akamai.opta.net&sport=football&entity=team&description=badges&dimensions=300&id=${teamId}`
      : null;

  const optaBadge =
    teamId && !isRealMadrid
      ? `https://secure.cache.images.core.optasports.com/soccer/teams/150x150/${teamId}.png`
      : null;

  // Curated transparent badges from DB/Storage take first priority
  const sources = [
    badgeUrl,
    optaHighRes,
    optaBadge,
    isRealMadrid ? "https://pgrrozynqsqcgfyrpnts.supabase.co/storage/v1/object/public/team-badges/clubs/real_madrid_transparent.png" : null,
  ].filter(Boolean) as string[];

  const currentSrc = sources[errorCount] || null;

  if (!currentSrc || errorCount >= sources.length) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`flex items-center justify-center rounded-full bg-secondary/80 border border-border/60 text-muted-foreground shrink-0 ${className}`}
        title={name}
      >
        <Shield style={{ width: size * 0.65, height: size * 0.65 }} />
      </div>
    );
  }

  // Todos iguales: mismo círculo claro y tamaño, tenga el escudo fondo propio (JPG) o sea transparente (PNG)
  return (
    <span
      style={{ width: size, height: size, padding: Math.max(1, Math.round(size * 0.12)) }}
      className={`inline-flex items-center justify-center rounded-full bg-white shrink-0 overflow-hidden ring-1 ring-black/10 ${className}`}
      title={name}
    >
      <img
        src={currentSrc}
        alt={name || "Badge"}
        className="h-full w-full object-contain"
        loading="lazy"
        onError={() => setErrorCount((prev) => prev + 1)}
      />
    </span>
  );
};

