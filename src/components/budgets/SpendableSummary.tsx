import type { BudgetHorizon } from '../../domain/models/Budget';
import type { BudgetPlan } from '../../domain/services/BudgetEngine';
import { formatEuros } from '../common/format';
import { horizonOf } from './horizons';

interface SpendableSummaryProps {
  plan: BudgetPlan;
  /** Échéance affichée, en mois (0 = aujourd'hui). */
  months: BudgetHorizon;
  hasSafety: boolean;
  onEditSafety: () => void;
}

/** Ce qui peut être dépensé à une échéance : patrimoine déblocable moins seuil d'épargne de sécurité. */
export function SpendableSummary({ plan, months, hasSafety, onEditSafety }: SpendableSummaryProps) {
  const today = months === 0;

  return (
    <section aria-label="Dépensable" className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm text-slate-500">Dépensable {horizonOf(months).when}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{formatEuros(plan.spendable)}</p>
      <p className="mt-1 text-sm text-slate-500">
        {today ? 'Déblocable' : 'Déblocable projeté'} {formatEuros(plan.available)} moins seuil de sécurité{' '}
        {formatEuros(plan.threshold)}.
      </p>
      {!today && (
        <p className="mt-1 text-xs text-slate-500">
          Projection sans nouvelle dépense : elle suppose que vous ne prélevez rien sur ces fonds d’ici là.
        </p>
      )}

      {!hasSafety && (
        <p className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          <span>Aucun seuil de sécurité défini : tout le déblocable est compté comme dépensable.</span>
          <button
            type="button"
            onClick={onEditSafety}
            className="shrink-0 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-semibold hover:bg-amber-200"
          >
            Définir le seuil
          </button>
        </p>
      )}
      {hasSafety && plan.spendable === 0 && (
        <p role="status" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
          {today
            ? 'Vous êtes au niveau du seuil de sécurité, ou en dessous : rien n’est dépensable pour l’instant.'
            : 'À cette échéance, vous seriez au niveau du seuil de sécurité, ou en dessous : rien ne serait dépensable.'}
        </p>
      )}
    </section>
  );
}
