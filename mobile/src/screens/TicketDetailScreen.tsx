import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
    KeyboardAvoidingView, Platform, StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getTicketMessages, sendTicketMessage } from '../services/api';
import { Colors, Typography } from '../theme';
import type { RootStackParamList, TicketMessage } from '../types';

type DetailRoute = RouteProp<RootStackParamList, 'TicketDetail'>;

export default function TicketDetailScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'TicketDetail'>>();
    const route = useRoute<DetailRoute>();
    const { ticketId, titre } = route.params;

    const [messages, setMessages] = useState<TicketMessage[]>([]);
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const listRef = useRef<FlatList>(null);

    const load = useCallback(async () => {
        try {
            const res = await getTicketMessages(ticketId);
            setMessages(res.data);
        } catch {
            // silencieux
        } finally {
            setLoading(false);
        }
    }, [ticketId]);

    useEffect(() => {
        load();
        const interval = setInterval(load, 8000); // poll réponses SESAME
        return () => clearInterval(interval);
    }, [load]);

    useEffect(() => {
        if (messages.length > 0) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }, [messages.length]);

    const handleSend = async () => {
        const content = text.trim();
        if (!content || sending) return;
        setSending(true);
        try {
            await sendTicketMessage(ticketId, content);
            setText('');
            await load();
        } catch {
            // silencieux
        } finally {
            setSending(false);
        }
    };

    const renderMessage = ({ item }: { item: TicketMessage }) => {
        const isAdmin = item.role === 'admin';
        return (
            <View style={[styles.bubble, isAdmin ? styles.bubbleOther : styles.bubbleMine]}>
                {isAdmin && <Text style={styles.bubbleSender}>SESAME</Text>}
                <Text style={[styles.bubbleText, isAdmin ? styles.bubbleTextOther : styles.bubbleTextMine]}>
                    {item.contenu}
                </Text>
                <Text style={[styles.bubbleTime, isAdmin && { color: 'rgba(255,255,255,0.4)', textAlign: 'left' }]}>
                    {new Date(item.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Text style={styles.backText}>←</Text>
                </TouchableOpacity>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>SUPPORT SESAME</Text>
                    <Text style={styles.headerSub}>{titre ?? 'Votre ticket'} · réponse sous 24h</Text>
                </View>
                <View style={styles.onlineDot} />
            </View>

            {loading ? (
                <View style={styles.center}><ActivityIndicator size="large" color={Colors.brand.gold} /></View>
            ) : (
                <KeyboardAvoidingView
                    style={styles.flex}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
                >
                    <FlatList
                        ref={listRef}
                        data={messages}
                        keyExtractor={item => item.id}
                        renderItem={renderMessage}
                        contentContainerStyle={styles.listContent}
                        ListEmptyComponent={<View style={styles.emptyState}><Text style={styles.emptyText}>Aucun message.</Text></View>}
                        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
                    />
                    <View style={styles.inputRow}>
                        <TextInput
                            style={styles.input}
                            value={text}
                            onChangeText={setText}
                            placeholder="Votre message..."
                            placeholderTextColor={Colors.nocturne.textSecondary}
                            multiline
                        />
                        <TouchableOpacity
                            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
                            onPress={handleSend}
                            disabled={!text.trim() || sending}
                        >
                            {sending ? <ActivityIndicator size="small" color="#09090F" /> : <Text style={styles.sendBtnText}>ENVOYER</Text>}
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: Colors.nocturne.background },
    flex: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', backgroundColor: Colors.nocturne.card,
    },
    backBtn: { paddingRight: 12 },
    backText: { color: Colors.brand.gold, fontSize: 22, fontWeight: Typography.weights.bold as any },
    headerCenter: { flex: 1 },
    headerTitle: { color: '#FFFFFF', fontSize: Typography.sizes.sub, fontWeight: Typography.weights.black as any, letterSpacing: 1 },
    headerSub: { color: Colors.nocturne.textSecondary, fontSize: Typography.sizes.tiny, marginTop: 2 },
    onlineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.brand.success },
    listContent: { padding: 16, paddingBottom: 8, flexGrow: 1, justifyContent: 'flex-end' },
    emptyState: { alignItems: 'center', paddingTop: 60 },
    emptyText: { color: Colors.nocturne.textSecondary, fontSize: Typography.sizes.sub },
    bubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10 },
    bubbleMine: { alignSelf: 'flex-end', backgroundColor: Colors.brand.gold, borderBottomRightRadius: 4 },
    bubbleOther: { alignSelf: 'flex-start', backgroundColor: Colors.nocturne.card, borderBottomLeftRadius: 4 },
    bubbleSender: { color: Colors.nocturne.textSecondary, fontSize: 9, fontWeight: Typography.weights.black as any, letterSpacing: 1, marginBottom: 4 },
    bubbleText: { fontSize: Typography.sizes.sub, lineHeight: 20 },
    bubbleTextMine: { color: '#09090F', fontWeight: Typography.weights.semiBold as any },
    bubbleTextOther: { color: Colors.nocturne.textPrimary },
    bubbleTime: { fontSize: 9, marginTop: 4, textAlign: 'right', color: 'rgba(0,0,0,0.4)' },
    inputRow: {
        flexDirection: 'row', alignItems: 'flex-end', padding: 12,
        borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', backgroundColor: Colors.nocturne.card, gap: 10,
    },
    input: {
        flex: 1, backgroundColor: Colors.nocturne.background, borderRadius: 14,
        paddingHorizontal: 14, paddingVertical: 10, color: Colors.nocturne.textPrimary, fontSize: Typography.sizes.sub, maxHeight: 100,
    },
    sendBtn: { backgroundColor: Colors.brand.gold, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center', alignItems: 'center', minWidth: 80 },
    sendBtnDisabled: { opacity: 0.4 },
    sendBtnText: { color: '#09090F', fontWeight: Typography.weights.black as any, fontSize: Typography.sizes.tiny },
});
