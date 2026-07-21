import { registerAs } from '@nestjs/config';

export const mcpConfig = registerAs('mcp', () => ({
  publicUrl: process.env.MCP_PUBLIC_URL ?? 'http://localhost:3000/mcp',
}));
