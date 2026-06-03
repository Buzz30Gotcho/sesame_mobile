import React, { useEffect, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    ActivityIndicator, Share, SafeAreaView, StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getAmbassadorProfile, getFilleuls } from '../services/api';
import { Colors, Typography } from '../theme';
import type { AmbassadorProfile, Filleul, RootStackParamList } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

const NIVEAU_COLORS: Record<string, string> = {
    starter: Colors.nocturne.textSecondary,
    pro: Colors.brand.info,
    elite: Colors.brand.gold,
    black: '#FFFFFF',
};

export default function AmbassadorParrainageScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AmbassadorParrainage'>>();
    const { ambassadorId } = useAuth();
    const [profile, setProfile] = useState<AmbassadorProfile | null>(null);
    const [filleuls, setFilleuls] = useState<Filleul[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function load() {
            if (!ambassadorId) return;
            try {
                const [profileRes, filleulsRes] = await Promise.all([
                    getAmbassadorProfile(ambassadorId),
                    getFilleuls(ambassadorId),
                ]);
                setProfile(profileRes.data);
                setFilleuls(filleulsRes.data);
            } catch {
                setError('Impossible de charger les données de parrainage.');
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [ambassadorId]);

    const handleShare = async () => {
        if (!profile?.code_parrainage) return;
        await Share.share({
            message: `Rejoins SÉSAME avec mon code parrain : ${profile.code_parrainage}\n\nBénéficiez de véhicules premium et de récompenses exclusives.`,
        });
    };

    const bonusParrainage = filleuls.length * 50;

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={Colors.brand.gold} />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Text style={styles.backText}>←</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>PARRAINAGE</Text>
                <View style={{ width: 36 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {error ? (
                    <Text style={styles.errorText}>{error}</Text>
                ) : (
                    <>
                        {/* Code parrainage */}
                        <View style={styles.codeCard}>
                            <Text style={styles.codeLabel}>VOTRE CODE PARRAIN</Text>
                            <Text style={styles.codeValue}>{profile?.code_parrainage || '—'}</Text>
                            <TouchableOpacity
                                style={styles.shareBtn}
                                onPress={handleShare}
                                disabled={!profile?.code_parrainage}
                            >
                                <Text style={styles.shareBtnText}>Partager mon code</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Statistiques parrainage */}
                        <View style={styles.statsRow}>
                            <View style={styles.statCard}>
                                <Text style={styles.statValue}>{filleuls.length}</Text>
                                <Text style={styles.statLabel}>Filleuls actifs</Text>
                            </View>
                            <View style={styles.statCard}>
                                <Text style={[styles.statValue, { color: Colors.brand.gold }]}>
                                    +{bonusParrainage}
                                </Text>
                                <Text style={styles.statLabel}>Points gagnés</Text>
                            </View>
                        </View>

                        {/* Info bonus */}
                        <View style={styles.infoBox}>
                            <Text style={styles.infoText}>
                                Vous gagnez <Text style={styles.infoHighlight}>50 points</Text> pour chaque filleul qui s'inscrit avec votre code et effectue sa première course.
                            </Text>
                        </View>

                        {/* Liste filleuls */}
                        <Text style={styles.sectionTitle}>MES FILLEULS ({filleuls.length})</Text>

                        {filleuls.length === 0 ? (
                            <View style={styles.emptyCard}>
                                <Text style={styles.emptyEmoji}>🤝</Text>
                                <Text style={styles.emptyTitle}>Aucun filleul pour l'instant</Text>
                                <Text style={styles.emptyText}>
                                    Partagez votre code pour commencer à parrainer.
                                </Text>
                            </View>
                        ) : (
                            filleuls.map((filleul, index) => (
                                <View key={index} style={styles.filleulRow}>
                                    <View style={styles.filleulAvatar}>
                                        <Text style={styles.filleulAvatarText}>
                                            {filleul.prenom[0]}{filleul.nom[0]}
                                        </Text>
                                    </View>
                                    <View style={styles.filleulInfo}>
                                        <Text style={styles.filleulName}>{filleul.prenom} {filleul.nom}</Text>
                                        <Text style={styles.filleulDate}>
                                            Inscrit le {new Date(filleul.created_at).toLocaleDateString('fr-FR')}
                                        </Text>
                                    </View>
                                    <View style={styles.filleulRight}>
                                        <Text style={[styles.filleulNiveau, { color: NIVEAU_COLORS[filleul.niveau] || '#FFFFFF' }]}>
                                            {filleul.niveau.toUpperCase()}
                                        </Text>
                                        <Text style={styles.filleulPoints}>{filleul.points_solde} pts</Text>
                                    </View>
                                </View>
                            ))
                        )}
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: Colors.nocturne.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.nocturne.background },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    backBtn: { width: 36, height: 36, justifyContent: 'center' },
    backText: { color: Colors.brand.gold, fontSize: 22, fontWeight: Typography.weights.bold as any },
    headerTitle: {
        color: '#FFFFFF',
        fontSize: Typography.sizes.sub,
        fontWeight: Typography.weights.black as any,
        letterSpacing: 2,
    },
    scrollContent: { padding: 20, paddingBottom: 60 },
    errorText: { color: Colors.brand.error, textAlign: 'center', marginTop: 40 },
    codeCard: {
        backgroundColor: Colors.nocturne.card,
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        marginBottom: 20,
        borderWidth: 1,
        borderColor: 'rgba(201, 168, 76, 0.2)',
    },
    codeLabel: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.black as any,
        letterSpacing: 2,
        marginBottom: 12,
    },
    codeValue: {
        color: Colors.brand.gold,
        fontSize: 32,
        fontWeight: Typography.weights.black as any,
        letterSpacing: 4,
        fontFamily: 'monospace',
        marginBottom: 20,
    },
    shareBtn: {
        backgroundColor: Colors.brand.gold,
        borderRadius: 14,
        paddingHorizontal: 24,
        paddingVertical: 14,
    },
    shareBtnText: {
        color: '#09090F',
        fontWeight: Typography.weights.black as any,
        fontSize: Typography.sizes.sub,
    },
    statsRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    statCard: {
        flex: 1,
        backgroundColor: Colors.nocturne.card,
        borderRadius: 18,
        padding: 16,
        alignItems: 'center',
    },
    statValue: {
        color: Colors.brand.success,
        fontSize: Typography.sizes.title,
        fontWeight: Typography.weights.black as any,
        marginBottom: 4,
    },
    statLabel: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.tiny,
    },
    infoBox: {
        backgroundColor: 'rgba(201, 168, 76, 0.08)',
        borderRadius: 14,
        padding: 14,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: 'rgba(201, 168, 76, 0.15)',
    },
    infoText: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.small,
        lineHeight: 18,
    },
    infoHighlight: {
        color: Colors.brand.gold,
        fontWeight: Typography.weights.bold as any,
    },
    sectionTitle: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.black as any,
        letterSpacing: 1,
        marginBottom: 12,
    },
    emptyCard: {
        backgroundColor: Colors.nocturne.card,
        borderRadius: 18,
        padding: 32,
        alignItems: 'center',
    },
    emptyEmoji: { fontSize: 40, marginBottom: 12 },
    emptyTitle: {
        color: '#FFFFFF',
        fontSize: Typography.sizes.sub,
        fontWeight: Typography.weights.bold as any,
        marginBottom: 8,
    },
    emptyText: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.small,
        textAlign: 'center',
    },
    filleulRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.nocturne.card,
        borderRadius: 16,
        padding: 14,
        marginBottom: 10,
        gap: 12,
    },
    filleulAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(201, 168, 76, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    filleulAvatarText: {
        color: Colors.brand.gold,
        fontWeight: Typography.weights.black as any,
        fontSize: Typography.sizes.sub,
    },
    filleulInfo: { flex: 1 },
    filleulName: {
        color: '#FFFFFF',
        fontSize: Typography.sizes.sub,
        fontWeight: Typography.weights.semiBold as any,
    },
    filleulDate: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.tiny,
        marginTop: 2,
    },
    filleulRight: { alignItems: 'flex-end' },
    filleulNiveau: {
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.black as any,
        letterSpacing: 1,
    },
    filleulPoints: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.tiny,
        marginTop: 2,
    },
});
