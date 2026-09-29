// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { intelliSearchEx } from '../src/index';

describe('SearchResult.renderToHtml', () => {
  it('wraps matches in <strong> inside a <span> by default', () => {
    const el = intelliSearchEx('cu', ['CurrentUser'])[0].renderToHtml();
    expect(el.tagName).toBe('SPAN');
    expect(el.innerHTML).toBe('<strong>Cu</strong>rrentUser');
  });

  it('honors containerElement', () => {
    const el = intelliSearchEx('cu', ['CurrentUser'])[0].renderToHtml({ containerElement: 'div' });
    expect(el.tagName).toBe('DIV');
  });

  it('replaces spaces with non-breaking spaces when preventWrap is set', () => {
    const el = intelliSearchEx('bar', ['foo bar'])[0].renderToHtml({ preventWrap: true });
    expect(el.textContent).toBe('foo bar');
  });

  it('renders item text as text, never as markup', () => {
    const el = intelliSearchEx('b', ['<b>bold</b>'])[0].renderToHtml();
    expect(el.textContent).toBe('<b>bold</b>');
    expect(el.querySelector('b')).toBeNull();
  });
});
