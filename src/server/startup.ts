import { execSync } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { randomBytes } from "node:crypto";

export interface StartupConfig {
  repoRoot: string;
  ref: string;
  port: number;
  token: string;
}

function checkGit(): void {
  try {
    execSync("git --version", { stdio: "ignore" });
  } catch {
    console.error("Error: git is not installed or not in PATH.");
    process.exit(1);
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
  }
}

async function findAvailablePort(preferred: number): Promise<number> {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.listen(preferred, "127.0.0.1", () => {
      server.close(() => resolve(preferred));
    });
    server.on("error", () => {
      // Port busy, try next
      console.log(`Port ${preferred} is busy, trying ${preferred + 1}...`);
      resolve(findAvailablePort(preferred + 1));
    });
  });
}

export async function startup(opts: {
  ref?: string;
  port?: number;
}): Promise<StartupConfig> {
  checkGit();
  const repoRoot = getRepoRoot();
  const ref = opts.ref ?? "HEAD";
  const port = await findAvailablePort(opts.port ?? 3847);
  const token = randomBytes(16).toString("hex");

  return { repoRoot, ref, port, token };
}
