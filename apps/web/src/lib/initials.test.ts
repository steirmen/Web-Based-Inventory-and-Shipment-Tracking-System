import { describe, expect, it } from 'vitest';
import { initials } from './initials';

describe('initials', () => {
  it.each([
    ['Morgan Lane', 'ML'],
    ['ada', 'A'],
    ['  Mary   Ann  Smith ', 'MS'],
    ['', ''],
  ])('%j → %j', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});
