import React, { useState } from "react";

/**
 * Mapeo completo de nombres de país (en inglés, español, alemán y códigos comunes)
 * a su código ISO 3166-1 alpha-2 para FlagCDN (https://flagcdn.com).
 */
export const COUNTRY_ISO_MAP: Record<string, string> = {
  // España y Reino Unido
  Spain: "es",
  España: "es",
  England: "gb-eng",
  Inglaterra: "gb-eng",
  Scotland: "gb-sct",
  Scottland: "gb-sct",
  Escocia: "gb-sct",
  Wales: "gb-wls",
  Gales: "gb-wls",
  "Northern Ireland": "gb-nir",
  "Irlanda del Norte": "gb-nir",

  // Europa Occidental y Central
  France: "fr",
  Francia: "fr",
  Germany: "de",
  Alemania: "de",
  Italy: "it",
  Italia: "it",
  Portugal: "pt",
  Netherlands: "nl",
  Holland: "nl",
  "Países Bajos": "nl",
  Belgium: "be",
  Bélgica: "be",
  Switzerland: "ch",
  Suiza: "ch",
  Austria: "at",
  Ireland: "ie",
  Irlanda: "ie",
  "Republic of Ireland": "ie",
  Luxembourg: "lu",
  Luxemburgo: "lu",
  Andorra: "ad",
  Gibraltar: "gi",
  "San Marino": "sm",
  Monaco: "mc",
  Mónaco: "mc",
  Malta: "mt",
  Cyprus: "cy",
  Chipre: "cy",

  // Países Nórdicos
  Sweden: "se",
  Suecia: "se",
  Norway: "no",
  Noruega: "no",
  Denmark: "dk",
  Dinamarca: "dk",
  Finland: "fi",
  Finlandia: "fi",
  Iceland: "is",
  Islandia: "is",
  "Faroe Islands": "fo",
  "Faroe Island": "fo",
  Färöer: "fo",
  Greenland: "gl",
  Groenlandia: "gl",

  // Europa del Este y Balcanes
  Poland: "pl",
  Polonia: "pl",
  Czechia: "cz",
  "Czech Republic": "cz",
  Chequia: "cz",
  Slovakia: "sk",
  Eslovaquia: "sk",
  Hungary: "hu",
  Hungría: "hu",
  Romania: "ro",
  Rumanía: "ro",
  Bulgaria: "bg",
  Greece: "gr",
  Grecia: "gr",
  Croatia: "hr",
  Croacia: "hr",
  Serbia: "rs",
  Slovenia: "si",
  Eslovenia: "si",
  "Bosnia and Herzegovina": "ba",
  "Bosnia-Herzegovina": "ba",
  Bosnia: "ba",
  Montenegro: "me",
  "North Macedonia": "mk",
  Macedonia: "mk",
  Albania: "al",
  Kosovo: "xk",
  Ukraine: "ua",
  Ucrania: "ua",
  Belarus: "by",
  Bielorrusia: "by",
  Russia: "ru",
  Rusia: "ru",
  Estonia: "ee",
  Latvia: "lv",
  Letonia: "lv",
  Lithuania: "lt",
  Lituania: "lt",
  Moldova: "md",
  Armenia: "am",
  Azerbaijan: "az",
  Azerbaiyán: "az",
  Georgia: "ge",
  Turkey: "tr",
  Turquía: "tr",
  Türkiye: "tr",

  // América del Norte y Centroamérica
  USA: "us",
  "United States": "us",
  "Estados Unidos": "us",
  Canada: "ca",
  Canadá: "ca",
  Mexico: "mx",
  México: "mx",
  "Costa Rica": "cr",
  Panama: "pa",
  Panamá: "pa",
  Guatemala: "gt",
  "El Salvador": "sv",
  Honduras: "hn",
  Nicaragua: "ni",
  Belize: "bz",

  // Caribe
  Haiti: "ht",
  Haití: "ht",
  Jamaica: "jm",
  Cuba: "cu",
  "Dominican Republic": "do",
  "República Dominicana": "do",
  "Puerto Rico": "pr",
  "Trinidad and Tobago": "tt",
  "Trinidad y Tobago": "tt",
  Curaçao: "cw",
  Curacao: "cw",
  Aruba: "aw",
  Bermuda: "bm",
  "St. Kitts and Nevis": "kn",
  "Saint Kitts and Nevis": "kn",
  "St. Kitts &Nevis": "kn",
  "St. Kitts & Nevis": "kn",
  Martinique: "mq",
  Martinica: "mq",
  Guadeloupe: "gp",
  Guadalupe: "gp",
  "American Virgin Islands": "vi",

  // América del Sur
  Brazil: "br",
  Brasil: "br",
  Argentina: "ar",
  Colombia: "co",
  Chile: "cl",
  Uruguay: "uy",
  Paraguay: "py",
  Peru: "pe",
  Perú: "pe",
  Ecuador: "ec",
  Venezuela: "ve",
  Bolivia: "bo",
  Guyana: "gy",
  Suriname: "sr",
  "French Guiana": "gf",

  // África
  Nigeria: "ng",
  "South Africa": "za",
  Sudáfrica: "za",
  Morocco: "ma",
  Marruecos: "ma",
  Ghana: "gh",
  Cameroon: "cm",
  Camerún: "cm",
  "Côte d'Ivoire": "ci",
  "Cote d'Ivoire": "ci",
  "Ivory Coast": "ci",
  "Costa de Marfil": "ci",
  Zambia: "zm",
  Senegal: "sn",
  Algeria: "dz",
  Argelia: "dz",
  Tunisia: "tn",
  Túnez: "tn",
  Egypt: "eg",
  Egipto: "eg",
  Kenya: "ke",
  Kenia: "ke",
  Uganda: "ug",
  Tanzania: "tz",
  Malawi: "mw",
  Mali: "ml",
  Malí: "ml",
  "Burkina Faso": "bf",
  Gambia: "gm",
  "The Gambia": "gm",
  "Sierra Leone": "sl",
  "Cape Verde": "cv",
  "Cabo Verde": "cv",
  "Equatorial Guinea": "gq",
  "Guinea Ecuatorial": "gq",
  Guine: "gn",
  Guinea: "gn",
  "Guinea-Bissau": "gw",
  Angola: "ao",
  Gabon: "ga",
  Gabón: "ga",
  Congo: "cg",
  "Congo DR": "cd",
  "Democratic Republic of the Congo": "cd",
  "RD Congo": "cd",
  Ethiopia: "et",
  Etiopía: "et",
  Eritrea: "er",
  Rwanda: "rw",
  Benin: "bj",
  Benín: "bj",
  Liberia: "lr",
  Namibia: "na",
  Comoros: "km",
  Réunion: "re",
  Madagascar: "mg",
  Mozambique: "mz",
  Zimbabwe: "zw",

  // Asia y Oceanía
  Japan: "jp",
  Japón: "jp",
  Australia: "au",
  China: "cn",
  "China PR": "cn",
  "South Korea": "kr",
  "Korea Republic": "kr",
  "Korea, South": "kr",
  "Republik Korea (Südkorea)": "kr",
  "Corea del Sur": "kr",
  "North Korea": "kp",
  "Chinese Taipei (Taiwan)": "tw",
  Taiwan: "tw",
  "New Zealand": "nz",
  "Nueva Zelanda": "nz",
  Philippines: "ph",
  Filipinas: "ph",
  Vietnam: "vn",
  Thailand: "th",
  Tailandia: "th",
  Indonesia: "id",
  Indonesien: "id",
  India: "in",
  Malaysia: "my",
  Malasia: "my",
  Iran: "ir",
  Irán: "ir",
  Iraq: "iq",
  Irak: "iq",
  Israel: "il",
  Jordan: "jo",
  Jordania: "jo",
  Lebanon: "lb",
  Líbano: "lb",
  "Saudi Arabia": "sa",
  "Saudi Arabien": "sa",
  "Arabia Saudita": "sa",
  Uzbekistan: "uz",
  Kazakhstan: "kz",
  Nepal: "np",
  Afghanistan: "af",
  Afganistán: "af",
  Fiji: "fj",
  Tonga: "to",
  Papua: "pg",
};

