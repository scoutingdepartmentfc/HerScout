import { NextRequest, NextResponse } from "next/server";
import { resolveVenueImage } from "@/lib/venueImages";

// Resolves (and persists in public.venue_images) the stadium photo for a venue name.
// Only called by the Matches page for venues not yet stored; known ones come with /api/matches.
export async function GET(req: NextRequest) {
  const name = (new URL(req.url).searchParams.get("name") || "").trim();
  if (!name || name.length > 160) {
    return NextResponse.json({ url: null }, { status: 400 });
  }
  try {
    const url = await resolveVenueImage(name);
    return NextResponse.json(
      { url },
      { headers: { "Cache-Control": url ? "private, max-age=604800" : "private, max-age=3600" } }
    );
  } catch {
    // Transient failure (rate limit / network): nothing stored, the client retries later
    return NextResponse.json({ url: null }, { headers: { "Cache-Control": "no-store" } });
  }
}
