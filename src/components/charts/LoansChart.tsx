import type { ChartData, ChartOptions } from 'chart.js';
import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import type { LoanProjectionPoint } from '../../domain/services/LoanEngine';
import { formatCompactEuros, formatEuros, formatMonth } from '../common/format';
import './chartSetup';

const OPTIONS: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: { callbacks: { label: (context) => `Reste dû : ${formatEuros(Math.round((context.parsed.y ?? 0) * 100))}` } },
  },
  scales: {
    x: { grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0 } },
    y: { beginAtZero: true, ticks: { callback: (value) => formatCompactEuros(Number(value) * 100) } },
  },
};

/** Capital restant dû de tous les prêts, mois par mois. */
export function LoansChart({ points }: { points: LoanProjectionPoint[] }) {
  const data = useMemo<ChartData<'line'>>(
    () => ({
      labels: points.map((point) => formatMonth(point.month, 'short')),
      datasets: [
        {
          label: 'Capital restant dû',
          data: points.map((point) => point.outstanding / 100),
          borderColor: '#475569',
          backgroundColor: 'rgba(71, 85, 105, 0.12)',
          borderWidth: 2,
          fill: true,
          stepped: false,
          tension: 0.2,
          pointRadius: 0,
          pointHoverRadius: 4,
        },
      ],
    }),
    [points],
  );

  return (
    <div className="h-56 sm:h-72">
      <Line data={data} options={OPTIONS} role="img" aria-label="Capital restant dû des prêts sur 5 ans" />
    </div>
  );
}
