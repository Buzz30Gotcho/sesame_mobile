import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    ActivityIndicator, Switch, StatusBar, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import {
    getChauffeurDashboard, setChauffeurAvailability,
    validateCourseCode, finishChauffeurCourse,
    getCoursesDisponibles, acceptChauffeurCourse,
    signalerClientAbsent,
} from '../services/api';
import { Colors, Typography } from '../theme';
import { useTheme } from '../context/ThemeContext';
import BottomNav from '../components/BottomNav';
import IncomingCourseModal from '../components/IncomingCourseModal';
import type { RootStackParamList, ChauffeurDashboard, ActiveCourse } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export default function ChauffeurHomeScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'ChauffeurHome'>>();
    const { chauffeurId } = useAuth();
    const { colors } = useTheme();
    const [dashboard, setDashboard] = useState<ChauffeurDashboard | null>(null);
    const [loading, setLoading] = useState(true);
    const [codeDigits, setCodeDigits] = useState(['', '', '', '']);
    const [pivotError, setPivotError] = useState<string | null>(null);

    // Course entrante
    const [incomingCourse, setIncomingCourse] = useState<ActiveCourse | null>(null);
    const [accepting, setAccepting] = useState(false);
    const refusedIds = useRef<Set<string>>(new Set());

    // Récap fin de course
    const [completedCourse, setCompletedCourse] = useState<{ montant: number; dureeMin: number } | null>(null);

    const styles = useMemo(() => makeStyles(colors), [colors]);

    const loadDashboard = useCallback(async () => {
        if (!chauffeurId) return;
        try {
            const res = await getChauffeurDashboard(chauffeurId);
            setDashboard(res.data);
        } catch {
            // silencieux
        } finally {
            setLoading(false);
        }
    }, [chauffeurId]);

    const pollIncoming = useCallback(async () => {
        if (!chauffeurId || incomingCourse) return;
        try {
            const res = await getCoursesDisponibles(chauffeurId);
            const courses: ActiveCourse[] = res.data;
            if (courses.length > 0 && !refusedIds.current.has(courses[0].id)) {
                setIncomingCourse(courses[0]);
            }
        } catch {
            // silencieux
        }
    }, [chauffeurId, incomingCourse]);

    useEffect(() => {
        loadDashboard();
        const dashInterval = setInterval(loadDashboard, 10000);
        return () => clearInterval(dashInterval);
    }, [loadDashboard]);

    useEffect(() => {
        if (dashboard?.current_course) {
            setIncomingCourse(null);
            return;
        }
        if (!dashboard?.disponible) {
            setIncomingCourse(null);
            return;
        }
        const pollInterval = setInterval(pollIncoming, 3000);
        pollIncoming();
        return () => clearInterval(pollInterval);
    }, [dashboard?.disponible, dashboard?.current_course, pollIncoming]);

    const toggleAvailability = async (val: boolean) => {
        if (!chauffeurId) return;
        await setChauffeurAvailability(chauffeurId, val).catch(() => {});
        loadDashboard();
    };

    const handleDigitPress = (digit: string) => {
        const idx = codeDigits.findIndex(d => d === '');
        if (idx !== -1) {
            const next = [...codeDigits];
            next[idx] = digit;
            setCodeDigits(next);
        }
    };

    const handleDelete = () => {
        const idx = [...codeDigits].reverse().findIndex(d => d !== '');
        if (idx !== -1) {
            const realIdx = codeDigits.length - 1 - idx;
            const next = [...codeDigits];
            next[realIdx] = '';
            setCodeDigits(next);
        }
    };

    const handleValidateCode = async () => {
        if (!chauffeurId || !dashboard?.current_course) return;
        const code = codeDigits.join('');
        if (code.length < 4) return;
        try {
            setPivotError(null);
            await validateCourseCode(chauffeurId, dashboard.current_course.id, code);
            loadDashboard();
            setCodeDigits(['', '', '', '']);
        } catch (err: any) {
            setPivotError(err.response?.data?.error || 'Code incorrect');
        }
    };

    const handleFinishCourse = async () => {
        if (!chauffeurId || !dashboard?.current_course) return;
        const course = dashboard.current_course;
        const montant = Number(course.montant || 0);
        const acceptedAt = course.date_acceptation ? new Date(course.date_acceptation) : new Date();
        const dureeMin = Math.round((Date.now() - acceptedAt.getTime()) / 60000);

        await finishChauffeurCourse(chauffeurId, course.id).catch(() => {});
        setCompletedCourse({ montant, dureeMin });
        loadDashboard();
    };

    const handleClientAbsent = async () => {
        if (!chauffeurId || !dashboard?.current_course) return;
        Alert.alert(
            'Client absent ?',
            'Un opérateur SÉSAME va intervenir. Restez sur place et attendez.',
            [
                { text: 'Annuler', style: 'cancel' },
                {
                    text: 'Signaler à SÉSAME',
                    style: 'destructive',
                    onPress: async () => {
                        await signalerClientAbsent(chauffeurId, dashboard.current_course!.id).catch(() => {});
                        Alert.alert('Signalement envoyé', "L'équipe SÉSAME a été alertée. Un opérateur vous contacte.");
                    },
                },
            ]
        );
    };

    // Gestion course entrante
    const handleAcceptIncoming = async (courseId: string) => {
        if (!chauffeurId) return;
        setAccepting(true);
        try {
            await acceptChauffeurCourse(chauffeurId, courseId);
            setIncomingCourse(null);
            loadDashboard();
        } catch (err: any) {
            setIncomingCourse(null);
            if (err.response?.status === 400) {
                Alert.alert('Course non disponible', 'Cette course a déjà été prise par un autre chauffeur.');
            }
        } finally {
            setAccepting(false);
        }
    };

    const handleRefuseIncoming = (courseId: string) => {
        refusedIds.current.add(courseId);
        setIncomingCourse(null);
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator size="large" color={Colors.brand.gold} />
            </View>
        );
    }

    const currentCourse = dashboard?.current_course;

    return (
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
            <StatusBar barStyle="light-content" backgroundColor={colors.background} />

            {/* Modal course entrante */}
            <IncomingCourseModal
                course={incomingCourse}
                onAccept={handleAcceptIncoming}
                onRefuse={handleRefuseIncoming}
                accepting={accepting}
            />

            {/* Header disponibilité */}
            <View style={[styles.statusHeader, dashboard?.disponible ? styles.statusOnline : styles.statusOffline]}>
                <View>
                    <Text style={styles.driverName}>{dashboard?.prenom} {dashboard?.nom}</Text>
                    <Text style={dashboard?.disponible ? styles.onlineText : styles.offlineText}>
                        ● {dashboard?.disponible ? 'EN LIGNE' : 'HORS LIGNE'}
                    </Text>
                </View>
                <Switch
                    value={!!dashboard?.disponible}
                    onValueChange={toggleAvailability}
                    disabled={!!currentCourse}
                    trackColor={{ false: '#303040', true: Colors.brand.success }}
                    thumbColor="#FFFFFF"
                />
            </View>

            {!!currentCourse && (
                <View style={styles.toggleLockedBanner}>
                    <Text style={styles.toggleLockedText}>🔒 Toggle verrouillé pendant la course</Text>
                </View>
            )}

            <ScrollView contentContainerStyle={styles.scrollContent}>

                {/* Récap fin de course */}
                {completedCourse && (
                    <View style={styles.recapCard}>
                        <Text style={styles.recapTitle}>✅ COURSE TERMINÉE</Text>
                        <View style={styles.recapRow}>
                            <Text style={styles.recapLabel}>MONTANT ENCAISSÉ</Text>
                            <Text style={styles.recapMontant}>{completedCourse.montant.toFixed(2)} €</Text>
                        </View>
                        <View style={styles.recapRow}>
                            <Text style={styles.recapLabel}>DURÉE</Text>
                            <Text style={styles.recapValue}>{completedCourse.dureeMin} min</Text>
                        </View>
                        <View style={styles.recapButtons}>
                            <TouchableOpacity
                                style={styles.continuerBtn}
                                onPress={() => setCompletedCourse(null)}
                            >
                                <Text style={styles.continuerBtnText}>CONTINUER</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.terminerJourneeBtn}
                                onPress={async () => {
                                    if (chauffeurId) await setChauffeurAvailability(chauffeurId, false).catch(() => {});
                                    setCompletedCourse(null);
                                    loadDashboard();
                                }}
                            >
                                <Text style={styles.terminerJourneeBtnText}>TERMINER MA JOURNÉE</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {!currentCourse && !completedCourse ? (
                    /* État d'attente */
                    <View style={styles.emptyState}>
                        <View style={[styles.emptyCard, dashboard?.disponible && styles.emptyCardOnline]}>
                            <Text style={[styles.emptyTitle, dashboard?.disponible && { color: Colors.brand.success }]}>
                                {dashboard?.disponible ? 'EN ATTENTE DE COURSES' : 'HORS LIGNE'}
                            </Text>
                            <Text style={styles.emptySub}>
                                {dashboard?.disponible
                                    ? "Vous serez alerté dès qu'une course correspond à votre véhicule."
                                    : 'Activez le toggle pour recevoir des courses.'}
                            </Text>
                        </View>

                        {/* Stats du jour */}
                        {(dashboard?.courses_jour !== undefined) && (
                            <View style={styles.statsRow}>
                                <View style={styles.statCard}>
                                    <Text style={styles.statValue}>{dashboard.courses_jour}</Text>
                                    <Text style={styles.statLabel}>COURSES AUJOURD'HUI</Text>
                                </View>
                                <View style={styles.statCard}>
                                    <Text style={[styles.statValue, { color: Colors.brand.success }]}>
                                        {Number(dashboard.ca_jour || 0).toFixed(2)} €
                                    </Text>
                                    <Text style={styles.statLabel}>CA ENCAISSÉ</Text>
                                </View>
                            </View>
                        )}

                        <View style={styles.vehicleInfoCard}>
                            <Text style={styles.vehicleInfoLabel}>VOTRE VÉHICULE</Text>
                            <Text style={styles.vehicleInfoValue}>
                                {dashboard?.vehicule_type === 'van' ? '🚐 Van' : '🚗 Berline'}
                                {dashboard?.vehicule_marque ? ` · ${dashboard.vehicule_marque}` : ''}
                                {dashboard?.vehicule_couleur ? ` ${dashboard.vehicule_couleur}` : ''}
                            </Text>
                            {dashboard?.vehicule_immat && (
                                <Text style={styles.immat}>{dashboard.vehicule_immat}</Text>
                            )}
                        </View>
                    </View>
                ) : !completedCourse ? (
                    /* Course en cours */
                    <View style={styles.courseActiveContainer}>

                        {/* Étape */}
                        <View style={styles.stepCard}>
                            <Text style={styles.stepTitle}>
                                {currentCourse.statut === 'acceptee' ? '🚗 EN ROUTE VERS LE CLIENT'
                                    : currentCourse.statut === 'en_route' ? '📍 ARRIVÉ SUR PLACE'
                                    : currentCourse.statut === 'code_valide' ? '▶ COURSE EN COURS'
                                    : 'MISSION'}
                            </Text>
                            <Text style={styles.stepRef}>{currentCourse.reference}</Text>
                        </View>

                        {/* Saisie code pivot */}
                        {['acceptee', 'en_route'].includes(currentCourse.statut || '') && (
                            <View style={styles.pivotCard}>
                                <Text style={styles.pivotTitle}>CODE CLIENT SÉSAME</Text>
                                <Text style={styles.pivotSub}>
                                    Demandez au client son code à 4 chiffres
                                </Text>

                                <View style={styles.codeRow}>
                                    {codeDigits.map((d, i) => (
                                        <View key={i} style={[styles.codeBox, d !== '' && styles.codeBoxFilled]}>
                                            <Text style={styles.codeDigit}>{d}</Text>
                                        </View>
                                    ))}
                                </View>

                                {pivotError && <Text style={styles.errorText}>{pivotError}</Text>}

                                <View style={styles.numpad}>
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                                        <TouchableOpacity key={n} style={styles.numKey} onPress={() => handleDigitPress(n.toString())}>
                                            <Text style={styles.numText}>{n}</Text>
                                        </TouchableOpacity>
                                    ))}
                                    <TouchableOpacity style={styles.numKey} onPress={handleDelete}>
                                        <Text style={styles.numText}>⌫</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.numKey} onPress={() => handleDigitPress('0')}>
                                        <Text style={styles.numText}>0</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.numKey, styles.okKey]}
                                        onPress={handleValidateCode}
                                        disabled={codeDigits.join('').length < 4}
                                    >
                                        <Text style={styles.okText}>OK</Text>
                                    </TouchableOpacity>
                                </View>

                                <View style={styles.pivotWarningBox}>
                                    <Text style={styles.pivotWarning}>⚡ PIVOT JURIDIQUE ET FINANCIER OBLIGATOIRE</Text>
                                </View>
                            </View>
                        )}

                        {/* Course démarrée */}
                        {currentCourse.statut === 'code_valide' && (
                            <View style={styles.inProgressCard}>
                                <View style={styles.infoBlock}>
                                    <Text style={styles.infoLabel}>DESTINATION</Text>
                                    <Text style={styles.infoValue}>{currentCourse.adresse_destination}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>MONTANT À ENCAISSER</Text>
                                    <Text style={styles.infoValueGold}>{Number(currentCourse.montant || 0).toFixed(2)} €</Text>
                                </View>
                                <TouchableOpacity style={styles.finishButton} onPress={handleFinishCourse}>
                                    <Text style={styles.finishButtonText}>TERMINER ET FERMER LA COURSE</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* Boutons action */}
                        <View style={styles.actionRow}>
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => chauffeurId && currentCourse && navigation.navigate('Chat', {
                                    courseId: currentCourse.id,
                                    senderRole: 'chauffeur',
                                    senderId: chauffeurId,
                                    courseRef: currentCourse.reference,
                                })}
                            >
                                <Text style={styles.actionBtnText}>💬 CHAT</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionBtn}>
                                <Text style={styles.actionBtnText}>📞 APPELER</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Client absent */}
                        <TouchableOpacity style={styles.absentBtn} onPress={handleClientAbsent}>
                            <Text style={styles.absentBtnText}>🆘 CLIENT ABSENT — CONTACTER SÉSAME</Text>
                        </TouchableOpacity>
                    </View>
                ) : null}
            </ScrollView>

            <BottomNav role="chauffeur" />
        </SafeAreaView>
    );
}

