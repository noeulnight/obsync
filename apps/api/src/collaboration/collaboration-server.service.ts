import {
  BeforeApplicationShutdown,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Hocuspocus } from '@hocuspocus/server';
import type { VaultFile } from '@prisma/client';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import * as Y from 'yjs';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { PrismaService } from '../database/prisma.service';
import { VaultAccessService } from '../vaults/vault-access.service';
import type { CollaborationContext } from './types/collaboration-context.type';
import { parseCollaborationRoom } from './types/collaboration-room.type';
import type { ManifestEntry } from './types/manifest.type';

const collaborationPath = '/collaboration';

@Injectable()
export class CollaborationServerService
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new Logger(CollaborationServerService.name);
  private readonly hocuspocus: Hocuspocus<CollaborationContext>;
  private readonly websocketServer = new WebSocketServer({ noServer: true });
  private readonly pendingStores = new Set<Promise<void>>();
  private server?: Server;

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly access: VaultAccessService,
  ) {
    this.hocuspocus = new Hocuspocus<CollaborationContext>({
      quiet: true,
      debounce: 250,
      maxDebounce: 1_000,
      onAuthenticate: ({ documentName, token, connectionConfig }) =>
        this.authenticate(documentName, token, connectionConfig),
      onLoadDocument: ({ documentName }) => this.load(documentName),
      onStoreDocument: ({ documentName, document }) =>
        this.trackStore(documentName, document),
    });
  }

  onApplicationBootstrap() {
    const server = this.httpAdapterHost.httpAdapter.getHttpServer() as Server;
    this.server = server;
    server.on('upgrade', this.handleUpgrade);
  }

  async beforeApplicationShutdown() {
    this.server?.off('upgrade', this.handleUpgrade);
    this.hocuspocus.closeConnections();
    this.websocketServer.clients.forEach((client) => client.terminate());
    this.hocuspocus.flushPendingStores();
    await Promise.allSettled([...this.pendingStores]);
    this.websocketServer.close();
  }

  private readonly handleUpgrade = (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => {
    const url = this.toUrl(request);
    if (url.pathname !== collaborationPath) {
      socket.destroy();
      return;
    }

    this.websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      this.handleConnection(websocket, request);
    });
  };

  private handleConnection(websocket: WebSocket, request: IncomingMessage) {
    const connection = this.hocuspocus.handleConnection(
      websocket,
      this.toRequest(request),
      {},
    );

    websocket.on('message', (message) => {
      connection.handleMessage(this.toBytes(message));
    });
    websocket.on('close', () => connection.handleClose());
    websocket.on('error', (error) => {
      this.logger.error('Collaboration WebSocket error', error);
    });
  }

  private async authenticate(
    roomName: string,
    token: string,
    connectionConfig: { readOnly: boolean },
  ): Promise<CollaborationContext> {
    const room = parseCollaborationRoom(roomName);
    if (!room) throw new UnauthorizedException();

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('auth.jwt.accessSecret'),
      });
      if (payload.type !== 'access') {
        throw new UnauthorizedException();
      }
      const role = await this.access.requireRead(payload.sub, room.vaultId);
      connectionConfig.readOnly = room.kind === 'manifest' || role === 'VIEWER';
      return { userId: payload.sub, vaultId: room.vaultId, role };
    } catch {
      throw new UnauthorizedException();
    }
  }

  private async load(roomName: string): Promise<Uint8Array | Y.Doc> {
    const room = parseCollaborationRoom(roomName);
    if (room?.kind === 'manifest') {
      return this.manifestDocument(room.vaultId);
    }
    const record = await this.prisma.yDocument.findUnique({
      where: { roomName },
      select: { state: true },
    });
    return record?.state ?? new Y.Doc();
  }

  private async persist(roomName: string, document: Y.Doc): Promise<void> {
    await this.store(roomName, Y.encodeStateAsUpdate(document));
  }

  async publishFiles(vaultId: string, files: VaultFile[]): Promise<void> {
    const connection = await this.hocuspocus.openDirectConnection(
      `vault:${vaultId}:manifest`,
      { vaultId, userId: 'server', role: 'OWNER' },
    );
    await connection.transact((document) => {
      const manifest = document.getMap<ManifestEntry>('files');
      for (const file of files) manifest.set(file.id, manifestEntry(file));
    });
    await connection.disconnect({ unloadImmediately: false });
  }

  private async manifestDocument(vaultId: string): Promise<Y.Doc> {
    const files = await this.prisma.vaultFile.findMany({
      where: { vaultId },
      orderBy: { createdAt: 'asc' },
    });
    const document = new Y.Doc();
    const manifest = document.getMap<ManifestEntry>('files');
    for (const file of files) manifest.set(file.id, manifestEntry(file));
    return document;
  }

  private trackStore(roomName: string, document: Y.Doc): Promise<void> {
    const pending = this.persist(roomName, document);
    this.pendingStores.add(pending);
    void pending.then(
      () => this.pendingStores.delete(pending),
      () => this.pendingStores.delete(pending),
    );
    return pending;
  }

  private async store(roomName: string, state: Uint8Array): Promise<void> {
    const room = parseCollaborationRoom(roomName);
    if (!room) throw new Error('Invalid collaboration room');

    const storedState = Uint8Array.from(state);
    await this.prisma.yDocument.upsert({
      where: { roomName },
      create: { roomName, vaultId: room.vaultId, state: storedState },
      update: { state: storedState },
    });
  }

  private toRequest(request: IncomingMessage) {
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) {
        value.forEach((item) => headers.append(name, item));
      } else if (value !== undefined) {
        headers.set(name, value);
      }
    }

    return new Request(this.toUrl(request), { headers });
  }

  private toUrl(request: IncomingMessage) {
    return new URL(
      request.url ?? '/',
      `http://${request.headers.host ?? 'localhost'}`,
    );
  }

  private toBytes(message: RawData) {
    if (Array.isArray(message)) {
      return new Uint8Array(Buffer.concat(message));
    }
    if (message instanceof ArrayBuffer) {
      return new Uint8Array(message);
    }
    return new Uint8Array(
      message.buffer,
      message.byteOffset,
      message.byteLength,
    );
  }
}

function manifestEntry(file: VaultFile): ManifestEntry {
  return {
    id: file.id,
    kind: file.kind.toLowerCase(),
    path: file.path,
    deleted: file.deletedAt !== null,
    version: file.version,
    updatedAt: file.updatedAt.getTime(),
    ...(file.attachmentId ? { attachmentId: file.attachmentId } : {}),
    ...(file.mimeType ? { mimeType: file.mimeType } : {}),
    ...(file.sha256 ? { sha256: file.sha256 } : {}),
    ...(file.size !== null ? { size: Number(file.size) } : {}),
  };
}
