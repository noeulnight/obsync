import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../storage/storage.service';

const hour = 60 * 60 * 1000;
const orphanGrace = 30 * 24 * hour;

@Injectable()
export class AttachmentCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AttachmentCleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(
      () =>
        void this.run().catch(() => {
          this.logger.warn('Attachment cleanup cycle will retry');
        }),
      hour,
    );
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async run(now = new Date()): Promise<void> {
    const records = await this.prisma.attachment.findMany({
      where: {
        OR: [
          {
            status: 'DELETED',
            deletedAt: { lte: new Date(now.getTime() - hour) },
          },
          {
            status: 'PENDING',
            createdAt: { lte: new Date(now.getTime() - 24 * hour) },
          },
          {
            status: 'READY',
            updatedAt: { lte: new Date(now.getTime() - orphanGrace) },
          },
        ],
      },
      select: { id: true, vaultId: true, objectKey: true, status: true },
      take: 100,
    });

    const ids = records.map((record) => record.id);
    const [currentReferences, versionReferences] = ids.length
      ? await Promise.all([
          this.prisma.vaultFile.findMany({
            where: { attachmentId: { in: ids }, deletedAt: null },
            select: { attachmentId: true },
          }),
          this.prisma.vaultFileVersion.findMany({
            where: { attachmentId: { in: ids } },
            select: { attachmentId: true },
          }),
        ])
      : [[], []];
    const referenced = new Set(
      [...currentReferences, ...versionReferences].flatMap((record) =>
        record.attachmentId ? [record.attachmentId] : [],
      ),
    );

    for (const record of records) {
      if (referenced.has(record.id)) {
        if (record.status === 'DELETED') {
          await this.prisma.attachment.update({
            where: { id: record.id },
            data: { status: 'READY', deletedAt: null },
          });
        }
        continue;
      }
      if (record.status === 'READY') {
        const claimed = await this.prisma.attachment.updateMany({
          where: { id: record.id, status: 'READY' },
          data: { status: 'DELETED', deletedAt: now },
        });
        if (claimed.count === 0) continue;
        continue;
      }
      if (record.status === 'PENDING') {
        const claimed = await this.prisma.attachment.updateMany({
          where: { id: record.id, status: 'PENDING' },
          data: { status: 'DELETED', deletedAt: now },
        });
        if (claimed.count === 0) continue;
      }
      try {
        await this.storage.deleteObject(record.objectKey);
        await this.prisma.attachment.deleteMany({
          where: { id: record.id, status: 'DELETED' },
        });
      } catch {
        this.logger.warn(`Attachment cleanup will retry: ${record.id}`);
      }
    }
  }
}
