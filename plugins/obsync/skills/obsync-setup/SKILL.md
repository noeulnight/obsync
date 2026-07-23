---
name: obsync-setup
description: Configure or change the Obsync MCP server used by a local Codex installation, complete OAuth login, and verify the saved connection. Use when installing Obsync, connecting a self-hosted instance, changing the server address, repairing authentication, or checking whether Codex is connected.
---

# Set up Obsync

Configure Obsync through Codex's native MCP commands. Do not store a server address or credential inside the Plugin.

## Gather the connection

Ask for missing values:

- MCP server name, defaulting to `obsync`;
- full MCP endpoint, defaulting to `https://vault.lth.so/mcp`.

Accept `http://` only for `localhost`, `127.0.0.1`, or `[::1]`. Reject URLs containing embedded usernames, passwords, fragments, or obvious secret query parameters. If the user supplies only an instance base URL, confirm before appending `/mcp`.

## Configure Codex

1. Inspect any existing entry without changing it:

   ```bash
   codex mcp get <name>
   ```

2. If the entry already uses the requested URL, keep it and continue to authentication.
3. If it uses a different URL, show both addresses and ask before replacing it. After approval:

   ```bash
   codex mcp remove <name>
   codex mcp add <name> --url <full-mcp-url>
   ```

4. If the entry does not exist, add it directly:

   ```bash
   codex mcp add <name> --url <full-mcp-url>
   ```

Never place an access token, refresh token, password, or client secret in the command or Plugin files.

## Authenticate

Start the native OAuth flow:

```bash
codex mcp login <name>
```

Let Codex open the browser approval page and store the resulting credential. Do not implement a separate Obsync login flow.

## Verify

1. Run `codex mcp get <name>` and confirm the saved URL and enabled state.
2. Explain that newly registered MCP tools load in a new Codex thread or after restarting the active client.
3. In that new session, call `list_vaults`. A successful Vault listing is the connection and authorization check.
4. If OAuth fails, inspect the endpoint's `WWW-Authenticate` resource metadata before changing configuration.

For multiple Obsync instances, register distinct names such as `obsync-personal` and `obsync-work`. Never silently redirect an existing name to another server.
