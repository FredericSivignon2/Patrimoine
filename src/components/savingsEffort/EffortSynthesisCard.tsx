import type { EffortWindow, SavingsCapacity } from '../../domain/services/SavingsEffortEngine';
import { Card } from '../common/Card';
import { formatEuros } from '../common/format';
import { EFFORT_LEVEL_DOT, EFFORT_LEVEL_LABELS } from './effortLevel';

const WINDOW_LABELS: Record<number, string> = { 3: '3 derniers mois', 6: '6 derniers mois', 12: '1 an', 24: '2 ans' };

interface EffortSynthesisCardProps {
  capacity: SavingsCapacity;
  windows: readonly EffortWindow[];
}

/** Capacité mensuelle détaillée, puis le réalisé comparé à l'objectif sur plusieurs fenêtres (3 mois, 6 mois, 1 an, 2 ans). */
export function EffortSynthesisCard({ capacity, windows }: EffortSynthesisCardProps) {
  return (
    <Card title="Synthèse de l’effort d’épargne">
      <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-slate-500">Revenus</dt>
          <dd className="font-semibold tabular-nums text-slate-900">{formatEuros(capacity.income)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Prêts</dt>
          <dd className="font-semibold tabular-nums text-slate-900">−{formatEuros(capacity.loanPayments)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Postes (moyenne)</dt>
          <dd className="font-semibold tabular-nums text-slate-900">−{formatEuros(capacity.budgetProvisions)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Objectif mensuel</dt>
          <dd className="font-semibold tabular-nums text-teal-700">{formatEuros(capacity.target)}</dd>
        </div>
      </dl>
      <ul className="divide-y divide-slate-100">
        {windows.map((window) => (
          <li key={window.months} className="flex items-center justify-between gap-3 py-2.5">
            <span className="flex min-w-0 items-center gap-2">
              <span className={`size-2.5 shrink-0 rounded-full ${EFFORT_LEVEL_DOT[window.level]}`} aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-900">
                  {WINDOW_LABELS[window.months] ?? `${window.months} mois`}
                </span>
                {window.availableMonths === 0 ? (
                  <span className="block text-xs text-slate-500">Historique insuffisant</span>
                ) : (
                  <span className="block text-xs text-slate-500">
                    {EFFORT_LEVEL_LABELS[window.level]}
                    {window.availableMonths < window.months && ` (sur ${window.availableMonths} mois disponibles)`}
                  </span>
                )}
              </span>
            </span>
            <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">
              {window.availableMonths === 0 ? '—' : `${formatEuros(window.realized)} / ${formatEuros(window.target)}`}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
