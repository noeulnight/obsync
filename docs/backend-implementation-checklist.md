# Obsync 백엔드 구현 체크리스트

기준 문서: [백엔드 구현 계획서](./backend-implementation-plan.md)

## 진행 규칙

- 한 번에 Step 하나만 진행한다.
- 각 Step은 독립적으로 빌드되고 검증되는 한 PR 또는 한 작업 단위다.
- 현재 Step의 완료 게이트가 통과하기 전에는 다음 Step을 시작하지 않는다.
- 요청받지 않은 Phase의 모듈이나 abstraction을 미리 만들지 않는다.
- 완료한 항목만 `[x]`로 바꾸고, 부분 완료는 `[ ]`를 유지한 채 메모를 남긴다.
- backend 변경 시 `apps/api/AGENTS.md`를 따른다.

## 전체 진행표

| Step | 작업 | 선행 Step | 상태 |
|---:|---|---:|---|
| 00 | Nest 기본 상태 확인 | - | [x] |
| 01 | 설정과 환경변수 검증 | 00 | [x] |
| 02 | HTTP 공통 기반 | 01 | [x] |
| 03 | Health와 readiness | 02 | [x] |
| 04 | Yjs room parser | 03 | [x] |
| 05 | Hocuspocus WebSocket 연결 | 04 | [x] |
| 06 | 개발 token 인증 | 05 | [x] |
| 07 | 로컬 Yjs snapshot 저장 | 06 | [x] |
| 08 | Collaboration E2E | 07 | [x] |
| 09 | PostgreSQL과 Prisma 기반 | 08 | [x] |
| 10 | Vault/Yjs schema와 store | 09 | [x] |
| 11 | 사용자 계정 | 10 | [x] |
| 12 | JWT와 refresh rotation | 11 | [x] |
| 12A | 계정 정보와 session 관리 | 12 | [x] |
| 13 | 여러 Vault CRUD | 12 | [x] |
| 14 | WebSocket Vault 권한 | 13 | [x] |
| 15 | S3-compatible storage 기반 | 14 | [x] |
| 16 | 첨부파일 upload/download | 15 | [x] |
| 17 | 첨부파일 삭제와 재시도 | 16 | [x] |
| 17A | Vault 초대와 멤버 역할 | 17 | [x] |
| 18 | MCP 인증과 transport | 17 | [ ] |
| 19 | MCP Vault/Markdown tools | 18 | [ ] |
| 20 | 운영 안정화 | 19 | [ ] |

---

### Step 17A — Vault 초대와 멤버 역할

- [x] 이메일 기반 7일 만료 초대와 수락·거절을 구현한다.
- [x] owner/editor/viewer 역할을 Vault 목록과 멤버 API에 노출한다.
- [x] owner만 초대, 역할 변경, 추방, Vault 변경·삭제를 수행한다.
- [x] editor는 Yjs와 첨부파일을 수정할 수 있다.
- [x] viewer WebSocket을 read-only로 강제한다.
- [x] Web 설정에서 받은 초대와 멤버를 관리한다.
- [x] Obsidian viewer 편집기와 로컬 업로드를 읽기 전용으로 처리한다.
- [x] REST와 WebSocket E2E를 추가한다.

---

## Phase 0 — 기반

### Step 00 — Nest 기본 상태 확인

목표: 새 스캐폴드가 변경 전 정상인지 기준선을 만든다.

- [x] `apps/api`의 Nest CLI 생성 파일을 확인한다.
- [x] 현재 Node, pnpm, Nest, TypeScript 버전을 기록한다.
- [x] 기본 unit test를 실행한다.
- [x] 기본 build를 실행한다.
- [x] 저장소의 기존 변경을 확인하고 보존한다.

완료 게이트:

```bash
pnpm --filter api build
pnpm --filter api test
```

산출물: 코드 변경 없이 통과한 기준선 기록.

완료 기록 (2026-07-19):

- Node `24.18.0`, pnpm `11.15.0`, Nest CLI `11.0.24`, TypeScript `5.9.3`
- `pnpm --filter api build` 통과
- `pnpm --filter api test --runInBand` 통과: 1 suite, 1 test
- 작업 전 저장소 파일은 모두 untracked 상태였으며 기존 내용을 변경하거나 제거하지 않음

### Step 01 — 설정과 환경변수 검증

목표: 애플리케이션이 raw 환경변수 대신 검증된 config alias만 사용하게 한다.

