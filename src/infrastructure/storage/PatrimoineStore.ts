import { createEmptyData, type PatrimoineData } from '../../domain/models/PatrimoineData';
import type { IStorageDriver } from './IStorageDriver';

export interface Mutation<T> {
  next: PatrimoineData;
  result: T;
}

/**
 * Document `patrimoine_data.json` en mémoire, partagé par tous les repositories.
 * Chaque modification produit un nouvel objet (immuable), notifie les abonnés puis est écrite dans le cache local.
 */
export class PatrimoineStore {
  private data: PatrimoineData = createEmptyData();
  private readonly listeners = new Set<() => void>();
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly local: IStorageDriver) {}

  async load(): Promise<PatrimoineData> {
    this.data = (await this.local.load()) ?? createEmptyData();
    this.emit();
    return this.data;
  }

  snapshot(): PatrimoineData {
    return this.data;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Applique une modification synchrone : si `change` lève une erreur, rien n'est modifié.
   * La promesse se résout une fois le cache local écrit.
   */
  async mutate<T>(change: (current: PatrimoineData) => Mutation<T>): Promise<T> {
    const { next, result } = change(this.data);
    this.data = next;
    this.emit();
    await this.persist();
    return result;
  }

  replace(next: PatrimoineData): Promise<void> {
    return this.mutate(() => ({ next, result: undefined }));
  }

  private persist(): Promise<void> {
    const write = this.writeChain.then(() => this.local.save(this.data));
    this.writeChain = write.catch(() => undefined);
    return write;
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
