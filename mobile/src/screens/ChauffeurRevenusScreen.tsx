import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, StatusBar, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { getChauffeurCourses } from '../services/api';
import { Colors } from '../theme';
import BottomNav from '../components/BottomNav';
import type { RootStackParamList, ActiveCourse } from '../types';

type Periode = 'jour' | 'semaine' | 'mois';

function isInPeriod(date: string | undefined, periode: Periode): boolean {
    if (!date) return false;
    const d = new Date(date);
    const now = new Date();
    if (periode === 'jour') {
        return d.toDateString() === now.toDateString();
    }
    if (periode === 'semaine') {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        return d >= startOfWeek;
    }
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

export default function ChauffeurRevenusScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const { chauffeurId } = useAuth();
    const [courses, setCourses] = useState<ActiveCourse[]>([]);
    const [periode, setPeriode] = useState<Periode>('semaine');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!chauffeurId) return;
        getChauffeurCourses(chauffeurId)
            .then(r => setCourses(r.data.filter(c => c.statut === 'terminee')))
            .finally(() => setLoading(false));
    }, [chauffeurId]);

    const filtered = courses.filter(c => isInPeriod(c.date_fin, periode));
    const ca = filtered.reduce((sum, c) => sum + Number(c.montant ?? 0), 0);
    const nbCourses = filtered.length;

    return (
        <SafeAreaView style={styles.safe}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.nocturne.background} />
            <ScrollView contentContainerStyle={styles.scroll}>
                <Text style={styles.title}>Revenus</Text>

                {/* Sélecteur période */}
                <View style={styles.tabs}>
                    {(['jour', 'semaine', 'mois'] as Periode[]).map(p => (
                        <TouchableOpacity
                            key={p}
                            style={[styles.tab, periode === p && styles.tabActive]}
                            onPress={() => setPeriode(p)}
                        >
                            <Text style={[styles.tabText, periode === p && styles.tabTextActive]}>
                                {p.charAt(0).toUpperCase() + p.slice(1)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* KPIs */}
                <View style={styles.kpiRow}>
                    <View style={styles.kpiCard}>
                        <Text style={styles.kpiValue}>{ca.toFixed(2)} €</Text>
                        <Text style={styles.kpiLabel}>CA encaissé</Text>
                    </View>
                    <View style={styles.kpiCard}>
                        <Text style={styles.kpiValue}>{nbCourses}</Text>
                        <Text style={styles.kpiLabel}>courses</Text>
                    </View>
                </View>

                {/* Graphique simplifié — barres par jour */}
                {nbCourses > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Détail par course</Text>
                        {filtered.map((c, i) => (
                            <View key={c.id ?? i} style={styles.courseRow}>
                                <View style={styles.courseLeft}>
                                    <Text style={styles.courseRef}>{c.reference ?? `Course #${i + 1}`}</Text>
                                    <Text style={styles.courseAddr} numberOfLines={1}>
                                        {c.adresse_depart} → {c.adresse_destination}
                                    </Text>
                                    {c.date_fin && (
                                        <Text style={styles.courseDate}>
                                            {new Date(c.date_fin).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                        </Text>
                                    )}
                                </View>
                                <Text style={styles.courseMontant}>
                                    {Number(c.montant ?? 0).toFixed(2)} €
                                </Text>
                            </View>
                        ))}
                    </View>
                )}

                {nbCourses === 0 && !loading && (
                    <Text style={styles.empty}>Aucune course terminée sur cette période.</Text>
                )}

                {/* Lien Stripe discret */}
                <TouchableOpacity style={styles.stripeLink}>
                    <Text style={styles.stripeLinkText}>Mes factures → Stripe</Text>
                </TouchableOpacity>
            </ScrollView>
            <BottomNav role="chauffeur" active="revenus" navigation={navigation} />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.nocturne.background },
    scroll: { padding: 20, paddingBottom: 100 },
    title: { fontSize: 24, fontWeight: '700', color: Colors.brand.gold, marginBottom: 20 },
    tabs: { flexDirection: 'row', gap: 8, marginBottom: 24 },
    tab: {
        flex: 1, paddingVertical: 10, borderRadius: 8,
        backgroundColor: Colors.nocturne.card, alignItems: 'center',
    },
    tabActive: { backgroundColor: Colors.brand.gold },
    tabText: { color: Colors.nocturne.textSecondary, fontWeight: '600' },
    tabTextActive: { color: '#101018' },
    kpiRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
    kpiCard: {
        flex: 1, backgroundColor: Colors.nocturne.card,
        borderRadius: 12, padding: 20, alignItems: 'center',
    },
    kpiValue: { fontSize: 26, fontWeight: '700', color: Colors.nocturne.textPrimary },
    kpiLabel: { fontSize: 12, color: Colors.nocturne.textSecondary, marginTop: 4 },
    section: { backgroundColor: Colors.nocturne.card, borderRadius: 12, padding: 16, marginBottom: 16 },
    sectionTitle: { fontSize: 14, color: Colors.nocturne.textSecondary, marginBottom: 12 },
    courseRow: {
        flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'center', paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: '#1E1E30',
    },
    courseLeft: { flex: 1, marginRight: 12 },
    courseRef: { fontSize: 13, fontWeight: '600', color: Colors.nocturne.textPrimary },
    courseAddr: { fontSize: 11, color: Colors.nocturne.textSecondary, marginTop: 2 },
    courseDate: { fontSize: 11, color: Colors.nocturne.textSecondary, marginTop: 2 },
    courseMontant: { fontSize: 15, fontWeight: '700', color: Colors.brand.success },
    empty: { textAlign: 'center', color: Colors.nocturne.textSecondary, marginTop: 40 },
    stripeLink: { marginTop: 32, alignItems: 'center' },
    stripeLinkText: { color: Colors.nocturne.textSecondary, fontSize: 12, textDecorationLine: 'underline' },
});
