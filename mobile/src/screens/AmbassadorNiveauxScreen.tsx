import React, { useEffect, useState, useMemo } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    ActivityIndicator, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLang } from '../context/LanguageContext';
import { getAmbassadorDashboard } from '../services/api';
import BottomNav from '../components/BottomNav';
import AccessDenied from '../components/AccessDenied';
import { Colors, Typography } from '../theme';
import type { AmbassadorDashboard, RootStackParamList } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

let _niveauxCache: AmbassadorDashboard | null = null;

const LEVELS = [
    { key: 'starter', label: 'STARTER', threshold: 0, next: 500, color: Colors.nocturne.textSecondary, emoji: '⭐' },
    { key: 'pro', label: 'PRO', threshold: 500, next: 2000, color: Colors.brand.info, emoji: '💎' },
    { key: 'elite', label: 'ELITE', threshold: 2000, next: 5000, color: Colors.brand.gold, emoji: '👑' },
    { key: 'black', label: 'BLACK', threshold: 5000, next: null, color: '#FFFFFF', emoji: '🖤' },
];

export default function AmbassadorNiveauxScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AmbassadorNiveaux'>>();
    const { ambassadorId, typeAmbassadeur, isSousCompte } = useAuth();
    const { colors } = useTheme();
    const { t } = useLang();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    // Niveaux/points : Ambassadeur Physique indépendant uniquement (ni Moral, ni employé).
    const isAllowed = typeAmbassadeur !== 'moral' && !isSousCompte;
    const [dashboard, setDashboard] = useState<AmbassadorDashboard | null>(_niveauxCache);
    const [loading, setLoading] = useState(_niveauxCache === null);

    useEffect(() => {
        async function load() {
            if (!ambassadorId) return;
            try {
                const res = await getAmbassadorDashboard(ambassadorId);
                _niveauxCache = res.data;
                setDashboard(res.data);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [ambassadorId]);

    const currentPoints = dashboard?.points_solde || 0;
    const currentLevel = dashboard?.niveau || 'starter';
    const currentIdx = LEVELS.findIndex(l => l.key === currentLevel);

    if (!isAllowed) {
        return <AccessDenied message="Les niveaux SESAME concernent les Ambassadeurs Particuliers." />;
    }

    return (
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
            <StatusBar barStyle={colors.background === '#101018' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Text style={styles.backText}>←</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>{t('niveaux_titre')}</Text>
                    <View style={{ width: 36 }} />
                </View>

                {loading ? (
                    <ActivityIndicator size="large" color={Colors.brand.gold} style={{ marginTop: 40 }} />
                ) : (
                    <>
                        {/* Points actuels */}
                        <View style={styles.currentCard}>
                            <Text style={styles.currentLabel}>{t('vos_points')}</Text>
                            <Text style={styles.currentPoints}>{currentPoints}</Text>
                            <Text style={styles.currentLevel}>{t('niveau_label')} {currentLevel.toUpperCase()}</Text>
                            {dashboard?.next_level && (
                                <Text style={styles.currentNext}>
                                    {dashboard?.points_to_next_level} {t('pts_pour_atteindre')} {dashboard.next_level.toUpperCase()}
                                </Text>
                            )}
                        </View>

                        {/* 4 niveaux */}
                        {LEVELS.map((level, idx) => {
                            const isUnlocked = currentPoints >= level.threshold;
                            const isCurrent = level.key === currentLevel;
                            const progressPct = level.next
                                ? Math.min(100, Math.max(0, ((currentPoints - level.threshold) / (level.next - level.threshold)) * 100))
                                : 100;

                            return (
                                <View
                                    key={level.key}
                                    style={[
                                        styles.levelCard,
                                        isCurrent && { borderColor: level.color, borderWidth: 1.5 },
                                        !isUnlocked && styles.levelCardLocked,
                                    ]}
                                >
                                    <View style={styles.levelHeader}>
                                        <Text style={styles.levelEmoji}>{level.emoji}</Text>
                                        <View style={styles.levelInfo}>
                                            <Text style={[styles.levelName, { color: isUnlocked ? level.color : Colors.nocturne.textSecondary }]}>
                                                {level.label}
                                            </Text>
                                            <Text style={styles.levelThreshold}>
                                                {level.threshold === 0
                                                    ? t('des_inscription')
                                                    : `${t('a_partir_de')} ${level.threshold} ${t('points')}`}
                                            </Text>
                                        </View>
                                        {isCurrent && (
                                            <View style={[styles.currentBadge, { backgroundColor: level.color }]}>
                                                <Text style={styles.currentBadgeText}>{t('en_cours_badge')}</Text>
                                            </View>
                                        )}
                                        {isUnlocked && !isCurrent && (
                                            <Text style={styles.checkMark}>✓</Text>
                                        )}
                                        {!isUnlocked && (
                                            <Text style={styles.lockIcon}>🔒</Text>
                                        )}
                                    </View>

                                    {/* Barre de progression pour le niveau actuel */}
                                    {isCurrent && level.next && (
                                        <View style={styles.progressSection}>
                                            <View style={styles.progressBar}>
                                                <View style={[styles.progressFill, { width: `${progressPct}%`, backgroundColor: level.color }]} />
                                            </View>
                                            <Text style={styles.progressText}>
                                                {currentPoints} / {level.next} pts ({Math.floor(progressPct)}%)
                                            </Text>
                                        </View>
                                    )}

                                    {isCurrent && !level.next && (
                                        <View style={styles.maxLevelBadge}>
                                            <Text style={styles.maxLevelText}>{t('niveau_max_atteint')}</Text>
                                        </View>
                                    )}
                                </View>
                            );
                        })}

                        {/* Avantages */}
                        <View style={styles.infoBox}>
                            <Text style={styles.infoTitle}>{t('comment_progresser')}</Text>
                            <Text style={styles.infoText}>
                                <Text style={styles.infoHighlight}>{t('gagner_1pt_10eur')}</Text>{'\n\n'}{t('code_pivot_info')}
                            </Text>
                        </View>
                    </>
                )}
            </ScrollView>
            <BottomNav role="ambassadeur" />
        </SafeAreaView>
    );
}

function makeStyles(colors: typeof Colors.nocturne) {
    return StyleSheet.create({
        safeArea: { flex: 1, backgroundColor: colors.background },
        scrollContent: { padding: 20, paddingBottom: 120 },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 24,
        },
        backBtn: { width: 36, height: 36, justifyContent: 'center' },
        backText: { color: Colors.brand.gold, fontSize: 22, fontWeight: '700' },
        title: {
            color: Colors.brand.gold,
            fontSize: Typography.sizes.title,
            fontWeight: Typography.weights.black as any,
        },
        currentCard: {
            backgroundColor: 'rgba(201,168,76,0.08)',
            borderRadius: 24,
            padding: 24,
            alignItems: 'center',
            marginBottom: 24,
            borderWidth: 1,
            borderColor: 'rgba(201,168,76,0.2)',
        },
        currentLabel: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.black as any,
            letterSpacing: 2,
            marginBottom: 8,
        },
        currentPoints: {
            color: Colors.brand.gold,
            fontSize: 52,
            fontWeight: Typography.weights.black as any,
            marginBottom: 4,
        },
        currentLevel: {
            color: colors.textPrimary,
            fontSize: Typography.sizes.sub,
            fontWeight: Typography.weights.black as any,
            letterSpacing: 2,
            marginBottom: 6,
        },
        currentNext: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.small,
            textAlign: 'center',
        },
        levelCard: {
            backgroundColor: colors.card,
            borderRadius: 20,
            padding: 18,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.05)',
        },
        levelCardLocked: { opacity: 0.5 },
        levelHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
        },
        levelEmoji: { fontSize: 28 },
        levelInfo: { flex: 1 },
        levelName: {
            fontSize: Typography.sizes.sub,
            fontWeight: Typography.weights.black as any,
            letterSpacing: 1,
            marginBottom: 2,
        },
        levelThreshold: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
        },
        currentBadge: {
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 8,
        },
        currentBadgeText: {
            color: '#09090F',
            fontSize: 9,
            fontWeight: Typography.weights.black as any,
            letterSpacing: 0.5,
        },
        checkMark: {
            color: Colors.brand.success,
            fontSize: 20,
            fontWeight: '700',
        },
        lockIcon: { fontSize: 18 },
        progressSection: { marginTop: 16 },
        progressBar: {
            height: 8,
            backgroundColor: 'rgba(255,255,255,0.08)',
            borderRadius: 4,
            overflow: 'hidden',
            marginBottom: 6,
        },
        progressFill: {
            height: '100%',
            borderRadius: 4,
        },
        progressText: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
            textAlign: 'right',
        },
        maxLevelBadge: {
            marginTop: 14,
            backgroundColor: 'rgba(255,255,255,0.05)',
            borderRadius: 10,
            padding: 10,
            alignItems: 'center',
        },
        maxLevelText: {
            color: colors.textPrimary,
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.black as any,
            letterSpacing: 1,
        },
        infoBox: {
            backgroundColor: 'rgba(201,168,76,0.06)',
            borderRadius: 16,
            padding: 18,
            marginTop: 8,
            borderWidth: 1,
            borderColor: 'rgba(201,168,76,0.12)',
        },
        infoTitle: {
            color: Colors.brand.gold,
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.black as any,
            letterSpacing: 1,
            marginBottom: 10,
        },
        infoText: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.small,
            lineHeight: 20,
        },
        infoHighlight: {
            color: Colors.brand.gold,
            fontWeight: Typography.weights.bold as any,
        },
    });
}
