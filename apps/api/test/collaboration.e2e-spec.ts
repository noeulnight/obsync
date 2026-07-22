import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { JwtService } from '@nestjs/jwt';
import { App } from 'supertest/types';
import request from 'supertest';
import * as Y from 'yjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { AppValidationPipe } from '../src/http/pipes/app-validation.pipe';

const vaultId = '8f0d6f4e-6c5b-4af7-90c2-61a7aa3bb122';
const documentId = '68bf1227-8707-4a13-921f-bf7258084893';
const userId = '3ccfd17d-414b-47fb-afbc-5f7fe2458139';
const otherUserId = '622841b6-2cd5-462f-8c5c-1065f00ca4d6';
const viewerUserId = '88fdb2ee-1228-4720-b38c-bba19d19a7db';
const otherVaultId = '9f0d6f4e-6c5b-4af7-90c2-61a7aa3bb122';
const manifestRoom = 'manifest';
const documentRoom = `doc:${documentId}`;
const liveDocumentRoom = 'doc:78bf1227-8707-4a13-921f-bf7258084893';
const presenceDocumentRoom = 'doc:88bf1227-8707-4a13-921f-bf7258084893';
const canvasRoom = `canvas:${documentId}`;

describe('Collaboration WebSocket (e2e)', () => {
  let app: INestApplication<App>;
  let websocketUrl: string;
  let prisma: PrismaService;
  let accessToken: string;
  let otherAccessToken: string;
  let viewerAccessToken: string;

  beforeAll(async () => {
    await startApp();
    prisma = app.get(PrismaService);
    await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: 'collaboration-e2e@example.com',
        passwordHash: 'not-used',
      },
      update: {},
    });
    await prisma.user.upsert({
      where: { id: viewerUserId },
      create: {
        id: viewerUserId,
        email: 'collaboration-viewer@example.com',
        passwordHash: 'not-used',
      },
      update: {},
    });
    await prisma.user.upsert({
      where: { id: otherUserId },
      create: {
        id: otherUserId,
        email: 'collaboration-other@example.com',
        passwordHash: 'not-used',
      },
      update: {},
    });
    await prisma.vaultFile.deleteMany({ where: { vaultId } });
    await prisma.yDocument.deleteMany({ where: { vaultId } });
    await prisma.vault.upsert({
      where: { id: vaultId },
      create: { id: vaultId, ownerId: userId, name: 'E2E Vault' },
      update: {},
    });
    await prisma.vaultMember.upsert({
      where: { vaultId_userId: { vaultId, userId: viewerUserId } },
      create: { vaultId, userId: viewerUserId, role: 'VIEWER' },
      update: { role: 'VIEWER' },
    });
    const jwt = app.get(JwtService);
    [accessToken, otherAccessToken, viewerAccessToken] = await Promise.all(
      [userId, otherUserId, viewerUserId].map((sub) =>
        jwt.signAsync(
          { sub, type: 'access' },
          {
            secret: 'dev-access-secret-change-before-production',
            expiresIn: 900,
          },
        ),
      ),
    );
  });

  afterAll(async () => {
    await app.close();
    await prisma.user.deleteMany({
      where: { id: { in: [userId, otherUserId, viewerUserId] } },
    });
  });

  async function startApp(port = 0) {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new AppValidationPipe());
    await app.listen(port, '127.0.0.1');
    websocketUrl = (await app.getUrl()).replace('http://', 'ws://');
  }

  function provider(
    name: string,
    document = new Y.Doc(),
    token = accessToken,
    providerVaultId = vaultId,
  ) {
    return new HocuspocusProvider({
      url: `${websocketUrl}/collaboration?vaultId=${providerVaultId}`,
      name,
      document,
      token,
    });
  }

  it('isolates identical room names by the Vault query', async () => {
    await prisma.vault.upsert({
      where: { id: otherVaultId },
      create: { id: otherVaultId, ownerId: otherUserId, name: 'Other Vault' },
      update: {},
    });
    const firstDocument = new Y.Doc();
    const secondDocument = new Y.Doc();
    const first = provider(documentRoom, firstDocument);
    const second = provider(
      documentRoom,
      secondDocument,
      otherAccessToken,
      otherVaultId,
    );
    await Promise.all([first, second].map(waitForSync));

    firstDocument.getText('isolation').insert(0, 'first');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(secondDocument.getText('isolation').toJSON()).toBe('');

    first.destroy();
    second.destroy();
    firstDocument.destroy();
    secondDocument.destroy();
    await prisma.yDocument.deleteMany({ where: { vaultId: otherVaultId } });
    await prisma.vault.delete({ where: { id: otherVaultId } });
  });

  function waitForSync(client: HocuspocusProvider) {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('sync timeout')), 3000);
      client.on('synced', ({ state }) => {
        if (!state) return;
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  function waitForNextSync(client: HocuspocusProvider) {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('reconnect timeout')),
        10_000,
      );
      client.on('synced', ({ state }) => {
        if (!state) return;
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  async function waitFor(check: () => boolean | Promise<boolean>) {
    const deadline = Date.now() + 3000;
    while (!(await check())) {
      if (Date.now() >= deadline) throw new Error('update timeout');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  function text(document: Y.Doc) {
    return document.getText('content').toJSON();
  }

  it('syncs content while keeping the manifest read-only', async () => {
    const manifestA = new Y.Doc();
    const manifestB = new Y.Doc();
    const contentA = new Y.Doc();
    const contentB = new Y.Doc();
    const canvas = new Y.Doc();
    const clients = [
      provider(manifestRoom, manifestA),
      provider(manifestRoom, manifestB),
      provider(liveDocumentRoom, contentA),
      provider(liveDocumentRoom, contentB),
      provider(canvasRoom, canvas),
    ];
    await Promise.all(clients.map(waitForSync));

    manifestA.getText('content').insert(0, 'A');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(text(manifestB)).toBe('');

    contentA.getText('content').insert(0, 'A');
    await waitFor(() => text(contentB) === 'A');
    contentA.getText('content').insert(1, '1');
    contentB.getText('content').insert(0, '2');
    await waitFor(() => text(contentA) === text(contentB));

    expect(text(canvas)).toBe('');
    clients.forEach((client) => client.destroy());
    [manifestA, manifestB, contentA, contentB, canvas].forEach((document) =>
      document.destroy(),
    );
  });

  it('saves and restores document history through the live collaboration room', async () => {
    const fileId = '98bf1227-8707-4a13-921f-bf7258084893';
    const room = `doc:${fileId}`;
    const headers = { Authorization: `Bearer ${accessToken}` };
    await request(app.getHttpServer())
      .post(`/api/vaults/${vaultId}/files/operations`)
      .set(headers)
      .send({
        operationId: crypto.randomUUID(),
        fileId,
        type: 'create',
        kind: 'markdown',
        path: 'History.md',
      })
      .expect(201);

    const first = new Y.Doc();
    const firstClient = provider(room, first);
    await waitForSync(firstClient);
    first.getText('content').insert(0, 'Earlier content');
    await new Promise((resolve) => setTimeout(resolve, 500));
    firstClient.destroy();
    first.destroy();
    await new Promise((resolve) => setTimeout(resolve, 500));

    const current = new Y.Doc();
    const currentClient = provider(room, current);
    await waitForSync(currentClient);
    const textValue = current.getText('content');
    textValue.delete(0, textValue.length);
    textValue.insert(0, 'Current content');
    await new Promise((resolve) => setTimeout(resolve, 500));

    const versions = await request(app.getHttpServer())
      .get(`/api/vaults/${vaultId}/files/${fileId}/versions`)
      .set(headers)
      .expect(200);
    const versionList = versions.body as Array<{
      id: string;
      hasContent: boolean;
    }>;
    const earlier = versionList.find(
      (version: { hasContent: boolean }) => version.hasContent,
    );
    expect(earlier).toBeDefined();
    const preview = await request(app.getHttpServer())
      .get(`/api/vaults/${vaultId}/files/${fileId}/versions/${earlier?.id}`)
      .set(headers)
      .expect(200);
    expect((preview.body as { content: string }).content).toBe(
      'Earlier content',
    );

    await request(app.getHttpServer())
      .post(
        `/api/vaults/${vaultId}/files/${fileId}/versions/${earlier?.id}/restore`,
      )
      .set(headers)
      .expect(201);
    await waitFor(() => text(current) === 'Earlier content');

    const savedCurrent = await prisma.vaultFileVersion.findFirst({
      where: { fileId },
      orderBy: { version: 'desc' },
      select: { state: true },
    });
    const saved = new Y.Doc();
    Y.applyUpdate(saved, savedCurrent?.state ?? new Uint8Array());
    expect(text(saved)).toBe('Current content');
    await request(app.getHttpServer())
      .post(`/api/vaults/${vaultId}/files/operations`)
      .set(headers)
      .send({
        operationId: crypto.randomUUID(),
        fileId,
        type: 'delete',
        baseVersion: 1,
      })
      .expect(201);
    currentClient.destroy();
    current.destroy();
    saved.destroy();
  });

  it('converges three simultaneous editors and removes stale presence', async () => {
    const documents = [new Y.Doc(), new Y.Doc(), new Y.Doc()];
    const clients = documents.map((document) =>
      provider(presenceDocumentRoom, document),
    );
    await Promise.all(clients.map(waitForSync));

    for (const [index, client] of clients.entries()) {
      client.awareness.setLocalState({
        user: {
          name: ['web', 'obsidian-1', 'obsidian-2'][index],
          color: '#ff00aa',
        },
        cursor: { anchor: index, head: index + 1 },
      });
    }
    await waitFor(() => clients[0].awareness.getStates().size === 3);
    expect([...clients[0].awareness.getStates().values()]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user: { name: 'obsidian-2', color: '#ff00aa' },
          cursor: { anchor: 2, head: 3 },
        }),
      ]),
    );

    documents[0].getText('content').insert(0, 'A');
    documents[1].getText('content').insert(0, 'B');
    documents[2].getText('content').insert(0, 'C');
    await waitFor(() => new Set(documents.map(text)).size === 1);
    expect(text(documents[0])).toHaveLength(3);

    clients[2].destroy();
    await waitFor(() => clients[0].awareness.getStates().size === 2);
    clients.slice(0, 2).forEach((client) => client.destroy());
    documents.forEach((document) => document.destroy());
  });

  it('restores a document after a server restart', async () => {
    const before = new Y.Doc();
    const writer = provider(documentRoom, before);
    await waitForSync(writer);
    before.getText('content').insert(0, 'persisted');
    await new Promise((resolve) => setTimeout(resolve, 700));
    writer.destroy();
    before.destroy();

    await app.close();
    await startApp();
    prisma = app.get(PrismaService);

    const after = new Y.Doc();
    const reader = provider(documentRoom, after);
    await waitForSync(reader);
    expect(text(after)).toBe('persisted');
    reader.destroy();
    after.destroy();
  });

  it('reconnects an existing client after a server restart', async () => {
    const document = new Y.Doc();
    const client = provider(documentRoom, document);
    await waitForSync(client);
    client.awareness.setLocalState({
      user: { name: 'reconnecting', color: '#30bced' },
      cursor: { anchor: 0, head: 0 },
    });
    const reconnected = waitForNextSync(client);
    const port = Number(new URL(websocketUrl).port);

    await app.close();
    await startApp(port);
    prisma = app.get(PrismaService);
    await reconnected;

    document.getText('reconnect').insert(0, 'online');
    const peerDocument = new Y.Doc();
    const peer = provider(documentRoom, peerDocument);
    await waitForSync(peer);
    await waitFor(
      () => peerDocument.getText('reconnect').toJSON() === 'online',
    );
    await waitFor(() => {
      const states = [...peer.awareness.getStates().values()] as Array<{
        user?: { name?: string };
        cursor?: unknown;
      }>;
      return states.some(
        (state) => state.user?.name === 'reconnecting' && state.cursor,
      );
    });
    client.destroy();
    peer.destroy();
    document.destroy();
    peerDocument.destroy();
  }, 15_000);

  it('serializes concurrent renames and stores server versions', async () => {
    const document = new Y.Doc();
    const client = provider(manifestRoom, document);
    await waitForSync(client);
    const files = document.getMap<Record<string, unknown>>('files');
    const firstId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const secondId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const headers = { Authorization: `Bearer ${accessToken}` };
    for (const [fileId, path] of [
      [firstId, 'First.md'],
      [secondId, 'Second.md'],
    ]) {
      await request(app.getHttpServer())
        .post(`/api/vaults/${vaultId}/files/operations`)
        .set(headers)
        .send({
          operationId: crypto.randomUUID(),
          fileId,
          type: 'create',
          kind: 'markdown',
          path,
        })
        .expect(201);
    }

    const results = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/vaults/${vaultId}/files/operations`)
        .set(headers)
        .send({
          operationId: crypto.randomUUID(),
          fileId: firstId,
          type: 'rename',
          path: 'Collision.md',
          baseVersion: 1,
        }),
      request(app.getHttpServer())
        .post(`/api/vaults/${vaultId}/files/operations`)
        .set(headers)
        .send({
          operationId: crypto.randomUUID(),
          fileId: secondId,
          type: 'rename',
          path: 'collision.md',
          baseVersion: 1,
        }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);

    await waitFor(() => {
      const paths = [...files.values()]
        .filter((entry) => !entry.deleted)
        .map((entry) => String(entry.path).toLowerCase());
      return (
        paths.length === 2 &&
        paths.includes('collision.md') &&
        new Set(paths).size === paths.length
      );
    });
    expect(
      [...files.values()].some(
        (entry) => String(entry.path).toLowerCase() === 'collision.md',
      ),
    ).toBe(true);
    expect(
      [...files.values()].some((entry) =>
        ['First.md', 'Second.md'].includes(String(entry.path)),
      ),
    ).toBe(true);
    const versions = await request(app.getHttpServer())
      .get(`/api/vaults/${vaultId}/files/${firstId}/versions`)
      .set(headers);
    expect(versions.status).toBe(200);
    expect(
      await prisma.vaultFileVersion.count({ where: { fileId: firstId } }),
    ).toBeGreaterThanOrEqual(1);
    client.destroy();
    document.destroy();
  });

  it('republishes a committed operation when the client retries it', async () => {
    const document = new Y.Doc();
    const client = provider(manifestRoom, document);
    await waitForSync(client);
    const files = document.getMap<Record<string, unknown>>('files');
    const fileId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const operationId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    await prisma.vaultFile.create({
      data: {
        id: fileId,
        vaultId,
        kind: 'MARKDOWN',
        path: 'Recovered.md',
        activePathKey: 'recovered.md',
        operations: { create: { id: operationId, vaultId } },
      },
    });
    expect(files.has(fileId)).toBe(false);

    await request(app.getHttpServer())
      .post(`/api/vaults/${vaultId}/files/operations`)
      .set({ Authorization: `Bearer ${accessToken}` })
      .send({
        operationId,
        fileId,
        type: 'create',
        kind: 'markdown',
        path: 'Recovered.md',
      })
      .expect(201);

    await waitFor(() => files.has(fileId));
    expect(files.get(fileId)?.path).toBe('Recovered.md');
    client.destroy();
    document.destroy();
  });

  it('searches document contents and returns authorized backlinks', async () => {
    const sourceId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const targetId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    await prisma.vaultFile.createMany({
      data: [
        {
          id: sourceId,
          vaultId,
          kind: 'MARKDOWN',
          path: 'Source.md',
          activePathKey: 'source.md',
        },
        {
          id: targetId,
          vaultId,
          kind: 'MARKDOWN',
          path: 'Notes/Target.md',
          activePathKey: 'notes/target.md',
        },
      ],
    });
    const source = new Y.Doc();
    const target = new Y.Doc();
    source.getText('content').insert(0, 'Read [[Notes/Target]] after lunch.');
    target.getText('content').insert(0, 'A uniquely searchable phrase.');
    await prisma.yDocument.createMany({
      data: [
        {
          roomName: `vault:${vaultId}:doc:${sourceId}`,
          vaultId,
          state: Buffer.from(Y.encodeStateAsUpdate(source)),
        },
        {
          roomName: `vault:${vaultId}:doc:${targetId}`,
          vaultId,
          state: Buffer.from(Y.encodeStateAsUpdate(target)),
        },
      ],
    });
    const headers = { Authorization: `Bearer ${accessToken}` };

    const search = await request(app.getHttpServer())
      .get(`/api/vaults/${vaultId}/files/search`)
      .query({ query: 'uniquely searchable' })
      .set(headers)
      .expect(200);
    expect(search.body).toEqual([
      expect.objectContaining({ id: targetId, path: 'Notes/Target.md' }),
    ]);

    const backlinks = await request(app.getHttpServer())
      .get(`/api/vaults/${vaultId}/files/${targetId}/backlinks`)
      .set(headers)
      .expect(200);
    expect(backlinks.body).toEqual([
      expect.objectContaining({ id: sourceId, path: 'Source.md' }),
    ]);

    const graph = await request(app.getHttpServer())
      .get(`/api/vaults/${vaultId}/files/graph`)
      .set(headers)
      .expect(200);
    const graphBody = graph.body as {
      nodes: Array<{ id: string; path: string }>;
      edges: Array<{ source: string; target: string }>;
    };
    expect(graphBody.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: sourceId, path: 'Source.md' }),
        expect.objectContaining({ id: targetId, path: 'Notes/Target.md' }),
      ]),
    );
    expect(graphBody.edges).toEqual(
      expect.arrayContaining([{ source: sourceId, target: targetId }]),
    );

    const liveSource = new Y.Doc();
    const liveSourceClient = provider(`doc:${sourceId}`, liveSource);
    await waitForSync(liveSourceClient);
    const liveText = liveSource.getText('content');
    liveText.delete(0, liveText.length);
    liveText.insert(0, 'No links remain.');
    await waitFor(async () => {
      const count = await prisma.vaultFileLink.count({
        where: { sourceFileId: sourceId },
      });
      return count === 0;
    });

    const updatedGraph = await request(app.getHttpServer())
      .get(`/api/vaults/${vaultId}/files/graph`)
      .set(headers)
      .expect(200);
    expect(
      (updatedGraph.body as { edges: Array<{ source: string }> }).edges.some(
        (edge) => edge.source === sourceId,
      ),
    ).toBe(false);

    await request(app.getHttpServer())
      .get(`/api/vaults/${vaultId}/files/search`)
      .query({ query: 'uniquely searchable' })
      .set({ Authorization: `Bearer ${otherAccessToken}` })
      .expect(404);
    liveSourceClient.destroy();
    liveSource.destroy();
    source.destroy();
    target.destroy();
  });

  it.each([
    ['wrong token', manifestRoom, 'wrong-token'],
    ['invalid room', 'invalid-room', () => accessToken],
    ['another owner', manifestRoom, () => otherAccessToken],
  ])('rejects %s', async (_label, name, token) => {
    const document = new Y.Doc();
    const client = new HocuspocusProvider({
      url: `${websocketUrl}/collaboration?vaultId=${vaultId}`,
      name,
      document,
      token: typeof token === 'function' ? token() : token,
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('auth timeout')), 3000);
      client.on('authenticationFailed', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    client.destroy();
    document.destroy();
  });

  it('allows document editor writes and keeps viewer connections read-only', async () => {
    await prisma.vaultMember.create({
      data: { vaultId, userId: otherUserId, role: 'EDITOR' },
    });
    const ownerDocument = new Y.Doc();
    const editorDocument = new Y.Doc();
    const viewerDocument = new Y.Doc();
    const owner = provider(documentRoom, ownerDocument);
    const editor = provider(documentRoom, editorDocument, otherAccessToken);
    const viewer = provider(documentRoom, viewerDocument, viewerAccessToken);
    await Promise.all([owner, editor, viewer].map(waitForSync));

    editorDocument.getText('roles').insert(0, 'editor');
    await waitFor(() => ownerDocument.getText('roles').toJSON() === 'editor');
    viewerDocument.getText('roles').insert(6, '-viewer');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(ownerDocument.getText('roles').toJSON()).toBe('editor');

    [owner, editor, viewer].forEach((client) => client.destroy());
    [ownerDocument, editorDocument, viewerDocument].forEach((document) =>
      document.destroy(),
    );
  });

  it('rejects another WebSocket path', async () => {
    const socket = new WebSocket(`${websocketUrl}/wrong-path`);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('close timeout')),
        3000,
      );
      socket.onerror = () => undefined;
      socket.onclose = () => {
        clearTimeout(timeout);
        resolve();
      };
    });
  });
});
