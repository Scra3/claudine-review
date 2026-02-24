import { execSync } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { randomBytes } from "node:crypto";
import { getBranch, getMergeBase } from "./git.js";

export interface StartupConfig {
  repoRoot: string;
  ref: string;
  branch: string;
  port: number;
  token: string;
}

function checkGit(): void {
  try {
    execSync("git --version", { stdio: "ignore" });
  } catch {
    console.error("Error: git is not installed or not in PATH.");
    process.exit(1);
    throw new Error("unreachable");
  }
}

function getRepoRoot(): string {
  try {
    return execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
    }).trim();
  } catch {
    console.error("Error: not inside a git repository.");
    process.exit(1);
    throw new Error("unreachable");
  }
}

async function findAvailablePort(preferred: number, maxAttempts = 20): Promise<number> {
  if (preferred > 65535 || maxAttempts <= 0) {
    throw new Error("Could not find an available port");
  }
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.listen(preferred, "127.0.0.1", () => {
      server.close(() => resolve(preferred));
    });
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.log(`Port ${preferred} is busy, trying ${preferred + 1}...`);
        resolve(findAvailablePort(preferred + 1, maxAttempts - 1));
      } else {
        reject(new Error(`Cannot bind to port ${preferred}: ${err.message}`));
      }
    });
  });
}

export async function startup(opts: {
  ref?: string;
  port?: number;
}): Promise<StartupConfig> {
  checkGit();
  const repoRoot = getRepoRoot();
  const ref = opts.ref ?? getMergeBase(repoRoot) ?? "HEAD";
  const branch = getBranch(repoRoot);
  const port = await findAvailablePort(opts.port ?? 3847);
  const token = randomBytes(16).toString("hex");

  return { repoRoot, ref, branch, port, token };
}
