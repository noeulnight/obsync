export type MarkdownFile = { id: string; path: string };

export function markdownLinkTargets(content: string) {
  return [
    ...new Set(
      [
        ...[...content.matchAll(/!?\[\[([^\]]+)\]\]/g)].map(
          (match) => match[1],
        ),
        ...[...content.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].map(
          (match) => match[1],
        ),
      ]
        .map(linkTarget)
        .filter((target) => target !== undefined),
    ),
  ];
}

export function resolveMarkdownTarget(
  sourcePath: string,
  rawTarget: string,
  files: MarkdownFile[],
) {
  const folder = sourcePath.split('/').slice(0, -1);
  const link = rawTarget.replace(/^\/+/, '');
  const candidates = link.startsWith('.')
    ? [normalizedMarkdownPath([...folder, ...link.split('/')])]
    : [
        normalizedMarkdownPath(link.split('/')),
        normalizedMarkdownPath([...folder, ...link.split('/')]),
      ];
  return files.find((file) => {
    const target = normalizedMarkdownPath(file.path.split('/'));
    return (
      candidates.includes(target) ||
      (!link.includes('/') &&
        target.split('/').at(-1) === normalizedMarkdownPath([link]))
    );
  });
}

export function unresolvedMarkdownPath(sourcePath: string, rawTarget: string) {
  const folder = sourcePath.split('/').slice(0, -1);
  const link = rawTarget.replace(/^\/+/, '');
  const parts =
    link.startsWith('.') || !link.includes('/')
      ? [...folder, ...link.split('/')]
      : link.split('/');
  const path: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') path.pop();
    else path.push(part);
  }
  const target = path.join('/');
  return /\.(?:md|canvas)$/i.test(target) ? target : `${target}.md`;
}

function linkTarget(value: string) {
  const decoded = decodeLink(value).split('|')[0].split('#')[0].trim();
  if (!decoded || /^[a-z][a-z\d+.-]*:/i.test(decoded)) return undefined;
  const extension = decoded
    .split('/')
    .at(-1)
    ?.match(/\.([^.]+)$/)?.[1];
  if (extension && !/^(?:md|canvas)$/i.test(extension)) return undefined;
  return decoded;
}

function normalizedMarkdownPath(parts: string[]) {
  const path: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') path.pop();
    else path.push(part);
  }
  return path.join('/').replace(/\.md$/i, '').normalize('NFC').toLowerCase();
}

function decodeLink(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
