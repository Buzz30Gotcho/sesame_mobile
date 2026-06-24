import { useEffect, useState } from 'react';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import {
  getPaiementsFournisseur, marquerPaiementPaye,
  type PaiementRow, type PaiementsKpis, type FournisseurRow,
} from '../api';
import { usePrefs } from '../prefs';

const euros = (v: number | string | null) =>
  v === null || v === undefined ? '—' : `${Number(v).toFixed(2)} €`;

const LOCALES: Record<string, string> = { fr: 'fr-FR', en: 'en-US', it: 'it-IT', es: 'es-ES' };

interface Props {
  fournisseur: FournisseurRow | null;
  onClose: () => void;
}

export default function HistoriqueModal({ fournisseur, onClose }: Props) {
  const { t, lang } = usePrefs();
  const [kpis, setKpis] = useState<PaiementsKpis | null>(null);
  const [rows, setRows] = useState<PaiementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payingId, setPayingId] = useState<string | null>(null);

  const date = (s: string | null) => (s ? new Date(s).toLocaleDateString(LOCALES[lang]) : '—');
  const optLabel = (opt: string) => {
    const o = (opt || '').toLowerCase();
    return o === 'a' ? t('his.optA') : o === 'b' ? t('his.optB') : o === 'c' ? t('his.optC') : '—';
  };

  const load = async () => {
    if (!fournisseur) return;
    setLoading(true);
    try {
      const res = await getPaiementsFournisseur(fournisseur.id);
      setKpis(res.kpis);
      setRows(res.transactions);
      setError('');
    } catch {
      setError(t('his.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (fournisseur) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fournisseur?.id]);

  const handlePayer = async (p: PaiementRow) => {
    if (!confirm(`${t('his.confirmPay1')}${euros(p.montant_ht)}${t('his.confirmPay2')}`)) return;
    setPayingId(p.id);
    try {
      await marquerPaiementPaye(p.id);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error || t('his.updateFailed'));
    } finally {
      setPayingId(null);
    }
  };

  const Kpi = ({ label, value }: { label: string; value: string }) => (
    <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 border border-gray-100 dark:border-white/10">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{value}</div>
    </div>
  );

  return (
    <Modal open={!!fournisseur} onClose={onClose} title={`${t('his.title')} ${fournisseur?.nom_societe ?? ''}`} maxWidth="max-w-4xl">
      <div className="space-y-4">
        {error && <p className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2">{error}</p>}

        {kpis && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Kpi label={t('his.kpiPayeMois')} value={euros(kpis.paye_ce_mois)} />
            <Kpi label={t('his.kpiEnAttente')} value={euros(kpis.en_attente)} />
            <Kpi label={t('his.kpiBonsValides')} value={String(kpis.bons_valides)} />
            <Kpi label={t('his.kpiPrixMoyen')} value={euros(kpis.prix_moyen)} />
          </div>
        )}

        <div className="bg-white dark:bg-[#161624] rounded-xl border border-gray-100 dark:border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/10">
                {[t('his.colBon'), t('his.colOffre'), t('his.colAmb'), t('his.colMontantHT'), t('his.colFaitGen'), t('his.colEcheance'), t('common.status'), ''].map((h, idx) => (
                  <th key={idx} className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-3 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center text-gray-400 py-10">{t('common.loading')}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-gray-400 py-10">{t('his.empty')}</td></tr>
              ) : rows.map(p => (
                <tr key={p.id} className="border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5">
                  <td className="px-3 py-2 font-mono text-xs text-gray-700 dark:text-gray-200">{p.bon_reference || '—'}</td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-200">{p.offre_nom || '—'}</td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-200">{[p.amb_prenom, p.amb_nom].filter(Boolean).join(' ') || '—'}</td>
                  <td className="px-3 py-2 text-gray-900 dark:text-gray-100 font-medium">{euros(p.montant_ht)}</td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                    {date(p.fait_generateur_at)}
                    <span className="block text-[10px] text-gray-400">{optLabel(p.option_paiement || '')}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{date(p.echeance_at)}</td>
                  <td className="px-3 py-2">
                    <Badge label={p.statut === 'paye' ? t('his.paye') : t('his.enAttente')} variant={p.statut === 'paye' ? 'success' : 'warning'} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {p.statut === 'en_attente' && (
                      <button
                        onClick={() => handlePayer(p)}
                        disabled={payingId === p.id}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg border border-green-300 dark:border-green-500/30 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-500/10 disabled:opacity-50"
                      >
                        {payingId === p.id ? '…' : t('his.marquerPaye')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400">
          {t('his.footer')}
        </p>
      </div>
    </Modal>
  );
}
