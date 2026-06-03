import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, SafeAreaView, StatusBar, Share, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getAdminDashboard, getAdminParameters, exportAdminAmbassadeurs, exportAdminCourses } from '../services/api';
import { Colors, Typography } from '../theme';
import type { RootStackParamList, AdminKpis } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export default function AdminDashboardScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AdminDashboard'>>();
    const [kpis, setKpis] = useState<AdminKpis | null>(null);
    const [params, setParams] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState<string | null>(null);

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

    const handleExportAmbassadeurs = async () => {
        setExporting('ambassadeurs');
        try {
            const res = await exportAdminAmbassadeurs();
            const header = 'Prénom,Nom,Email,Téléphone,Niveau,Points,Contrat signé\n';
            const rows = res.data.map((r: any) =>
                `${r.prenom},${r.nom},${r.email},${r.telephone},${r.niveau},${r.points_solde},${r.contrat_moral_signe ? 'Oui' : 'Non'}`
            ).join('\n');
            await Share.share({ message: header + rows, title: 'Export ambassadeurs SESAME' });
        } catch {
            Alert.alert('Erreur', 'Impossible d\'exporter les ambassadeurs.');
        } finally {
            setExporting(null);
        }
    };

    const handleExportCourses = async () => {
        setExporting('courses');
        try {
            const res = await exportAdminCourses();
            const header = 'Référence,Statut,Type,Départ,Destination,Montant,Points\n';
            const rows = res.data.map((r: any) =>
                `${r.reference || ''},${r.statut || ''},${r.type || ''},${(r.adresse_depart || '').replace(/,/g, ' ')},${(r.adresse_destination || '').replace(/,/g, ' ')},${r.montant || ''},${r.points_attribues || 0}`
            ).join('\n');
            await Share.share({ message: header + rows, title: 'Export courses SESAME' });
        } catch {
            Alert.alert('Erreur', 'Impossible d\'exporter les courses.');
        } finally {
            setExporting(null);
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator size="large" color={Colors.brand.gold} />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="dark-content" />
            
            {/* Admin Header - Professional & Corporate */}
            <View style={styles.header}>
                <View style={styles.logoRow}>
                    <View style={styles.logo}><Text style={styles.logoText}>S</Text></View>
                    <View>
                        <Text style={styles.headerTitle}>SÉSAME PRO</Text>
                        <Text style={styles.headerSub}>PANEL D'ADMINISTRATION</Text>
                    </View>
                </View>
                <View style={styles.dateBadge}>
                    <Text style={styles.dateText}>MAI 2026</Text>
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                
                {/* Global KPIs - Revenue & Volume */}
                <View style={styles.kpiGrid}>
                    <View style={styles.kpiCard}>
                        <Text style={styles.kpiValue}>12 480,00 €</Text>
                        <Text style={styles.kpiLabel}>CA BRUT TOTAL</Text>
                    </View>
                    <View style={styles.kpiCard}>
                        <Text style={[styles.kpiValue, { color: Colors.clair.textPrimary }]}>{kpis?.totalCourses}</Text>
                        <Text style={styles.kpiLabel}>COURSES EFFECTUÉES</Text>
                    </View>
                    <View style={styles.kpiCard}>
                        <Text style={[styles.kpiValue, { color: Colors.brand.info }]}>{kpis?.totalAmbassadeurs}</Text>
                        <Text style={styles.kpiLabel}>AMBASSADEURS</Text>
                    </View>
                    <View style={styles.kpiCard}>
                        <Text style={[styles.kpiValue, { color: Colors.brand.success }]}>{kpis?.totalChauffeurs}</Text>
                        <Text style={styles.kpiLabel}>CHAUFFEURS ACTIFS</Text>
                    </View>
                </View>

                {/* Operations Row: Alerts & Top Performance */}
                <View style={styles.row}>
                    <View style={styles.infoBox}>
                        <Text style={styles.infoBoxTitle}>ALERTES OPÉRATIONNELLES</Text>
                        <View style={styles.alertItem}>
                            <View style={[styles.badge, styles.badgeRed]}><Text style={styles.badgeText}>LITIGE</Text></View>
                            <Text style={styles.alertText}>Course interrompue #842</Text>
                        </View>
                        <View style={styles.alertItem}>
                            <View style={[styles.badge, styles.badgeOrange]}><Text style={styles.badgeText}>ABSENCE</Text></View>
                            <Text style={styles.alertText}>Client non présent - Ahmed B.</Text>
                        </View>
                        <View style={styles.alertItem}>
                            <View style={[styles.badge, styles.badgeOrange]}><Text style={styles.badgeText}>DOCS</Text></View>
                            <Text style={styles.alertText}>RC Pro expiré - Karim A.</Text>
                        </View>
                    </View>

                    <View style={styles.infoBox}>
                        <Text style={styles.infoBoxTitle}>TOP PRESCRIPTEURS</Text>
                        <View style={styles.topItem}>
                            <Text style={styles.topNameGold}>1. JEAN DUPONT</Text>
                            <Text style={styles.topValueGold}>142 CRS</Text>
                        </View>
                        <View style={styles.topItem}>
                            <Text style={styles.topName}>2. SOPHIE MARTIN</Text>
                            <Text style={styles.topValue}>111 CRS</Text>
                        </View>
                        <View style={styles.topItem}>
                            <Text style={styles.topName}>3. KARIM AZIZ</Text>
                            <Text style={styles.topValue}>88 CRS</Text>
                        </View>
                    </View>
                </View>

                {/* Management Menu - Core Navigation */}
                <View style={styles.menu}>
                    <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('AdminCourses')}>
                        <Text style={styles.menuEmoji}>📋</Text>
                        <Text style={styles.menuLabel}>COURSES</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('AdminAmbassadeurs')}>
                        <Text style={styles.menuEmoji}>🤝</Text>
                        <Text style={styles.menuLabel}>AMBASSADEURS</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('AdminChauffeurs')}>
                        <Text style={styles.menuEmoji}>🚗</Text>
                        <Text style={styles.menuLabel}>CHAUFFEURS</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('AdminBlacklist')}>
                        <Text style={styles.menuEmoji}>🚫</Text>
                        <Text style={styles.menuLabel}>BLACKLIST</Text>
                    </TouchableOpacity>
                </View>

                {/* Exports CSV */}
                <View style={styles.settingsSection}>
                    <Text style={styles.sectionTitle}>EXPORTS DE DONNÉES</Text>
                    <View style={styles.exportRow}>
                        <TouchableOpacity
                            style={[styles.exportBtn, exporting === 'ambassadeurs' && styles.exportBtnDisabled]}
                            onPress={handleExportAmbassadeurs}
                            disabled={!!exporting}
                        >
                            {exporting === 'ambassadeurs'
                                ? <ActivityIndicator size="small" color="#FFFFFF" />
                                : <Text style={styles.exportBtnText}>📊 Ambassadeurs CSV</Text>
                            }
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.exportBtn, styles.exportBtnSecondary, exporting === 'courses' && styles.exportBtnDisabled]}
                            onPress={handleExportCourses}
                            disabled={!!exporting}
                        >
                            {exporting === 'courses'
                                ? <ActivityIndicator size="small" color={Colors.brand.info} />
                                : <Text style={[styles.exportBtnText, styles.exportBtnTextSecondary]}>📋 Courses CSV</Text>
                            }
                        </TouchableOpacity>
                    </View>
                </View>

                {/* System Parameters - Quick View */}
                <View style={styles.settingsSection}>
                    <Text style={styles.sectionTitle}>PARAMÈTRES SYSTÈME (MAI 2026)</Text>
                    {params.slice(0, 4).map(p => (
                        <View key={p.cle} style={styles.paramRow}>
                            <Text style={styles.paramCle}>{p.cle.toUpperCase()}</Text>
                            <Text style={styles.paramValeur}>{p.valeur}</Text>
                        </View>
                    ))}
                    <TouchableOpacity style={styles.settingsBtn}>
                        <Text style={styles.settingsBtnText}>GÉRER TOUS LES PARAMÈTRES</Text>
                    </TouchableOpacity>
                </View>

            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: Colors.clair.background,
    },
    container: {
        flex: 1,
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        backgroundColor: Colors.clair.card,
        paddingHorizontal: 20,
        paddingVertical: 18,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.05)',
    },
    logoRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    logo: {
        width: 32,
        height: 32,
        backgroundColor: Colors.brand.gold,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    logoText: {
        color: '#09090F',
        fontWeight: Typography.weights.black as any,
        fontSize: 18,
    },
    headerTitle: {
        fontSize: Typography.sizes.body,
        fontWeight: Typography.weights.black as any,
        color: Colors.clair.textPrimary,
    },
    headerSub: {
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.bold as any,
        color: Colors.clair.textSecondary,
        marginTop: 2,
    },
    dateBadge: {
        backgroundColor: Colors.clair.background,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    dateText: {
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.black as any,
        color: Colors.clair.textPrimary,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 40,
    },
    kpiGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 20,
    },
    kpiCard: {
        backgroundColor: Colors.clair.card,
        borderRadius: 12,
        padding: 16,
        width: '48.5%',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.03)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
    },
    kpiValue: {
        fontSize: Typography.sizes.header,
        fontWeight: Typography.weights.black as any,
        color: Colors.brand.gold,
        marginBottom: 6,
    },
    kpiLabel: {
        fontSize: Typography.sizes.tiny,
        color: Colors.clair.textSecondary,
        fontWeight: Typography.weights.bold as any,
        letterSpacing: 0.5,
    },
    row: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 20,
    },
    infoBox: {
        flex: 1,
        backgroundColor: Colors.clair.card,
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.03)',
    },
    infoBoxTitle: {
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.black as any,
        color: Colors.clair.textSecondary,
        letterSpacing: 1,
        marginBottom: 16,
    },
    alertItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    badge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        marginRight: 8,
    },
    badgeRed: {
        backgroundColor: 'rgba(255, 100, 100, 0.1)',
    },
    badgeOrange: {
        backgroundColor: 'rgba(255, 154, 60, 0.1)',
    },
    badgeText: {
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.black as any,
        color: Colors.clair.textPrimary,
    },
    alertText: {
        fontSize: Typography.sizes.small,
        fontWeight: Typography.weights.semiBold as any,
        color: Colors.clair.textPrimary,
    },
    topItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    topNameGold: {
        fontSize: Typography.sizes.small,
        fontWeight: Typography.weights.black as any,
        color: '#8A6200',
    },
    topValueGold: {
        fontSize: Typography.sizes.small,
        fontWeight: Typography.weights.bold as any,
        color: '#8A6200',
    },
    topName: {
        fontSize: Typography.sizes.small,
        fontWeight: Typography.weights.semiBold as any,
        color: Colors.clair.textSecondary,
    },
    topValue: {
        fontSize: Typography.sizes.small,
        fontWeight: Typography.weights.bold as any,
        color: Colors.clair.textPrimary,
    },
    menu: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 20,
    },
    menuItem: {
        backgroundColor: Colors.clair.card,
        width: '23.4%',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.03)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
    },
    menuEmoji: {
        fontSize: 22,
        marginBottom: 6,
    },
    menuLabel: {
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.black as any,
        color: Colors.clair.textPrimary,
    },
    settingsSection: {
        backgroundColor: Colors.clair.card,
        borderRadius: 12,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.03)',
    },
    sectionTitle: {
        fontSize: Typography.sizes.small,
        fontWeight: Typography.weights.black as any,
        color: Colors.clair.textSecondary,
        letterSpacing: 1,
        marginBottom: 20,
    },
    paramRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.02)',
    },
    paramCle: {
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.bold as any,
        color: Colors.clair.textSecondary,
    },
    paramValeur: {
        fontSize: Typography.sizes.small,
        fontWeight: Typography.weights.black as any,
        color: Colors.clair.textPrimary,
    },
    settingsBtn: {
        backgroundColor: Colors.brand.gold,
        borderRadius: 10,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 20,
    },
    settingsBtnText: {
        color: '#09090F',
        fontSize: Typography.sizes.sub,
        fontWeight: Typography.weights.black as any,
    },
    exportRow: {
        flexDirection: 'row',
        gap: 10,
    },
    exportBtn: {
        flex: 1,
        backgroundColor: Colors.brand.gold,
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 48,
    },
    exportBtnSecondary: {
        backgroundColor: 'rgba(74, 158, 255, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(74, 158, 255, 0.3)',
    },
    exportBtnDisabled: { opacity: 0.5 },
    exportBtnText: {
        color: '#09090F',
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.black as any,
    },
    exportBtnTextSecondary: {
        color: Colors.brand.info,
    },
});
