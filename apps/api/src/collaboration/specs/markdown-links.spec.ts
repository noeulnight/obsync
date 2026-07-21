import {
  markdownLinkTargets,
  resolveMarkdownTarget,
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
});
