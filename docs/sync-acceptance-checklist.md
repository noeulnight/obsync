# 동기화 인수 체크리스트

대상은 Web, 첫 번째 Obsidian Vault, 두 번째 Obsidian Vault, 원격 `company` Obsidian이다. 각 클라이언트는 같은 계정과 같은 원격 Vault를 선택한다.

## 사전 확인

- [x] `/api/ready`가 `200`이다.
- [x] 모든 클라이언트에서 `S3_PUBLIC_ENDPOINT`에 접근할 수 있다.
- [x] 세 Obsidian 설치의 `main.js`, `manifest.json`, `styles.css`가 같은 빌드다.
- [x] 계정 표시 이름이 Web과 Obsidian에서 동일하다.

## Markdown과 presence

- [x] Web에서 입력한 한 글자가 두 Obsidian에 즉시 보인다.
- [x] Obsidian에서 입력한 한 글자가 Web과 다른 Obsidian에 즉시 보인다.
- [x] 동시에 같은 위치를 편집한 뒤 세 클라이언트 본문이 수렴한다.
- [x] 원격 커서, 선택 범위, 표시 이름과 색상이 보인다.
- [x] 포커스를 잃거나 문서를 닫으면 stale 커서가 제거된다.

## 초대와 권한

- [x] Owner가 이메일로 editor와 viewer를 초대할 수 있다.
- [x] 초대받은 계정에서 수락하면 Vault 목록에 나타난다.
- [x] Editor가 Markdown, Canvas, 첨부파일을 수정할 수 있다.
- [x] Viewer는 Web과 Obsidian에서 문서를 읽을 수 있지만 서버 상태를 수정할 수 없다.
- [x] Owner가 역할을 변경하거나 멤버를 내보내면 재접속 후 즉시 적용된다.

## 오프라인

- [x] 한 클라이언트를 오프라인으로 전환하고 Markdown을 수정한다.
- [x] 다른 클라이언트에서 같은 문서를 수정한다.
- [x] 재연결 뒤 두 변경이 유실 없이 병합된다.
- [x] 클라이언트와 서버를 재시작해도 내용이 복원된다.

## Vault 구조

- [x] Web에서 폴더, Markdown, Canvas를 만들면 Obsidian에 생성된다.
- [x] 폴더 이름 변경 시 모든 하위 경로가 함께 이동한다.
- [x] 빈 폴더가 동기화된다.
- [x] 파일과 폴더 삭제가 모든 클라이언트에 반영된다.

## 첨부파일

- [x] 이미지, PDF, DOCX 및 임의 확장자 파일을 업로드할 수 있다.
- [x] 이미지 링크가 Web 편집기에 inline preview로 표시된다.
- [x] 다른 장치에서 첨부파일을 열 수 있다.
- [x] 같은 경로 재시도 시 중복 object가 생기지 않는다.
- [x] 삭제 뒤 현재 파일은 tombstone 처리되고 과거 버전이 참조하는 첨부 원본은 복원을 위해 유지된다.

## Canvas

- [x] Web과 Obsidian에서 node 생성, 이동, 크기, 삭제가 즉시 반영된다.
- [x] text node의 문자 단위 동시 편집이 수렴한다.
- [x] edge 생성과 삭제가 즉시 반영된다.
- [x] node z-order가 동기화된다.
- [x] 원격 마우스 위치와 focus node가 표시된다.
- [x] Canvas 안의 Markdown file node가 같은 실시간 문서 내용을 표시한다.

## 2026-07-20 Computer Use 실행 결과

