# Obsync Backend Agent Instructions

## Scope

- These instructions apply to `apps/api`.
- Follow `docs/backend-implementation-plan.md` and `docs/backend-implementation-checklist.md`.
- Implement only the requested Step and update its completed checkboxes after verification.
- Keep the backend as one NestJS application until measured load or deployment constraints require a split.
- Do not scaffold future modules, interfaces, or adapters before they are used.

## Backend Conventions

- Use Prisma ORM with the PostgreSQL connector.
- Keep Prisma access behind `PrismaService`; never instantiate `PrismaClient` in feature services.
- Validate environment variables with `ConfigModule.validationSchema` and Joi.
- Alias environment variables through `registerAs` factories under `src/config/configs`.
- Application code must read aliases such as `auth.jwt.accessSecret`, not raw keys such as `JWT_ACCESS_SECRET`.
- Raw `process.env` access is allowed only in config factories, Prisma CLI configuration, bootstrap validation, and tests.
- Validate HTTP request DTOs with `class-validator` and `class-transformer`.
- Keep the global `ValidationPipe` enabled with `transform`, `whitelist`, and `forbidNonWhitelisted`.
- Use response DTOs with class-transformer and Nest `SerializeOptions` when responses require transformation.
- Register `ClassSerializerInterceptor` globally.

## Authentication and Vault Authorization

- Hash passwords with Argon2id; never store or log plaintext passwords.
- Issue access and refresh tokens with `@nestjs/jwt`.
- Store only hashed refresh tokens and rotate them on every successful refresh.
- Protect authenticated HTTP APIs with `JwtAuthGuard` and Bearer access tokens.
- Every Vault query must include the authenticated user's ownership or membership condition.
- Only the owner may rename or delete a Vault, invite members, change roles, or remove members.
- Editors may write collaboration documents and attachments. Viewers are read-only.
- Return the same `404` response for missing Vaults and Vaults owned by another user.
- Never trust `userId`, `vaultId`, or role values supplied only by request bodies, query strings, or WebSocket room names.

## Collaboration

- NestJS owns the Hocuspocus v4 WebSocket upgrade endpoint at `/collaboration`; do not add a second WebSocket server or port.
- Accept only these room formats:
  - `vault:<vault UUID>:manifest`
  - `vault:<vault UUID>:doc:<document UUID>`
  - `vault:<vault UUID>:canvas:<document UUID>`
- Parse and validate room names before database access.
- Authenticate the connection and verify Vault membership before loading a Yjs document.
- Set Hocuspocus connections for viewer members to `readOnly`.
- Store Yjs state as binary PostgreSQL data. Do not serialize Yjs updates as JSON or Markdown.
- Keep one manifest Y.Doc per Vault and one content Y.Doc per Markdown or Canvas document.
- Keep attachment binary data outside Yjs.
- Debounce snapshot writes and flush pending writes during graceful shutdown.
- Client-side shared Hocuspocus WebSockets require `provider.attach()` for each provider; preserve protocol compatibility with that behavior.

## Storage

- S3 access must support custom endpoints for self-hosted S3-compatible storage.
- Keep endpoint, region, bucket, and path-style behavior configurable.
- Keep object storage private and return only short-lived signed URLs.
- Generate object keys on the server; never use an untrusted Vault path directly as an object key.
- Validate normalized paths, size limits, MIME allowlists, checksums, and S3 HEAD metadata before marking uploads ready.

## MCP

- Expose MCP from the same NestJS application using Streamable HTTP at `/mcp`.
- Authenticate MCP with separately revocable hashed tokens.
- Apply the same Vault ownership checks used by REST and WebSocket paths to every tool.
- Markdown writes must update the corresponding Yjs document so connected Obsidian clients receive them.
- Do not add MCP modules or tools before the MCP implementation phase is requested.

## File Layout

- Keep `*.controller.ts`, `*.service.ts`, and `*.module.ts` directly under the feature folder.
- Put other feature files in typed subfolders:
  - `dto/*.dto.ts`
  - `interfaces/*.interface.ts`
  - `types/*.type.ts`
  - `specs/*.spec.ts`
- Do not place DTOs, interfaces, types, or specs at the feature root.
- Do not add `entities/*.entity.ts`; Prisma owns persistence models and response contracts are DTOs.
- Create a shared abstraction only after at least two real consumers need it.

## Type Safety and Errors

- Prefer validated DTOs and explicit contracts over broad runtime type checks.
- Keep unavoidable checks for external claims, WebSocket payloads, and storage responses narrow and local.
- Do not use `any`; use `unknown` at trust boundaries and narrow it.
- Use Nest exceptions for expected client errors and do not leak internal database, token, or storage errors.
- Never log Authorization headers, cookies, passwords, access tokens, refresh tokens, MCP tokens, or signed URLs.

## Verification

After backend changes, run from the workspace root:

```bash
pnpm --filter api prisma:generate
pnpm --filter api build
pnpm --filter api lint
pnpm --filter api test
```

- Run `prisma:generate` only after Prisma is introduced; until then skip it.
- Add or update the smallest test that proves changed behavior.
- Run E2E tests when authentication, WebSocket collaboration, persistence, S3, or MCP behavior changes.
