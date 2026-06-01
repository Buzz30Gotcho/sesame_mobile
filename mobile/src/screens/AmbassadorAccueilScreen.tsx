import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getAmbassadorDashboard } from '../services/api';
import PointsRing from '../components/PointsRing';
import type { RootStackParamList, AmbassadorDashboard, ActiveCourse } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export default function AmbassadorAccueilScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AmbassadorAccueil'>>();
    const { ambassadorId, logout } = useAuth();
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
    }, [ambassadorId]);

    const activeCourse = dashboard?.active_courses.find(c => ['recherche', 'acceptee', 'en_route', 'code_valide'].includes(c.statut || ''));

    if (loading) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator size="large" color="#C9A84C" />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" />
            
            {/* Active Course Banner */}
            {activeCourse && (
                <TouchableOpacity 
                    style={styles.activeBanner}
                    onPress={() => navigation.navigate('AmbassadorHome')} // Should go to active course details
                >
                    <View>
                        <Text style={styles.bannerTitle}>Course active</Text>
                        <Text style={styles.bannerSub}>{activeCourse.reference} • {activeCourse.statut}</Text>
                    </View>
                    <View style={styles.bannerCode}>
                        <Text style={styles.bannerCodeText}>CODE</Text>
                        <Text style={styles.bannerCodeValue}>5821</Text>
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

                {/* Points Ring */}
                <View style={styles.ringCard}>
                    <PointsRing 
                        points={dashboard?.points_solde || 0} 
                        level={dashboard?.niveau || 'starter'} 
                        nextLevelPoints={dashboard?.next_level_target || 500} 
                    />
                </View>

                {/* Main Action */}
                <TouchableOpacity 
                    style={styles.mainButton}
                    onPress={() => navigation.navigate('AmbassadorCommander')}
                >
                    <Text style={styles.mainButtonText}>🚗 Commander un véhicule</Text>
                </TouchableOpacity>

                {/* Week Stats */}
                <View style={styles.statsCard}>
                    <Text style={styles.statsTitle}>CETTE SEMAINE</Text>
                    <View style={styles.statsGrid}>
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>12</Text>
                            <Text style={styles.statLabel}>Courses</Text>
                        </View>
                        <View style={styles.statItem}>
                            <Text style={[styles.statValue, { color: '#C9A84C' }]}>+8</Text>
                            <Text style={styles.statLabel}>Points</Text>
                        </View>
                        <View style={styles.statItem}>
                            <Text style={[styles.statValue, { color: '#4CAF82' }]}>100%</Text>
                            <Text style={styles.statLabel}>Satisfaits</Text>
                        </View>
                    </View>
                </View>

                {/* Navigation Grid (Quick Links) */}
                <View style={styles.quickLinks}>
                    <TouchableOpacity style={styles.linkCard} onPress={() => navigation.navigate('AmbassadorBoutique')}>
                        <Text style={styles.linkEmoji}>🎁</Text>
                        <Text style={styles.linkLabel}>Boutique</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.linkCard} onPress={() => navigation.navigate('AmbassadorNiveaux')}>
                        <Text style={styles.linkEmoji}>🏆</Text>
                        <Text style={styles.linkLabel}>Niveaux</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.linkCard} onPress={() => navigation.navigate('AmbassadorParrainage')}>
                        <Text style={styles.linkEmoji}>🤝</Text>
                        <Text style={styles.linkLabel}>Parrainage</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.linkCard} onPress={() => navigation.navigate('AmbassadorProfil')}>
                        <Text style={styles.linkEmoji}>👤</Text>
                        <Text style={styles.linkLabel}>Profil</Text>
                    </TouchableOpacity>
                </View>

            </ScrollView>

            {/* Bottom Nav Bar (Simulated) */}
            <View style={styles.bottomNav}>
                <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('AmbassadorAccueil')}>
                    <Text style={[styles.navIcon, { color: '#C9A84C' }]}>🏠</Text>
                    <Text style={[styles.navLabel, { color: '#C9A84C' }]}>Accueil</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('AmbassadorHome')}>
                    <Text style={styles.navIcon}>🚗</Text>
                    <Text style={styles.navLabel}>VTC</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('AmbassadorBoutique')}>
                    <Text style={styles.navIcon}>🎁</Text>
                    <Text style={styles.navLabel}>Boutique</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('AmbassadorNiveaux')}>
                    <Text style={styles.navIcon}>🏆</Text>
                    <Text style={styles.navLabel}>Niveaux</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('AmbassadorProfil')}>
                    <Text style={styles.navIcon}>👤</Text>
                    <Text style={styles.navLabel}>Profil</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#101018',
    },
    container: {
        flex: 1,
        backgroundColor: '#101018',
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
        color: '#C9A84C',
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
    bannerSub: {
        color: '#6A6680',
        fontSize: 10,
        marginTop: 2,
    },
    bannerCode: {
        backgroundColor: '#161624',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#C9A84C',
    },
    bannerCodeText: {
        color: '#6A6680',
        fontSize: 8,
        fontWeight: '700',
    },
    bannerCodeValue: {
        color: '#C9A84C',
        fontSize: 14,
        fontWeight: '900',
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
        fontSize: 20,
        fontWeight: '700',
    },
    pointsBadge: {
        backgroundColor: 'rgba(201, 168, 76, 0.15)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    pointsBadgeText: {
        color: '#C9A84C',
        fontWeight: '700',
        fontSize: 12,
    },
    ringCard: {
        backgroundColor: '#161624',
        borderRadius: 24,
        paddingVertical: 20,
        alignItems: 'center',
        marginBottom: 20,
    },
    mainButton: {
        backgroundColor: '#C9A84C',
        borderRadius: 16,
        paddingVertical: 18,
        alignItems: 'center',
        marginBottom: 20,
        shadowColor: '#C9A84C',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    mainButtonText: {
        color: '#09090F',
        fontSize: 16,
        fontWeight: '900',
    },
    statsCard: {
        backgroundColor: '#161624',
        borderRadius: 18,
        padding: 18,
        marginBottom: 20,
    },
    statsTitle: {
        color: '#6A6680',
        fontSize: 10,
        fontWeight: '700',
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
        fontSize: 22,
        fontWeight: '800',
        marginBottom: 4,
    },
    statLabel: {
        color: '#6A6680',
        fontSize: 10,
    },
    quickLinks: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    linkCard: {
        backgroundColor: '#161624',
        width: '48%',
        borderRadius: 18,
        padding: 16,
        marginBottom: 16,
        alignItems: 'center',
    },
    linkEmoji: {
        fontSize: 24,
        marginBottom: 8,
    },
    linkLabel: {
        color: '#E0DBD2',
        fontSize: 12,
        fontWeight: '600',
    },
    bottomNav: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 80,
        backgroundColor: '#161624',
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingBottom: 20,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)',
    },
    navItem: {
        alignItems: 'center',
    },
    navIcon: {
        fontSize: 20,
        color: '#6A6680',
        marginBottom: 4,
    },
    navLabel: {
        fontSize: 10,
        color: '#6A6680',
    },
});
