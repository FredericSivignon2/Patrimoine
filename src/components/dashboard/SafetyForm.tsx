import { useState, type FormEvent } from 'react';
import { DEFAULT_COMFORT_MARGIN, type SafetySettings } from '../../domain/models/Safety';
import { centsToInputString, parseAmountToCents } from '../../domain/services/FinancialMath';
import { Button } from '../common/Button';
import { errorMessage } from '../common/errorMessage';
import { DeleteButton, Field, FormError, SuffixInput } from '../common/fields';
import { formatEuros } from '../common/format';

interface SafetyFormProps {
  settings?: SafetySettings;
  /** Mensualités de prêts du mois (centimes), donnée comme repère pour fixer le seuil. */
  monthlyCredits?: number;
  onSubmit: (settings: SafetySettings) => Promise<unknown>;
  onClear?: () => Promise<unknown>;
  onCancel: () => void;
}

export function SafetyForm({ settings, monthlyCredits = 0, onSubmit, onClear, onCancel }: SafetyFormProps) {
  const [threshold, setThreshold] = useState(settings ? centsToInputString(settings.threshold) : '');
  const [comfort, setComfort] = useState(centsToInputString(settings?.comfortMargin ?? DEFAULT_COMFORT_MARGIN));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    const thresholdCents = parseAmountToCents(threshold);
    if (thresholdCents === null || thresholdCents < 0) {
      setError('Seuil invalide : saisissez un montant positif (ex. 10 000).');
      return;
    }
    const comfortCents = parseAmountToCents(comfort.trim() === '' ? '0' : comfort);
    if (comfortCents === null || comfortCents < 0) {
      setError('Marge de confort invalide : saisissez un montant positif (ex. 5 000).');
      return;
    }
    void run(() => onSubmit({ threshold: thresholdCents, comfortMargin: comfortCents }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <p className="text-sm text-slate-600">
        Montant en dessous duquel une alerte s’affiche. Il est comparé à votre patrimoine déblocable : les fonds bloqués
        ne comptent pas, car ils ne protègent pas d’un imprévu.
      </p>
      <div>
        <Field label="Seuil de sécurité" hint="Sous ce montant, la bannière du tableau de bord passe au rouge.">
          <SuffixInput
            suffix="€"
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
            placeholder="10 000"
            autoFocus
          />
        </Field>
        {monthlyCredits > 0 && (
          <p className="mt-1 text-xs text-slate-500">
            Repère : vos prêts coûtent {formatEuros(monthlyCredits)} par mois, soit {formatEuros(monthlyCredits * 6)} pour
            six mois de mensualités.
          </p>
        )}
      </div>
      <Field
        label="Marge de confort"
        hint="Tant que vous restez au moins de ce montant au-dessus du seuil, la bannière reste verte. En dessous elle passe au jaune, puis à l’orange dans le dernier millier d’euros avant le seuil."
      >
        <SuffixInput suffix="€" value={comfort} onChange={(event) => setComfort(event.target.value)} placeholder="5 000" />
      </Field>
      <FormError message={error} />
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button type="submit" disabled={busy}>
          Enregistrer
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Annuler
        </Button>
      </div>
      {settings && onClear && (
        <div className="border-t border-slate-200 pt-4">
          <DeleteButton label="Supprimer le seuil" disabled={busy} onConfirm={() => void run(onClear)} />
        </div>
      )}
    </form>
  );
}
