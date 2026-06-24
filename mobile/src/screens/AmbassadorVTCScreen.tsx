import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, ActivityIndicator,
    TouchableOpacity, StatusBar, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLang } from '../context/LanguageContext';
import { getAmbassadorDashboard, getCoursesHistory, cancelCourse } from '../services/api';
import BottomNav from '../components/BottomNav';
import { Colors, Typography } from '../theme';
import type { RootStackParamList, AmbassadorDashboard, ActiveCourse } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

let _vtcDashboardCache: AmbassadorDashboard | null = null;
let _vtcHistoryCache: ActiveCourse[] = [];

function formatDate(iso?: string) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function statutLabel(statut?: string) {
    const labels: Record<string, string> = {
        recherche: 'Recherche chauffeur…',
        acceptee: 'Chauffeur en route',
        en_route: 'Chauffeur arrivé',
        code_valide: 'Course en cours',
        en_cours: 'Course en cours',
        terminee: 'Terminée',
        annulee: 'Annulée',
    };
    return labels[statut || ''] || statut?.toUpperCase() || '—';
}

function statutColor(statut?: string) {
    if (statut === 'terminee') return Colors.brand.success;
    if (statut === 'annulee') return Colors.brand.error;
    if (statut === 'code_valide' || statut === 'en_cours') return Colors.brand.info;
    return Colors.brand.gold;
}

function buildSmsBody(course: ActiveCourse, code: string) {
    const vehicule = [
        course.vehicule_type === 'berline' ? 'Berline' : 'Van',
        course.vehicule_couleur,
        course.vehicule_marque,
        course.vehicule_modele,
    ].filter(Boolean).join(' ');
    const immat = course.vehicule_immat ? `— ${course.vehicule_immat}` : '';
    const chauffeur = course.chauffeur_prenom
        ? `Chauffeur : ${course.chauffeur_prenom} ${course.chauffeur_nom || ''}.`
        : '';
    const montant = course.montant ? `Montant : ${Number(course.montant).toFixed(2)} €.` : '';
    // ETA dans le message client (specs §6.1) — seulement si connu (chauffeur en route, position fraîche).
    const eta = course.eta_minutes != null ? `Arrivée estimée : ~${course.eta_minutes} min.` : '';
    const lines = [
        'Votre véhicule SÉSAME est confirmé.',
        chauffeur,
        `${vehicule} ${immat}.`.trim(),
        eta,
        montant,
        `Votre code : ${code}`,
        '',
        'Communiquez ce code à votre chauffeur à sa prise en charge.',
        'Bonne route. — SÉSAME',
    ];
    return lines.filter((l, i) => l !== '' || i === 6).join('\n');
}

