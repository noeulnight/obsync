export class McpConfigurationResponseDto {
  url!: string;
  scopes!: string[];
}

export class ConnectedMcpAppResponseDto {
  clientId!: string;
  name!: string;
  scopes!: string[];
  connectedAt!: Date;
}

export class McpAuthorizationResponseDto {
  clientName!: string;
  scopes!: string[];
}

export class McpAuthorizationRedirectResponseDto {
  redirectUrl!: string;
}
