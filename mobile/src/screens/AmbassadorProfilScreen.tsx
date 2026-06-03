import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, SafeAreaView, StatusBar } from 'react-native';
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
    const { mode, setMode } = useTheme();
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
                setError('Impossible de charger les informations de profil.');
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
            setMessage('Profil mis à jour.');
        } catch {
            setError('Impossible de mettre à jour le profil.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" />
            <ScrollView contentContainerStyle={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>Mon Profil</Text>
                    <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
                        <Text style={styles.logoutText}>Déconnexion</Text>
                    </TouchableOpacity>
                </View>
                
                <Text style={styles.subtitle}>Gérez vos informations personnelles et professionnelles.</Text>
                
                {loading ? (
                    <ActivityIndicator size="large" color={Colors.brand.gold} style={{ marginTop: 40 }} />
                ) : error ? (
                    <Text style={styles.errorText}>{error}</Text>
                ) : (
                    <View style={styles.form}>
                        <View style={styles.fieldGroup}>
                            <Text style={styles.label}>PRÉNOM</Text>
                            <TextInput style={styles.input} value={prenom} onChangeText={setPrenom} placeholder="Prénom" placeholderTextColor={Colors.nocturne.textSecondary} />
                        </View>
                        <View style={styles.fieldGroup}>
                            <Text style={styles.label}>NOM</Text>
                            <TextInput style={styles.input} value={nom} onChangeText={setNom} placeholder="Nom" placeholderTextColor={Colors.nocturne.textSecondary} />
                        </View>
                        <View style={styles.fieldGroup}>
                            <Text style={styles.label}>TÉLÉPHONE</Text>
                            <TextInput style={styles.input} value={telephone} onChangeText={setTelephone} placeholder="Téléphone" placeholderTextColor={Colors.nocturne.textSecondary} keyboardType="phone-pad" />
                        </View>
                        <View style={styles.fieldGroup}>
                            <Text style={styles.label}>MÉTIER</Text>
                            <TextInput style={styles.input} value={metier} onChangeText={setMetier} placeholder="Métier" placeholderTextColor={Colors.nocturne.textSecondary} />
                        </View>
                        <View style={styles.fieldGroup}>
                            <Text style={styles.label}>ÉTABLISSEMENT</Text>
                            <TextInput style={styles.input} value={etablissement} onChangeText={setEtablissement} placeholder="Établissement" placeholderTextColor={Colors.nocturne.textSecondary} />
                        </View>
                        
                        {message && (
                            <View style={styles.successBadge}>
                                <Text style={styles.successText}>{message}</Text>
                            </View>
                        )}
                        
                        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
                            {saving ? <ActivityIndicator color="#101018" /> : <Text style={styles.saveText}>ENREGISTRER LES MODIFICATIONS</Text>}
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

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: Colors.nocturne.background,
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
        backgroundColor: 'rgba(255, 100, 100, 0.1)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    logoutText: {
        color: Colors.brand.error,
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.bold as any,
    },
    subtitle: {
        color: Colors.nocturne.textSecondary,
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
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.bold as any,
        marginBottom: 8,
        letterSpacing: 1,
    },
    input: {
        backgroundColor: Colors.nocturne.card,
        color: '#FFFFFF',
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
        backgroundColor: Colors.nocturne.card, alignItems: 'center',
    },
    toggleBtnActive: { backgroundColor: Colors.brand.gold },
    toggleText: { color: Colors.nocturne.textSecondary, fontSize: 12, fontWeight: '600' },
    toggleTextActive: { color: '#101018' },
});
