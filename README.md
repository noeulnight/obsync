# Obsync

Obsidian 플러그인과 웹 편집기 사이에서 Vault를 동기화하는 Vite+ monorepo다. Markdown과 Canvas는 Yjs/Hocuspocus로 실시간·오프라인 동기화하고, 첨부파일은 S3-compatible storage에 저장한다. Vault owner는 이메일로 editor/viewer를 초대하고 멤버 권한을 관리할 수 있다.

## 구성

- `apps/api`: NestJS REST API와 `/collaboration` WebSocket
- `apps/web`: React + CodeMirror 웹 편집기
- `apps/plugin`: Obsidian 플러그인
- `docs`: 구현 계획, 로컬 개발, 운영 및 인수 테스트 문서

MCP는 현재 구현 범위에서 제외되어 있다.

## 로컬 실행

Node.js 22.12 이상과 pnpm 11이 필요하다.

```bash
pnpm install
docker compose up -d postgres minio
docker compose run --rm minio-init
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate:deploy
pnpm --filter api start:dev
```

다른 터미널에서 웹을 실행한다.

```bash
pnpm --filter web dev --host 0.0.0.0
```

- Web: `http://localhost:5173`
- API: `http://localhost:3000/api/health`
- MinIO API: `http://localhost:9000`
- MinIO console: `http://localhost:9001`

플러그인 빌드와 설치는 [플러그인 README](./apps/plugin/README.md), 상세 환경변수는 [백엔드 로컬 개발](./docs/backend-local-development.md)을 따른다.

## 검증

```bash
pnpm ready
pnpm --filter api test:e2e
```

실제 두 Obsidian 클라이언트와 Web 사이 동작은 [동기화 인수 체크리스트](./docs/sync-acceptance-checklist.md)로 확인한다.
