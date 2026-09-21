import type { PatrimoineData } from '../../domain/models/PatrimoineData';
import { ConflictError } from '../gdrive/errors';
import type { IDriveClient } from '../gdrive/IDriveClient';
import type { IStorageDriver } from './IStorageDriver';
import { parsePatrimoineJson, serializePatrimoineData } from './parsePatrimoineData';

/**
 * Stockage sur un fichier Google Drive précis. Mémorise la somme de contrôle vue à la dernière lecture/écriture :
 * `save` refuse d'écraser un fichier modifié entre-temps (ConflictError) ; `overwrite` force l'écriture.
 */
export class DriveStorageDriver implements IStorageDriver {
  private knownChecksum: string | null;

  constructor(
    private readonly client: IDriveClient,
    readonly fileId: string,
    knownChecksum: string | null = null,
  ) {
    this.knownChecksum = knownChecksum;
  }

  get checksum(): string | null {
    return this.knownChecksum;
  }

  async load(): Promise<PatrimoineData | null> {
    const { text, checksum } = await this.client.readJsonFile(this.fileId);
    this.knownChecksum = checksum;
    return text.trim() === '' ? null : parsePatrimoineJson(text);
  }

  async hasRemoteChanged(): Promise<boolean> {
    return (await this.client.getChecksum(this.fileId)) !== this.knownChecksum;
  }

  async save(data: PatrimoineData): Promise<void> {
    if (await this.hasRemoteChanged()) throw new ConflictError();
    await this.overwrite(data);
  }

  async overwrite(data: PatrimoineData): Promise<void> {
    const { checksum } = await this.client.updateJsonFile(this.fileId, serializePatrimoineData(data));
    this.knownChecksum = checksum;
  }
}
