Read the review comments from .claude/review.json.

## Step 1: Process comments

For each comment with status "pending":
1. Read the referenced file and line
2. Read the full thread history (if any) to understand the conversation context
3. Identify what the latest message requires:
   - If the thread exists, the last entry with `"author": "user"` is the active message to address
   - If there is no thread, use the `body` field as the initial message
4. Process the message:
   - If it requests a code change: make the change
   - If it is a question: prepare your answer
   - If it is a follow-up reply: respond in context of the full conversation
5. Update the comment in .claude/review.json:
   - Append your response to the `thread` array: `{ "author": "ai", "body": "your response", "createdAt": "ISO timestamp" }`
   - If this is the first AI response and there is no `thread` yet, create the array
   - Do NOT set status to "resolved" — only the reviewer can resolve a thread
   - Do NOT use a top-level `response` field — all responses go in the thread
   - Remove the `response` and `resolvedAt` fields if they exist (legacy format)

## Step 2: Write a summary

After processing all comments, update the "summary" field in .claude/review.json with:

```json
{
  "summary": {
    "global": "<A concise 2-3 sentence summary of the business intent — what the code change achieves for the user or product, not what review comments were addressed>",
    "files": {
      "<file path>": "<One-line summary of what changed in this file>"
    },
    "testPlan": [
      {
        "description": "<A manual test step to verify the changes>",
        "expected": "<What the reviewer should observe>"
      }
    ]
  }
}
```

Rules for the summary:
- "global": summarize the business intent of the code change — what it achieves for the user or product, why it matters. Do NOT describe which review comments were addressed or list individual responses. Think of it as a PR description: what does this change do and why.
- "files": include an entry for EVERY file in the diff (not just files with comments). Run `git diff --name-only` to get the full list. Key is the file path, value is a summary with both the business purpose (user-facing impact, why it matters) and the technical approach (how it's implemented, key decisions).
- "testPlan": provide 2-5 concrete manual test steps so the reviewer can verify the changes work. Each step has a "description" (what to do) and "expected" (what should happen).

IMPORTANT: Write the summary into the existing .claude/review.json by updating the "summary" field. Do NOT overwrite other fields.

## JSON format reference

```json
{
  "id": "abc123",
  "type": "comment",
  "file": "index.html",
  "line": 29,
  "endLine": 29,
  "body": "Original reviewer comment",
  "status": "pending",
  "thread": [
    { "author": "ai",   "body": "AI first response", "createdAt": "2026-01-01T00:00:00.000Z" },
    { "author": "user", "body": "Reviewer follow-up" },
    { "author": "ai",   "body": "AI second response", "createdAt": "2026-01-01T00:05:00.000Z" }
  ],
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

## UX rules

- `status: "pending"` = the AI must respond (ball is in AI's court)
- `status: "resolved"` = conversation is closed (only the reviewer sets this)
- The reviewer replies by adding `{ "author": "user", "body": "..." }` to the thread and setting status back to `"pending"`
- The AI never resolves a thread on its own
