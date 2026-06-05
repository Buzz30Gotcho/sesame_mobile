import { useEffect, useState, useCallback } from 'react';
import { getParametres, updateParametre } from '../api';
import type { Parametre } from '../api';
import Spinner from '../components/Spinner';

type SousSection = 'courses' | 'tarifs' | 'commissions' | 'parrainage' | 'facturation' | 'equipe';

const SOUS_SECTIONS: { key: SousSection; label: string; icon: string }[] = [
  { key: 'courses', label: 'Mode des courses', icon: '🚗' },
  { key: 'tarifs', label: 'Tarifs véhicules', icon: '💰' },
  { key: 'commissions', label: 'Taux de commission', icon: '📊' },
  { key: 'parrainage', label: 'Parrainage', icon: '🤝' },
  { key: 'facturation', label: 'Facturation', icon: '🧾' },
  { key: 'equipe', label: 'Équipe admin', icon: '👥' },
];

const PALIERS_PARRAINAGE = [
  { palier: 1, label: 'Bronze', points_min: 0, points_max: 999, taux: '5%' },
  { palier: 2, label: 'Argent', points_min: 1000, points_max: 4999, taux: '7%' },
  { palier: 3, label: 'Or', points_min: 5000, points_max: 9999, taux: '10%' },
  { palier: 4, label: 'Platine', points_min: 10000, points_max: null, taux: '12%' },
];

function getParam(params: Parametre[], cle: string): string {
  return params.find(p => p.cle === cle)?.valeur ?? '';
}

