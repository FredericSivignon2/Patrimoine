import type { BudgetHorizon } from '../../domain/models/Budget';

export interface HorizonOption {
  months: BudgetHorizon;
  /** Libellé abrégé, pour les sélecteurs étroits. */
  short: string;
  full: string;
  /** Complément de phrase : « Dépensable dans 2 ans ». */
  when: string;
}

export const HORIZON_OPTIONS: readonly HorizonOption[] = [
  { months: 0, short: 'Auj.', full: 'Aujourd’hui', when: 'aujourd’hui' },
  { months: 12, short: '1 an', full: 'Dans 1 an', when: 'dans 1 an' },
  { months: 24, short: '2 ans', full: 'Dans 2 ans', when: 'dans 2 ans' },
  { months: 36, short: '3 ans', full: 'Dans 3 ans', when: 'dans 3 ans' },
  { months: 60, short: '5 ans', full: 'Dans 5 ans', when: 'dans 5 ans' },
];

export function horizonOf(months: number): HorizonOption {
  return HORIZON_OPTIONS.find((option) => option.months === months) ?? HORIZON_OPTIONS[0];
}
