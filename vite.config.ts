import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "claude-review-api",
      configureServer(server) {
        let apiSetup: Promise<void> | null = null;
        let handler: typeof import("./src/server/api.js").handleApiRequest;

        server.middlewares.use(async (req, res, next) => {
          const url = req.url ?? "";

          // Only intercept /api/* and /sse
          if (!url.startsWith("/api/") && !url.startsWith("/sse")) {
            return next();
          }

          if (!apiSetup) {
            apiSetup = (async () => {
              const { startup } = await import("./src/server/startup.js");
              const { ReviewStore } = await import("./src/server/store.js");
              const apiModule = await import("./src/server/api.js");
              const { broadcastUpdate } = await import("./src/server/sse.js");

              handler = apiModule.handleApiRequest;

              const config = await startup({
                ref: process.env.CLAUDE_REVIEW_REF,
                port: undefined,
              });

              const store = new ReviewStore(config.repoRoot, config.ref);

              store.startWatching(() => {
                broadcastUpdate(store.getData());
              });

              (server as any).__claudeReviewCtx = {
                store,
                repoRoot: config.repoRoot,
                ref: config.ref,
                token: config.token,
              };

              console.log(`\n  claude-review API ready`);
              console.log(`  Token: ${config.token}\n`);
            })();
          }

          await apiSetup;
          const ctx = (server as any).__claudeReviewCtx;
          const handled = await handler(req as any, res as any, ctx);
          if (!handled) next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "src/shared"),
    },
  },
  build: {
    outDir: "dist/client",
    emptyDirFirst: true,
  },
});
