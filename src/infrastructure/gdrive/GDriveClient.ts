import { AuthExpiredError, DriveApiError } from './errors';
import { DRIVE_FILE_NAME, type DriveFileRef, type IDriveSession } from './IDriveClient';
import { loadScript } from './loadScript';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const GAPI_SRC = 'https://apis.google.com/js/api.js';
/** Accès restreint aux fichiers créés ou ouverts (via le Picker) par l'application. */
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const JSON_MIME = 'application/json';
const EXPIRY_MARGIN_MS = 60_000;
const DEFAULT_TOKEN_LIFETIME_SECONDS = 3600;

export interface GDriveConfig {
  clientId: string;
  apiKey?: string;
}

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Somme de contrôle du contenu ; à défaut (fichier vide), date de modification. */
function checksumOf(body: unknown): string {
  if (isRecord(body)) {
    if (typeof body.md5Checksum === 'string') return body.md5Checksum;
    if (typeof body.modifiedTime === 'string') return body.modifiedTime;
  }
  return '';
}

function parseFileList(body: unknown): DriveFileRef[] {
  if (!isRecord(body) || !Array.isArray(body.files)) return [];
  const files: unknown[] = body.files;
  return files.flatMap((file): DriveFileRef[] => {
    if (!isRecord(file) || typeof file.id !== 'string' || typeof file.name !== 'string') return [];
    const ref: DriveFileRef = { id: file.id, name: file.name };
    if (typeof file.modifiedTime === 'string') ref.modifiedTime = file.modifiedTime;
    const owners: unknown = file.owners;
    const owner: unknown = Array.isArray(owners) ? owners[0] : undefined;
    if (isRecord(owner) && typeof owner.displayName === 'string') ref.ownerName = owner.displayName;
    return [ref];
  });
}

async function describeError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string') {
      return body.error.message;
    }
  } catch {
    // corps non JSON : on retombe sur le statut HTTP
  }
  if (response.status === 404) {
    return 'Fichier introuvable, ou non autorisé pour cette application (utilisez « Choisir un fichier partagé »).';
  }
  return `Erreur Google Drive (${response.status}).`;
}

export class GDriveClient implements IDriveSession {
  private accessToken: string | null = null;
  private expiresAt = 0;

  constructor(private readonly config: GDriveConfig) {}

  get canPickFiles(): boolean {
    return Boolean(this.config.apiKey);
  }

  isSignedIn(): boolean {
    return this.accessToken !== null && Date.now() < this.expiresAt;
  }

  msUntilExpiry(): number {
    return Math.max(0, this.expiresAt - Date.now());
  }

  preload(): Promise<void> {
    return loadScript(GIS_SRC);
  }

