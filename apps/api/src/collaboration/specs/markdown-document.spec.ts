import {
  appendMarkdown,
  markdownDocumentMap,
  markdownFrontmatter,
  markdownTags,
  patchMarkdown,
} from '../utils/markdown-document';

const markdown = `---
status: draft
tags: [project, korean]
---
# Work
Intro #project

## Today
Original ^task-1

# Later
Done
`;

describe('Markdown document operations', () => {
  it('maps and queries document metadata', () => {
    expect(markdownDocumentMap(markdown)).toEqual({
      headings: [
        { level: 1, text: 'Work', path: 'Work' },
        { level: 2, text: 'Today', path: 'Work::Today' },
        { level: 1, text: 'Later', path: 'Later' },
      ],
      blocks: [{ id: 'task-1' }],
      frontmatter: [
        { key: 'status', value: 'draft' },
        { key: 'tags', value: '[project, korean]' },
      ],
    });
    expect(markdownTags(markdown)).toEqual(['project', 'korean']);
    expect(markdownFrontmatter(markdown)).toMatchObject({ status: 'draft' });
  });

  it('updates targeted content while preserving its identifier', () => {
    const heading = patchMarkdown(
      markdown,
      'heading',
      'Work::Today',
      'replace',
      'Changed\n',
    );
    expect(heading).toContain('## Today\nChanged\n# Later');

    const block = patchMarkdown(
      markdown,
      'block',
      'task-1',
      'replace',
      'Changed',
    );
    expect(block).toContain('Changed ^task-1');

    const frontmatter = patchMarkdown(
      markdown,
      'frontmatter',
      'status',
      'replace',
      'done',
    );
    expect(frontmatter).toContain('status: done');
    expect(appendMarkdown('Existing', 'Added')).toBe('Existing\nAdded');
  });
});
