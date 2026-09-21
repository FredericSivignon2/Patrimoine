import { PROJECTION_HORIZONS } from './Projection';

/** Poste de dépense (vacances, travaux, voiture…) : une part du patrimoine dépensable. */
export interface Budget {
  id: string;
  name: string;
  /** Part du dépensable allouée au poste, en pourcentage (25 = 25 %), au plus 2 décimales. */
  percent: number;
  /** Objectif : montant visé en centimes (entier > 0). Toujours renseigné avec `targetDate`. */
  targetAmount?: number;
  /** Objectif : échéance au format ISO `YYYY-MM-DD`. Toujours renseignée avec `targetAmount`. */
  targetDate?: string;
}

export type NewBudget = Omit<Budget, 'id'>;
export type BudgetPatch = Partial<NewBudget>;

/** Noms proposés à la création d'un poste. */
export const BUDGET_SUGGESTIONS: readonly string[] = ['Vacances', 'Travaux', 'Voiture', 'Loisirs'];

/** Échéances (en mois) auxquelles on regarde les budgets : 0 = aujourd'hui, puis 1, 2, 3 et 5 ans. */
export const BUDGET_HORIZONS = [0, ...PROJECTION_HORIZONS] as const;
export type BudgetHorizon = (typeof BUDGET_HORIZONS)[number];
