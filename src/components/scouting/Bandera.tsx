import React, { useState } from "react";

export const COUNTRY_ISO_MAP: Record<string, string> = {
  Spain: "es",
  España: "es",
  England: "gb-eng",
  Inglaterra: "gb-eng",
  Scotland: "gb-sct",
  Wales: "gb-wls",
  "Northern Ireland": "gb-nir",
  France: "fr",
  Francia: "fr",
  Germany: "de",
  Alemania: "de",
  Italy: "it",
  Italia: "it",
  Haiti: "ht",
  Sweden: "se",
  Suecia: "se",
  Netherlands: "nl",
  Holland: "nl",
  Brazil: "br",
  Brasil: "br",
  USA: "us",
  "United States": "us",
  Norway: "no",
  Noruega: "no",
  Denmark: "dk",
  Dinamarca: "dk",
  Portugal: "pt",
  Mexico: "mx",
  México: "mx",
  Colombia: "co",
  Argentina: "ar",
  Japan: "jp",
  Japón: "jp",
  Australia: "au",
  Canada: "ca",
  Canadá: "ca",
  Nigeria: "ng",
  Jamaica: "jm",
  Austria: "at",
  Switzerland: "ch",
  Suiza: "ch",
  Poland: "pl",
  Polonia: "pl",
  Belgium: "be",
  Bélgica: "be",
  Finland: "fi",
  Finlandia: "fi",
  Iceland: "is",
  Islandia: "is",
  Ireland: "ie",
  "Republic of Ireland": "ie",
  Irlanda: "ie",
  "Czech Republic": "cz",
  Chequia: "cz",
  Ukraine: "ua",
  Ucrania: "ua",
  Turkey: "tr",
  Turquía: "tr",
  China: "cn",
  "Chinese Taipei (Taiwan)": "tw",
  "Republik Korea (Südkorea)": "kr",
  "South Korea": "kr",
  "South Africa": "za",
  Sudáfrica: "za",
  "Saudi Arabien": "sa",
  "Saudi Arabia": "sa",
  Morocco: "ma",
  Marruecos: "ma",
  Czechia: "cz",
  Andorra: "ad",
  Azerbaijan: "az",
  "Bosnia and Herzegovina": "ba",
  "Burkina Faso": "bf",
  Cameroon: "cm",
  Camerún: "cm",
  Chile: "cl",
  "Congo DR": "cd",
  "Democratic Republic of the Congo": "cd",
  "Costa Rica": "cr",
  "Côte d'Ivoire": "ci",
  "Ivory Coast": "ci",
  "Dominican Republic": "do",
  Gambia: "gm",
  Ghana: "gh",
  Guatemala: "gt",
  "Korea Republic": "kr",
  "Korea, South": "kr",
  Mali: "ml",
  Malí: "ml",
  "New Zealand": "nz",
  "Nueva Zelanda": "nz",
  "Puerto Rico": "pr",
  "Sierra Leone": "sl",
  "St. Kitts and Nevis": "kn",
  "Saint Kitts and Nevis": "kn",
  Tanzania: "tz",
  Uruguay: "uy",
  Venezuela: "ve",
  Serbia: "rs",
  Montenegro: "me",
  Belarus: "by",
  Bielorrusia: "by",
  Estonia: "ee",
  Latvia: "lv",
  Letonia: "lv",
  Lithuania: "lt",
  Lituania: "lt",
  Hungary: "hu",
  Hungría: "hu",
  Indonesien: "id",
  Indonesia: "id",
  Russia: "ru",
  Rusia: "ru",
  "Färöer": "fo",
  "Faroe Islands": "fo",
};

export function getFlagUrl(countryName?: string | null, width: 20 | 40 | 80 = 40): string | null {
  if (!countryName) return null;
  const trimmed = countryName.trim();
  const code = COUNTRY_ISO_MAP[trimmed] || (trimmed.length === 2 ? trimmed.toLowerCase() : null);
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

