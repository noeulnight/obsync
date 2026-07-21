-- AlterTable
ALTER TABLE "vaults" ADD COLUMN "files_migrated_at" TIMESTAMP(3);

-- CreateEnum
CREATE TYPE "VaultFileKind" AS ENUM ('MARKDOWN', 'ATTACHMENT', 'FOLDER', 'CANVAS');

-- CreateTable
CREATE TABLE "vault_files" (
    "id" UUID NOT NULL,
    "vault_id" UUID NOT NULL,
    "kind" "VaultFileKind" NOT NULL,
    "path" TEXT NOT NULL,
    "active_path_key" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "attachment_id" UUID,
    "mime_type" TEXT,
    "sha256" TEXT,
    "size" BIGINT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vault_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_file_versions" (
    "id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "state" BYTEA,
    "attachment_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_file_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_file_operations" (
    "id" UUID NOT NULL,
    "vault_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_file_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vault_files_vault_id_active_path_key_key" ON "vault_files"("vault_id", "active_path_key");
CREATE INDEX "vault_files_vault_id_deleted_at_idx" ON "vault_files"("vault_id", "deleted_at");
CREATE UNIQUE INDEX "vault_file_versions_file_id_version_key" ON "vault_file_versions"("file_id", "version");
CREATE INDEX "vault_file_versions_file_id_created_at_idx" ON "vault_file_versions"("file_id", "created_at");
CREATE INDEX "vault_file_operations_vault_id_created_at_idx" ON "vault_file_operations"("vault_id", "created_at");

-- AddForeignKey
ALTER TABLE "vault_files" ADD CONSTRAINT "vault_files_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "vaults"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vault_files" ADD CONSTRAINT "vault_files_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vault_file_versions" ADD CONSTRAINT "vault_file_versions_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "vault_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vault_file_versions" ADD CONSTRAINT "vault_file_versions_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vault_file_versions" ADD CONSTRAINT "vault_file_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vault_file_operations" ADD CONSTRAINT "vault_file_operations_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "vaults"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vault_file_operations" ADD CONSTRAINT "vault_file_operations_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "vault_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
