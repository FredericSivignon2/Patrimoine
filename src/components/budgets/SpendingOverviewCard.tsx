import { useMemo, useState } from 'react';
import type { Budget } from '../../domain/models/Budget';
import type { Loan } from '../../domain/models/Loan';
import type { Movement } from '../../domain/models/Movement';
import { spendingReport, spendingYears } from '../../domain/services/SpendingReport';
import { Card } from '../common/Card';
import { formatEuros, formatPercent } from '../common/format';
import { ChevronLeftIcon, ChevronRightIcon } from '../common/icons';
import { paletteColor } from '../common/palette';

interface SpendingOverviewCardProps {
  movements: Movement[];
  budgets: Budget[];
  loans: Loan[];
}

interface Row {
  key: string;
  label: string;
  detail?: string;
  amount: number;
  color: string;
}

const LOANS_COLOR = '#475569';
const UNTAGGED_COLOR = '#cbd5e1';

/** Où est passé l'argent, année par année : retraits par poste, retraits sans poste et mensualités de prêts. */
export function SpendingOverviewCard({ movements, budgets, loans }: SpendingOverviewCardProps) {
  const currentYear = new Date().getFullYear();
  const years = useMemo(() => spendingYears(movements, currentYear), [movements, currentYear]);
  const [year, setYear] = useState(currentYear);
  const position = years.indexOf(year);

  const report = useMemo(() => spendingReport(movements, budgets, loans, year), [movements, budgets, loans, year]);

  const rows: Row[] = [
    ...report.lines.map((line) => ({
      key: line.budget.id,
      label: line.budget.name,
      detail: `${line.count} retrait${line.count > 1 ? 's' : ''}`,
      amount: line.amount,
      color: paletteColor(budgets.findIndex((budget) => budget.id === line.budget.id)),
    })),
    ...(report.untagged.count > 0
      ? [
          {
            key: 'untagged',
            label: 'Retraits sans poste',
            detail: `${report.untagged.count} retrait${report.untagged.count > 1 ? 's' : ''}`,
            amount: report.untagged.amount,
            color: UNTAGGED_COLOR,
          },
        ]
      : []),
    ...(report.loans > 0
      ? [{ key: 'loans', label: 'Mensualités de prêts', detail: 'd’après les échéanciers', amount: report.loans, color: LOANS_COLOR }]
      : []),
  ];

  const step = (direction: -1 | 1): void => {
    const next = years[position + direction];
    if (next !== undefined) setYear(next);
  };

  return (
    <Card
      title="Où passe l’argent"
      action={
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Année précédente"
            disabled={position <= 0}
            onClick={() => step(-1)}
            className="grid size-9 place-items-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-30"
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <span className="min-w-12 text-center text-sm font-semibold tabular-nums text-slate-800">{year}</span>
          <button
            type="button"
            aria-label="Année suivante"
            disabled={position >= years.length - 1}
            onClick={() => step(1)}
            className="grid size-9 place-items-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-30"
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          Aucune dépense en {year}. Rattachez vos retraits à un poste (page Mouvements) pour voir où passe l’argent.
        </p>
      ) : (
        <>
          <p className="text-3xl font-bold tabular-nums text-slate-900">{formatEuros(report.total)}</p>
          <p className="text-xs text-slate-500">retraits et mensualités de prêts de l’année {year}</p>
          <ul className="mt-3 space-y-3">
            {rows.map((row) => (
              <li key={row.key}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium text-slate-900">
                    {row.label}
                    {row.detail && <span className="ml-2 text-xs font-normal text-slate-500">{row.detail}</span>}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                    {formatEuros(row.amount)}
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {formatPercent(Math.round((row.amount / report.total) * 100))}
                    </span>
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(row.amount / report.total) * 100}%`, backgroundColor: row.color }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">
            Les mensualités viennent des échéanciers : inutile de les saisir comme mouvements. Un virement entre vos
            comptes saisi comme retrait apparaît dans « Retraits sans poste ».
          </p>
        </>
      )}
    </Card>
  );
}