export default function AmbassadorVTCScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AmbassadorHome'>>();
    const { ambassadorId, typeAmbassadeur, isSousCompte } = useAuth();
    // Points : concept réservé à l'Ambassadeur Physique indépendant (ni Moral, ni employé).
    const showPoints = typeAmbassadeur !== 'moral' && !isSousCompte;
    const { colors } = useTheme();
    const { t } = useLang();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const [dashboard, setDashboard] = useState<AmbassadorDashboard | null>(_vtcDashboardCache);
    const [history, setHistory] = useState<ActiveCourse[]>(_vtcHistoryCache);
    const [loading, setLoading] = useState(_vtcDashboardCache === null);
    const [cancelling, setCancelling] = useState(false);

    const load = useCallback(async () => {
        if (!ambassadorId) return;
        try {
            const [dashRes, histRes] = await Promise.all([
                getAmbassadorDashboard(ambassadorId),
                getCoursesHistory(ambassadorId),
            ]);
            _vtcDashboardCache = dashRes.data;
            _vtcHistoryCache = histRes.data;
            setDashboard(dashRes.data);
            setHistory(histRes.data);
        } finally {
            setLoading(false);
        }
    }, [ambassadorId]);

    useEffect(() => {
        load();
        const interval = setInterval(load, 10000);
        return () => clearInterval(interval);
    }, [load]);

    const activeCourse = dashboard?.active_courses.find(c =>
        ['recherche', 'acceptee', 'en_route', 'code_valide', 'en_cours'].includes(c.statut || '')
    );

    const handleCancel = () => {
        if (!activeCourse) return;
        const nbAnnul = dashboard?.nb_annulations_30j ?? 0;
        let warningMsg = '';
        if (nbAnnul === 2) warningMsg = 'Attention : la prochaine annulation entraîne une restriction 24h.';
        else if (nbAnnul === 3) warningMsg = 'Votre compte est actuellement restreint 24h — plus de nouvelles commandes.';
        else if (nbAnnul === 4) warningMsg = 'Attention : la prochaine annulation entraîne une suspension de votre compte.';
        const countMsg = nbAnnul > 0
            ? `\n\nAnnulations ce mois : ${nbAnnul}/5.${warningMsg ? ' ' + warningMsg : ''}`
            : '';
        Alert.alert(
            t('annuler_course_titre'),
            t('annuler_course_msg') + countMsg,
            [
                { text: t('non'), style: 'cancel' },
                {
                    text: t('oui_annuler'),
                    style: 'destructive',
                    onPress: async () => {
                        setCancelling(true);
                        try {
                            const res = await cancelCourse(activeCourse.id);
                            const sanction = res?.data?.sanction;
                            await load();
                            if (sanction === 'avertissement') {
                                Alert.alert(
                                    'Avertissement',
                                    'Première annulation ce mois-ci. À partir de 3 annulations en 30 jours, votre compte sera restreint 24h.'
                                );
                            } else if (sanction === 'restriction_24h') {
                                Alert.alert(
                                    'Compte restreint 24h',
                                    'Trop d\'annulations ce mois-ci. Vous ne pourrez pas passer de commande pendant 24 heures.'
                                );
                            } else if (sanction === 'suspension') {
                                Alert.alert(
                                    'Compte suspendu',
                                    'Votre compte a été suspendu suite à de trop nombreuses annulations. Contactez SÉSAME : support@sesame-pro.com'
                                );
                            }
                        } catch {
                            Alert.alert(t('erreur'), t('impossible_annuler'));
                        } finally {
                            setCancelling(false);
                        }
                    },
                },
            ]
        );
    };

    const handleSms = () => {
        if (!activeCourse?.code_validation) return;
        const body = buildSmsBody(activeCourse, activeCourse.code_validation);
        Linking.openURL(`sms:?body=${encodeURIComponent(body)}`);
    };

    const handleCall = () => {
        if (!activeCourse?.chauffeur_telephone) {
            Alert.alert(t('telephone_indisponible'), t('numero_indisponible'));
            return;
        }
        Linking.openURL(`tel:${activeCourse.chauffeur_telephone}`);
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator size="large" color={Colors.brand.gold} />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
            <StatusBar barStyle={colors.background === '#101018' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={styles.title}>{t('mes_courses')}</Text>

                {/* Course active */}
                {activeCourse ? (
                    <View style={styles.activeCard}>
                        <View style={styles.activeHeader}>
                            <Text style={styles.activeStatus}>{statutLabel(activeCourse.statut)}</Text>
                            <Text style={styles.activeRef}>{activeCourse.reference}</Text>
                        </View>

                        {/* Infos chauffeur — toujours visible */}
                        <View style={styles.chauffeurCard}>
                            <Text style={styles.chauffeurTitle}>{t('chauffeur_assigne')}</Text>
                            {activeCourse.chauffeur_prenom ? (
                                <>
                                    <Text style={styles.chauffeurName}>
                                        {activeCourse.chauffeur_prenom} {activeCourse.chauffeur_nom}
                                    </Text>
                                    <View style={styles.immatRow}>
                                        <Text style={styles.vehicleDesc}>
                                            {[
                                                activeCourse.vehicule_type === 'berline' ? 'Berline' : 'Van',
                                                activeCourse.vehicule_couleur,
                                                activeCourse.vehicule_marque,
                                                activeCourse.vehicule_modele,
                                            ].filter(Boolean).join(' ') || '—'}
                                        </Text>
                                        {activeCourse.vehicule_immat && (
                                            <Text style={styles.immat}>{activeCourse.vehicule_immat}</Text>
                                        )}
                                    </View>
                                </>
                            ) : (
                                <Text style={styles.pivotWaiting}>Recherche en cours…</Text>
                            )}
                        </View>

                        {/* ETA temps réel (specs §7.2) — avant la prise en charge uniquement */}
                        {activeCourse.eta_minutes != null && ['acceptee', 'en_route'].includes(activeCourse.statut || '') && (
                            <View style={styles.etaBadge}>
                                <Text style={styles.etaText}>🚗 Arrive dans ~{activeCourse.eta_minutes} min</Text>
                            </View>
                        )}

                        {/* Code Pivot */}
                        <View style={styles.pivotSection}>
                            <Text style={styles.pivotLabel}>{t('code_client_pivot')}</Text>
                            <Text style={styles.pivotValue}>{activeCourse.code_validation || '- - - -'}</Text>
                            {!activeCourse.code_validation && (
                                <Text style={styles.pivotWaiting}>{t('en_attente_chauffeur')}</Text>
                            )}
                        </View>

                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>{t('depart_label')}</Text>
                            <Text style={styles.infoValue}>{activeCourse.adresse_depart}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>{t('destination_label')}</Text>
                            <Text style={styles.infoValue}>{activeCourse.adresse_destination}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>{t('montant_label')}</Text>
                            <Text style={[styles.infoValue, { color: Colors.brand.gold }]}>
                                {Number(activeCourse.montant || 0).toFixed(2)} €
                            </Text>
                        </View>

                        {/* Actions */}
                        <View style={styles.actionRow}>
                            {activeCourse.code_validation && (
                                <TouchableOpacity style={styles.actionBtn} onPress={handleSms}>
                                    <Text style={styles.actionBtnText}>📱 ENVOYER CODE</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity style={styles.actionBtn} onPress={handleCall}>
                                <Text style={styles.actionBtnText}>📞 APPELER</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => navigation.navigate('Chat', {
                                    courseId: activeCourse.id,
                                    senderRole: 'ambassadeur',
                                    senderId: ambassadorId!,
                                    courseRef: activeCourse.reference,
                                })}
                                disabled={!activeCourse.chauffeur_prenom}
                            >
                                <Text style={styles.actionBtnText}>💬 CHAT</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Annulation */}
                        {['recherche', 'acceptee'].includes(activeCourse.statut || '') && (
                            <TouchableOpacity
                                style={styles.cancelBtn}
                                onPress={handleCancel}
                                disabled={cancelling}
                            >
                                {cancelling
                                    ? <ActivityIndicator color={Colors.brand.error} size="small" />
                                    : <Text style={styles.cancelBtnText}>{t('annuler_cette_course')}</Text>
                                }
                            </TouchableOpacity>
                        )}
                    </View>
                ) : (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyText}>{t('aucune_course_active')}</Text>
                        <TouchableOpacity
                            style={styles.orderBtn}
                            onPress={() => navigation.navigate('AmbassadorCommander')}
                        >
                            <Text style={styles.orderBtnText}>{t('commander_vehicule')}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Historique */}
                <Text style={styles.sectionTitle}>{t('historique')}</Text>
                {history.length === 0 ? (
                    <Text style={styles.noHistory}>{t('historique_vide')}</Text>
                ) : (
                    history.map(c => (
                        <View key={c.id} style={styles.historyCard}>
                            <View style={styles.historyHeader}>
                                <Text style={styles.historyRef}>{c.reference}</Text>
                                <Text style={styles.historyDate}>{formatDate(c.date_fin || c.date_annulation)}</Text>
                            </View>
                            <Text style={styles.historyAddress} numberOfLines={1}>{c.adresse_destination}</Text>
                            <View style={styles.historyFooter}>
                                <Text style={[styles.historyStatus, { color: statutColor(c.statut) }]}>
                                    {statutLabel(c.statut)}
                                </Text>
                                <View style={styles.historyRight}>
                                    <Text style={styles.historyPrice}>{Number(c.montant || 0).toFixed(2)} €</Text>
                                    {showPoints && c.points_attribues && c.points_attribues > 0 ? (
                                        <Text style={styles.historyPoints}>+{c.points_attribues} pts</Text>
                                    ) : null}
                                </View>
                            </View>
                        </View>
                    ))
                )}
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
        scrollContent: { padding: 24, paddingBottom: 120 },
        title: {
            color: Colors.brand.gold,
            fontSize: Typography.sizes.title,
            fontWeight: Typography.weights.black as any,
            marginBottom: 24,
        },
        activeCard: {
            backgroundColor: colors.card,
            borderRadius: 24,
            padding: 20,
            borderWidth: 1,
            borderColor: Colors.brand.gold,
            marginBottom: 32,
        },
        activeHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
        },
        activeStatus: {
            color: Colors.brand.gold,
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.black as any,
            letterSpacing: 1,
        },
        activeRef: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
            fontFamily: 'monospace',
        },
        pivotSection: {
            alignItems: 'center',
            marginBottom: 20,
            paddingBottom: 20,
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(255,255,255,0.06)',
        },
        etaBadge: {
            alignSelf: 'center',
            backgroundColor: 'rgba(76, 175, 130, 0.12)',
            borderRadius: 999,
            paddingVertical: 8,
            paddingHorizontal: 18,
            marginBottom: 18,
        },
        etaText: {
            color: Colors.brand.success,
            fontSize: Typography.sizes.small,
            fontWeight: Typography.weights.bold as any,
        },
        pivotLabel: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.black as any,
            letterSpacing: 2,
            marginBottom: 10,
        },
        pivotValue: {
            color: Colors.brand.gold,
            fontSize: 52,
            fontWeight: Typography.weights.black as any,
            letterSpacing: 10,
            fontFamily: 'monospace',
        },
        pivotWaiting: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
            marginTop: 8,
            fontStyle: 'italic',
        },
        chauffeurCard: {
            backgroundColor: 'rgba(74, 158, 255, 0.07)',
            borderRadius: 14,
            padding: 14,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: 'rgba(74, 158, 255, 0.15)',
        },
        chauffeurTitle: {
            color: Colors.brand.info,
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.black as any,
            letterSpacing: 1,
            marginBottom: 6,
        },
        chauffeurName: {
            color: colors.textPrimary,
            fontSize: Typography.sizes.body,
            fontWeight: Typography.weights.bold as any,
            marginBottom: 6,
        },
        immatRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        vehicleDesc: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
        },
        immat: {
            color: Colors.brand.info,
            fontSize: Typography.sizes.small,
            fontWeight: Typography.weights.black as any,
            fontFamily: 'monospace',
            backgroundColor: 'rgba(74, 158, 255, 0.12)',
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 6,
        },
        infoRow: { marginBottom: 12 },
        infoLabel: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.black as any,
            letterSpacing: 1,
            marginBottom: 2,
        },
        infoValue: {
            color: colors.textPrimary,
            fontSize: Typography.sizes.sub,
            fontWeight: Typography.weights.semiBold as any,
        },
        actionRow: {
            flexDirection: 'row',
            gap: 8,
            marginTop: 16,
            marginBottom: 12,
            flexWrap: 'wrap',
        },
        actionBtn: {
            flex: 1,
            minWidth: 90,
            backgroundColor: 'rgba(255,255,255,0.05)',
            paddingVertical: 12,
            borderRadius: 12,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
        },
        actionBtnText: {
            color: colors.textPrimary,
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.bold as any,
        },
        cancelBtn: {
            marginTop: 4,
            paddingVertical: 10,
            alignItems: 'center',
            borderTopWidth: 1,
            borderTopColor: 'rgba(255,100,100,0.15)',
        },
        cancelBtnText: {
            color: Colors.brand.error,
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.bold as any,
        },
        emptyCard: {
            backgroundColor: colors.card,
            borderRadius: 20,
            padding: 32,
            alignItems: 'center',
            marginBottom: 32,
        },
        emptyText: {
            color: colors.textSecondary,
            marginBottom: 20,
            fontSize: Typography.sizes.sub,
        },
        orderBtn: {
            backgroundColor: Colors.brand.gold,
            paddingHorizontal: 20,
            paddingVertical: 14,
            borderRadius: 14,
        },
        orderBtnText: {
            color: '#101018',
            fontWeight: Typography.weights.black as any,
            fontSize: Typography.sizes.sub,
        },
        sectionTitle: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.black as any,
            letterSpacing: 2,
            marginBottom: 16,
        },
        historyCard: {
            backgroundColor: colors.card,
            borderRadius: 16,
            padding: 16,
            marginBottom: 12,
        },
        historyHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginBottom: 6,
        },
        historyRef: {
            color: colors.textPrimary,
            fontWeight: Typography.weights.bold as any,
            fontSize: Typography.sizes.sub,
            fontFamily: 'monospace',
        },
        historyDate: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
        },
        historyAddress: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
            marginBottom: 12,
        },
        historyFooter: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTopWidth: 1,
            borderTopColor: 'rgba(255,255,255,0.05)',
            paddingTop: 12,
        },
        historyStatus: {
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.bold as any,
        },
        historyRight: { alignItems: 'flex-end' },
        historyPrice: {
            color: colors.textPrimary,
            fontWeight: Typography.weights.black as any,
            fontSize: Typography.sizes.sub,
        },
        historyPoints: {
            color: Colors.brand.gold,
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.bold as any,
            marginTop: 2,
        },
        noHistory: {
            color: colors.textSecondary,
            textAlign: 'center',
            marginTop: 20,
            fontSize: Typography.sizes.sub,
        },
    });
}
