import { describe, expect, test } from 'bun:test';
import { isSafeHttpHeaderValue } from '../mask.ts';

describe('isSafeHttpHeaderValue', () => {
  test('accepts regular API key values', () => {
    expect(isSafeHttpHeaderValue('sk-ant-api03-abc123XYZ')).toBe(true);
  });

  test('accepts latin-1 values', () => {
    expect(isSafeHttpHeaderValue('token-é')).toBe(true);
  });

  test('rejects masked bullet characters', () => {
    expect(isSafeHttpHeaderValue('sk-9716b••••9a8d')).toBe(false);
  });

  test('rejects control characters', () => {
    expect(isSafeHttpHeaderValue('sk-ant-\nabc')).toBe(false);
  });

  test('rejects non-latin-1 characters', () => {
    expect(isSafeHttpHeaderValue('key-😀')).toBe(false);
  });

  test('rejects nullish values', () => {
    expect(isSafeHttpHeaderValue(undefined)).toBe(false);
    expect(isSafeHttpHeaderValue(null)).toBe(false);
  });
});
