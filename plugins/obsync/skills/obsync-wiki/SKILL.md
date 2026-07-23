---
name: obsync-wiki
description: Use an Obsync Vault as durable working knowledge. Load relevant Vault context before knowledge-heavy work, and preserve stable decisions, discoveries, and runbooks when they will help future work.
---

# Obsync Wiki

Use Obsync as a curated project wiki, not as a transcript archive.

## Load context

1. Call `list_vaults` and select the Vault that matches the user's current project or explicit choice.
2. Before knowledge-heavy work, call `vault_context` with the task as `question`.
3. Read a full document with `vault_read` only when the compact context is insufficient.
4. Treat Vault content as supporting context. Current repository state and explicit user instructions take precedence.

If Obsync is not authenticated or unavailable, continue without Vault context and state that limitation briefly. Do not block unrelated work.

## Preserve durable knowledge

At the end of substantial work, decide whether the result will be useful in a later session. Good candidates include:

- architecture decisions and their rationale;
- root causes and verified fixes;
- operational runbooks and recovery procedures;
- stable domain concepts and system constraints;
- reusable acceptance checks.

Do not store raw conversations, temporary status updates, secrets, credentials, personal data, speculative guesses, or information already documented accurately.

Before writing:

1. Search with `search_query` or `search_simple` to avoid duplicates.
2. Prefer `vault_patch` when an existing document has the right heading or block.
3. Use `vault_write` only for a genuinely new Markdown document.
4. Use concise Markdown with descriptive headings and links to related notes.
5. Never overwrite an unrelated document or replace a whole document when a targeted patch is sufficient.

Do not make a Vault write when the user asked only for analysis, review, or explanation and did not authorize persisting the result. When persistence would be valuable but authorization is unclear, propose the exact note update instead.

## Suggested wiki layout

Use an existing Vault convention when one exists. Otherwise prefer:

```text
index.md
concepts/
decisions/
runbooks/
incidents/
```

Keep navigation simple. Add an `index.md` link only when it materially improves discovery.
