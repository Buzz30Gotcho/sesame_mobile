import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getAdminDashboard, getAdminParameters } from '../services/api';
import type { RootStackParamList, AdminKpis } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export default function AdminDashboardScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AdminDashboard'>>();
    const [kpis, setKpis] = useState<AdminKpis | null>(null);
    const [params, setParams] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            try {
                const [kpiRes, paramRes] = await Promise.all([
                    getAdminDashboard(),
                    getAdminParameters()
                ]);
                setKpis(kpiRes.data);
                setParams(paramRes.data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    if (loading) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator size="large" color="#C9A84C" />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
                <View style={styles.logoRow}>
                    <View style={styles.logo}><Text style={styles.logoText}>S</Text></View>
                    <Text style={styles.headerTitle}>SÉSAME</Text>
                    <Text style={styles.headerSub}>Administration</Text>
                </View>
                <Text style={styles.dateText}>Mai 2026</Text>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                
                {/* KPIs Grid */}
                <View style={styles.kpiGrid}>
                    <View style={styles.kpiCard}>
                        <Text style={styles.kpiValue}>12 480 €</Text>
                        <Text style={styles.kpiLabel}>CA BRUT MAI</Text>
                    </View>
                    <View style={styles.kpiCard}>
                        <Text style={[styles.kpiValue, { color: '#FFFFFF' }]}>{kpis?.totalCourses}</Text>
                        <Text style={styles.kpiLabel}>COURSES</Text>
                    </View>
                    <View style={styles.kpiCard}>
                        <Text style={[styles.kpiValue, { color: '#4A9EFF' }]}>{kpis?.totalAmbassadeurs}</Text>
                        <Text style={styles.kpiLabel}>AMBASSADEURS</Text>
                    </View>
                    <View style={styles.kpiCard}>
                        <Text style={[styles.kpiValue, { color: '#FFFFFF' }]}>{kpis?.totalChauffeurs}</Text>
                        <Text style={styles.kpiLabel}>CHAUFFEURS ACTIFS</Text>
                    </View>
                </View>

                {/* Alerts and Top Sections */}
                <View style={styles.row}>
                    <View style={styles.infoBox}>
                        <Text style={styles.infoBoxTitle}>ALERTES ACTIVES</Text>
                        <View style={styles.alertItem}>
                            <View style={[styles.badge, styles.badgeRed]}><Text style={styles.badgeText}>Cas B</Text></View>
                            <Text style={styles.alertText}>Course interrompue</Text>
                        </View>
                        <View style={styles.alertItem}>
                            <View style={[styles.badge, styles.badgeOrange]}><Text style={styles.badgeText}>⏳</Text></View>
                            <Text style={styles.alertText}>Client absent — Ahmed B.</Text>
                        </View>
                        <View style={styles.alertItem}>
                            <View style={[styles.badge, styles.badgeOrange]}><Text style={styles.badgeText}>📄</Text></View>
                            <Text style={styles.alertText}>Document expiré — Karim A.</Text>
                        </View>
                    </View>

                    <View style={styles.infoBox}>
                        <Text style={styles.infoBoxTitle}>TOP AMBASSADEURS</Text>
                        <View style={styles.topItem}>
                            <Text style={styles.topNameGold}>1. Jean Dupont</Text>
                            <Text style={styles.topValueGold}>142 courses</Text>
                        </View>
                        <View style={styles.topItem}>
                            <Text style={styles.topName}>2. Sophie Martin</Text>
                            <Text style={styles.topValue}>111 courses</Text>
                        </View>
                        <View style={styles.topItem}>
                            <Text style={styles.topName}>3. Karim Aziz</Text>
                            <Text style={styles.topValue}>88 courses</Text>
                        </View>
                    </View>
                </View>

                {/* Navigation Menu */}
                <View style={styles.menu}>
                    <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('AdminCourses')}>
                        <Text style={styles.menuEmoji}>📋</Text>
                        <Text style={styles.menuLabel}>Courses</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('AdminAmbassadeurs')}>
                        <Text style={styles.menuEmoji}>🤝</Text>
                        <Text style={styles.menuLabel}>Ambassadeurs</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('AdminChauffeurs')}>
                        <Text style={styles.menuEmoji}>🚗</Text>
                        <Text style={styles.menuLabel}>Chauffeurs</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('AdminBlacklist')}>
                        <Text style={styles.menuEmoji}>🚫</Text>
                        <Text style={styles.menuLabel}>Blacklist</Text>
                    </TouchableOpacity>
                </View>

                {/* Settings Section (New as per spec) */}
                <View style={styles.settingsSection}>
                    <Text style={styles.sectionTitle}>PARAMÈTRES SYSTÈME</Text>
                    {params.map(p => (
                        <View key={p.cle} style={styles.paramRow}>
                            <Text style={styles.paramCle}>{p.cle}</Text>
                            <Text style={styles.paramValeur}>{p.valeur}</Text>
                        </View>
                    ))}
                    <TouchableOpacity style={styles.settingsBtn}>
                        <Text style={styles.settingsBtnText}>Gérer tous les paramètres</Text>
                    </TouchableOpacity>
                </View>

            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#F2F2F7',
    },
    container: {
        flex: 1,
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 20,
        paddingVertical: 15,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.1)',
    },
    logoRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    logo: {
        width: 24,
        height: 24,
        backgroundColor: '#C9A84C',
        borderRadius: 4,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
    },
    logoText: {
        color: '#09090F',
        fontWeight: '900',
        fontSize: 14,
    },
    headerTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1C1C2E',
        marginRight: 8,
    },
    headerSub: {
        fontSize: 11,
        color: '#777788',
    },
    dateText: {
        fontSize: 10,
        fontWeight: '600',
        color: '#1C1C2E',
    },
    scrollContent: {
        padding: 16,
    },
    kpiGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 16,
    },
    kpiCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        padding: 12,
        width: '48%',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    kpiValue: {
        fontSize: 18,
        fontWeight: '800',
        color: '#C9A84C',
        marginBottom: 4,
    },
    kpiLabel: {
        fontSize: 8,
        color: '#777788',
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    row: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 16,
    },
    infoBox: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
    },
    infoBoxTitle: {
        fontSize: 8,
        fontWeight: '700',
        color: '#777788',
        letterSpacing: 1,
        marginBottom: 12,
    },
    alertItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    badge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        marginRight: 6,
    },
    badgeRed: {
        backgroundColor: 'rgba(204, 34, 34, 0.1)',
    },
    badgeOrange: {
        backgroundColor: 'rgba(204, 102, 0, 0.1)',
    },
    badgeText: {
        fontSize: 8,
        fontWeight: '700',
        color: '#1C1C2E',
    },
    alertText: {
        fontSize: 9,
        color: '#1C1C2E',
    },
    topItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    topNameGold: {
        fontSize: 9,
        fontWeight: '700',
        color: '#8A6200',
    },
    topValueGold: {
        fontSize: 9,
        color: '#8A6200',
    },
    topName: {
        fontSize: 9,
        color: '#777788',
    },
    topValue: {
        fontSize: 9,
        color: '#1C1C2E',
    },
    menu: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 16,
    },
    menuItem: {
        backgroundColor: '#FFFFFF',
        width: '23%',
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
    },
    menuEmoji: {
        fontSize: 18,
        marginBottom: 4,
    },
    menuLabel: {
        fontSize: 8,
        fontWeight: '600',
        color: '#1C1C2E',
    },
    settingsSection: {
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
    },
    sectionTitle: {
        fontSize: 10,
        fontWeight: '700',
        color: '#777788',
        letterSpacing: 1,
        marginBottom: 16,
    },
    paramRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.03)',
    },
    paramCle: {
        fontSize: 9,
        color: '#777788',
    },
    paramValeur: {
        fontSize: 9,
        fontWeight: '700',
        color: '#1C1C2E',
    },
    settingsBtn: {
        backgroundColor: '#C9A84C',
        borderRadius: 8,
        paddingVertical: 10,
        alignItems: 'center',
        marginTop: 12,
    },
    settingsBtnText: {
        color: '#09090F',
        fontSize: 10,
        fontWeight: '700',
    },
});