- Web `Hello/folder/Test`에서 입력한 `WEB-LIVE-2140`이 첫 번째 Obsidian에 즉시 반영됐다.
- 첫 번째 Obsidian에서 입력한 `OBS-LIVE-2141`이 Web에 즉시 반영됐다.
- 양쪽에서 상대 표시 이름과 커서 장식이 보였으며 테스트 문자열은 검증 뒤 삭제했다.
- 사용자 확인 뒤 두 번째 Obsidian의 로컬 내용을 삭제하고 `Hello` Vault를 서버 기준으로 초기화했다. `.obsidian`은 유지됐고 `Hi.md`, `Work.md`, `folder/Test.md`가 내려왔다.
- 첫 번째와 두 번째 Obsidian을 새 빌드로 다시 로드한 뒤 `ABC123` 입력과 전체 삭제가 양쪽에 즉시 수렴했다. 테스트 문자열은 검증 뒤 삭제했다.
- 초기화 과정에서 Obsidian 파일 트리에 나타나지 않는 `.trash`가 남는 문제를 발견했다. 초기화가 루트 adapter 목록의 숨김 파일과 폴더도 `.obsidian`만 제외하고 제거하도록 수정했으며, 기존 `.trash`는 macOS 휴지통으로 옮겼다.
- 별도 테스트 계정을 생성해 Owner 초대, 수락, Editor 실시간 Markdown/Canvas 수정, Viewer 쓰기 차단, 역할 변경, 멤버 제거와 WebSocket 재인증을 실제 서버에서 확인했다. Viewer의 로컬 변경은 서버 문서에 반영되지 않았고 제거 후 REST는 `404`, WebSocket은 인증 실패로 종료됐다.
- 한 클라이언트를 끊은 상태에서 `|OFFLINE|`, 연결된 클라이언트에서 `|ONLINE|`을 같은 문서에 입력했다. 재연결 후 양쪽과 서버가 `EDITOR-LIVE|ONLINE||OFFLINE|`으로 수렴했다.
- DOCX MIME의 임의 경로 첨부파일을 MinIO에 업로드한 뒤 `S3_PUBLIC_ENDPOINT=http://100.64.1.1:9000`의 서명 URL을 원격 `company`에서 내려받았다. 로컬과 원격 SHA-256이 일치했고, 같은 idempotency key 재시도는 같은 attachment를 반환했으며 삭제 후 다운로드는 `404`였다.
- 중첩 원격 경로 생성 시 부모 폴더 이벤트가 중복되는 문제를 발견해 폴더 생성을 직렬화하고 적용 중 경로를 함께 억제했다. `regression/deep/Child.md`로 재검증했으며 충돌 폴더가 생기지 않았다.
- 삭제된 Canvas가 재시작 뒤 오래된 로컬 manifest 캐시에서 되살아나는 문제를 발견했다. manifest를 서버 권위 데이터로만 로드하도록 바꿨고, 두 Obsidian을 재시작한 뒤에도 `PermissionAcceptance.canvas`가 재생성되지 않음을 확인했다. 오프라인 구조 변경은 별도 operation queue에 계속 보존된다.
- 검증용 계정과 서버 파일은 삭제했고, 로컬 검증 파일은 macOS 휴지통으로 옮겼다.
- Web에서 `QA-20260720` 폴더, Markdown, Canvas를 만들고 `QA-Renamed-20260720`으로 이름을 바꿨다. 두 Obsidian에서 빈 폴더와 모든 하위 경로가 동일하게 생성·이동됐으며, 상위 폴더 삭제 뒤 두 로컬 Vault에서도 내부 항목까지 모두 제거됐다.
- 세 독립 WebSocket 클라이언트가 같은 위치에 동시에 문자를 삽입한 뒤 동일 본문으로 수렴했다. 선택 범위, 표시 이름, 색상 awareness가 전달되고 세 번째 클라이언트 종료 뒤 stale presence가 제거되는 E2E 회귀 테스트를 추가했다.
- Web Canvas에서 node 생성·이동·크기·삭제, 문자 단위 동시 편집, edge 생성·삭제, z-order, 원격 마우스와 focus 표시를 실제 UI와 두 Obsidian 파일에서 확인했다. Markdown file node는 원본 문서 변경을 즉시 표시했다.
- Canvas edge의 투명 hit line이 상위 SVG의 pointer-events 차단 때문에 클릭되지 않는 문제를 수정하고, Web에서 생성한 edge와 원격 생성 edge가 모두 실제 클릭으로 삭제됨을 확인했다.
- 임의 SVG 첨부파일을 Web에서 업로드하고 `![[...]]` 이미지 링크가 편집기에 inline preview로 표시됨을 확인했다. Obsidian 인덱스가 숨김 경로를 반환하지 않아 삭제가 남는 문제를 발견해 저장소 adapter 기반 rename/trash fallback을 추가했고, 두 Obsidian 재로드 뒤 숨김 파일까지 제거됨을 확인했다.
- 첨부파일 삭제 시 현재 파일 manifest는 tombstone 처리된다. 과거 버전이 참조하는 첨부 metadata와 object는 버전 복원을 위해 유지되는 것이 정상 정책임을 DB에서 교차 확인했다.
