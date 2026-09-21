import { Link } from 'react-router-dom';
import { monthKeyOfIso } from '../../domain/services/Months';
import type { LoanItem } from '../../hooks/useLoans';
import { Card } from '../common/Card';
import { formatEuros, formatMonth } from '../common/format';

interface LoansSummaryCardProps {
  items: LoanItem[];
  outstanding: number;
  monthlyPayments: number;
}

/** Tableau de bord : capital restant dû, mensualités du mois et fin du dernier prêt. */
export function LoansSummaryCard({ items, outstanding, monthlyPayments }: LoansSummaryCardProps) {
  const lastEnd = items
    .flatMap((item) => (item.snapshot?.active ? [item.snapshot.endDate] : []))
    .sort()
    .pop();

  return (
    <Card
      title="Prêts en cours"
      action={
        <Link to="/prets" className="text-sm font-semibold text-teal-700 hover:underline">
          Voir les prêts
        </Link>
      }
    >
      <p className="text-3xl font-bold tabular-nums text-slate-900">{formatEuros(outstanding)}</p>
      <p className="text-xs text-slate-500">de capital restant dû</p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-slate-500">Mensualités ce mois-ci</dt>
          <dd className="font-semibold tabular-nums text-slate-900">{formatEuros(monthlyPayments)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Fin du dernier prêt</dt>
          <dd className="font-semibold capitalize text-slate-900">
            {lastEnd ? formatMonth(monthKeyOfIso(lastEnd)) : 'Tous soldés'}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
