import React, { useEffect, useState, useMemo } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    ActivityIndicator, Share, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLang } from '../context/LanguageContext';
import { getAmbassadorProfile, getFilleuls } from '../services/api';
import { Colors, Typography } from '../theme';
import type { AmbassadorProfile, Filleul, RootStackParamList } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

const NIVEAU_COLORS_BRAND: Record<string, string> = {
    pro: Colors.brand.info,
    elite: Colors.brand.gold,
};

// Calcul des paliers de parrainage pour un filleul (max 50 pts)
function calculerBonusFilleul(filleul: Filleul): { total: number; paliers: { label: string; pts: number; atteint: boolean }[] } {
    const nb_courses = Number(filleul.nb_courses || 0);
    const niveau = filleul.niveau || 'starter';

    const p1 = nb_courses >= 5;
    const p2 = ['pro', 'elite', 'black'].includes(niveau);
    const p3 = ['elite', 'black'].includes(niveau);
    const p4 = niveau === 'black';

    const paliers = [
        { label: 'P1 : 5 courses effectuées', pts: 5, atteint: p1 },
        { label: 'P2 : Niveau Pro ou supérieur', pts: 10, atteint: p2 },
        { label: 'P3 : Niveau Élite ou supérieur', pts: 15, atteint: p3 },
        { label: 'P4 : Niveau Black', pts: 20, atteint: p4 },
    ];

    const total = Math.min(
        (p1 ? 5 : 0) + (p2 ? 10 : 0) + (p3 ? 15 : 0) + (p4 ? 20 : 0),
        50
    );

    return { total, paliers };
}

