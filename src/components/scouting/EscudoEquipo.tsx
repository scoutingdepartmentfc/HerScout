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

  const optaHighRes = teamId
    ? `https://omo.akamai.opta.net/image.php?secure=true&h=omo.akamai.opta.net&sport=football&entity=team&description=badges&dimensions=300&id=${teamId}`
    : null;

  const optaBadge = teamId
    ? `https://secure.cache.images.core.optasports.com/soccer/teams/150x150/${teamId}.png`
    : null;

  const sources = (badgeUrl ? [badgeUrl, optaHighRes, optaBadge] : [optaHighRes, optaBadge]).filter(
    Boolean
  ) as string[];

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

  return (
    <img
      src={currentSrc}
      alt={name || "Badge"}
      style={{ width: size, height: size }}
      className={`object-contain shrink-0 bg-transparent ${className}`}
      loading="lazy"
      onError={() => setErrorCount((prev) => prev + 1)}
      title={name}
    />
  );
};

