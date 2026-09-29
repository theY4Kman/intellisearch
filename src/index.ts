const ZWSP = '\u200B';
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export type IntelliSearchConfig<V> = {
  extractText?: (object: V) => string;
  extraWordBoundaries?: string[];
  caseSensitive?: boolean;
};

export type SearchResultConfig<V> = IntelliSearchConfig<V> & {
  processText: (text: string) => string;
};

export type SearchResultRenderParams<Element extends keyof HTMLElementTagNameMap> = {
  /** Name of HTML element to use as the parent container for the rendered HTML */
  containerElement?: Element;
  /** Whether to prevent wrapping of text by using non-breaking spaces instead of regular spaces */
  preventWrap?: boolean;
};

/** State structure used in intelliSearch */
export class SearchResult<V> {
  constructor(
    public readonly text: string,
    public readonly object: V,
    public readonly matcher: MiniMatcher,
    public readonly matchingRanges: TextRange[] | null,
    public readonly matchingDegree: number | null,
    public readonly config: SearchResultConfig<V>,
  ) {}

  *iterAllFragments(): Generator<[string, boolean]> {
    if (this.matchingRanges == null) return;

    let lastIndex = 0;
    for (const range of this.matchingRanges) {
      const precedingRange = new TextRange(lastIndex, range.startOffset);
      if (!precedingRange.isEmpty()) {
        yield [precedingRange.substring(this.text), false];
      }

      yield [range.substring(this.text), true];
      lastIndex = range.endOffset;
    }

    if (lastIndex <= this.text.length - 1) {
      yield [this.text.substring(lastIndex), false];
    }
  }

  allFragments(): [string, boolean][] {
    return [...this.iterAllFragments()];
  }

  /**
   * Create a new SearchResult for this object, matched against different text
   */
  derive(text: string): SearchResult<V> | null {
    text = this.config.processText(text);
    const fragments = this.matcher.matchingFragments(text);
    if (fragments == null) return null;

    const degree = this.matcher.matchingDegree(text, fragments);
    return new SearchResult<V>(text, this.object, this.matcher, fragments, degree, this.config);
  }

  /**
   * Render the search result as HTML, with fragments in bold (inside <strong>)
   */
  renderToHtml<Element extends keyof HTMLElementTagNameMap>({
    containerElement = 'span' as Element,
    preventWrap = false,
  }: SearchResultRenderParams<Element> = {}): HTMLElementTagNameMap[Element] {
    const container = document.createElement(containerElement);
    container.append(
      ...this.allFragments().map(([text, isMatch]) => {
        if (preventWrap) {
          // NOTE: unicode code point 00a0 is non-breaking space (&nbsp;)
          text = text.replace(/ /g, '\u00a0');
        }
        if (!isMatch) return text;

        const bold = document.createElement('strong');
        bold.textContent = text;
        return bold;
      }),
    );
    return container;
  }
}

/**
 * Filter `haystack` items containing `query`'s characters in consecutive order
 *
 * @param query
 *    Characters to match consecutively within `haystack` items
 *
 * @param haystack
 *    A collection of arbitrary items to filter by `query`
 *
 * @param extractText
 *    Function to transform haystack items into their search text. If `haystack` items are objects,
 *    this can be used to select a searchable property. If not specified, `.toString()` is used.
 *
 * @param extraWordBoundaries
 *    Strings in the form `alpha beta` which cause the matcher to treat "Alphabeta" as if it were
 *    written in the CamelHumps "AlphaBeta" form. For example, `extraWordBoundaries: ["micro soft"]`
 *    will allow a query of `ms` to match the string "Microsoft".
 *
 * @param caseSensitive
 *    Whether to only match the exact case of characters in `query`.
 *
 * @return
 *    Collection of `haystack` items matched by `query`
 */