- [x] `@nestjs/config`, `joi`를 추가한다.
- [x] `ConfigModule.validationSchema`를 전역 등록한다.
- [x] `src/config/configs/app.config.ts`를 추가한다.
- [x] `PORT`, `NODE_ENV`, `LOG_LEVEL`을 alias로 노출한다.
- [x] 설정이 잘못되면 bootstrap 전에 실패하게 한다.
- [x] config 검증 성공·실패 테스트를 추가한다.

완료 게이트:

- [x] raw `process.env` 사용이 허용된 파일에만 존재한다.
- [x] 기본값 및 잘못된 설정 테스트가 통과한다.
- [x] build, lint, 관련 test가 통과한다.

### Step 02 — HTTP 공통 기반

목표: 이후 REST endpoint가 동일한 검증·직렬화 규칙을 사용하게 한다.

- [x] global prefix를 `/api`로 설정한다.
- [x] global `ValidationPipe`에 `transform`, `whitelist`, `forbidNonWhitelisted`를 활성화한다.
- [x] `ClassSerializerInterceptor`를 전역 등록한다.
- [x] shutdown hook을 활성화한다.
- [x] request ID를 생성하거나 전달한다.
- [x] 민감 정보가 제거된 구조화 로그를 구성한다.

완료 게이트:

- [x] 허용되지 않은 DTO 필드가 `400`으로 거부된다.
- [x] 모든 응답 로그에 request ID가 있다.
- [x] build, lint, 관련 test가 통과한다.

### Step 03 — Health와 readiness

목표: 프로세스 생존과 외부 의존성 준비 상태를 분리한다.

- [x] Nest 기본 Hello World controller/service를 제거한다.
- [x] `health` feature를 추가한다.
- [x] `GET /api/health`를 구현한다.
- [x] `GET /api/ready`를 구현한다.
- [x] 아직 DB가 없는 동안 readiness는 필수 config만 검사한다.
- [x] controller test를 추가한다.

완료 게이트:

- [x] `/api/health`가 `200`을 반환한다.
- [x] 잘못된 config에서 bootstrap validation이 실패한다.
- [x] build, lint, 관련 test가 통과한다.

---

## Phase 1 — 개발용 Yjs 수직 슬라이스

### Step 04 — Yjs room parser

목표: WebSocket 입력을 DB나 Hocuspocus에 전달하기 전에 안전하게 파싱한다.

- [x] `collaboration` feature를 추가한다.
- [x] manifest room 형식을 파싱한다.
- [x] document room 형식을 파싱한다.
- [x] Canvas room 형식을 파싱한다.
- [x] UUID 형식과 전체 문자열 일치를 검증한다.
- [x] parser 반환 type을 명시한다.
- [x] 정상·비정상 room 단위 테스트를 추가한다.

허용 형식:

```text
vault:<vault UUID>:manifest
vault:<vault UUID>:doc:<document UUID>
vault:<vault UUID>:canvas:<document UUID>
```

완료 게이트:

- [x] 추가 suffix, 잘못된 UUID, 다른 namespace가 모두 거부된다.
- [x] parser test, build, lint가 통과한다.

### Step 05 — Hocuspocus WebSocket 연결

목표: Nest HTTP 서버의 `/collaboration`에서 Yjs 연결을 수락한다.

- [x] Hocuspocus v4와 필요한 WebSocket adapter를 추가한다.
- [x] Nest가 생성한 HTTP server에 upgrade handler를 연결한다.
- [x] `/collaboration` 이외 upgrade 요청을 거부한다.
- [x] 연결·메시지·종료 lifecycle을 Hocuspocus에 전달한다.
- [x] shutdown 시 Hocuspocus resource를 해제한다.
- [x] 두 번째 WebSocket port는 만들지 않는다.

완료 게이트:

- [x] Hocuspocus client가 `/collaboration`에 연결된다.
- [x] 다른 WebSocket path는 거부된다.
- [x] 서버 종료 후 열린 handle이 남지 않는다.

### Step 06 — 개발 token 인증

목표: 계정 구현 전에도 무인증 collaboration 연결을 막는다.

- [x] config alias로 개발 token을 추가한다.
- [x] 운영 환경에서는 개발 token fallback을 금지한다.
- [x] Hocuspocus authentication hook에서 token을 검증한다.
- [x] 인증 전에 Step 04 room parser를 실행한다.
- [x] token과 room 원문을 로그에 남기지 않는다.
- [x] 성공·실패 연결 테스트를 추가한다.

완료 게이트:

- [x] 올바른 token과 room만 연결된다.
- [x] 누락·오류 token은 인증 실패 close code로 종료된다.
- [x] 인증 실패 로그에 secret이 없다.

### Step 07 — 로컬 Yjs snapshot 저장

목표: PostgreSQL 전 단계에서 서버 재시작 복원을 검증한다.

