import { useEffect, useState, useCallback } from 'react';
import {
  getParametres, updateParametre, get2faStatus, setup2fa, activate2fa, disable2fa,
  getAdmins, createAdmin, updateAdmin, deleteAdmin, getAdminRole,
} from '../api';
import type { Parametre, AdminAccount, AdminRole } from '../api';
import Spinner from '../components/Spinner';
import { usePrefs } from '../prefs';

type SousSection = 'informations' | 'courses' | 'tarifs' | 'commissions' | 'parrainage' | 'facturation' | 'notifications' | 'securite' | 'equipe' | 'localisation';

const DEVISES = ['EUR', 'CHF', 'USD', 'GBP'];
const FUSEAUX = ['Europe/Paris', 'Europe/Brussels', 'Europe/Zurich', 'Europe/Luxembourg', 'UTC'];

function getParam(params: Parametre[], cle: string): string {
  return params.find(p => p.cle === cle)?.valeur ?? '';
}

export default function Parametres() {
  const { t } = usePrefs();
  const [params, setParams] = useState<Parametre[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [active, setActive] = useState<SousSection>('courses');
  const [toast, setToast] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [saving, setSaving] = useState(false);

  // Local edit state
  const [edits, setEdits] = useState<Record<string, string>>({});

  // 2FA (specs §5.4)
  const [twofa, setTwofa] = useState<boolean | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [twofaCode, setTwofaCode] = useState('');
  const [twofaBusy, setTwofaBusy] = useState(false);

  const roleLabel = (r: AdminRole | string) => t(`par.role.${r}`);

  const SOUS_SECTIONS: { key: SousSection; tkey: string; icon: string }[] = [
    { key: 'informations', tkey: 'par.sec.informations', icon: 'ℹ️' },
    { key: 'courses', tkey: 'par.sec.courses', icon: '🚗' },
    { key: 'tarifs', tkey: 'par.sec.tarifs', icon: '💰' },
    { key: 'commissions', tkey: 'par.sec.commissions', icon: '📊' },
    { key: 'parrainage', tkey: 'par.sec.parrainage', icon: '🤝' },
    { key: 'facturation', tkey: 'par.sec.facturation', icon: '🧾' },
    { key: 'notifications', tkey: 'par.sec.notifications', icon: '🔔' },
    { key: 'securite', tkey: 'par.sec.securite', icon: '🔒' },
    { key: 'localisation', tkey: 'par.sec.localisation', icon: '🌍' },
    { key: 'equipe', tkey: 'par.sec.equipe', icon: '👥' },
  ];

  // Parrainage — 4 paliers cumulatifs (specs §1.4).
  const PALIERS_PARRAINAGE = [
    { palier: 1, cond: t('par.palier1.cond'), detail: t('par.palier1.detail'), bonus: '+5 pts' },
    { palier: 2, cond: t('par.palier2.cond'), detail: t('par.palier2.detail'), bonus: '+10 pts' },
    { palier: 3, cond: t('par.palier3.cond'), detail: t('par.palier3.detail'), bonus: '+15 pts' },
    { palier: 4, cond: t('par.palier4.cond'), detail: t('par.palier4.detail'), bonus: '+20 pts' },
  ];

  const loadTwofa = useCallback(async () => {
    try { setTwofa((await get2faStatus()).enabled); } catch { setTwofa(null); }
  }, []);
  useEffect(() => { loadTwofa(); }, [loadTwofa]);

  const handleSetup2fa = async () => {
    setTwofaBusy(true);
    try { setQr((await setup2fa()).qr); setTwofaCode(''); }
    catch { showToast(t('par.qrError'), 'error'); }
    finally { setTwofaBusy(false); }
  };
  const handleActivate2fa = async () => {
    setTwofaBusy(true);
    try {
      await activate2fa(twofaCode);
      showToast(t('par.twofaActivated'));
      setQr(null); setTwofaCode(''); loadTwofa();
    } catch (e: any) {
      showToast(e?.response?.data?.error || t('par.codeIncorrect'), 'error');
    } finally { setTwofaBusy(false); }
  };
  const handleDisable2fa = async () => {
    setTwofaBusy(true);
    try {
      await disable2fa(twofaCode);
      showToast(t('par.twofaDeactivated'));
      setTwofaCode(''); loadTwofa();
    } catch (e: any) {
      showToast(e?.response?.data?.error || t('par.codeRequired'), 'error');
    } finally { setTwofaBusy(false); }
  };

  // Comptes admin & rôles (specs §5.4) — visible/éditable par le Super admin uniquement.
  const myRole = getAdminRole();
  const isSuper = myRole === 'super_admin';
  const [fondateur, setFondateur] = useState<string | null>(null);
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [adminForm, setAdminForm] = useState<{ email: string; nom: string; password: string; role: AdminRole }>({ email: '', nom: '', password: '', role: 'operateur' });
  const [adminBusy, setAdminBusy] = useState(false);

  const loadAdmins = useCallback(async () => {
    if (!isSuper) return;
    try { const d = await getAdmins(); setFondateur(d.fondateur); setAdmins(d.comptes); } catch { /* non-super → ignoré */ }
  }, [isSuper]);
  useEffect(() => { if (active === 'equipe') loadAdmins(); }, [active, loadAdmins]);

  const handleCreateAdmin = async () => {
    if (!adminForm.email || adminForm.password.length < 8) { showToast(t('par.emailPwdRequired'), 'error'); return; }
    setAdminBusy(true);
    try {
      await createAdmin(adminForm);
      showToast(t('par.compteCreated'));
      setAdminForm({ email: '', nom: '', password: '', role: 'operateur' });
      loadAdmins();
    } catch (e: any) { showToast(e?.response?.data?.error || t('par.error'), 'error'); }
    finally { setAdminBusy(false); }
  };
  const handleUpdateAdmin = async (id: string, payload: { role?: AdminRole; actif?: boolean }) => {
    try { await updateAdmin(id, payload); loadAdmins(); } catch { showToast(t('par.error'), 'error'); }
  };
  const handleDeleteAdmin = async (a: AdminAccount) => {
    if (!confirm(`${t('par.confirmDeleteAdmin1')} ${a.email} ${t('par.confirmDeleteAdmin2')}`)) return;
    try { await deleteAdmin(a.id); showToast(t('par.compteDeleted')); loadAdmins(); } catch { showToast(t('par.error'), 'error'); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getParametres();
      setParams(data);
    } catch {
      setError(t('par.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
      showToast(`${t('par.savedPre')} "${cle}" ${t('par.savedPost')}`);
      const updated = { ...edits };
      delete updated[cle];
      setEdits(updated);
      load();
    } catch {
      showToast(t('par.saveError'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveMultiple = async (cles: string[]) => {
    setSaving(true);
    try {
      await Promise.all(cles.map(cle => updateParametre(cle, getValue(cle))));
      showToast(t('par.saved'));
      const updated = { ...edits };
      cles.forEach(c => delete updated[c]);
      setEdits(updated);
      load();
    } catch {
      showToast(t('par.saveError'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const FieldRow = ({ cle, label, type = 'text', placeholder = '', suffix = '' }: {
    cle: string; label: string; type?: string; placeholder?: string; suffix?: string;
  }) => (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-white/10">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type={type}
          value={getValue(cle)}
          onChange={e => setValue(cle, e.target.value)}
          placeholder={placeholder}
          className="border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-yellow-400 w-36"
        />
        {suffix && <span className="text-sm text-gray-500 dark:text-gray-400">{suffix}</span>}
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

  // Interrupteur booléen ('true'/'false') sauvegardé immédiatement au clic.
  const ToggleRow = ({ cle, label, desc }: { cle: string; label: string; desc?: string }) => {
    const on = getValue(cle) === 'true';
    return (
      <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-white/10">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</p>
          {desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
        </div>
        <button
          disabled={saving}
          onClick={async () => {
            const next = on ? 'false' : 'true';
            setValue(cle, next);
            setSaving(true);
            try {
              await updateParametre(cle, next);
              showToast(`${label} ${next === 'true' ? t('par.toggleOn') : t('par.toggleOff')}`);
              load();
            } catch {
              showToast(t('par.saveError'), 'error');
              setValue(cle, on ? 'true' : 'false');
            } finally {
              setSaving(false);
            }
          }}
          className="relative inline-flex h-7 w-14 items-center rounded-full transition-colors disabled:opacity-50 shrink-0"
          style={{ backgroundColor: on ? '#C9A84C' : '#D1D5DB' }}
        >
          <span
            className="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200"
            style={{ transform: on ? 'translateX(32px)' : 'translateX(4px)' }}
          />
        </button>
      </div>
    );
  };

  const card = 'bg-white dark:bg-[#161624] rounded-xl shadow-sm p-6';
  const h3 = 'text-base font-semibold text-gray-800 dark:text-gray-100';
  const h4 = 'text-sm font-semibold text-gray-700 dark:text-gray-200';
  const selectCls = 'border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-yellow-400 w-48';

  if (loading) return <Spinner size="lg" />;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('par.title')}</h2>

      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-xl p-4 text-sm">{error}</div>
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
          <div className="bg-white dark:bg-[#161624] rounded-xl shadow-sm overflow-hidden">
            {SOUS_SECTIONS.map(s => (
              <button
                key={s.key}
                onClick={() => setActive(s.key)}
                className={`w-full text-left px-4 py-3 text-sm flex items-center gap-3 border-b border-gray-50 dark:border-white/5 transition-colors ${
                  active === s.key ? 'font-semibold' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5'
                }`}
                style={active === s.key ? { backgroundColor: 'rgba(201,168,76,0.12)', color: '#C9A84C', borderRight: '3px solid #C9A84C' } : {}}
              >
                <span>{s.icon}</span>
                {t(s.tkey)}
              </button>
            ))}
          </div>
        </div>

        {/* Contenu */}
        <div className="flex-1">

          {/* Informations */}
          {active === 'informations' && (
            <div className={`${card} space-y-4`}>
              <h3 className={h3}>{t('par.infoTitle')}</h3>
              <FieldRow cle="plateforme_nom" label={t('par.platformName')} placeholder="SESAME" />
              <FieldRow cle="contact_email" label={t('par.contactEmail')} type="email" placeholder="contact@sesame-pro.com" />
              <FieldRow cle="contact_telephone" label={t('par.contactPhone')} placeholder="07 45 20 70 06" />

              <div className="pt-2">
                <h4 className={`${h4} mb-1`}>{t('par.maintenance')}</h4>
                <ToggleRow cle="maintenance_active" label={t('par.maintenanceMode')} desc={t('par.maintenanceModeDesc')} />
                <div className="py-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">{t('par.maintenanceMsg')}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={getValue('maintenance_message')}
                      onChange={e => setValue('maintenance_message', e.target.value)}
                      placeholder={t('par.maintenanceMsgPlaceholder')}
                      className="flex-1 border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-yellow-400"
                    />
                    {edits['maintenance_message'] !== undefined && (
                      <button onClick={() => saveParam('maintenance_message')} disabled={saving}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg text-white disabled:opacity-50" style={{ backgroundColor: '#4CAF82' }}>✓</button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Mode des courses */}
          {active === 'courses' && (
            <div className={`${card} space-y-4`}>
              <h3 className={h3}>{t('par.coursesTitle')}</h3>

              <div className="bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 rounded-xl p-3 text-sm text-orange-700 dark:text-orange-300">
                ⚠️ <strong>{t('par.coursesAlertStrong')}</strong> {t('par.coursesAlertRest')}
              </div>

              <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-white/10">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('par.coursesMode')}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {getValue('mode_course_immediate') === 'true' ? t('par.coursesBoth') : t('par.coursesResaOnly')}
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
                      showToast(newVal === 'true' ? t('par.coursesImmActivated') : t('par.coursesResaOnly'));
                      load();
                    } catch {
                      showToast(t('par.saveError'), 'error');
                      setValue('mode_course_immediate', isOn ? 'true' : 'false');
                    } finally {
                      setSaving(false);
                    }
                  }}
                  className="relative inline-flex h-7 w-14 items-center rounded-full transition-colors disabled:opacity-50"
                  style={{ backgroundColor: getValue('mode_course_immediate') === 'true' ? '#C9A84C' : '#D1D5DB' }}
                >
                  <span
                    className="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200"
                    style={{ transform: getValue('mode_course_immediate') === 'true' ? 'translateX(32px)' : 'translateX(4px)' }}
                  />
                </button>
              </div>

              <FieldRow cle="delai_minimum_reservation_heures" label={t('par.delaiResa')} type="number" placeholder="2" suffix={t('par.heures')} />
            </div>
          )}

          {/* Tarifs véhicules */}
          {active === 'tarifs' && (
            <div className={`${card} space-y-6`}>
              <h3 className={h3}>{t('par.tarifsTitle')}</h3>

              <div>
                <h4 className={`${h4} mb-3 flex items-center gap-2`}><span>🚙</span> {t('par.berline')}</h4>
                <div className="space-y-1">
                  <FieldRow cle="berline_forfait" label={t('par.forfaitBase')} type="number" suffix="€" />
                  <FieldRow cle="berline_seuil_km" label={t('par.seuilKm')} type="number" suffix="km" />
                  <FieldRow cle="berline_prix_km" label={t('par.prixKm')} type="number" suffix="€/km" />
                </div>
              </div>

              <div>
                <h4 className={`${h4} mb-3 flex items-center gap-2`}><span>🚐</span> {t('par.van')}</h4>
                <div className="space-y-1">
                  <FieldRow cle="van_forfait" label={t('par.forfaitBase')} type="number" suffix="€" />
                  <FieldRow cle="van_seuil_km" label={t('par.seuilKm')} type="number" suffix="km" />
                  <FieldRow cle="van_prix_km" label={t('par.prixKm')} type="number" suffix="€/km" />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => saveMultiple(['berline_forfait', 'berline_seuil_km', 'berline_prix_km', 'van_forfait', 'van_seuil_km', 'van_prix_km'])}
                  disabled={saving}
                  className="px-5 py-2 text-sm font-medium rounded-xl text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{ backgroundColor: '#4CAF82' }}
                >
                  {saving ? t('par.saving') : t('par.saveTarifs')}
                </button>
              </div>
            </div>
          )}

          {/* Taux de commission */}
          {active === 'commissions' && (
            <div className={`${card} space-y-4`}>
              <h3 className={h3}>{t('par.commTitle')}</h3>
              <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl p-3 text-sm text-blue-700 dark:text-blue-300">
                {t('par.commInfo')}
              </div>
              <FieldRow cle="taux_commission_global" label={t('par.commGlobal')} type="number" placeholder="20" suffix="%" />
              <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 text-xs text-gray-500 dark:text-gray-400">
                <p className="font-medium text-gray-700 dark:text-gray-200 mb-1">{t('par.commExplainTitle')}</p>
                {t('par.commExplain')}
              </div>
            </div>
          )}

          {/* Parrainage */}
          {active === 'parrainage' && (
            <div className={`${card} space-y-4`}>
              <div className="flex items-start justify-between">
                <h3 className={h3}>{t('par.parrTitle')}</h3>
                <span className="text-xs bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400 rounded-full px-2 py-1">{t('par.affichageSeul')}</span>
              </div>

              <p className="text-sm text-gray-500 dark:text-gray-400">{t('par.parrDesc')}</p>

              <div className="space-y-3">
                {PALIERS_PARRAINAGE.map(p => (
                  <div
                    key={p.palier}
                    className="flex items-center justify-between p-4 rounded-xl border border-gray-100 dark:border-white/10"
                    style={{ backgroundColor: p.palier >= 3 ? 'rgba(201,168,76,0.08)' : 'transparent' }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ backgroundColor: '#C9A84C' }}>
                        {p.palier}
                      </span>
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{t('par.palierLabel')} {p.palier} — {p.cond}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{p.detail}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold" style={{ color: '#C9A84C' }}>{p.bonus}</p>
                      <p className="text-xs text-gray-400">{t('par.auParrain')}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 text-sm text-gray-600 dark:text-gray-300 flex items-center justify-between">
                <span>{t('par.totalMax')}</span>
                <span className="font-bold" style={{ color: '#C9A84C' }}>{t('par.totalMaxValue')}</span>
              </div>
            </div>
          )}

          {/* Facturation */}
          {active === 'facturation' && (
            <div className={`${card} space-y-4`}>
              <h3 className={h3}>{t('par.factTitle')}</h3>
              <FieldRow cle="indemnisation_chauffeur_defaut" label={t('par.indemDefaut')} type="number" placeholder="5" suffix="€" />
              <FieldRow cle="commission_ambassadeur_moral_pct" label={t('par.commMoral')} type="number" placeholder="10" suffix="%" />
              <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 text-xs text-gray-500 dark:text-gray-400">
                {t('par.factExplain')}
              </div>

              {/* Cycle de facturation chauffeurs — fixé par les specs §7.1 (lecture seule) */}
              <div className="pt-2">
                <h4 className={`${h4} mb-1`}>{t('par.factCycleTitle')}</h4>
                <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-white/10">
                  <span className="text-sm text-gray-700 dark:text-gray-200">{t('par.factTauxSesame')}</span>
                  <span className="text-sm font-bold" style={{ color: '#FF9A3C' }}>{getValue('taux_commission_global') || '20'}%</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-white/10">
                  <span className="text-sm text-gray-700 dark:text-gray-200">{t('par.factCycleLabel')}</span>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('par.factCycleVal')}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-white/10">
                  <span className="text-sm text-gray-700 dark:text-gray-200">{t('par.factRelanceLabel')}</span>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('par.factRelanceVal')}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-700 dark:text-gray-200">{t('par.factSuspensionLabel')}</span>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('par.factSuspensionVal')}</span>
                </div>
              </div>
            </div>
          )}

          {/* Notifications */}
          {active === 'notifications' && (
            <div className={`${card} space-y-4`}>
              <h3 className={h3}>{t('par.notifTitle')}</h3>
              <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl p-3 text-sm text-blue-700 dark:text-blue-300">
                {t('par.notifInfo')}
              </div>
              <ToggleRow cle="notif_push_active" label={t('par.notifPush')} desc={t('par.notifPushDesc')} />
              <ToggleRow cle="notif_email_active" label={t('par.notifEmail')} desc={t('par.notifEmailDesc')} />
              <ToggleRow cle="notif_sms_active" label={t('par.notifSms')} desc={t('par.notifSmsDesc')} />

              <div className="pt-2">
                <h4 className={`${h4} mb-1`}>{t('par.alertDocsTitle')}</h4>
                <FieldRow cle="alerte_doc_jours" label={t('par.alertDocsLabel')} placeholder="15,7,0" />
                <p className="text-xs text-gray-400 mt-1">{t('par.alertDocsHint')}</p>
              </div>
            </div>
          )}

          {/* Pays & Localisation (specs §5.4) */}
          {active === 'localisation' && (
            <div className={`${card} space-y-4`}>
              <h3 className={h3}>{t('par.locTitle')}</h3>
              <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl p-3 text-sm text-blue-700 dark:text-blue-300">
                {t('par.locInfo')}
              </div>

              <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-white/10">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('par.locPays')}</label>
                <select className={selectCls} value={getValue('pays_defaut') || 'FR'} onChange={e => setValue('pays_defaut', e.target.value)}>
                  {(['FR', 'BE', 'CH', 'LU'] as const).map(c => <option key={c} value={c}>{t(`par.country.${c}`)}</option>)}
                </select>
              </div>

              <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-white/10">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('par.locDevise')}</label>
                <select className={selectCls} value={getValue('devise') || 'EUR'} onChange={e => setValue('devise', e.target.value)}>
                  {DEVISES.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-white/10">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('par.locFuseau')}</label>
                <select className={selectCls} value={getValue('fuseau_horaire') || 'Europe/Paris'} onChange={e => setValue('fuseau_horaire', e.target.value)}>
                  {FUSEAUX.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => saveMultiple(['pays_defaut', 'devise', 'fuseau_horaire'])}
                  disabled={saving}
                  className="px-5 py-2 text-sm font-medium rounded-xl text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{ backgroundColor: '#4CAF82' }}
                >
                  {saving ? t('par.saving') : t('par.locSave')}
                </button>
              </div>
            </div>
          )}

          {/* Sécurité */}
          {active === 'securite' && (
            <div className={`${card} space-y-6`}>
              <h3 className={h3}>{t('par.secTitle')}</h3>

              {/* 2FA */}
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{t('par.twofaTitle')}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t('par.twofaDesc')}</p>
                  </div>
                  {twofa !== null && (
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${twofa ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400'}`}>
                      {twofa ? t('par.twofaActive') : t('par.twofaInactive')}
                    </span>
                  )}
                </div>

                {twofa === false && !qr && (
                  <button onClick={handleSetup2fa} disabled={twofaBusy}
                    className="mt-3 px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-50" style={{ backgroundColor: '#C9A84C' }}>
                    {twofaBusy ? '…' : t('par.twofaConfigure')}
                  </button>
                )}

                {qr && (
                  <div className="mt-4 bg-gray-50 dark:bg-white/5 rounded-xl p-4 flex flex-col items-center gap-3">
                    <p className="text-sm text-gray-600 dark:text-gray-300 text-center">{t('par.twofaStep1')}</p>
                    <img src={qr} alt="QR 2FA" className="w-44 h-44 bg-white rounded-lg p-1" />
                    <p className="text-sm text-gray-600 dark:text-gray-300 text-center">{t('par.twofaStep2')}</p>
                    <input
                      type="text" inputMode="numeric" value={twofaCode}
                      onChange={e => setTwofaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-lg px-3 py-2 text-center font-mono tracking-[0.3em] outline-none focus:border-yellow-400 w-40"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => { setQr(null); setTwofaCode(''); }} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5">{t('common.cancel')}</button>
                      <button onClick={handleActivate2fa} disabled={twofaBusy || twofaCode.length < 6}
                        className="px-4 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-50" style={{ backgroundColor: '#4CAF82' }}>
                        {twofaBusy ? '…' : t('par.twofaActivate')}
                      </button>
                    </div>
                  </div>
                )}

                {twofa === true && (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="text" inputMode="numeric" value={twofaCode}
                      onChange={e => setTwofaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder={t('par.twofaCodePlaceholder')}
                      className="border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-lg px-3 py-2 text-sm text-center font-mono tracking-widest outline-none focus:border-yellow-400 w-32"
                    />
                    <button onClick={handleDisable2fa} disabled={twofaBusy || twofaCode.length < 6}
                      className="px-4 py-2 text-sm rounded-lg border border-red-300 dark:border-red-500/30 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50">
                      {twofaBusy ? '…' : t('par.twofaDisable')}
                    </button>
                  </div>
                )}
              </div>

              {/* Durée de session */}
              <div className="pt-2 border-t border-gray-100 dark:border-white/10">
                <FieldRow cle="session_duree_heures" label={t('par.sessionDuree')} type="number" placeholder="4" suffix={t('par.heures')} />
              </div>

              {/* IP whitelist */}
              <div className="pt-2 border-t border-gray-100 dark:border-white/10">
                <div className="bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 rounded-xl p-3 text-sm text-orange-700 dark:text-orange-300 mb-3">
                  ⚠️ <strong>{t('par.ipWhitelistWarnStrong')}</strong> {t('par.ipWhitelistWarnRest')}
                </div>
                <FieldRow cle="admin_ip_whitelist" label={t('par.ipWhitelistLabel')} placeholder={t('par.ipWhitelistPlaceholder')} />
              </div>
            </div>
          )}

          {/* Équipe admin (specs §5.4) */}
          {active === 'equipe' && (
            <div className={`${card} space-y-5`}>
              <h3 className={h3}>{t('par.equipeTitle')}</h3>

              {/* Compte fondateur (toujours Super admin, via .env) */}
              <div className="flex items-center gap-4 p-4 rounded-xl" style={{ backgroundColor: 'rgba(201,168,76,0.1)', border: '2px solid #C9A84C' }}>
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold text-white shrink-0" style={{ backgroundColor: '#C9A84C' }}>NA</div>
                <div className="flex-1">
                  <p className="font-bold text-gray-900 dark:text-gray-100">{t('par.compteFondateur')}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{fondateur || 'NAJAH Abdallah'}</p>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: '#C9A84C' }}>{t('par.superAdminBadge')}</span>
              </div>

              {!isSuper ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-white/5 rounded-xl p-4">
                  {t('par.onlySuper')} <strong>{roleLabel(myRole as AdminRole)}</strong>.
                </p>
              ) : (
                <>
                  {/* Liste des comptes additionnels */}
                  <div>
                    <h4 className={`${h4} mb-2`}>{t('par.comptesEquipe')}</h4>
                    {admins.length === 0 ? (
                      <p className="text-sm text-gray-400">{t('par.noCompte')}</p>
                    ) : (
                      <div className="space-y-2">
                        {admins.map(a => (
                          <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-white/10 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{a.nom || a.email}</p>
                              <p className="text-xs text-gray-400">{a.email}{!a.actif && ` · ${t('par.desactiveSuffix')}`}</p>
                            </div>
                            <select
                              value={a.role}
                              onChange={e => handleUpdateAdmin(a.id, { role: e.target.value as AdminRole })}
                              className="border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-lg px-2 py-1 text-xs outline-none focus:border-yellow-400"
                            >
                              {(['super_admin', 'operateur', 'lecteur'] as AdminRole[]).map(r => (
                                <option key={r} value={r}>{roleLabel(r)}</option>
                              ))}
                            </select>
                            <button onClick={() => handleUpdateAdmin(a.id, { actif: !a.actif })}
                              className="px-2 py-1 text-xs font-semibold rounded-lg text-white"
                              style={{ backgroundColor: a.actif ? '#FF9A3C' : '#4CAF82' }}>
                              {a.actif ? t('par.desactiver') : t('par.activer')}
                            </button>
                            <button onClick={() => handleDeleteAdmin(a)}
                              className="px-2 py-1 text-xs rounded-lg border border-red-200 dark:border-red-500/30 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10">{t('par.suppr')}</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Création */}
                  <div className="pt-2 border-t border-gray-100 dark:border-white/10">
                    <h4 className={`${h4} mb-2`}>{t('par.ajouterCompte')}</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input value={adminForm.nom} onChange={e => setAdminForm({ ...adminForm, nom: e.target.value })}
                        placeholder={t('par.nomPlaceholder')} className="border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400" />
                      <input value={adminForm.email} onChange={e => setAdminForm({ ...adminForm, email: e.target.value })}
                        type="email" placeholder={t('par.emailPlaceholder')} className="border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400" />
                      <input value={adminForm.password} onChange={e => setAdminForm({ ...adminForm, password: e.target.value })}
                        type="password" placeholder={t('par.pwdPlaceholder')} className="border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400" />
                      <select value={adminForm.role} onChange={e => setAdminForm({ ...adminForm, role: e.target.value as AdminRole })}
                        className="border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400">
                        {(['operateur', 'lecteur', 'super_admin'] as AdminRole[]).map(r => (
                          <option key={r} value={r}>{roleLabel(r)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex justify-end mt-3">
                      <button onClick={handleCreateAdmin} disabled={adminBusy}
                        className="px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-50" style={{ backgroundColor: '#C9A84C' }}>
                        {adminBusy ? t('par.creating') : t('par.creerCompte')}
                      </button>
                    </div>
                  </div>

                  {/* Rappel des rôles */}
                  <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 text-xs text-gray-500 dark:text-gray-400 space-y-1">
                    <p><strong>{t('par.roleSuperAdminName')}</strong>{t('par.roleSuperAdminDesc')}</p>
                    <p><strong>{t('par.roleOperateurName')}</strong>{t('par.roleOperateurDesc')}</p>
                    <p><strong>{t('par.roleLecteurName')}</strong>{t('par.roleLecteurDesc')}</p>
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
