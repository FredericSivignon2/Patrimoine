import { Link } from 'react-router-dom';
import type { BudgetPlan } from '../../domain/services/BudgetEngine';
import { Card } from '../common/Card';
import { formatEuros, formatPercent } from '../common/format';
import { paletteColor } from '../common/palette';
import { AllocationBar } from './AllocationBar';

const VISIBLE_BUDGETS = 4;

interface BudgetsSummaryCardProps {
  plan: BudgetPlan;
  hasSafety: boolean;
  /** Nombre d'objectifs que le pourcentage actuel n'atteint pas à l'échéance. */
  objectivesNotReached: number;
}

/** Tableau de bord : ce que l'on peut dépenser, réparti par poste (ce qu'il reste à dépenser sur chacun). */
export function BudgetsSummaryCard({ plan, hasSafety, objectivesNotReached }: BudgetsSummaryCardProps) {
  const visible = plan.shares.slice(0, VISIBLE_BUDGETS);
  const hidden = plan.shares.length - visible.length;

  return (
    <Card
      title="Ce que vous pouvez dépenser"
      action={
        <Link to="/postes" className="text-sm font-semibold text-teal-700 hover:underline">
          {plan.shares.length > 0 ? 'Gérer les postes' : 'Créer un poste'}
        </Link>
      }
    >
      <p className="text-3xl font-bold tabular-nums text-slate-900">{formatEuros(plan.spendable)}</p>
      <p className="text-xs text-slate-500">
        {hasSafety ? 'au-dessus du seuil de sécurité' : 'aucun seuil de sécurité défini : tout le déblocable est compté'}
      </p>

      {plan.shares.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">
          Répartissez ce montant en postes (vacances, travaux, voiture…) pour savoir combien consacrer à chacun.
        </p>
      ) : (
        <>
          <div className="mt-4">
            <AllocationBar shares={plan.shares} unallocatedPercent={plan.unallocatedPercent} />
          </div>
          <ul className="mt-2 divide-y divide-slate-100">
            {visible.map((share, index) => (
              <li key={share.budget.id} className="flex items-center gap-3 py-2.5">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: paletteColor(index) }} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">{share.budget.name}</span>
                  <span className="block text-xs text-slate-500">
                    {formatPercent(share.budget.percent)}
                    {share.spent > 0 && ` · dépensé ${formatEuros(share.spent)}`}
                  </span>
                </span>
                <span
                  className={`font-semibold tabular-nums ${share.remaining < 0 ? 'text-rose-700' : 'text-slate-900'}`}
                >
                  {formatEuros(share.remaining)}
                </span>
              </li>
            ))}
            {hidden > 0 && (
              <li className="py-2.5 text-xs text-slate-500">
                + {hidden} autre{hidden > 1 ? 's' : ''} poste{hidden > 1 ? 's' : ''}
              </li>
            )}
            <li className="flex items-center gap-3 py-2.5 text-slate-500">
              <span className="size-2.5 shrink-0 rounded-full bg-slate-300" aria-hidden="true" />
              <span className="min-w-0 flex-1 text-sm">
                Non affecté
                <span className="block text-xs">{formatPercent(plan.unallocatedPercent)}</span>
              </span>
              <span className="font-semibold tabular-nums">{formatEuros(plan.unallocatedAmount)}</span>
            </li>
          </ul>
        </>
      )}

      {objectivesNotReached > 0 && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          {objectivesNotReached === 1
            ? '1 objectif n’est pas atteint à son échéance'
            : `${objectivesNotReached} objectifs ne sont pas atteints à leur échéance`}{' '}
          avec les pourcentages actuels.{' '}
          <Link to="/postes" className="font-semibold underline">
            Voir les objectifs
          </Link>
        </p>
      )}
    </Card>
  );
}
