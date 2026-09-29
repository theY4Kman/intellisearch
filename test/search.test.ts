import { describe, expect, it } from 'vitest';
import { intelliSearch } from '../src/index';

describe('intelliSearch', () => {
  it('matches CamelHumps', () => {
    expect(intelliSearch('CU', ['CurrentUser', 'Other'])).toEqual(['CurrentUser']);
  });
});
