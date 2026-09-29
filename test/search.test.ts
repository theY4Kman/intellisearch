import { describe, expect, it } from 'vitest';
import { intelliSearch, intelliSearchEx, type SearchResult } from '../src/index';

const ZWSP = '\u200b';

/** Strings of the fragments that matched the query */
// `any`, not `unknown`: SearchResult<V> is invariant in V (config.extractText takes a V)
const matched = (r: SearchResult<any>): string[] =>
  r
    .allFragments()
    .filter(([, isMatch]) => isMatch)
    .map(([text]) => text);

describe('intelliSearch', () => {
  it('returns only matching items, best first', () => {
    expect(intelliSearch('bar', ['foobar', 'foo bar', 'barfoo', 'baz'])).toEqual([
      'barfoo',
      'foo bar',
    ]);
  });

  it('does not match in the middle of a word', () => {
    expect(intelliSearch('bar', ['foobar'])).toEqual([]);
  });

  it('matches CamelHumps', () => {
    expect(intelliSearch('CU', ['CurrentUser', 'Other'])).toEqual(['CurrentUser']);
  });

  it('matches across word separators', () => {
    expect(intelliSearch('fb', ['foo_bar', 'foo-bar', 'foo bar', 'fab'])).toEqual([
      'foo_bar',
      'foo-bar',
      'foo bar',
    ]);
  });

  it('is case-insensitive by default', () => {
    expect(intelliSearch('foo', ['foo', 'Foo']).sort()).toEqual(['Foo', 'foo']);
  });

  it('honors caseSensitive', () => {
    expect(intelliSearch('Foo', ['foo', 'Foo'], { caseSensitive: true })).toEqual(['Foo']);
    expect(intelliSearch('foo', ['foo', 'Foo'], { caseSensitive: true })).toEqual(['foo']);
  });

  it('uses extractText for object haystacks', () => {
    const people = [{ name: 'Anna' }, { name: 'Bob' }];
    expect(intelliSearch('an', people, { extractText: (p) => p.name })).toEqual([people[0]]);
  });

  it('uses toString() by default', () => {
    expect(intelliSearch('1', [1, 12, 21, 3])).toEqual([1, 12, 21]);
  });

  it('returns nothing for an empty query', () => {
    expect(intelliSearch('', ['a', 'b'])).toEqual([]);
  });

  it('returns nothing for an empty haystack', () => {
    expect(intelliSearch('a', [])).toEqual([]);
  });
});

describe('intelliSearchEx', () => {
  it('orders results by matchingDegree', () => {
    expect(intelliSearchEx('CU', ['CurrentUser', 'cursor', 'Cup']).map((r) => r.text)).toEqual([
      'Cup',
      'CurrentUser',
      'cursor',
    ]);
    expect(intelliSearchEx('cu', ['CurrentUser', 'cursor', 'Cup']).map((r) => r.text)).toEqual([
      'cursor',
      'CurrentUser',
      'Cup',
    ]);
  });

  it('reports matching fragments', () => {
    expect(matched(intelliSearchEx('CU', ['CurrentUser'])[0])).toEqual(['C', 'U']);
    expect(matched(intelliSearchEx('cuser', ['CurrentUser'])[0])).toEqual(['C', 'User']);
    expect(matched(intelliSearchEx('curus', ['CurrentUser'])[0])).toEqual(['Cur', 'Us']);
    expect(matched(intelliSearchEx('abc', ['a_b_c'])[0])).toEqual(['a', 'b', 'c']);
  });

  it('exposes the original object', () => {
    const item = { name: 'CurrentUser' };
    const [result] = intelliSearchEx('cu', [item], { extractText: (o) => o.name });
    expect(result.object).toBe(item);
  });
});

describe('extraWordBoundaries', () => {
  it('does not match "ms" to "Microsoft" without boundaries', () => {
    expect(intelliSearch('ms', ['Microsoft'])).toEqual([]);
  });

  it('treats configured word pairs as CamelHumps', () => {
    const results = intelliSearchEx('ms', ['Microsoft', 'mouse'], {
      extraWordBoundaries: ['micro soft'],
    });
    expect(results.map((r) => r.object)).toEqual(['Microsoft']);
    expect(results[0].text).toBe(`Micro${ZWSP}soft`);
    expect(matched(results[0])).toEqual(['M', 's']);
  });

  it('ignores entries with fewer than two words', () => {
    expect(intelliSearch('ms', ['Microsoft'], { extraWordBoundaries: ['micro'] })).toEqual([]);
    expect(intelliSearch('ms', ['Microsoft'], { extraWordBoundaries: [] })).toEqual([]);
  });
});

describe('SearchResult', () => {
  it('yields all fragments with match flags', () => {
    const [result] = intelliSearchEx('bar', ['foo bar']);
    expect(result.allFragments()).toEqual([
      ['foo ', false],
      ['bar', true],
    ]);
    expect([...result.iterAllFragments()]).toEqual(result.allFragments());
  });

  it('derive() re-matches the same query against new text', () => {
    const [result] = intelliSearchEx('cu', ['CurrentUser']);
    const derived = result.derive('cursor');
    expect(derived?.allFragments()).toEqual([
      ['cu', true],
      ['rsor', false],
    ]);
    expect(derived?.object).toBe('CurrentUser');
    expect(result.derive('xyz')).toBeNull();
  });

  it('derive() applies extraWordBoundaries', () => {
    const [result] = intelliSearchEx('ms', ['Microsoft'], { extraWordBoundaries: ['micro soft'] });
    expect(result.derive('Microsoft Word')?.text).toBe(`Micro${ZWSP}soft Word`);
  });
});

describe('adjacent fragment merging', () => {
  it('merges adjacent ranges instead of duplicating them', () => {
    const [result] = intelliSearchEx('FOO_BAR', ['foo_bar']);
    expect(result.matchingRanges).toEqual([{ startOffset: 0, endOffset: 7 }]);
    expect(result.allFragments()).toEqual([['foo_bar', true]]);
  });

  it('merges across a space', () => {
    const [result] = intelliSearchEx('A B', ['a b']);
    expect(result.allFragments()).toEqual([['a b', true]]);
  });

  it.each([
    ['FOO_BAR', 'foo_bar'],
    ['A_X', 'a_x'],
    ['A B', 'a b'],
    ['CU', 'CurrentUser'],
    ['cuser', 'CurrentUser'],
    ['abc', 'a_b_c'],
    ['fb', 'foo-bar'],
    ['bar', 'foo bar'],
  ])('fragments of %j against %j reconstruct the text exactly', (query, text) => {
    const results = intelliSearchEx(query, [text]);
    expect(results).toHaveLength(1);
    expect(
      results[0]
        .allFragments()
        .map(([fragment]) => fragment)
        .join(''),
    ).toBe(results[0].text);
  });
});

describe('extraWordBoundaries escaping', () => {
  it('accepts regex metacharacters in words', () => {
    const results = intelliSearchEx('cb', ['C++Builder', 'cobol'], {
      extraWordBoundaries: ['c++ builder'],
    });
    expect(results.map((r) => r.object)).toEqual(['C++Builder']);
    expect(results[0].text).toBe(`C++${ZWSP}Builder`);
  });

  it('matches words literally, not as patterns', () => {
    expect(intelliSearch('ab', ['axbc'], { extraWordBoundaries: ['a. bc'] })).toEqual([]);
    expect(intelliSearchEx('ab', ['a.bc'], { extraWordBoundaries: ['a. bc'] })[0].text).toBe(
      `a.${ZWSP}bc`,
    );
  });
});
