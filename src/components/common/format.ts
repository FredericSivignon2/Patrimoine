import type { MonthKey } from '../../domain/models/Projection';

const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const signedEuros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', signDisplay: 'exceptZero' });
const compactEuros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const wholeEuros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

// Les centimes sont des entiers ; la division par 100 ne sert qu'à l'affichage.
export const formatEuros = (cents: number): string => euros.format(cents / 100);
export const formatSignedEuros = (cents: number): string => signedEuros.format(cents / 100);
export const formatCompactEuros = (cents: number): string => compactEuros.format(cents / 100);
/** Montant arrondi à l'euro, pour les aperçus où la précision au centime n'importe pas. */
export const formatWholeEuros = (cents: number): string => wholeEuros.format(cents / 100);
export const formatPercent = (value: number): string => `${percent.format(value)} %`;
/** « 1 échéance », « 3 échéances » ; le pluriel est à fournir quand il n'est pas un simple « s » final. */
export const formatCount = (count: number, singular: string, plural = `${singular}s`): string =>
  `${count} ${count > 1 ? plural : singular}`;

/** « X bloqués », « Y réservés » (montants nuls omis) : le détail d'un compte dont une part n'est pas déblocable. */
export function lockedSegments(locked: number, reserved: number): string[] {
  const segments: string[] = [];
  if (locked > 0) segments.push(`${formatEuros(locked)} bloqués`);
  if (reserved > 0) segments.push(`${formatEuros(reserved)} réservés`);
  return segments;
}

function dateOf(year: number, month: number, day = 1): Date {
  return new Date(year, month - 1, day);
}

export function formatMonth(month: MonthKey, style: 'short' | 'long' = 'long'): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', {
    month: style === 'long' ? 'long' : 'short',
    year: style === 'long' ? 'numeric' : '2-digit',
  }).format(dateOf(year, monthNumber));
}

/** « 12 sept. 2026 » à partir d'une date ISO `YYYY-MM-DD`. */
export function formatFullDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    dateOf(year, month, day),
  );
}

/** « 12 sept. » à partir d'une date ISO `YYYY-MM-DD`. */
export function formatDay(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(dateOf(year, month, day));
}
