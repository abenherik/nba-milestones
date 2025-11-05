import { describe, it, expect } from 'vitest';

describe('milestones API param parsing (doc test)', () => {
  it('parses includePlayoffs flag and ageCount bounds', () => {
    const include = (v: string | null) => v === '1' || v === 'true';
    const clampAgeCount = (v: string | null) => Math.max(1, Math.min(10, Number(v ?? 5)));
    expect(include('1')).toBe(true);
    expect(include('true')).toBe(true);
    expect(include('0')).toBe(false);
    expect(include(null)).toBe(false);
    expect(clampAgeCount('0')).toBe(1);
    expect(clampAgeCount('11')).toBe(10);
    expect(clampAgeCount('5')).toBe(5);
  });
});
