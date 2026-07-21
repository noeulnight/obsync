DROP TABLE "mcp_tokens";

CREATE TABLE "mcp_oauth_clients" (
    "id" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mcp_oauth_clients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mcp_oauth_authorizations" (
    "id" UUID NOT NULL,
    "client_id" TEXT NOT NULL,
    "user_id" UUID,
    "redirect_uri" TEXT NOT NULL,
    "code_challenge" TEXT NOT NULL,
    "code_hash" TEXT,
    "state" TEXT,
    "resource" TEXT NOT NULL,
    "scopes" TEXT[],
    "expires_at" TIMESTAMP(3) NOT NULL,
    "approved_at" TIMESTAMP(3),
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mcp_oauth_authorizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mcp_oauth_refresh_tokens" (
    "id" UUID NOT NULL,
    "client_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "scopes" TEXT[],
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mcp_oauth_refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mcp_oauth_authorizations_code_hash_key" ON "mcp_oauth_authorizations"("code_hash");
CREATE INDEX "mcp_oauth_authorizations_client_id_idx" ON "mcp_oauth_authorizations"("client_id");
CREATE INDEX "mcp_oauth_authorizations_user_id_idx" ON "mcp_oauth_authorizations"("user_id");
CREATE INDEX "mcp_oauth_authorizations_expires_at_idx" ON "mcp_oauth_authorizations"("expires_at");
CREATE UNIQUE INDEX "mcp_oauth_refresh_tokens_token_hash_key" ON "mcp_oauth_refresh_tokens"("token_hash");
CREATE INDEX "mcp_oauth_refresh_tokens_client_id_idx" ON "mcp_oauth_refresh_tokens"("client_id");
CREATE INDEX "mcp_oauth_refresh_tokens_user_id_idx" ON "mcp_oauth_refresh_tokens"("user_id");
CREATE INDEX "mcp_oauth_refresh_tokens_expires_at_idx" ON "mcp_oauth_refresh_tokens"("expires_at");

ALTER TABLE "mcp_oauth_authorizations" ADD CONSTRAINT "mcp_oauth_authorizations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "mcp_oauth_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mcp_oauth_authorizations" ADD CONSTRAINT "mcp_oauth_authorizations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mcp_oauth_refresh_tokens" ADD CONSTRAINT "mcp_oauth_refresh_tokens_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "mcp_oauth_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mcp_oauth_refresh_tokens" ADD CONSTRAINT "mcp_oauth_refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
