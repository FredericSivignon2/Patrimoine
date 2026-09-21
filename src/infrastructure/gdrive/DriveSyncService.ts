import { createEmptyData, type PatrimoineData } from '../../domain/models/PatrimoineData';
import { DriveStorageDriver } from '../storage/DriveStorageDriver';
import { serializePatrimoineData } from '../storage/parsePatrimoineData';
import type { PatrimoineStore } from '../storage/PatrimoineStore';
import { AuthExpiredError, ConflictError } from './errors';
import { DRIVE_FILE_NAME, type DriveFileRef, type IDriveClient } from './IDriveClient';

export type SyncState =
  | { status: 'unavailable' }
  | { status: 'unbound' }
  | { status: 'auth-required'; fileId: string }
  | { status: 'idle'; fileId: string }
  | { status: 'syncing'; fileId: string }
  | { status: 'conflict'; fileId: string }
  | { status: 'error'; fileId: string; message: string };

export type BindingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Lien persistant avec un fichier Drive : identifiant, dernière somme de contrôle synchronisée, modifications locales en attente. */
interface Binding {
  fileId: string;
  checksum: string | null;
  dirty: boolean;
}

export const BINDING_STORAGE_KEY = 'patrimoine_drive_binding';
export const PUSH_DELAY_MS = 1500;

