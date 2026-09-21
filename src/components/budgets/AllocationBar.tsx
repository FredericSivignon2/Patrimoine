import type { BudgetShare } from '../../domain/services/BudgetEngine';
import { formatPercent } from '../common/format';
import { paletteColor } from '../common/palette';

interface AllocationBarProps {
  shares: BudgetShare[];
  unallocatedPercent: number;
}

/** Barre empilée : un segment par poste, le reste (gris) est non affecté. */
export function AllocationBar({ shares, unallocatedPercent }: AllocationBarProps) {
  const description = [
    ...shares.map((share) => `${share.budget.name} ${formatPercent(share.budget.percent)}`),
    `non affecté ${formatPercent(unallocatedPercent)}`,
  ].join(', ');

  return (
    <div
      role="img"
      aria-label={`Répartition du dépensable : ${description}`}
      className="flex h-3 w-full overflow-hidden rounded-full bg-slate-200"
    >
      {shares.map((share, index) => (
        <div
          key={share.budget.id}
          style={{ width: `${share.budget.percent}%`, backgroundColor: paletteColor(index) }}
        />
      ))}
    </div>
  );
}
