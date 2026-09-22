import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Account } from '../domain/models/Account';
import type { Bank } from '../domain/models/Bank';
import type { Budget } from '../domain/models/Budget';
import type { Loan } from '../domain/models/Loan';
import type { Movement } from '../domain/models/Movement';
import type { Property } from '../domain/models/Property';
import type { SafetySettings } from '../domain/models/Safety';
import type { IAccountRepository } from '../domain/repositories/IAccountRepository';
import type { IBankRepository } from '../domain/repositories/IBankRepository';
import type { IBudgetRepository } from '../domain/repositories/IBudgetRepository';
import type { ILoanRepository } from '../domain/repositories/ILoanRepository';
import type { IMovementRepository } from '../domain/repositories/IMovementRepository';
import type { IPropertyRepository } from '../domain/repositories/IPropertyRepository';
import type { ISettingsRepository } from '../domain/repositories/ISettingsRepository';
import { createDemoData } from '../domain/services/DemoData';
import { DriveSyncService } from '../infrastructure/gdrive/DriveSyncService';
import { AccountRepository } from '../infrastructure/repositories/AccountRepository';
import { BankRepository } from '../infrastructure/repositories/BankRepository';
import { BudgetRepository } from '../infrastructure/repositories/BudgetRepository';
import { LoanRepository } from '../infrastructure/repositories/LoanRepository';
import { MovementRepository } from '../infrastructure/repositories/MovementRepository';
import { PropertyRepository } from '../infrastructure/repositories/PropertyRepository';
import { SettingsRepository } from '../infrastructure/repositories/SettingsRepository';
import type { IStorageDriver } from '../infrastructure/storage/IStorageDriver';
import { LocalStorageDriver } from '../infrastructure/storage/LocalStorageDriver';
import { PatrimoineStore } from '../infrastructure/storage/PatrimoineStore';
import { useAuth } from './AuthContext';

interface DataSnapshot {
  accounts: Account[];
  movements: Movement[];
  budgets: Budget[];
  loans: Loan[];
  banks: Bank[];
  properties: Property[];
  /** Absent tant qu'aucun seuil d'épargne de sécurité n'est défini. */
  safety: SafetySettings | undefined;
}

interface FinancialContextValue extends DataSnapshot {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  accountRepository: IAccountRepository;
  movementRepository: IMovementRepository;
  budgetRepository: IBudgetRepository;
  loanRepository: ILoanRepository;
  bankRepository: IBankRepository;
  propertyRepository: IPropertyRepository;
  settingsRepository: ISettingsRepository;
  sync: DriveSyncService;
  loadDemoData: () => Promise<void>;
}

const FinancialContext = createContext<FinancialContextValue | null>(null);

const EMPTY_SNAPSHOT: DataSnapshot = {
  accounts: [],
  movements: [],
  budgets: [],
  loans: [],
  banks: [],
  properties: [],
  safety: undefined,
};

interface FinancialProviderProps {
  /** Cache local ; par défaut le `localStorage` du navigateur. */
  storage?: IStorageDriver;
  children: ReactNode;
}

/** Racine de composition : câble store, repositories et synchronisation Drive. L'UI ne voit que les repositories. */
export function FinancialProvider({ storage, children }: FinancialProviderProps) {
  const { session, isSignedIn } = useAuth();
  const [services] = useState(() => {
    const store = new PatrimoineStore(storage ?? new LocalStorageDriver());
    return {
      store,
      accountRepository: new AccountRepository(store),
      movementRepository: new MovementRepository(store),
      budgetRepository: new BudgetRepository(store),
      loanRepository: new LoanRepository(store),
      bankRepository: new BankRepository(store),
      propertyRepository: new PropertyRepository(store),
      settingsRepository: new SettingsRepository(store),
      sync: new DriveSyncService(store, session),
    };
  });
  const {
    store,
    accountRepository,
    movementRepository,
    budgetRepository,
    loanRepository,
    bankRepository,
    propertyRepository,
    settingsRepository,
    sync,
  } = services;

  const [status, setStatus] = useState<FinancialContextValue['status']>('loading');
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DataSnapshot>(EMPTY_SNAPSHOT);

  useEffect(() => {
    let active = true;
    const refresh = async (): Promise<void> => {
      const [accounts, movements, budgets, loans, banks, properties, safety] = await Promise.all([
        accountRepository.list(),
        movementRepository.list(),
        budgetRepository.list(),
        loanRepository.list(),
        bankRepository.list(),
        propertyRepository.list(),
        settingsRepository.getSafety(),
      ]);
      if (active) setData({ accounts, movements, budgets, loans, banks, properties, safety });
    };

    const unsubscribe = store.subscribe(() => void refresh());
    store
      .load()
      .then(() => {
        if (!active) return;
        sync.start();
        setStatus('ready');
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : String(caught));
        setStatus('error');
      });

    return () => {
      active = false;
      unsubscribe();
      sync.dispose();
    };
  }, [
    store,
    accountRepository,
    movementRepository,
    budgetRepository,
    loanRepository,
    bankRepository,
    propertyRepository,
    settingsRepository,
    sync,
  ]);

  useEffect(() => {
    if (!isSignedIn) sync.markSignedOut();
  }, [isSignedIn, sync]);

  const loadDemoData = useCallback(() => store.replace(createDemoData()), [store]);

  const value = useMemo<FinancialContextValue>(
    () => ({
      ...data,
      status,
      error,
      accountRepository,
      movementRepository,
      budgetRepository,
      loanRepository,
      bankRepository,
      propertyRepository,
      settingsRepository,
      sync,
      loadDemoData,
    }),
    [
      data,
      status,
      error,
      accountRepository,
      movementRepository,
      budgetRepository,
      loanRepository,
      bankRepository,
      propertyRepository,
      settingsRepository,
      sync,
      loadDemoData,
    ],
  );
  return <FinancialContext.Provider value={value}>{children}</FinancialContext.Provider>;
}

export function useFinancial(): FinancialContextValue {
  const value = useContext(FinancialContext);
  if (!value) throw new Error('useFinancial doit être utilisé dans un <FinancialProvider>.');
  return value;
}
