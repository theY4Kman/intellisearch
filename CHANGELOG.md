# Changelog

## 0.1.0

Initial release.

- `intelliSearch` / `intelliSearchEx`: IntelliJ-style CamelHumps matching and ranking
- `SearchResult` with fragment iteration, `derive()`, and `renderToHtml()`
- Fixed: adjacent match ranges were duplicated for all-caps queries against separated text (e.g. `FOO_BAR` vs `foo_bar`)
- Fixed: regex metacharacters in `extraWordBoundaries` threw or matched incorrectly
- Fixed: case-matching bonuses in ranking were computed against the wrong query characters (e.g. `CU` now ranks `CurrentUser` above `Cup`)
