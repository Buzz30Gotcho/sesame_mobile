import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLang } from '../context/LanguageContext';
import { getAmbassadorDashboard, getAdminParameters, getCommissions } from '../services/api';
import PointsRing from '../components/PointsRing';
import BottomNav from '../components/BottomNav';
import { Colors, Typography } from '../theme';
import type { RootStackParamList, AmbassadorDashboard } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

let _dashboardCache: AmbassadorDashboard | null = null;
let _cachedAmbassadorId: string | null = null;

export function clearDashboardCache() { _dashboardCache = null; _cachedAmbassadorId = null; }

export default function AmbassadorAccueilScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AmbassadorAccueil'>>();
    const { ambassadorId, typeAmbassadeur } = useAuth();
    const { colors } = useTheme();
    const { t } = useLang();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const isSameAmbassador = _cachedAmbassadorId === ambassadorId;
    const [dashboard, setDashboard] = useState<AmbassadorDashboard | null>(isSameAmbassador ? _dashboardCache : null);
    const [loading, setLoading] = useState(!isSameAmbassador || _dashboardCache === null);
    const [error, setError] = useState<string | null>(null);
    const [isImmediateEnabled, setIsImmediateEnabled] = useState(true);
    const [commissionDuMois, setCommissionDuMois] = useState<number | null>(null);

    useEffect(() => {
        async function load() {
            if (!ambassadorId) { setLoading(false); return; }
            try {
                const [dashRes, paramsRes] = await Promise.all([
                    getAmbassadorDashboard(ambassadorId),
                    getAdminParameters().catch(() => ({ data: [] })),
                ]);
                _dashboardCache = dashRes.data;
                _cachedAmbassadorId = ambassadorId;
                setDashboard(dashRes.data);

                const p: Record<string, string> = {};
                paramsRes.data.forEach((item: any) => { p[item.cle] = item.valeur; });
                setIsImmediateEnabled(p.mode_course_immediate === 'true');

                if (typeAmbassadeur === 'moral') {
                    try {
                        const commRes = await getCommissions(ambassadorId);
                        const mois = commRes.data.mois;
                        if (mois && mois.length > 0) {
                            setCommissionDuMois(Number(mois[0].commission));
                        } else {
                            setCommissionDuMois(0);
                        }
                    } catch {
                        setCommissionDuMois(0);
                    }
                }
            } catch {
                setError(t('impossible_donnees'));
            } finally {
                setLoading(false);
            }
        }
        load();
        const interval = setInterval(load, 10000);
        return () => clearInterval(interval);
    }, [ambassadorId, typeAmbassadeur]);

    const activeCourse = dashboard?.active_courses.find(c => ['recherche', 'acceptee', 'en_route', 'code_valide'].includes(c.statut || ''));

    if (loading) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator size="large" color={Colors.brand.gold} />
            </View>
        );
    }

    const isMoral = typeAmbassadeur === 'moral';

    return (
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
            <StatusBar barStyle={colors.background === '#101018' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

            {activeCourse && (
                <TouchableOpacity style={styles.activeBanner} onPress={() => navigation.navigate('AmbassadorHome')}>
                    <View>
                        <Text style={styles.bannerTitle}>{t('en_cours_label')}</Text>
                        <Text style={styles.bannerSub}>{activeCourse.reference} • {activeCourse.statut?.toUpperCase()}</Text>
                    </View>
                    <View style={styles.bannerCode}>
                        <Text style={styles.bannerCodeText}>{t('code_client_pivot')}</Text>
                        <Text style={styles.bannerCodeValue}>{activeCourse.code_validation || '----'}</Text>
                    </View>
                </TouchableOpacity>
            )}

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                <View style={styles.header}>
                    <Text style={styles.welcomeText}>{t('bonjour')}{dashboard?.prenom ? `, ${dashboard.prenom}` : ''} !</Text>
                    <View style={styles.pointsBadge}>
                        <Text style={styles.pointsBadgeText}>{dashboard?.points_solde} pts</Text>
                    </View>
                </View>

                {isMoral ? (
                    <View style={styles.ringCard}>
                        <Text style={styles.commissionLabel}>{t('commission_du_mois')}</Text>
                        <Text style={styles.commissionValue}>
                            {commissionDuMois !== null ? `${commissionDuMois.toFixed(2)} €` : '—'}
                        </Text>
                        <Text style={styles.commissionSub}>{t('basee_equipe')}</Text>
                    </View>
                ) : (
                    <View style={styles.ringCard}>
                        <PointsRing
                            points={dashboard?.points_solde || 0}
                            level={dashboard?.niveau || 'starter'}
                            nextLevelPoints={dashboard?.next_level_target || 500}
                            size={170}
                        />
                        <Text style={styles.levelLabel}>{t('niveau_label')} {dashboard?.niveau.toUpperCase()}</Text>
                    </View>
                )}

                {isImmediateEnabled ? (
                    <View style={styles.modeBadgeGreen}>
                        <Text style={styles.modeBadgeText}>{t('deux_modes_actifs')}</Text>
                    </View>
                ) : (
                    <View style={styles.modeBadgeBlue}>
                        <Text style={styles.modeBadgeText}>{t('reservation_seul')}</Text>
                    </View>
                )}

                {isImmediateEnabled ? (
                    <>
                        <TouchableOpacity style={styles.mainButton} onPress={() => navigation.navigate('AmbassadorCommander', { defaultType: 'immediate' })}>
                            <Text style={styles.mainButtonText}>{t('commander_maintenant')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.reservationButton} onPress={() => navigation.navigate('AmbassadorCommander', { defaultType: 'reservation' })}>
                            <Text style={styles.reservationButtonText}>{t('reserver_avance')}</Text>
                        </TouchableOpacity>
                    </>
                ) : (
                    <>
                        <TouchableOpacity style={styles.reservationButton} onPress={() => navigation.navigate('AmbassadorCommander', { defaultType: 'reservation' })}>
                            <Text style={styles.reservationButtonText}>{t('reserver_avance')}</Text>
                        </TouchableOpacity>
                        <View style={styles.disabledButton}>
                            <Text style={styles.disabledButtonText}>{t('course_immediate_bientot')}</Text>
                        </View>
                    </>
                )}

                <View style={styles.statsCard}>
                    <Text style={styles.statsTitle}>{t('mon_compte')}</Text>
                    <View style={styles.statsGrid}>
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>{dashboard?.active_course_count || 0}</Text>
                            <Text style={styles.statLabel}>{t('en_cours_label')}</Text>
                        </View>
                        <View style={styles.statItem}>
                            <Text style={[styles.statValue, { color: Colors.brand.gold }]}>{dashboard?.points_solde || 0}</Text>
                            <Text style={styles.statLabel}>{t('points')}</Text>
                        </View>
                        <View style={styles.statItem}>
                            <Text style={[styles.statValue, { color: Colors.brand.warning }]}>{dashboard?.pending_bons_count || 0}</Text>
                            <Text style={styles.statLabel}>{t('bons_attente_label')}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.quickLinks}>
                    <TouchableOpacity style={styles.linkCard} onPress={() => navigation.navigate('AmbassadorParrainage')}>
                        <Text style={styles.linkEmoji}>🤝</Text>
                        <Text style={styles.linkLabel}>{t('parrainage')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.linkCard} onPress={() => navigation.navigate('AmbassadorBonsCadeaux')}>
                        <Text style={styles.linkEmoji}>🎫</Text>
                        <Text style={styles.linkLabel}>{t('mes_bons')}</Text>
                    </TouchableOpacity>
                    {isMoral && (
                        <TouchableOpacity style={styles.linkCard} onPress={() => navigation.navigate('AmbassadorCommissions')}>
                            <Text style={styles.linkEmoji}>💶</Text>
                            <Text style={styles.linkLabel}>{t('commissions')}</Text>
                        </TouchableOpacity>
                    )}
                    {isMoral && (
                        <TouchableOpacity style={styles.linkCard} onPress={() => navigation.navigate('AmbassadorEquipe')}>
                            <Text style={styles.linkEmoji}>👥</Text>
                            <Text style={styles.linkLabel}>{t('equipe')}</Text>
                        </TouchableOpacity>
                    )}
                </View>

            </ScrollView>

            <BottomNav role="ambassadeur" />
        </SafeAreaView>
    );
}

