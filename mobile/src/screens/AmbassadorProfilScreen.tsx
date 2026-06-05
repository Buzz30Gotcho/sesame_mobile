import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLang } from '../context/LanguageContext';
import { getAmbassadorProfile, updateAmbassadorProfile } from '../services/api';
import { Colors, Typography } from '../theme';
import BottomNav from '../components/BottomNav';
import type { AmbassadorProfile, RootStackParamList } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export default function AmbassadorProfilScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AmbassadorProfil'>>();
    const { ambassadorId, logout } = useAuth();
    const { mode, setMode, colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const { lang, setLang, t } = useLang();
    const [profile, setProfile] = useState<AmbassadorProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [prenom, setPrenom] = useState('');
    const [nom, setNom] = useState('');
    const [telephone, setTelephone] = useState('');
    const [metier, setMetier] = useState('');
    const [etablissement, setEtablissement] = useState('');

    useEffect(() => {
        async function loadProfile() {
            if (!ambassadorId) return;
            try {
                const response = await getAmbassadorProfile(ambassadorId);
                setProfile(response.data);
                setPrenom(response.data.prenom);
                setNom(response.data.nom);
                setTelephone(response.data.telephone);
                setMetier(response.data.metier || '');
                setEtablissement(response.data.etablissement || '');
            } catch {
                setError(t('impossible_charger_profil'));
            } finally {
                setLoading(false);
            }
        }
        loadProfile();
    }, [ambassadorId]);

    const handleSave = async () => {
        if (!ambassadorId) return;
        setSaving(true);
        setMessage(null);
        setError(null);

        try {
            const response = await updateAmbassadorProfile(ambassadorId, {
                prenom,
                nom,
                telephone,
                metier,
                etablissement,
            });
            setProfile(response.data);
            setMessage(t('profil_maj'));
        } catch {
            setError(t('impossible_maj_profil'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
            <StatusBar barStyle={colors.background === '#101018' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
            <ScrollView contentContainerStyle={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>{t('mon_profil')}</Text>
                    <TouchableOpacity
                        onPress={() => { logout(); navigation.reset({ index: 0, routes: [{ name: 'Login' }] }); }}
                        style={styles.logoutBtn}
                    >
                        <Text style={styles.logoutText}>{t('deconnexion')}</Text>
                    </TouchableOpacity>
                </View>
                
                <Text style={styles.subtitle}>{t('gerer_infos')}</Text>
                
                {loading ? (
                    <ActivityIndicator size="large" color={Colors.brand.gold} style={{ marginTop: 40 }} />
                ) : error ? (
                    <Text style={styles.errorText}>{error}</Text>
                ) : (
                    <View style={styles.form}>
                        <View style={styles.fieldGroup}>
                            <Text style={styles.label}>{t('prenom_label')}</Text>
                            <TextInput style={styles.input} value={prenom} onChangeText={setPrenom} placeholder="Prénom" placeholderTextColor={colors.textSecondary} />
                        </View>
                        <View style={styles.fieldGroup}>
                            <Text style={styles.label}>{t('nom_label')}</Text>
                            <TextInput style={styles.input} value={nom} onChangeText={setNom} placeholder="Nom" placeholderTextColor={colors.textSecondary} />
                        </View>
                        <View style={styles.fieldGroup}>
                            <Text style={styles.label}>{t('telephone_label')}</Text>
                            <TextInput style={styles.input} value={telephone} onChangeText={setTelephone} placeholder="Téléphone" placeholderTextColor={colors.textSecondary} keyboardType="phone-pad" />
                        </View>
                        <View style={styles.fieldGroup}>
                            <Text style={styles.label}>{t('metier_label')}</Text>
                            <TextInput style={styles.input} value={metier} onChangeText={setMetier} placeholder="Métier" placeholderTextColor={colors.textSecondary} />
                        </View>
                        <View style={styles.fieldGroup}>
                            <Text style={styles.label}>{t('etablissement_label')}</Text>
                            <TextInput style={styles.input} value={etablissement} onChangeText={setEtablissement} placeholder="Établissement" placeholderTextColor={colors.textSecondary} />
                        </View>
                        
                        {message && (
                            <View style={styles.successBadge}>
                                <Text style={styles.successText}>{message}</Text>
                            </View>
                        )}
                        
                        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
                            {saving ? <ActivityIndicator color="#101018" /> : <Text style={styles.saveText}>{t('enregistrer')}</Text>}
                        </TouchableOpacity>

                        {/* Thème */}
                        <Text style={styles.label}>{t('theme').toUpperCase()}</Text>
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
                        <Text style={[styles.label, { marginTop: 20 }]}>{t('langue').toUpperCase()}</Text>
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
                )}
            </ScrollView>
            <BottomNav role="ambassadeur" />
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
            marginBottom: 8,
        },
        title: {
            color: Colors.brand.gold,
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
        subtitle: {
            color: colors.textSecondary,
            marginBottom: 32,
            fontSize: Typography.sizes.sub,
        },
        form: {
            width: '100%',
        },
        fieldGroup: {
            marginBottom: 20,
        },
        label: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.bold as any,
            marginBottom: 8,
            letterSpacing: 1,
        },
        input: {
            backgroundColor: colors.card,
            color: colors.textPrimary,
            borderRadius: 16,
            paddingHorizontal: 20,
            paddingVertical: 18,
            fontSize: Typography.sizes.body,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.05)',
        },
        saveButton: {
            backgroundColor: Colors.brand.gold,
            borderRadius: 16,
            paddingVertical: 18,
            alignItems: 'center',
            marginTop: 20,
        },
        saveText: {
            color: '#101018',
            fontWeight: Typography.weights.black as any,
            fontSize: Typography.sizes.body,
        },
        errorText: {
            color: Colors.brand.error,
            marginTop: 16,
            textAlign: 'center',
        },
        successBadge: {
            backgroundColor: 'rgba(76, 175, 130, 0.1)',
            padding: 12,
            borderRadius: 12,
            marginBottom: 16,
            alignItems: 'center',
        },
        successText: {
            color: Colors.brand.success,
            fontSize: Typography.sizes.sub,
            fontWeight: Typography.weights.bold as any,
        },
        toggleRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
        toggleBtn: {
            flex: 1, paddingVertical: 10, borderRadius: 8,
            backgroundColor: colors.card, alignItems: 'center',
        },
        toggleBtnActive: { backgroundColor: Colors.brand.gold },
        toggleText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
        toggleTextActive: { color: '#101018' },
    });
}
