import type { PatrimoineData } from '../domain/models/PatrimoineData';
import { AuthExpiredError } from '../infrastructure/gdrive/errors';
import type { DriveFileRef, IDriveClient } from '../infrastructure/gdrive/IDriveClient';
import { serializePatrimoineData } from '../infrastructure/storage/parsePatrimoineData';

interface FakeFile {
  name: string;
  text: string;
  version: number;
}

/** Drive en mémoire : la somme de contrôle est le numéro de version du fichier. */
export class FakeDriveClient implements IDriveClient {
  readonly files = new Map<string, FakeFile>();
  writes = 0;
  authExpired = false;
  failNext: Error | null = null;
  private nextId = 1;

  async findFilesByName(name: string): Promise<DriveFileRef[]> {
    this.guard();
    return [...this.files].filter(([, file]) => file.name === name).map(([id, file]) => ({ id, name: file.name }));
  }

  async createJsonFile(name: string, content: string): Promise<{ id: string; checksum: string }> {
    this.guard();
    const id = `file-${this.nextId++}`;
    this.files.set(id, { name, text: content, version: 1 });
    this.writes += 1;
    return { id, checksum: 'v1' };
  }

  async readJsonFile(id: string): Promise<{ text: string; checksum: string }> {
    this.guard();
    const file = this.file(id);
    return { text: file.text, checksum: `v${file.version}` };
  }

  async updateJsonFile(id: string, content: string): Promise<{ checksum: string }> {
    this.guard();
    const file = this.file(id);
    file.text = content;
    file.version += 1;
    this.writes += 1;
    return { checksum: `v${file.version}` };
  }

  async getChecksum(id: string): Promise<string> {
    this.guard();
    return `v${this.file(id).version}`;
  }

  /** Ajoute un fichier comme s'il avait été créé par un autre utilisateur. */
  seed(name: string, text: string): string {
    const id = `file-${this.nextId++}`;
    this.files.set(id, { name, text, version: 1 });
    return id;
  }

  /** Simule la modification du fichier par un autre utilisateur. */
  externalEdit(id: string, data: PatrimoineData): void {
    const file = this.file(id);
    file.text = serializePatrimoineData(data);
    file.version += 1;
  }

  remoteText(id: string): string {
    return this.file(id).text;
  }

  private file(id: string): FakeFile {
    const file = this.files.get(id);
    if (!file) throw new Error(`Fichier inconnu : ${id}`);
    return file;
  }

  private guard(): void {
    if (this.authExpired) throw new AuthExpiredError();
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
  }
}
