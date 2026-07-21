import { BadRequestException } from '@nestjs/common';

export function vaultPath(input: string) {
  const path = input.trim().normalize('NFC');
  if (
    !path ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new BadRequestException('Invalid Vault path');
  }
  return path;
}

export function vaultPathKey(path: string) {
  return path.normalize('NFC').toLowerCase();
}
