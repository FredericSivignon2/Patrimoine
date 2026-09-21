import type { LoansProjection } from '../../domain/services/LoanEngine';
import { formatEuros } from '../common/format';
import { HORIZON_OPTIONS } from '../budgets/horizons';

interface LoansSummaryProps {
  outstanding: number;
  monthlyPayments: number;
  remainingInterest: number;
  projection: LoansProjection;
}

/** Synthèse de tous les prêts : capital restant dû, mensualités et évolution à 1, 2, 3 et 5 ans. */
export function LoansSummary({ outstanding, monthlyPayments, remainingInterest, projection }: LoansSummaryProps) {
  return (
    <div className="space-y-3">
      <section
        aria-label="Synthèse des prêts"
        className="rounded-3xl bg-linear-to-br from-slate-700 to-slate-900 p-5 text-white shadow-sm sm:p-6"
      >
        <p className="text-sm text-slate-300">Capital restant dû</p>
        <p className="mt-1 text-3xl font-bold tabular-nums sm:text-4xl">{formatEuros(outstanding)}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div title="Mensualités et assurances dues ce mois-ci, tous prêts confondus">
            <dt className="text-xs text-slate-300">Mensualités ce mois-ci</dt>
            <dd className="font-semibold tabular-nums">{formatEuros(monthlyPayments)}</dd>
          </div>
          <div title="Intérêts des échéances à venir">
            <dt className="text-xs text-slate-300">Intérêts restants</dt>
            <dd className="font-semibold tabular-nums">{formatEuros(remainingInterest)}</dd>
          </div>
        </dl>
      </section>

      <section aria-label="Prêts dans le temps" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {projection.horizons
          .filter((horizon) => horizon.months > 0)
          .map((horizon) => {
            const option = HORIZON_OPTIONS.find((candidate) => candidate.months === horizon.months);
            return (
              <div key={horizon.months} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <p className="text-xs font-medium text-slate-500">{option?.full}</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{formatEuros(horizon.outstanding)}</p>
                <p className="text-xs text-slate-500">restant dû</p>
                <p className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
                  Mensualités :{' '}
                  <span className="font-semibold tabular-nums text-slate-700">{formatEuros(horizon.payments)}</span>
                </p>
              </div>
            );
          })}
      </section>
    </div>
  );
}