export const intelliSearchEx = function intelliSearchEx<V extends { toString(): string }>(
  query: string,
  haystack: V[],
  {
    extractText = (o) => o.toString(),
    extraWordBoundaries,
    caseSensitive = false,
  }: IntelliSearchConfig<V> = {},
): SearchResult<V>[] {
  const matcher = new MiniMatcher(query, caseSensitive);
  let processText: (text: string) => string = (text) => text;

  if (extraWordBoundaries != null) {
    // ['firstWord', 'second', 'third']
    const validWordLists = extraWordBoundaries
      .map((spaceDelimitedWords) => {
        const words = spaceDelimitedWords.split(/\s+/).filter(Boolean).map(escapeRegExp);
        if (words.length <= 1) return null;
        return words;
      })
      .filter(Boolean) as string[][];

    // (\bfirstWord)(second)(third)
    const wordPatterns = validWordLists.map(([firstWord, ...words]) =>
      [`(\\b${firstWord})`, ...words.map((word) => `(${word})`)].join(''),
    );

    // (\bfirstWord)(second)(third)|(\berstesWort)(zweite)(dritte)
    const wordBoundariesPattern = wordPatterns.join('|');
    const wordBoundariesRegex = new RegExp(wordBoundariesPattern, 'gi');

    processText = (text: string) =>
      text.replace(wordBoundariesRegex, (matchString, ...args) =>
        args.slice(0, -2).filter(Boolean).join(ZWSP),
      );
  }

  const searchResultConfig = { extractText, extraWordBoundaries, caseSensitive, processText };

  const matchingItems: SearchResult<V>[] = haystack.map((o) => {
    const text = processText(extractText(o));
    const fragments = matcher.matchingFragments(text);
    const degree = matcher.matchingDegree(text, fragments);
    return new SearchResult<V>(text, o, matcher, fragments, degree, searchResultConfig);
  });

  return matchingItems
    .filter((item) => Boolean(item.matchingRanges))
    .sort((a, b) => b.matchingDegree! - a.matchingDegree!);
};

/**
 * Filter `haystack` items containing `query`'s characters in consecutive order
 *
 * @param query
 *    Characters to match consecutively within `haystack` items
 *
 * @param haystack
 *    A collection of arbitrary items to filter by `query`
 *
 * @param options
 *    Search options to pass along to {@link intelliSearchEx}
 *
 * @return
 *    Collection of `haystack` items matched by `query`
 */
export const intelliSearch = function intelliSearch<V extends { toString(): string }>(
  query: string,
  haystack: V[],
  options?: IntelliSearchConfig<V>,
): V[] {
  return intelliSearchEx(query, haystack, options).map((result) => result.object);
};

/**
 * Port of intellij-community's TextRange. Many methods have been omitted.
 *
 * ref: https://github.com/JetBrains/intellij-community/blob/2052503d12e631cb33d320fba579c53a23f84049/platform/util/base/src/com/intellij/openapi/util/TextRange.java
 */
class TextRange {
  constructor(
    public readonly startOffset: number,
    public readonly endOffset: number,
  ) {}

  static from(offset: number, length: number): TextRange {
    return new TextRange(offset, offset + length);
  }

  get length(): number {
    return this.endOffset - this.startOffset;
  }

  isEmpty(): boolean {
    return this.startOffset >= this.endOffset;
  }

  substring(str: string): string {
    return str.substring(this.startOffset, this.endOffset);
  }
}

abstract class Matcher {
  public readonly ignoreCase: boolean;
  constructor(
    public readonly pattern: string,
    public readonly caseSensitive: boolean,
  ) {
    this.ignoreCase = !this.caseSensitive;
  }

  abstract matchingFragments(name: string): TextRange[] | null;
  abstract matchingDegree(name: string, fragments: TextRange[] | null): number;
}

