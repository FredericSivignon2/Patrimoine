import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFinancial } from '../context/FinancialContext';

/** État et actions de synchronisation avec Google Drive (ne concerne que l'en-tête et son panneau). */
export function useDriveSync() {
  const { sync } = useFinancial();
  const { session, isSignedIn, isSigningIn, error: authError, signIn, signOut } = useAuth();
  const state = useSyncExternalStore(sync.subscribe, sync.getState);

  /** Connexion Google ; si un fichier est déjà lié, reprend la synchronisation. */
  const connect = useCallback(async (): Promise<void> => {
    const signedIn = await signIn();
    if (signedIn && sync.getState().status === 'auth-required') await sync.resume();
  }, [signIn, sync]);

  /** Ouvre le sélecteur Google et lie le fichier choisi. Renvoie `false` si l'utilisateur annule. */
  const pickAndLink = useCallback(async (): Promise<boolean> => {
    if (!session) return false;
    const file = await session.pickFile();
    if (!file) return false;
    await sync.linkExisting(file.id);
    return true;
  }, [session, sync]);

  /** Délie le fichier (les données locales sont conservées) et ferme la session Google. */
  const disconnect = useCallback(() => {
    sync.unlink();
    signOut();
  }, [sync, signOut]);

  const actions = useMemo(
    () => ({
      listCandidates: () => sync.listCandidates(),
      linkExisting: (fileId: string) => sync.linkExisting(fileId),
      createAndLink: () => sync.createAndLink(),
      pull: () => sync.pull(),
      forcePush: () => sync.forcePush(),
      retry: () => sync.retry(),
    }),
    [sync],
  );

  return {
    state,
    isSignedIn,
    isSigningIn,
    authError,
    canPickFiles: session?.canPickFiles ?? false,
    connect,
    pickAndLink,
    disconnect,
    ...actions,
  };
}
