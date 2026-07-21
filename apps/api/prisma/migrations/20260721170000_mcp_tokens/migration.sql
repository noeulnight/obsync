CREATE TABLE "mcp_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_prefix" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mcp_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mcp_tokens_token_hash_key" ON "mcp_tokens"("token_hash");
CREATE INDEX "mcp_tokens_user_id_idx" ON "mcp_tokens"("user_id");

ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
