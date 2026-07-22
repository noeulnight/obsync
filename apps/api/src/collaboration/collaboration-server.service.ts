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
import type { CanvasData, CanvasItem } from './types/canvas-data.type';
import { parseCollaborationRoom } from './types/collaboration-room.type';
import type { ManifestEntry } from './types/manifest.type';
import { nextFileRevision } from './vault-file-version';
import { VaultLinksService } from './vault-links.service';

const collaborationPath = '/collaboration';
const versionCheckpointInterval = 5 * 60 * 1_000;

@Injectable()
export class CollaborationServerService
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new Logger(CollaborationServerService.name);
  private readonly hocuspocus: Hocuspocus<CollaborationContext>;
  private readonly websocketServer = new WebSocketServer({ noServer: true });
  private readonly pendingStores = new Set<Promise<void>>();
  private readonly storeChains = new Map<string, Promise<void>>();
  private server?: Server;

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly access: VaultAccessService,
    private readonly links: VaultLinksService,
  ) {
    this.hocuspocus = new Hocuspocus<CollaborationContext>({
      quiet: true,
      debounce: 250,
      maxDebounce: 1_000,
      onAuthenticate: ({ documentName, token, connectionConfig }) =>
        this.authenticate(documentName, token, connectionConfig),
      onLoadDocument: ({ documentName }) => this.load(documentName),
      onStoreDocument: ({
        documentName,
        document,
        lastContext,
        clientsCount,
      }) =>
        this.trackStore(
          documentName,
          document,
          lastContext.userId ?? 'server',
          clientsCount,
        ),
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

  private async persist(
    roomName: string,
    state: Uint8Array,
    userId: string,
    clientsCount: number,
  ): Promise<void> {
    await this.store(roomName, state, userId, clientsCount);
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
    await connection.disconnect({ unloadImmediately: true });
  }

  async restoreDocument(
    vaultId: string,
    fileId: string,
    state: Uint8Array,
    userId: string,
  ) {
    await this.writeDocument(vaultId, fileId, documentText(state), userId);
  }

  async readDocument(vaultId: string, fileId: string) {
    const roomName = `vault:${vaultId}:doc:${fileId}`;
    const connection = await this.hocuspocus.openDirectConnection(roomName, {
      vaultId,
      userId: 'server',
      role: 'OWNER',
    });
    try {
      let content = '';
      await connection.transact((document) => {
        content = document.getText('content').toJSON();
      });
      return content;
    } finally {
      await connection.disconnect({ unloadImmediately: true });
    }
  }

  async writeDocument(
    vaultId: string,
    fileId: string,
    content: string,
    userId: string,
  ) {
    const roomName = `vault:${vaultId}:doc:${fileId}`;
    const connection = await this.hocuspocus.openDirectConnection(roomName, {
      vaultId,
      userId,
      role: 'OWNER',
    });
    try {
      let currentState = Y.encodeStateAsUpdate(new Y.Doc());
      let changed = false;
      await connection.transact((document) => {
        currentState = Y.encodeStateAsUpdate(document);
        const text = document.getText('content');
        if (text.toJSON() === content) return;
        changed = true;
        replaceSharedText(text, content);
      });
      if (changed) {
        await this.createVersion(vaultId, fileId, currentState, userId, true);
      }
    } finally {
      await connection.disconnect({ unloadImmediately: true });
    }
  }

  async readCanvas(vaultId: string, fileId: string) {
    const connection = await this.hocuspocus.openDirectConnection(
      `vault:${vaultId}:canvas:${fileId}`,
      { vaultId, userId: 'server', role: 'OWNER' },
    );
    try {
      let data: CanvasData = { meta: {}, nodes: [], edges: [] };
      await connection.transact((document) => {
        data = canvasData(document);
      });
      return data;
    } finally {
      await connection.disconnect({ unloadImmediately: true });
    }
  }

  async writeCanvas(
    vaultId: string,
    fileId: string,
    data: CanvasData,
    userId: string,
  ) {
    const connection = await this.hocuspocus.openDirectConnection(
      `vault:${vaultId}:canvas:${fileId}`,
      { vaultId, userId, role: 'OWNER' },
    );
    try {
      await connection.transact((document) => {
        if (JSON.stringify(canvasData(document)) === JSON.stringify(data))
          return;
        syncCanvas(document, data);
      });
    } finally {
      await connection.disconnect({ unloadImmediately: true });
    }
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

  private trackStore(
    roomName: string,
    document: Y.Doc,
    userId: string,
    clientsCount: number,
  ): Promise<void> {
    const state = Y.encodeStateAsUpdate(document);
    const previous = this.storeChains.get(roomName) ?? Promise.resolve();
    const pending = previous
      .catch(() => undefined)
      .then(() => this.persist(roomName, state, userId, clientsCount));
    this.storeChains.set(roomName, pending);
    this.pendingStores.add(pending);
    const cleanup = () => {
      this.pendingStores.delete(pending);
      if (this.storeChains.get(roomName) === pending)
        this.storeChains.delete(roomName);
    };
    void pending.then(cleanup, cleanup);
    return pending;
  }

  private async store(
    roomName: string,
    state: Uint8Array,
    userId: string,
    clientsCount: number,
  ): Promise<void> {
    const room = parseCollaborationRoom(roomName);
    if (!room) throw new Error('Invalid collaboration room');

    const storedState = Uint8Array.from(state);
    await this.prisma.yDocument.upsert({
      where: { roomName },
      create: { roomName, vaultId: room.vaultId, state: storedState },
      update: { state: storedState },
    });
    if (room.kind === 'document') {
      await this.createVersion(
        room.vaultId,
        room.documentId,
        storedState,
        userId,
        clientsCount === 0,
      );
      await this.links.reindex(
        room.vaultId,
        room.documentId,
        documentText(storedState),
      );
    }
  }

  private async createVersion(
    vaultId: string,
    fileId: string,
    state: Uint8Array,
    userId: string,
    force: boolean,
  ) {
    await this.prisma.$transaction(async (transaction) => {
      const file = await transaction.vaultFile.findFirst({
        where: { id: fileId, vaultId, kind: 'MARKDOWN', deletedAt: null },
        select: { id: true, path: true },
      });
      if (!file) return;
      const latest = await transaction.vaultFileVersion.findFirst({
        where: { fileId },
        select: { createdAt: true, state: true },
        orderBy: { version: 'desc' },
      });
      const unchanged =
        latest?.state && Buffer.from(latest.state).equals(Buffer.from(state));
      const recent =
        latest?.state &&
        Date.now() - latest.createdAt.getTime() < versionCheckpointInterval;
      if (unchanged || (!force && recent)) return;
      await transaction.vaultFileVersion.create({
        data: {
          fileId,
          version: await nextFileRevision(transaction, fileId),
          path: file.path,
          state: Uint8Array.from(state),
          createdById: userId === 'server' ? null : userId,
        },
      });
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

function documentText(state: Uint8Array) {
  const document = new Y.Doc();
  Y.applyUpdate(document, state);
  return document.getText('content').toJSON();
}

function canvasData(document: Y.Doc): CanvasData {
  const nodes = document.getMap<Y.Map<unknown>>('nodes');
  const order = document.getMap<number>('node-z-order');
  return {
    meta: document.getMap<unknown>('meta').toJSON(),
    nodes: [...nodes.values()]
      .map((node) => {
        const value = node.toJSON() as CanvasItem;
        return value.type === 'text'
          ? {
              ...value,
              text: document.getText(`canvas-node:${value.id}:text`).toJSON(),
            }
          : value;
      })
      .sort(
        (left, right) =>
          (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(right.id) ?? Number.MAX_SAFE_INTEGER),
      ),
    edges: [...document.getMap<Y.Map<unknown>>('edges').values()].map(
      (edge) => edge.toJSON() as CanvasItem,
    ),
  };
}

function syncCanvas(document: Y.Doc, data: CanvasData) {
  syncMap(document.getMap('meta'), data.meta);
  const nodes = document.getMap<Y.Map<unknown>>('nodes');
  const edges = document.getMap<Y.Map<unknown>>('edges');
  syncItems(nodes, data.nodes, (item) => {
    const { text = '', ...value } = item;
    const sharedText = document.getText(`canvas-node:${item.id}:text`);
    replaceSharedText(sharedText, text);
    return value;
  });
  syncItems(edges, data.edges, (item) => item);
  const order = document.getMap<number>('node-z-order');
  const ids = new Set(data.nodes.map((node) => node.id));
  for (const id of order.keys()) if (!ids.has(id)) order.delete(id);
  data.nodes.forEach((node, index) => order.set(node.id, index));
}

function syncItems(
  target: Y.Map<Y.Map<unknown>>,
  items: CanvasItem[],
  value: (item: CanvasItem) => Record<string, unknown>,
) {
  const wanted = new Set(items.map((item) => item.id));
  for (const id of target.keys()) if (!wanted.has(id)) target.delete(id);
  for (const item of items) {
    let shared = target.get(item.id);
    if (!shared) {
      shared = new Y.Map<unknown>();
      target.set(item.id, shared);
    }
    syncMap(shared, value(item));
  }
}

function syncMap(target: Y.Map<unknown>, value: Record<string, unknown>) {
  for (const key of target.keys()) if (!(key in value)) target.delete(key);
  for (const [key, next] of Object.entries(value)) target.set(key, next);
}

export function replaceSharedText(text: Y.Text, next: string) {
  const previous = text.toJSON();
  if (previous === next) return;
  let prefix = 0;
  while (
    prefix < previous.length &&
    prefix < next.length &&
    previous[prefix] === next[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < previous.length - prefix &&
    suffix < next.length - prefix &&
    previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  text.doc?.transact(() => {
    const removed = previous.length - prefix - suffix;
    if (removed > 0) text.delete(prefix, removed);
    const inserted = next.slice(prefix, next.length - suffix);
    if (inserted) text.insert(prefix, inserted);
  });
}
