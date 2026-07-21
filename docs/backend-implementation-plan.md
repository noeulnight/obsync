# Obsync 백엔드 구현 계획서

실행 단위와 진행 상태는 [백엔드 구현 체크리스트](./backend-implementation-checklist.md)에서 관리한다.

> 현재 상태 (2026-07-21): Step 00~17A가 완료됐다. 계정·Device Auth·Web session·여러 Vault·멤버 역할·Yjs 영속화·파일 버전 이력·S3 첨부파일까지 구현됐으며 MCP(Step 18~19)는 범위에서 제외한다. 아래 Phase 설명은 구현 순서를 보존한 history이며 현재 완료 여부는 체크리스트를 기준으로 한다.

## 1. 목표

NestJS 단일 서버에서 다음 기능을 단계적으로 제공한다.

- 개인 계정과 여러 Vault 관리
- Obsidian 플러그인의 Yjs 실시간·오프라인 동기화
- Markdown 파일 manifest 및 문서별 Y.Doc 영속화
- S3-compatible storage 기반 첨부파일 동기화
- 사용자 Vault를 안전하게 조회·수정하는 MCP 서버 (현재 구현 제외)

첫 배포 목표는 한 사용자가 여러 Vault를 만들고 두 Obsidian 클라이언트에서 Markdown을 실시간 편집하는 것이다.

## 2. 범위와 원칙

### MVP 포함

- 이메일·비밀번호 기반 개인 계정
- access token과 refresh token
- 사용자당 여러 Vault
- Vault owner/editor/viewer 권한과 초대 관리
- Obsidian Device Auth와 Web cookie session
- `/collaboration` WebSocket endpoint
- manifest 및 문서별 Yjs snapshot 저장
- 상태 확인 API와 구조화 로그
- S3 presigned URL 기반 첨부파일 업로드·다운로드

### 현재 제외

- 별도 조직·팀 모델
- 공개 문서 링크
- 서버 측 Markdown 검색·인덱싱
- 자체 S3 proxy 및 동영상 스트리밍 서버
- Kubernetes와 마이크로서비스 분리

Vault는 한 명의 owner와 여러 editor/viewer 멤버를 가진다. 별도 조직 모델은 만들지 않으며 NestJS, WebSocket, MCP를 별도 서비스로 분리하지 않는다.

## 3. 전체 구조

```text
Obsidian plugin
  ├─ HTTPS REST ──────────────┐
  ├─ WebSocket /collaboration ├─ NestJS API
  └─ Presigned URL ───────────┘    ├─ PostgreSQL
                                   └─ S3-compatible storage

MCP client ── Streamable HTTP /mcp ┘
```

NestJS가 HTTP 서버와 Hocuspocus WebSocket upgrade를 함께 소유한다. WebSocket endpoint를 별도 포트나 별도 서버로 만들지 않는다.

## 4. Yjs 동기화 모델

### Room 이름

```text
vault:<vaultId>:manifest
vault:<vaultId>:doc:<documentId>
vault:<vaultId>:canvas:<documentId>
```

- `manifest`: Markdown 파일의 ID, 경로, 삭제 여부, 수정 시각을 보관하는 `Y.Map`
- `doc`: Markdown 본문을 보관하는 문서별 `Y.Doc`과 `Y.Text`
- `canvas`: Canvas의 node와 edge를 ID 기반 `Y.Map`으로 보관한다.
- 첨부파일 binary는 Yjs에 넣지 않는다.

### 연결 처리

1. WebSocket 연결 시 token을 검증한다.
2. room 이름을 엄격하게 파싱한다.
3. token의 사용자에게 해당 `vaultId` 소유권이 있는지 확인한다.
4. Hocuspocus가 PostgreSQL snapshot을 불러온다.
5. 변경을 debounce한 후 최신 Yjs state를 원자적으로 upsert한다.

공유 `HocuspocusProviderWebsocket`을 사용하는 클라이언트는 각 provider에 반드시 `provider.attach()`를 호출해야 한다.

## 5. 데이터베이스 모델

