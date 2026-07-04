import { describe, expect, it } from 'vitest';
import { shortPlayerName } from './player-name';

describe('shortPlayerName', () => {
  it.each([
    ['Jonathan Jones', 'Jones'],
    ['Wendelin Pietsch', 'Pietsch'],
    ['Elen de Mattos', 'de Mattos'],
    ['Vitor do Monte', 'do Monte'],
    ['Mariadel Paez', 'Paez'],
    ['Neuer', 'Neuer'],
  ])('formats %s as %s', (name, expected) => {
    expect(shortPlayerName(name)).toBe(expected);
  });
});
