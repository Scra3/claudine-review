#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMAND_SOURCE = join(__dirname, "..", ".claude", "commands", "apply-review.md");

const args = process.argv.slice(2);
let ref;
let port;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--init") {
    init();
    process.exit(0);
  } else if (args[i] === "--ref" && args[i + 1]) {
    ref = args[++i];
  } else if (args[i] === "--port" && args[i + 1]) {
    port = parseInt(args[++i], 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error(`Error: invalid port number '${args[i]}'`);
      process.exit(1);
    }
  } else if (args[i] === "--help" || args[i] === "-h") {
    console.log(`
  claude-review — Local code review for Claude Code

  Usage:
    claude-review                    # review current changes
    claude-review --init             # setup project for claude-review
    claude-review --ref main..HEAD   # specific ref
    claude-review --port 4000        # custom port

  Options:
    --init          Setup /apply-review command in current project
    --ref <ref>     Git ref to diff (default: HEAD)
    --port <port>   Port to listen on (default: 3847)
    -h, --help      Show this help
`);
    process.exit(0);
  }
}

function init() {
  let root;
  try {
    root = execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim();
  } catch {
    console.error("Error: not inside a git repository.");
    process.exit(1);
  }
  const destDir = join(root, ".claude", "commands");
  const destFile = join(destDir, "apply-review.md");

  mkdirSync(destDir, { recursive: true });
  const content = readFileSync(COMMAND_SOURCE, "utf-8");
  const existed = existsSync(destFile);
  writeFileSync(destFile, content);
  console.log(existed
    ? "  Updated .claude/commands/apply-review.md\n"
    : "  Created .claude/commands/apply-review.md\n"
  );

  console.log(`  Setup complete! Here's how to use claude-review:

  1. Make some changes in your repo
  2. Run:  claude-review
  3. Review the diff in the browser, add comments, click "Submit Review"
  4. In Claude Code, run:  /apply-review
  5. Claude reads your comments, applies fixes or answers questions
  6. The browser updates live — you see Claude's responses in real time

  Keyboard shortcuts (in browser):
    j/k           Navigate files
    Click [+]     Comment a line
    Cmd+Enter     Save draft
    Cmd+Shift+Enter  Submit review
    Escape        Cancel
`);
}

// Normal run: start the server
let startServer;
try {
  ({ startServer } = await import("../dist/server/index.js"));
} catch (err) {
  console.error("Error: Could not load the server module.");
  console.error("  Have you run 'npm run build' first?");
  console.error(`  ${err.message}`);
  process.exit(1);
}

const OPEN_COMMANDS = { darwin: "open", win32: "start" };

startServer({ ref, port })
  .then(({ url }) => {
    import("node:child_process").then(({ exec }) => {
      const cmd = OPEN_COMMANDS[process.platform] ?? "xdg-open";
      exec(`${cmd} "${url}"`, (err) => {
        if (err) console.warn(`Could not open browser automatically: ${err.message}`);
      });
    });

    process.on("SIGINT", () => {
      console.log("\nShutting down...");
      process.exit(0);
    });
  })
  .catch((err) => {
    console.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  });
