import { useMemo, useState } from 'react';
import type { Loan } from '../../domain/models/Loan';
import type { NewProperty, PropertyPatch } from '../../domain/models/Property';
import type { PropertyItem } from '../../hooks/useProperties';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { formatEuros } from '../common/format';
import { PlusIcon } from '../common/icons';
import { Modal } from '../common/Modal';
import { PropertyForm } from './PropertyForm';

interface PropertiesCardProps {
  items: PropertyItem[];
  loans: readonly Loan[];
  onCreate: (input: NewProperty) => Promise<unknown>;
  onUpdate: (id: string, patch: PropertyPatch) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
}

/** Biens loués et non entièrement remboursés : leur valeur nette de revente forme un coussin de sécurité à part. */
export function PropertiesCard({ items, loans, onCreate, onUpdate, onRemove }: PropertiesCardProps) {
  const [editing, setEditing] = useState<PropertyItem | 'new' | null>(null);
  const close = (): void => setEditing(null);
  const loanNames = useMemo(() => new Map(loans.map((loan) => [loan.id, loan.name])), [loans]);
  const usedLoanIds = useMemo(
    () => new Set(items.flatMap((item) => (item.loanId ? [item.loanId] : []))),
    [items],
  );
  const unavailableLoanIds =
    editing && editing !== 'new'
      ? new Set([...usedLoanIds].filter((id) => id !== editing.loanId))
      : usedLoanIds;

  return (
    <Card
      title="Biens immobiliers loués"
      action={
        <Button variant="secondary" onClick={() => setEditing('new')}>
          <PlusIcon className="size-4" />
          Ajouter
        </Button>
      }
    >
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">
          Un appartement loué, non entièrement remboursé ? Sa valeur nette de revente (valeur estimée moins le
          capital restant dû et les frais de vente) est un coussin de sécurité à part, affiché sur le tableau de
          bord — non déblocable rapidement, il ne compte ni dans le déblocable, ni dans le dépensable.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setEditing(item)}
                className="flex w-full items-center justify-between gap-3 py-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{item.name}</span>
                  <span className="block text-xs text-slate-500">
                    {formatEuros(item.estimatedValue)} estimés
                    {item.loanId && ` · ${loanNames.get(item.loanId) ?? 'Prêt supprimé'}`}
                  </span>
                </span>
                <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">
                  {formatEuros(item.cushion)}
                  <span className="block text-xs font-normal text-slate-500">coussin net</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'Nouveau bien' : 'Modifier le bien'} onClose={close}>
          <PropertyForm
            property={editing === 'new' ? undefined : editing}
            loans={loans}
            unavailableLoanIds={unavailableLoanIds}
            onCancel={close}
            onSubmit={async (input) => {
              if (editing === 'new') await onCreate(input);
              else await onUpdate(editing.id, input);
              close();
            }}
            onDelete={
              editing === 'new'
                ? undefined
                : async () => {
                    await onRemove(editing.id);
                    close();
                  }
            }
          />
        </Modal>
      )}
    </Card>
  );
}