- [x] Yjs state를 binary 파일로 저장한다.
- [x] room 이름을 안전한 파일명으로 변환한다.
- [x] 임시 파일 작성 후 rename으로 원자 저장한다.
- [x] 저장을 debounce한다.
- [x] 존재하지 않는 room은 빈 Y.Doc으로 시작한다.
- [x] 손상된 snapshot 오류를 숨기지 않는다.

완료 게이트:

- [x] manifest와 document room이 서로 다른 snapshot을 사용한다.
- [x] 서버 재시작 후 state가 복원된다.
- [x] 저장 중 프로세스 종료로 기존 snapshot이 손상되지 않는다.

### Step 08 — Collaboration E2E

목표: Phase 1의 실제 수직 흐름을 자동 검증한다.

- [x] 두 Node Hocuspocus client를 연결한다.
- [x] client A의 Y.Text 변경이 client B에 반영되는지 확인한다.
- [x] 동시에 입력한 변경이 양쪽에서 같은 결과로 수렴하는지 확인한다.
- [x] manifest와 document room을 함께 검증한다.
- [x] 서버 재시작 복원 시나리오를 검증한다.
- [x] 잘못된 token/room 거부를 검증한다.

완료 게이트:

```bash
pnpm --filter api build
pnpm --filter api lint
pnpm --filter api test
pnpm --filter api test:e2e
```

Phase 1 종료 조건: 플러그인 없이도 두 Node client가 실시간 병합과 재시작 복원을 증명한다.

---

## Phase 2 — PostgreSQL 영속화

### Step 09 — PostgreSQL과 Prisma 기반

목표: 한 개의 PostgreSQL 구현만 추가한다.

- [x] Prisma와 PostgreSQL driver를 추가한다.
- [x] `prisma/schema.prisma`에 PostgreSQL datasource를 선언한다.
- [x] `PrismaService`와 `PrismaModule`을 추가한다.
- [x] `DATABASE_URL` config와 validation을 추가한다.
- [x] 로컬 PostgreSQL 실행 방법을 문서화한다.
- [x] migration과 generate script를 추가한다.
- [x] readiness가 DB 연결을 확인하게 한다.

완료 게이트:

- [x] 빈 DB에 migration을 적용할 수 있다.
- [x] PrismaClient를 직접 생성하는 feature service가 없다.
- [x] `prisma:generate`, build, lint, test가 통과한다.

### Step 10 — Vault/Yjs schema와 store

목표: 로컬 snapshot store를 PostgreSQL로 교체한다.

- [x] `Vault`, `YDocument` Prisma model을 추가한다.
- [x] `roomName` unique/PK와 `vaultId` index를 추가한다.
- [x] Yjs state를 PostgreSQL binary column에 저장한다.
- [x] Hocuspocus load/store를 Prisma upsert로 연결한다.
- [x] debounce와 graceful shutdown flush를 유지한다.
- [x] 로컬 binary store를 제거한다.
- [x] migration과 통합 테스트를 추가한다.

완료 게이트:

- [x] server instance를 바꿔도 Yjs state가 복원된다.
- [x] manifest와 document가 Vault별로 격리된다.
- [x] 동시 upsert로 저장 데이터가 손상되지 않는다.

---

## Phase 3 — 계정과 여러 Vault

### Step 11 — 사용자 계정

목표: 개인 계정을 생성하고 검증한다.

- [x] `User` Prisma model과 migration을 추가한다.
- [x] email을 소문자로 정규화하고 unique constraint를 둔다.
- [x] register DTO와 response DTO를 추가한다.
- [x] Argon2id로 비밀번호를 hash한다.
- [x] 중복 email 응답에서 내부 DB 오류를 숨긴다.
- [x] 사용자 조회 시 password hash를 반환하지 않는다.
- [x] register 단위·통합 테스트를 추가한다.

완료 게이트:

- [x] plaintext password가 DB와 로그에 없다.
- [x] 같은 email을 대소문자만 바꿔 중복 등록할 수 없다.
- [x] build, lint, 관련 test가 통과한다.

### Step 12 — JWT와 refresh rotation

목표: 짧은 access token과 폐기 가능한 refresh session을 제공한다.

