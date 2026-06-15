import { useEffect, useState } from 'react';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import {
  getPaiementsFournisseur, marquerPaiementPaye,
  type PaiementRow, type PaiementsKpis, type FournisseurRow,
} from '../api';

const euros = (v: number | string | null) =>
  v === null || v === undefined ? '—' : `${Number(v).toFixed(2)} €`;
const date = (s: string | null) => (s ? new Date(s).toLocaleDateString('fr-FR') : '—');

const OPT_LABEL: Record<string, string> = { a: 'A · prépayé', b: 'B · récupération', c: 'C · scan' };

interface Props {
  fournisseur: FournisseurRow | null;
  onClose: () => void;
}

export default function HistoriqueModal({ fournisseur, onClose }: Props) {
  const [kpis, setKpis] = useState<PaiementsKpis | null>(null);
  const [rows, setRows] = useState<PaiementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payingId, setPayingId] = useState<string | null>(null);

  const load = async () => {
    if (!fournisseur) return;
    setLoading(true);
    try {
      const res = await getPaiementsFournisseur(fournisseur.id);
      setKpis(res.kpis);
      setRows(res.transactions);
      setError('');
    } catch {
      setError('Impossible de charger l\'historique.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (fournisseur) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fournisseur?.id]);

  const handlePayer = async (p: PaiementRow) => {
    if (!confirm(`Marquer ce paiement (${euros(p.montant_ht)}) comme réglé ?`)) return;
    setPayingId(p.id);
    try {
      await marquerPaiementPaye(p.id);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Échec de la mise à jour.');
    } finally {
      setPayingId(null);
    }
  };

  const Kpi = ({ label, value }: { label: string; value: string }) => (
    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-bold text-gray-900">{value}</div>
    </div>
  );

  return (
    <Modal open={!!fournisseur} onClose={onClose} title={`Historique paiements — ${fournisseur?.nom_societe ?? ''}`} maxWidth="max-w-4xl">
      <div className="space-y-4">
        {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        {kpis && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Kpi label="Payé ce mois" value={euros(kpis.paye_ce_mois)} />
            <Kpi label="En attente" value={euros(kpis.en_attente)} />
            <Kpi label="Bons validés" value={String(kpis.bons_valides)} />
            <Kpi label="Prix moyen / bon" value={euros(kpis.prix_moyen)} />
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Bon', 'Offre', 'Ambassadeur', 'Montant HT', 'Fait générateur', 'Échéance', 'Statut', ''].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center text-gray-400 py-10">Chargement…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-gray-400 py-10">Aucun paiement enregistré pour l'instant.</td></tr>
              ) : rows.map(p => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">{p.bon_reference || '—'}</td>
                  <td className="px-3 py-2 text-gray-700">{p.offre_nom || '—'}</td>
                  <td className="px-3 py-2 text-gray-700">{[p.amb_prenom, p.amb_nom].filter(Boolean).join(' ') || '—'}</td>
                  <td className="px-3 py-2 text-gray-900 font-medium">{euros(p.montant_ht)}</td>
                  <td className="px-3 py-2 text-gray-500">
                    {date(p.fait_generateur_at)}
                    <span className="block text-[10px] text-gray-400">{OPT_LABEL[(p.option_paiement || '').toLowerCase()] || '—'}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-500">{date(p.echeance_at)}</td>
                  <td className="px-3 py-2">
                    <Badge label={p.statut === 'paye' ? 'Payé' : 'En attente'} variant={p.statut === 'paye' ? 'success' : 'warning'} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {p.statut === 'en_attente' && (
                      <button
                        onClick={() => handlePayer(p)}
                        disabled={payingId === p.id}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg border border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-50"
                      >
                        {payingId === p.id ? '…' : 'Marquer payé'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400">
          Le virement reste effectué manuellement (hors application). « Marquer payé » sert au suivi.
        </p>
      </div>
    </Modal>
  );
}