export function getFlagUrl(countryName?: string | null, width: 20 | 40 | 80 = 40): string | null {
  if (!countryName) return null;
  const trimmed = countryName.trim();
  const code =
    COUNTRY_ISO_MAP[trimmed] ||
    COUNTRY_ISO_MAP[trimmed.toLowerCase()] ||
    (trimmed.length === 2 ? trimmed.toLowerCase() : null);
  if (!code) return null;
  return `https://flagcdn.com/w${width}/${code}.png`;
}

export const Bandera: React.FC<{
  country?: string | null;
  className?: string;
  showName?: boolean;
  size?: "xs" | "sm" | "md";
}> = ({ country, className = "", showName = false, size = "sm" }) => {
  const [error, setError] = useState(false);
  const flagUrl = getFlagUrl(country, size === "xs" ? 20 : size === "sm" ? 40 : 80);
  const dim = size === "xs" ? "h-3 w-4" : size === "sm" ? "h-3.5 w-5" : "h-4 w-6";

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} title={country || undefined}>
      {flagUrl && !error ? (
        <img
          src={flagUrl}
          alt={country || "Flag"}
          className={`${dim} rounded-[2px] object-cover shadow-sm ring-1 ring-white/10`}
          loading="lazy"
          onError={() => setError(true)}
        />
      ) : (
        <span className="text-muted-foreground font-mono text-xs">🌐</span>
      )}
      {showName && <span className="truncate">{country || "—"}</span>}
    </span>
  );
};
