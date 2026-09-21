import type { PatrimoineData } from '../../domain/models/PatrimoineData';
import type { IStorageDriver } from './IStorageDriver';
import { parsePatrimoineJson, serializePatrimoineData } from './parsePatrimoineData';

export const LOCAL_STORAGE_KEY = 'patrimoine_data';

/** Cache local / mode hors ligne, dans le `localStorage` du navigateur. */
export class LocalStorageDriver implements IStorageDriver {
  constructor(
    private readonly key: string = LOCAL_STORAGE_KEY,
    private readonly storage: Storage = window.localStorage,
  ) {}

  async load(): Promise<PatrimoineData | null> {
    const raw = this.storage.getItem(this.key);
    if (raw === null) return null;
    try {
      return parsePatrimoineJson(raw);
    } catch (error) {
      // Contenu illisible : on le met de côté avant que la prochaine sauvegarde ne l'écrase.
      const backupKey = `${this.key}.corrompu.${Date.now()}`;
      this.storage.setItem(backupKey, raw);
      console.warn(`Données locales illisibles, copie conservée sous « ${backupKey} ».`, error);
      return null;
    }
  }

  async save(data: PatrimoineData): Promise<void> {
    this.storage.setItem(this.key, serializePatrimoineData(data));
  }
}
