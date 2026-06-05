import React, { useEffect, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
    KeyboardAvoidingView, Platform, StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { getChatMessages, sendChatMessage, getWsUrl } from '../services/api';
import { Colors, Typography } from '../theme';
import type { RootStackParamList, ChatMessage } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type ChatRoute = RouteProp<RootStackParamList, 'Chat'>;

export default function ChatScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Chat'>>();
    const route = useRoute<ChatRoute>();
    const { courseId, senderRole, senderId, courseRef } = route.params;

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const listRef = useRef<FlatList>(null);
    const wsRef = useRef<WebSocket | null>(null);

    async function loadMessages() {
        try {
            const res = await getChatMessages(courseId);
            setMessages(res.data);
        } catch {}
        finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadMessages();

        // Connexion WebSocket pour les messages temps réel
        const ws = new WebSocket(getWsUrl(courseId));
        wsRef.current = ws;

        ws.onmessage = (event) => {
            try {
                const msg: ChatMessage = JSON.parse(event.data);
                setMessages(prev => {
                    if (prev.find(m => m.id === msg.id)) return prev;
                    return [...prev, msg];
                });
            } catch {}
        };

        ws.onerror = () => {
            // Fallback polling si WebSocket échoue
            const interval = setInterval(loadMessages, 5000);
            ws.onclose = () => clearInterval(interval);
        };

        return () => {
            ws.close();
            wsRef.current = null;
        };
    }, [courseId]);

    useEffect(() => {
        if (messages.length > 0) {
            setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
        }
    }, [messages.length]);

    const handleSend = async () => {
        const content = text.trim();
        if (!content || sending) return;
        setSending(true);
        try {
            await sendChatMessage(courseId, {
                expediteur_type: senderRole,
                expediteur_id: senderId,
                contenu: content,
            });
            setText('');
            await loadMessages();
        } catch {
            // handle silently
        } finally {
            setSending(false);
        }
    };

    const renderMessage = ({ item }: { item: ChatMessage }) => {
        const isMine = item.expediteur_id === senderId;
        return (
            <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
                {!isMine && (
                    <Text style={styles.bubbleSender}>{item.expediteur_type.toUpperCase()}</Text>
                )}
                <Text style={[styles.bubbleText, isMine ? styles.bubbleTextMine : styles.bubbleTextOther]}>
                    {item.contenu}
                </Text>
                <Text style={styles.bubbleTime}>
                    {new Date(item.envoye_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
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
                    <Text style={styles.headerTitle}>CHAT SESAME</Text>
                    <Text style={styles.headerSub}>{courseRef ? `Course ${courseRef}` : 'Assistance'}</Text>
                </View>
                <View style={styles.onlineDot} />
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={Colors.brand.gold} />
                </View>
            ) : (
                <KeyboardAvoidingView
                    style={styles.flex}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
                >
                    <FlatList
                        ref={listRef}
                        data={messages}
                        keyExtractor={(item) => item.id}
                        renderItem={renderMessage}
                        contentContainerStyle={styles.listContent}
                        ListEmptyComponent={
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyText}>Aucun message — commencez la conversation.</Text>
                            </View>
                        }
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
                            returnKeyType="send"
                            onSubmitEditing={handleSend}
                        />
                        <TouchableOpacity
                            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
                            onPress={handleSend}
                            disabled={!text.trim() || sending}
                        >
                            {sending
                                ? <ActivityIndicator size="small" color="#09090F" />
                                : <Text style={styles.sendBtnText}>ENVOYER</Text>
                            }
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
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
        backgroundColor: Colors.nocturne.card,
    },
    backBtn: { paddingRight: 12 },
    backText: { color: Colors.brand.gold, fontSize: 22, fontWeight: Typography.weights.bold as any },
    headerCenter: { flex: 1 },
    headerTitle: {
        color: '#FFFFFF',
        fontSize: Typography.sizes.sub,
        fontWeight: Typography.weights.black as any,
        letterSpacing: 1,
    },
    headerSub: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.tiny,
        marginTop: 2,
    },
    onlineDot: {
        width: 10, height: 10, borderRadius: 5,
        backgroundColor: Colors.brand.success,
    },
    listContent: {
        padding: 16,
        paddingBottom: 8,
        flexGrow: 1,
        justifyContent: 'flex-end',
    },
    emptyState: { alignItems: 'center', paddingTop: 60 },
    emptyText: { color: Colors.nocturne.textSecondary, fontSize: Typography.sizes.sub },
    bubble: {
        maxWidth: '78%',
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 10,
        marginBottom: 10,
    },
    bubbleMine: {
        alignSelf: 'flex-end',
        backgroundColor: Colors.brand.gold,
        borderBottomRightRadius: 4,
    },
    bubbleOther: {
        alignSelf: 'flex-start',
        backgroundColor: Colors.nocturne.card,
        borderBottomLeftRadius: 4,
    },
    bubbleSender: {
        color: Colors.nocturne.textSecondary,
        fontSize: 9,
        fontWeight: Typography.weights.black as any,
        letterSpacing: 1,
        marginBottom: 4,
    },
    bubbleText: { fontSize: Typography.sizes.sub, lineHeight: 20 },
    bubbleTextMine: { color: '#09090F', fontWeight: Typography.weights.semiBold as any },
    bubbleTextOther: { color: Colors.nocturne.textPrimary },
    bubbleTime: {
        fontSize: 9,
        marginTop: 4,
        textAlign: 'right',
        color: 'rgba(0,0,0,0.4)',
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        padding: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
        backgroundColor: Colors.nocturne.card,
        gap: 10,
    },
    input: {
        flex: 1,
        backgroundColor: Colors.nocturne.background,
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 10,
        color: Colors.nocturne.textPrimary,
        fontSize: Typography.sizes.sub,
        maxHeight: 100,
    },
    sendBtn: {
        backgroundColor: Colors.brand.gold,
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 12,
        justifyContent: 'center',
        alignItems: 'center',
        minWidth: 80,
    },
    sendBtnDisabled: { opacity: 0.4 },
    sendBtnText: {
        color: '#09090F',
        fontWeight: Typography.weights.black as any,
        fontSize: Typography.sizes.tiny,
    },
});
