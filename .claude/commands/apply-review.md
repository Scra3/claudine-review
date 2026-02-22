Read the review comments from .claude/review.json.
For each comment with status "pending":
1. Read the referenced file and line
2. Understand the feedback
3. If the comment requests a code change: make the change, then set "response" to a short explanation of what you did
4. If the comment is a question: set "response" to your answer (no code change needed)
5. Update the comment in .claude/review.json: set status to "resolved", resolvedAt to the current ISO timestamp, and response to your explanation or answer
After processing all comments, report a summary of what was done.
