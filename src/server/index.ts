import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { watch } from "chokidar";
import { fileURLToPath } from "node:url";
import { startup } from "./startup.js";
import { ReviewStore } from "./store.js";
import { handleApiRequest, type ApiContext } from "./api.js";
import { broadcastUpdate, broadcastDiffChanged, closeAllConnections } from "./sse.js";
import { getDiff } from "./git.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export async function startServer(opts: {
  ref?: string;
  port?: number;
}): Promise<{ url: string; token: string; close: () => void }> {
  const config = await startup(opts);
  const store = new ReviewStore(config.repoRoot, config.ref, config.branch);

  const ctx: ApiContext = {
    store,
    repoRoot: config.repoRoot,
    ref: config.ref,
    token: config.token,
    port: config.port,
  };

  // Watch review.json for external modifications (e.g., by Claude Code) and broadcast to clients
  store.startWatching(() => {
    broadcastUpdate(store.getData());
  });

  // Watch repo files for changes and notify clients
  let fileWatcher: ReturnType<typeof watch> | null = null;
  try {
    const diff = getDiff(config.repoRoot, config.ref);
    const filesToWatch = diff.files
      .map((f) => (f.to !== "/dev/null" ? f.to : f.from))
      .map((f) => join(config.repoRoot, f));

    if (filesToWatch.length > 0) {
      fileWatcher = watch(filesToWatch, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
      });
      fileWatcher.on("change", () => {
        broadcastDiffChanged();
      });
    }
  } catch (err) {
    console.warn(`Could not set up file watching: ${err}`);
  }

  // Client build output directory — must match vite.config.ts outDir relative to tsup outDir
  const clientDir = join(__dirname, "..", "client");

  const server = createServer(async (req, res) => {
    const handled = await handleApiRequest(req, res, ctx);
    if (handled) return;

    // Serve static files
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    let filePath = join(clientDir, url.pathname === "/" ? "index.html" : url.pathname);

    // SPA fallback
    if (!existsSync(filePath)) {
      filePath = join(clientDir, "index.html");
    }

    if (!existsSync(filePath)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = extname(filePath);
    const mime = MIME_TYPES[ext] ?? "application/octet-stream";

    try {
      const content = readFileSync(filePath);
      res.writeHead(200, { "Content-Type": mime });
      res.end(content);
    } catch (err) {
      console.error(`Failed to serve static file ${filePath}:`, err);
      res.writeHead(500);
      res.end("Internal Server Error");
    }
  });

  return new Promise((resolve) => {
    server.listen(config.port, "127.0.0.1", () => {
      const url = `http://127.0.0.1:${config.port}?token=${config.token}`;
      console.log(`\n  claude-review running at:`);
      console.log(`  ${url}\n`);
      console.log(`  Review file: ${store.getFilePath()}`);
      console.log(`  Ref: ${config.ref}`);
      console.log(`  Repo: ${config.repoRoot}\n`);

      resolve({
        url,
        token: config.token,
        close: () => {
          closeAllConnections();
          store.stopWatching();
          fileWatcher?.close();
          server.close();
        },
      });
    });
  });
}
