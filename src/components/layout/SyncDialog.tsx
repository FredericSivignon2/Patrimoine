import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useFinancial } from '../../context/FinancialContext';
import { useDriveSync } from '../../hooks/useDriveSync';
import type { DriveFileRef } from '../../infrastructure/gdrive/IDriveClient';
import { Button } from '../common/Button';
import { errorMessage } from '../common/errorMessage';
import { FormError } from '../common/fields';
import { Modal } from '../common/Modal';

type Drive = ReturnType<typeof useDriveSync>;
type Run = (action: () => Promise<unknown>) => Promise<void>;

interface PanelProps {
  drive: Drive;
  busy: boolean;
  run: Run;
}

const Paragraph = ({ children }: { children: ReactNode }) => <p className="text-sm text-slate-600">{children}</p>;

function UnavailablePanel() {
  return (
    <div className="space-y-3 pt-2">
      <Paragraph>
        Vos données sont enregistrées dans ce navigateur (mode local). Pour les synchroniser avec Google Drive et les
        partager, renseignez <code className="rounded bg-slate-100 px-1">VITE_GOOGLE_CLIENT_ID</code> (et{' '}
        <code className="rounded bg-slate-100 px-1">VITE_GOOGLE_API_KEY</code>) dans <code className="rounded bg-slate-100 px-1">.env.local</code>, puis relancez l’application.
      </Paragraph>
    </div>
  );
}

function SignInPanel({ drive, busy, run }: PanelProps) {
  return (
    <div className="space-y-3 pt-2">
      <Paragraph>
        Vos données sont enregistrées dans ce navigateur. Connectez-vous à Google pour les sauvegarder dans un fichier{' '}
        <strong>patrimoine_data.json</strong> sur votre Drive, et le partager avec votre conjoint(e).
      </Paragraph>
      <Paragraph>Aucune donnée ne transite par un serveur : l’application lit et écrit directement sur votre Drive.</Paragraph>
      <Button className="w-full" disabled={busy || drive.isSigningIn} onClick={() => void run(drive.connect)}>
        {drive.isSigningIn ? 'Connexion…' : 'Se connecter à Google'}
      </Button>
      <FormError message={drive.authError} />
    </div>
  );
}

