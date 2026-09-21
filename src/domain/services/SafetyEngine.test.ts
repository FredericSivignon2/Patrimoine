import { describe, expect, it } from 'vitest';
import type { SafetySettings } from '../models/Safety';
import { evaluateSafety } from './SafetyEngine';

// Seuil 10 000 €, marge de confort 5 000 €.
const SETTINGS: SafetySettings = { threshold: 1_000_000, comfortMargin: 500_000 };
const levelAt = (available: number, settings = SETTINGS) => evaluateSafety(available, settings).level;

describe('evaluateSafety', () => {
  it('est vert au-delà de la marge de confort', () => {
    expect(levelAt(1_500_001)).toBe('ok');
    expect(levelAt(5_000_000)).toBe('ok');
  });

  it('passe au jaune quand il ne reste que 5 000 € au-dessus du seuil', () => {
    expect(levelAt(1_500_000)).toBe('warning');
    expect(levelAt(1_200_000)).toBe('warning');
    expect(levelAt(1_100_001)).toBe('warning');
  });

  it('passe à l’orange dans le dernier millier d’euros, seuil compris', () => {
    expect(levelAt(1_100_000)).toBe('alert');
    expect(levelAt(1_050_000)).toBe('alert');
    expect(levelAt(1_000_000)).toBe('alert');
  });

  it('passe au rouge sous le seuil', () => {
    expect(levelAt(999_999)).toBe('critical');
    expect(levelAt(0)).toBe('critical');
    expect(levelAt(-50_000)).toBe('critical');
  });

  it('renvoie la marge, positive ou négative', () => {
    expect(evaluateSafety(1_234_500, SETTINGS)).toEqual({
      level: 'warning',
      available: 1_234_500,
      threshold: 1_000_000,
      margin: 234_500,
    });
    expect(evaluateSafety(900_000, SETTINGS).margin).toBe(-100_000);
  });

  it('plafonne la bande orange à la marge de confort', () => {
    const narrow: SafetySettings = { threshold: 1_000_000, comfortMargin: 30_000 };
    expect(levelAt(1_030_000, narrow)).toBe('alert'); // marge = 300 € = toute la marge de confort
    expect(levelAt(1_030_001, narrow)).toBe('ok');
  });

  it('gère une marge de confort nulle', () => {
    const none: SafetySettings = { threshold: 1_000_000, comfortMargin: 0 };
    expect(levelAt(1_000_000, none)).toBe('alert');
    expect(levelAt(1_000_001, none)).toBe('ok');
    expect(levelAt(999_999, none)).toBe('critical');
  });

  it('accepte un seuil nul', () => {
    const zero: SafetySettings = { threshold: 0, comfortMargin: 500_000 };
    expect(levelAt(600_000, zero)).toBe('ok');
    expect(levelAt(-1, zero)).toBe('critical');
  });
});
