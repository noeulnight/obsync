-- CreateEnum
CREATE TYPE "VaultRole" AS ENUM ('EDITOR', 'VIEWER');

-- CreateTable
CREATE TABLE "vault_members" (
    "id" UUID NOT NULL,
    "vault_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "VaultRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_invitations" (
    "id" UUID NOT NULL,
    "vault_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "VaultRole" NOT NULL,
    "invited_by_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vault_members_user_id_idx" ON "vault_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "vault_members_vault_id_user_id_key" ON "vault_members"("vault_id", "user_id");

-- CreateIndex
CREATE INDEX "vault_invitations_email_expires_at_idx" ON "vault_invitations"("email", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "vault_invitations_vault_id_email_key" ON "vault_invitations"("vault_id", "email");

-- AddForeignKey
ALTER TABLE "vault_members" ADD CONSTRAINT "vault_members_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "vaults"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_members" ADD CONSTRAINT "vault_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_invitations" ADD CONSTRAINT "vault_invitations_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "vaults"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_invitations" ADD CONSTRAINT "vault_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