/**
 * Port of intellij-community's MinisculeMatcherImpl.
 *
 * Some details have been omitted, including:
 *  - Special matching based on first character casing
 *  - Unicode/ASCII detection (we *erroneously* assume names are always ASCII, which impacts lower/uppercase detection)
 *
 * ref: https://github.com/JetBrains/intellij-community/blob/e968f719dc8fab5d1e0ef37abc7103245cc4ebde/platform/util/text-matching/src/com/intellij/psi/codeStyle/MinusculeMatcherImpl.java
 */
class MiniMatcher extends Matcher {
  private toUpperCase = this.pattern.toUpperCase();
  private toLowerCase = this.pattern.toLowerCase();
  private isUpperCase = [...this.pattern].map(isUpperCase);
  private isLowerCase = [...this.pattern].map(isLowerCase);
  private isWordSeparator = [...this.pattern].map(isWordSeparator);
  private hasHumps = this.isUpperCase.slice(1).some((o) => o) && this.isLowerCase.some((o) => o);

  matchingDegree(name: string, fragments: TextRange[] | null): number {
    if (fragments == null) return Number.MIN_VALUE;
    if (fragments.length === 0) return 0;

    const first: TextRange = fragments[0];
    const startMatch: boolean = first.startOffset === 0;

    let matchingCase: number = 0;
    let p: number = -1;

    let skippedHumps: number = 0;
    let nextHumpStart: number = 0;
    let humpStartMatchedUpperCase: boolean = false;
    for (const range of fragments) {
      for (let i: number = range.startOffset; i < range.endOffset; i++) {
        const afterGap: boolean = i == range.startOffset && first != range;
        let isHumpStart: boolean = false;
        while (nextHumpStart <= i) {
          if (nextHumpStart == i) {
            isHumpStart = true;
          } else if (afterGap) {
            skippedHumps++;
          }
          nextHumpStart = nextWord(name, nextHumpStart);
        }

        const c: string = name.charAt(i);
        p = this.pattern.substring(p + 1).indexOf(c);
        if (p < 0) {
          break;
        }

        if (isHumpStart) {
          humpStartMatchedUpperCase = c == this.pattern[p] && this.isUpperCase[p];
        }

        matchingCase += this.evaluateCaseMatching(
          p,
          humpStartMatchedUpperCase,
          i,
          afterGap,
          isHumpStart,
          c,
        );
      }
    }

    const startIndex: number = first.startOffset;
    const wordStart: boolean =
      startIndex == 0 || (isWordStart(name, startIndex) && !isWordStart(name, startIndex - 1));
    const finalMatch: boolean = fragments[fragments.length - 1].endOffset == name.length;

    return (
      (wordStart ? 1000 : 0) +
      matchingCase -
      fragments.length +
      -skippedHumps * 10 +
      (startMatch ? 1 : 0) +
      (finalMatch ? 1 : 0)
    );
  }

  private evaluateCaseMatching(
    patternIndex: number,
    humpStartMatchedUpperCase: boolean,
    nameIndex: number,
    afterGap: boolean,
    isHumpStart: boolean,
    nameChar: string,
  ): number {
    if (afterGap && isHumpStart && this.isLowerCase[patternIndex]) {
      return -10; // disprefer when there's a hump but nothing in the pattern indicates the user meant it to be hump
    }
    if (nameChar == this.pattern[patternIndex]) {
      if (this.isUpperCase[patternIndex]) return 50; // strongly prefer user's uppercase matching uppercase: they made an effort to press Shift
      if (nameIndex == 0) return 150; // the very first letter case distinguishes classes in Java etc
      if (isHumpStart) return 1; // if a lowercase matches lowercase hump start, that also means something
    } else if (isHumpStart) {
      // disfavor hump starts where pattern letter case doesn't match name case
      return -1;
    } else if (this.isLowerCase[patternIndex] && humpStartMatchedUpperCase) {
      // disfavor lowercase non-humps matching uppercase in the name
      return -1;
    }
    return 0;
  }

