import {
  markdownLinkTargets,
  resolveMarkdownTarget,
  unresolvedMarkdownPath,
} from '../utils/markdown-links';

describe('Markdown links', () => {
  it('extracts internal links and resolves relative paths', () => {
    const links = markdownLinkTargets(
      '[[Roadmap|Plan]] [today](../Daily/Today.md#notes) [site](https://example.com)',
    );

    expect(links).toEqual(['Roadmap', '../Daily/Today.md']);
    expect(
      resolveMarkdownTarget('Projects/Source.md', links[1], [
        { id: 'today', path: 'Daily/Today.md' },
      ]),
    ).toEqual({ id: 'today', path: 'Daily/Today.md' });
  });

  it('places unresolved links beside their source document', () => {
    expect(unresolvedMarkdownPath('Projects/Source.md', 'Roadmap')).toBe(
      'Projects/Roadmap.md',
    );
    expect(unresolvedMarkdownPath('Projects/Source.md', '../Daily/Today')).toBe(
      'Daily/Today.md',
    );
    expect(unresolvedMarkdownPath('Projects/Source.md', 'Shared/Plan.md')).toBe(
      'Shared/Plan.md',
    );
  });
});
