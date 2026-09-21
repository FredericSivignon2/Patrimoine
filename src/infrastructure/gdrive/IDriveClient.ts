export const DRIVE_FILE_NAME = 'patrimoine_data.json';

export interface DriveFileRef {
  id: string;
  name: string;
  modifiedTime?: string;
  ownerName?: string;
}

/** Opérations Drive nécessaires à la synchronisation (implémentées par `GDriveClient`, simulables en test). */
export interface IDriveClient {
  findFilesByName(name: string): Promise<DriveFileRef[]>;
  createJsonFile(name: string, content: string): Promise<{ id: string; checksum: string }>;
  /** La somme de contrôle est lue AVANT le contenu : une modification concurrente provoque un faux conflit, jamais une perte. */
  readJsonFile(id: string): Promise<{ text: string; checksum: string }>;
  updateJsonFile(id: string, content: string): Promise<{ checksum: string }>;
  getChecksum(id: string): Promise<string>;
}

/** Client Drive + session Google (Google Identity Services). */
export interface IDriveSession extends IDriveClient {
  /** Vrai si un sélecteur de fichiers Google (Picker) est disponible (clé d'API configurée). */
  readonly canPickFiles: boolean;
  isSignedIn(): boolean;
  msUntilExpiry(): number;
  /** Charge à l'avance le script Google pour que la fenêtre de connexion s'ouvre sans délai au clic. */
  preload(): Promise<void>;
  signIn(): Promise<void>;
  signOut(): void;
  /** Ouvre le sélecteur Google ; `null` si l'utilisateur annule. */
  pickFile(): Promise<DriveFileRef | null>;
}
