import type { PatrimoineData } from '../../domain/models/PatrimoineData';

export interface IStorageDriver {
  /** `null` si aucune donnée n'a encore été enregistrée. */
  load(): Promise<PatrimoineData | null>;
  save(data: PatrimoineData): Promise<void>;
}
