# Obsync

[English](./README.md) | [한국어](./README.ko.md)

Your Obsidian Vault, wherever you write.

Obsync keeps your notes, canvases, folders, and attachments aligned between Obsidian and the web. Open the same Vault on another device, edit together in real time, and share your work without changing how you organize it.

## What you can do

- Edit the same note from Obsidian or the web
- See collaborators and their cursors while they work
- Keep files, folders, canvases, and attachments together
- Continue editing in Obsidian through connection interruptions
- Create multiple Vaults and switch between them
- Invite people as editors or viewers
- Review and restore earlier file versions

## Project layout

- `apps/api`: accounts, Vaults, collaboration, and file storage
- `apps/web`: browser-based Vault editor
- `apps/plugin`: Obsidian plugin
- `docs`: development, operations, and acceptance guides

## Run locally

Node.js 22.12 or later and pnpm 11 are required.

```bash
pnpm install
docker compose up -d postgres minio
docker compose run --rm minio-init
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate:deploy
pnpm --filter api start:dev
```

Start the web app in another terminal:

```bash
pnpm --filter web dev --host 0.0.0.0
```

- Web: `http://localhost:5173`
- API health: `http://localhost:3000/api/health`
- Storage API: `http://localhost:9000`
- Storage console: `http://localhost:9001`

See the [plugin guide](./apps/plugin/README.md) for the Obsidian build and installation steps. See [local backend development](./docs/backend-local-development.md) for environment configuration.

## Verify

```bash
pnpm ready
pnpm --filter api test:e2e
```

Use the [sync acceptance checklist](./docs/sync-acceptance-checklist.md) to verify collaboration between two Obsidian clients and the web app.
