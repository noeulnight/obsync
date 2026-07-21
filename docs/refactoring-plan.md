# Obsync 코드 전수 점검 및 리팩터링 계획

- 기준일: 2026-07-21
- 기준 커밋: `c8b5ad5` (`main`)
- 범위: `apps/api`, `apps/plugin`, `apps/web`
- 제외: 생성된 shadcn UI 파일, 빌드 산출물, 의존성 내부 코드
- 목적: 동작을 바꾸지 않고 동기화 핵심 규칙의 중복과 대형 책임 결합을 먼저 줄인다.

## 1. 결론

현재 구조는 기능별 디렉터리와 API 권한 경계는 대체로 명확하지만, 클라이언트 동기화 계층이 두 벌로 성장했다. 가장 큰 위험은 파일 크기 자체보다 플러그인과 웹에서 동일한 오프라인 작업 규칙을 따로 고치는 구조다.

우선순위는 다음과 같다.

1. 플러그인과 웹의 순수 동기화 규칙을 하나의 `packages/sync-core`로 합친다.
2. 동기화 동작을 고정하는 특성 테스트를 먼저 추가한다.
3. `VaultSync`, `WebVault`, `CanvasEditor`, `Workspace`를 책임 단위로 나눈다.
4. API는 경로 규칙과 파일 작업 테스트를 보강한 뒤 필요한 부분만 분리한다.
5. 플랫폼별 I/O, 인증 전송, Obsidian 생명주기는 억지로 통합하지 않는다.

구현 결과 중복 동기화 규칙 10개를 제거했고 런타임 외부 의존성은 늘지 않았다. 테스트와 생성 UI를 제외한 제품 코드는 기준 대비 307줄 증가했다. 공통 상태 전이와 UI 책임 분리에 필요한 이름·props가 추가된 결과이며, 이 작업의 성과는 총 줄 수 감소보다 동일 규칙의 단일화와 대형 파일의 변경 범위 축소에 있다.

## 2. 조사 결과

### 2.1 규모와 집중도

| 영역 | TypeScript 파일 | 코드 줄 수 | 주요 집중 파일 |
| --- | ---: | ---: | --- |
| API | 58 | 3,349 | `vault-files.service.ts` 423, `auth.service.ts` 366 |
| Plugin | 20 | 3,463 | `sync.ts` 1,090, `main.ts` 375, `canvas.ts` 327 |
| Web | 57 | 8,460 | `CanvasEditor.tsx` 969, `sync.ts` 573, `Workspace.tsx` 506, `live-preview.ts` 444 |

`apps/web/src/components/ui/sidebar.tsx` 671줄은 shadcn 기반 생성 코드이므로 리팩터링 우선순위 산정에서 제외했다.

### 2.2 확인된 중복과 불일치

| 규칙 | Plugin | Web | 현재 위험 |
| --- | --- | --- | --- |
| 작업 큐 전송·409 재기준화·지수 백오프 | `apps/plugin/src/sync.ts:914` | `apps/web/src/features/documents/lib/sync.ts:320` | 동일 버그를 두 번 수정해야 함 |
| 작업 확정·manifest 반영 후 큐 정리 | `apps/plugin/src/sync.ts:1027` | `apps/web/src/features/documents/lib/sync.ts:436` | 재연결 시 큐 생명주기 차이 가능 |
| 폴더 rename/delete 투영 | `apps/plugin/src/file-operations.ts:5` | `apps/web/src/features/documents/lib/sync.ts:471` | Web 구현에는 `createdAt/updatedAt` 투영이 없음 |
| 충돌 파일명 생성 | `apps/plugin/src/path.ts:34` | `apps/web/src/features/documents/lib/files.ts:115` | 규칙 변경 시 충돌 사본 이름 불일치 |
| 경로 포함·이동·대소문자/NFC 비교 | `apps/plugin/src/path.ts:6` | `apps/web/src/features/documents/lib/files.ts:105` | 플랫폼별 rename 결과 불일치 가능 |
| API 경로 검증 | `vault-files.service.ts:365` | `attachments.service.ts:226` | 두 서버 진입점이 공백·NFC·역슬래시를 다르게 처리 |
| 파일 작업 API 타입 | `apps/plugin/src/api.ts:22` | `apps/web/src/lib/api/client.ts:54` | 서버 계약 변경 누락 가능 |
| Y.Text 최소 범위 교체 | `apps/plugin/src/text.ts:3` | `apps/web/src/features/canvas/lib/sync.ts:323` | 한글 IME 관련 수정이 한쪽에만 반영될 수 있음 |
| 문서·Canvas presence 색상 | Plugin 5색 | Web 6색 | 같은 사용자가 화면마다 다른 색으로 보임 |
| UI 오류 메시지 변환 | Web 7개 컴포넌트 | 동일 1~2줄 함수 반복 | 낮은 위험의 사소한 중복 |

