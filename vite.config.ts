import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolvePreview } from "./api/_resolve";

/**
 * `vite dev` does not run the Vercel functions in `api/`.
 * This middleware serves `/api/preview` locally using the exact same resolver
 * the serverless function uses, so dev and prod behave identically.
 */
function previewApiDev(): Plugin {
  return {
    name: "songless-preview-api-dev",
    configureServer(server) {
      server.middlewares.use("/api/preview", async (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(body));
        };
        try {
          const url = new URL(req.url || "/", "http://127.0.0.1");
          const isrc = (url.searchParams.get("isrc") || "").trim();
          if (!isrc) return send(400, { error: "missing_isrc" });
          const found = await resolvePreview({
            isrc,
            artist: url.searchParams.get("artist") || "",
            title: url.searchParams.get("title") || "",
          });
          return found ? send(200, found) : send(404, { error: "not_found" });
        } catch {
          return send(404, { error: "not_found" });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), previewApiDev()],
  server: {
    // Spotify no longer accepts http://localhost as a redirect URI — only 127.0.0.1.
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
});
