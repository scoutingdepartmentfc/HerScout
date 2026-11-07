/**
 * Diccionario oficial de colores e identidades visuales por club para los cromos y tarjetas.
 * Incluye combinaciones primarias y secundarias con gradientes exactos.
 */

export interface ClubTheme {
  bg: string;
  overlay?: string;
  textLight: boolean;
}

export const KNOWN_CLUB_THEMES: Record<string, ClubTheme> = {
  // España - Liga F / 1ª / 2ª Fed
  "barcelona": {
    bg: "linear-gradient(135deg, #004d98 0%, #154284 35%, #7a1c32 70%, #a50044 100%)",
    textLight: true,
  },
  "real madrid": {
    bg: "linear-gradient(135deg, #ffffff 0%, #edf1f7 35%, #00266b 85%, #001438 100%)",
    textLight: false,
  },
  "atlético": {
    bg: "linear-gradient(135deg, #cb3524 0%, #e11d48 40%, #0c2340 100%)",
    textLight: true,
  },
  "atletico": {
    bg: "linear-gradient(135deg, #cb3524 0%, #e11d48 40%, #0c2340 100%)",
    textLight: true,
  },
  "athletic": {
    bg: "linear-gradient(135deg, #ee2737 0%, #ba111f 50%, #111827 100%)",
    textLight: true,
  },
  "real sociedad": {
    bg: "linear-gradient(135deg, #004d98 0%, #1e40af 45%, #ffffff 50%, #004d98 100%)",
    textLight: true,
  },
  "sevilla": {
    bg: "linear-gradient(135deg, #ffffff 0%, #f4f4f4 35%, #d4001f 75%, #8f0015 100%)",
    textLight: false,
  },
  "betis": {
    bg: "linear-gradient(135deg, #00954c 0%, #057a3e 45%, #ffffff 50%, #00954c 100%)",
    textLight: true,
  },
  "valencia": {
    bg: "linear-gradient(135deg, #ffffff 0%, #f8f8f8 40%, #ee7c00 70%, #111827 100%)",
    textLight: false,
  },
  "levante": {
    bg: "linear-gradient(135deg, #003366 0%, #004080 40%, #990000 70%, #cc0000 100%)",
    textLight: true,
  },
  "alavés": {
    bg: "linear-gradient(135deg, #003399 0%, #0044bb 45%, #ffffff 50%, #003399 100%)",
    textLight: true,
  },
  "alaves": {
    bg: "linear-gradient(135deg, #003399 0%, #0044bb 45%, #ffffff 50%, #003399 100%)",
    textLight: true,
  },
  "sporting gijón": {
    bg: "linear-gradient(135deg, #d32027 0%, #e11d48 40%, #ffffff 50%, #d32027 100%)",
    textLight: true,
  },
  "sporting de gijon": {
    bg: "linear-gradient(135deg, #d32027 0%, #e11d48 40%, #ffffff 50%, #d32027 100%)",
    textLight: true,
  },
  "sporting de huelva": {
    bg: "linear-gradient(135deg, #004b97 0%, #0284c7 45%, #ffffff 50%, #004b97 100%)",
    textLight: true,
  },
  "eibar": {
    bg: "linear-gradient(135deg, #003366 0%, #002244 50%, #8b0000 100%)",
    textLight: true,
  },
  "éibar": {
    bg: "linear-gradient(135deg, #003366 0%, #002244 50%, #8b0000 100%)",
    textLight: true,
  },
  "deportivo": {
    bg: "linear-gradient(135deg, #004d98 0%, #1d4ed8 45%, #ffffff 50%, #004d98 100%)",
    textLight: true,
  },
  "espanyol": {
    bg: "linear-gradient(135deg, #007bc0 0%, #0284c7 45%, #ffffff 50%, #007bc0 100%)",
    textLight: true,
  },
  "villarreal": {
    bg: "linear-gradient(135deg, #ffd700 0%, #eab308 60%, #004b97 100%)",
    textLight: false,
  },
  "madrid cff": {
    bg: "linear-gradient(135deg, #ffffff 0%, #f3f4f6 50%, #ec4899 90%, #db2777 100%)",
    textLight: false,
  },
  "granada": {
    bg: "linear-gradient(135deg, #a61c1c 0%, #dc2626 45%, #ffffff 50%, #003366 100%)",
    textLight: true,
  },

  // Inglaterra - WSL
  "chelsea": {
    bg: "linear-gradient(135deg, #034694 0%, #001f5c 50%, #034694 100%)",
    textLight: true,
  },
  "arsenal": {
    bg: "linear-gradient(135deg, #db0007 0%, #9c0004 50%, #023474 100%)",
    textLight: true,
  },
  "manchester city": {
    bg: "linear-gradient(135deg, #6cabdd 0%, #38bdf8 45%, #1c2c5b 100%)",
    textLight: true,
  },
  "man city": {
    bg: "linear-gradient(135deg, #6cabdd 0%, #38bdf8 45%, #1c2c5b 100%)",
    textLight: true,
  },
  "manchester united": {
    bg: "linear-gradient(135deg, #c70101 0%, #7e0000 55%, #111827 100%)",
    textLight: true,
  },
  "man utd": {
    bg: "linear-gradient(135deg, #c70101 0%, #7e0000 55%, #111827 100%)",
    textLight: true,
  },
  "liverpool": {
    bg: "linear-gradient(135deg, #c8102e 0%, #8a0c20 50%, #00b2a9 95%, #008080 100%)",
    textLight: true,
  },
  "everton": {
    bg: "linear-gradient(135deg, #003399 0%, #002266 50%, #003399 100%)",
    textLight: true,
  },
  "tottenham": {
    bg: "linear-gradient(135deg, #ffffff 0%, #e2e8f0 45%, #132257 85%, #0b1433 100%)",
    textLight: false,
  },
  "brighton": {
    bg: "linear-gradient(135deg, #0057b8 0%, #0284c7 45%, #ffffff 50%, #ffcd00 100%)",
    textLight: true,
  },
  "aston villa": {
    bg: "linear-gradient(135deg, #670e36 0%, #4a0a26 50%, #95bfe5 100%)",
    textLight: true,
  },
  "west ham": {
    bg: "linear-gradient(135deg, #7a263a 0%, #541726 55%, #1bb1e7 100%)",
    textLight: true,
  },
  "leicester": {
    bg: "linear-gradient(135deg, #003090 0%, #001f5c 50%, #fdbe11 100%)",
    textLight: true,
  },

  // Alemania - Frauen Bundesliga
  "bayern": {
    bg: "linear-gradient(135deg, #dc052d 0%, #a00320 50%, #0066b2 100%)",
    textLight: true,
  },
  "wolfsburg": {
    bg: "linear-gradient(135deg, #65b32e 0%, #468020 55%, #111827 100%)",
    textLight: true,
  },
  "frankfurt": {
    bg: "linear-gradient(135deg, #e1000f 0%, #a0000a 45%, #ffffff 50%, #111827 100%)",
    textLight: true,
  },
  "hoffenheim": {
    bg: "linear-gradient(135deg, #005ca9 0%, #003d73 50%, #ffffff 100%)",
    textLight: true,
  },

  // Francia - Première Ligue
  "lyon": {
    bg: "linear-gradient(135deg, #1b3866 0%, #002244 50%, #da291c 100%)",
    textLight: true,
  },
  "paris saint-germain": {
    bg: "linear-gradient(135deg, #001c3d 0%, #002e63 45%, #e30613 50%, #001c3d 100%)",
    textLight: true,
  },
  "psg": {
    bg: "linear-gradient(135deg, #001c3d 0%, #002e63 45%, #e30613 50%, #001c3d 100%)",
    textLight: true,
  },
  "paris fc": {
    bg: "linear-gradient(135deg, #002b66 0%, #004499 50%, #111827 100%)",
    textLight: true,
  },

  // Italia - Serie A Women
  "juventus": {
    bg: "linear-gradient(135deg, #ffffff 0%, #f1f5f9 45%, #111827 50%, #000000 100%)",
    textLight: false,
  },
  "roma": {
    bg: "linear-gradient(135deg, #8e1f2f 0%, #63141f 50%, #f2a900 100%)",
    textLight: true,
  },
  "inter": {
    bg: "linear-gradient(135deg, #0066b2 0%, #004480 45%, #000000 50%, #111827 100%)",
    textLight: true,
  },
  "milan": {
    bg: "linear-gradient(135deg, #fb090b 0%, #ba0507 45%, #000000 50%, #111827 100%)",
    textLight: true,
  },
  "fiorentina": {
    bg: "linear-gradient(135deg, #4c2682 0%, #321858 50%, #ffffff 100%)",
    textLight: true,
  },

  // Portugal
  "sporting cp": {
    bg: "linear-gradient(135deg, #008057 0%, #005a3c 45%, #ffffff 50%, #008057 100%)",
    textLight: true,
  },
  "sporting clube de portugal": {
    bg: "linear-gradient(135deg, #008057 0%, #005a3c 45%, #ffffff 50%, #008057 100%)",
    textLight: true,
  },
  "benfica": {
    bg: "linear-gradient(135deg, #e1000f 0%, #9e0009 50%, #ffffff 100%)",
    textLight: true,
  },
  "braga": {
    bg: "linear-gradient(135deg, #d32027 0%, #a01016 45%, #ffffff 50%, #d32027 100%)",
    textLight: true,
  },

  // México - Liga MX Femenil
  "tigres": {
    bg: "linear-gradient(135deg, #fdb913 0%, #e59f00 45%, #004a8f 50%, #003366 100%)",
    textLight: false,
  },
  "monterrey": {
    bg: "linear-gradient(135deg, #002b66 0%, #004080 45%, #ffffff 50%, #002b66 100%)",
    textLight: true,
  },
  "rayadas": {
    bg: "linear-gradient(135deg, #002b66 0%, #004080 45%, #ffffff 50%, #002b66 100%)",
    textLight: true,
  },
  "américa": {
    bg: "linear-gradient(135deg, #fcee21 0%, #f5db0a 50%, #002a54 100%)",
    textLight: false,
  },
  "america": {
    bg: "linear-gradient(135deg, #fcee21 0%, #f5db0a 50%, #002a54 100%)",
    textLight: false,
  },
  "chivas": {
    bg: "linear-gradient(135deg, #e4002b 0%, #b80022 45%, #ffffff 50%, #002d62 100%)",
    textLight: true,
  },
  "guadalajara": {
    bg: "linear-gradient(135deg, #e4002b 0%, #b80022 45%, #ffffff 50%, #002d62 100%)",
    textLight: true,
  },
};