추가로 Plugin build는 성공하지만 `outDir: "."` 때문에 Vite의 source overwrite 경고가 발생한다. `emptyOutDir: false`라 현재 파일을 지우지는 않지만, 배포 산출물을 source root에 직접 쓰는 구조는 빌드와 배포 경계를 흐린다.

### 2.3 책임이 과도하게 결합된 파일

#### `apps/plugin/src/sync.ts`

한 클래스가 다음 책임을 모두 가진다.

- WebSocket/manifest 연결 생명주기
- 초기 Vault 정책과 로컬 초기화
- 로컬 파일 이벤트 수집과 reconcile
- 원격 변경의 파일시스템 반영 및 재시도
- Markdown/Canvas 세션 캐시
- 첨부파일 업로드·다운로드
- 오프라인 작업 큐와 충돌 사본 처리

이 구조에서는 원격 파일 적용을 수정해도 에디터 바인딩과 초기 동기화 회귀를 함께 검토해야 한다. 특히 Obsidian 시작 중에는 동기화 객체가 준비되기 전에 CodeMirror/Canvas를 건드리지 않는 현재 안전 조건을 유지해야 한다.

#### `apps/web/src/features/canvas/components/CanvasEditor.tsx`

viewport 변환, pointer gesture, edge 기하, 노드 렌더링, 노드 내 CodeMirror, toolbar, attachment preview, presence를 한 컴포넌트가 처리한다. 순수 좌표 계산과 DOM 동작이 섞여 있어 작은 상호작용 수정도 전체 Canvas 렌더러를 건드린다.

#### `apps/web/src/features/workspace/components/Workspace.tsx`

라우팅, `WebVault` 생명주기, 선택 상태, 파일 CRUD, 업로드, 링크 해석, asset URL, sidebar와 main content 렌더링을 함께 처리한다. 화면 구성보다 세션 생명주기와 route 동기화가 핵심 책임이어야 한다.

#### `apps/web/src/features/documents/lib/live-preview.ts`

frontmatter, code fence, 링크, 이미지, checkbox와 각 widget 구현이 한 파일에 모여 있다. 파서 전체를 추상화할 필요는 없지만 문법 기능별 decoration 생성기는 분리하는 편이 테스트 범위를 줄인다.

### 2.4 테스트 공백

현재 테스트는 순수 helper와 일부 UI 동작을 잘 다루지만 다음 핵심 경로가 비어 있다.

- `VaultFilesService`의 create/rename/delete/update attachment, idempotency, 폴더 하위 항목 version 증가
- Plugin `VaultSync`의 오프라인 큐 복구, 409 재기준화, 원격 apply 재시도
- Plugin/Web이 같은 manifest와 작업 큐 입력에서 같은 projected entries를 만드는지
- 경로 규칙이 API/Plugin/Web에서 같은 결과를 내는지
- 연결 중단 직후 destroy, read-only, 초기 동기화 모드별 생명주기
- 문서와 Canvas의 한글 IME 교체 규칙 및 presence 색상 일치

기존 테스트 개수만 늘리기보다 위 상태 전이를 fixture 기반으로 먼저 고정해야 한다.

## 3. 목표 구조

```text
packages/sync-core/
  file-types.ts          # FileEntry, FileOperation, RemoteFile의 공통 최소 계약
  path.ts                # normalize/key/isWithin/moveWithin/conflictPath
  projection.ts          # pending operation -> projected manifest
  outbox.ts              # request 변환, confirm/rebase/rewrite의 순수 상태 전이
  y-text.ts              # Y.Text 최소 범위 교체와 canvas text key

apps/plugin/
  VaultSync              # Obsidian 생명주기 조정자
  initial-sync.ts        # 최초 local/server/merge 정책
  remote-file-applier.ts # Vault filesystem 반영과 경로별 직렬화
  attachment-sync.ts     # binary upload/download
  outbox-store.ts        # Y.Array/IndexedDB 어댑터와 API 호출

apps/web/
  WebVault               # 브라우저 세션 조정자
  outbox-store.ts        # Y.Array/IndexedDB 어댑터와 API 호출
  Workspace              # route와 세션 조정
  WorkspaceSidebar       # Vault/file navigation
  WorkspaceContent       # active entry 렌더링
  CanvasEditor           # 조정자
  CanvasSurface/Node/Toolbar + canvas-geometry.ts
```