function makeStyles(colors: typeof Colors.nocturne) {
    return StyleSheet.create({
        safeArea: { flex: 1, backgroundColor: colors.background },
        container: { flex: 1, backgroundColor: colors.background },
        center: { justifyContent: 'center', alignItems: 'center' },
        activeBanner: {
            backgroundColor: 'rgba(201, 168, 76, 0.15)',
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(201, 168, 76, 0.3)',
            paddingHorizontal: 20,
            paddingVertical: 12,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        bannerTitle: { color: Colors.brand.gold, fontSize: Typography.sizes.small, fontWeight: Typography.weights.black as any, textTransform: 'uppercase' },
        bannerSub: { color: colors.textSecondary, fontSize: Typography.sizes.small, marginTop: 2 },
        bannerCode: { backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: Colors.brand.gold },
        bannerCodeText: { color: colors.textSecondary, fontSize: Typography.sizes.tiny, fontWeight: Typography.weights.bold as any },
        bannerCodeValue: { color: Colors.brand.gold, fontSize: Typography.sizes.body, fontWeight: Typography.weights.black as any, fontFamily: 'monospace' },
        scrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 120 },
        header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
        welcomeText: { color: colors.textPrimary, fontSize: Typography.sizes.header, fontWeight: Typography.weights.bold as any },
        pointsBadge: { backgroundColor: 'rgba(201, 168, 76, 0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
        pointsBadgeText: { color: Colors.brand.gold, fontWeight: Typography.weights.bold as any, fontSize: Typography.sizes.sub },
        ringCard: { backgroundColor: colors.card, borderRadius: 24, paddingVertical: 16, alignItems: 'center', marginBottom: 16 },
        levelLabel: { color: Colors.brand.gold, fontSize: Typography.sizes.small, fontWeight: Typography.weights.black as any, marginTop: 8, letterSpacing: 1 },
        commissionLabel: { color: colors.textSecondary, fontSize: Typography.sizes.tiny, fontWeight: Typography.weights.black as any, letterSpacing: 2, marginBottom: 8 },
        commissionValue: { color: Colors.brand.gold, fontSize: Typography.sizes.giant, fontWeight: Typography.weights.black as any, marginBottom: 6 },
        commissionSub: { color: colors.textSecondary, fontSize: Typography.sizes.small },
        modeBadgeGreen: { alignSelf: 'center', backgroundColor: 'rgba(76, 175, 130, 0.15)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(76, 175, 130, 0.3)' },
        modeBadgeBlue: { alignSelf: 'center', backgroundColor: 'rgba(74, 158, 255, 0.15)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(74, 158, 255, 0.3)' },
        modeBadgeText: { color: colors.textPrimary, fontSize: Typography.sizes.tiny, fontWeight: Typography.weights.black as any, letterSpacing: 1 },
        mainButton: { backgroundColor: Colors.brand.gold, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 10 },
        mainButtonText: { color: '#09090F', fontSize: Typography.sizes.body, fontWeight: Typography.weights.black as any },
        reservationButton: { backgroundColor: Colors.brand.info, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 10 },
        reservationButtonText: { color: '#FFFFFF', fontSize: Typography.sizes.body, fontWeight: Typography.weights.black as any },
        disabledButton: { backgroundColor: colors.card, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 20, opacity: 0.4 },
        disabledButtonText: { color: colors.textSecondary, fontSize: Typography.sizes.body, fontWeight: Typography.weights.bold as any },
        statsCard: { backgroundColor: colors.card, borderRadius: 18, padding: 16, marginBottom: 16 },
        statsTitle: { color: colors.textSecondary, fontSize: Typography.sizes.tiny, fontWeight: Typography.weights.bold as any, letterSpacing: 1, marginBottom: 12 },
        statsGrid: { flexDirection: 'row', justifyContent: 'space-between' },
        statItem: { alignItems: 'center', flex: 1 },
        statValue: { color: colors.textPrimary, fontSize: Typography.sizes.title, fontWeight: Typography.weights.black as any, marginBottom: 4 },
        statLabel: { color: colors.textSecondary, fontSize: Typography.sizes.tiny },
        quickLinks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
        linkCard: { backgroundColor: colors.card, width: '48%', borderRadius: 18, padding: 16, marginBottom: 12, alignItems: 'center' },
        linkEmoji: { fontSize: Typography.sizes.title, marginBottom: 8 },
        linkLabel: { color: colors.textPrimary, fontSize: Typography.sizes.sub, fontWeight: Typography.weights.bold as any, textAlign: 'center' },
        errorText: { color: Colors.brand.error, marginTop: 16 },
    });
}
