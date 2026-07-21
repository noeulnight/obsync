import { type Prisma } from '@prisma/client';

export async function nextFileRevision(
  transaction: Prisma.TransactionClient,
  fileId: string,
) {
  const latest = await transaction.vaultFileVersion.findFirst({
    where: { fileId },
    select: { version: true },
    orderBy: { version: 'desc' },
  });
  return (latest?.version ?? 0) + 1;
}
