import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { GDriveClient } from '../infrastructure/gdrive/GDriveClient';
import type { IDriveSession } from '../infrastructure/gdrive/IDriveClient';

interface AuthContextValue {
  /** `null` quand `VITE_GOOGLE_CLIENT_ID` n'est pas défini : l'application reste en mode local. */
  session: IDriveSession | null;
  isSignedIn: boolean;
  isSigningIn: boolean;
  error: string | null;
  signIn: () => Promise<boolean>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function createSessionFromEnv(): IDriveSession | null {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) return null;
  return new GDriveClient({ clientId, apiKey: import.meta.env.VITE_GOOGLE_API_KEY || undefined });
}

interface AuthProviderProps {
  /** Session à utiliser ; par défaut créée depuis les variables d'environnement (`null` = mode local). */
  session?: IDriveSession | null;
  children: ReactNode;
}

export function AuthProvider({ session: sessionProp, children }: AuthProviderProps) {
  const [session] = useState<IDriveSession | null>(() =>
    sessionProp === undefined ? createSessionFromEnv() : sessionProp,
  );
  const [isSignedIn, setSignedIn] = useState(false);
  const [isSigningIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    session?.preload().catch(() => undefined);
  }, [session]);

  useEffect(() => {
    if (!session || !isSignedIn) return;
    const timer = setTimeout(() => setSignedIn(false), session.msUntilExpiry());
    return () => clearTimeout(timer);
  }, [session, isSignedIn]);

  const signIn = useCallback(async (): Promise<boolean> => {
    if (!session) return false;
    setSigningIn(true);
    setError(null);
    try {
      await session.signIn();
      setSignedIn(true);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return false;
    } finally {
      setSigningIn(false);
    }
  }, [session]);

  const signOut = useCallback(() => {
    session?.signOut();
    setSignedIn(false);
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, isSignedIn, isSigningIn, error, signIn, signOut }),
    [session, isSignedIn, isSigningIn, error, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth doit être utilisé dans un <AuthProvider>.');
  return value;
}
