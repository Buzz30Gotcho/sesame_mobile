import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, StatusBar, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLang } from '../context/LanguageContext';
import { getAmbassadorDashboard, getAdminParameters, getCommissions, getEquipe } from '../services/api';
import type { EquipeEmployee } from '../types';
import PointsRing from '../components/PointsRing';
import BottomNav from '../components/BottomNav';
import { Colors, Typography } from '../theme';
import type { RootStackParamList, AmbassadorDashboard } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

let _dashboardCache: AmbassadorDashboard | null = null;
let _cachedAmbassadorId: string | null = null;
let _commissionCache: number | null = null;
let _employesCache: EquipeEmployee[] = [];

export function clearDashboardCache() {
    _dashboardCache = null; _cachedAmbassadorId = null;
    _commissionCache = null; _employesCache = [];
}

export default function AmbassadorAccueilScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AmbassadorAccueil'>>();
    const { ambassadorId, typeAmbassadeur, isSousCompte } = useAuth();
    const { colors } = useTheme();
    const { t } = useLang();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const isSameAmbassador = _cachedAmbassadorId === ambassadorId;
    const [dashboard, setDashboard] = useState<AmbassadorDashboard | null>(isSameAmbassador ? _dashboardCache : null);
    const [loading, setLoading] = useState(!isSameAmbassador || _dashboardCache === null);
    const [error, setError] = useState<string | null>(null);
    const [isImmediateEnabled, setIsImmediateEnabled] = useState(false);
    const [commissionDuMois, setCommissionDuMois] = useState<number | null>(isSameAmbassador ? _commissionCache : null);
    const [employes, setEmployes] = useState<EquipeEmployee[]>(isSameAmbassador ? _employesCache : []);

    useEffect(() => {
        async function load() {
            if (!ambassadorId) { setLoading(false); return; }
            const isMoralAcc = typeAmbassadeur === 'moral';
            try {
                // Tout en parallèle (un seul aller-retour) — les appels Moral ne partent que si Moral.
                const [dashRes, paramsRes, commRes, equipeRes] = await Promise.all([
                    getAmbassadorDashboard(ambassadorId),
                    getAdminParameters().catch(() => ({ data: {} })),
                    isMoralAcc ? getCommissions(ambassadorId).catch(() => ({ data: { mois: [] } })) : Promise.resolve(null),
                    isMoralAcc ? getEquipe(ambassadorId).catch(() => ({ data: [] })) : Promise.resolve(null),
                ]);
                _dashboardCache = dashRes.data;
                _cachedAmbassadorId = ambassadorId;
                setDashboard(dashRes.data);

                const p: Record<string, string> = paramsRes.data || {};
                setIsImmediateEnabled(p.mode_course_immediate === 'true');

                if (isMoralAcc) {
                    const mois = commRes?.data?.mois;
                    const comm = (mois && mois.length > 0) ? Number(mois[0].commission) : 0;
                    setCommissionDuMois(comm);
                    _commissionCache = comm;

                    const team = equipeRes?.data || [];
                    setEmployes(team);
                    _employesCache = team;
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
    // Ambassadeur physique indépendant : accueil non scrollable, tout visible d'un seul écran.
    // Les variantes Moral / Employé gardent le scroll (contenu plus long : carte établissement, guide…).
    const isPhysiqueIndep = !isMoral && !isSousCompte;
    const Body: React.ComponentType<any> = isPhysiqueIndep ? View : ScrollView;
    const bodyProps: any = isPhysiqueIndep
        ? { style: styles.staticContent }
        : { contentContainerStyle: styles.scrollContent, showsVerticalScrollIndicator: false };

    return (
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
            <StatusBar barStyle={colors.background === '#101018' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

            {activeCourse && (
                <TouchableOpacity style={styles.activeBanner} onPress={() => navigation.navigate('AmbassadorHome')}>
                    <View>
                        <Text style={styles.bannerTitle}>{t('en_cours_label')}</Text>
                        <Text style={styles.bannerSub}>{activeCourse.statut?.toUpperCase()}</Text>
                    </View>
                    <View style={styles.bannerCode}>
                        <Text style={styles.bannerCodeText}>{t('code_client_pivot')}</Text>
                        <Text style={styles.bannerCodeValue}>{activeCourse.code_validation || '----'}</Text>
                    </View>
                </TouchableOpacity>
            )}

            <Body {...bodyProps}>

                {/* Header */}
                <View style={[styles.header, isPhysiqueIndep && styles.headerCompact]}>
                    <Text style={styles.welcomeText}>{t('bonjour')}{dashboard?.prenom ? `, ${dashboard.prenom}` : ''} !</Text>
                    {!isMoral && !isSousCompte && (
                        <View style={styles.pointsBadge}>
                            <Text style={styles.pointsBadgeText}>{dashboard?.points_solde} pts</Text>
                        </View>
                    )}
                    {isSousCompte && (
                        <View style={styles.employeBadge}>
                            <Text style={styles.employeBadgeText}>EMPLOYÉ</Text>
                        </View>
                    )}
                </View>

                {/* Carte principale — pas d'anneau de points ni de commission pour un employé (specs : il prescrit seulement) */}
                {!isSousCompte && (
                    <View style={[styles.ringCard, isMoral ? styles.ringCardMoral : styles.ringCardPhysique, isPhysiqueIndep && styles.ringCardCompact]}>
                        {isMoral ? (
                            <>
                                <Text style={styles.commissionLabel}>{t('commission_du_mois')}</Text>
                                <Text style={styles.commissionValue}>
                                    {commissionDuMois !== null ? `${commissionDuMois.toFixed(2)} €` : '—'}
                                </Text>
                                <Text style={styles.commissionSub}>{t('basee_equipe')}</Text>
                            </>
                        ) : (
                            <>
                                <PointsRing
                                    points={dashboard?.points_solde || 0}
                                    level={dashboard?.niveau || 'starter'}
                                    nextLevelPoints={dashboard?.next_level_target || 500}
                                    size={isPhysiqueIndep ? 120 : 130}
                                />
                                <Text style={styles.levelLabel}>{t('niveau_label')} {dashboard?.niveau?.toUpperCase()}</Text>
                                {dashboard?.next_level && dashboard?.points_to_next_level > 0 && (
                                    <Text style={styles.nextLevelHint}>
                                        {dashboard.points_to_next_level} pts → {dashboard.next_level.toUpperCase()}
                                    </Text>
                                )}
                            </>
                        )}
                    </View>
                )}

                {/* Carte établissement de rattachement — employé (l'info la plus importante) */}
                {isSousCompte && (
                    <View style={styles.employeCard}>
                        <View style={styles.employeIconWrap}>
                            <Text style={styles.employeIcon}>🏨</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.employeCardLabel}>ÉTABLISSEMENT</Text>
                            <Text style={styles.employeCardValue} numberOfLines={1}>{dashboard?.etablissement || '—'}</Text>
                            <Text style={styles.employeCardRole} numberOfLines={2}>
                                {dashboard?.metier ? `${dashboard.metier} · ` : ''}Vous prescrivez les courses pour votre établissement
                            </Text>
                        </View>
                    </View>
                )}

                {/* Badge mode — masqué pour le physique (accueil épuré façon maquette) */}
                {!isPhysiqueIndep && (
                    <View style={isImmediateEnabled ? styles.modeBadgeGreen : styles.modeBadgeBlue}>
                        <Text style={styles.modeBadgeText}>
                            {isImmediateEnabled ? t('deux_modes_actifs') : t('reservation_seul')}
                        </Text>
                    </View>
                )}

                {/* Boutons */}
                {isPhysiqueIndep ? (
                    // Maquette : un seul bouton doré « Commander un véhicule ».
                    <TouchableOpacity
                        style={[styles.mainButton, styles.commanderPhysique]}
                        onPress={() => navigation.navigate('AmbassadorCommander', { defaultType: isImmediateEnabled ? 'immediate' : 'reservation' })}
                    >
                        <Text style={styles.mainButtonText}>🚗  {t('commander_vehicule')}</Text>
                    </TouchableOpacity>
                ) : (
                    <View style={styles.buttonsGroup}>
                        {isImmediateEnabled && (
                            <TouchableOpacity style={styles.mainButton} onPress={() => navigation.navigate('AmbassadorCommander', { defaultType: 'immediate' })}>
                                <Text style={styles.mainButtonText}>{t('commander_maintenant')}</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.reservationButton} onPress={() => navigation.navigate('AmbassadorCommander', { defaultType: 'reservation' })}>
                            <Text style={styles.reservationButtonText}>{t('reserver_avance')}</Text>
                        </TouchableOpacity>
                        {!isImmediateEnabled && (
                            <View style={styles.disabledButton}>
                                <Text style={styles.disabledButtonText}>{t('course_immediate_bientot')}</Text>
                            </View>
                        )}
                    </View>
                )}

                {/* Stats */}
                <View style={[styles.statsCard, isPhysiqueIndep && styles.statsCardCompact]}>
                    <Text style={[styles.statsTitle, isPhysiqueIndep && styles.statsTitleCompact]}>{isMoral ? 'ACTIVITÉ' : isSousCompte ? 'MON ACTIVITÉ' : isPhysiqueIndep ? 'CETTE SEMAINE' : t('mon_compte')}</Text>
                    <View style={styles.statsGrid}>
                        {/* « En cours » masqué pour le physique (le bandeau doré en haut suffit) */}
                        {!isPhysiqueIndep && (
                            <View style={styles.statItem}>
                                <Text style={styles.statValue}>{dashboard?.active_course_count || 0}</Text>
                                <Text style={styles.statLabel}>{t('en_cours_label')}</Text>
                            </View>
                        )}
                        {isMoral ? (
                            <View style={styles.statItem}>
                                <Text style={[styles.statValue, { color: Colors.brand.info }]}>
                                    {commissionDuMois !== null ? `${commissionDuMois.toFixed(0)} €` : '—'}
                                </Text>
                                <Text style={styles.statLabel}>CE MOIS</Text>
                            </View>
                        ) : isSousCompte ? (
                            <>
                                <View style={styles.statItem}>
                                    <Text style={[styles.statValue, { color: Colors.brand.gold }]}>{dashboard?.courses_semaine || 0}</Text>
                                    <Text style={styles.statLabel}>CETTE SEMAINE</Text>
                                </View>
                                <View style={styles.statItem}>
                                    <Text style={[styles.statValue, { color: Colors.brand.gold }]}>{dashboard?.courses_mois || 0}</Text>
                                    <Text style={styles.statLabel}>CE MOIS</Text>
                                </View>
                            </>
                        ) : (
                            <>
                                <View style={styles.statItem}>
                                    <Text style={[styles.statValue, { color: Colors.brand.gold }]}>{dashboard?.courses_semaine || 0}</Text>
                                    <Text style={styles.statLabel}>Courses</Text>
                                </View>
                                <View style={styles.statItem}>
                                    <Text style={[styles.statValue, { color: Colors.brand.gold }]}>+{dashboard?.points_semaine || 0}</Text>
                                    <Text style={styles.statLabel}>Points</Text>
                                </View>
                            </>
                        )}
                    </View>
                </View>

                {/* Guide « Comment ça marche » + support — employé (remplit le bas de page) */}
                {isSousCompte && (
                    <View style={styles.helpCard}>
                        <Text style={styles.helpTitle}>COMMENT ÇA MARCHE</Text>
                        {[
                            'Réservez une course pour votre client',
                            'Communiquez-lui le code à 4 chiffres reçu',
                            "Suivez l'arrivée du véhicule en temps réel",
                        ].map((step, i) => (
                            <View key={i} style={styles.helpStep}>
                                <View style={styles.helpNum}>
                                    <Text style={styles.helpNumText}>{i + 1}</Text>
                                </View>
                                <Text style={styles.helpStepText}>{step}</Text>
                            </View>
                        ))}
                        <TouchableOpacity style={styles.helpContact} onPress={() => Linking.openURL('mailto:support@sesame-pro.com')}>
                            <Text style={styles.helpContactLabel}>Besoin d'aide ?</Text>
                            <Text style={styles.helpContactValue}>support@sesame-pro.com</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Liens rapides — Physique (4 cartes) + Moral (commissions/équipe/profil). Employé : rien. */}
                {!isSousCompte && (
                <View style={[styles.quickLinks, isPhysiqueIndep && styles.quickLinksCompact]}>
                    {isMoral ? (
                        <>
                            <TouchableOpacity style={styles.linkCard} onPress={() => navigation.navigate('AmbassadorCommissions')}>
                                <Text style={styles.linkEmoji}>💶</Text>
                                <Text style={styles.linkLabel}>Commissions</Text>
                            </TouchableOpacity>
                            {/* Équipe : aperçu réduit à un compteur — la liste complète vit dans l'écran Équipe */}
                            <TouchableOpacity style={styles.linkCard} onPress={() => navigation.navigate('AmbassadorEquipe')}>
                                {employes.length > 0 && (
                                    <View style={styles.linkBadge}>
                                        <Text style={styles.linkBadgeText}>{employes.length}</Text>
                                    </View>
                                )}
                                <Text style={styles.linkEmoji}>👥</Text>
                                <Text style={styles.linkLabel}>Mon équipe</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.linkCard} onPress={() => navigation.navigate('AmbassadorProfil')}>
                                <Text style={styles.linkEmoji}>🏢</Text>
                                <Text style={styles.linkLabel}>Profil</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <>
                            <TouchableOpacity style={styles.linkCard} onPress={() => navigation.navigate('AmbassadorParrainage')}>
                                <Text style={styles.linkEmoji}>🤝</Text>
                                <Text style={styles.linkLabel}>{t('parrainage')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.linkCard} onPress={() => navigation.navigate('AmbassadorBonsCadeaux')}>
                                <Text style={styles.linkEmoji}>🎫</Text>
                                <Text style={styles.linkLabel}>{t('mes_bons')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.linkCard} onPress={() => navigation.navigate('AmbassadorNiveaux')}>
                                <Text style={styles.linkEmoji}>🏆</Text>
                                <Text style={styles.linkLabel}>{t('niveaux')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.linkCard} onPress={() => navigation.navigate('AmbassadorBoutique')}>
                                <Text style={styles.linkEmoji}>🎁</Text>
                                <Text style={styles.linkLabel}>{t('boutique')}</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
                )}

            </Body>

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
        scrollContent: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 100 },
        // Accueil physique non scrollable : anneau + bouton Commander + stats + 4 cartes, serrés en haut.
        staticContent: { flex: 1, paddingHorizontal: 18, paddingTop: 10 },
        headerCompact: { marginBottom: 10 },
        ringCardCompact: { paddingVertical: 12, marginBottom: 10 },
        commanderPhysique: { paddingVertical: 14, marginBottom: 10 },
        statsCardCompact: { paddingVertical: 10, marginBottom: 10 },
        statsTitleCompact: { marginBottom: 8 },
        quickLinksCompact: { marginTop: 0, rowGap: 8 },
        header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
        buttonsGroup: { gap: 8, marginBottom: 14 },
        welcomeText: { color: colors.textPrimary, fontSize: Typography.sizes.header, fontWeight: Typography.weights.bold as any },
        pointsBadge: { backgroundColor: 'rgba(201, 168, 76, 0.15)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
        pointsBadgeText: { color: Colors.brand.gold, fontWeight: Typography.weights.bold as any, fontSize: Typography.sizes.sub },
        employeBadge: { backgroundColor: 'rgba(74, 158, 255, 0.15)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(74,158,255,0.3)' },
        employeBadgeText: { color: Colors.brand.info, fontWeight: Typography.weights.black as any, fontSize: Typography.sizes.tiny, letterSpacing: 1 },
        employeCard: { flexDirection: 'row', alignItems: 'center', gap: 18, backgroundColor: colors.card, borderRadius: 20, paddingVertical: 30, paddingHorizontal: 22, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(74,158,255,0.25)' },
        employeIconWrap: { width: 70, height: 70, borderRadius: 20, backgroundColor: 'rgba(74,158,255,0.12)', alignItems: 'center', justifyContent: 'center' },
        employeIcon: { fontSize: 38 },
        employeCardLabel: { color: Colors.brand.info, fontSize: Typography.sizes.small, fontWeight: Typography.weights.black as any, letterSpacing: 1.5, marginBottom: 5 },
        employeCardValue: { color: colors.textPrimary, fontSize: 22, fontWeight: Typography.weights.black as any, marginBottom: 6 },
        employeCardRole: { color: colors.textSecondary, fontSize: Typography.sizes.small, lineHeight: 17 },
        helpCard: { backgroundColor: colors.card, borderRadius: 16, padding: 13, marginTop: 12 },
        helpTitle: { color: colors.textSecondary, fontSize: Typography.sizes.tiny, fontWeight: Typography.weights.bold as any, letterSpacing: 1, marginBottom: 9 },
        helpStep: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
        helpNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(201,168,76,0.15)', alignItems: 'center', justifyContent: 'center' },
        helpNumText: { color: Colors.brand.gold, fontSize: Typography.sizes.tiny, fontWeight: Typography.weights.black as any },
        helpStepText: { flex: 1, color: colors.textPrimary, fontSize: Typography.sizes.small, lineHeight: 16 },
        helpContact: { marginTop: 5, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', alignItems: 'center' },
        helpContactLabel: { color: colors.textSecondary, fontSize: Typography.sizes.tiny, marginBottom: 1 },
        helpContactValue: { color: Colors.brand.gold, fontSize: Typography.sizes.small, fontWeight: Typography.weights.black as any },
        ringCard: { backgroundColor: colors.card, borderRadius: 20, alignItems: 'center', paddingVertical: 20, paddingHorizontal: 16, marginBottom: 10 },
        ringCardPhysique: {},
        ringCardMoral: { paddingVertical: 36 },
        levelLabel: { color: Colors.brand.gold, fontSize: Typography.sizes.small, fontWeight: Typography.weights.black as any, marginTop: 8, letterSpacing: 1 },
        nextLevelHint: { color: colors.textSecondary, fontSize: Typography.sizes.sub, marginTop: 3, textAlign: 'center', paddingHorizontal: 8 },
        commissionLabel: { color: colors.textSecondary, fontSize: Typography.sizes.small, fontWeight: Typography.weights.black as any, letterSpacing: 2, marginBottom: 8 },
        commissionValue: { color: Colors.brand.gold, fontSize: Typography.sizes.mega, fontWeight: Typography.weights.black as any, marginBottom: 4 },
        commissionSub: { color: colors.textSecondary, fontSize: Typography.sizes.tiny },
        modeBadgeGreen: { alignSelf: 'center', backgroundColor: 'rgba(76, 175, 130, 0.15)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(76, 175, 130, 0.3)', marginBottom: 12 },
        modeBadgeBlue: { alignSelf: 'center', backgroundColor: 'rgba(74, 158, 255, 0.15)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(74, 158, 255, 0.3)', marginBottom: 12 },
        modeBadgeText: { color: colors.textPrimary, fontSize: Typography.sizes.tiny, fontWeight: Typography.weights.black as any, letterSpacing: 1 },
        mainButton: { backgroundColor: Colors.brand.gold, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
        mainButtonText: { color: '#09090F', fontSize: Typography.sizes.sub, fontWeight: Typography.weights.black as any },
        reservationButton: { backgroundColor: Colors.brand.info, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
        reservationButtonText: { color: '#FFFFFF', fontSize: Typography.sizes.sub, fontWeight: Typography.weights.black as any },
        disabledButton: { backgroundColor: colors.card, borderRadius: 12, paddingVertical: 13, alignItems: 'center', opacity: 0.4 },
        disabledButtonText: { color: colors.textSecondary, fontSize: Typography.sizes.sub, fontWeight: Typography.weights.bold as any },
        statsCard: { backgroundColor: colors.card, borderRadius: 16, padding: 14, marginBottom: 14 },
        statsTitle: { color: colors.textSecondary, fontSize: Typography.sizes.tiny, fontWeight: Typography.weights.bold as any, letterSpacing: 1, marginBottom: 10 },
        statsGrid: { flexDirection: 'row', justifyContent: 'space-around' },
        statItem: { alignItems: 'center' },
        statValue: { color: colors.textPrimary, fontSize: Typography.sizes.header, fontWeight: Typography.weights.black as any, marginBottom: 2 },
        statLabel: { color: colors.textSecondary, fontSize: Typography.sizes.tiny },
        quickLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
        linkCard: { backgroundColor: colors.card, width: '47.5%', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center' },
        linkEmoji: { fontSize: 22, marginBottom: 5 },
        linkLabel: { color: colors.textPrimary, fontSize: Typography.sizes.small, fontWeight: Typography.weights.bold as any, textAlign: 'center' },
        linkSub: { color: colors.textSecondary, fontSize: Typography.sizes.tiny, marginTop: 1 },
        linkBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: Colors.brand.gold, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
        linkBadgeText: { color: '#09090F', fontSize: Typography.sizes.tiny, fontWeight: Typography.weights.black as any },
        errorText: { color: Colors.brand.error, marginTop: 16 },
    });
}
