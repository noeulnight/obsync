-- AlterTable
ALTER TABLE "users" ADD COLUMN "display_name" TEXT;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "user_agent" TEXT;
