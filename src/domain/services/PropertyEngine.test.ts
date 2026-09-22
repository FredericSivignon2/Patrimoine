import { describe, expect, it } from 'vitest';
import type { Loan } from '../models/Loan';
import type { Property } from '../models/Property';
import { propertyCushion, totalPropertyCushion } from './PropertyEngine';

const REFERENCE = new Date(2026, 8, 21); // 21 septembre 2026

const property = (overrides: Partial<Property> = {}): Property => ({
  id: 'p1',
  name: 'Appartement loué',
  estimatedValue: 20_000_000, // 200 000 €
  sellingFeePercent: 8,
  ...overrides,
});

const loan = (overrides: Partial<Loan> = {}): Loan => ({
  id: 'l1',
  name: 'Prêt locatif',
  kind: 'MORTGAGE',
  principal: 10_000_000, // 100 000 €
  annualRate: 0,
  monthlyPayment: 100_000, // 1 000 €/mois, taux zéro : capital pur
  firstPaymentDate: '2026-10-05',
  ...overrides,
});

describe('propertyCushion', () => {
  it('soustrait les frais de vente (% de la valeur estimée) quand il n’y a pas de prêt rattaché', () => {
    // 200 000 € × 8 % = 16 000 €
    expect(propertyCushion(property(), [], REFERENCE)).toBe(20_000_000 - 1_600_000);
  });

  it('soustrait aussi le capital restant dû du prêt rattaché, à la date de référence', () => {
    const l = loan();
    const p = property({ loanId: l.id });
    // rien n'est encore remboursé au 21/09 (1re échéance le 5/10) : 100 000 € restants
    expect(propertyCushion(p, [l], REFERENCE)).toBe(20_000_000 - 1_600_000 - 10_000_000);
  });

  it('recalcule automatiquement quand le prêt s’amortit (capital restant dû plus bas)', () => {
    const l = loan();
    const p = property({ loanId: l.id });
    const later = new Date(2027, 2, 1); // après plusieurs échéances
    expect(propertyCushion(p, [l], later)).toBeGreaterThan(propertyCushion(p, [l], REFERENCE));
  });

  it('ignore un prêt rattaché introuvable (traité comme 0 de capital restant dû)', () => {
    const p = property({ loanId: 'inconnu' });
    expect(propertyCushion(p, [], REFERENCE)).toBe(propertyCushion(property(), [], REFERENCE));
  });

  it('ignore un prêt rattaché dont l’échéancier est invalide', () => {
    const broken = loan({ principal: 100_000_000, annualRate: 12, monthlyPayment: 100 }); // ne couvre pas les intérêts
    const p = property({ loanId: broken.id });
    expect(propertyCushion(p, [broken], REFERENCE)).toBe(propertyCushion(property(), [], REFERENCE));
  });

  it('plafonne à 0 : un bien qui vaudrait moins que son prêt et ses frais n’est pas un coussin négatif', () => {
    const l = loan({ principal: 25_000_000, monthlyPayment: 50_000 }); // 500 échéances, rien d'encore payé
    const p = property({ loanId: l.id, estimatedValue: 20_000_000 });
    expect(propertyCushion(p, [l], REFERENCE)).toBe(0);
  });

  it('accepte des frais de vente nuls', () => {
    expect(propertyCushion(property({ sellingFeePercent: 0 }), [], REFERENCE)).toBe(20_000_000);
  });
});

describe('totalPropertyCushion', () => {
  it('additionne le coussin de chaque bien', () => {
    const a = property({ id: 'a', estimatedValue: 20_000_000, sellingFeePercent: 8 });
    const b = property({ id: 'b', estimatedValue: 15_000_000, sellingFeePercent: 5 });
    expect(totalPropertyCushion([a, b], [], REFERENCE)).toBe(
      propertyCushion(a, [], REFERENCE) + propertyCushion(b, [], REFERENCE),
    );
  });

  it('vaut 0 sans aucun bien', () => {
    expect(totalPropertyCushion([], [], REFERENCE)).toBe(0);
  });
});
