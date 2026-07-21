# 운영 가이드

이 문서는 단일 NestJS 배포를 기준으로 한다. API와 `/collaboration` WebSocket을 분리 배포하지 않는다.

## 배포 전 환경변수

- `NODE_ENV=production`
- 충분히 긴 `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- TLS가 적용된 `WEB_URL`
- 운영 PostgreSQL `DATABASE_URL`
- S3 내부 접속용 `S3_ENDPOINT`
- 모든 클라이언트가 접근 가능한 `S3_PUBLIC_ENDPOINT`
- `S3_REGION`, `S3_BUCKET`, 접근 키와 path-style 설정

secret과 `.env`는 image 또는 저장소에 넣지 않는다.

## Reverse proxy

한 origin 아래에서 다음 경로를 API로 전달한다.

- `/api/*`: 일반 HTTP
- `/collaboration`: WebSocket upgrade 포함

proxy의 WebSocket idle timeout은 장시간 편집 연결보다 길게 둔다. TLS 종료 후에는 `X-Forwarded-For`, `X-Forwarded-Proto`, request ID를 보존한다.

## 배포 순서

```bash
pnpm install --frozen-lockfile
pnpm --filter api prisma:generate
pnpm --filter api build
pnpm --filter api prisma:migrate:deploy
pnpm --filter api start:prod
```

배포 뒤 `/api/health`, `/api/ready`를 차례로 확인하고 Markdown WebSocket 연결과 첨부파일 업로드·다운로드를 smoke test한다.

## 백업과 복구

PostgreSQL과 S3 bucket을 같은 복구 시점으로 보관한다. DB에는 Yjs snapshot과 첨부파일 metadata가, S3에는 binary가 있으므로 둘 중 하나만 복구하면 Vault가 불완전해진다.

복구 훈련에서는 새 PostgreSQL과 새 bucket에 백업을 복원한 뒤 다음을 확인한다.

1. 로그인과 Vault 목록 조회
2. 기존 Markdown 및 Canvas 복원
3. 기존 첨부파일 다운로드
4. 새 편집과 새 첨부파일 업로드

## 롤백

스키마 migration과 호환되는 직전 application image를 유지한다. 롤백 전 WebSocket 신규 연결을 차단하고 프로세스를 정상 종료해 pending Yjs snapshot을 flush한다. destructive migration은 별도 검토와 백업 복구 검증 없이 배포하지 않는다.