function readBinding(storage: BindingStorage): Binding | null {
  try {
    const raw = storage.getItem(BINDING_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { fileId, checksum, dirty } = parsed as Record<string, unknown>;
    if (typeof fileId !== 'string' || fileId === '') return null;
    return {
      fileId,
      checksum: typeof checksum === 'string' ? checksum : null,
      dirty: dirty === true,
    };
  } catch {
    return null;
  }
}

/**
 * Synchronise le cache local (`PatrimoineStore`) avec un fichier Drive.
 * Local d'abord : les modifications sont toujours écrites en local, puis envoyées sur Drive après un court délai.
 * L'authentification Google est gérée à part (AuthContext) ; ce service réagit via `resume()` / `markSignedOut()`.
 */
export class DriveSyncService {
  private state: SyncState;
  private binding: Binding | null;
  private driver: DriveStorageDriver | null = null;
  private lastSynced: PatrimoineData | null = null;
  private unsubscribeStore: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pushing = false;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly store: PatrimoineStore,
    private readonly client: IDriveClient | null,
    private readonly persistence: BindingStorage = window.localStorage,
    private readonly pushDelayMs: number = PUSH_DELAY_MS,
  ) {
    this.binding = client ? readBinding(persistence) : null;
    if (!client) this.state = { status: 'unavailable' };
    else if (this.binding) this.state = { status: 'auth-required', fileId: this.binding.fileId };
    else this.state = { status: 'unbound' };
  }

  // --- cycle de vie -------------------------------------------------------------------------------------------

  /** À appeler une fois les données locales chargées : le chargement initial n'est pas une modification. */
  start(): void {
    this.lastSynced = this.store.snapshot();
    this.unsubscribeStore = this.store.subscribe(() => this.onStoreChange());
  }

  dispose(): void {
    this.unsubscribeStore?.();
    this.unsubscribeStore = null;
    this.clearTimer();
  }

  readonly getState = (): SyncState => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  // --- liaison à un fichier ---------------------------------------------------------------------------------

  async listCandidates(): Promise<DriveFileRef[]> {
    return this.requireClient().findFilesByName(DRIVE_FILE_NAME);
  }

  /** Lie un fichier existant : son contenu remplace les données locales. Lève une erreur (rien n'est lié) si illisible. */
  async linkExisting(fileId: string): Promise<void> {
    const driver = new DriveStorageDriver(this.requireClient(), fileId);
    await this.applyRemote(driver);
    this.driver = driver;
    this.setState({ status: 'idle', fileId });
  }

  /** Crée `patrimoine_data.json` à partir des données locales (vierges si aucune saisie) et le lie. */
  async createAndLink(): Promise<void> {
    const client = this.requireClient();
    const data = this.store.snapshot();
    const { id, checksum } = await client.createJsonFile(DRIVE_FILE_NAME, serializePatrimoineData(data));

    this.driver = new DriveStorageDriver(client, id, checksum);
    this.lastSynced = data;
    this.binding = { fileId: id, checksum, dirty: false };
    this.saveBinding();
    this.setState({ status: 'idle', fileId: id });
    if (this.store.snapshot() !== data) this.onStoreChange(); // modifié pendant la création
  }

  /** Délie le fichier ; les données locales sont conservées. */
  unlink(): void {
    this.clearTimer();
    this.driver = null;
    this.binding = null;
    this.lastSynced = this.store.snapshot();
    this.persistence.removeItem(BINDING_STORAGE_KEY);
    this.setState(this.client ? { status: 'unbound' } : { status: 'unavailable' });
  }

  // --- synchronisation ---------------------------------------------------------------------------------------

  /** À appeler après une (re)connexion Google réussie quand un fichier est lié. */
  async resume(): Promise<void> {
    const { client, binding } = this;
    if (!client || !binding) return;
    const driver = this.driver ?? new DriveStorageDriver(client, binding.fileId, binding.checksum);
    this.driver = driver;
    this.setState({ status: 'syncing', fileId: binding.fileId });
    try {
      if (!binding.dirty) {
        await this.applyRemote(driver);
        this.setState({ status: 'idle', fileId: binding.fileId });
      } else if (await driver.hasRemoteChanged()) {
        this.setState({ status: 'conflict', fileId: binding.fileId });
      } else {
        await this.push();
      }
    } catch (error) {
      this.fail(error);
    }
  }

  /** Prend la version Drive (résolution d'un conflit, ou rechargement manuel). */
  async pull(): Promise<void> {
    const { driver, binding } = this;
    if (!driver || !binding) return;
    this.setState({ status: 'syncing', fileId: binding.fileId });
    try {
      await this.applyRemote(driver);
      this.setState({ status: 'idle', fileId: binding.fileId });
    } catch (error) {
      this.fail(error);
    }
  }

  /** Écrase Drive avec la version locale (résolution d'un conflit). */
  forcePush(): Promise<void> {
    return this.push(true);
  }

  retry(): Promise<void> {
    return this.binding?.dirty ? this.push() : this.pull();
  }

  markSignedOut(): void {
    if (this.binding) this.setState({ status: 'auth-required', fileId: this.binding.fileId });
  }

  // --- interne ---------------------------------------------------------------------------------------------

  private onStoreChange(): void {
    if (!this.binding || this.store.snapshot() === this.lastSynced) return;
    this.binding = { ...this.binding, dirty: true };
    this.saveBinding();
    const { status } = this.state;
    if (this.driver && (status === 'idle' || status === 'syncing' || status === 'error')) this.schedulePush();
  }

  private schedulePush(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.push();
    }, this.pushDelayMs);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private async push(force = false): Promise<void> {
    const { driver, binding } = this;
    if (!driver || !binding) return;
    if (this.pushing) {
      this.schedulePush();
      return;
    }

    this.pushing = true;
    this.setState({ status: 'syncing', fileId: binding.fileId });
    const snapshot = this.store.snapshot();
    try {
      if (force) await driver.overwrite(snapshot);
      else await driver.save(snapshot);
      this.lastSynced = snapshot;
      const changedMeanwhile = this.store.snapshot() !== snapshot;
      this.binding = { fileId: binding.fileId, checksum: driver.checksum, dirty: changedMeanwhile };
      this.saveBinding();
      this.setState({ status: 'idle', fileId: binding.fileId });
      if (changedMeanwhile) this.schedulePush();
    } catch (error) {
      this.fail(error);
    } finally {
      this.pushing = false;
    }
  }

  private async applyRemote(driver: DriveStorageDriver): Promise<void> {
    const data = (await driver.load()) ?? createEmptyData();
    // `lastSynced` avant `replace` : la notification du store ne doit pas passer pour une modification locale.
    this.lastSynced = data;
    this.binding = { fileId: driver.fileId, checksum: driver.checksum, dirty: false };
    this.saveBinding();
    await this.store.replace(data);
  }

  private fail(error: unknown): void {
    const fileId = this.binding?.fileId;
    if (!fileId) return;
    if (error instanceof ConflictError) this.setState({ status: 'conflict', fileId });
    else if (error instanceof AuthExpiredError) this.setState({ status: 'auth-required', fileId });
    else {
      this.setState({ status: 'error', fileId, message: error instanceof Error ? error.message : String(error) });
    }
  }

  private setState(state: SyncState): void {
    this.state = state;
    for (const listener of [...this.listeners]) listener();
  }

  private saveBinding(): void {
    if (this.binding) this.persistence.setItem(BINDING_STORAGE_KEY, JSON.stringify(this.binding));
  }

  private requireClient(): IDriveClient {
    if (!this.client) throw new Error("Google Drive n'est pas configuré.");
    return this.client;
  }
}
