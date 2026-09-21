import { useCallback, useMemo } from 'react';
import { useFinancial } from '../context/FinancialContext';
import type { BudgetPatch, NewBudget } from '../domain/models/Budget';
import {
  evaluateObjectives,
  planBudgetsOverTime,
  remainingPercent,
  spendableTimeline,
  summarizeObjectives,
  totalSpent,
} from '../domain/services/BudgetEngine';
import { spentByBudget } from '../domain/services/SpendingReport';
import { useProjections } from './useProjections';

/**
 * Postes de dépense : répartition du dépensable (déblocable moins seuil de sécurité) aujourd'hui, dans 1, 2, 3 et
 * 5 ans, et évaluation de leurs objectifs. Les projections supposent qu'aucune dépense n'est prélevée d'ici là ;
 * les retraits de l'année déjà rattachés à un poste sont déduits de l'enveloppe de ce poste.
 */
export function useBudgets() {
  const { budgets, movements, safety, budgetRepository } = useFinancial();
  const { projection } = useProjections();
  const { points } = projection;

  const spent = useMemo(() => spentByBudget(movements, budgets, new Date().getFullYear()), [movements, budgets]);
  const spentTotal = useMemo(() => totalSpent(budgets, spent), [budgets, spent]);

  const plans = useMemo(() => planBudgetsOverTime(points, safety, budgets, spent), [points, safety, budgets, spent]);
  /** Dépensable mois par mois (index 0 = aujourd'hui), pour évaluer des objectifs à n'importe quelle échéance. */
  const timeline = useMemo(() => spendableTimeline(points, safety), [points, safety]);
  const startMonth = points[0].month;
  const objectives = useMemo(
    () => evaluateObjectives(budgets, timeline, startMonth, spent),
    [budgets, timeline, startMonth, spent],
  );
  const objectivesSummary = useMemo(() => summarizeObjectives(objectives), [objectives]);

  const createBudget = useCallback((input: NewBudget) => budgetRepository.create(input), [budgetRepository]);
  const updateBudget = useCallback(
    (id: string, patch: BudgetPatch) => budgetRepository.update(id, patch),
    [budgetRepository],
  );
  const removeBudget = useCallback((id: string) => budgetRepository.remove(id), [budgetRepository]);
  /** Pourcentage encore libre pour un poste (en ignorant le poste `excludingId` que l'on modifie). */
  const freePercent = useCallback((excludingId?: string) => remainingPercent(budgets, excludingId), [budgets]);

  return {
    budgets,
    plans,
    /** Répartition d'aujourd'hui. */
    plan: plans[0],
    timeline,
    startMonth,
    /** Dépensé cette année sur chaque poste, et au total. */
    spent,
    spentTotal,
    objectives,
    objectivesSummary,
    hasSafety: safety !== undefined,
    createBudget,
    updateBudget,
    removeBudget,
    freePercent,
  };
}