  matchingFragments(name: string): TextRange[] | null {
    // Allow matching fragments in the middle of the name
    let nameStart = this.indexOfWordStart(name, 0, 0);
    if (nameStart === -1) {
      return null;
    }

    while (nameStart < name.length && nameStart >= 0) {
      const fragments = this.matchFragment(name, 0, nameStart);
      if (fragments != null) {
        return fragments;
      }

      // If our first attempt at matching a word in name to a pattern prefix fails,
      // try again with later words in name.
      nameStart = this.findNextPatternCharOccurrence(name, nameStart + 1, 0);
    }

    return null;
  }

  private prependRange(ranges: TextRange[], from: number, length: number) {
    if (ranges.length && ranges[0].startOffset == from + length) {
      return [new TextRange(from, ranges[0].endOffset), ...ranges.slice(1)];
    }
    return [TextRange.from(from, length), ...ranges];
  }

  private matchFragment(name: string, patternIndex: number, nameIndex: number): TextRange[] | null {
    const fragmentLength = this.maxMatchingFragment(name, patternIndex, nameIndex);
    return fragmentLength === 0
      ? null
      : this.matchInsideFragment(name, patternIndex, nameIndex, fragmentLength);
  }

  private maxMatchingFragment(name: string, patternIndex: number, nameIndex: number): number {
    if (!this.isFirstCharMatching(name, nameIndex, patternIndex)) {
      return 0;
    }

    let i: number = 1;
    while (nameIndex + i < name.length && patternIndex + i < this.pattern.length) {
      const nameChar: string = name.charAt(nameIndex + i);
      if (!this.charEquals(this.pattern[patternIndex + i], patternIndex + i, nameChar)) {
        if (this.isSkippingDigitBetweenPatternDigits(patternIndex + i, nameChar)) {
          return 0;
        }
        break;
      }
      i++;
    }
    return i;
  }

  private isSkippingDigitBetweenPatternDigits(patternIndex: number, nameChar: string): boolean {
    return (
      isDigit(this.pattern[patternIndex]) &&
      isDigit(this.pattern[patternIndex - 1]) &&
      isDigit(nameChar)
    );
  }

  private matchInsideFragment(
    name: string,
    patternIndex: number,
    nameIndex: number,
    fragmentLength: number,
  ): TextRange[] | null {
    const camelHumpRanges: TextRange[] | null = this.improveCamelHumps(
      name,
      patternIndex,
      nameIndex,
      fragmentLength,
      1,
    );
    if (camelHumpRanges != null) {
      return camelHumpRanges;
    }

    return this.findLongestMatchingPrefix(name, patternIndex, nameIndex, fragmentLength, 1);
  }

  private findLongestMatchingPrefix(
    name: string,
    patternIndex: number,
    nameIndex: number,
    fragmentLength: number,
    minFragment: number,
  ): TextRange[] | null {
    if (patternIndex + fragmentLength >= this.pattern.length) {
      return [TextRange.from(nameIndex, fragmentLength)];
    }

    // try to match the remainder of pattern with the remainder of name
    // it may not succeed with the longest matching fragment, then try shorter matches
    let i: number = fragmentLength;
    while (i >= minFragment) {
      let ranges: TextRange[] | null;
      const nextOccurrence = this.findNextPatternCharOccurrence(
        name,
        nameIndex + i + 1,
        patternIndex + i,
      );
      if (nextOccurrence >= 0) {
        ranges = this.matchSkippingWords(name, patternIndex + i, nextOccurrence);
      } else {
        ranges = null;
      }
      if (ranges != null) {
        return this.prependRange(ranges, nameIndex, i);
      }
      i--;
    }
    return null;
  }

