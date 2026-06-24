import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Switch, StatusBar, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLang } from '../context/LanguageContext';
import type { RootStackParamList } from '../types';
import { getChauffeurProfile, setChauffeurAvailability, getChauffeurDocuments, uploadChauffeurDocument, updateChauffeurProfile } from '../services/api';
import { TextInput } from 'react-native';
import { Colors, Typography } from '../theme';
import BottomNav from '../components/BottomNav';
import type { ChauffeurProfile, ChauffeurDocument } from '../types';

export default function ChauffeurProfileScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const { chauffeurId, logout } = useAuth();
    const { mode, setMode, colors } = useTheme();
    const { lang, setLang, t } = useLang();
    const [profile, setProfile] = useState<ChauffeurProfile | null>(null);
    const [documents, setDocuments] = useState<ChauffeurDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [available, setAvailable] = useState(false);
    const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
    const [prenom, setPrenom] = useState('');
    const [nom, setNom] = useState('');
    const [telephone, setTelephone] = useState('');
    const [iban, setIban] = useState('');
    const [siret, setSiret] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');
    const styles = useMemo(() => makeStyles(colors), [colors]);

    useEffect(() => {
        async function loadProfile() {
            if (!chauffeurId) return;
            try {
                const [profileRes, docsRes] = await Promise.all([
                    getChauffeurProfile(chauffeurId),
                    getChauffeurDocuments(chauffeurId),
                ]);
                setProfile(profileRes.data);
                setAvailable(profileRes.data.disponible);
                setDocuments(docsRes.data);
                setPrenom(profileRes.data.prenom || '');
                setNom(profileRes.data.nom || '');
                setTelephone(profileRes.data.telephone || '');
                setIban((profileRes.data as any).iban || '');
                setSiret((profileRes.data as any).siret || '');
            } catch {
                setError('Erreur de chargement.');
            } finally {
                setLoading(false);
            }
        }
        loadProfile();
    }, [chauffeurId]);

    const handleSave = async () => {
        if (!chauffeurId) return;
        setSaving(true);
        try {
            await updateChauffeurProfile(chauffeurId, { prenom, nom, telephone, iban, siret });
            setSaveMsg('Profil mis à jour !');
            setTimeout(() => setSaveMsg(''), 3000);
        } catch {
            setSaveMsg('Erreur lors de la sauvegarde.');
            setTimeout(() => setSaveMsg(''), 3000);
        } finally {
            setSaving(false);
        }
    };

    const handleUploadDocument = async (docType: string, label: string, side: 'recto' | 'verso' = 'recto') => {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            Alert.alert('Permission requise', 'Veuillez autoriser l\'accès à vos photos.');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
            allowsEditing: true,
        });
        if (result.canceled || !result.assets[0]) return;

        if (!chauffeurId) return;
        setUploadingDoc(`${docType}_${side}`);
        try {
            const uri = result.assets[0].uri;
            await uploadChauffeurDocument(chauffeurId, docType, side, uri);
            const docsRes = await getChauffeurDocuments(chauffeurId);
            setDocuments(docsRes.data);
            Alert.alert('Document envoyé', `${label} (${side}) transmis pour validation.`);
        } catch {
            Alert.alert('Erreur', 'Impossible d\'envoyer le document.');
        } finally {
            setUploadingDoc(null);
        }
    };

    const toggleAvailability = async () => {
        if (!chauffeurId) return;
        const nextStatus = !available;
        try {
            await setChauffeurAvailability(chauffeurId, nextStatus);
            setAvailable(nextStatus);
        } catch {
            setError('Erreur mise à jour.');
        }
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
            <StatusBar barStyle="light-content" />
            <ScrollView contentContainerStyle={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>Profil Chauffeur</Text>
                    <TouchableOpacity
                        onPress={() => { logout(); navigation.reset({ index: 0, routes: [{ name: 'Login' }] }); }}
                        style={styles.logoutBtn}
                    >
                        <Text style={styles.logoutText}>{t('deconnexion')}</Text>
                    </TouchableOpacity>
                </View>

                {loading ? (
                    <ActivityIndicator size="large" color={Colors.brand.info} style={{ marginTop: 40 }} />
                ) : error ? (
                    <Text style={styles.errorText}>{error}</Text>
                ) : (
                    <View style={styles.form}>
                        <View style={styles.card}>
                            <Text style={styles.cardTitle}>VOTRE VÉHICULE</Text>
                            <Text style={styles.infoText}>{profile?.vehicule_marque} {profile?.vehicule_modele}</Text>
                            <Text style={styles.infoSub}>{profile?.vehicule_type.toUpperCase()} • {profile?.vehicule_immat}</Text>
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>COORDONNÉES</Text>
                            <View style={styles.infoRow}>
                                <Text style={styles.label}>EMAIL</Text>
                                <Text style={styles.value}>{profile?.email}</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Text style={styles.label}>TÉLÉPHONE</Text>
                                <Text style={styles.value}>{profile?.telephone}</Text>
                            </View>
                        </View>

                        {/* Section édition */}
                        <View style={styles.editSection}>
                            <Text style={styles.sectionLabel}>MODIFIER MON PROFIL</Text>
                            {[
                                { label: 'Prénom', value: prenom, set: setPrenom },
                                { label: 'Nom', value: nom, set: setNom },
                                { label: 'Téléphone', value: telephone, set: setTelephone, keyboard: 'phone-pad' },
                                { label: 'IBAN', value: iban, set: setIban },
                                { label: 'SIRET', value: siret, set: setSiret, keyboard: 'numeric' },
                            ].map(({ label, value, set, keyboard }) => (
                                <View key={label} style={styles.editField}>
                                    <Text style={styles.editLabel}>{label}</Text>
                                    <TextInput
                                        style={styles.editInput}
                                        value={value}
                                        onChangeText={set}
                                        placeholderTextColor={colors.textSecondary}
                                        keyboardType={(keyboard as any) || 'default'}
                                    />
                                </View>
                            ))}
                            {saveMsg ? (
                                <Text style={{ color: saveMsg.includes('Erreur') ? Colors.brand.error : Colors.brand.success, textAlign: 'center', marginBottom: 8 }}>{saveMsg}</Text>
                            ) : null}
                            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                                {saving ? <ActivityIndicator color="#101018" /> : <Text style={styles.saveBtnText}>Enregistrer</Text>}
                            </TouchableOpacity>
                        </View>

                        <View style={styles.dispoSection}>
                            <View>
                                <Text style={styles.dispoLabel}>DISPONIBILITÉ</Text>
                                <Text style={available ? styles.onlineText : styles.offlineText}>
                                    {available ? 'Vous recevez des courses' : 'Vous êtes hors ligne'}
                                </Text>
                            </View>
                            <Switch
                                value={available}
                                onValueChange={toggleAvailability}
                                trackColor={{ false: '#303040', true: Colors.brand.success }}
                                thumbColor="#FFFFFF"
                            />
                        </View>

                        {/* Section KYC - Documents obligatoires */}
                        <View style={[
                            styles.kycSection,
                            !(profile as any)?.documents_valides && styles.kycSectionPending,
                        ]}>
                            {/* En-tête */}
                            <View style={styles.kycHeader}>
                                <Text style={styles.kycTitle}>
                                    {(profile as any)?.documents_valides ? '✓  DOCUMENTS VALIDÉS' : '⚠️  DOCUMENTS REQUIS'}
                                </Text>
                                {!(profile as any)?.documents_valides && (
                                    <View style={styles.kycBadge}>
                                        <Text style={styles.kycBadgeText}>ACTION REQUISE</Text>
                                    </View>
                                )}
                            </View>
                            <Text style={styles.kycSubtitle}>
                                {(profile as any)?.documents_valides
                                    ? 'Votre dossier est complet et validé par SÉSAME.'
                                    : '11 documents obligatoires. 0 manquant = 0 course.'}
                            </Text>

                            {[
                                { type: 'carte_identite',    label: "Carte d'identité",                             hasVerso: true  },
                                { type: 'carte_vtc',         label: 'Carte VTC Professionnelle',                   hasVerso: true  },
                                { type: 'revtc',             label: 'REVTC (Registre des VTC)',                    hasVerso: false },
                                { type: 'kbis',              label: 'Kbis — moins de 6 mois',                     hasVerso: false },
                                { type: 'permis',            label: 'Permis de conduire',                          hasVerso: true  },
                                { type: 'rir',               label: "RIR (Relevé d'Information Routier)",          hasVerso: false },
                                { type: 'rc_pro',            label: 'RC Pro (Responsabilité Civile Pro)',           hasVerso: false },
                                { type: 'rc_circulation',    label: 'RC Circulation (assurance du véhicule)',      hasVerso: false },
                                { type: 'carte_grise',       label: 'Carte grise du véhicule',                    hasVerso: true  },
                                { type: 'certificat_medical',label: "Certificat médical d'aptitude",               hasVerso: false },
                                { type: 'photo_profil',      label: 'Photo de profil (format identité)',           hasVerso: false },
                            ].map(({ type, label, hasVerso }) => {
                                const doc = documents.find(d => d.type === type);
                                const isUploadingRecto = uploadingDoc === `${type}_recto`;
                                const isUploadingVerso = uploadingDoc === `${type}_verso`;
                                const isMissing = !doc;
                                const isRefused = doc?.statut === 'refuse';
                                const isExpire = doc?.statut === 'expire';

                                // Kbis : calcul âge depuis date_expiration (= émission + 6 mois)
                                let kbisAlerte: 'ok' | 'orange' | 'bloque' | null = null;
                                if (type === 'kbis' && doc?.statut === 'valide' && doc.date_expiration) {
                                    const expiration = new Date(doc.date_expiration);
                                    const today = new Date();
                                    const joursRestants = Math.floor((expiration.getTime() - today.getTime()) / 86400000);
                                    if (joursRestants <= 0) kbisAlerte = 'bloque';
                                    else if (joursRestants <= 30) kbisAlerte = 'orange';
                                    else kbisAlerte = 'ok';
                                }

                                return (
                                    <View key={type} style={[
                                        styles.docRow,
                                        isMissing && styles.docRowMissing,
                                        (isRefused || isExpire) && styles.docRowRefused,
                                        doc?.statut === 'valide' && !kbisAlerte && styles.docRowValid,
                                        kbisAlerte === 'orange' && styles.docRowWarning,
                                        kbisAlerte === 'bloque' && styles.docRowRefused,
                                    ]}>
                                        <View style={styles.docInfo}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                <Text style={[styles.docLabel, isMissing && styles.docLabelMissing]}>
                                                    {isMissing ? '📎 ' : ''}{label}
                                                </Text>
                                                {kbisAlerte === 'ok' && (
                                                    <View style={styles.kbisBadgeOk}>
                                                        <Text style={styles.kbisBadgeText}>Annuel &lt; 6 mois</Text>
                                                    </View>
                                                )}
                                                {kbisAlerte === 'orange' && (
                                                    <View style={styles.kbisBadgeWarn}>
                                                        <Text style={styles.kbisBadgeText}>À renouveler</Text>
                                                    </View>
                                                )}
                                            </View>
                                            {doc ? (
                                                <Text style={[
                                                    styles.docStatus,
                                                    doc.statut === 'valide' && kbisAlerte !== 'orange' && kbisAlerte !== 'bloque' && styles.docValid,
                                                    doc.statut === 'valide' && kbisAlerte === 'orange' && styles.docWarning,
                                                    (doc.statut === 'refuse' || isExpire || kbisAlerte === 'bloque') && styles.docRefused,
                                                    doc.statut === 'en_attente' && styles.docPending,
                                                ]}>
                                                    {isExpire || kbisAlerte === 'bloque' ? '✗ EXPIRÉ — renouvellement requis' :
                                                     kbisAlerte === 'orange' ? '⚠ EXPIRE BIENTÔT — renouvelez votre Kbis' :
                                                     doc.statut === 'valide' ? '✓ VALIDÉ' :
                                                     doc.statut === 'refuse' ? '✗ REFUSÉ — renvoyer' :
                                                     '⏳ EN ATTENTE DE VALIDATION'}
                                                </Text>
                                            ) : (
                                                <Text style={styles.docMissing}>Non fourni — obligatoire</Text>
                                            )}
                                        </View>
                                        <View style={{ flexDirection: 'row', gap: 8 }}>
                                            <TouchableOpacity
                                                style={[
                                                    styles.uploadBtn,
                                                    isMissing && styles.uploadBtnMissing,
                                                    isRefused && styles.uploadBtnRefused,
                                                    isUploadingRecto && styles.uploadBtnDisabled,
                                                ]}
                                                onPress={() => handleUploadDocument(type, label, 'recto')}
                                                disabled={isUploadingRecto || isUploadingVerso}
                                            >
                                                {isUploadingRecto
                                                    ? <ActivityIndicator size="small" color="#FFFFFF" />
                                                    : <Text style={[
                                                        styles.uploadBtnText,
                                                        (isMissing || isRefused) && styles.uploadBtnTextUrgent,
                                                      ]}>
                                                        {hasVerso ? (doc?.fichier_recto_url ? '↺ Recto' : 'Recto') : (doc ? 'Remplacer' : 'Envoyer')}
                                                      </Text>
                                                }
                                            </TouchableOpacity>
                                            {hasVerso && (
                                                <TouchableOpacity
                                                    style={[
                                                        styles.uploadBtn,
                                                        isMissing && styles.uploadBtnMissing,
                                                        isRefused && styles.uploadBtnRefused,
                                                        isUploadingVerso && styles.uploadBtnDisabled,
                                                    ]}
                                                    onPress={() => handleUploadDocument(type, label, 'verso')}
                                                    disabled={isUploadingRecto || isUploadingVerso}
                                                >
                                                    {isUploadingVerso
                                                        ? <ActivityIndicator size="small" color="#FFFFFF" />
                                                        : <Text style={[
                                                            styles.uploadBtnText,
                                                            (isMissing || isRefused) && styles.uploadBtnTextUrgent,
                                                          ]}>
                                                            {doc?.fichier_verso_url ? '↺ Verso' : 'Verso'}
                                                          </Text>
                                                    }
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                        {/* Préférences */}
                        <View style={styles.divider} />
                        <View style={styles.prefSection}>
                            <Text style={styles.prefSectionTitle}>PREFERENCES</Text>
                            <Text style={styles.prefLabel}>{t('theme').toUpperCase()}</Text>
                            <View style={styles.toggleRow}>
                                {(['nocturne', 'clair', 'auto'] as const).map(m => (
                                    <TouchableOpacity
                                        key={m}
                                        style={[styles.toggleBtn, mode === m && styles.toggleBtnActive]}
                                        onPress={() => setMode(m)}
                                    >
                                        <Text style={[styles.toggleText, mode === m && styles.toggleTextActive]}>
                                            {t(m)}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Langue */}
                            <Text style={[styles.prefLabel, { marginTop: 20 }]}>{t('langue').toUpperCase()}</Text>
                            <View style={styles.toggleRow}>
                                {(['fr', 'en', 'it', 'es'] as const).map(l => (
                                    <TouchableOpacity
                                        key={l}
                                        style={[styles.toggleBtn, lang === l && styles.toggleBtnActive]}
                                        onPress={() => setLang(l)}
                                    >
                                        <Text style={[styles.toggleText, lang === l && styles.toggleTextActive]}>
                                            {l.toUpperCase()}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    </View>
                )}

                {/* Support / Mes tickets (specs §3.6) */}
                <TouchableOpacity style={styles.supportBtn} onPress={() => navigation.navigate('Tickets')}>
                    <Text style={styles.supportBtnText}>🎫  Support / Mes tickets</Text>
                </TouchableOpacity>
            </ScrollView>
            <BottomNav role="chauffeur" />
        </SafeAreaView>
    );
}

function makeStyles(colors: typeof Colors.nocturne) {
    return StyleSheet.create({
        supportBtn: {
            marginHorizontal: 20,
            marginTop: 20,
            backgroundColor: colors.card,
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: 'rgba(201,168,76,0.4)',
        },
        supportBtnText: {
            color: Colors.brand.gold,
            fontSize: Typography.sizes.sub,
            fontWeight: Typography.weights.semiBold as any,
        },
        safeArea: {
            flex: 1,
            backgroundColor: colors.background,
        },
        container: {
            padding: 24,
            paddingBottom: 120,
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 32,
        },
        title: {
            color: Colors.brand.info,
            fontSize: Typography.sizes.title,
            fontWeight: Typography.weights.black as any,
        },
        logoutBtn: {
            backgroundColor: 'rgba(255, 100, 100, 0.15)',
            paddingHorizontal: 14,
            paddingVertical: 7,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: 'rgba(255, 100, 100, 0.3)',
        },
        logoutText: {
            color: Colors.brand.error,
            fontSize: Typography.sizes.small,
            fontWeight: Typography.weights.bold as any,
        },
        form: {
            width: '100%',
        },
        card: {
            backgroundColor: colors.card,
            borderRadius: 20,
            padding: 20,
            marginBottom: 24,
            borderWidth: 1,
            borderColor: 'rgba(74, 158, 255, 0.1)',
        },
        cardTitle: {
            color: Colors.brand.info,
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.black as any,
            letterSpacing: 1,
            marginBottom: 12,
        },
        infoText: {
            color: colors.textPrimary,
            fontSize: Typography.sizes.header,
            fontWeight: Typography.weights.bold as any,
        },
        infoSub: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.sub,
            marginTop: 4,
        },
        section: {
            marginBottom: 32,
        },
        sectionLabel: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.black as any,
            letterSpacing: 1,
            marginBottom: 16,
        },
        infoRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(255,255,255,0.05)',
        },
        label: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.bold as any,
        },
        value: {
            color: colors.textPrimary,
            fontSize: Typography.sizes.sub,
        },
        dispoSection: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: colors.card,
            padding: 20,
            borderRadius: 20,
        },
        dispoLabel: {
            color: colors.textPrimary,
            fontSize: Typography.sizes.sub,
            fontWeight: Typography.weights.bold as any,
        },
        onlineText: {
            color: Colors.brand.success,
            fontSize: Typography.sizes.tiny,
            marginTop: 4,
        },
        offlineText: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
            marginTop: 4,
        },
        errorText: {
            color: Colors.brand.error,
            marginTop: 16,
        },
        kycSection: {
            marginTop: 32,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: 'rgba(201,168,76,0.2)',
            backgroundColor: colors.card,
            padding: 16,
        },
        kycSectionPending: {
            borderWidth: 2,
            borderColor: Colors.brand.gold,
            backgroundColor: 'rgba(201,168,76,0.06)',
        },
        kycHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 6,
        },
        kycTitle: {
            color: Colors.brand.gold,
            fontSize: Typography.sizes.small,
            fontWeight: Typography.weights.black as any,
            letterSpacing: 1,
        },
        kycBadge: {
            backgroundColor: Colors.brand.gold,
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 3,
        },
        kycBadgeText: {
            color: '#101018',
            fontSize: 9,
            fontWeight: Typography.weights.black as any,
            letterSpacing: 1,
        },
        kycSubtitle: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
            marginBottom: 16,
            lineHeight: 18,
        },
        docRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: colors.background,
            borderRadius: 14,
            padding: 14,
            marginBottom: 10,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.04)',
        },
        docRowMissing: {
            borderColor: 'rgba(201,168,76,0.5)',
            backgroundColor: 'rgba(201,168,76,0.05)',
        },
        docRowRefused: {
            borderColor: 'rgba(255,100,100,0.5)',
            backgroundColor: 'rgba(255,100,100,0.05)',
        },
        docRowValid: {
            borderColor: 'rgba(76,175,130,0.3)',
        },
        docInfo: { flex: 1 },
        docLabel: {
            color: colors.textPrimary,
            fontSize: Typography.sizes.sub,
            fontWeight: Typography.weights.semiBold as any,
        },
        docLabelMissing: {
            color: Colors.brand.gold,
        },
        docStatus: {
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.bold as any,
            marginTop: 2,
        },
        docValid: { color: Colors.brand.success },
        docRefused: { color: Colors.brand.error },
        docPending: { color: Colors.brand.warning },
        docWarning: { color: Colors.brand.warning },
        docRowWarning: {
            borderColor: 'rgba(255,154,60,0.5)',
            backgroundColor: 'rgba(255,154,60,0.05)',
        },
        kbisBadgeOk: {
            backgroundColor: 'rgba(138,43,226,0.15)',
            borderRadius: 6,
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderWidth: 1,
            borderColor: 'rgba(138,43,226,0.4)',
        },
        kbisBadgeWarn: {
            backgroundColor: 'rgba(255,154,60,0.15)',
            borderRadius: 6,
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderWidth: 1,
            borderColor: 'rgba(255,154,60,0.5)',
        },
        kbisBadgeText: {
            color: '#B57BFF',
            fontSize: 9,
            fontWeight: Typography.weights.bold as any,
        },
        docMissing: {
            color: Colors.brand.gold,
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.bold as any,
            marginTop: 2,
        },
        uploadBtn: {
            backgroundColor: 'rgba(74, 158, 255, 0.1)',
            borderWidth: 1,
            borderColor: 'rgba(74, 158, 255, 0.3)',
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 8,
            minWidth: 80,
            alignItems: 'center',
        },
        uploadBtnMissing: {
            backgroundColor: Colors.brand.gold,
            borderColor: Colors.brand.gold,
        },
        uploadBtnRefused: {
            backgroundColor: Colors.brand.error,
            borderColor: Colors.brand.error,
        },
        uploadBtnDisabled: { opacity: 0.4 },
        uploadBtnText: {
            color: Colors.brand.info,
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.bold as any,
        },
        uploadBtnTextUrgent: {
            color: '#101018',
        },
        divider: {
            height: 1,
            backgroundColor: 'rgba(255,255,255,0.07)',
            marginVertical: 32,
        },
        editSection: { marginBottom: 20 },
        editField: { marginBottom: 14 },
        editLabel: { color: colors.textSecondary, fontSize: Typography.sizes.tiny, fontWeight: Typography.weights.bold as any, letterSpacing: 1, marginBottom: 6 },
        editInput: { backgroundColor: colors.card, color: colors.textPrimary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: Typography.sizes.body, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
        saveBtn: { backgroundColor: Colors.brand.info, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
        saveBtnText: { color: '#FFFFFF', fontWeight: Typography.weights.black as any, fontSize: Typography.sizes.body },
        prefSection: {},
        prefSectionTitle: {
            color: Colors.brand.info,
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.black as any,
            letterSpacing: 2,
            marginBottom: 24,
        },
        prefLabel: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.bold as any,
            letterSpacing: 1,
            marginBottom: 10,
        },
        toggleRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
        toggleBtn: {
            flex: 1, paddingVertical: 10, borderRadius: 10,
            backgroundColor: colors.card, alignItems: 'center',
            borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
        },
        toggleBtnActive: { backgroundColor: Colors.brand.info, borderColor: Colors.brand.info },
        toggleText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
        toggleTextActive: { color: '#FFFFFF', fontWeight: '700' },
    });
}
