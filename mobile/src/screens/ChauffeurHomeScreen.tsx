import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    ActivityIndicator, Switch, StatusBar, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useAuth } from '../context/AuthContext';
import {
    getChauffeurDashboard, setChauffeurAvailability,
    validateCourseCode, finishChauffeurCourse,
    getCoursesDisponibles, acceptChauffeurCourse, markChauffeurArrived,
    signalerClientAbsent, getChauffeurDocuments,
    updateChauffeurPosition, getChauffeurSetupCard,
} from '../services/api';
import { startBackgroundLocation, stopBackgroundLocation } from '../services/locationTask';
import { Colors, Typography } from '../theme';
import { useTheme } from '../context/ThemeContext';
import BottomNav from '../components/BottomNav';
import IncomingCourseModal from '../components/IncomingCourseModal';
import type { RootStackParamList, ChauffeurDashboard, ActiveCourse } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
    try {
        const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data.features?.length) return null;
        const [lon, lat] = data.features[0].geometry.coordinates;
        return { lat, lon };
    } catch {
        return null;
    }
}

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
    const [completedCourse, setCompletedCourse] = useState<{ montant: number; dureeMin: number; distanceKm: number | null } | null>(null);

    // KYC
    const [kycStatus, setKycStatus] = useState<'ok' | 'manquant' | 'en_attente' | 'refuse'>('ok');

    // Timer d'attente client (specs §6.2) — décompte visible pendant la phase avant validation du code
    const [waitSec, setWaitSec] = useState(0);

    // Géofencing
    const [distanceToDestination, setDistanceToDestination] = useState<number | null>(null);
    const [gpsGranted, setGpsGranted] = useState<boolean | null>(null);
    const destCoordsRef = useRef<{ lat: number; lon: number } | null>(null);
    const lastPosRef = useRef<{ lat: number; lon: number } | null>(null);
    const lastPushRef = useRef(0);
    // true quand la tâche de fond pousse déjà la position → l'écran ne double pas l'envoi
    const bgActiveRef = useRef(false);
    const locationSubRef = useRef<Location.LocationSubscription | null>(null);

    const styles = useMemo(() => makeStyles(colors), [colors]);

    const loadDashboard = useCallback(async () => {
        if (!chauffeurId) return;
        try {
            const [dashRes, docsRes] = await Promise.all([
                getChauffeurDashboard(chauffeurId),
                getChauffeurDocuments(chauffeurId),
            ]);
            setDashboard(dashRes.data);

            // Les 11 documents obligatoires (specs §2.4 + catalogue §4.1 : « 0 document manquant = 0 course »)
            const requis = [
                'carte_identite', 'carte_vtc', 'revtc', 'kbis', 'permis', 'rir',
                'rc_pro', 'rc_circulation', 'carte_grise', 'certificat_medical', 'photo_profil',
            ];
            const docs = docsRes.data;
            const hasRefuse = docs.some(d => d.statut === 'refuse');
            const allPresent = requis.every(t => docs.find(d => d.type === t));
            const allValid = requis.every(t => docs.find(d => d.type === t && d.statut === 'valide'));

            if (hasRefuse) setKycStatus('refuse');
            else if (!allPresent) setKycStatus('manquant');
            else if (!allValid) setKycStatus('en_attente');
            else setKycStatus('ok');
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

    // Position temps réel en arrière-plan (specs §7.2 + §9.2) — la tâche de fond pousse la
    // position même app fermée / chauffeur sur son GPS. Démarrée pendant toute la course.
    useEffect(() => {
        const course = dashboard?.current_course;
        const driving = !!course && ['acceptee', 'en_route', 'code_valide', 'en_cours'].includes(course.statut || '');
        if (driving) {
            (async () => {
                const mode = await startBackgroundLocation();
                bgActiveRef.current = mode === 'background';
                setGpsGranted(mode !== 'denied');
            })();
        } else {
            bgActiveRef.current = false;
            stopBackgroundLocation().catch(() => {});
        }
    }, [dashboard?.current_course?.id, dashboard?.current_course?.statut]);

    // Arrêt du suivi de fond au démontage de l'écran
    useEffect(() => () => { stopBackgroundLocation().catch(() => {}); }, []);

    // Timer d'attente visible (specs §6.2/§8.1) — démarre à l'arrivée du chauffeur (statut en_route).
    useEffect(() => {
        const course = dashboard?.current_course;
        const waiting = !!course && course.statut === 'en_route';
        if (!waiting || !course?.date_arrivee) {
            setWaitSec(0);
            return;
        }
        const start = new Date(course.date_arrivee).getTime();
        const tick = () => setWaitSec(Math.max(0, Math.floor((Date.now() - start) / 1000)));
        tick();
        const iv = setInterval(tick, 1000);
        return () => clearInterval(iv);
    }, [dashboard?.current_course?.statut, dashboard?.current_course?.date_arrivee]);

    // Position envoyée quand le chauffeur est en ligne sans course active : permet à l'ETA
    // « à ~X min du client » d'être frais sur la course entrante (specs §6.2). Faible fréquence.
    useEffect(() => {
        const idleOnline = !!dashboard?.disponible && !dashboard?.current_course;
        if (!idleOnline || !chauffeurId) return;
        let cancelled = false;
        const pushOnce = async () => {
            try {
                const { status } = await Location.getForegroundPermissionsAsync();
                if (status !== 'granted') return;
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                if (!cancelled) {
                    await updateChauffeurPosition(chauffeurId, { lat: loc.coords.latitude, lon: loc.coords.longitude }).catch(() => {});
                }
            } catch { /* silencieux */ }
        };
        pushOnce();
        const iv = setInterval(pushOnce, 25000);
        return () => { cancelled = true; clearInterval(iv); };
    }, [dashboard?.disponible, dashboard?.current_course, chauffeurId]);

    // Géofencing (specs §7.2) — au premier plan : distance à la destination + position pour
    // la clôture. Sert AUSSI de repli pour pousser la position si le suivi de fond est refusé.
    useEffect(() => {
        const course = dashboard?.current_course;
        const drivingStates = ['acceptee', 'en_route', 'code_valide', 'en_cours'];
        if (!course || !drivingStates.includes(course.statut || '')) {
            locationSubRef.current?.remove();
            locationSubRef.current = null;
            setDistanceToDestination(null);
            return;
        }

        (async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return;

            // Géocoder la destination pour le géofencing, une fois le code validé
            if (course.statut === 'code_valide' && !destCoordsRef.current && course.adresse_destination) {
                destCoordsRef.current = await geocodeAddress(course.adresse_destination);
            }

            locationSubRef.current?.remove();
            locationSubRef.current = await Location.watchPositionAsync(
                { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
                (loc) => {
                    lastPosRef.current = { lat: loc.coords.latitude, lon: loc.coords.longitude };

                    // Repli : si la tâche de fond n'est pas active, on pousse depuis l'écran (toutes les 5 s)
                    const now = Date.now();
                    if (chauffeurId && !bgActiveRef.current && now - lastPushRef.current >= 5000) {
                        lastPushRef.current = now;
                        updateChauffeurPosition(chauffeurId, lastPosRef.current).catch(() => {});
                    }

                    // Distance à la destination (disponible une fois le code validé)
                    if (destCoordsRef.current) {
                        const d = haversineMeters(
                            loc.coords.latitude, loc.coords.longitude,
                            destCoordsRef.current.lat, destCoordsRef.current.lon
                        );
                        setDistanceToDestination(Math.round(d));
                    }
                }
            );
        })();

        return () => {
            locationSubRef.current?.remove();
            locationSubRef.current = null;
        };
    }, [dashboard?.current_course?.statut, dashboard?.current_course?.adresse_destination, chauffeurId]);

    const promptAddCard = () => {
        if (!chauffeurId) return;
        Alert.alert(
            'Carte bancaire requise',
            'Pour passer en ligne, vous devez enregistrer une carte bancaire. C\'est une étape obligatoire pour activer votre compte chauffeur.',
            [
                { text: 'Plus tard', style: 'cancel' },
                {
                    text: 'Ajouter ma carte',
                    onPress: async () => {
                        try {
                            const r = await getChauffeurSetupCard(chauffeurId);
                            await Linking.openURL(r.data.url);
                        } catch {
                            Alert.alert('Erreur', "Impossible d'ouvrir la page d'enregistrement de carte.");
                        }
                    },
                },
            ]
        );
    };

    const toggleAvailability = async (val: boolean) => {
        if (!chauffeurId) return;
        if (val && !dashboard?.documents_valides) {
            Alert.alert('Dossier incomplet', 'Vos documents doivent être validés par SÉSAME avant de vous mettre en ligne.');
            return;
        }
        // Pré-filtre côté app (le backend reste la source de vérité, cf. 403 NO_CARD ci-dessous).
        if (val && !dashboard?.carte_enregistree) {
            promptAddCard();
            return;
        }
        try {
            await setChauffeurAvailability(chauffeurId, val);
        } catch (err: any) {
            if (err?.response?.data?.code === 'NO_CARD') {
                promptAddCard();
                return;
            }
            Alert.alert('Erreur', err?.response?.data?.error || 'Impossible de changer votre disponibilité.');
            return;
        }
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

    const handleArrived = async () => {
        if (!chauffeurId || !dashboard?.current_course) return;
        try {
            await markChauffeurArrived(chauffeurId, dashboard.current_course.id);
            loadDashboard();
        } catch (err: any) {
            Alert.alert('Erreur', err.response?.data?.error || 'Impossible de signaler votre arrivée.');
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
        const distanceKm = course.distance_km != null ? Number(course.distance_km) : null;

        try {
            await finishChauffeurCourse(chauffeurId, course.id, lastPosRef.current);
        } catch (err: any) {
            // Géofencing serveur : trop loin de la destination (403) → on ne ferme pas la course.
            Alert.alert('Erreur', err.response?.data?.error || 'Impossible de terminer la course.');
            return;
        }
        destCoordsRef.current = null;
        lastPosRef.current = null;
        setDistanceToDestination(null);
        setCompletedCourse({ montant, dureeMin, distanceKm });
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
                        const minutes = Math.max(1, Math.floor(waitSec / 60));
                        await signalerClientAbsent(chauffeurId, dashboard.current_course!.id, minutes).catch(() => {});
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
                    disabled={!!currentCourse || !dashboard?.documents_valides}
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

                {/* Carte KYC — visible et prioritaire */}
                {kycStatus !== 'ok' && (
                    <TouchableOpacity
                        style={[styles.kycCard, kycStatus === 'refuse' && styles.kycCardRefuse]}
                        onPress={() => navigation.navigate('ChauffeurProfile')}
                        activeOpacity={0.85}
                    >
                        <Text style={styles.kycCardIcon}>
                            {kycStatus === 'refuse' ? '❌' : kycStatus === 'manquant' ? '⚠️' : '⏳'}
                        </Text>
                        <Text style={[styles.kycCardTitle, kycStatus === 'refuse' && styles.kycCardTitleRefuse]}>
                            {kycStatus === 'refuse' ? 'DOCUMENT REFUSÉ'
                             : kycStatus === 'manquant' ? 'DOSSIER INCOMPLET'
                             : 'EN ATTENTE DE VALIDATION'}
                        </Text>
                        <Text style={styles.kycCardBody}>
                            {kycStatus === 'refuse'
                                ? 'Un ou plusieurs documents ont été refusés par SÉSAME. Vous devez les renvoyer pour pouvoir recevoir des courses.'
                                : kycStatus === 'manquant'
                                ? 'Vous n\'avez pas encore uploadé vos documents obligatoires. Vous ne pouvez pas recevoir de courses tant que votre dossier n\'est pas complet et validé.'
                                : 'Vos documents sont en cours de vérification par l\'équipe SÉSAME. Vous serez notifié dès la validation.'}
                        </Text>
                        <View style={[styles.kycCardBtn, kycStatus === 'refuse' && styles.kycCardBtnRefuse]}>
                            <Text style={styles.kycCardBtnText}>
                                {kycStatus === 'en_attente' ? 'VOIR MON DOSSIER' : 'COMPLÉTER MON DOSSIER'}
                            </Text>
                        </View>
                    </TouchableOpacity>
                )}

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
                        {completedCourse.distanceKm != null && (
                            <View style={styles.recapRow}>
                                <Text style={styles.recapLabel}>DISTANCE</Text>
                                <Text style={styles.recapValue}>{completedCourse.distanceKm.toFixed(1)} km</Text>
                            </View>
                        )}
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

                        {/* En route vers le client → bouton "Je suis arrivé" (specs §8.1) */}
                        {currentCourse.statut === 'acceptee' && (
                            <View style={styles.arrivedCard}>
                                <View style={styles.infoBlock}>
                                    <Text style={styles.infoLabel}>PRISE EN CHARGE</Text>
                                    <Text style={styles.infoValue}>{currentCourse.adresse_depart}</Text>
                                </View>
                                <TouchableOpacity style={styles.arrivedBtn} onPress={handleArrived}>
                                    <Text style={styles.arrivedBtnText}>📍 JE SUIS ARRIVÉ</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* Saisie code pivot — uniquement une fois arrivé sur place */}
                        {currentCourse.statut === 'en_route' && (
                            <View style={styles.pivotCard}>
                                <Text style={styles.pivotTitle}>CODE CLIENT SÉSAME</Text>
                                <Text style={styles.pivotSub}>
                                    Demandez au client son code à 4 chiffres
                                </Text>

                                <View style={styles.waitTimerBadge}>
                                    <Text style={styles.waitTimerText}>
                                        ⏱ Attente client : {Math.floor(waitSec / 60)}m {String(waitSec % 60).padStart(2, '0')}s
                                    </Text>
                                </View>

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

                                {/* Indicateur distance */}
                                {gpsGranted === false ? (
                                    <Text style={styles.gpsWarning}>⚠️ GPS non autorisé — activez la localisation</Text>
                                ) : distanceToDestination !== null && (
                                    <View style={[styles.distanceBadge, distanceToDestination <= 300 && styles.distanceBadgeOk]}>
                                        <Text style={[styles.distanceText, distanceToDestination <= 300 && styles.distanceTextOk]}>
                                            {distanceToDestination <= 300
                                                ? `✓ À ${distanceToDestination} m de la destination`
                                                : `📍 ${distanceToDestination} m de la destination`}
                                        </Text>
                                    </View>
                                )}

                                <TouchableOpacity
                                    style={[
                                        styles.finishButton,
                                        distanceToDestination !== null && distanceToDestination > 300 && styles.finishButtonDisabled
                                    ]}
                                    onPress={handleFinishCourse}
                                    disabled={distanceToDestination !== null && distanceToDestination > 300}
                                >
                                    <Text style={styles.finishButtonText}>TERMINER ET FERMER LA COURSE</Text>
                                </TouchableOpacity>
                                {distanceToDestination !== null && distanceToDestination > 300 && (
                                    <Text style={styles.finishHint}>Approchez-vous de la destination pour terminer</Text>
                                )}
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
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => {
                                    const tel = (currentCourse as any).ambassadeur_telephone;
                                    if (tel) Linking.openURL(`tel:${tel}`);
                                    else Alert.alert('Indisponible', 'Numéro de l\'ambassadeur non disponible.');
                                }}
                            >
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
        kycCard: {
            backgroundColor: 'rgba(255,154,60,0.12)',
            borderRadius: 20,
            borderWidth: 1.5,
            borderColor: 'rgba(255,154,60,0.4)',
            padding: 24,
            marginBottom: 16,
            alignItems: 'center',
        },
        kycCardRefuse: {
            backgroundColor: 'rgba(255,100,100,0.12)',
            borderColor: 'rgba(255,100,100,0.4)',
        },
        kycCardIcon: {
            fontSize: 48,
            marginBottom: 12,
        },
        kycCardTitle: {
            color: Colors.brand.warning,
            fontSize: Typography.sizes.header,
            fontWeight: Typography.weights.black as any,
            letterSpacing: 1,
            textAlign: 'center',
            marginBottom: 12,
        },
        kycCardTitleRefuse: {
            color: Colors.brand.error,
        },
        kycCardBody: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.sub,
            textAlign: 'center',
            lineHeight: 22,
            marginBottom: 20,
        },
        kycCardBtn: {
            backgroundColor: Colors.brand.warning,
            borderRadius: 14,
            paddingVertical: 14,
            paddingHorizontal: 28,
        },
        kycCardBtnRefuse: {
            backgroundColor: Colors.brand.error,
        },
        kycCardBtnText: {
            color: '#101018',
            fontSize: Typography.sizes.small,
            fontWeight: Typography.weights.black as any,
            letterSpacing: 1,
        },
        scrollContent: { padding: 14, paddingBottom: 100 },
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
        courseActiveContainer: { gap: 8 },
        stepCard: {
            backgroundColor: 'rgba(74,158,255,0.05)', borderWidth: 1,
            borderColor: 'rgba(74,158,255,0.2)', borderRadius: 14, padding: 10,
        },
        stepTitle: { color: Colors.brand.info, fontSize: Typography.sizes.small, fontWeight: Typography.weights.black as any, marginBottom: 2 },
        stepRef: { color: colors.textSecondary, fontSize: Typography.sizes.tiny, fontFamily: 'monospace' },
        arrivedCard: { backgroundColor: colors.card, borderRadius: 18, padding: 20 },
        arrivedBtn: { backgroundColor: Colors.brand.info, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
        arrivedBtnText: { color: '#09090F', fontSize: Typography.sizes.body, fontWeight: Typography.weights.black as any },
        pivotCard: {
            backgroundColor: colors.card, borderRadius: 20, padding: 18, alignItems: 'center',
        },
        pivotTitle: { color: colors.textPrimary, fontSize: Typography.sizes.body, fontWeight: Typography.weights.black as any, marginBottom: 6 },
        pivotSub: { color: colors.textSecondary, fontSize: Typography.sizes.tiny, marginBottom: 12, textAlign: 'center' },
        waitTimerBadge: {
            backgroundColor: 'rgba(255,154,60,0.1)', borderRadius: 10,
            paddingHorizontal: 12, paddingVertical: 6, marginBottom: 16, alignSelf: 'center',
        },
        waitTimerText: { color: Colors.brand.warning, fontSize: Typography.sizes.tiny, fontWeight: Typography.weights.bold as any },
        codeRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 16 },
        codeBox: {
            width: 52, height: 60,
            backgroundColor: 'rgba(201,168,76,0.08)', borderWidth: 1, borderColor: Colors.brand.gold,
            borderRadius: 14, justifyContent: 'center', alignItems: 'center',
        },
        codeBoxFilled: { backgroundColor: 'rgba(201,168,76,0.2)' },
        codeDigit: { color: Colors.brand.gold, fontSize: Typography.sizes.title, fontWeight: Typography.weights.black as any },
        numpad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, width: '100%', marginBottom: 12 },
        numKey: {
            width: '30%', height: 44, backgroundColor: colors.card,
            borderRadius: 12, justifyContent: 'center', alignItems: 'center',
        },
        numText: { color: colors.textPrimary, fontSize: Typography.sizes.body, fontWeight: Typography.weights.bold as any },
        okKey: { backgroundColor: Colors.brand.gold },
        okText: { color: '#09090F', fontWeight: Typography.weights.black as any, fontSize: Typography.sizes.sub },
        pivotWarningBox: {
            paddingHorizontal: 10, paddingVertical: 5,
            backgroundColor: 'rgba(255,154,60,0.1)', borderRadius: 8,
        },
        pivotWarning: { color: Colors.brand.warning, fontSize: 10, fontWeight: Typography.weights.black as any },
        inProgressCard: { backgroundColor: colors.card, borderRadius: 18, padding: 20 },
        infoBlock: { marginBottom: 16 },
        infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
        infoLabel: { color: colors.textSecondary, fontSize: Typography.sizes.tiny, fontWeight: Typography.weights.bold as any, marginBottom: 4 },
        infoValue: { color: colors.textPrimary, fontSize: Typography.sizes.body, fontWeight: Typography.weights.semiBold as any },
        infoValueGold: { color: Colors.brand.gold, fontSize: Typography.sizes.header, fontWeight: Typography.weights.black as any },
        finishButton: { backgroundColor: Colors.brand.gold, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
        finishButtonDisabled: { backgroundColor: 'rgba(201,168,76,0.3)' },
        finishButtonText: { color: '#09090F', fontSize: Typography.sizes.body, fontWeight: Typography.weights.black as any },
        finishHint: { color: colors.textSecondary, fontSize: Typography.sizes.tiny, textAlign: 'center', marginTop: 6 },
        distanceBadge: {
            backgroundColor: 'rgba(255,154,60,0.1)', borderRadius: 10,
            paddingHorizontal: 12, paddingVertical: 6, marginTop: 8, alignSelf: 'center',
        },
        distanceBadgeOk: { backgroundColor: 'rgba(76,175,130,0.1)' },
        distanceText: { color: Colors.brand.warning, fontSize: Typography.sizes.tiny, fontWeight: Typography.weights.bold as any },
        distanceTextOk: { color: Colors.brand.success },
        gpsWarning: { color: Colors.brand.warning, fontSize: Typography.sizes.tiny, textAlign: 'center', marginTop: 8 },
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
