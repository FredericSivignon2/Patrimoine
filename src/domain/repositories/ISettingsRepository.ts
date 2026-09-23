import type { SafetySettings } from '../models/Safety';
import type { SavingsEffortSettings } from '../models/SavingsEffort';

export interface ISettingsRepository {
  getSafety(): Promise<SafetySettings | undefined>;
  saveSafety(settings: SafetySettings): Promise<SafetySettings>;
  clearSafety(): Promise<void>;

  getSavingsEffort(): Promise<SavingsEffortSettings | undefined>;
  saveSavingsEffort(settings: SavingsEffortSettings): Promise<SavingsEffortSettings>;
  clearSavingsEffort(): Promise<void>;
}