export default function Parametres() {
  const [params, setParams] = useState<Parametre[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [active, setActive] = useState<SousSection>('courses');
  const [toast, setToast] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [saving, setSaving] = useState(false);

  // Local edit state
  const [edits, setEdits] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getParametres();
      setParams(data);
    } catch {
      setError('Impossible de charger les paramètres.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast(msg);
    setToastType(type);
    setTimeout(() => setToast(''), 3500);
  };

  const getValue = (cle: string): string => {
    return edits[cle] !== undefined ? edits[cle] : getParam(params, cle);
  };

  const setValue = (cle: string, val: string) => {
    setEdits(prev => ({ ...prev, [cle]: val }));
  };

  const saveParam = async (cle: string) => {
    const val = getValue(cle);
    setSaving(true);
    try {
      await updateParametre(cle, val);
      showToast(`Paramètre "${cle}" sauvegardé`);
      const updated = { ...edits };
      delete updated[cle];
      setEdits(updated);
      load();
    } catch {
      showToast('Erreur lors de la sauvegarde', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveMultiple = async (cles: string[]) => {
    setSaving(true);
    try {
      await Promise.all(cles.map(cle => updateParametre(cle, getValue(cle))));
      showToast('Paramètres sauvegardés');
      const updated = { ...edits };
      cles.forEach(c => delete updated[c]);
      setEdits(updated);
      load();
    } catch {
      showToast('Erreur lors de la sauvegarde', 'error');
    } finally {
      setSaving(false);
    }
  };

  const FieldRow = ({ cle, label, type = 'text', placeholder = '', suffix = '' }: {
    cle: string; label: string; type?: string; placeholder?: string; suffix?: string;
  }) => (
    <div className="flex items-center justify-between py-3 border-b border-gray-100">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type={type}
          value={getValue(cle)}
          onChange={e => setValue(cle, e.target.value)}
          placeholder={placeholder}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-yellow-400 w-36"
        />
        {suffix && <span className="text-sm text-gray-500">{suffix}</span>}
        {edits[cle] !== undefined && (
          <button
            onClick={() => saveParam(cle)}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-medium rounded-lg text-white transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ backgroundColor: '#4CAF82' }}
          >
            ✓
          </button>
        )}
      </div>
    </div>
  );

  if (loading) return <Spinner size="lg" />;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Paramètres</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{error}</div>
      )}

      {toast && (
        <div
          className="fixed bottom-6 right-6 px-5 py-3 rounded-xl shadow-lg z-50 text-sm text-white"
          style={{ backgroundColor: toastType === 'success' ? '#4CAF82' : '#FF6464' }}
        >
          {toast}
        </div>
      )}

      <div className="flex gap-6">
        {/* Sidebar sous-sections */}
        <div className="w-52 shrink-0">
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {SOUS_SECTIONS.map(s => (
              <button
                key={s.key}
                onClick={() => setActive(s.key)}
                className={`w-full text-left px-4 py-3 text-sm flex items-center gap-3 border-b border-gray-50 transition-colors ${
                  active === s.key ? 'font-semibold' : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={active === s.key ? { backgroundColor: '#FFF8EC', color: '#C9A84C', borderRight: '3px solid #C9A84C' } : {}}
              >
                <span>{s.icon}</span>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Contenu */}
        <div className="flex-1">

          {/* Mode des courses */}
          {active === 'courses' && (
            <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
              <h3 className="text-base font-semibold text-gray-800">Mode des courses</h3>

              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-700">
                ⚠️ <strong>Alerte :</strong> Activez le mode immédiat uniquement si le parc de chauffeurs est suffisant.
              </div>

              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <div>
                  <p className="text-sm font-medium text-gray-700">Mode de la course</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {getValue('mode_course_immediate') === 'true'
                      ? '✅ Deux modes actifs (immédiate + réservation)'
                      : '📅 Mode réservation uniquement'}
                  </p>
                </div>
                <button
                  disabled={saving}
                  onClick={async () => {
                    const isOn = getValue('mode_course_immediate') === 'true';
                    const newVal = isOn ? 'false' : 'true';
                    setValue('mode_course_immediate', newVal);
                    setSaving(true);
                    try {
                      await updateParametre('mode_course_immediate', newVal);
                      showToast(newVal === 'true' ? '✅ Mode immédiat activé' : '📅 Mode réservation uniquement');
                      load();
                    } catch {
                      showToast('Erreur lors de la sauvegarde', 'error');
                      setValue('mode_course_immediate', isOn ? 'true' : 'false');
                    } finally {
                      setSaving(false);
                    }
                  }}
                  className="relative inline-flex h-7 w-14 items-center rounded-full transition-colors disabled:opacity-50"
                  style={{
                    backgroundColor: getValue('mode_course_immediate') === 'true' ? '#C9A84C' : '#D1D5DB'
                  }}
                >
                  <span
                    className="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200"
                    style={{
                      transform: getValue('mode_course_immediate') === 'true'
                        ? 'translateX(32px)'
                        : 'translateX(4px)'
                    }}
                  />
                </button>
              </div>

              <FieldRow
                cle="delai_minimum_reservation_heures"
                label="Délai minimum réservation"
                type="number"
                placeholder="2"
                suffix="heures"
              />
            </div>
          )}

          {/* Tarifs véhicules */}
          {active === 'tarifs' && (
            <div className="bg-white rounded-xl shadow-sm p-6 space-y-6">
              <h3 className="text-base font-semibold text-gray-800">Tarifs véhicules</h3>

              {/* Berline */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <span>🚙</span> Berline
                </h4>
                <div className="space-y-1">
                  <FieldRow cle="berline_forfait" label="Forfait de base" type="number" suffix="€" />
                  <FieldRow cle="berline_seuil_km" label="Seuil kilométrique" type="number" suffix="km" />
                  <FieldRow cle="berline_prix_km" label="Prix par km supplémentaire" type="number" suffix="€/km" />
                </div>
              </div>

              {/* Van */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <span>🚐</span> Van
                </h4>
                <div className="space-y-1">
                  <FieldRow cle="van_forfait" label="Forfait de base" type="number" suffix="€" />
                  <FieldRow cle="van_seuil_km" label="Seuil kilométrique" type="number" suffix="km" />
                  <FieldRow cle="van_prix_km" label="Prix par km supplémentaire" type="number" suffix="€/km" />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => saveMultiple([
                    'berline_forfait', 'berline_seuil_km', 'berline_prix_km',
                    'van_forfait', 'van_seuil_km', 'van_prix_km'
                  ])}
                  disabled={saving}
                  className="px-5 py-2 text-sm font-medium rounded-xl text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{ backgroundColor: '#4CAF82' }}
                >
                  {saving ? 'Sauvegarde…' : 'Sauvegarder les tarifs'}
                </button>
              </div>
            </div>
          )}

          {/* Taux de commission */}
          {active === 'commissions' && (
            <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
              <h3 className="text-base font-semibold text-gray-800">Taux de commission SESAME</h3>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-700">
                ℹ️ Modifiable à tout moment. Aucune limite minimale ou maximale imposée.
              </div>

              <FieldRow
                cle="taux_commission_global"
                label="Taux global SESAME"
                type="number"
                placeholder="20"
                suffix="%"
              />

              <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500">
                <p className="font-medium text-gray-700 mb-1">Explication</p>
                SESAME prélève ce pourcentage sur chaque course terminée.
                Le reste est reversé au chauffeur selon son taux individuel.
              </div>
            </div>
          )}

          {/* Parrainage */}
          {active === 'parrainage' && (
            <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
              <div className="flex items-start justify-between">
                <h3 className="text-base font-semibold text-gray-800">Paliers de parrainage</h3>
                <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-1">Affichage seul</span>
              </div>

              <p className="text-sm text-gray-500">
                Les paliers ci-dessous sont définis dans la configuration du système.
                Leur modification nécessite une mise à jour du backend.
              </p>

              <div className="space-y-3">
                {PALIERS_PARRAINAGE.map(p => (
                  <div
                    key={p.palier}
                    className="flex items-center justify-between p-4 rounded-xl border border-gray-100"
                    style={{
                      backgroundColor: p.label === 'Or' ? '#FFF8EC' : p.label === 'Platine' ? '#F0F7FF' : 'white'
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        {p.label === 'Bronze' ? '🥉' : p.label === 'Argent' ? '🥈' : p.label === 'Or' ? '🥇' : '💎'}
                      </span>
                      <div>
                        <p className="font-semibold text-gray-900">Palier {p.palier} — {p.label}</p>
                        <p className="text-xs text-gray-500">
                          {p.points_min} pts
                          {p.points_max ? ` → ${p.points_max} pts` : ' et plus'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold" style={{ color: '#C9A84C' }}>{p.taux}</p>
                      <p className="text-xs text-gray-400">de commission</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Facturation */}
          {active === 'facturation' && (
            <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
              <h3 className="text-base font-semibold text-gray-800">Facturation</h3>
              <FieldRow
                cle="indemnisation_chauffeur_defaut"
                label="Indemnisation chauffeur par défaut"
                type="number"
                placeholder="5"
                suffix="€"
              />
              <FieldRow
                cle="commission_ambassadeur_moral_pct"
                label="Commission ambassadeur moral"
                type="number"
                placeholder="10"
                suffix="%"
              />
              <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500">
                L'indemnisation est versée au chauffeur en cas d'absence du client ou d'annulation tardive.
              </div>
            </div>
          )}

          {/* Équipe admin */}
          {active === 'equipe' && (
            <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
              <h3 className="text-base font-semibold text-gray-800">Équipe administration</h3>
              <div
                className="flex items-center gap-4 p-4 rounded-xl"
                style={{ backgroundColor: '#FFF8EC', border: '2px solid #C9A84C' }}
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold text-white shrink-0"
                  style={{ backgroundColor: '#C9A84C' }}
                >
                  NA
                </div>
                <div>
                  <p className="font-bold text-gray-900">NAJAH Abdallah</p>
                  <p className="text-sm text-gray-600">Fondateur & Concepteur</p>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: '#C9A84C' }}>
                      Super Admin
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-400 text-center">
                Pour ajouter des membres à l'équipe, contactez l'administrateur technique.
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
