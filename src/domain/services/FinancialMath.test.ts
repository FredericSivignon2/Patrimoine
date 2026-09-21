import { describe, expect, it } from 'vitest';
import {
  centsToInputString,
  monthlyInterest,
  parseAmountToCents,
  parsePercent,
  percentToBasisPoints,
  shareOf,
  sumCents,
} from './FinancialMath';

describe('parsePercent', () => {
  it.each([
    ['25', 25],
    ['12,5', 12.5],
    ['2.75', 2.75],
    ['0', 0],
    [' 30 ', 30],
  ])('lit « %s »', (input, expected) => {
    expect(parsePercent(input)).toBe(expected);
  });

  it.each(['', ' ', 'abc', '-5', '12,345', '5.', ',5', '1e2', '12 %'])('rejette « %s »', (input) => {
    expect(parsePercent(input)).toBeNull();
  });
});

describe('percentToBasisPoints', () => {
  it('convertit un pourcentage en points de base entiers', () => {
    expect(percentToBasisPoints(25)).toBe(2_500);
    expect(percentToBasisPoints(12.5)).toBe(1_250);
    expect(percentToBasisPoints(0)).toBe(0);
  });

  it('évite les erreurs de flottants (3,1 × 100 = 310,00000000000006)', () => {
    expect(percentToBasisPoints(3.1)).toBe(310);
    expect(percentToBasisPoints(0.29)).toBe(29);
    expect(percentToBasisPoints(1.15)).toBe(115);
  });
});

describe('shareOf', () => {
  it('calcule une part exacte quand elle tombe juste', () => {
    expect(shareOf(1_000_000, 2_500)).toBe(250_000);
    expect(shareOf(755_000, 10_000)).toBe(755_000);
    expect(shareOf(12_345, 0)).toBe(0);
  });

  it('arrondit toujours vers le bas', () => {
    expect(shareOf(1_001, 3_333)).toBe(333); // 333,63
    expect(shareOf(1, 9_999)).toBe(0);
    expect(shareOf(99, 5_000)).toBe(49); // 49,5
  });

  it('reste exact sur de gros montants', () => {
    expect(shareOf(100_000_000_000, 3_333)).toBe(33_330_000_000);
    expect(shareOf(99_999_999_999, 10_000)).toBe(99_999_999_999);
  });

  it('renvoie 0 pour un montant ou une part négatifs ou nuls', () => {
    expect(shareOf(-100, 5_000)).toBe(0);
    expect(shareOf(0, 5_000)).toBe(0);
    expect(shareOf(100, -5_000)).toBe(0);
  });
});

describe('parseAmountToCents', () => {
  it.each([
    ['12,50', 1250],
    ['12.5', 1250],
    ['12', 1200],
    ['0,05', 5],
    [',5', 50],
    ['-3', -300],
    ['-0,10', -10],
    ['1 234,56', 123_456],
    ['1 234,56', 123_456],
    ['1 234,56', 123_456],
    ['  42  ', 4200],
  ])('convertit « %s » en %i centimes', (input, expected) => {
    expect(parseAmountToCents(input)).toBe(expected);
  });

  it('évite les erreurs de flottants (19,99 × 100 = 1998,9999…)', () => {
    expect(parseAmountToCents('19,99')).toBe(1999);
    expect(parseAmountToCents('0,29')).toBe(29);
    expect(parseAmountToCents('1.15')).toBe(115);
  });

  it.each(['', ' ', '-', ',', '.', 'abc', '12,345', '5.', '1e3', '12,5,0', '--3', '12 €'])(
    'rejette « %s »',
    (input) => {
      expect(parseAmountToCents(input)).toBeNull();
    },
  );

  it('rejette les montants hors des entiers sûrs', () => {
    expect(parseAmountToCents('99999999999999999')).toBeNull();
  });
});

describe('centsToInputString', () => {
  it.each([
    [1250, '12,50'],
    [5, '0,05'],
    [0, '0,00'],
    [-1250, '-12,50'],
    [-5, '-0,05'],
    [100_000, '1000,00'],
  ])('formate %i centimes en « %s »', (cents, expected) => {
    expect(centsToInputString(cents)).toBe(expected);
  });

  it('est réversible avec parseAmountToCents', () => {
    for (const cents of [0, 1, 99, 100, 123_456, -7_005]) {
      expect(parseAmountToCents(centsToInputString(cents))).toBe(cents);
    }
  });
});

describe('monthlyInterest', () => {
  it('calcule solde × taux / 12', () => {
    expect(monthlyInterest(100_000, 12)).toBe(1_000);
    expect(monthlyInterest(1_200_000, 3)).toBe(3_000);
  });

  it('gère un taux décimal sans erreur de flottant', () => {
    expect(monthlyInterest(1_200_000, 3.1)).toBe(3_100);
  });

  it('arrondit au centime (0,5 vers le haut)', () => {
    expect(monthlyInterest(100_050, 3)).toBe(250); // 250,125
    expect(monthlyInterest(1_000, 3)).toBe(3); // 2,5
    expect(monthlyInterest(100, 3)).toBe(0); // 0,25
  });

  it('vaut 0 sans taux ou sur un solde négatif ou nul', () => {
    expect(monthlyInterest(100_000, 0)).toBe(0);
    expect(monthlyInterest(-100_000, 5)).toBe(0);
    expect(monthlyInterest(0, 5)).toBe(0);
  });
});

describe('sumCents', () => {
  it('additionne des centimes', () => {
    expect(sumCents([10, 20, -5])).toBe(25);
    expect(sumCents([])).toBe(0);
  });
});
