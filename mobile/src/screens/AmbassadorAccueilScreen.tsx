import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getAmbassadorDashboard } from '../services/api';
import PointsRing from '../components/PointsRing';
import BottomNav from '../components/BottomNav';
import { Colors, Typography } from '../theme';
import type { RootStackParamList, AmbassadorDashboard } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export default function AmbassadorAccueilScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AmbassadorAccueil'>>();
    const { ambassadorId } = useAuth();
    const [dashboard, setDashboard] = useState<AmbassadorDashboard | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function load() {
            if (!ambassadorId) return;
            try {
                const response = await getAmbassadorDashboard(ambassadorId);
                setDashboard(response.data);
            } catch {
                setError('Impossible de récupérer les données.');
            } finally {
                setLoading(false);
            }
        }
        load();
        const interval = setInterval(load, 10000);
        return () => clearInterval(interval);
    }, [ambassadorId]);

    const activeCourse = dashboard?.active_courses.find(c => ['recherche', 'acceptee', 'en_route', 'code_valide'].includes(c.statut || ''));

    if (loading) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator size="large" color={Colors.brand.gold} />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" />
            
            {/* Active Course Banner - PIVOT CONTEXT (Rule 1.4 & 9.0) */}
            {activeCourse && (
                <TouchableOpacity 
                    style={styles.activeBanner}
                    onPress={() => navigation.navigate('AmbassadorHome')}
                >
                    <View>
                        <Text style={styles.bannerTitle}>Course active</Text>
                        <Text style={styles.bannerSub}>{activeCourse.reference} • {activeCourse.statut?.toUpperCase()}</Text>
                    </View>
                    <View style={styles.bannerCode}>
                        <Text style={styles.bannerCodeText}>CODE PIVOT</Text>
                        <Text style={styles.bannerCodeValue}>{activeCourse.code_validation || '----'}</Text>
                    </View>
                </TouchableOpacity>
            )}

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <Text style={styles.welcomeText}>Bonjour {dashboard?.prenom} 👋</Text>
                    <View style={styles.pointsBadge}>
                        <Text style={styles.pointsBadgeText}>{dashboard?.points_solde} pts</Text>
                    </View>
                </View>

                {/* Points Ring - Progression Card (Rule 1.3) */}
                <View style={styles.ringCard}>
                    <PointsRing 
                        points={dashboard?.points_solde || 0} 
                        level={dashboard?.niveau || 'starter'} 
                        nextLevelPoints={dashboard?.next_level_target || 500} 
                    />
                    <Text style={styles.levelLabel}>Niveau {dashboard?.niveau.toUpperCase()}</Text>
                </View>

                {/* Main Action - Commander (Section 3.2) */}
                <TouchableOpacity 
                    style={styles.mainButton}
                    onPress={() => navigation.navigate('AmbassadorCommander')}
                >
                    <Text style={styles.mainButtonText}>🚗 Commander un véhicule</Text>
                </TouchableOpacity>

                {/* Week Stats - Performance Row */}
                <View style={styles.statsCard}>
                    <Text style={styles.statsTitle}>PERFORMANCE SEMAINE</Text>
                    <View style={styles.statsGrid}>
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>{dashboard?.active_course_count || 0}</Text>
                            <Text style={styles.statLabel}>Courses</Text>
                        </View>
                        <View style={styles.statItem}>
                            <Text style={[styles.statValue, { color: Colors.brand.gold }]}>+8</Text>
                            <Text style={styles.statLabel}>Points</Text>
                        </View>
                        <View style={styles.statItem}>
                            <Text style={[styles.statValue, { color: Colors.brand.success }]}>100%</Text>
                            <Text style={styles.statLabel}>Qualité</Text>
                        </View>
                    </View>
                </View>

                {/* Simplified Grid - No double Profil, No double Boutique (aligned with Section 3.1) */}
                <View style={styles.quickLinks}>
                    <TouchableOpacity style={styles.linkCard} onPress={() => navigation.navigate('AmbassadorParrainage')}>
                        <Text style={styles.linkEmoji}>🤝</Text>
                        <Text style={styles.linkLabel}>Parrainage</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.linkCard} onPress={() => navigation.navigate('AmbassadorBonsCadeaux')}>
                        <Text style={styles.linkEmoji}>🎫</Text>
                        <Text style={styles.linkLabel}>Mes Bons</Text>
                    </TouchableOpacity>
                </View>

            </ScrollView>

            <BottomNav role="ambassadeur" />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: Colors.nocturne.background,
    },
    container: {
        flex: 1,
        backgroundColor: Colors.nocturne.background,
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    },
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
    bannerTitle: {
        color: Colors.brand.gold,
        fontSize: Typography.sizes.small,
        fontWeight: Typography.weights.black as any,
        textTransform: 'uppercase',
    },
    bannerSub: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.small,
        marginTop: 2,
    },
    bannerCode: {
        backgroundColor: Colors.nocturne.card,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.brand.gold,
    },
    bannerCodeText: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.bold as any,
    },
    bannerCodeValue: {
        color: Colors.brand.gold,
        fontSize: Typography.sizes.body,
        fontWeight: Typography.weights.black as any,
        fontFamily: 'monospace',
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 100,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    welcomeText: {
        color: '#FFFFFF',
        fontSize: Typography.sizes.header,
        fontWeight: Typography.weights.bold as any,
    },
    pointsBadge: {
        backgroundColor: 'rgba(201, 168, 76, 0.15)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    pointsBadgeText: {
        color: Colors.brand.gold,
        fontWeight: Typography.weights.bold as any,
        fontSize: Typography.sizes.sub,
    },
    ringCard: {
        backgroundColor: Colors.nocturne.card,
        borderRadius: 24,
        paddingVertical: 20,
        alignItems: 'center',
        marginBottom: 20,
    },
    levelLabel: {
        color: Colors.brand.gold,
        fontSize: Typography.sizes.small,
        fontWeight: Typography.weights.black as any,
        marginTop: 10,
        letterSpacing: 1,
    },
    mainButton: {
        backgroundColor: Colors.brand.gold,
        borderRadius: 16,
        paddingVertical: 18,
        alignItems: 'center',
        marginBottom: 20,
    },
    mainButtonText: {
        color: '#09090F',
        fontSize: Typography.sizes.body,
        fontWeight: Typography.weights.black as any,
    },
    statsCard: {
        backgroundColor: Colors.nocturne.card,
        borderRadius: 18,
        padding: 18,
        marginBottom: 20,
    },
    statsTitle: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.bold as any,
        letterSpacing: 1,
        marginBottom: 16,
    },
    statsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    statItem: {
        alignItems: 'center',
        flex: 1,
    },
    statValue: {
        color: '#FFFFFF',
        fontSize: Typography.sizes.title,
        fontWeight: Typography.weights.black as any,
        marginBottom: 4,
    },
    statLabel: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.tiny,
    },
    quickLinks: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    linkCard: {
        backgroundColor: Colors.nocturne.card,
        width: '48%',
        borderRadius: 18,
        padding: 16,
        marginBottom: 16,
        alignItems: 'center',
    },
    linkEmoji: {
        fontSize: Typography.sizes.title,
        marginBottom: 8,
    },
    linkLabel: {
        color: Colors.nocturne.textPrimary,
        fontSize: Typography.sizes.sub,
        fontWeight: Typography.weights.bold as any,
        textAlign: 'center',
    },
    errorText: {
        color: Colors.brand.error,
        marginTop: 16,
    },
});
