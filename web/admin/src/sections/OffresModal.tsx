import { useEffect, useState } from 'react';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import {
  getOffres, createOffre, updateOffre, deleteOffre,
  type OffreRow, type OffreInput, type FournisseurRow,
} from '../api';

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400';
const labelCls = 'block text-xs font-medium text-gray-600 mb-1';

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
      setError('Impossible de charger les offres.');
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
    if (!form.nom.trim()) { setError("Le nom de l'offre est obligatoire."); return; }
    if (!form.pts_requis || form.pts_requis <= 0) { setError('Les points requis doivent être positifs.'); return; }
    if (!form.validite_bon_mois || form.validite_bon_mois <= 0) { setError('La validité (mois) doit être positive.'); return; }
    setSubmitting(true);
    try {
      if (editId) await updateOffre(editId, form);
      else await createOffre(fournisseur.id, form);
      setShowForm(false);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Échec de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (o: OffreRow) => {
    if (!confirm(`Supprimer l'offre « ${o.nom} » ?`)) return;
    setError('');
    try {
      await deleteOffre(o.id);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Suppression impossible.');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Boutique — ${fournisseur?.nom_societe ?? ''}`} maxWidth="max-w-3xl">
        <div className="space-y-4">
          {notSigned && (
            <div className="rounded-xl bg-orange-50 border border-orange-200 p-3 text-sm text-orange-800">
              ⏳ <strong>Contrat non signé.</strong> Vous pouvez préparer les offres : elles figureront dans le contrat envoyé à la signature, mais resteront <strong>invisibles dans la boutique</strong> tant que le contrat n'est pas signé.
            </div>
          )}
          {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          {!showForm && (
            <div className="flex justify-end">
              <button onClick={openCreate} className="px-4 py-2 text-sm font-medium rounded-lg text-white hover:opacity-80" style={{ backgroundColor: '#C9A84C' }}>
                + Ajouter une offre
              </button>
            </div>
          )}

          {showForm && (
            <form onSubmit={handleSubmit} className="space-y-4 border border-gray-100 rounded-xl p-4 bg-gray-50">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Nom de l'offre *</label>
                  <input className={inputCls} value={form.nom} onChange={e => set('nom', e.target.value)} placeholder="Karting 30 min" />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Description</label>
                  <input className={inputCls} value={form.description ?? ''} onChange={e => set('description', e.target.value)} placeholder="Session de 30 minutes, casque fourni" />
                </div>
                <div>
                  <label className={labelCls}>Points requis *</label>
                  <input type="number" min={1} className={inputCls} value={form.pts_requis || ''} onChange={e => set('pts_requis', Number(e.target.value))} />
                </div>
                <div>
                  <label className={labelCls}>Validité du bon (mois) *</label>
                  <input type="number" min={1} className={inputCls} value={form.validite_bon_mois || ''} onChange={e => set('validite_bon_mois', Number(e.target.value))} />
                </div>
                <div>
                  <label className={labelCls}>Tarif fournisseur HT <span className="text-gray-400">(confidentiel)</span></label>
                  <input type="number" min={0} step="0.01" className={inputCls} value={form.tarif_fournisseur_ht ?? ''} onChange={e => set('tarif_fournisseur_ht', num(e.target.value))} placeholder="18.50" />
                </div>
                <div>
                  <label className={labelCls}>Stock <span className="text-gray-400">(vide = illimité)</span></label>
                  <input type="number" min={0} className={inputCls} value={form.stock ?? ''} onChange={e => set('stock', num(e.target.value))} placeholder="Illimité" />
                </div>
                <div>
                  <label className={labelCls}>Statut</label>
                  <select className={inputCls} value={form.statut} onChange={e => set('statut', e.target.value as OffreInput['statut'])}>
                    <option value="en_ligne">En ligne</option>
                    <option value="hors_ligne">Hors ligne</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100">Annuler</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium rounded-lg text-white hover:opacity-80 disabled:opacity-50" style={{ backgroundColor: '#C9A84C' }}>
                  {submitting ? 'Enregistrement…' : editId ? 'Enregistrer' : 'Créer l\'offre'}
                </button>
              </div>
            </form>
          )}

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Offre', 'Points', 'Tarif HT', 'Stock', 'Validité', 'Statut', ''].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="text-center text-gray-400 py-10">Chargement…</td></tr>
                ) : offres.length === 0 ? (
                  <tr><td colSpan={7} className="text-center text-gray-400 py-10">Aucune offre. Ajoutez-en une.</td></tr>
                ) : offres.map(o => (
                  <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">{o.nom}</div>
                      <div className="text-xs text-gray-400 font-mono">{o.reference}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{o.pts_requis} pts</td>
                    <td className="px-3 py-2 text-gray-700">{euros(o.tarif_fournisseur_ht)}</td>
                    <td className="px-3 py-2 text-gray-700">{o.stock === null ? '∞' : o.stock}</td>
                    <td className="px-3 py-2 text-gray-700">{o.validite_bon_mois} mois</td>
                    <td className="px-3 py-2">
                      <Badge label={o.statut === 'en_ligne' ? 'En ligne' : 'Hors ligne'} variant={o.statut === 'en_ligne' ? 'success' : 'gray'} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => openEdit(o)} className="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100">Éditer</button>
                        <button onClick={() => handleDelete(o)} className="px-2.5 py-1 text-xs font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50">Suppr.</button>
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
