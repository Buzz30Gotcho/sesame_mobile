import { useEffect, useState, useCallback } from 'react';
import { getBlacklist, addBlacklist, deleteBlacklist } from '../api';
import type { BlacklistEntry } from '../api';
import Badge from '../components/Badge';
import Spinner from '../components/Spinner';

const emptyForm: BlacklistEntry = {
  nom: '',
  prenom: '',
  date_naissance: '',
  lieu_naissance: '',
  telephone: '',
  motif: '',
  type_utilisateur: 'ambassadeur',
};

export default function Blacklist() {
  const [list, setList] = useState<BlacklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState<BlacklistEntry>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState('');
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getBlacklist();
      setList(data);
    } catch {
      setError('Impossible de charger la liste noire.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: number) => {
    if (!confirm('Retirer cette personne de la liste noire ?')) return;
    try {
      await deleteBlacklist(id);
      showToast('Entrée supprimée.');
      load();
    } catch {
      showToast('Erreur lors de la suppression.');
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const required: (keyof BlacklistEntry)[] = ['nom', 'prenom', 'date_naissance', 'telephone', 'motif'];
    for (const field of required) {
      if (!form[field]?.toString().trim()) {
        setFormError(`Le champ "${field.replace('_', ' ')}" est obligatoire.`);
        return;
      }
    }
    setSubmitting(true);
    try {
      await addBlacklist(form);
      showToast('Personne ajoutée à la liste noire');
      setForm(emptyForm);
      load();
    } catch {
      showToast('Erreur lors de l\'ajout');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Gestion de la Liste Noire</h2>

      {/* Bannière alerte */}
      <div className="bg-red-50 border border-red-300 rounded-xl p-4 flex items-start gap-3">
        <span className="text-xl shrink-0">🔕</span>
        <div>
          <p className="text-sm font-bold text-red-800">Blocage silencieux</p>
          <p className="text-sm text-red-700 mt-0.5">
            Ne jamais mentionner la liste noire à l'utilisateur. Le blocage doit être transparent et sans explication de motif.
          </p>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-lg z-50 text-sm">
          {toast}
        </div>
      )}

      {/* Formulaire d'ajout */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-base font-semibold text-gray-800 mb-4">Ajouter une personne</h3>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nom *</label>
              <input
                type="text"
                name="nom"
                value={form.nom}
                onChange={handleChange}
                placeholder="Nom de famille"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Prénom *</label>
              <input
                type="text"
                name="prenom"
                value={form.prenom}
                onChange={handleChange}
                placeholder="Prénom"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date de naissance * (AAAA-MM-JJ)</label>
              <input
                type="date"
                name="date_naissance"
                value={form.date_naissance}
                onChange={handleChange}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Lieu de naissance</label>
              <input
                type="text"
                name="lieu_naissance"
                value={form.lieu_naissance}
                onChange={handleChange}
                placeholder="Ville, Pays"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Téléphone *</label>
              <input
                type="tel"
                name="telephone"
                value={form.telephone}
                onChange={handleChange}
                placeholder="+33 6 00 00 00 00"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type *</label>
              <select
                name="type_utilisateur"
                value={form.type_utilisateur}
                onChange={handleChange}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400"
              >
                <option value="ambassadeur">Ambassadeur</option>
                <option value="chauffeur">Chauffeur</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Motif *</label>
              <textarea
                name="motif"
                value={form.motif}
                onChange={handleChange}
                placeholder="Motif de blocage (usage interne uniquement)"
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400 resize-none"
              />
            </div>
          </div>

          {formError && (
            <p className="text-red-600 text-sm mt-3">{formError}</p>
          )}

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 text-sm font-medium rounded-xl text-white transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: '#FF6464' }}
            >
              {submitting ? 'Ajout en cours…' : 'Ajouter à la liste noire'}
            </button>
          </div>
        </form>
      </div>

      {/* Liste */}
      <div>
        <h3 className="text-base font-semibold text-gray-800 mb-3">
          Personnes bloquées ({list.length})
        </h3>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm mb-3">{error}</div>}
        {loading ? (
          <Spinner />
        ) : list.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-400">
            <p className="text-3xl mb-2">🔒</p>
            <p>Aucune personne dans la liste noire</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Nom Prénom', 'Date naissance', 'Lieu naissance', 'Téléphone', 'Type', 'Motif', 'Ajouté le', ''].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map((entry, i) => (
                    <tr key={entry.id ?? i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {entry.nom.toUpperCase()} {entry.prenom}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{entry.date_naissance}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{entry.lieu_naissance}</td>
                      <td className="px-4 py-3 text-gray-600">{entry.telephone}</td>
                      <td className="px-4 py-3">
                        <Badge
                          label={entry.type_utilisateur}
                          variant={entry.type_utilisateur === 'chauffeur' ? 'info' : 'or'}
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate">{entry.motif}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {entry.created_at ? new Date(entry.created_at).toLocaleDateString('fr-FR') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDelete(entry.id!)}
                          className="text-red-400 hover:text-red-600 transition-colors text-lg"
                          title="Supprimer"
                        >🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