`sync-core`에는 React, Obsidian, Axios, DOM, NestJS, Hocuspocus provider 생명주기를 넣지 않는다. 두 실제 소비자가 공유하는 결정론적 규칙만 둔다. 저장 매체는 양쪽 모두 Y.Array/IndexedDB를 계속 사용하되, 읽고 쓰는 얇은 adapter만 각 앱에 남긴다.

## 4. 단계별 실행 계획

### Step 0. 동작 기준선 고정

- [x] API 파일 작업 통합 테스트를 추가한다.
- [x] 동일 fixture로 Plugin/Web projected manifest 결과를 비교한다.
- [x] create → offline rename → reconnect → 409 → rebase → confirm 상태 전이를 고정한다.
- [x] 폴더 rename/delete와 하위 파일 version 결과를 고정한다.
- [x] read-only, remote delete 중 local unsynced text, 첨부파일 갱신을 고정한다.
- [x] 한글 문자열을 포함한 최소 Y.Text delta와 공통 presence 규칙 테스트를 추가한다.

완료 조건:

- 현재 구현에서 테스트가 통과한다.
- 이후 각 단계가 같은 fixture를 재사용한다.
- 테스트를 통과시키기 위한 제품 동작 변경은 이 단계에 섞지 않는다.

### Step 1. 공통 동기화 규칙 추출

- [x] `packages/sync-core` 하나만 만든다.
- [x] `FileEntry`, `FileOperation`, `FileOperationRequest`의 공통 필드를 확정한다.
- [x] `createdAt`을 공통 작업 메타데이터로 유지하고 Web projection에도 `updatedAt`을 동일하게 반영한다.
- [x] path normalization, key, containment, move, conflict naming을 이동한다.
- [x] projection, operation request 정리, pending path rewrite를 순수 함수로 이동한다.
- [x] confirm/rebase를 `Y.Array` 자체가 아닌 배열 입력/출력 상태 전이로 만든다.
- [x] Y.Text 최소 범위 교체와 Canvas node text key를 공유한다.
- [x] presence 팔레트를 하나로 맞춘다.

완료 조건:

- Plugin/Web의 기존 중복 함수가 삭제된다.
- 양쪽 fixture 결과가 byte-for-byte 동일하다.
- API의 외부 입력 검증은 유지하되 같은 normalize/key 함수를 사용한다.
- 새 런타임 의존성을 추가하지 않는다.

### Step 2. Plugin `VaultSync` 분리

- [x] `VaultSync`에는 provider 생성, 세션 registry, 상태 전달, destroy 순서만 남긴다.
- [x] 최초 동기화와 로컬 초기화 정책을 `initial-sync.ts`로 옮긴다.
- [x] 원격 적용 batch 순서, 경로별 queue, retry를 `remote-file-applier.ts`로 옮긴다.
- [x] attachment upload/download/hash를 `attachment-sync.ts`로 옮긴다.
- [x] outbox persistence/API 호출을 `outbox.ts`로 옮기고 상태 전이는 `sync-core`를 쓴다.
- [x] `DocumentSync`/`CanvasSync` 생성은 coordinator에 남긴다.

완료 조건:

- `sync.ts`가 약 300~450줄의 coordinator가 된다.
- startup 시 `VaultSync`가 없으면 editor/canvas binding이 no-op인 조건이 유지된다.
- provider `attach()`와 destroy 순서가 바뀌지 않는다.
- 초기 모드 3개와 재연결 테스트가 통과한다.

### Step 3. Web `WebVault` 및 Workspace 분리

- [x] `WebVault`에서 중복 outbox 로직을 제거하고 browser persistence/API adapter만 남긴다.
- [x] cache manifest와 server manifest의 역할을 타입과 이름으로 구분한다.
- [x] `Workspace`에는 route ↔ active file, WebVault 생성/해제, 명령 조정만 남긴다.
- [x] sidebar 렌더링과 계정/Vault 메뉴를 `WorkspaceSidebar`로 이동한다.
- [x] active entry별 editor/canvas/attachment 분기를 `WorkspaceContent`로 이동한다.
- [x] 업로드 input과 mutation 상태는 sidebar 소유가 아니라 workspace command로 유지한다.

