# Obsync API

계정, 여러 Vault, Device Auth, Yjs collaboration 및 S3-compatible 첨부파일을 제공하는 NestJS 애플리케이션이다. HTTP와 Hocuspocus WebSocket은 같은 서버를 사용한다.

## 실행

저장소 루트에서 PostgreSQL과 MinIO를 먼저 실행한다.

```bash
docker compose up -d postgres minio
docker compose run --rm minio-init
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate:deploy
pnpm --filter api start:dev
```

프로덕션 빌드 확인:

```bash
pnpm --filter api build
pnpm --filter api start:prod
```

## 검증

```bash
pnpm --filter api prisma:generate
pnpm --filter api build
pnpm --filter api lint
pnpm --filter api test --runInBand
pnpm --filter api test:e2e --runInBand
```

환경변수와 외부 장치 접속 방법은 [백엔드 로컬 개발](../../docs/backend-local-development.md), 배포 전 확인 사항은 [운영 가이드](../../docs/operations.md)를 참고한다.
