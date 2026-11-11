export type PlayerTrend = "up" | "neutral" | "down" | null;

/**
 * Computes player performance evolution trend (0-10 match rating scale)
 * based on official match-by-match performances in the last 3 months:
 *
 * 1. "Si siempre es mayor de 8 poner flecha para arriba" -> min >= 8.0 => 'up' (green)
 * 2. "siempre es menor de 6 que sera roja" -> max < 6.0 => 'down' (red)
 * 3. "si va de menos a mas en evolucion flecha verde para arriba" -> secondHalf - firstHalf >= 0.35 => 'up' (green)
 * 4. "Roja igualmente cuando tenga tendencia clara para abajo" -> secondHalf - firstHalf <= -0.35 => 'down' (red)
 * 5. "Si se mantiene siempre este en el mismo valor que oscila 1 punto mantener en naranja excepto si siempre es menor de 6 que sera roja":
 *    - if avg < 6.0 => 'down' (red)
 *    - if avg >= 8.0 => 'up' (green)
 *    - otherwise (stable / oscillating around 6.0 - 8.0) => 'neutral' (orange)
 */
export function computeRatingTrend(ratings: number[]): PlayerTrend {
  if (!ratings || ratings.length === 0) return null;
  const valid = ratings.filter((r) => r != null && !isNaN(r));
  if (valid.length === 0) return null;

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;

  // Single match in range
  if (valid.length === 1) {
    if (valid[0] >= 8.0) return "up";
    if (valid[0] < 6.0) return "down";
    return "neutral";
  }

  // Rule 1: Always >= 8.0 across all matches in period -> Green arrow up
  if (min >= 8.0) return "up";

  // Rule: Always < 6.0 across all matches in period -> Red arrow down
  if (max < 6.0) return "down";

  // Evolution trend: compare first half to second half of the period
  const half = Math.max(1, Math.floor(valid.length / 2));
  const firstHalf = valid.slice(0, half);
  const secondHalf = valid.slice(-half);
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  const diff = secondAvg - firstAvg;

  // Rule 2: De menos a más en evolución (positive progression) -> Green arrow up
  if (diff >= 0.35) return "up";

  // Rule 3: Tendencia clara para abajo (negative progression) -> Red arrow down
  if (diff <= -0.35) return "down";

  // Rule 4: Se mantiene / oscila dentro de ~1 punto:
  // - Si siempre o promedio es < 6 -> roja
  // - Si promedio >= 8 -> verde
  // - En cualquier otro valor estable -> naranja
  if (avg < 6.0) return "down";
  if (avg >= 8.0) return "up";
  return "neutral";
}

