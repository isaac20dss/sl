import type { VercelRequest, VercelResponse } from "@vercel/node";
// The .js extension is required: package.json sets "type": "module", so the compiled
// function runs as ESM on Vercel, where extensionless relative imports do not resolve.
import { resolvePreview } from "./_resolve.js";

/**
 * GET /api/preview?isrc=USRC17607839&artist=Queen&title=Bohemian%20Rhapsody
 * 200 -> { previewUrl, source: "deezer" | "itunes" }
 * 404 -> { error: "not_found" }  (client drops the track from the deck)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const isrc = String(req.query.isrc || "").trim();
  const artist = String(req.query.artist || "");
  const title = String(req.query.title || "");

  if (!isrc) return res.status(400).json({ error: "missing_isrc" });

  // Preview URL for a given ISRC is stable — cache hard at the edge.
  res.setHeader("Cache-Control", "public, s-maxage=2592000, stale-while-revalidate=86400");

  try {
    const found = await resolvePreview({ isrc, artist, title });
    if (found) return res.status(200).json(found);
  } catch {
    // never let an upstream outage break the game
  }

  return res.status(404).json({ error: "not_found" });
}
