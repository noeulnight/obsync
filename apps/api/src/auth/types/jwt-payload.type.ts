export type JwtPayload = {
  sub: string;
  type: 'access' | 'refresh';
  sid?: string;
};
