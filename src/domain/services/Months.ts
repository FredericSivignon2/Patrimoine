import type { MonthKey } from '../models/Projection';

const pad = (value: number, length: number): string => String(value).padStart(length, '0');

/** Mois (calendrier local) d'un objet Date. */
export function monthKeyOfDate(date: Date): MonthKey {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}`;
}

/** Mois d'une date ISO `YYYY-MM-DD` (sans conversion de fuseau). */
export function monthKeyOfIso(isoDate: string): MonthKey {
  return isoDate.slice(0, 7);
}

/** Date du jour au format ISO `YYYY-MM-DD` (calendrier local). */
export function toIsoDate(date: Date): string {
  return `${monthKeyOfDate(date)}-${pad(date.getDate(), 2)}`;
}

export function addMonths(month: MonthKey, count: number): MonthKey {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const total = year * 12 + monthIndex + count;
  const newYear = Math.floor(total / 12);
  return `${pad(newYear, 4)}-${pad(total - newYear * 12 + 1, 2)}`;
}

/**
 * Ajoute des mois à une date ISO en gardant le jour du mois (ramené au dernier jour du mois s'il n'existe pas :
 * le 31 janvier + 1 mois = le 28 février, mais + 2 mois = le 31 mars).
 */
export function addMonthsToDate(isoDate: string, count: number): string {
  const day = Number(isoDate.slice(8, 10));
  const target = addMonths(monthKeyOfIso(isoDate), count);
  const [year, month] = target.split('-').map(Number);
  return `${target}-${pad(Math.min(day, new Date(year, month, 0).getDate()), 2)}`;
}

/** Nombre de mois de `from` à `to` (négatif si `to` précède `from`). */
export function monthsBetween(from: MonthKey, to: MonthKey): number {
  const index = (month: MonthKey): number => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
  return index(to) - index(from);
}

/** Dernier jour du mois, au format ISO `YYYY-MM-DD`. */
export function lastDayOfMonth(month: MonthKey): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${month}-${pad(new Date(year, monthNumber, 0).getDate(), 2)}`;
}

/** Ajoute des années à une date ISO ; le 29 février devient le 28 les années non bissextiles. */
export function addYears(isoDate: string, years: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const newYear = year + years;
  const lastDay = new Date(newYear, month, 0).getDate();
  return `${pad(newYear, 4)}-${pad(month, 2)}-${pad(Math.min(day, lastDay), 2)}`;
}

/** Mois de `from` à `to` inclus ; vide si `from` est postérieur à `to`. */
export function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
  const months: MonthKey[] = [];
  for (let month = from; month <= to; month = addMonths(month, 1)) {
    months.push(month);
  }
  return months;
}

/** Valide une date ISO `YYYY-MM-DD` réellement existante (29 février, mois à 30 jours…). */
export function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
