import { useEffect, useState } from 'react';
import Badge from '../components/Badge';
import { getFournisseurs, envoyerContratFournisseur, type FournisseurRow } from '../api';

export default function Fournisseurs() {
  const [fournisseurs, setFournisseurs] = useState<FournisseurRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const load = async () => {
    try {
      setFournisseurs(await getFournisseurs());
    } catch {
      setMsg({ type: 'err', text: 'Impossible de charger les fournisseurs.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleEnvoyer = async (f: FournisseurRow) => {
    setSendingId(f.id);
    setMsg(null);
    try {
      const res = await envoyerContratFournisseur(f.id);
      setMsg({ type: 'ok', text: res.message || `Contrat envoyé à ${f.nom_societe}.` });
      await load();
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.response?.data?.error || "Échec de l'envoi du contrat." });
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Fournisseurs</h2>
      </div>

      {msg && (
        <div className={`rounded-xl p-4 flex items-start gap-3 border ${msg.type === 'ok' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <span className="text-xl">{msg.type === 'ok' ? '✓' : '⚠️'}</span>
          <p className={`text-sm ${msg.type === 'ok' ? 'text-green-800' : 'text-red-800'}`}>{msg.text}</p>
          <button onClick={() => setMsg(null)} className="ml-auto text-gray-400 hover:text-gray-600 text-sm">✕</button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Société', 'Responsable légal', 'Contrat', 'Statut', 'Action'].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center text-gray-400 py-16">Chargement…</td></tr>
              ) : fournisseurs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-gray-400 py-16">
                    <p className="text-3xl mb-3">🏪</p>
                    <p className="font-medium">Aucun fournisseur enregistré</p>
                  </td>
                </tr>
              ) : fournisseurs.map(f => (
                <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{f.nom_societe}</td>
                  <td className="px-4 py-3 text-gray-500">{f.legal_email || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3">
                    {f.contrat_signe ? (
                      <span className="text-green-600 font-medium">✓ Signé</span>
                    ) : (
                      <Badge label="En attente" variant="warning" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={f.statut} variant="info" />
                  </td>
                  <td className="px-4 py-3">
                    {f.contrat_signe ? (
                      <span className="text-gray-300 text-xs">—</span>
                    ) : (
                      <button
                        onClick={() => handleEnvoyer(f)}
                        disabled={sendingId === f.id}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                        style={{ backgroundColor: '#C9A84C' }}
                      >
                        {sendingId === f.id ? 'Envoi…' : 'Envoyer le contrat'}
                      </button>
                    )}
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
