import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import KpiCard from '../../src/components/KpiCard';
import Modal from '../../src/components/Modal';
import Table from '../../src/components/Table';

// Composants UI de base de l'admin : KPI, modale, table.

describe('<KpiCard>', () => {
    it('affiche le libellé et la valeur', () => {
        render(<KpiCard label="Courses" value={42} />);
        expect(screen.getByText('Courses')).toBeInTheDocument();
        expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('plafonne le badge à 99+ et le masque à 0', () => {
        const { rerender } = render(<KpiCard label="X" value={1} badge={150} />);
        expect(screen.getByText('99+')).toBeInTheDocument();
        rerender(<KpiCard label="X" value={1} badge={0} />);
        expect(screen.queryByText('0')).not.toBeInTheDocument();
    });
});

describe('<Modal>', () => {
    it('ne rend rien quand fermée', () => {
        const { container } = render(<Modal open={false} onClose={() => {}} title="T">contenu</Modal>);
        expect(container).toBeEmptyDOMElement();
    });

    it('affiche titre + contenu quand ouverte', () => {
        render(<Modal open onClose={() => {}} title="Mon titre">Mon contenu</Modal>);
        expect(screen.getByText('Mon titre')).toBeInTheDocument();
        expect(screen.getByText('Mon contenu')).toBeInTheDocument();
    });

    it('ferme via le bouton ✕ et la touche Échap', () => {
        const onClose = vi.fn();
        render(<Modal open onClose={onClose} title="T">c</Modal>);
        fireEvent.click(screen.getByText('✕'));
        expect(onClose).toHaveBeenCalledTimes(1);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(2);
    });
});

describe('<Table>', () => {
    const columns = [
        { key: 'nom', header: 'Nom' },
        { key: 'points', header: 'Points', render: (r: any) => <b>{r.points} pts</b> },
    ];

    it('affiche l\'état de chargement', () => {
        render(<Table columns={columns} data={[]} loading />);
        expect(screen.getByText('Chargement...')).toBeInTheDocument();
    });

    it('affiche le message vide sans données', () => {
        render(<Table columns={columns} data={[]} emptyMessage="Rien à afficher" />);
        expect(screen.getByText('Rien à afficher')).toBeInTheDocument();
    });

    it('rend les lignes avec le rendu personnalisé de colonne', () => {
        render(<Table columns={columns} data={[{ id: 1, nom: 'Alice', points: 30 }]} />);
        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText('30 pts')).toBeInTheDocument();
    });
});
