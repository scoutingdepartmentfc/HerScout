export const MOCK_ORGANIZATIONS = new Map<string, any>([
  [
    "org-chelsea",
    {
      id: "org-chelsea",
      name: "Chelsea FC Women",
      short_name: "Chelsea",
      slug: "chelsea-fcw",
      logo_url: "https://example.com/chelsea.png",
      primary_color: "217 95% 45%",
      secondary_color: "215 28% 17%",
      accent_color: "160 84% 39%",
      preferred_timezone: "Europe/London",
      subscription_plan: "enterprise",
      subscription_status: "active",
      seat_limit: 15,
      feature_entitlements: {
        pdf_export: true,
        advanced_radars: true,
        video_attachments: true,
      },
    },
  ],
  [
    "org-barca",
    {
      id: "org-barca",
      name: "FC Barcelona Femení",
      short_name: "Barça",
      slug: "barca-femeni",
      logo_url: "https://example.com/barca.png",
      primary_color: "348 83% 47%",
      secondary_color: "217 91% 40%",
      accent_color: "45 93% 47%",
      preferred_timezone: "Europe/Madrid",
      subscription_plan: "enterprise",
      subscription_status: "active",
      seat_limit: 20,
      feature_entitlements: {
        pdf_export: true,
        advanced_radars: true,
        video_attachments: true,
      },
    },
  ],
]);

export const MOCK_WATCHLISTS = [
  {
    id: "wl-1",
    organization_id: "org-chelsea",
    name: "Chelsea Priority Targets",
    players: [
      { id: "p-1", name: "Vicky López", tier: "tier-a", notes: "Top creative midfield target" },
    ],
  },
  {
    id: "wl-2",
    organization_id: "org-barca",
    name: "Barça Scouting Shortlist",
    players: [
      { id: "p-2", name: "Melchie Dumornay", tier: "tier-a", notes: "Direct striker option" },
    ],
  },
];