function ChooserPanel({ drive, busy, run }: PanelProps) {
  const { accounts } = useFinancial();
  const hasLocalData = accounts.length > 0;
  const { listCandidates } = drive;
  const [files, setFiles] = useState<DriveFileRef[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listCandidates()
      .then((found) => active && setFiles(found))
      .catch((caught: unknown) => active && setSearchError(errorMessage(caught)));
    return () => {
      active = false;
    };
  }, [listCandidates]);

  return (
    <div className="space-y-4 pt-2">
      <Paragraph>Choisissez le fichier de données à synchroniser.</Paragraph>
      {hasLocalData && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
          Utiliser un fichier existant remplace les données de cet appareil par les siennes.
        </p>
      )}
      {files === null && !searchError && <Paragraph>Recherche de patrimoine_data.json sur votre Drive…</Paragraph>}
      <FormError message={searchError} />
      {files !== null && files.length === 0 && (
        <Paragraph>
          Aucun fichier patrimoine_data.json trouvé. Si un fichier vous a été partagé, choisissez-le ci-dessous.
        </Paragraph>
      )}
      {files !== null && files.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
          {files.map((file) => (
            <li key={file.id} className="flex items-center justify-between gap-3 p-3">
              <span className="min-w-0 text-sm">
                <span className="block truncate font-medium text-slate-800">{file.name}</span>
                <span className="block truncate text-xs text-slate-500">
                  {file.ownerName ? `${file.ownerName} · ` : ''}
                  {file.modifiedTime ? `modifié le ${new Date(file.modifiedTime).toLocaleDateString('fr-FR')}` : ''}
                </span>
              </span>
              <Button variant="secondary" disabled={busy} onClick={() => void run(() => drive.linkExisting(file.id))}>
                Utiliser
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2">
        {drive.canPickFiles ? (
          <Button variant="secondary" disabled={busy} onClick={() => void run(drive.pickAndLink)}>
            Choisir un fichier partagé…
          </Button>
        ) : (
          <p className="text-xs text-slate-500">
            Pour rejoindre un fichier partagé par votre conjoint(e), renseignez VITE_GOOGLE_API_KEY.
          </p>
        )}
        <Button disabled={busy} onClick={() => void run(drive.createAndLink)}>
          {hasLocalData ? 'Créer un fichier avec mes données' : 'Créer un fichier vierge'}
        </Button>
      </div>
    </div>
  );
}

function ConnectedPanel({ drive, busy, run }: PanelProps) {
  return (
    <div className="space-y-3 pt-2">
      <Paragraph>
        Vos données sont synchronisées avec <strong>patrimoine_data.json</strong> sur Google Drive. Chaque modification
        est envoyée automatiquement après quelques secondes.
      </Paragraph>
      <div className="flex flex-col gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => void run(drive.pull)}>
          Recharger depuis Drive
        </Button>
        <Button variant="secondary" disabled={busy} onClick={drive.disconnect}>
          Délier le fichier et se déconnecter
        </Button>
      </div>
    </div>
  );
}

function ReconnectPanel({ drive, busy, run }: PanelProps) {
  return (
    <div className="space-y-3 pt-2">
      <Paragraph>
        La session Google est fermée. Reconnectez-vous pour reprendre la synchronisation ; vos modifications faites
        entre-temps sont conservées et seront envoyées.
      </Paragraph>
      <Button className="w-full" disabled={busy || drive.isSigningIn} onClick={() => void run(drive.connect)}>
        {drive.isSigningIn ? 'Connexion…' : 'Se reconnecter à Google'}
      </Button>
      <FormError message={drive.authError} />
      <Button variant="ghost" className="w-full" onClick={drive.disconnect}>
        Délier le fichier
      </Button>
    </div>
  );
}

function ConflictPanel({ drive, busy, run }: PanelProps) {
  return (
    <div className="space-y-3 pt-2">
      <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
        Le fichier Drive a été modifié depuis votre dernière synchronisation (par vous sur un autre appareil, ou par la
        personne avec qui il est partagé).
      </p>
      <Paragraph>Choisissez la version à conserver. L’autre sera perdue.</Paragraph>
      <div className="flex flex-col gap-2">
        <Button disabled={busy} onClick={() => void run(drive.pull)}>
          Garder la version Drive
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => void run(drive.forcePush)}>
          Garder ma version (écrase Drive)
        </Button>
      </div>
    </div>
  );
}

function ErrorPanel({ drive, busy, run, message }: PanelProps & { message: string }) {
  return (
    <div className="space-y-3 pt-2">
      <FormError message={message} />
      <div className="flex flex-col gap-2">
        <Button disabled={busy} onClick={() => void run(drive.retry)}>
          Réessayer
        </Button>
        <Button variant="ghost" onClick={drive.disconnect}>
          Délier le fichier
        </Button>
      </div>
    </div>
  );
}

export function SyncDialog({ onClose }: { onClose: () => void }) {
  const drive = useDriveSync();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = useCallback<Run>(async (action) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (caught) {
      setMessage(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  const panelProps: PanelProps = { drive, busy, run };
  const { state } = drive;

  return (
    <Modal title="Synchronisation Google Drive" onClose={onClose}>
      {state.status === 'unavailable' && <UnavailablePanel />}
      {state.status === 'unbound' &&
        (drive.isSignedIn ? <ChooserPanel {...panelProps} /> : <SignInPanel {...panelProps} />)}
      {state.status === 'auth-required' && <ReconnectPanel {...panelProps} />}
      {(state.status === 'idle' || state.status === 'syncing') && <ConnectedPanel {...panelProps} />}
      {state.status === 'conflict' && <ConflictPanel {...panelProps} />}
      {state.status === 'error' && <ErrorPanel {...panelProps} message={state.message} />}
      {message && (
        <div className="mt-3">
          <FormError message={message} />
        </div>
      )}
    </Modal>
  );
}
