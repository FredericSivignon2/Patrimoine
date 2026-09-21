import type { ChartData, ChartOptions } from 'chart.js';
import { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import type { MonthlyNet } from '../../domain/models/Projection';
import { formatCompactEuros, formatEuros, formatMonth } from '../common/format';
import { NEGATIVE_COLOR, POSITIVE_COLOR } from './chartSetup';

export function MonthlySavingsChart({ history }: { history: MonthlyNet[] }) {
  const data = useMemo<ChartData<'bar'>>(
    () => ({
      labels: history.map((month) => formatMonth(month.month, 'short')),
      datasets: [
        {
          label: 'Versements nets',
          data: history.map((month) => month.net / 100),
          backgroundColor: history.map((month) => (month.net >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR)),
          borderRadius: 4,
        },
      ],
    }),
    [history],
  );

  const options = useMemo<ChartOptions<'bar'>>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `Net : ${formatEuros(Math.round((context.parsed.y ?? 0) * 100))}`,
            afterLabel: (context) => {
              const month = history[context.dataIndex];
              return month ? `Versements ${formatEuros(month.deposits)} · Retraits ${formatEuros(month.withdrawals)}` : '';
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 8 } },
        y: { ticks: { callback: (value) => formatCompactEuros(Number(value) * 100) } },
      },
    }),
    [history],
  );

  return (
    <div className="h-64">
      <Bar data={data} options={options} role="img" aria-label="Versements nets par mois sur les 12 derniers mois" />
    </div>
  );
}
