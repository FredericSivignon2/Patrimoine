import { useState } from 'react';
import { BANK_SUGGESTIONS, type Bank } from '../../domain/models/Bank';
import { BankBadge } from '../common/bankBadge';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { errorMessage } from '../common/errorMessage';
import { FormError, inputClass } from '../common/fields';
import { XIcon } from '../common/icons';

interface BanksCardProps {
  banks: readonly Bank[];
  onCreate: (name: string) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
}

/** Liste des banques hébergeant un compte ou un prêt : ajout libre, plus des suggestions courantes en un clic. */
export function BanksCard({ banks, onCreate, onRemove }: BanksCardProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async (value: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await onCreate(value);
      setName('');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await onRemove(id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const suggestions = BANK_SUGGESTIONS.filter(
    (suggestion) => !banks.some((bank) => bank.name.localeCompare(suggestion, 'fr', { sensitivity: 'base' }) === 0),
  );

  return (
    <Card title="Banques">
      {banks.length > 0 && (
        <ul className="mb-3 divide-y divide-slate-100">
          {banks.map((bank) => (
            <li key={bank.id} className="flex items-center justify-between gap-3 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <BankBadge name={bank.name} />
                <span className="truncate text-sm font-medium text-slate-900">{bank.name}</span>
              </span>
              <button
                type="button"
                aria-label={`Retirer ${bank.name}`}
                disabled={busy}
                onClick={() => void remove(bank.id)}
                className="grid size-8 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100"
              >
                <XIcon className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex items-start gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() !== '') void add(name);
        }}
      >
        <input
          className={inputClass}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nom de la banque"
          aria-label="Nom de la banque"
          maxLength={60}
        />
        <Button type="submit" variant="secondary" disabled={busy || name.trim() === ''}>
          Ajouter
        </Button>
      </form>
      {suggestions.length > 0 && (
        <div className="mt-2">
          <p className="mb-1.5 text-xs text-slate-500">Suggestions, pas encore ajoutées :</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={busy}
                onClick={() => void add(suggestion)}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200"
              >
                + {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
      <FormError message={error} />
    </Card>
  );
}
