import type { ChartData, ChartOptions } from 'chart.js';
import { useMemo } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { formatEuros } from '../common/format';
import { PALETTE } from './chartSetup';

export interface AllocationItem {
  name: string;
  /** Solde en centimes (strictement positif). */
  balance: number;
}

const OPTIONS: ChartOptions<'doughnut'> = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '62%',
  plugins: {
    legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 14 } },
    tooltip: {
      callbacks: {
        label: (context) => {
          const total = context.dataset.data.reduce((sum, value) => sum + value, 0);
          const share = total > 0 ? Math.round((context.parsed / total) * 100) : 0;
          return `${context.label} : ${formatEuros(Math.round(context.parsed * 100))} (${share} %)`;
        },
      },
    },
  },
};

export function AllocationChart({ items }: { items: AllocationItem[] }) {
  const data = useMemo<ChartData<'doughnut'>>(
    () => ({
      labels: items.map((item) => item.name),
      datasets: [
        {
          data: items.map((item) => item.balance / 100),
          backgroundColor: items.map((_, index) => PALETTE[index % PALETTE.length]),
          borderWidth: 2,
          borderColor: '#ffffff',
        },
      ],
    }),
    [items],
  );

  return (
    <div className="h-64">
      <Doughnut data={data} options={OPTIONS} role="img" aria-label="Répartition du patrimoine par compte" />
    </div>
  );
}
