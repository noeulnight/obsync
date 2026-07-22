# Obsync

[English](./README.md) | [한국어](./README.ko.md)

어디에서 작성하든 이어지는 Obsidian Vault.

Obsync는 Obsidian과 웹 사이에서 노트, 캔버스, 폴더, 첨부파일을 함께 유지합니다. 다른 기기에서도 같은 Vault를 열고, 실시간으로 함께 편집하며, 기존에 파일을 정리하고 작성하던 방식을 그대로 이어갈 수 있습니다.

## 주요 기능

- Obsidian과 웹에서 같은 노트 편집
- 함께 작업하는 사람과 실시간 커서 확인
- 파일, 폴더, 캔버스, 첨부파일 동기화
- 연결이 끊겨도 Obsidian에서 작성한 내용을 재연결 후 반영
- 여러 Vault 생성 및 전환
- 편집자 또는 열람자로 사용자 초대
- 이전 파일 버전 확인 및 복원
- MCP 클라이언트에서 Vault 노트 검색, 읽기 및 수정

## 프로젝트 구성

- `apps/api`: 계정, Vault, 협업 및 파일 저장
- `apps/web`: 브라우저 기반 Vault 편집기
- `apps/plugin`: Obsidian 플러그인
- `docs`: 개발, 운영 및 인수 검증 문서

## 로컬 실행

Node.js 22.12 이상과 pnpm 11이 필요합니다.

```bash
pnpm install
docker compose up -d postgres minio
docker compose run --rm minio-init
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate:deploy
pnpm --filter api start:dev
```

다른 터미널에서 웹 앱을 실행합니다.

```bash
pnpm --filter web dev --host 0.0.0.0
```

- Web: `http://localhost:5173`
- API 상태: `http://localhost:3000/api/health`
- API 문서: `http://localhost:3000/api/docs`
- OpenAPI JSON: `http://localhost:3000/api/openapi.json`
- 파일 저장소 API: `http://localhost:9000`
- 파일 저장소 콘솔: `http://localhost:9001`
- MCP 엔드포인트: 개발 환경은 `http://localhost:3000/mcp`, Compose 환경은 `http://localhost:8080/mcp`

OAuth를 지원하는 MCP 클라이언트에 엔드포인트를 추가하면 Obsync가 브라우저 승인 화면을 엽니다. Authorization Code와 PKCE를 사용하며 요청된 `vault:read`, `vault:write` 권한만 부여합니다.

MCP 클라이언트는 파일, Markdown, Canvas, 첨부파일, 백링크, 그래프와 문서 기록을 관리할 수 있습니다. 연결된 클라이언트는 **Account settings → MCP**에서 확인하고 철회할 수 있습니다.

Obsidian 빌드 및 설치 방법은 [플러그인 안내서](./apps/plugin/README.md)를 참고하세요. 환경 설정은 [백엔드 로컬 개발 안내서](./docs/backend-local-development.md)에 정리되어 있습니다.

## 검증

```bash
pnpm ready
pnpm --filter api test:e2e
```

두 Obsidian 클라이언트와 웹 앱 사이의 협업 동작은 [동기화 인수 체크리스트](./docs/sync-acceptance-checklist.md)를 따라 검증할 수 있습니다.
