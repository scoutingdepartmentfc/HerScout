/** Club competitions between teams from different countries, and national-team tournaments (Opta IDs).
 *  Keep in sync with COMPETICIONES_INTERNACIONALES in pipeline/config.py. */
export const INTERNATIONAL_COMPETITIONS: { id: string; name: string; region: string }[] = [
  { id: "55hcphd1ccc6eai1ms77460on", name: "UEFA Women's Champions League", region: "Europa" },
  { id: "1nwgd1b2d903fvnwgnsdadkb8", name: "UEFA Women's Europa Cup", region: "Europa" },
  { id: "1tn3f9q6oy40vivvsq3ik5awa", name: "Baltic Women's League", region: "Europa" },
  { id: "2irmeeywhndovbhbgkz37v9qs", name: "All-Island Cup", region: "Europa" },
  { id: "65oi3upjiu4lcukayuq66fhuc", name: "FIFA Women's Champions Cup", region: "Mundial" },
  { id: "3tybapqetnmdiam9exg1q4yl0", name: "Concacaf W Champions Cup", region: "Norte y Centroamérica" },
  { id: "135j6qi3ap8i3vc9hwdo4fjtg", name: "NWSL x Liga MX Femenil Summer Cup", region: "Norte y Centroamérica" },
  { id: "avrpx5lanaaxagr4h4duxj3vc", name: "CONMEBOL Libertadores Femenina", region: "Sudamérica" },
  { id: "ep4po13e04rjg268pgete0fvu", name: "AFC Women's Champions League", region: "Asia" },
  { id: "xu2nd3dkwdun0j71tnqabfo4", name: "CAF Women's Champions League", region: "África" },
  { id: "8dxigebf8ankjp0ncupwte0b8", name: "OFC Women's Champions League", region: "Oceanía" },
  { id: "43029a6fvhou87zehkd5u8fyt", name: "UEFA Women's Championship", region: "Selecciones · Europa" },
  { id: "9mr92dlx7ryaxhi07sgt90ish", name: "UEFA U19 Championship Women", region: "Selecciones · Europa" },
];

export const INTERNATIONAL_IDS = new Set(INTERNATIONAL_COMPETITIONS.map((c) => c.id));
/** opta_catalog / competitions.country of competitions that are not tied to one country */
export const INTERNATIONAL_REGIONS = new Set(["Europe", "World", "Asia", "Africa", "N/C America", "South America", "Oceania"]);
