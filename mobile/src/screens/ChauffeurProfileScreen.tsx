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
import { getChauffeurProfile, setChauffeurAvailability, getChauffeurDocuments, uploadChauffeurDocument } from '../services/api';
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
            } catch {
                setError('Erreur de chargement.');
            } finally {
                setLoading(false);
            }
        }
        loadProfile();
    }, [chauffeurId]);

    const handleUploadDocument = async (docType: string, label: string) => {
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
        setUploadingDoc(docType);
        try {
            const uri = result.assets[0].uri;
            await uploadChauffeurDocument(chauffeurId, {
                type: docType,
                fichier_recto_url: uri,
            });
            const docsRes = await getChauffeurDocuments(chauffeurId);
            setDocuments(docsRes.data);
            Alert.alert('Document envoyé', `${label} transmis pour validation.`);
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
                        <View style={styles.kycSection}>
                            <Text style={styles.sectionLabel}>DOCUMENTS KYC</Text>
                            <Text style={styles.kycSubtitle}>Documents requis pour exercer en tant que chauffeur VTC</Text>

                            {[
                                { type: 'carte_identite', label: "Carte d'identité" },
                                { type: 'carte_vtc', label: 'Carte VTC' },
                                { type: 'permis', label: 'Permis de conduire' },
                                { type: 'carte_grise', label: 'Carte grise' },
                            ].map(({ type, label }) => {
                                const doc = documents.find(d => d.type === type);
                                const isUploading = uploadingDoc === type;
                                return (
                                    <View key={type} style={styles.docRow}>
                                        <View style={styles.docInfo}>
                                            <Text style={styles.docLabel}>{label}</Text>
                                            {doc ? (
                                                <Text style={[
                                                    styles.docStatus,
                                                    doc.statut === 'valide' && styles.docValid,
                                                    doc.statut === 'refuse' && styles.docRefused,
                                                    doc.statut === 'en_attente' && styles.docPending,
                                                ]}>
                                                    {doc.statut === 'valide' ? '✓ VALIDÉ' :
                                                     doc.statut === 'refuse' ? '✗ REFUSÉ' :
                                                     '⏳ EN ATTENTE'}
                                                </Text>
                                            ) : (
                                                <Text style={styles.docMissing}>Non fourni</Text>
                                            )}
                                        </View>
                                        <TouchableOpacity
                                            style={[styles.uploadBtn, isUploading && styles.uploadBtnDisabled]}
                                            onPress={() => handleUploadDocument(type, label)}
                                            disabled={isUploading}
                                        >
                                            {isUploading
                                                ? <ActivityIndicator size="small" color={Colors.brand.info} />
                                                : <Text style={styles.uploadBtnText}>{doc ? 'Remplacer' : 'Envoyer'}</Text>
                                            }
                                        </TouchableOpacity>
                                    </View>
                                );
                            })}
                        </View>
                        {/* Thème */}
                        <View style={styles.prefSection}>
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
            </ScrollView>
            <BottomNav role="chauffeur" />
        </SafeAreaView>
    );
}

function makeStyles(colors: typeof Colors.nocturne) {
    return StyleSheet.create({
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
        },
        kycSubtitle: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
            marginBottom: 16,
            marginTop: 4,
        },
        docRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: colors.card,
            borderRadius: 14,
            padding: 14,
            marginBottom: 10,
        },
        docInfo: { flex: 1 },
        docLabel: {
            color: colors.textPrimary,
            fontSize: Typography.sizes.sub,
            fontWeight: Typography.weights.semiBold as any,
        },
        docStatus: {
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.bold as any,
            marginTop: 2,
        },
        docValid: { color: Colors.brand.success },
        docRefused: { color: Colors.brand.error },
        docPending: { color: Colors.brand.warning },
        docMissing: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
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
        uploadBtnDisabled: { opacity: 0.4 },
        uploadBtnText: {
            color: Colors.brand.info,
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.bold as any,
        },
        prefSection: {
            marginTop: 32,
        },
        prefLabel: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.bold as any,
            letterSpacing: 1,
            marginBottom: 10,
        },
        toggleRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
        toggleBtn: {
            flex: 1, paddingVertical: 10, borderRadius: 8,
            backgroundColor: colors.card, alignItems: 'center',
        },
        toggleBtnActive: { backgroundColor: Colors.brand.info },
        toggleText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
        toggleTextActive: { color: '#FFFFFF' },
    });
}
