import type { ChartData, ChartOptions } from 'chart.js';
import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import type { ProjectionPoint } from '../../domain/models/Projection';
import { formatCompactEuros, formatEuros, formatMonth } from '../common/format';
import './chartSetup';

interface ProjectionChartProps {
  points: ProjectionPoint[];
  /** Trace aussi le patrimoine déblocable (utile dès qu'une partie des fonds est bloquée). */
  showAvailable?: boolean;
  /** Seuil de sécurité en centimes, tracé en pointillés. */
  threshold?: number;
}

export function ProjectionChart({ points, showAvailable = false, threshold }: ProjectionChartProps) {
  const data = useMemo<ChartData<'line'>>(() => {
    const datasets: ChartData<'line'>['datasets'] = [
      {
        label: 'Patrimoine total',
        data: points.map((point) => point.balance / 100),
        borderColor: '#0f766e',
        backgroundColor: 'rgba(15, 118, 110, 0.12)',
        borderWidth: 2,
        fill: true,
        tension: 0.25,
        pointRadius: 0,
        pointHoverRadius: 4,
      },
    ];
    if (showAvailable) {
      datasets.push({
        label: 'Déblocable',
        data: points.map((point) => point.available / 100),
        borderColor: '#0284c7',
        backgroundColor: '#0284c7',
        borderWidth: 2,
        tension: 0.25,
        pointRadius: 0,
        pointHoverRadius: 4,
      });
    }
    if (threshold !== undefined) {
      datasets.push({
        label: 'Seuil de sécurité',
        data: points.map(() => threshold / 100),
        borderColor: '#e11d48',
        backgroundColor: '#e11d48',
        borderWidth: 1.5,
        borderDash: [6, 4],
        pointRadius: 0,
        pointHoverRadius: 0,
      });
    }
    return { labels: points.map((point) => formatMonth(point.month, 'short')), datasets };
  }, [points, showAvailable, threshold]);

  const multiple = data.datasets.length > 1;
  const options = useMemo<ChartOptions<'line'>>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: multiple
          ? { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 14 } }
          : { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label} : ${formatEuros(Math.round((context.parsed.y ?? 0) * 100))}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0 } },
        y: { ticks: { callback: (value) => formatCompactEuros(Number(value) * 100) } },
      },
    }),
    [multiple],
  );

  return (
    <div className={multiple ? 'h-72 sm:h-96' : 'h-64 sm:h-80'}>
      <Line data={data} options={options} role="img" aria-label="Projection du patrimoine sur 5 ans" />
    </div>
  );
}
