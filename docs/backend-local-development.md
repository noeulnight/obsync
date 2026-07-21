# 백엔드 로컬 개발

## 의존 서비스

```bash
docker compose up -d postgres minio
docker compose run --rm minio-init
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate:deploy
```

기본 PostgreSQL 연결은 `postgresql://obsync:obsync@localhost:5432/obsync?schema=public`이다. 다른 PostgreSQL을 사용하면 `DATABASE_URL`을 설정한다.

로컬 MinIO API는 `http://localhost:9000`, console은 `http://localhost:9001`이다.

## S3 endpoint 구분

API 서버가 object metadata를 확인할 때는 `S3_ENDPOINT`를 사용하고, 브라우저와 다른 Obsidian 장치에 presigned URL을 발급할 때는 `S3_PUBLIC_ENDPOINT`를 사용한다.

```bash
S3_ENDPOINT=http://localhost:9000
S3_PUBLIC_ENDPOINT=http://100.64.1.1:9000
S3_REGION=us-east-1
S3_BUCKET=obsync
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
```

`100.64.1.1`은 현재 개발 Mac에 접근 가능한 주소다. 네트워크가 바뀌면 각 클라이언트에서 실제로 열리는 호스트명 또는 IP로 교체한다. E2E 테스트는 외부 DNS에 의존하지 않도록 `http://localhost:9000`을 강제한다.

## 실행

```bash
pnpm --filter api start:dev
```

프로덕션 엔트리포인트 확인:

```bash
pnpm --filter api build
pnpm --filter api start:prod
```

API는 기본 `http://localhost:3000`, WebSocket은 같은 서버의 `ws://localhost:3000/collaboration`을 사용한다.
