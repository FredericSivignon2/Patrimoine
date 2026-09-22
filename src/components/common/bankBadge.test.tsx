import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BankBadge, bankColorClass, bankInitials } from './bankBadge';

describe('bankInitials', () => {
  it('ignore les articles et prend la première lettre de chaque mot restant', () => {
    expect(bankInitials('La Banque Postale')).toBe('BP');
    expect(bankInitials('La Caisse d’Épargne')).toBe('CÉ');
    expect(bankInitials('Trade Republic')).toBe('TR');
  });

  it('garde un sigle court tel quel, et raccourcit un mot unique plus long', () => {
    expect(bankInitials('LCL')).toBe('LCL');
    expect(bankInitials('AFER')).toBe('AFER');
    expect(bankInitials('AXA')).toBe('AXA');
    expect(bankInitials('Natixis')).toBe('NAT');
  });

  it('n’est jamais vide, même sans aucun mot significatif', () => {
    expect(bankInitials('  ')).toBe('?');
  });
});

describe('bankColorClass', () => {
  it('est déterministe : le même nom donne toujours la même couleur', () => {
    expect(bankColorClass('LCL')).toBe(bankColorClass('LCL'));
  });

  it('varie selon le nom (au moins deux couleurs différentes sur un petit échantillon)', () => {
    const names = ['La Banque Postale', 'LCL', 'AFER', 'Natixis', 'AXA', 'Trade Republic'];
    expect(new Set(names.map(bankColorClass)).size).toBeGreaterThan(1);
  });
});

describe('BankBadge', () => {
  it('affiche les initiales et porte le nom complet en attribut accessible', () => {
    render(<BankBadge name="La Banque Postale" />);
    const badge = screen.getByRole('img', { name: 'La Banque Postale' });
    expect(badge).toHaveTextContent('BP');
  });
});
