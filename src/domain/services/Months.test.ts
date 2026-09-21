import { describe, expect, it } from 'vitest';
import {
  addMonths,
  addMonthsToDate,
  addYears,
  isValidIsoDate,
  lastDayOfMonth,
  monthKeyOfDate,
  monthKeyOfIso,
  monthRange,
  monthsBetween,
  toIsoDate,
} from './Months';

describe('Months', () => {
  it('formate le mois et la date locale avec des zéros', () => {
    const date = new Date(2026, 0, 5);
    expect(monthKeyOfDate(date)).toBe('2026-01');
    expect(toIsoDate(date)).toBe('2026-01-05');
    expect(monthKeyOfIso('2026-11-30')).toBe('2026-11');
  });

  it("ajoute et retire des mois en changeant d'année", () => {
    expect(addMonths('2026-09', 1)).toBe('2026-10');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-09', 60)).toBe('2031-09');
    expect(addMonths('2026-09', -21)).toBe('2024-12');
    expect(addMonths('2026-09', 0)).toBe('2026-09');
  });

  it('énumère une plage de mois inclusive', () => {
    expect(monthRange('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(monthRange('2026-06', '2026-06')).toEqual(['2026-06']);
    expect(monthRange('2026-07', '2026-06')).toEqual([]);
  });

  it('ajoute des mois à une date en gardant le jour, ramené à la fin du mois si besoin', () => {
    expect(addMonthsToDate('2026-01-31', 0)).toBe('2026-01-31');
    expect(addMonthsToDate('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsToDate('2026-01-31', 2)).toBe('2026-03-31'); // pas de dérive : le jour d'origine est conservé
    expect(addMonthsToDate('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsToDate('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonthsToDate('2026-05-30', 12)).toBe('2027-05-30');
  });

  it('compte les mois entre deux mois, dans les deux sens', () => {
    expect(monthsBetween('2026-09', '2026-09')).toBe(0);
    expect(monthsBetween('2026-09', '2027-09')).toBe(12);
    expect(monthsBetween('2026-11', '2027-02')).toBe(3);
    expect(monthsBetween('2026-09', '2026-08')).toBe(-1);
    expect(monthsBetween('2026-01', '2031-01')).toBe(60);
  });

  it('donne le dernier jour du mois, années bissextiles comprises', () => {
    expect(lastDayOfMonth('2026-09')).toBe('2026-09-30');
    expect(lastDayOfMonth('2026-12')).toBe('2026-12-31');
    expect(lastDayOfMonth('2026-02')).toBe('2026-02-28');
    expect(lastDayOfMonth('2028-02')).toBe('2028-02-29');
  });

  it('ajoute des années à une date, en ramenant le 29 février au 28', () => {
    expect(addYears('2026-09-21', 5)).toBe('2031-09-21');
    expect(addYears('2026-01-31', 1)).toBe('2027-01-31');
    expect(addYears('2024-02-29', 1)).toBe('2025-02-28');
    expect(addYears('2024-02-29', 4)).toBe('2028-02-29');
    expect(addYears('2026-09-21', 0)).toBe('2026-09-21');
  });

  it('valide les dates ISO réellement existantes', () => {
    expect(isValidIsoDate('2026-02-28')).toBe(true);
    expect(isValidIsoDate('2028-02-29')).toBe(true);
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('2026-04-31')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('26-01-01')).toBe(false);
    expect(isValidIsoDate('2026-1-1')).toBe(false);
    expect(isValidIsoDate('')).toBe(false);
  });
});