핵심 테이블은 다음과 같다.

### `users`

| 필드 | 설명 |
|---|---|
| `id` | UUID PK |
| `email` | unique, 소문자 정규화 |
| `password_hash` | Argon2id hash |
| `created_at` | 생성 시각 |

### `sessions`

| 필드 | 설명 |
|---|---|
| `id` | UUID PK |
| `user_id` | users FK |
| `refresh_token_hash` | 원문을 저장하지 않는 token hash |
| `expires_at` | 만료 시각 |
| `revoked_at` | 로그아웃·강제 해제 시각 |

### `vaults`

| 필드 | 설명 |
|---|---|
| `id` | UUID PK |
| `owner_id` | users FK |
| `name` | 사용자 표시 이름 |
| `created_at`, `updated_at` | 생성·수정 시각 |

### `y_documents`

| 필드 | 설명 |
|---|---|
| `room_name` | PK, 검증된 room 이름 |
| `vault_id` | vaults FK |
| `state` | Yjs update `BYTEA` |
| `updated_at` | 마지막 저장 시각 |

### `attachments`

| 필드 | 설명 |
|---|---|
| `id` | UUID PK |
| `vault_id` | vaults FK |
| `path` | Vault 내부 정규화 경로 |
| `object_key` | S3 object key |
| `size`, `mime_type`, `sha256`, `etag` | 검증 metadata |
| `status` | `pending`, `ready`, `deleted` |
| `created_at`, `updated_at` | 생성·수정 시각 |

### `vault_members`

| 필드 | 설명 |
|---|---|
| `vault_id`, `user_id` | Vault와 사용자 unique membership |
| `role` | `EDITOR` 또는 `VIEWER` |
| `created_at` | 가입 시각 |

### `vault_invitations`

| 필드 | 설명 |
|---|---|
| `vault_id`, `email` | Vault별 unique pending 초대 |
| `role` | 수락 후 적용할 역할 |
| `invited_by_id` | 초대한 owner |
| `expires_at`, `created_at` | 7일 만료와 생성 시각 |

### `mcp_oauth_clients`, `mcp_oauth_authorizations`, `mcp_oauth_refresh_tokens`

| 필드 | 설명 |
|---|---|
| `client_id`, `metadata` | 동적으로 등록된 public MCP client |
| `user_id`, `code_hash`, `code_challenge` | 사용자 승인과 PKCE authorization code |
| `resource`, `scopes` | MCP audience와 Vault 권한 범위 |
| `token_hash`, `expires_at`, `revoked_at` | 회전 refresh token 수명 관리 |

현재 `vault_members`와 `vault_invitations`가 owner/editor/viewer 권한과 초대를 관리한다. 별도 조직 모델은 만들지 않는다.

## 6. HTTP API

### 시스템

```text
GET /api/health
GET /api/ready
```

- `health`: 프로세스 생존 여부
- `ready`: PostgreSQL과 필수 설정 연결 여부

