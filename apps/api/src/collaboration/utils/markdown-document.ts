import { BadRequestException, NotFoundException } from '@nestjs/common';

export type MarkdownPatchTarget = 'heading' | 'block' | 'frontmatter';
export type MarkdownPatchOperation = 'append' | 'prepend' | 'replace';

export function appendMarkdown(content: string, addition: string) {
  if (!content) return addition;
  if (!addition) return content;
  return `${content.replace(/\n*$/, '')}\n${addition}`;
}

export function patchMarkdown(
  content: string,
  targetType: MarkdownPatchTarget,
  target: string,
  operation: MarkdownPatchOperation,
  value: string,
) {
  if (targetType === 'heading')
    return patchRange(content, headingRange(content, target), operation, value);
  if (targetType === 'block')
    return patchBlock(content, target, operation, value);
  return patchFrontmatter(content, target, operation, value);
}

export function markdownDocumentMap(content: string) {
  const headings = headingEntries(content).map(({ level, text, path }) => ({
    level,
    text,
    path,
  }));
  const blocks = [...content.matchAll(/^.*?\s+\^([A-Za-z0-9-]+)\s*$/gm)].map(
    (match) => ({ id: match[1] }),
  );
  return {
    headings,
    blocks,
    frontmatter: frontmatterEntries(content).map(({ key, value }) => ({
      key,
      value,
    })),
  };
}

export function markdownTags(content: string) {
  const tags = new Set<string>();
  for (const match of content.matchAll(/(^|[\s(])#([\p{L}\p{N}_/-]+)/gu))
    tags.add(match[2]);
  const frontmatterTags = frontmatterEntries(content).find(
    ({ key }) => key.toLowerCase() === 'tags',
  )?.value;
  for (const tag of frontmatterTags?.match(/[\p{L}\p{N}_/-]+/gu) ?? [])
    tags.add(tag);
  return [...tags];
}

export function markdownFrontmatter(content: string) {
  return Object.fromEntries(
    frontmatterEntries(content).map(({ key, value }) => [key, value]),
  );
}

function patchRange(
  content: string,
  range: { from: number; to: number },
  operation: MarkdownPatchOperation,
  value: string,
) {
  const current = content.slice(range.from, range.to);
  const replacement =
    operation === 'replace'
      ? value
      : operation === 'prepend'
        ? appendMarkdown(value, current)
        : appendMarkdown(current, value);
  return `${content.slice(0, range.from)}${replacement}${content.slice(range.to)}`;
}

function headingRange(content: string, target: string) {
  const entry = headingEntries(content).find(({ path }) => path === target);
  if (!entry) throw new NotFoundException('Heading not found');
  return { from: entry.bodyFrom, to: entry.bodyTo };
}

function headingEntries(content: string) {
  const matches = [
    ...content.matchAll(/^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/gm),
  ];
  const stack: string[] = [];
  return matches.map((match, index) => {
    const level = match[1].length;
    const text = match[2].trim();
    stack.length = level - 1;
    stack[level - 1] = text;
    const lineEnd = match.index + match[0].length;
    const bodyFrom = content[lineEnd] === '\n' ? lineEnd + 1 : lineEnd;
    const next = matches
      .slice(index + 1)
      .find((candidate) => candidate[1].length <= level);
    return {
      level,
      text,
      path: stack.filter(Boolean).join('::'),
      bodyFrom,
      bodyTo: next?.index ?? content.length,
    };
  });
}

function patchBlock(
  content: string,
  target: string,
  operation: MarkdownPatchOperation,
  value: string,
) {
  const match = [...content.matchAll(/^(.*?)\s+\^([A-Za-z0-9-]+)\s*$/gm)].find(
    (entry) => entry[2] === target.replace(/^\^/, ''),
  );
  if (!match) throw new NotFoundException('Block not found');
  const replacement =
    operation === 'replace'
      ? value
      : operation === 'prepend'
        ? `${value}${match[1]}`
        : `${match[1]}${value}`;
  return `${content.slice(0, match.index)}${replacement} ^${match[2]}${content.slice(match.index + match[0].length)}`;
}

function patchFrontmatter(
  content: string,
  key: string,
  operation: MarkdownPatchOperation,
  value: string,
) {
  const frontmatter = frontmatterRange(content);
  if (!frontmatter) {
    if (operation !== 'replace')
      throw new NotFoundException('Frontmatter property not found');
    return `---\n${key}: ${value}\n---\n${content}`;
  }
  const entry = frontmatterEntries(content).find((item) => item.key === key);
  if (!entry) {
    if (operation !== 'replace')
      throw new NotFoundException('Frontmatter property not found');
    return `${content.slice(0, frontmatter.close)}${key}: ${value}\n${content.slice(frontmatter.close)}`;
  }
  const replacement =
    operation === 'replace'
      ? value
      : operation === 'prepend'
        ? `${value}${entry.value}`
        : `${entry.value}${value}`;
  return `${content.slice(0, entry.valueFrom)}${replacement}${content.slice(entry.valueTo)}`;
}

function frontmatterEntries(content: string) {
  const range = frontmatterRange(content);
  if (!range) return [];
  const entries: Array<{
    key: string;
    value: string;
    valueFrom: number;
    valueTo: number;
  }> = [];
  const body = content.slice(range.open, range.close);
  for (const match of body.matchAll(/^([^\s:#][^:]*):[ \t]*(.*)$/gm)) {
    const value = match[2];
    const valueFrom = range.open + match.index + match[0].length - value.length;
    entries.push({
      key: match[1].trim(),
      value,
      valueFrom,
      valueTo: valueFrom + value.length,
    });
  }
  return entries;
}

function frontmatterRange(content: string) {
  if (!content.startsWith('---\n')) return undefined;
  const close = content.indexOf('\n---', 4);
  if (close < 0) throw new BadRequestException('Frontmatter is not closed');
  return { open: 4, close: close + 1 };
}
