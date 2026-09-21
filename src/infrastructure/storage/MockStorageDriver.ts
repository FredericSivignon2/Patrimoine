import type { PatrimoineData } from '../../domain/models/PatrimoineData';
import type { IStorageDriver } from './IStorageDriver';

/** Stockage en mémoire, pour les tests et les démonstrations sans persistance. */
export class MockStorageDriver implements IStorageDriver {
  saveCount = 0;

  constructor(public stored: PatrimoineData | null = null) {}

  async load(): Promise<PatrimoineData | null> {
    return this.stored;
  }

  async save(data: PatrimoineData): Promise<void> {
    this.stored = data;
    this.saveCount += 1;
  }
}
