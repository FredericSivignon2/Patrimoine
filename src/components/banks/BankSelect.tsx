import type { Bank } from '../../domain/models/Bank';
import { Field, inputClass } from '../common/fields';

interface BankSelectProps {
  banks: readonly Bank[];
  value: string;
  onChange: (bankId: string) => void;
  label?: string;
}

/** Sélecteur de banque, facultatif : la liste se gère depuis la page Comptes. */
export function BankSelect({ banks, value, onChange, label = 'Banque (optionnel)' }: BankSelectProps) {
  return (
    <Field label={label}>
      <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Aucune banque</option>
        {banks.map((bank) => (
          <option key={bank.id} value={bank.id}>
            {bank.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