### 인증

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/device/code
POST /api/auth/device/approve
POST /api/auth/device/token
POST /api/auth/refresh
POST /api/auth/logout
POST /api/auth/web/register
POST /api/auth/web/login
POST /api/auth/web/refresh
POST /api/auth/web/logout
GET  /api/auth/me
PATCH /api/auth/me
PATCH /api/auth/password
DELETE /api/auth/me
GET  /api/auth/sessions
DELETE /api/auth/sessions/:sessionId
```

Obsidian은 브라우저 기반 Device Auth를 사용하고 React의 `/device` 화면에서 승인한다. device code는 10분 안에 승인하고 한 번만 token으로 교환할 수 있으며 DB에는 code hash만 저장한다. Web은 access token을 메모리에만 두고 refresh token은 `HttpOnly`, `SameSite=Lax` cookie로 회전한다. 비밀번호와 token 원문은 로그에 남기지 않는다.

### Vault

```text
GET    /api/vaults
POST   /api/vaults
GET    /api/vaults/:vaultId
PATCH  /api/vaults/:vaultId
DELETE /api/vaults/:vaultId
GET    /api/vaults/:vaultId/members
PATCH  /api/vaults/:vaultId/members/:memberId
DELETE /api/vaults/:vaultId/members/:memberId
GET    /api/vaults/:vaultId/invitations
POST   /api/vaults/:vaultId/invitations
DELETE /api/vaults/:vaultId/invitations/:invitationId
GET    /api/invitations
POST   /api/invitations/:invitationId/accept
DELETE /api/invitations/:invitationId
```

조회는 owner/editor/viewer에게, 문서·첨부파일 쓰기는 owner/editor에게 허용한다. Vault 자체 변경과 멤버 관리는 owner만 가능하다. 존재하지 않는 Vault와 권한 없는 Vault는 동일하게 `404`로 처리한다.

### 첨부파일

```text
POST   /api/vaults/:vaultId/attachments/presign-upload
POST   /api/vaults/:vaultId/attachments/:attachmentId/complete
GET    /api/vaults/:vaultId/attachments/:attachmentId/download
DELETE /api/vaults/:vaultId/attachments/:attachmentId
```

서버는 업로드 전에 Vault 경로, 파일 크기(최대 100 MiB), MIME 문자열 형식을 검증한다. 확장자나 MIME allowlist는 두지 않으므로 DOCX를 포함한 임의 파일을 동기화할 수 있다. 완료 요청에서는 S3 HEAD 결과와 요청 metadata를 비교한 뒤 `ready`로 변경한다.

## 7. NestJS 모듈 구성

모듈은 해당 단계가 시작될 때만 만든다.

```text
apps/api/src/
  app.module.ts
  main.ts
  health/
  auth/
  vaults/
  collaboration/
  attachments/
  mcp/                 # Step 18 시작 전까지 생성하지 않음
  database/
