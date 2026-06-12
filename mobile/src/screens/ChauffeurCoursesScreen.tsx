import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLang } from '../context/LanguageContext';
import { getChauffeurCourses, acceptChauffeurCourse, finishChauffeurCourse } from '../services/api';
import { Colors, Typography } from '../theme';
import BottomNav from '../components/BottomNav';
import type { ActiveCourse } from '../types';

export default function ChauffeurCoursesScreen() {
    const { chauffeurId } = useAuth();
    const { colors } = useTheme();
    const { t } = useLang();
    const [courses, setCourses] = useState<ActiveCourse[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const styles = useMemo(() => makeStyles(colors), [colors]);

    useEffect(() => {
        async function loadCourses() {
            if (!chauffeurId) {
                setError(t('erreur'));
                setLoading(false);
                return;
            }
            try {
                const response = await getChauffeurCourses(chauffeurId);
                setCourses(response.data);
            } catch {
                setError('Impossible de charger les courses.');
            } finally {
                setLoading(false);
            }
        }
        loadCourses();
    }, [chauffeurId]);

    const handleAccept = async (courseId: string) => {
        if (!chauffeurId) return;
        try {
            await acceptChauffeurCourse(chauffeurId, courseId);
            Alert.alert('Accepté', 'Vous avez accepté la course.');
        } catch {
            Alert.alert(t('erreur'), "Impossible d'accepter la course.");
        }
    };

    const handleFinish = async (courseId: string) => {
        if (!chauffeurId) return;
        // Position pour le géofencing serveur (300 m). Mode dégradé si GPS refusé : on envoie sans coords.
        let coords: { lat: number; lon: number } | null = null;
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
                coords = { lat: loc.coords.latitude, lon: loc.coords.longitude };
            }
        } catch {
            // GPS indisponible → mode dégradé
        }
        try {
            await finishChauffeurCourse(chauffeurId, courseId, coords);
            Alert.alert('Terminé', 'Course marquée comme terminée.');
        } catch (err: any) {
            Alert.alert(t('erreur'), err.response?.data?.error || 'Impossible de terminer la course.');
        }
    };

    const statutLabel: Record<string, string> = {
        recherche: 'EN RECHERCHE',
        acceptee: 'ACCEPTÉE',
        en_route: 'EN ROUTE',
        code_valide: 'CODE VALIDÉ',
        en_cours: 'EN COURS',
        terminee: 'TERMINÉE',
        annulee: 'ANNULÉE',
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
            <StatusBar barStyle="light-content" backgroundColor={colors.background} />
            <ScrollView contentContainerStyle={styles.scroll}>
                <Text style={styles.title}>{t('mes_courses')}</Text>

                {loading ? (
                    <ActivityIndicator size="large" color={Colors.brand.info} style={styles.loader} />
                ) : error ? (
                    <Text style={styles.errorText}>{error}</Text>
                ) : courses.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyText}>Aucune course pour le moment.</Text>
                    </View>
                ) : (
                    courses.map((course) => (
                        <View key={course.id} style={styles.card}>
                            <View style={styles.cardHeader}>
                                <Text style={styles.ref}>{course.reference ?? course.id}</Text>
                                <View style={[
                                    styles.badge,
                                    course.statut === 'terminee' && styles.badgeSuccess,
                                    course.statut === 'annulee' && styles.badgeError,
                                    ['code_valide', 'en_cours'].includes(course.statut ?? '') && styles.badgeInfo,
                                ]}>
                                    <Text style={styles.badgeText}>
                                        {statutLabel[course.statut ?? ''] ?? course.statut?.toUpperCase()}
                                    </Text>
                                </View>
                            </View>
                            <Text style={styles.addrLabel}>DÉPART</Text>
                            <Text style={styles.addr}>{course.adresse_depart}</Text>
                            <Text style={styles.arrow}>↓</Text>
                            <Text style={styles.addrLabel}>DESTINATION</Text>
                            <Text style={styles.addr}>{course.adresse_destination}</Text>
                            {course.montant && (
                                <Text style={styles.montant}>{Number(course.montant).toFixed(2)} €</Text>
                            )}
                            <View style={styles.btnRow}>
                                {course.statut === 'recherche' && (
                                    <TouchableOpacity style={styles.btnPrimary} onPress={() => handleAccept(course.id)}>
                                        <Text style={styles.btnPrimaryText}>Accepter</Text>
                                    </TouchableOpacity>
                                )}
                                {(course.statut === 'code_valide' || course.statut === 'en_cours') && (
                                    <TouchableOpacity style={styles.btnPrimary} onPress={() => handleFinish(course.id)}>
                                        <Text style={styles.btnPrimaryText}>Terminer</Text>
                                    </TouchableOpacity>
                                )}
                                {course.statut === 'acceptee' && (
                                    <Text style={styles.hintText}>→ Validez le code depuis l'écran Accueil</Text>
                                )}
                            </View>
                        </View>
                    ))
                )}
            </ScrollView>
            <BottomNav role="chauffeur" />
        </SafeAreaView>
    );
}

function makeStyles(colors: typeof Colors.nocturne) {
    return StyleSheet.create({
        safeArea: { flex: 1, backgroundColor: colors.background },
        scroll: { padding: 20, paddingBottom: 120 },
        title: {
            color: Colors.brand.info,
            fontSize: Typography.sizes.title,
            fontWeight: Typography.weights.black as any,
            marginBottom: 20,
        },
        loader: { marginTop: 32 },
        errorText: { color: Colors.brand.error, marginTop: 16 },
        emptyCard: {
            backgroundColor: colors.card,
            borderRadius: 18, padding: 32, alignItems: 'center',
            borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
            marginTop: 40,
        },
        emptyText: { color: colors.textSecondary, fontSize: Typography.sizes.body },
        card: {
            backgroundColor: colors.card,
            borderRadius: 18, padding: 18, marginBottom: 16,
            borderWidth: 1, borderColor: 'rgba(74,158,255,0.1)',
        },
        cardHeader: {
            flexDirection: 'row', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 14,
        },
        ref: {
            color: colors.textPrimary,
            fontSize: Typography.sizes.sub,
            fontWeight: Typography.weights.bold as any,
            fontFamily: 'monospace',
        },
        badge: {
            paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
            backgroundColor: 'rgba(106,102,128,0.2)',
        },
        badgeSuccess: { backgroundColor: 'rgba(76,175,130,0.15)' },
        badgeError: { backgroundColor: 'rgba(255,100,100,0.15)' },
        badgeInfo: { backgroundColor: 'rgba(74,158,255,0.15)' },
        badgeText: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.bold as any,
        },
        addrLabel: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.black as any,
            letterSpacing: 0.5,
            marginBottom: 2,
        },
        addr: { color: colors.textPrimary, fontSize: Typography.sizes.small, marginBottom: 4 },
        arrow: { color: colors.textSecondary, fontSize: Typography.sizes.tiny, marginVertical: 2 },
        montant: {
            color: Colors.brand.success,
            fontSize: Typography.sizes.header,
            fontWeight: Typography.weights.black as any,
            marginTop: 10,
        },
        btnRow: { marginTop: 14 },
        btnPrimary: {
            backgroundColor: Colors.brand.info,
            borderRadius: 12, paddingVertical: 12, alignItems: 'center',
        },
        btnPrimaryText: {
            color: '#FFFFFF',
            fontWeight: Typography.weights.bold as any,
            fontSize: Typography.sizes.body,
        },
        hintText: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
            fontStyle: 'italic',
        },
    });
}
