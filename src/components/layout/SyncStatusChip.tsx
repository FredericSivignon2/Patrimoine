import { useState } from 'react';
import { useDriveSync } from '../../hooks/useDriveSync';
import type { SyncState } from '../../infrastructure/gdrive/DriveSyncService';
import { CloudIcon } from '../common/icons';
import { SyncDialog } from './SyncDialog';

interface ChipView {
  label: string;
  tone: string;
  pulse?: boolean;
}

function describe(state: SyncState): ChipView {
  switch (state.status) {
    case 'unavailable':
    case 'unbound':
      return { label: 'Mode local', tone: 'bg-slate-100 text-slate-700 ring-slate-200' };
    case 'auth-required':
      return { label: 'Reconnecter Drive', tone: 'bg-amber-50 text-amber-800 ring-amber-200' };
    case 'idle':
      return { label: 'Drive à jour', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200' };
    case 'syncing':
      return { label: 'Synchronisation…', tone: 'bg-sky-50 text-sky-800 ring-sky-200', pulse: true };
    case 'conflict':
      return { label: 'Conflit Drive', tone: 'bg-rose-50 text-rose-800 ring-rose-200' };
    case 'error':
      return { label: 'Erreur Drive', tone: 'bg-rose-50 text-rose-800 ring-rose-200' };
  }
}

export function SyncStatusChip() {
  const { state } = useDriveSync();
  const [open, setOpen] = useState(false);
  const view = describe(state);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Synchronisation : ${view.label}`}
        className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ring-1 ring-inset ${view.tone}`}
      >
        <CloudIcon className={`size-4 ${view.pulse ? 'animate-pulse' : ''}`} />
        {view.label}
      </button>
      {open && <SyncDialog onClose={() => setOpen(false)} />}
    </>
  );
}
