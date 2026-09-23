import { useState } from 'react';
import type { RecalibrationSuggestion } from '../../domain/services/SavingsEffortEngine';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { errorMessage } from '../common/errorMessage';
import { FormError } from '../common/fields';
import { formatPercent } from '../common/format';

interface RecalibrationCardProps {
  suggestion: RecalibrationSuggestion;
  onApply: (ratePercent: number) => Promise<unknown>;
}

/** Suggestion de réajustement du taux cible, sur 6 mois d'historique ; ne change jamais rien sans confirmation. */
export function RecalibrationCard({ suggestion, onApply }: RecalibrationCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await onApply(suggestion.suggestedRatePercent);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Un ajustement à envisager ?">
      <p className="text-sm text-slate-700">
        Sur les 6 derniers mois, vous avez mis de côté en moyenne{' '}
        <strong>{formatPercent(Math.round(suggestion.averageRatio * 100))}</strong> de votre objectif.{' '}
        {suggestion.direction === 'raise'
          ? 'Vous faites mieux que prévu : voulez-vous relever votre taux cible ?'
          : 'L’objectif semble difficile à tenir en ce moment : voulez-vous le revoir à la baisse ?'}
      </p>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
        <span className="text-sm text-slate-600">
          {formatPercent(suggestion.currentRatePercent)} → <strong className="text-slate-900">{formatPercent(suggestion.suggestedRatePercent)}</strong>
        </span>
        <Button disabled={busy} onClick={() => void apply()}>
          {suggestion.direction === 'raise' ? 'Relever' : 'Baisser'} à {formatPercent(suggestion.suggestedRatePercent)}
        </Button>
      </div>
      <FormError message={error} />
    </Card>
  );
}
