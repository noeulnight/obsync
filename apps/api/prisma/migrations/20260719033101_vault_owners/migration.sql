/*
  Warnings:

  - Added the required column `owner_id` to the `vaults` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "vaults" ADD COLUMN     "owner_id" UUID NOT NULL;

-- CreateIndex
CREATE INDEX "vaults_owner_id_idx" ON "vaults"("owner_id");

-- AddForeignKey
ALTER TABLE "vaults" ADD CONSTRAINT "vaults_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
