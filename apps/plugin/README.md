# Obsync Obsidian plugin

Obsidian Markdown 편집기를 Yjs + Hocuspocus에 연결하고, 로컬 IndexedDB를 이용해 오프라인 편집을 보관합니다. 첨부파일은 형식과 관계없이 Yjs 문서가 아니라 백엔드의 S3 호환 스토리지로 동기화합니다.

## 빌드

```bash
pnpm --filter obsync-plugin build
```

빌드 산출물은 먼저 `dist/main.js`에 생성된 뒤 배포용 `main.js`로 복사됩니다. 플러그인 루트의 `main.js`, `manifest.json`, `styles.css`를 Vault의 다음 경로에 둡니다.

```text
.obsidian/plugins/obsync/
```

Obsidian 커뮤니티 플러그인 설정에서 **Obsync**를 활성화한 다음 API URL, 계정, 동기화할 Vault를 선택합니다. 로컬 개발 기본 API 주소는 `http://localhost:3000`이며 WebSocket 주소는 자동으로 `/collaboration`으로 변환됩니다.

## BRAT 설치

BRAT의 **Add Beta Plugin**에 다음 저장소를 입력합니다.

```text
https://github.com/noeulnight/obsync
```

버전 태그가 push되면 GitHub Actions가 BRAT에 필요한 `main.js`, `manifest.json`, `styles.css`를 Release에 첨부합니다. 태그는 `manifest.json`의 버전과 같아야 합니다.

## 동기화 범위

- Markdown: 문자 단위 CRDT, 실시간 커서, IndexedDB 오프라인 큐
- Canvas: node·edge ID 및 속성 단위 CRDT, IndexedDB 오프라인 큐
- Vault 구조: 빈 폴더와 파일의 생성, 이동, 이름 변경, 삭제
- 첨부파일: Markdown을 제외한 모든 파일 형식 (파일당 최대 100 MiB)
- 계정 하나에서 여러 원격 Vault 선택 가능
- 커서 표시 이름은 서버의 전역 계정 표시 이름만 사용

첨부파일 충돌은 CRDT 병합 대상이 아닙니다. 같은 파일의 동시 교체는 최신 서버 버전에 재적용되어 마지막으로 완료된 업로드가 반영되고, 같은 경로의 동시 생성은 충돌 사본으로 보존됩니다.