```

- `health`: health/readiness
- `auth`: 계정, 비밀번호, JWT, session rotation
- `vaults`: Vault CRUD와 owner 검사
- `collaboration`: Hocuspocus 연결, room parser, Yjs store
- `attachments`: S3 presign과 metadata
- `mcp`: MCP transport와 tools
- `database`: PostgreSQL client와 migration 실행

처음부터 repository interface나 범용 storage abstraction을 만들지 않는다. PostgreSQL 또는 S3 구현을 실제로 두 개 이상 지원해야 할 때만 추상화한다.

## 8. 설정

```text
NODE_ENV
PORT
WEB_URL
DATABASE_URL
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
S3_ENDPOINT
S3_PUBLIC_ENDPOINT
S3_REGION
S3_BUCKET
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
S3_FORCE_PATH_STYLE
LOG_LEVEL
```

시작 시 환경변수를 검증하고 운영 환경에서 secret이나 database URL이 빠지면 즉시 종료한다. `.env`는 로컬 개발에서만 사용하고 저장소에 커밋하지 않는다.

## 9. 단계별 구현

### Phase 0 — 기반 정리

- Nest 기본 Hello World 제거
- 환경변수 검증
- `health`와 `ready` 분리
- PostgreSQL 개발 환경과 migration 명령 추가
- 요청 ID와 JSON 로그 추가

완료 조건:

- 잘못된 환경변수로 서버가 시작되지 않는다.
- health/readiness 테스트가 통과한다.

### Phase 1 — 개발용 Yjs 수직 슬라이스

- `/collaboration` WebSocket upgrade 연결
- Hocuspocus v4 통합
- room parser 및 UUID 검증
- 개발 token으로 인증
- 로컬 binary snapshot store로 manifest/doc 왕복 검증

완료 조건:

- 두 Hocuspocus client가 같은 문서를 실시간 병합한다.
- 서버 재시작 후 문서가 복원된다.
- 잘못된 token과 room은 연결이 거부된다.

### Phase 2 — PostgreSQL 영속화

- `vaults`, `y_documents` migration
- Hocuspocus load/store를 PostgreSQL upsert로 교체
- 저장 debounce와 graceful shutdown flush
- Vault 삭제 시 Yjs snapshot 정리

완료 조건:

- 여러 서버 재시작 후에도 snapshot이 유지된다.
- 같은 room의 동시 저장으로 state가 손상되지 않는다.

### Phase 3 — 계정과 여러 Vault

- `users`, `sessions` migration
- 회원가입·로그인·refresh rotation·로그아웃
- Vault CRUD
- WebSocket 인증에서 Vault owner 확인
- 개발용 고정 token 제거

완료 조건:

- 한 사용자가 여러 Vault를 생성하고 각각 동기화한다.
- 다른 사용자의 Vault REST/WebSocket 접근이 거부된다.
- 폐기된 session으로 refresh할 수 없다.

### Phase 4 — 첨부파일

- `attachments` migration
- S3-compatible client 연결
- presigned upload/download
- 업로드 완료 검증
- soft delete와 지연 garbage collection

완료 조건:

- 서버가 binary를 중계하지 않고 업로드·다운로드한다.
- 오프라인 재시도에도 같은 object가 중복 생성되지 않는다.
- 다른 Vault의 첨부파일을 받을 수 없다.

### Phase 5 — MCP

- Streamable HTTP endpoint `/mcp`
- OAuth Authorization Code + PKCE와 동적 client 등록
- Vault 목록, 파일 목록, Markdown 읽기·쓰기 tools
- 모든 tool에서 사용자와 Vault owner 검사

완료 조건:

- OAuth scope와 사용자 권한 범위를 벗어난 Vault를 읽거나 수정할 수 없다.
- Markdown 쓰기가 Yjs document update로 반영되어 열린 Obsidian에 전달된다.

### Phase 6 — 운영 안정화

- HTTPS/WSS reverse proxy
- CORS와 request size 제한
- 로그인 및 presign rate limit
- metrics, error tracking, backup/restore 점검
- 부하·장애·재연결 테스트

완료 조건:

- 배포 체크리스트와 복구 절차가 문서화된다.
- WebSocket 재연결과 서버 종료 중 데이터 유실 테스트가 통과한다.

## 10. 테스트 전략

### 단위 테스트

- room parser
- 경로 정규화 및 traversal 차단
- token rotation
- Vault owner 검사
- 첨부파일 크기·MIME 검증

### 통합 테스트

- PostgreSQL migration과 Yjs snapshot upsert
- register/login/refresh/logout
- S3 presign 및 완료 검증

### E2E 테스트

- 두 WebSocket client의 동시 편집
- 연결 종료 후 offline update 재병합
- 파일 생성·이름변경·삭제
- 사용자 간 Vault 격리
- MCP 쓰기 후 Obsidian 반영 (Step 19에서 추가)

테스트는 각 Phase의 완료 조건에 필요한 것만 추가한다.

## 11. 보안 체크리스트

- 비밀번호는 Argon2id로 hash한다.
- refresh token과 OAuth authorization code 원문을 DB에 저장하지 않는다.
- room의 `vaultId`를 token claim만 믿지 않고 DB owner와 대조한다.
- 모든 Vault 경로는 정규화하고 `..`, 절대경로, NUL을 거부한다.
- S3 object key는 사용자 입력 경로와 분리해 서버가 생성한다.
- presigned URL 만료 시간을 짧게 유지한다.
- 로그에서 Authorization, cookie, password, token을 제거한다.
- 운영 환경에서는 개발용 token fallback을 허용하지 않는다.

## 12. 최초 구현 단위 기록 (완료)

초기 수직 슬라이스에서 다음 작업을 먼저 진행했으며 모두 완료됐다. 이후 구현 상태는 체크리스트의 Step 09~17A 기록을 따른다.

1. `health` 구현
2. room parser 구현 및 단위 테스트
3. Nest HTTP 서버에 `/collaboration` upgrade 연결
4. 개발 token 인증
5. 로컬 Yjs snapshot 저장
6. 두 Node client를 사용한 WebSocket E2E 테스트

계정, PostgreSQL, S3는 이후 Step에서 완료됐고 MCP는 현재 제외했다.
