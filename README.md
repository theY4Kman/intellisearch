# intellisearch

IntelliJ-style "CamelHumps" search for JS/TS — a TypeScript port of IntelliJ IDEA's `MinusculeMatcher`.

[![npm version](https://img.shields.io/npm/v/intellisearch)](https://www.npmjs.com/package/intellisearch)
[![CI](https://github.com/theY4Kman/intellisearch/actions/workflows/ci.yml/badge.svg)](https://github.com/theY4Kman/intellisearch/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/intellisearch)](LICENSE)

## Install

```sh
npm install intellisearch
```

Ships ESM and CommonJS builds with TypeScript types, and has zero dependencies.

## Usage

```ts
import { intelliSearch } from 'intellisearch';

intelliSearch('CU', ['CurrentUser', 'cursor', 'Cup', 'Other']);
// => ['CurrentUser', 'Cup', 'cursor']
```

Search objects by extracting the text to match against with `extractText`:

```ts
const people = [{ name: 'Anna' }, { name: 'Bob' }];
intelliSearch('an', people, { extractText: (p) => p.name }); // => [{ name: 'Anna' }]
```

Use `intelliSearchEx` to get match ranges and highlight fragments with `allFragments()`:

```ts
import { intelliSearchEx } from 'intellisearch';

const [result] = intelliSearchEx('cuser', ['CurrentUser']);
result.allFragments(); // => [['C', true], ['urrent', false], ['User', true]]
```

In a browser, `result.renderToHtml()` builds the equivalent markup directly:

```ts
result.renderToHtml();
// => <span><strong>C</strong>urrent<strong>User</strong></span>
```

`renderToHtml()` accepts `containerElement` (the tag name to wrap fragments in, default `span`) and
`preventWrap` (replaces spaces with non-breaking spaces, default `false`). It relies on the global
`document`, so it only works in a browser or other DOM environment. Fragment text is inserted as text
nodes, never parsed as markup, so it's safe to render untrusted input.

## How matching works

A match must begin at a word start: the first letter of the text, a CamelHump (an uppercase letter, or a
run of digits), or the first letter or digit after any non-alphanumeric character (space, `_`, `-`, `/`,
`.`, `@`, and so on). This is why `bar` matches `foo bar`, `barfoo`, `foo/bar`, and `foo@bar`, but not
`foobar`.

Results are sorted best match first, using IntelliJ's matching degree — matches that start at the
beginning of the text, cover consecutive humps, and match case rank higher. Uppercase letters in the
query are treated as a hint to prefer hump starts, so `CU` ranks `CurrentUser` above `Cup`.

An empty query matches nothing.

## API

### `intelliSearch(query, haystack, options?) => V[]`

Filters `haystack` to the items whose text matches `query`, sorted best match first.

### `intelliSearchEx(query, haystack, options?) => SearchResult<V>[]`

Same as `intelliSearch`, but returns a `SearchResult` per match, exposing match ranges and helpers for
highlighting.

### `SearchResult`

| Member                  | Description                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `text`                  | The (possibly processed, see `extraWordBoundaries` below) text that was matched against.                          |
| `object`                | The original haystack item.                                                                                       |
| `matchingRanges`        | The `TextRange`s of `text` that matched the query.                                                                |
| `matchingDegree`        | The score used to sort results; higher is a better match.                                                         |
| `allFragments()`        | `[text, isMatch][]` pairs covering all of `text`, for highlighting.                                               |
| `iterAllFragments()`    | Generator form of `allFragments()`.                                                                               |
| `derive(text)`          | Re-run the same query against different text, reusing this result's `object`. Returns `null` if it doesn't match. |
| `renderToHtml(params?)` | Build an `HTMLElement` with matched fragments wrapped in `<strong>`. Browser/DOM only.                            |

### Options

| Option                | Default             | Description                                                                                                                                                                                               |
| --------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extractText`         | `o => o.toString()` | Extracts the searchable text from a haystack item.                                                                                                                                                        |
| `extraWordBoundaries` | —                   | An array of space-delimited word groups, e.g. `['micro soft']`, that lets a query treat "Microsoft" as if it were written "MicroSoft" — so `ms` matches it. Words are matched literally, not as patterns. |
| `caseSensitive`       | `false`             | Whether `query` must match the exact case of characters in the haystack text.                                                                                                                             |

Note: when `extraWordBoundaries` is used, `SearchResult.text` contains a zero-width space (`\u200B`) at
each inserted boundary, so it won't be identical to the original text — use `result.object` to get back
the original value.

## Credits & license

Licensed under [Apache-2.0](LICENSE). Ported from JetBrains' [intellij-community](https://github.com/JetBrains/intellij-community), with `isUpperCase`/`isLowerCase` adapted from [KooiInc/PureHelpers](https://github.com/KooiInc/PureHelpers) (ISC). See [NOTICE](NOTICE) for details.
