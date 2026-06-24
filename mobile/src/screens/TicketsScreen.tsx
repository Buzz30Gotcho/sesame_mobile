import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar,
    ActivityIndicator, Modal, TextInput, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getMyTickets, createTicket } from '../services/api';
import { Colors, Typography } from '../theme';
import type { RootStackParamList, Ticket, TicketCategorie, TicketStatut } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Tickets'>;

const CATEGORIES: { key: TicketCategorie; label: string }[] = [
    { key: 'probleme_course', label: 'Problème course' },
    { key: 'paiement_points', label: 'Paiement / Points' },
    { key: 'document_refuse', label: 'Document refusé' },
    { key: 'question_compte', label: 'Question compte' },
    { key: 'autre', label: 'Autre' },
];

const CATEGORIE_LABEL: Record<TicketCategorie, string> = Object.fromEntries(
    CATEGORIES.map(c => [c.key, c.label])
) as Record<TicketCategorie, string>;

const STATUT_LABEL: Record<TicketStatut, string> = {
    ouvert: 'Ouvert',
    en_cours: 'En cours',
    resolu: 'Résolu',
};
const STATUT_COLOR: Record<TicketStatut, string> = {
    ouvert: '#FF6464',
    en_cours: '#FF9A3C',
    resolu: Colors.brand.success,
};

