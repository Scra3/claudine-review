# claudine-review

**Code review your AI's work before it ships.**

`claudine-review` opens a local browser UI where you review diffs, drop inline comments, and let Claude Code fix them — in a back-and-forth loop, like a real PR review.

```
claudine-review
```

That's it. It opens your browser with a full diff view of your feature branch.

---

## The loop

```
You code (or Claude codes)
        ↓
  claudine-review          ← review in browser, drop comments
        ↓
  /apply-review            ← Claude reads your comments, fixes code
        ↓
  Browser updates live     ← see AI responses appear in real time
        ↓
  Repeat until happy       ← reopen, reply, resolve
```

## What you get

- **Full branch diff** — automatically diffs against `origin/main`, so you see everything (committed + uncommitted), like a PR
- **Inline comments** — click any line, write your feedback
- **Threaded conversations** — reply back and forth with Claude, just like GitHub PR reviews
- **AI auto-resolve** — Claude resolves concrete fixes (renames, bug fixes, type additions); leaves subjective ones for you
- **Review summary** — after `/apply-review`, get a business-level summary + test plan with checkboxes
- **Live updates** — the browser refreshes as Claude edits files and responds to comments
- **File search** — press `/` to search across diffs and comments
- **Keyboard-first** — `j`/`k` to navigate files, `Cmd+Enter` to save, `Esc` to cancel

## Install

```bash
npm install -g claudine-review
```

Or run from a cloned repo:

```bash
git clone git@github.com:Scra3/claudine-review.git
cd claudine-review
npm install && npm run build
npm link
```

## Setup

Run this once per project to install the `/apply-review` command for Claude Code:

```bash
claudine-review --init
```

This creates `.claude/commands/apply-review.md` in your repo.

## Usage

```bash
# Review your feature branch (diffs against origin/main)
claudine-review

# Diff against a specific ref
claudine-review --ref abc123

# Custom port
claudine-review --port 4000
```

Then in Claude Code:

```
/apply-review
```

Claude reads your comments from `.claude/review.json`, applies fixes, responds to questions, and writes a summary. The browser updates live.

## How it works

1. `claudine-review` starts a local server and opens a diff view in your browser
2. You review the diff and leave inline comments (stored in `.claude/review.json`)
3. You run `/apply-review` in Claude Code
4. Claude processes each pending comment — makes changes or replies
5. The browser shows AI responses in real time via SSE
6. You verify, reopen threads if needed, and iterate

No cloud. No GitHub integration needed. Everything runs locally.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `j` / `k` | Navigate between files |
| `/` | Focus search |
| `Cmd+Enter` | Save comment |
| `Cmd+Shift+Enter` | Submit review |
| `Esc` | Cancel / close |

## Development

```bash
npm run dev       # Vite dev server with HMR
npm run build     # Production build
npm test          # Run tests
npm run test:watch
```

## License

MIT