  /**
   * When pattern is "CU" and the name is "CurrentUser", we already have a prefix "Cu" that matches,
   * but we try to find uppercase "U" later in name for better matching degree
   */
  private improveCamelHumps(
    name: string,
    patternIndex: number,
    nameIndex: number,
    maxFragment: number,
    minFragment: number,
  ): TextRange[] | null {
    for (let i: number = minFragment; i < maxFragment; i++) {
      if (this.isUppercasePatternVsLowercaseNameChar(name, patternIndex + i, nameIndex + i)) {
        const ranges: TextRange[] | null = this.findUppercaseMatchFurther(
          name,
          patternIndex + i,
          nameIndex + i,
        );
        if (ranges != null) {
          return this.prependRange(ranges, nameIndex, i);
        }
      }
    }
    return null;
  }

  private isUppercasePatternVsLowercaseNameChar(
    name: string,
    patternIndex: number,
    nameIndex: number,
  ): boolean {
    return this.isUpperCase[patternIndex] && this.pattern[patternIndex] != name.charAt(nameIndex);
  }

  private findUppercaseMatchFurther(
    name: string,
    patternIndex: number,
    nameIndex: number,
  ): TextRange[] | null {
    const nextWordStart: number = this.indexOfWordStart(name, patternIndex, nameIndex);
    return this.matchFragment(name, patternIndex, nextWordStart);
  }

  private isFirstCharMatching(name: string, nameIndex: number, patternIndex: number): boolean {
    if (nameIndex >= name.length) return false;

    const patternChar: string = this.pattern[patternIndex];
    return this.charEquals(patternChar, patternIndex, name.charAt(nameIndex));
  }

  private isTrailingSpacePattern(): boolean {
    return this.pattern[this.pattern.length - 1] === ' ';
  }

  private matchSkippingWords(
    name: string,
    patternIndex: number,
    nameIndex: number,
  ): TextRange[] | null {
    let maxFoundLength: number = 0;
    while (nameIndex >= 0) {
      const fragmentLength: number = this.seemsLikeFragmentStart(name, patternIndex, nameIndex)
        ? this.maxMatchingFragment(name, patternIndex, nameIndex)
        : 0;

      // match the remaining pattern only if we haven't already seen fragment of the same (or bigger) length
      // because otherwise it means that we already tried to match remaining pattern letters after it with the remaining name and failed
      // but now we have the same remaining pattern letters and even less remaining name letters, and so will fail as well
      if (
        fragmentLength > maxFoundLength ||
        (nameIndex + fragmentLength == name.length && this.isTrailingSpacePattern())
      ) {
        maxFoundLength = fragmentLength > maxFoundLength ? fragmentLength : maxFoundLength;
        const ranges = this.matchInsideFragment(name, patternIndex, nameIndex, fragmentLength);
        if (ranges != null) {
          return ranges;
        }
      }
      nameIndex = this.findNextPatternCharOccurrence(name, nameIndex + 1, patternIndex);
    }
    return null;
  }

  private findNextPatternCharOccurrence(
    name: string,
    startAt: number,
    patternIndex: number,
  ): number {
    return !this.isWordSeparator[patternIndex]
      ? this.indexOfWordStart(name, patternIndex, startAt)
      : this.indexOfIgnoreCase(name, startAt, this.pattern[patternIndex], patternIndex);
  }

  private seemsLikeFragmentStart(
    name: string,
    patternIndex: number,
    nextOccurrence: number,
  ): boolean {
    // uppercase should match either uppercase or a word start
    return (
      !this.isUpperCase[patternIndex] ||
      isUpperCase(name.charAt(nextOccurrence)) ||
      isWordStart(name, nextOccurrence) ||
      // accept uppercase matching lowercase if the whole prefix is uppercase and case sensitivity allows that
      (!this.hasHumps && this.ignoreCase)
    );
  }

  private charEquals(patternChar: string, patternIndex: number, nameChar: string): boolean {
    return (
      patternChar == nameChar ||
      (this.ignoreCase &&
        (this.toLowerCase[patternIndex] == nameChar || this.toUpperCase[patternIndex] == nameChar))
    );
  }

