import React, { useEffect, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, SafeAreaView, StatusBar,
    TouchableOpacity, TextInput, Modal, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { getEquipe, addEquipeEmployee } from '../services/api';
import { Colors } from '../theme';
import BottomNav from '../components/BottomNav';
import type { RootStackParamList, EquipeEmployee } from '../types';

export default function AmbassadorEquipeScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const { ambassadorId } = useAuth();
    const [employes, setEmployes] = useState<EquipeEmployee[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [saving, setSaving] = useState(false);

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

    const handleAdd = async () => {
        if (!prenom || !nom || !email || !telephone || !mdp) {
            Alert.alert('Erreur', 'Tous les champs obligatoires doivent être remplis.');
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
            Alert.alert('Erreur', e?.response?.data?.error ?? 'Impossible d\'ajouter l\'employé.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <SafeAreaView style={styles.safe}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.nocturne.background} />
            <ScrollView contentContainerStyle={styles.scroll}>
                <View style={styles.header}>
                    <Text style={styles.title}>Mon équipe</Text>
                    <TouchableOpacity style={styles.addBtn} onPress={() => setShowModal(true)}>
                        <Text style={styles.addBtnText}>+ Ajouter</Text>
                    </TouchableOpacity>
                </View>
                <Text style={styles.sub}>Sous-comptes employés de votre établissement</Text>

                {loading && <ActivityIndicator color={Colors.brand.gold} style={{ marginTop: 40 }} />}

                {!loading && employes.length === 0 && (
                    <Text style={styles.empty}>Aucun employé pour l'instant.</Text>
                )}

                {employes.map(e => (
                    <View key={e.id} style={styles.card}>
                        <View style={styles.cardTop}>
                            <Text style={styles.cardName}>{e.prenom} {e.nom}</Text>
                            <View style={[styles.badge, e.statut === 'actif' ? styles.badgeActive : styles.badgeSuspend]}>
                                <Text style={styles.badgeText}>{e.statut}</Text>
                            </View>
                        </View>
                        {e.metier ? <Text style={styles.cardSub}>{e.metier}</Text> : null}
                        <Text style={styles.cardSub}>{e.email} · {e.telephone}</Text>
                        <Text style={styles.cardCourses}>{e.nb_courses} course{Number(e.nb_courses) > 1 ? 's' : ''}</Text>
                    </View>
                ))}
            </ScrollView>
            <BottomNav role="ambassadeur" active="equipe" navigation={navigation} />

            {/* Modal ajout employé */}
            <Modal visible={showModal} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modal}>
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
                                    placeholderTextColor={Colors.nocturne.textSecondary}
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
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.nocturne.background },
    scroll: { padding: 20, paddingBottom: 100 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    title: { fontSize: 24, fontWeight: '700', color: Colors.brand.gold },
    addBtn: { backgroundColor: Colors.brand.gold, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
    addBtnText: { color: '#101018', fontWeight: '700', fontSize: 13 },
    sub: { fontSize: 13, color: Colors.nocturne.textSecondary, marginBottom: 20 },
    card: { backgroundColor: Colors.nocturne.card, borderRadius: 12, padding: 16, marginBottom: 12 },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    cardName: { fontSize: 15, fontWeight: '600', color: Colors.nocturne.textPrimary },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    badgeActive: { backgroundColor: Colors.brand.success + '30' },
    badgeSuspend: { backgroundColor: Colors.brand.error + '30' },
    badgeText: { fontSize: 11, fontWeight: '600', color: Colors.nocturne.textPrimary },
    cardSub: { fontSize: 12, color: Colors.nocturne.textSecondary, marginTop: 2 },
    cardCourses: { fontSize: 13, color: Colors.brand.info, marginTop: 6, fontWeight: '600' },
    empty: { textAlign: 'center', color: Colors.nocturne.textSecondary, marginTop: 40 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    modal: { backgroundColor: Colors.nocturne.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
    modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.brand.gold, marginBottom: 20, textAlign: 'center' },
    field: { marginBottom: 12 },
    fieldLabel: { fontSize: 12, color: Colors.nocturne.textSecondary, marginBottom: 4 },
    input: {
        backgroundColor: '#1E1E30', borderRadius: 8, padding: 12,
        color: Colors.nocturne.textPrimary, fontSize: 14,
    },
    modalBtns: { flexDirection: 'row', gap: 12, marginTop: 12 },
    cancelBtn: { flex: 1, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: Colors.nocturne.textSecondary, alignItems: 'center' },
    cancelText: { color: Colors.nocturne.textSecondary, fontWeight: '600' },
    saveBtn: { flex: 1, padding: 14, borderRadius: 8, backgroundColor: Colors.brand.gold, alignItems: 'center' },
    saveText: { color: '#101018', fontWeight: '700' },
});
