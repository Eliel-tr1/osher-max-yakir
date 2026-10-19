import { describe, expect, it } from 'vitest';
import { cleanText, parseAmount, parseCsv, parseSheetDate } from '../lib/sheet/parse';

describe('parseCsv', () => {
  it('handles quotes, commas and newlines inside cells, and CRLF', () => {
    const text = '﻿a,b,c\r\n"x, y","line1\nline2","say ""hi"""\r\n1,,3';
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'line1\nline2', 'say "hi"'],
      ['1', '', '3'],
    ]);
  });
});

describe('parseSheetDate', () => {
  it('reads the sheet format in Israel time, summer and winter, with or without seconds', () => {
    expect(parseSheetDate('30/09/2026 10:09:41')?.toISOString()).toBe('2026-09-30T07:09:41.000Z');
    expect(parseSheetDate('09/12/2025 22:24')?.toISOString()).toBe('2025-12-09T20:24:00.000Z');
    expect(parseSheetDate('9/7/2025')?.toISOString()).toBe('2025-07-08T21:00:00.000Z');
  });

  it('rejects what is not a real date', () => {
    expect(parseSheetDate('')).toBeNull();
    expect(parseSheetDate('31/02/2026')).toBeNull();
    expect(parseSheetDate('2026-10-01')).toBeNull();
  });
});

describe('parseAmount', () => {
  it('cleans signs, currency and separators', () => {
    expect(parseAmount('- 990')).toBe(990);
    expect(parseAmount('₪2,400')).toBe(2400);
    expect(parseAmount('99.99')).toBe(99.99);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('לא שולם')).toBeNull();
  });
});

describe('cleanText', () => {
  it('drops HTML tags, the placeholder "-" and extra spaces', () => {
    expect(cleanText('Lightning challenge 1 step<span> - </span>MT5, 100k')).toBe('Lightning challenge 1 step - MT5, 100k');
    expect(cleanText(' - ')).toBeNull();
    expect(cleanText('')).toBeNull();
    expect(cleanText(undefined)).toBeNull();
  });
});
