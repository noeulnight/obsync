-- CreateTable
CREATE TABLE "vaults" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vaults_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "y_documents" (
    "room_name" TEXT NOT NULL,
    "vault_id" UUID NOT NULL,
    "state" BYTEA NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "y_documents_pkey" PRIMARY KEY ("room_name")
);

-- CreateIndex
CREATE INDEX "y_documents_vault_id_idx" ON "y_documents"("vault_id");

-- AddForeignKey
ALTER TABLE "y_documents" ADD CONSTRAINT "y_documents_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "vaults"("id") ON DELETE CASCADE ON UPDATE CASCADE;