/**
 * Obtiene el esquema de color exacto a partir del nombre del equipo.
 */
export function getClubTheme(name?: string | null): ClubTheme {
  const clean = (name || "").toLowerCase().trim();

  // 1. Coincidencia exacta o por subcadena en diccionario oficial
  for (const [key, theme] of Object.entries(KNOWN_CLUB_THEMES)) {
    if (clean.includes(key) || key.includes(clean)) {
      return theme;
    }
  }

  // 2. Coincidencias por palabras clave frecuentes
  if (clean.includes("red") || clean.includes("rojo") || clean.includes("aviles")) {
    return {
      bg: "linear-gradient(135deg, #c8102e 0%, #8a0c20 50%, #111827 100%)",
      textLight: true,
    };
  }
  if (clean.includes("blue") || clean.includes("azul")) {
    return {
      bg: "linear-gradient(135deg, #003399 0%, #002266 50%, #0f172a 100%)",
      textLight: true,
    };
  }
  if (clean.includes("green") || clean.includes("verde")) {
    return {
      bg: "linear-gradient(135deg, #008057 0%, #005a3c 50%, #064e3b 100%)",
      textLight: true,
    };
  }

  // 3. Fallback armónico y elegante en tonos azul marino fútbol profesional
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = clean.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = 200 + (Math.abs(hash) % 40); // Tonos azulados deportivos elegantes (200-240)
  const h2 = h1 + 20;

  return {
    bg: `linear-gradient(135deg, hsl(${h1}, 80%, 26%) 0%, hsl(${h1}, 85%, 15%) 50%, hsl(${h2}, 80%, 9%) 100%)`,
    textLight: true,
  };
}