완료 조건:

- route 새로고침, Vault 전환, 삭제된 active file fallback 테스트가 유지된다.
- `WebVault` destroy가 열린 문서/Canvas/provider/persistence를 한 번씩만 정리한다.
- 단일 사용 custom store나 범용 command bus를 만들지 않는다.

### Step 4. Canvas와 Live Preview 분리

- [x] Canvas 좌표 변환, nearest side, edge point/path를 `canvas-geometry.ts`로 옮긴다.
- [x] `CanvasSurface`, `CanvasNode`, `CanvasToolbar`로 렌더링 책임을 나눈다.
- [x] pointer gesture 상태는 Surface 한 곳에서 계속 소유한다.
- [x] 노드 내 Markdown session과 attachment resolver는 Node에 props로 전달한다.
- [x] live preview의 properties, code block, inline decoration/widget을 문법별 파일로 나눈다.

완료 조건:

- pan/zoom, node move/resize, edge connect, z-order, embedded document live update가 기존 테스트와 동일하다.
- 한글 composition 중 React state로 완성 전 문자열을 재주입하지 않는다.
- Canvas session 모델이나 CRDT 구조는 이 단계에서 바꾸지 않는다.

### Step 5. API 경계 정리

- [x] `VaultFilesService`에 파일 작업 통합 테스트를 추가한다.
- [x] Vault file과 attachment의 경로 검증을 하나의 서버 경계 함수로 통일한다.
- [x] create/rename/delete/update attachment transaction은 한 서비스에 유지하되 version snapshot 생성 helper를 분리한다.
- [ ] device authorization이 독립 변경 단위가 되면 `DeviceAuthService`만 분리한다.
- [x] `AttachmentsService.findOwned/findAnyOwned`의 사용되지 않는 `ownerId` 인자를 제거한다.
- [x] Plugin/Web API client의 파일 작업 DTO는 `sync-core` 계약을 import하고 transport는 각자 유지한다.

완료 조건:

- 잘못된 경로가 모든 API 진입점에서 같은 기준으로 거절된다.
- 권한 검사는 계속 `VaultAccessService`를 통과한다.
- Prisma transaction과 Hocuspocus publish 순서가 유지된다.
- Axios와 Obsidian `requestUrl`을 합친 범용 HTTP client를 만들지 않는다.

### Step 6. 저위험 정리

- [x] Web의 반복 `message(reason)`을 한 helper로 합친다.
- [x] 배포 이력이 없어 Canvas 구버전 node text 변환 코드와 호환성 정책을 제거한다.
- [x] 사용되지 않는 export와 DTO를 `rg` 및 typecheck로 확인해 삭제한다.
- [x] Plugin 산출물을 `dist`에 만든 뒤 배포 단계에서 `main.js`를 복사하도록 바꿔 Vite의 root outDir 경고를 없앤다.
- [x] `docs/backend-implementation-plan.md`의 완료된 체크리스트는 현재 구조를 가리키도록 갱신하거나 history 문서로 표시한다.

완료 조건:

- dead export 0개를 확인한다.
- 문서의 경로와 실행 명령이 현재 monorepo와 일치한다.
- 호환성 코드는 데이터 마이그레이션 근거 없이 삭제하지 않는다.

## 5. 하지 않을 리팩터링

- Plugin과 Web을 하나의 거대한 `SyncManager` 클래스로 합치지 않는다.
- React/Obsidian/NestJS를 감추는 범용 interface, factory, repository 계층을 만들지 않는다.
- Hocuspocus provider나 IndexedDB 생명주기를 서버용 core에 넣지 않는다.
- Axios client와 Obsidian `requestUrl` client를 억지로 통합하지 않는다.
- 기능당 Nest module 또는 service를 기계적으로 늘리지 않는다.
- Canvas CRDT 문서 구조와 UI 파일 분리를 한 커밋에서 동시에 바꾸지 않는다.
- shadcn 생성 컴포넌트는 실제 버그가 없는 한 자체 스타일로 다시 쓰지 않는다.
- 내부 타입에 반복적인 `typeof`/record 검증을 추가하지 않는다. 검증은 HTTP, JSON Canvas, IndexedDB 구버전 데이터 같은 외부 경계에만 둔다.

## 6. 커밋 및 검증 단위

각 Step은 별도 PR 또는 되돌릴 수 있는 커밋 묶음으로 진행한다.

