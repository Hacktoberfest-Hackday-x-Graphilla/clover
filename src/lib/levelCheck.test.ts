import { describe, expect, it } from 'vitest';
import type { Profile } from './types';
import {
  band6to5,
  effectiveLevel,
  fallbackGrade,
  isEligible,
  languageBand,
  validateGraderOutput,
} from './levelCheck';

describe('bands', () => {
  it('maps 0-6 to L1-L5', () => {
    expect(band6to5(0)).toBe(1);
    expect(band6to5(1)).toBe(2);
    expect(band6to5(2)).toBe(2);
    expect(band6to5(3)).toBe(3);
    expect(band6to5(4)).toBe(3);
    expect(band6to5(5)).toBe(4);
    expect(band6to5(6)).toBe(5);
  });
  it('maps language totals 0-10', () => {
    expect(languageBand(0)).toBe(1);
    expect(languageBand(1)).toBe(1);
    expect(languageBand(2)).toBe(2);
    expect(languageBand(4)).toBe(2);
    expect(languageBand(5)).toBe(3);
    expect(languageBand(6)).toBe(3);
    expect(languageBand(7)).toBe(4);
    expect(languageBand(9)).toBe(5);
    expect(languageBand(10)).toBe(5);
  });
});

describe('matching rule', () => {
  it('caps by git level + 1', () => {
    expect(effectiveLevel(5, 1)).toBe(2);
    expect(effectiveLevel(3, 2)).toBe(3);
    expect(effectiveLevel(2, 5)).toBe(2);
  });
  it('rejects unknown languages', () => {
    const profile: Profile = { git: 5, collab: 5, languages: { python: 5 }, hours: '5+', interests: [] };
    expect(isEligible(1, 'go', profile)).toBe(false);
    expect(isEligible(1, 'python', profile)).toBe(true);
    expect(isEligible(5, 'python', { ...profile, git: 1 })).toBe(false);
  });
});

describe('grader validation', () => {
  it('accepts valid JSON', () => {
    expect(validateGraderOutput('{"score": 3, "reason": "Names crash and fix."}')).toEqual({
      score: 3,
      reason: 'Names crash and fix.',
    });
  });
  it('rejects out of range and junk', () => {
    expect(validateGraderOutput('{"score": 9, "reason": "x"}')).toBeNull();
    expect(validateGraderOutput('not json')).toBeNull();
    expect(validateGraderOutput('{"score": 2}')).toBeNull();
  });
  it('strips fences', () => {
    expect(validateGraderOutput('```json\n{"score": 2, "reason": "Names crash, vague fix."}\n```')?.score).toBe(2);
  });
  it('fallback is score 1', () => {
    expect(fallbackGrade().score).toBe(1);
  });
});