function makeStyles(colors: typeof Colors.nocturne) {
    return StyleSheet.create({
        safeArea: { flex: 1, backgroundColor: colors.background },
        container: { flex: 1, backgroundColor: colors.background },
        center: { justifyContent: 'center', alignItems: 'center' },
        statusHeader: {
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            paddingHorizontal: 20, paddingVertical: 15,
            borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
        },
        statusOnline: { backgroundColor: 'rgba(76,175,130,0.05)' },
        statusOffline: { backgroundColor: 'rgba(106,102,128,0.05)' },
        driverName: { color: colors.textPrimary, fontSize: Typography.sizes.body, fontWeight: Typography.weights.bold as any },
        onlineText: { color: Colors.brand.success, fontSize: Typography.sizes.tiny, fontWeight: Typography.weights.black as any, marginTop: 2 },
        offlineText: { color: colors.textSecondary, fontSize: Typography.sizes.tiny, fontWeight: Typography.weights.black as any, marginTop: 2 },
        toggleLockedBanner: {
            backgroundColor: 'rgba(255,154,60,0.08)',
            paddingHorizontal: 20, paddingVertical: 8,
            borderBottomWidth: 1, borderBottomColor: 'rgba(255,154,60,0.15)',
        },
        toggleLockedText: { color: Colors.brand.warning, fontSize: Typography.sizes.tiny, fontWeight: Typography.weights.bold as any },
        scrollContent: { padding: 20, paddingBottom: 120 },
        emptyState: { gap: 16 },
        emptyCard: {
            backgroundColor: 'rgba(106,102,128,0.08)',
            borderWidth: 1, borderColor: 'rgba(106,102,128,0.2)',
            borderRadius: 18, padding: 24, alignItems: 'center',
        },
        emptyCardOnline: {
            backgroundColor: 'rgba(76,175,130,0.05)',
            borderColor: 'rgba(76,175,130,0.2)',
        },
        emptyTitle: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.sub, fontWeight: Typography.weights.black as any, letterSpacing: 1, marginBottom: 8,
        },
        emptySub: { color: colors.textSecondary, fontSize: Typography.sizes.small, textAlign: 'center', lineHeight: 18 },
        vehicleInfoCard: {
            backgroundColor: colors.card, borderRadius: 16, padding: 16,
        },
        vehicleInfoLabel: {
            color: colors.textSecondary, fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.black as any, letterSpacing: 1, marginBottom: 6,
        },
        vehicleInfoValue: { color: colors.textPrimary, fontSize: Typography.sizes.sub, fontWeight: Typography.weights.bold as any, marginBottom: 4 },
        immat: {
            color: Colors.brand.info, fontFamily: 'monospace',
            fontSize: Typography.sizes.sub, fontWeight: Typography.weights.black as any,
            backgroundColor: 'rgba(74,158,255,0.1)', paddingHorizontal: 10, paddingVertical: 4,
            borderRadius: 8, alignSelf: 'flex-start',
        },
        courseActiveContainer: { gap: 12 },
        stepCard: {
            backgroundColor: 'rgba(74,158,255,0.05)', borderWidth: 1,
            borderColor: 'rgba(74,158,255,0.2)', borderRadius: 18, padding: 16,
        },
        stepTitle: { color: Colors.brand.info, fontSize: Typography.sizes.sub, fontWeight: Typography.weights.black as any, marginBottom: 4 },
        stepRef: { color: colors.textSecondary, fontSize: Typography.sizes.tiny, fontFamily: 'monospace' },
        pivotCard: {
            backgroundColor: colors.card, borderRadius: 24, padding: 20, alignItems: 'center',
        },
        pivotTitle: { color: colors.textPrimary, fontSize: Typography.sizes.body, fontWeight: Typography.weights.black as any, marginBottom: 6 },
        pivotSub: { color: colors.textSecondary, fontSize: Typography.sizes.tiny, marginBottom: 20, textAlign: 'center' },
        codeRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 24 },
        codeBox: {
            width: 52, height: 62,
            backgroundColor: 'rgba(201,168,76,0.08)', borderWidth: 1, borderColor: Colors.brand.gold,
            borderRadius: 14, justifyContent: 'center', alignItems: 'center',
        },
        codeBoxFilled: { backgroundColor: 'rgba(201,168,76,0.2)' },
        codeDigit: { color: Colors.brand.gold, fontSize: Typography.sizes.title, fontWeight: Typography.weights.black as any },
        numpad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, width: '100%', marginBottom: 20 },
        numKey: {
            width: '30%', height: 52, backgroundColor: colors.card,
            borderRadius: 14, justifyContent: 'center', alignItems: 'center',
        },
        numText: { color: colors.textPrimary, fontSize: Typography.sizes.header, fontWeight: Typography.weights.bold as any },
        okKey: { backgroundColor: Colors.brand.gold },
        okText: { color: '#09090F', fontWeight: Typography.weights.black as any, fontSize: Typography.sizes.sub },
        pivotWarningBox: {
            paddingHorizontal: 12, paddingVertical: 6,
            backgroundColor: 'rgba(255,154,60,0.1)', borderRadius: 8,
        },
        pivotWarning: { color: Colors.brand.warning, fontSize: Typography.sizes.tiny, fontWeight: Typography.weights.black as any },
        inProgressCard: { backgroundColor: colors.card, borderRadius: 18, padding: 20 },
        infoBlock: { marginBottom: 16 },
        infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
        infoLabel: { color: colors.textSecondary, fontSize: Typography.sizes.tiny, fontWeight: Typography.weights.bold as any, marginBottom: 4 },
        infoValue: { color: colors.textPrimary, fontSize: Typography.sizes.body, fontWeight: Typography.weights.semiBold as any },
        infoValueGold: { color: Colors.brand.gold, fontSize: Typography.sizes.header, fontWeight: Typography.weights.black as any },
        finishButton: { backgroundColor: Colors.brand.gold, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
        finishButtonText: { color: '#09090F', fontSize: Typography.sizes.body, fontWeight: Typography.weights.black as any },
        actionRow: { flexDirection: 'row', gap: 10 },
        actionBtn: {
            flex: 1, backgroundColor: 'rgba(74,158,255,0.1)', borderWidth: 1,
            borderColor: 'rgba(74,158,255,0.2)', borderRadius: 14, paddingVertical: 14, alignItems: 'center',
        },
        actionBtnText: { color: Colors.brand.info, fontWeight: Typography.weights.bold as any, fontSize: Typography.sizes.tiny },
        absentBtn: {
            backgroundColor: 'rgba(255,154,60,0.1)', borderWidth: 1,
            borderColor: 'rgba(255,154,60,0.2)', borderRadius: 14, paddingVertical: 14, alignItems: 'center',
        },
        absentBtnText: { color: Colors.brand.warning, fontWeight: Typography.weights.bold as any, fontSize: Typography.sizes.tiny },
        errorText: { color: Colors.brand.error, fontSize: Typography.sizes.tiny, marginBottom: 16 },
        recapCard: {
            backgroundColor: colors.card, borderRadius: 24, padding: 24,
            borderWidth: 1, borderColor: 'rgba(76,175,130,0.3)', marginBottom: 16,
        },
        recapTitle: {
            color: Colors.brand.success, fontSize: Typography.sizes.sub,
            fontWeight: Typography.weights.black as any, letterSpacing: 1, marginBottom: 20, textAlign: 'center',
        },
        recapRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
        recapLabel: { color: colors.textSecondary, fontSize: Typography.sizes.tiny, fontWeight: Typography.weights.black as any, letterSpacing: 1 },
        recapMontant: { color: Colors.brand.gold, fontSize: Typography.sizes.title, fontWeight: Typography.weights.black as any },
        recapValue: { color: colors.textPrimary, fontSize: Typography.sizes.sub, fontWeight: Typography.weights.bold as any },
        recapButtons: { flexDirection: 'row', gap: 10, marginTop: 20 },
        continuerBtn: { flex: 1, backgroundColor: Colors.brand.gold, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
        continuerBtnText: { color: '#09090F', fontWeight: Typography.weights.black as any, fontSize: Typography.sizes.small },
        terminerJourneeBtn: {
            flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14,
            paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
        },
        terminerJourneeBtnText: { color: colors.textSecondary, fontWeight: Typography.weights.bold as any, fontSize: Typography.sizes.tiny },
        statsRow: { flexDirection: 'row', gap: 12 },
        statCard: { flex: 1, backgroundColor: colors.card, borderRadius: 16, padding: 16, alignItems: 'center' },
        statValue: { color: colors.textPrimary, fontSize: Typography.sizes.title, fontWeight: Typography.weights.black as any, marginBottom: 4 },
        statLabel: { color: colors.textSecondary, fontSize: Typography.sizes.tiny, fontWeight: Typography.weights.bold as any, letterSpacing: 0.5, textAlign: 'center' },
    });
}