1. characterization tests만 추가
2. `sync-core` 추출과 import 교체
3. Plugin 파일 분리
4. Web 동기화/Workspace 분리
5. Canvas/preview 분리
6. API 경계와 저위험 cleanup

공통 검증 명령:

```bash
pnpm --filter obsync-plugin check
pnpm --filter obsync-plugin test
pnpm --filter web check
pnpm --filter web test
pnpm --filter api check
pnpm --filter api test
pnpm -r --if-present run build
```

2026-07-21 리팩터링 후 결과(Node 24.18.0): check 4개 workspace 통과, Sync Core 7개·API 38개·Plugin 22개·Web 34개 테스트 통과, API/Plugin/Web build 통과. 기본 셸의 Node 20에서는 `node:sqlite`가 없어 pnpm 11 자체가 실행되지 않으므로, 검증 환경은 저장소의 `node >=22.12.0` 조건을 반드시 만족해야 한다.

수동 회귀 매트릭스:

| 시나리오 | Plugin A | Plugin B | Web | 기대 결과 |
| --- | --- | --- | --- | --- |
| Markdown 동시 입력 | online | online | online | 내용·cursor 수렴 |
| 한 기기 오프라인 rename | offline | online | online | 재접속 후 rebase 또는 충돌 사본 1개 |
| 폴더 rename 중 하위 파일 편집 | online | online | online | stable file id 유지, 경로 일괄 변경 |
| 원격 delete 중 로컬 미전송 편집 | offline | online | online | 로컬 변경 보존 사본 생성 |
| attachment 교체 | online | online | online | metadata/version 및 다운로드 일치 |
| Viewer 접속 | read-only | - | read-only | 로컬 작업 큐 생성 없음 |
| Canvas 한글 입력·edge 연결 | online | online | online | 조합 분리 없음, node/edge 수렴 |

## 7. 복잡도 감사 요약

아래는 삭제 또는 축소 효과가 명확한 항목만 우선순위대로 정리한 것이다.

1. `[shrink]` `apps/plugin/src/sync.ts`, `apps/web/src/features/documents/lib/sync.ts` — 중복 outbox/rebase/projection을 `sync-core`의 순수 상태 전이로 교체한다.
2. `[shrink]` `apps/web/src/features/canvas/components/CanvasEditor.tsx` — 좌표·edge 계산과 렌더링을 분리하되 새 상태 관리 라이브러리는 추가하지 않는다.
3. `[shrink]` `apps/web/src/features/workspace/components/Workspace.tsx` — 세션/route 조정만 남기고 sidebar/content 렌더링을 이동한다.
4. `[delete]` Plugin/Web의 `conflictPath`, `isWithin`, `moveWithin`, `operationRequest`, `activePaths`, `replaceText`, presence palette 중복 구현을 공통 구현으로 대체한다.
5. `[shrink]` `apps/api/src/collaboration/vault-files.service.ts` — transaction을 쪼개기보다 path/version helper만 분리해 서비스 흐름을 읽기 쉽게 만든다.
6. `[delete]` `AttachmentsService`의 사용되지 않는 `ownerId` private helper 인자와 Web의 반복 오류 메시지 함수를 제거한다.
7. `[yagni]` 범용 HTTP client, repository, event bus, sync interface 계층은 추가하지 않는다. 현재는 실제 소비자가 둘뿐이며 플랫폼 차이가 분명하다.

실제 변화: 제품 코드 +307 LOC, 외부 dependency +0. `sync.ts`는 Plugin 1,090→799줄, Web 573→342줄, `CanvasEditor.tsx`는 969→58줄 coordinator, `live-preview.ts`는 444→65줄 orchestration으로 축소됐다. 가장 큰 효과는 오프라인 충돌 규칙의 단일화와 회귀 테스트 공유다.

## 8. 완료 정의

리팩터링 완료는 단순히 파일이 짧아진 상태가 아니다.

- 동일한 파일 작업 fixture가 API/Plugin/Web 경계에서 같은 결과를 낸다.
- 오프라인 작업 큐의 상태 전이가 한 구현에만 존재한다.
- Plugin/Web에는 플랫폼 I/O와 생명주기만 남는다.
- 핵심 coordinator 파일이 변경 이유 하나를 설명할 수 있는 크기로 줄어든다.
- 자동 테스트와 3-client 수동 회귀 매트릭스가 모두 통과한다.
- 새 추상화나 dependency가 중복 제거량보다 더 많은 코드를 만들지 않는다.
