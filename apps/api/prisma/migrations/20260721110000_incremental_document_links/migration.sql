ALTER TABLE "vault_files" ADD COLUMN "links_indexed_at" TIMESTAMP(3);

CREATE TABLE "vault_file_links" (
    "id" UUID NOT NULL,
    "vault_id" UUID NOT NULL,
    "source_file_id" UUID NOT NULL,
    "target_file_id" UUID,
    "raw_target" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vault_file_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vault_file_links_source_file_id_raw_target_key"
ON "vault_file_links"("source_file_id", "raw_target");
CREATE INDEX "vault_file_links_vault_id_idx" ON "vault_file_links"("vault_id");
CREATE INDEX "vault_file_links_target_file_id_idx" ON "vault_file_links"("target_file_id");

ALTER TABLE "vault_file_links" ADD CONSTRAINT "vault_file_links_vault_id_fkey"
FOREIGN KEY ("vault_id") REFERENCES "vaults"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vault_file_links" ADD CONSTRAINT "vault_file_links_source_file_id_fkey"
FOREIGN KEY ("source_file_id") REFERENCES "vault_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vault_file_links" ADD CONSTRAINT "vault_file_links_target_file_id_fkey"
FOREIGN KEY ("target_file_id") REFERENCES "vault_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
