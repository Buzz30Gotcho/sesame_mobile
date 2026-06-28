import { render, screen } from '@testing-library/react';
import Badge from '../../src/components/Badge';

// Test d'intégration (composant) : on rend réellement <Badge> dans le DOM (jsdom)
// et on vérifie ce qui est affiché.
describe('<Badge>', () => {
    it('affiche le libellé', () => {
        render(<Badge label="Terminée" variant="success" />);
        expect(screen.getByText('Terminée')).toBeInTheDocument();
    });
    it('affiche le compteur quand count > 0', () => {
        render(<Badge label="Tickets" count={3} />);
        expect(screen.getByText('3')).toBeInTheDocument();
    });
    it('plafonne le compteur à 99+', () => {
        render(<Badge label="Tickets" count={150} />);
        expect(screen.getByText('99+')).toBeInTheDocument();
    });
    it('masque la pastille quand count vaut 0', () => {
        render(<Badge label="Tickets" count={0} />);
        expect(screen.queryByText('0')).not.toBeInTheDocument();
    });
});
