import type { SafetySettings } from '../../domain/models/Safety';
import type { ISettingsRepository } from '../../domain/repositories/ISettingsRepository';
import { validateSafety } from '../../domain/services/Validation';
import type { PatrimoineStore } from '../storage/PatrimoineStore';

export class SettingsRepository implements ISettingsRepository {
  constructor(private readonly store: PatrimoineStore) {}

  async getSafety(): Promise<SafetySettings | undefined> {
    return this.store.snapshot().safety;
  }

  saveSafety(settings: SafetySettings): Promise<SafetySettings> {
    return this.store.mutate((data) => {
      const safety = validateSafety(settings);
      return { next: { ...data, safety }, result: safety };
    });
  }

  clearSafety(): Promise<void> {
    return this.store.mutate((data) => {
      const { safety: _removed, ...rest } = data;
      return { next: rest, result: undefined };
    });
  }
}
