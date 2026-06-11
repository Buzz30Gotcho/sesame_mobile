import React, { useEffect, useState, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, StatusBar,
    TouchableOpacity, TextInput, Modal, ActivityIndicator, Alert,
    KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLang } from '../context/LanguageContext';
import { getEquipe, addEquipeEmployee, updateEmployeStatut } from '../services/api';
import { Colors } from '../theme';
import BottomNav from '../components/BottomNav';
import type { RootStackParamList, EquipeEmployee } from '../types';

export default function AmbassadorEquipeScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const { ambassadorId } = useAuth();
    const { colors } = useTheme();
    const { t } = useLang();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const [employes, setEmployes] = useState<EquipeEmployee[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [togglingId, setTogglingId] = useState<string | null>(null);

    const [prenom, setPrenom] = useState('');
    const [nom, setNom] = useState('');
    const [email, setEmail] = useState('');
    const [telephone, setTelephone] = useState('');
    const [metier, setMetier] = useState('');
    const [mdp, setMdp] = useState('');

    const load = () => {
        if (!ambassadorId) return;
        getEquipe(ambassadorId)
            .then(r => setEmployes(r.data))
            .finally(() => setLoading(false));
    };

    useEffect(load, [ambassadorId]);

    const handleToggleStatut = async (e: EquipeEmployee) => {
        if (!ambassadorId) return;
        const newStatut = e.statut === 'actif' ? 'suspendu' : 'actif';
        const msg = newStatut === 'suspendu'
            ? `Suspendre ${e.prenom} ${e.nom} ? Il ne pourra plus se connecter.`
            : `Réactiver ${e.prenom} ${e.nom} ?`;
        Alert.alert('Confirmation', msg, [
            { text: 'Annuler', style: 'cancel' },
            {
                text: newStatut === 'suspendu' ? 'Suspendre' : 'Réactiver',
                style: newStatut === 'suspendu' ? 'destructive' : 'default',
                onPress: async () => {
                    setTogglingId(e.id);
                    try {
                        await updateEmployeStatut(ambassadorId, e.id, newStatut);
                        load();
                    } catch {
                        Alert.alert('Erreur', 'Impossible de modifier le statut.');
                    } finally {
                        setTogglingId(null);
                    }
                },
            },
        ]);
    };

    const handleAdd = async () => {
        if (!prenom || !nom || !email || !telephone || !mdp) {
            Alert.alert(t('erreur'), t('champs_obligatoires'));
            return;
        }
        if (!ambassadorId) return;
        setSaving(true);
        try {
            await addEquipeEmployee(ambassadorId, { prenom, nom, email, telephone, metier, mot_de_passe: mdp });
            setShowModal(false);
            setPrenom(''); setNom(''); setEmail(''); setTelephone(''); setMetier(''); setMdp('');
            load();
        } catch (e: any) {
            Alert.alert(t('erreur'), e?.response?.data?.error ?? t('impossible_ajouter_employe'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
            <StatusBar barStyle={colors.background === '#101018' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
            <ScrollView contentContainerStyle={styles.scroll}>
                <View style={styles.header}>
                    <Text style={styles.title}>{t('equipe')}</Text>
                    <TouchableOpacity style={styles.addBtn} onPress={() => setShowModal(true)}>
                        <Text style={styles.addBtnText}>{t('ajouter_btn')}</Text>
                    </TouchableOpacity>
                </View>
                <Text style={styles.sub}>{t('sous_comptes_info')}</Text>

                {loading && <ActivityIndicator color={Colors.brand.gold} style={{ marginTop: 40 }} />}

                {!loading && employes.length === 0 && (
                    <Text style={styles.empty}>{t('aucun_employe')}</Text>
                )}

                {employes.map(e => (
                    <View key={e.id} style={styles.card}>
                        <View style={styles.cardTop}>
                            <Text style={styles.cardName}>{e.prenom} {e.nom}</Text>
                            <View style={[styles.badge, e.statut === 'actif' ? styles.badgeActive : styles.badgeSuspend]}>
                                <Text style={[styles.badgeText, { color: e.statut === 'actif' ? Colors.brand.success : Colors.brand.error }]}>
                                    {e.statut === 'actif' ? 'Actif' : 'Suspendu'}
                                </Text>
                            </View>
                        </View>
                        {e.metier ? <Text style={styles.cardSub}>{e.metier}</Text> : null}
                        <Text style={styles.cardSub}>{e.email} · {e.telephone}</Text>
                        <View style={styles.cardBottom}>
                            <Text style={styles.cardCourses}>{e.nb_courses} course{Number(e.nb_courses) > 1 ? 's' : ''}</Text>
                            <TouchableOpacity
                                onPress={() => handleToggleStatut(e)}
                                disabled={togglingId === e.id}
                                style={[styles.toggleBtn, { backgroundColor: e.statut === 'actif' ? Colors.brand.error + '20' : Colors.brand.success + '20' }]}
                            >
                                <Text style={[styles.toggleBtnText, { color: e.statut === 'actif' ? Colors.brand.error : Colors.brand.success }]}>
                                    {togglingId === e.id ? '...' : e.statut === 'actif' ? 'Suspendre' : 'Réactiver'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ))}
            </ScrollView>
            <BottomNav role="ambassadeur" />

            {/* Modal ajout employé */}
            <Modal visible={showModal} animationType="slide" transparent>
                <KeyboardAvoidingView
                    style={styles.modalOverlay}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <View style={styles.modal}>
                        <ScrollView
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={styles.modalContent}
                        >
                            <Text style={styles.modalTitle}>Nouvel employé</Text>
                            {[
                                { label: 'Prénom *', value: prenom, set: setPrenom },
                                { label: 'Nom *', value: nom, set: setNom },
                                { label: 'Email *', value: email, set: setEmail, keyboard: 'email-address' as any },
                                { label: 'Téléphone *', value: telephone, set: setTelephone, keyboard: 'phone-pad' as any },
                                { label: 'Métier', value: metier, set: setMetier },
                                { label: 'Mot de passe *', value: mdp, set: setMdp, secure: true },
                            ].map(f => (
                                <View key={f.label} style={styles.field}>
                                    <Text style={styles.fieldLabel}>{f.label}</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={f.value}
                                        onChangeText={f.set}
                                        keyboardType={f.keyboard}
                                        secureTextEntry={f.secure}
                                        placeholderTextColor={colors.textSecondary}
                                    />
                                </View>
                            ))}
                            <View style={styles.modalBtns}>
                                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                                    <Text style={styles.cancelText}>Annuler</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.saveBtn} onPress={handleAdd} disabled={saving}>
                                    <Text style={styles.saveText}>{saving ? '...' : 'Ajouter'}</Text>
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </SafeAreaView>
    );
}

function makeStyles(colors: typeof Colors.nocturne) {
    return StyleSheet.create({
        safe: { flex: 1, backgroundColor: colors.background },
        scroll: { padding: 20, paddingBottom: 120 },
        header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
        title: { fontSize: 24, fontWeight: '700', color: Colors.brand.gold },
        addBtn: { backgroundColor: Colors.brand.gold, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
        addBtnText: { color: '#101018', fontWeight: '700', fontSize: 13 },
        sub: { fontSize: 13, color: colors.textSecondary, marginBottom: 20 },
        card: { backgroundColor: colors.card, borderRadius: 12, padding: 16, marginBottom: 12 },
        cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
        cardName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
        badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
        badgeActive: { backgroundColor: Colors.brand.success + '30' },
        badgeSuspend: { backgroundColor: Colors.brand.error + '30' },
        badgeText: { fontSize: 11, fontWeight: '600', color: colors.textPrimary },
        cardSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
        cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
        cardCourses: { fontSize: 13, color: Colors.brand.info, fontWeight: '600' },
        toggleBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6 },
        toggleBtnText: { fontSize: 12, fontWeight: '700' },
        empty: { textAlign: 'center', color: colors.textSecondary, marginTop: 40 },
        modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
        modal: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
        modalContent: { padding: 24 },
        modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.brand.gold, marginBottom: 20, textAlign: 'center' },
        field: { marginBottom: 12 },
        fieldLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
        input: {
            backgroundColor: colors.background, borderRadius: 8, padding: 12,
            color: colors.textPrimary, fontSize: 14,
        },
        modalBtns: { flexDirection: 'row', gap: 12, marginTop: 12 },
        cancelBtn: { flex: 1, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.textSecondary, alignItems: 'center' },
        cancelText: { color: colors.textSecondary, fontWeight: '600' },
        saveBtn: { flex: 1, padding: 14, borderRadius: 8, backgroundColor: Colors.brand.gold, alignItems: 'center' },
        saveText: { color: '#101018', fontWeight: '700' },
    });
}