  async signIn(): Promise<void> {
    await loadScript(GIS_SRC);
    const response = await new Promise<google.accounts.oauth2.TokenResponse>((resolve, reject) => {
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: this.config.clientId,
        scope: DRIVE_FILE_SCOPE,
        callback: (tokenResponse) => {
          if (tokenResponse.error) reject(new Error(tokenResponse.error_description || tokenResponse.error));
          else resolve(tokenResponse);
        },
        error_callback: (error) => {
          reject(
            new Error(
              error.type === 'popup_closed'
                ? 'Fenêtre de connexion Google fermée.'
                : "Impossible d'ouvrir la fenêtre de connexion Google (fenêtre bloquée ?).",
            ),
          );
        },
      });
      tokenClient.requestAccessToken();
    });

    const seconds = Number(response.expires_in);
    const lifetime = Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_TOKEN_LIFETIME_SECONDS;
    this.accessToken = response.access_token;
    this.expiresAt = Date.now() + lifetime * 1000 - EXPIRY_MARGIN_MS;
  }

  signOut(): void {
    const token = this.accessToken;
    this.accessToken = null;
    this.expiresAt = 0;
    if (token) google.accounts.oauth2.revoke(token, () => undefined);
  }

  async findFilesByName(name: string): Promise<DriveFileRef[]> {
    const escaped = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const params = new URLSearchParams({
      q: `name = '${escaped}' and trashed = false`,
      fields: 'files(id,name,modifiedTime,owners(displayName))',
      orderBy: 'modifiedTime desc',
      pageSize: '20',
    });
    const response = await this.request(`${FILES_URL}?${params}`);
    return parseFileList(await response.json());
  }

  async createJsonFile(name: string, content: string): Promise<{ id: string; checksum: string }> {
    const boundary = `patrimoine-${Math.random().toString(36).slice(2)}`;
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify({ name, mimeType: JSON_MIME }),
      `--${boundary}`,
      `Content-Type: ${JSON_MIME}; charset=UTF-8`,
      '',
      content,
      `--${boundary}--`,
      '',
    ].join('\r\n');

    const response = await this.request(`${UPLOAD_URL}?uploadType=multipart&fields=id,md5Checksum,modifiedTime`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    const created: unknown = await response.json();
    if (!isRecord(created) || typeof created.id !== 'string') {
      throw new DriveApiError(500, 'Réponse Google Drive inattendue à la création du fichier.');
    }
    return { id: created.id, checksum: checksumOf(created) };
  }

  async readJsonFile(id: string): Promise<{ text: string; checksum: string }> {
    const checksum = await this.getChecksum(id);
    const response = await this.request(`${FILES_URL}/${encodeURIComponent(id)}?alt=media`);
    return { text: await response.text(), checksum };
  }

  async updateJsonFile(id: string, content: string): Promise<{ checksum: string }> {
    const response = await this.request(
      `${UPLOAD_URL}/${encodeURIComponent(id)}?uploadType=media&fields=md5Checksum,modifiedTime`,
      { method: 'PATCH', headers: { 'Content-Type': `${JSON_MIME}; charset=UTF-8` }, body: content },
    );
    return { checksum: checksumOf(await response.json()) };
  }

  async getChecksum(id: string): Promise<string> {
    const response = await this.request(`${FILES_URL}/${encodeURIComponent(id)}?fields=md5Checksum,modifiedTime`);
    return checksumOf(await response.json());
  }

  async pickFile(): Promise<DriveFileRef | null> {
    const { apiKey, clientId } = this.config;
    const token = this.accessToken;
    if (!apiKey) throw new Error('VITE_GOOGLE_API_KEY manquant : la sélection de fichier est indisponible.');
    if (!token || !this.isSignedIn()) throw new AuthExpiredError();

    await loadScript(GAPI_SRC);
    await new Promise<void>((resolve, reject) => {
      gapi.load('picker', {
        callback: resolve,
        onerror: () => reject(new Error('Impossible de charger le sélecteur de fichiers Google.')),
      });
    });

    return new Promise<DriveFileRef | null>((resolve) => {
      const mine = new google.picker.DocsView();
      mine.setQuery(DRIVE_FILE_NAME);
      const shared = new google.picker.DocsView();
      shared.setOwnedByMe(false);
      shared.setQuery(DRIVE_FILE_NAME);

      new google.picker.PickerBuilder()
        .addView(mine)
        .addView(shared)
        .setOAuthToken(token)
        .setDeveloperKey(apiKey)
        // Le numéro de projet Cloud est le préfixe numérique de l'identifiant client ; requis pour
        // que le scope `drive.file` donne accès au fichier choisi.
        .setAppId(clientId.split('-')[0] ?? '')
        .setTitle('Choisir le fichier patrimoine_data.json')
        .setCallback((data) => {
          const action = data[google.picker.Response.ACTION];
          if (action === google.picker.Action.PICKED) {
            const doc = data[google.picker.Response.DOCUMENTS]?.[0];
            const id = doc?.[google.picker.Document.ID];
            const name = doc?.[google.picker.Document.NAME];
            resolve(id ? { id, name: name ?? DRIVE_FILE_NAME } : null);
          } else if (action === google.picker.Action.CANCEL) {
            resolve(null);
          }
        })
        .build()
        .setVisible(true);
    });
  }

  private async request(url: string, options: RequestOptions = {}): Promise<Response> {
    if (!this.isSignedIn()) throw new AuthExpiredError();
    const response = await fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${this.accessToken}` },
    });
    if (response.status === 401) {
      this.accessToken = null;
      this.expiresAt = 0;
      throw new AuthExpiredError();
    }
    if (!response.ok) throw new DriveApiError(response.status, await describeError(response));
    return response;
  }
}
