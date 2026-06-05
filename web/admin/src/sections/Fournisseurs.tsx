import { useState } from 'react';
import Badge from '../components/Badge';

interface Fournisseur {
  id: number;
  societe: string;
  contrat: 'signe' | 'en_attente';
  statut: string;
  offres_actives: number;
}

// Données statiques — à remplacer par un appel API quand disponible
const SAMPLE_FOURNISSEURS: Fournisseur[] = [];

export default function Fournisseurs() {
  const [showInfo, setShowInfo] = useState(false);
  const [fournisseurs] = useState<Fournisseur[]>(SAMPLE_FOURNISSEURS);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Fournisseurs</h2>
        <button
          onClick={() => setShowInfo(true)}
          className="px-4 py-2 text-sm font-medium rounded-xl text-white transition-opacity hover:opacity-80"
          style={{ backgroundColor: '#C9A84C' }}
        >
          + Ajouter un fournisseur
        </button>
      </div>

      {showInfo && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <span className="text-xl">ℹ️</span>
          <div>
            <p className="text-sm font-medium text-blue-800">Fonctionnalité en développement</p>
            <p className="text-sm text-blue-700 mt-1">
              L'ajout de fournisseurs est disponible via l'interface de configuration du back-office.
              Contactez l'équipe technique pour accéder à ce module.
            </p>
          </div>
          <button
            onClick={() => setShowInfo(false)}
            className="ml-auto text-blue-400 hover:text-blue-600 text-sm"
          >
            ✕
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Société', 'Contrat', 'Statut', 'Offres actives'].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fournisseurs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center text-gray-400 py-16">
                    <p className="text-3xl mb-3">🏪</p>
                    <p className="font-medium">Aucun fournisseur enregistré</p>
                    <p className="text-xs mt-1 text-gray-300">Les fournisseurs seront affichés ici une fois configurés</p>
                  </td>
                </tr>
              ) : fournisseurs.map(f => (
                <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{f.societe}</td>
                  <td className="px-4 py-3">
                    {f.contrat === 'signe' ? (
                      <span className="text-green-600 font-medium">✓ Signé</span>
                    ) : (
                      <Badge label="En attente" variant="warning" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={f.statut} variant="info" />
                  </td>
                  <td className="px-4 py-3 font-semibold" style={{ color: '#C9A84C' }}>
                    {f.offres_actives}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
