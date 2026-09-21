import type { ObjectiveEntry, ObjectivesSummary } from '../../domain/services/BudgetEngine';
import { monthKeyOfIso } from '../../domain/services/Months';
import { Card } from '../common/Card';
import { formatEuros, formatMonth, formatPercent } from '../common/format';
import { ObjectiveStatus, objectiveStatus } from './ObjectiveStatus';

interface ObjectivesCardProps {
  entries: ObjectiveEntry[];
  summary: ObjectivesSummary;
}

const BAR_COLORS = { reached: 'bg-emerald-500', short: 'bg-amber-500', unreachable: 'bg-rose-500' };

/** Objectifs des postes : atteints ou non à leur échéance, et besoin cumulé en pourcentage. */
export function ObjectivesCard({ entries, summary }: ObjectivesCardProps) {
  return (
    <Card title="Objectifs">
      {summary.overCommitted && (
        <p role="alert" className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
          {summary.totalRequiredPercent > 100
            ? `Vos objectifs demandent ensemble ${formatPercent(summary.totalRequiredPercent)} du dépensable (chacun évalué à son échéance) : ils ne peuvent pas tous être financés.`
            : 'Rien ne serait dépensable à l’échéance de certains objectifs : ils ne peuvent pas être financés.'}
        </p>
      )}
      <ul className="divide-y divide-slate-100">
        {entries.map(({ budget, outcome }) => {
          const ratio = Math.min(1, outcome.projected / outcome.target);
          return (
            <li key={budget.id} aria-label={`Objectif ${budget.name}`} className="space-y-2 py-3 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-medium text-slate-900">{budget.name}</span>
                <span className="font-semibold tabular-nums text-slate-900">{formatEuros(outcome.target)}</span>
              </div>
              <p className="-mt-1 text-xs capitalize text-slate-500">
                Échéance : {formatMonth(monthKeyOfIso(budget.targetDate ?? ''))}
              </p>
              <div
                role="progressbar"
                aria-label={`Progression de l’objectif ${budget.name}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(ratio * 100)}
                className="h-2 overflow-hidden rounded-full bg-slate-200"
              >
                <div
                  className={`h-full rounded-full ${BAR_COLORS[objectiveStatus(outcome)]}`}
                  style={{ width: `${ratio * 100}%` }}
                />
              </div>
              <ObjectiveStatus outcome={outcome} percent={budget.percent} />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