export default function TicketsScreen() {
    const navigation = useNavigation<Nav>();
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [categorie, setCategorie] = useState<TicketCategorie>('probleme_course');
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await getMyTickets();
            setTickets(res.data);
        } catch {
            // silencieux
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const handleCreate = async () => {
        if (!message.trim()) { Alert.alert('Message requis', 'Décrivez votre problème.'); return; }
        setSubmitting(true);
        try {
            const res = await createTicket({ categorie, message: message.trim() });
            setModalOpen(false);
            setMessage('');
            setCategorie('probleme_course');
            await load();
            navigation.navigate('TicketDetail', { ticketId: res.data.id, titre: CATEGORIE_LABEL[categorie] });
        } catch {
            Alert.alert('Erreur', "Impossible de créer le ticket. Réessayez.");
        } finally {
            setSubmitting(false);
        }
    };

    const renderTicket = ({ item }: { item: Ticket }) => (
        <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('TicketDetail', { ticketId: item.id, titre: CATEGORIE_LABEL[item.categorie] })}
        >
            <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{CATEGORIE_LABEL[item.categorie] ?? item.categorie}</Text>
                <View style={[styles.badge, { backgroundColor: STATUT_COLOR[item.statut] }]}>
                    <Text style={styles.badgeText}>{STATUT_LABEL[item.statut]}</Text>
                </View>
            </View>
            {item.dernier_message ? <Text style={styles.cardMsg} numberOfLines={1}>{item.dernier_message}</Text> : null}
            <Text style={styles.cardDate}>
                {new Date(item.updated_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </Text>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Text style={styles.backText}>←</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>SUPPORT</Text>
                <View style={{ width: 30 }} />
            </View>

            {loading ? (
                <View style={styles.center}><ActivityIndicator size="large" color={Colors.brand.gold} /></View>
            ) : (
                <FlatList
                    data={tickets}
                    keyExtractor={item => item.id}
                    renderItem={renderTicket}
                    contentContainerStyle={styles.list}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Text style={styles.emptyEmoji}>🎫</Text>
                            <Text style={styles.emptyText}>Aucun ticket pour le moment.</Text>
                            <Text style={styles.emptySub}>Un souci ? Ouvrez un ticket, on vous répond sous 24h.</Text>
                        </View>
                    }
                />
            )}

            <TouchableOpacity style={styles.fab} onPress={() => setModalOpen(true)}>
                <Text style={styles.fabText}>+ Nouveau ticket</Text>
            </TouchableOpacity>

            <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
                <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Nouveau ticket</Text>
                        <Text style={styles.label}>Catégorie</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                            {CATEGORIES.map(c => (
                                <TouchableOpacity
                                    key={c.key}
                                    onPress={() => setCategorie(c.key)}
                                    style={[styles.chip, categorie === c.key && styles.chipActive]}
                                >
                                    <Text style={[styles.chipText, categorie === c.key && styles.chipTextActive]}>{c.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <Text style={styles.label}>Votre message</Text>
                        <TextInput
                            style={styles.textarea}
                            value={message}
                            onChangeText={setMessage}
                            placeholder="Décrivez votre problème…"
                            placeholderTextColor={Colors.nocturne.textSecondary}
                            multiline
                        />
                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.btnGhost} onPress={() => setModalOpen(false)}>
                                <Text style={styles.btnGhostText}>Annuler</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.btnGold, submitting && { opacity: 0.5 }]} onPress={handleCreate} disabled={submitting}>
                                {submitting ? <ActivityIndicator size="small" color="#09090F" /> : <Text style={styles.btnGoldText}>Envoyer</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: Colors.nocturne.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', backgroundColor: Colors.nocturne.card,
    },
    backBtn: { width: 30 },
    backText: { color: Colors.brand.gold, fontSize: 22, fontWeight: Typography.weights.bold as any },
    headerTitle: { color: '#FFFFFF', fontSize: Typography.sizes.sub, fontWeight: Typography.weights.black as any, letterSpacing: 1 },
    list: { padding: 16, paddingBottom: 100, flexGrow: 1 },
    card: { backgroundColor: Colors.nocturne.card, borderRadius: 16, padding: 16, marginBottom: 12 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardTitle: { color: Colors.nocturne.textPrimary, fontSize: Typography.sizes.sub, fontWeight: Typography.weights.semiBold as any, flex: 1 },
    badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
    badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: Typography.weights.black as any },
    cardMsg: { color: Colors.nocturne.textSecondary, fontSize: Typography.sizes.tiny, marginTop: 6 },
    cardDate: { color: Colors.nocturne.textSecondary, fontSize: 10, marginTop: 6 },
    empty: { alignItems: 'center', paddingTop: 80 },
    emptyEmoji: { fontSize: 40, marginBottom: 12 },
    emptyText: { color: Colors.nocturne.textPrimary, fontSize: Typography.sizes.sub, fontWeight: Typography.weights.semiBold as any },
    emptySub: { color: Colors.nocturne.textSecondary, fontSize: Typography.sizes.tiny, marginTop: 6, textAlign: 'center', paddingHorizontal: 30 },
    fab: {
        position: 'absolute', bottom: 24, left: 16, right: 16,
        backgroundColor: Colors.brand.gold, borderRadius: 16, paddingVertical: 16, alignItems: 'center',
    },
    fabText: { color: '#09090F', fontWeight: Typography.weights.black as any, fontSize: Typography.sizes.sub },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: Colors.nocturne.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
    modalTitle: { color: '#FFFFFF', fontSize: Typography.sizes.title, fontWeight: Typography.weights.black as any, marginBottom: 18 },
    label: { color: Colors.nocturne.textSecondary, fontSize: Typography.sizes.tiny, fontWeight: Typography.weights.semiBold as any, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
    chip: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, backgroundColor: Colors.nocturne.background, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    chipActive: { backgroundColor: Colors.brand.gold, borderColor: Colors.brand.gold },
    chipText: { color: Colors.nocturne.textSecondary, fontSize: Typography.sizes.tiny, fontWeight: Typography.weights.semiBold as any },
    chipTextActive: { color: '#09090F' },
    textarea: {
        backgroundColor: Colors.nocturne.background, borderRadius: 14, padding: 14, minHeight: 100,
        color: Colors.nocturne.textPrimary, fontSize: Typography.sizes.sub, textAlignVertical: 'top',
    },
    modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
    btnGhost: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
    btnGhostText: { color: Colors.nocturne.textSecondary, fontWeight: Typography.weights.semiBold as any },
    btnGold: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: Colors.brand.gold },
    btnGoldText: { color: '#09090F', fontWeight: Typography.weights.black as any },
});
