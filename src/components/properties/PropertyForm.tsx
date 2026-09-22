import { useState, type FormEvent } from 'react';
import type { Loan } from '../../domain/models/Loan';
import type { NewProperty, Property } from '../../domain/models/Property';
import { centsToInputString, parseAmountToCents, parsePercent } from '../../domain/services/FinancialMath';
import { Button } from '../common/Button';
import { errorMessage } from '../common/errorMessage';
import { DeleteButton, Field, FormError, SuffixInput, inputClass } from '../common/fields';

interface PropertyFormProps {
  property?: Property;
  loans: readonly Loan[];
  /** Prêts déjà rattachés à un AUTRE bien : proposés uniquement s'ils sont déjà celui de ce bien. */
  unavailableLoanIds: ReadonlySet<string>;
  onSubmit: (input: NewProperty) => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
  onCancel: () => void;
}

export function PropertyForm({ property, loans, unavailableLoanIds, onSubmit, onDelete, onCancel }: PropertyFormProps) {
  const [name, setName] = useState(property?.name ?? '');
  const [valueText, setValueText] = useState(property ? centsToInputString(property.estimatedValue) : '');
  const [feeText, setFeeText] = useState(property ? String(property.sellingFeePercent).replace('.', ',') : '8');
  const [loanId, setLoanId] = useState(property?.loanId ?? '');
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

  const availableLoans = loans.filter((loan) => loan.id === property?.loanId || !unavailableLoanIds.has(loan.id));

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    const estimatedValue = parseAmountToCents(valueText);
    if (estimatedValue === null || estimatedValue <= 0) {
      setError('Valeur estimée invalide (ex. 220 000).');
      return;
    }
    const sellingFeePercent = parsePercent(feeText);
    if (sellingFeePercent === null || sellingFeePercent < 0 || sellingFeePercent > 100) {
      setError('Frais de vente invalides (ex. 8, entre 0 et 100).');
      return;
    }
    void run(() => onSubmit({ name, estimatedValue, sellingFeePercent, loanId: loanId || undefined }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <Field label="Nom du bien">
        <input
          className={inputClass}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Appartement loué"
          maxLength={80}
          required
          autoFocus
        />
      </Field>
      <Field label="Valeur estimée de revente" hint="Estimation actuelle du bien, avant frais de vente.">
        <SuffixInput suffix="€" value={valueText} onChange={(event) => setValueText(event.target.value)} placeholder="220 000" />
      </Field>
      <Field label="Frais de vente estimés" hint="Notaire, agence, mainlevée d’hypothèque… en % du prix de vente.">
        <SuffixInput suffix="%" value={feeText} onChange={(event) => setFeeText(event.target.value)} placeholder="8" />
      </Field>
      <Field
        label="Prêt rattaché (optionnel)"
        hint="Le capital restant dû de ce prêt est déduit de la valeur du bien. Laissez « Aucun » si le bien est déjà libre de tout prêt."
      >
        <select className={inputClass} value={loanId} onChange={(event) => setLoanId(event.target.value)}>
          <option value="">Aucun (bien libre de tout prêt)</option>
          {availableLoans.map((loan) => (
            <option key={loan.id} value={loan.id}>
              {loan.name}
            </option>
          ))}
        </select>
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
      {property && onDelete && (
        <div className="border-t border-slate-200 pt-4">
          <DeleteButton label="Supprimer le bien" disabled={busy} onConfirm={() => void run(onDelete)} />
        </div>
      )}
    </form>
  );
}
