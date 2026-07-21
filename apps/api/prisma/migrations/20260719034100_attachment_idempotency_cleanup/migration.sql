-- AlterTable
ALTER TABLE "attachments" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "idempotency_key" UUID NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "attachments_vault_id_idempotency_key_key" ON "attachments"("vault_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_vault_id_path_sha256_key" ON "attachments"("vault_id", "path", "sha256");