export default function AmbassadorParrainageScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AmbassadorParrainage'>>();
    const { ambassadorId } = useAuth();
    const { colors } = useTheme();
    const { t, locale } = useLang();
    const styles = useMemo(() => makeStyles(colors), [colors]);
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
                setError(t('impossible_parrainage'));
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [ambassadorId]);

    const handleShare = async () => {
        if (!profile?.code_parrainage) return;
        await Share.share({
            message: t('rejoins_sesame').replace('{code}', profile.code_parrainage),
        });
    };

    // Calcul total des bonus de parrainage (paliers cumulatifs)
    const bonusParrainage = filleuls.reduce((acc, f) => acc + calculerBonusFilleul(f).total, 0);

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={Colors.brand.gold} />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle={colors.background === '#101018' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Text style={styles.backText}>←</Text>
                </TouchableOpacity>
                <Text style={styles.title}>{t('parrainage_titre')}</Text>
                <View style={{ width: 36 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {error ? (
                    <Text style={styles.errorText}>{error}</Text>
                ) : (
                    <>
                        {/* Code parrainage */}
                        <View style={styles.codeCard}>
                            <Text style={styles.codeLabel}>{t('votre_code_parrain')}</Text>
                            <Text style={styles.codeValue}>{profile?.code_parrainage || '—'}</Text>
                            <TouchableOpacity
                                style={styles.shareBtn}
                                onPress={handleShare}
                                disabled={!profile?.code_parrainage}
                            >
                                <Text style={styles.shareBtnText}>{t('partager_code')}</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Statistiques parrainage */}
                        <View style={styles.statsRow}>
                            <View style={styles.statCard}>
                                <Text style={styles.statValue}>{filleuls.length}</Text>
                                <Text style={styles.statLabel}>{t('filleuls_actifs')}</Text>
                            </View>
                            <View style={styles.statCard}>
                                <Text style={[styles.statValue, { color: Colors.brand.gold }]}>
                                    +{bonusParrainage}
                                </Text>
                                <Text style={styles.statLabel}>{t('points_gagnes')}</Text>
                            </View>
                        </View>

                        {/* Info bonus — 4 paliers */}
                        <View style={styles.infoBox}>
                            <Text style={styles.infoTitle}>{t('systeme_paliers')}</Text>
                            <View style={styles.palierRow}>
                                <Text style={styles.palierLabel}>P1 — 5 courses effectuées</Text>
                                <Text style={styles.palierPts}>+5 pts</Text>
                            </View>
                            <View style={styles.palierRow}>
                                <Text style={styles.palierLabel}>P2 — Niveau Pro ou supérieur</Text>
                                <Text style={styles.palierPts}>+10 pts</Text>
                            </View>
                            <View style={styles.palierRow}>
                                <Text style={styles.palierLabel}>P3 — Niveau Élite ou supérieur</Text>
                                <Text style={styles.palierPts}>+15 pts</Text>
                            </View>
                            <View style={styles.palierRow}>
                                <Text style={styles.palierLabel}>P4 — Niveau Black</Text>
                                <Text style={styles.palierPts}>+20 pts</Text>
                            </View>
                            <Text style={styles.infoSub}>{t('paliers_cumulatifs')}</Text>
                        </View>

                        {/* Liste filleuls */}
                        <Text style={styles.sectionTitle}>{t('mes_filleuls')} ({filleuls.length})</Text>

                        {filleuls.length === 0 ? (
                            <View style={styles.emptyCard}>
                                <Text style={styles.emptyEmoji}>🤝</Text>
                                <Text style={styles.emptyTitle}>{t('aucun_filleul')}</Text>
                                <Text style={styles.emptyText}>{t('partager_pour_parrainer')}</Text>
                            </View>
                        ) : (
                            filleuls.map((filleul, index) => {
                                const { total, paliers } = calculerBonusFilleul(filleul);
                                return (
                                    <View key={index} style={styles.filleulCard}>
                                        <View style={styles.filleulTopRow}>
                                            <View style={styles.filleulAvatar}>
                                                <Text style={styles.filleulAvatarText}>
                                                    {filleul.prenom[0]}{filleul.nom[0]}
                                                </Text>
                                            </View>
                                            <View style={styles.filleulInfo}>
                                                <Text style={styles.filleulName}>{filleul.prenom} {filleul.nom}</Text>
                                                <Text style={styles.filleulDate}>
                                                    {t('inscrit_le')} {new Date(filleul.created_at).toLocaleDateString(locale)}
                                                </Text>
                                            </View>
                                            <View style={styles.filleulRight}>
                                                <Text style={[styles.filleulNiveau, { color: NIVEAU_COLORS_BRAND[filleul.niveau] || (filleul.niveau === 'black' ? colors.textPrimary : colors.textSecondary) }]}>
                                                    {filleul.niveau.toUpperCase()}
                                                </Text>
                                                <Text style={styles.filleulBonus}>+{total} pts</Text>
                                            </View>
                                        </View>
                                        {/* Paliers du filleul */}
                                        <View style={styles.paliersGrid}>
                                            {paliers.map((p, pi) => (
                                                <View key={pi} style={[styles.palierBadge, p.atteint ? styles.palierBadgeOn : styles.palierBadgeOff]}>
                                                    <Text style={[styles.palierBadgeText, p.atteint ? styles.palierBadgeTextOn : styles.palierBadgeTextOff]}>
                                                        P{pi + 1} {p.atteint ? '✓' : '○'}
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>
                                        <Text style={styles.filleulCoursesText}>
                                            {Number(filleul.nb_courses)} {Number(filleul.nb_courses) !== 1 ? t('courses_effectuees_p') : t('courses_effectuees_s')}
                                        </Text>
                                    </View>
                                );
                            })
                        )}
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

function makeStyles(colors: typeof Colors.nocturne) {
    return StyleSheet.create({
        safeArea: { flex: 1, backgroundColor: colors.background },
        center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
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
        title: {
            color: Colors.brand.gold,
            fontSize: Typography.sizes.title,
            fontWeight: Typography.weights.black as any,
        },
        scrollContent: { padding: 20, paddingBottom: 60, flexGrow: 1 },
        errorText: { color: Colors.brand.error, textAlign: 'center', marginTop: 40 },
        codeCard: {
            backgroundColor: colors.card,
            borderRadius: 24,
            padding: 24,
            alignItems: 'center',
            marginBottom: 20,
            borderWidth: 1,
            borderColor: 'rgba(201, 168, 76, 0.2)',
        },
        codeLabel: {
            color: colors.textSecondary,
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
            backgroundColor: colors.card,
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
            color: colors.textSecondary,
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
        infoTitle: {
            color: Colors.brand.gold,
            fontSize: Typography.sizes.sub,
            fontWeight: Typography.weights.black as any,
            letterSpacing: 1,
            marginBottom: 10,
        },
        palierRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginBottom: 8,
        },
        palierLabel: {
            color: colors.textPrimary,
            fontSize: Typography.sizes.body,
            flex: 1,
        },
        palierPts: {
            color: Colors.brand.gold,
            fontSize: Typography.sizes.body,
            fontWeight: Typography.weights.bold as any,
        },
        infoSub: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.sub,
            marginTop: 8,
            fontStyle: 'italic',
        },
        sectionTitle: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.sub,
            fontWeight: Typography.weights.black as any,
            letterSpacing: 1,
            marginBottom: 12,
        },
        emptyCard: {
            backgroundColor: colors.card,
            borderRadius: 18,
            padding: 32,
            alignItems: 'center',
        },
        emptyEmoji: { fontSize: 40, marginBottom: 12 },
        emptyTitle: {
            color: colors.textPrimary,
            fontSize: Typography.sizes.sub,
            fontWeight: Typography.weights.bold as any,
            marginBottom: 8,
        },
        emptyText: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.small,
            textAlign: 'center',
        },
        filleulCard: {
            backgroundColor: colors.card,
            borderRadius: 16,
            padding: 14,
            marginBottom: 10,
        },
        filleulTopRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            marginBottom: 10,
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
            color: colors.textPrimary,
            fontSize: Typography.sizes.sub,
            fontWeight: Typography.weights.semiBold as any,
        },
        filleulDate: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
            marginTop: 2,
        },
        filleulRight: { alignItems: 'flex-end' },
        filleulNiveau: {
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.black as any,
            letterSpacing: 1,
        },
        filleulBonus: {
            color: Colors.brand.gold,
            fontSize: Typography.sizes.sub,
            fontWeight: Typography.weights.bold as any,
            marginTop: 2,
        },
        paliersGrid: {
            flexDirection: 'row',
            gap: 6,
            marginBottom: 8,
        },
        palierBadge: {
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 8,
            borderWidth: 1,
        },
        palierBadgeOn: {
            backgroundColor: 'rgba(76, 175, 130, 0.15)',
            borderColor: 'rgba(76, 175, 130, 0.4)',
        },
        palierBadgeOff: {
            backgroundColor: 'rgba(106, 102, 128, 0.1)',
            borderColor: 'rgba(106, 102, 128, 0.2)',
        },
        palierBadgeText: {
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.bold as any,
        },
        palierBadgeTextOn: {
            color: Colors.brand.success,
        },
        palierBadgeTextOff: {
            color: colors.textSecondary,
        },
        filleulCoursesText: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
        },
    });
}
