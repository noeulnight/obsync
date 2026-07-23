# Obsync Codex Plugin

This plugin connects Codex to an Obsync MCP endpoint and bundles setup and wiki workflows.

## Authentication

The plugin does not contain a fixed server address or credentials. Run the `obsync-setup` skill to register an official or self-hosted MCP endpoint and complete OAuth authentication.

## Hooks

The bundled session-start hook only reminds Codex to load and curate Vault knowledge. It does not read or write the Vault itself. Review and trust the hook in Codex before enabling it.