- [x] `Session` Prisma model과 migration을 추가한다.
- [x] login, refresh, logout, me endpoint를 추가한다.
- [x] access/refresh secret을 별도 config alias로 관리한다.
- [x] refresh token hash만 저장한다.
- [x] refresh 성공 시 기존 token을 폐기하고 새 token을 발급한다.
- [x] `JwtAuthGuard`를 추가한다.
- [x] 만료·재사용·로그아웃 테스트를 추가한다.
- [x] Obsidian Device Auth의 code 발급, 브라우저 승인, polling endpoint를 추가한다.
- [x] device/user code는 hash만 저장하고 10분 만료와 1회 교환을 적용한다.
- [x] Device Auth 승인·재사용 거부 E2E를 추가한다.
- [x] Web refresh token을 HttpOnly cookie에 저장하고 rotation endpoint를 추가한다.
- [x] Device Auth 승인 화면을 React `/device` route로 연결한다.

완료 게이트:

- [x] 폐기된 refresh token을 재사용할 수 없다.
- [x] access token 없이 보호 API에 접근할 수 없다.
- [x] token 원문이 DB와 로그에 없다.
- [x] Web JavaScript와 API response에서 refresh token에 접근할 수 없다.

### Step 12A — 계정 정보와 session 관리

목표: 로그인한 사용자가 계정 정보와 활성 session을 직접 관리한다.

- [x] 표시 이름과 이메일 변경 API를 추가한다.
- [x] 현재 비밀번호를 검증하는 비밀번호 변경 API를 추가한다.
- [x] 활성 session 조회·폐기 API를 추가한다.
- [x] 계정 삭제 시 첨부파일 object와 사용자 데이터를 함께 정리한다.
- [x] 계정 응답에서 password hash를 노출하지 않는다.
- [x] 변경·권한·삭제 E2E 테스트를 추가한다.

완료 게이트:

- [x] Prisma migration과 generate가 통과한다.
- [x] build, lint, unit test, E2E가 통과한다.

### Step 13 — 여러 Vault CRUD

목표: 한 계정이 독립된 여러 Vault를 관리한다.

- [x] Vault model에 `ownerId`, name, timestamps를 확정한다.
- [x] list, create, get, update, delete endpoint를 추가한다.
- [x] request/response DTO를 추가한다.
- [x] 모든 query에 인증 사용자 `ownerId`를 포함한다.
- [x] 미소유 Vault와 없는 Vault를 동일한 `404`로 처리한다.
- [x] 한 사용자의 여러 Vault와 사용자 간 격리 테스트를 추가한다.

완료 게이트:

- [x] 한 사용자가 여러 Vault를 만들 수 있다.
- [x] 사용자 A가 사용자 B의 Vault를 조회·수정·삭제할 수 없다.
- [x] Vault 삭제 시 관련 YDocument 정리 정책이 적용된다.

### Step 14 — WebSocket Vault 권한

목표: 개발 token을 사용자 인증과 Vault owner 검사로 교체한다.

- [x] Hocuspocus token에서 access token을 검증한다.
- [x] room parser에서 추출한 `vaultId`의 owner를 조회한다.
- [x] 인증과 owner 확인 후에만 Yjs state를 load한다.
- [x] 개발 token fallback을 제거한다.
- [x] 인증 실패 결과에서 Vault 존재 여부를 노출하지 않는다.
- [x] 사용자 간 WebSocket 격리 E2E를 추가한다.

완료 게이트:

- [x] 본인 Vault의 manifest/doc에만 연결할 수 있다.
- [x] 다른 사용자 Vault와 임의 UUID room은 거부된다.
- [x] Phase 1 collaboration E2E가 JWT 방식으로 계속 통과한다.

---

## Phase 4 — 첨부파일

### Step 15 — S3-compatible storage 기반

목표: private object storage에 안전하게 연결한다.

- [x] S3 client 의존성을 추가한다.
- [x] endpoint, region, bucket, credential, path-style config를 추가한다.
- [x] S3 config validation을 추가한다.
- [x] server-generated object key 규칙을 정의한다.
- [x] private bucket 연결과 readiness를 검증한다.
- [x] 로컬 S3-compatible 개발 환경을 문서화한다.

완료 게이트:

- [x] AWS S3와 custom endpoint 설정을 모두 표현할 수 있다.
- [x] object storage는 public access 없이 동작한다.
- [x] credential과 signed URL이 로그에 없다.

### Step 16 — 첨부파일 upload/download

목표: 서버가 binary를 중계하지 않고 전송을 승인한다.

- [x] `Attachment` model과 migration을 추가한다.
- [x] upload presign endpoint를 추가한다.
- [x] upload complete endpoint를 추가한다.
- [x] download signed URL endpoint를 추가한다.
- [x] Vault path, 크기, MIME, checksum을 검증한다.
- [x] complete에서 S3 HEAD metadata를 대조한다.
- [x] Vault owner 검사 테스트를 추가한다.

완료 게이트:

- [x] binary가 Nest request body를 통과하지 않는다.
- [x] 검증이 끝난 object만 `ready`가 된다.
- [x] 다른 Vault의 attachment를 다운로드할 수 없다.

### Step 17 — 첨부파일 삭제와 재시도

목표: 오프라인 재시도와 삭제를 멱등하게 처리한다.

- [x] upload 요청에 idempotency 기준을 추가한다.
- [x] 같은 hash/path 재시도에서 불필요한 object 중복을 막는다.
- [x] delete endpoint는 먼저 soft delete한다.
- [x] 지연 object garbage collection 작업을 추가한다.
- [x] pending upload 만료 정리를 추가한다.
- [x] 재시도·중복·삭제 실패 테스트를 추가한다.

완료 게이트:

- [x] 같은 완료 요청을 반복해도 결과가 변하지 않는다.
- [x] DB 삭제와 S3 삭제 사이 실패를 재시도할 수 있다.
- [x] 삭제된 attachment의 signed URL을 새로 발급하지 않는다.

---

## Phase 5 — MCP

### Step 18 — MCP 인증과 transport

목표: 같은 Nest 앱에서 OAuth 기반 MCP 연결을 제공한다.

- [x] MCP SDK를 추가한다.
- [x] Streamable HTTP `/mcp` endpoint를 추가한다.
- [x] OAuth client, authorization, refresh token model과 migration을 추가한다.
- [x] Protected Resource Metadata와 Authorization Server Metadata를 제공한다.
- [x] Dynamic Client Registration과 Authorization Code + PKCE를 지원한다.
- [x] audience와 `vault:read`, `vault:write` scope를 검증한다.
- [x] refresh token을 hash 저장하고 사용할 때마다 회전한다.
- [x] MCP request에서 사용자를 복원한다.
- [x] 인증 성공·실패 E2E를 추가한다.

완료 게이트:

- [x] 사용한 authorization code와 refresh token은 재사용할 수 없다.
- [x] access token은 MCP resource audience로 제한한다.
- [x] REST/WebSocket과 동일한 사용자 경계를 가진다.

### Step 19 — MCP Vault/Markdown tools

목표: 사용자 Vault를 안전하게 읽고 Yjs를 통해 수정한다.

- [x] Vault 목록 tool을 추가한다.
- [x] manifest 기반 파일 목록 tool을 추가한다.
- [x] Markdown 읽기 tool을 추가한다.
- [x] Markdown 쓰기 tool을 Yjs update로 구현한다.
- [x] 모든 tool에 Vault 권한 검사를 적용한다.
- [ ] MCP 쓰기 → Hocuspocus client 반영 E2E를 추가한다.

완료 게이트:

- [ ] 다른 사용자의 Vault를 tool로 읽거나 쓸 수 없다.
- [ ] Markdown 쓰기가 열린 Obsidian에 실시간 전달된다.

---

## Phase 6 — 운영 안정화

### Step 20 — 운영 안정화

목표: 단일 서버 MVP를 안전하게 배포하고 복구할 수 있게 한다.

- [ ] HTTPS/WSS reverse proxy 설정을 문서화한다.
- [ ] CORS, body size, timeout 제한을 설정한다.
- [ ] 로그인, refresh, presign rate limit을 추가한다.
- [ ] metrics와 error tracking을 추가한다.
- [ ] PostgreSQL과 S3 backup/restore 절차를 검증한다.
- [ ] graceful shutdown 중 Yjs flush를 검증한다.
- [ ] WebSocket 재연결·부하·장애 테스트를 실행한다.
- [ ] 배포 및 rollback 체크리스트를 작성한다.

완료 게이트:

- [ ] staging에서 배포·rollback·restore rehearsal이 통과한다.
- [ ] 서버 종료와 재시작 중 검증된 데이터 유실이 없다.
- [ ] 운영 secret fallback이 존재하지 않는다.
- [ ] 전체 build, lint, unit, integration, E2E가 통과한다.

## 공통 Step 종료 체크리스트

각 Step 마지막에 아래 항목을 확인한다.

- [ ] 요청한 Step 범위만 변경했다.
- [ ] 새 abstraction과 dependency가 실제로 필요하다.
- [ ] trust boundary 입력을 검증한다.
- [ ] secret과 개인정보를 로그에 남기지 않는다.
- [ ] 관련 최소 테스트를 추가하거나 갱신했다.
- [ ] `pnpm --filter api build`가 통과한다.
- [ ] `pnpm --filter api lint`가 통과한다.
- [ ] `pnpm --filter api test`가 통과한다.
- [ ] 동작 변경 시 관련 E2E가 통과한다.
- [ ] 문서와 체크리스트 상태를 갱신했다.
