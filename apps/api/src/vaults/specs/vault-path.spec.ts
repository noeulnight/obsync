import { BadRequestException } from '@nestjs/common';
import { vaultPath, vaultPathKey } from '../utils/vault-path';

describe('Vault paths', () => {
  it('normalizes whitespace and unicode before storing and comparing paths', () => {
    expect(vaultPath('  notes/cafe\u0301.md  ')).toBe('notes/café.md');
    expect(vaultPathKey('Notes/CAFÉ.md')).toBe('notes/café.md');
  });

  it.each([
    '',
    '/absolute.md',
    'folder\\file.md',
    'folder//file.md',
    'folder/./file.md',
    'folder/../file.md',
    'folder/',
    'folder/\0file.md',
  ])('rejects unsafe path %j', (path) => {
    expect(() => vaultPath(path)).toThrow(BadRequestException);
  });
});
