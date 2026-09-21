import type { ReactNode } from 'react';
import type { SafetyLevel, SafetyStatus } from '../../domain/models/Safety';
import { formatEuros, formatSignedEuros } from '../common/format';
import { ShieldIcon } from '../common/icons';

interface Tone {
  container: string;
  muted: string;
  panel: string;
  action: string;
}

const LIGHT_ON_DARK = { panel: 'bg-white/15', action: 'bg-white/20 hover:bg-white/30' };

/** Vert foncé par défaut ; jaune, orange puis rouge quand la marge au-dessus du seuil de sécurité fond. */
const TONES: Record<SafetyLevel | 'none', Tone> = {
  none: { container: 'bg-linear-to-br from-teal-700 to-teal-900 text-white', muted: 'text-teal-100', ...LIGHT_ON_DARK },
  ok: { container: 'bg-linear-to-br from-teal-700 to-teal-900 text-white', muted: 'text-teal-100', ...LIGHT_ON_DARK },
  warning: {
    container: 'bg-linear-to-br from-amber-300 to-yellow-400 text-amber-950',
    muted: 'text-amber-900',
    panel: 'bg-amber-950/10',
    action: 'bg-amber-950/10 hover:bg-amber-950/20',
  },
  alert: {
    container: 'bg-linear-to-br from-orange-500 to-orange-700 text-white',
    muted: 'text-orange-50',
    ...LIGHT_ON_DARK,
  },
  critical: {
    container: 'bg-linear-to-br from-red-600 to-red-800 text-white',
    muted: 'text-red-100',
    ...LIGHT_ON_DARK,
  },
};

function safetyMessage({ level, margin, threshold }: SafetyStatus): string {
  const limit = formatEuros(threshold);
  switch (level) {
    case 'ok':
      return `Épargne de sécurité confortable : ${formatEuros(margin)} au-dessus du seuil de ${limit}.`;
    case 'warning':
      return `Vigilance : plus que ${formatEuros(margin)} au-dessus du seuil de sécurité de ${limit}.`;
    case 'alert':
      return margin === 0
        ? `Au seuil de sécurité de ${limit}.`
        : `Proche du seuil de sécurité de ${limit} : ${formatEuros(margin)} de marge seulement.`;
    case 'critical':
      return `Sous le seuil de sécurité de ${limit} : il manque ${formatEuros(-margin)}.`;
  }
}

function Stat({ label, value, title }: { label: string; value: ReactNode; title?: string }) {
  return (
    <div title={title}>
      <dt className="text-xs opacity-80">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

interface PatrimoineHeroProps {
  total: number;
  locked: number;
  available: number;
  monthlyContribution: number;
  status: SafetyStatus | undefined;
  onEditSafety: () => void;
}

export function PatrimoineHero({
  total,
  locked,
  available,
  monthlyContribution,
  status,
  onEditSafety,
}: PatrimoineHeroProps) {
  const tone = TONES[status?.level ?? 'none'];

  return (
    <section
      aria-label="Patrimoine"
      data-safety-level={status?.level ?? 'none'}
      className={`rounded-3xl p-5 shadow-sm sm:p-6 ${tone.container}`}
    >
      <p className={`text-sm ${tone.muted}`}>Patrimoine total</p>
      <p className="mt-1 text-3xl font-bold tabular-nums sm:text-4xl">{formatEuros(total)}</p>

      <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <Stat label="Déblocable" value={formatEuros(available)} title="Fonds immédiatement utilisables (hors fonds bloqués)" />
        <Stat label="Bloqué" value={formatEuros(locked)} title="Fonds bloqués jusqu'à leur date de déblocage" />
        <Stat
          label="Épargne mensuelle"
          value={formatSignedEuros(monthlyContribution)}
          title="Moyenne des versements nets des 12 derniers mois complets"
        />
      </dl>

      <div role="status" className={`mt-4 flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm ${tone.panel}`}>
        <ShieldIcon className="size-5 shrink-0" />
        <p className="min-w-0 flex-1">
          {status
            ? safetyMessage(status)
            : 'Définissez un seuil d’épargne de sécurité pour être alerté quand votre patrimoine déblocable devient trop faible.'}
        </p>
        <button
          type="button"
          onClick={onEditSafety}
          aria-label={status ? 'Modifier l’épargne de sécurité' : 'Définir l’épargne de sécurité'}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold ${tone.action}`}
        >
          {status ? 'Modifier' : 'Définir'}
        </button>
      </div>
    </section>
  );
}
