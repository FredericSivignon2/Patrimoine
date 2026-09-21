/**
 * Arithmétique financière : tous les montants sont des entiers en centimes.
 * Aucune multiplication de flottants n'est utilisée pour passer d'un montant saisi à des centimes.
 */
export type Cents = number;

/** Montant saisi (« 12,50 », « 1 234.5 », « -3 ») vers des centimes. `null` si invalide (plus de 2 décimales inclus). */
export function parseAmountToCents(input: string): Cents | null {
  const normalized = input.replace(/[\s  ]/g, '').replace(',', '.');
  const match = /^(-)?(\d*)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  const [, sign, integerPart = '', fraction = ''] = match;
  if (integerPart === '' && fraction === '') return null;
  const cents = Number(integerPart || '0') * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return null;
  return sign ? -cents : cents;
}

/** Centimes vers une chaîne de saisie française (« 12,50 »). */
export function centsToInputString(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const fraction = String(absolute % 100).padStart(2, '0');
  return `${sign}${Math.floor(absolute / 100)},${fraction}`;
}

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce((total, value) => total + value, 0);
}

/** Pourcentage saisi (« 25 », « 12,5 », « 2.75 ») ; `null` s'il est invalide ou a plus de 2 décimales. */
export function parsePercent(input: string): number | null {
  const text = input.trim();
  return /^\d+(?:[.,]\d{1,2})?$/.test(text) ? Number(text.replace(',', '.')) : null;
}

/** Pourcentage vers points de base entiers (1 % = 100), pour rester en arithmétique entière. */
export function percentToBasisPoints(percent: number): number {
  return Math.round(percent * 100);
}

/** Part d'un montant en points de base, arrondie au centime INFÉRIEUR : la somme des parts ne dépasse jamais le total. */
export function shareOf(amount: Cents, basisPoints: number): Cents {
  if (amount <= 0 || basisPoints <= 0) return 0;
  const product = amount * basisPoints;
  return (product - (product % 10_000)) / 10_000;
}

/**
 * Intérêts d'un mois, arrondis au centime : `solde × taux annuel / 12`.
 * Le taux est converti en points de base pour rester en arithmétique entière.
 * Aucun intérêt (ni débit) n'est calculé sur un solde négatif ou nul.
 */
export function monthlyInterest(balance: Cents, annualRatePercent: number): Cents {
  const basisPoints = percentToBasisPoints(annualRatePercent);
  if (balance <= 0 || basisPoints <= 0) return 0;
  return Math.round((balance * basisPoints) / (12 * 10_000));
}
