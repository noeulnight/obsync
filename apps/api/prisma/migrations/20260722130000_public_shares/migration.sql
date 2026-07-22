CREATE TABLE "public_shares" (
    "id" UUID NOT NULL,
    "vault_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_shares_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "public_shares_file_id_key" ON "public_shares"("file_id");
CREATE UNIQUE INDEX "public_shares_slug_key" ON "public_shares"("slug");
CREATE INDEX "public_shares_vault_id_idx" ON "public_shares"("vault_id");

ALTER TABLE "public_shares" ADD CONSTRAINT "public_shares_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "vaults"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public_shares" ADD CONSTRAINT "public_shares_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "vault_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