  private indexOfWordStart(name: string, patternIndex: number, startFrom: number): number {
    const p: string = this.pattern[patternIndex];
    if (
      startFrom >= name.length ||
      (this.hasHumps &&
        this.isLowerCase[patternIndex] &&
        !(patternIndex > 0 && this.isWordSeparator[patternIndex - 1]))
    ) {
      return -1;
    }
    let i: number = startFrom;
    const isSpecialSymbol: boolean = !isLetterOrDigit(p);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      i = this.indexOfIgnoreCase(name, i, p, patternIndex);
      if (i < 0) return -1;

      if (isSpecialSymbol || isWordStart(name, i)) return i;

      i++;
    }
  }

  private indexOfIgnoreCase(
    name: string,
    fromIndex: number,
    p: string,
    patternIndex: number,
  ): number {
    const pUpper: string = this.toUpperCase[patternIndex];
    const pLower: string = this.toLowerCase[patternIndex];
    for (let i: number = fromIndex; i < name.length; i++) {
      const c: string = name.charAt(i);
      if (c == p || c.toUpperCase() == pUpper || c.toLowerCase() == pLower) {
        return i;
      }
    }
    return -1;
  }
}

const isDigit = (char: string): boolean => char >= '0' && char <= '9';
const isLetter = (char: string): boolean => /\p{Letter}/u.test(char);
const isWordSeparator = (char: string): boolean => /[\s_\-:+.()[\]]/.test(char);
const isLetterOrDigit = (char: string): boolean => /[\p{Letter}0-9]/u.test(char);

/**
 * Port of intellij-community's NameUtilCore::isWordStart
 *
 * ref: https://github.com/JetBrains/intellij-community/blob/0311a6f6f09de2da0c002c220362ca74ffda5aab/platform/util/base/src/com/intellij/util/text/NameUtilCore.java#L64-L80
 */
const isWordStart = (text: string, i: number): boolean => {
  const c = text.charAt(i);
  if (isUpperCase(c)) {
    if (i > 0 && isUpperCase(text.charAt(i - 1))) {
      // check that we're not in the middle of an all-caps word
      return i + 1 < text.length && isLowerCase(text.charAt(i + 1));
    }
    return true;
  }
  if (isDigit(c)) {
    return true;
  }
  if (!isLetter(c)) {
    return false;
  }
  return i == 0 || !isLetterOrDigit(text.charAt(i - 1));
};

// See https://github.com/KooiInc/PureHelpers/blob/e3382d8827da7a5d9769665f2dbf030bbb3a88f9/PureHelpers.js#L68-L75
const isUpperCase = (char: string): boolean => {
  return /[A-Z]|[\u0080-\u024F]/.test(char) && char === char.toUpperCase();
};
const isLowerCase = (char: string): boolean => {
  return /[A-Z]|[\u0080-\u024F]/i.test(char) && char === char.toLowerCase();
};

/**
 * Port of intellij-community's NameUtilCore::nextWord
 *
 * ref: https://github.com/JetBrains/intellij-community/blob/0311a6f6f09de2da0c002c220362ca74ffda5aab/platform/util/base/src/com/intellij/util/text/NameUtilCore.java#L37-L62
 */
const nextWord = (text: string, start: number): number => {
  if (!isLetterOrDigit(text.charAt(start))) {
    return start + 1;
  }

  let i: number = start;
  while (i < text.length && isDigit(text.charAt(i))) i++;
  if (i > start) {
    // digits form a separate hump
    return i;
  }

  while (i < text.length && isUpperCase(text.charAt(i))) i++;

  if (i > start + 1) {
    // several consecutive uppercase letter form a hump
    if (i == text.length || !isLetter(text.charAt(i))) {
      return i;
    }
    return i - 1;
  }

  if (i == start) i++;
  while (i < text.length && isLetter(text.charAt(i)) && !isWordStart(text, i)) i++;
  return i;
};
