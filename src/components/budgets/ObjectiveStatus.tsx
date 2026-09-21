import type { ObjectiveOutcome } from '../../domain/services/BudgetEngine';
import { Button } from '../common/Button';
import { formatEuros, formatMonth, formatPercent } from '../common/format';

interface ObjectiveStatusProps {
  outcome: ObjectiveOutcome;
  /** Pourcentage actuellement alloué au poste. */
  percent: number;
  /** Pourcentage encore libre pour ce poste : dit si le pourcentage nécessaire est finançable. */
  maxPercent?: number;
  /** Si fourni, propose d'adopter le pourcentage nécessaire. */
  onUsePercent?: (percent: number) => void;
}

type Status = 'reached' | 'short' | 'unreachable';

const TONES: Record<Status, { text: string; dot: string }> = {
  reached: { text: 'text-emerald-700', dot: 'bg-emerald-500' },
  short: { text: 'text-amber-700', dot: 'bg-amber-500' },
  unreachable: { text: 'text-rose-700', dot: 'bg-rose-500' },
};

export function objectiveStatus(outcome: ObjectiveOutcome): Status {
  if (outcome.reached) return 'reached';
  return outcome.achievable ? 'short' : 'unreachable';
}

/** Où en est l'objectif d'un poste à son échéance, et que faudrait-il pour l'atteindre. */
export function ObjectiveStatus({ outcome, percent, maxPercent, onUsePercent }: ObjectiveStatusProps) {
  const status = objectiveStatus(outcome);
  const tone = TONES[status];
  const { requiredPercent } = outcome;

  const headline = {
    reached: 'Objectif atteint à l’échéance',
    short: `Il manque ${formatEuros(outcome.shortfall)} à l’échéance`,
    unreachable: 'Hors d’atteinte à cette échéance',
  }[status];

  let requirement: string;
  if (requiredPercent === null) requirement = 'Rien n’est dépensable à cette échéance.';
  else if (!outcome.achievable) {
    requirement = `Même la totalité du dépensable (${formatEuros(outcome.maxAvailable)}) ne suffirait pas.`;
  } else if (outcome.reached) requirement = `Pourcentage minimal nécessaire : ${formatPercent(requiredPercent)}.`;
  else {
    requirement = `Il faudrait ${formatPercent(requiredPercent)} du dépensable (vous en avez alloué ${formatPercent(percent)}).`;
  }

  const canAdopt = onUsePercent !== undefined && status === 'short' && requiredPercent !== null;
  const fits = requiredPercent !== null && (maxPercent === undefined || requiredPercent <= maxPercent);

  return (
    <div data-objective={status} className="space-y-1 text-sm">
      <p className={`flex items-center gap-2 font-semibold ${tone.text}`}>
        <span className={`size-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
        {headline}
      </p>
      <p className="text-slate-600">
        Avec {formatPercent(percent)} : {formatEuros(outcome.projected)} sur {formatEuros(outcome.target)} visés (fin{' '}
        {formatMonth(outcome.month)}).
      </p>
      {outcome.overdue && (
        <p className="text-xs text-slate-500">L’échéance est dépassée : évalué avec le dépensable d’aujourd’hui.</p>
      )}
      {outcome.beyondHorizon && <p className="text-xs text-slate-500">Au-delà de 5 ans : évalué à 5 ans.</p>}
      <p className="text-slate-600">{requirement}</p>
      {canAdopt && fits && requiredPercent !== null && (
        <Button variant="secondary" className="mt-1 min-h-9 px-3 text-xs" onClick={() => onUsePercent(requiredPercent)}>
          Utiliser {formatPercent(requiredPercent)}
        </Button>
      )}
      {canAdopt && !fits && maxPercent !== undefined && (
        <p className="text-xs text-slate-500">
          Il ne reste que {formatPercent(maxPercent)} à répartir : libérez du pourcentage sur d’autres postes.
        </p>
      )}
    </div>
  );
}
