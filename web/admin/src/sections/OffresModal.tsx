import { useEffect, useState } from 'react';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import {
  getOffres, createOffre, updateOffre, deleteOffre,
  type OffreRow, type OffreInput, type FournisseurRow,
} from '../api';
import { usePrefs } from '../prefs';

const inputCls = 'w-full border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400';
const labelCls = 'block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1';

const emptyForm: OffreInput = {
  nom: '', description: '', stock: null, pts_requis: 0,
  tarif_fournisseur_ht: null, validite_bon_mois: 3, statut: 'en_ligne',
};

const euros = (v: number | string | null) =>
  v === null || v === undefined || v === '' ? '—' : `${Number(v).toFixed(2)} €`;

interface Props {
  fournisseur: FournisseurRow | null;
  onClose: () => void;
}

export default function OffresModal({ fournisseur, onClose }: Props) {
  const { t } = usePrefs();
  const [offres, setOffres] = useState<OffreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Formulaire d'ajout / édition
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<OffreInput>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const open = !!fournisseur;
  // Option 1 : on autorise la saisie des offres avant signature (elles alimentent le
  // contrat). Elles ne seront visibles dans la boutique publique qu'après signature.
  const notSigned = !!fournisseur && !fournisseur.contrat_signe;

  const load = async () => {
    if (!fournisseur) return;
    setLoading(true);
    try {
      setOffres(await getOffres(fournisseur.id));
      setError('');
    } catch {
      setError(t('off.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (fournisseur) { setShowForm(false); setEditId(null); load(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fournisseur?.id]);

  const set = (k: keyof OffreInput, v: string | number | null) => setForm(f => ({ ...f, [k]: v }));
  const num = (v: string): number | null => (v.trim() === '' ? null : Number(v));

  const openCreate = () => { setEditId(null); setForm(emptyForm); setShowForm(true); setError(''); };
  const openEdit = (o: OffreRow) => {
    setEditId(o.id);
    setForm({
      nom: o.nom, description: o.description ?? '', stock: o.stock,
      pts_requis: o.pts_requis, tarif_fournisseur_ht: o.tarif_fournisseur_ht === null ? null : Number(o.tarif_fournisseur_ht),
      validite_bon_mois: o.validite_bon_mois, statut: o.statut,
    });
    setShowForm(true);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fournisseur) return;
    if (!form.nom.trim()) { setError(t('off.nomRequired')); return; }
    if (!form.pts_requis || form.pts_requis <= 0) { setError(t('off.ptsPositive')); return; }
    if (!form.validite_bon_mois || form.validite_bon_mois <= 0) { setError(t('off.validitePositive')); return; }
    setSubmitting(true);
    try {
      if (editId) await updateOffre(editId, form);
      else await createOffre(fournisseur.id, form);
      setShowForm(false);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || t('off.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (o: OffreRow) => {
    if (!confirm(`${t('off.confirmDelete1')} ${o.nom} ${t('off.confirmDelete2')}`)) return;
    setError('');
    try {
      await deleteOffre(o.id);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || t('off.deleteFailed'));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`${t('off.title')} ${fournisseur?.nom_societe ?? ''}`} maxWidth="max-w-3xl">
        <div className="space-y-4">
          {notSigned && (
            <div className="rounded-xl bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 p-3 text-sm text-orange-800 dark:text-orange-300">
              ⏳ <strong>{t('off.notSignedStrong1')}</strong> {t('off.notSignedMid')} <strong>{t('off.notSignedStrong2')}</strong> {t('off.notSignedEnd')}
            </div>
          )}
          {error && <p className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2">{error}</p>}

          {!showForm && (
            <div className="flex justify-end">
              <button onClick={openCreate} className="px-4 py-2 text-sm font-medium rounded-lg text-white hover:opacity-80" style={{ backgroundColor: '#C9A84C' }}>
                {t('off.add')}
              </button>
            </div>
          )}

          {showForm && (
            <form onSubmit={handleSubmit} className="space-y-4 border border-gray-100 dark:border-white/10 rounded-xl p-4 bg-gray-50 dark:bg-white/5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className={labelCls}>{t('off.nomOffre')}</label>
                  <input className={inputCls} value={form.nom} onChange={e => set('nom', e.target.value)} placeholder={t('off.nomPlaceholder')} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>{t('off.description')}</label>
                  <input className={inputCls} value={form.description ?? ''} onChange={e => set('description', e.target.value)} placeholder={t('off.descPlaceholder')} />
                </div>
                <div>
                  <label className={labelCls}>{t('off.ptsRequis')}</label>
                  <input type="number" min={1} className={inputCls} value={form.pts_requis || ''} onChange={e => set('pts_requis', Number(e.target.value))} />
                </div>
                <div>
                  <label className={labelCls}>{t('off.validite')}</label>
                  <input type="number" min={1} className={inputCls} value={form.validite_bon_mois || ''} onChange={e => set('validite_bon_mois', Number(e.target.value))} />
                </div>
                <div>
                  <label className={labelCls}>{t('off.tarifHT')} <span className="text-gray-400">{t('off.confidentiel')}</span></label>
                  <input type="number" min={0} step="0.01" className={inputCls} value={form.tarif_fournisseur_ht ?? ''} onChange={e => set('tarif_fournisseur_ht', num(e.target.value))} placeholder="18.50" />
                </div>
                <div>
                  <label className={labelCls}>{t('off.stock')} <span className="text-gray-400">{t('off.stockVide')}</span></label>
                  <input type="number" min={0} className={inputCls} value={form.stock ?? ''} onChange={e => set('stock', num(e.target.value))} placeholder={t('off.illimite')} />
                </div>
                <div>
                  <label className={labelCls}>{t('off.statut')}</label>
                  <select className={inputCls} value={form.statut} onChange={e => set('statut', e.target.value as OffreInput['statut'])}>
                    <option value="en_ligne">{t('off.enLigne')}</option>
                    <option value="hors_ligne">{t('off.horsLigne')}</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5">{t('common.cancel')}</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium rounded-lg text-white hover:opacity-80 disabled:opacity-50" style={{ backgroundColor: '#C9A84C' }}>
                  {submitting ? t('common.saving') : editId ? t('common.save') : t('off.creer')}
                </button>
              </div>
            </form>
          )}

          <div className="bg-white dark:bg-[#161624] rounded-xl border border-gray-100 dark:border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/10">
                  {[t('off.colOffre'), t('off.colPoints'), t('off.colTarifHT'), t('off.colStock'), t('off.colValidite'), t('common.status'), ''].map((h, idx) => (
                    <th key={idx} className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-3 py-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="text-center text-gray-400 py-10">{t('common.loading')}</td></tr>
                ) : offres.length === 0 ? (
                  <tr><td colSpan={7} className="text-center text-gray-400 py-10">{t('off.empty')}</td></tr>
                ) : offres.map(o => (
                  <tr key={o.id} className="border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5">
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{o.nom}</div>
                      <div className="text-xs text-gray-400 font-mono">{o.reference}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-200">{o.pts_requis} {t('common.points')}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-200">{euros(o.tarif_fournisseur_ht)}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-200">{o.stock === null ? '∞' : o.stock}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-200">{o.validite_bon_mois} {t('off.mois')}</td>
                    <td className="px-3 py-2">
                      <Badge label={o.statut === 'en_ligne' ? t('off.enLigne') : t('off.horsLigne')} variant={o.statut === 'en_ligne' ? 'success' : 'gray'} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => openEdit(o)} className="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5">{t('off.editer')}</button>
                        <button onClick={() => handleDelete(o)} className="px-2.5 py-1 text-xs font-medium rounded-lg border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10">{t('off.suppr')}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
    </Modal>
  );
}
