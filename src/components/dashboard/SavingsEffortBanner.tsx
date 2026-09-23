import { Link } from 'react-router-dom';
import type { EffortWindow } from '../../domain/services/SavingsEffortEngine';
import { formatEuros } from '../common/format';
import { effortPhrase, EFFORT_LEVEL_TONE } from '../savingsEffort/effortLevel';

interface SavingsEffortBannerProps {
  /** Fenêtre courte (3 mois) : celle qui pilote la couleur de cette ligne. */
  window: EffortWindow;
}

/** Ligne sous la bannière principale : effort d'épargne lissé sur les 3 derniers mois, avec une phrase et un lien vers le détail. */
export function SavingsEffortBanner({ window }: SavingsEffortBannerProps) {
  if (window.availableMonths === 0) return null; // pas encore assez d'historique pour dire quoi que ce soit

  return (
    <Link
      to="/effort"
      className={`block rounded-2xl px-4 py-3 text-sm shadow-sm ring-1 ring-inset transition hover:opacity-90 ${EFFORT_LEVEL_TONE[window.level]}`}
    >
      <p className="font-medium">{effortPhrase(window.level)}</p>
      <p className="mt-0.5 text-xs opacity-80">
        {formatEuros(window.realized)} / {formatEuros(window.target)} par mois mis de côté en moyenne, sur les{' '}
        {window.availableMonths > 1 ? `${window.availableMonths} derniers mois` : 'dernier mois'}.
      </p>
    </Link>
  );
}
