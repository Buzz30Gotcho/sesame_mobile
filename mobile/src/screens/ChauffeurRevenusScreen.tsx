import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar, TouchableOpacity, Linking, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLang } from '../context/LanguageContext';
import { getChauffeurCourses, getChauffeurBillingPortal } from '../services/api';
import { Colors, Typography } from '../theme';
import BottomNav from '../components/BottomNav';
import type { ActiveCourse } from '../types';

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
    const { chauffeurId } = useAuth();
    const { colors } = useTheme();
    const { t } = useLang();
    const [courses, setCourses] = useState<ActiveCourse[]>([]);
    const [periode, setPeriode] = useState<Periode>('semaine');
    const [loading, setLoading] = useState(true);
    const [portalLoading, setPortalLoading] = useState(false);

    const styles = useMemo(() => makeStyles(colors), [colors]);

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
        <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
            <StatusBar barStyle="light-content" backgroundColor={colors.background} />
            <ScrollView contentContainerStyle={styles.scroll}>
                <Text style={styles.title}>{t('revenus')}</Text>

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
                        <Text style={styles.kpiLabel}>{t('courses')}</Text>
                    </View>
                </View>

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

                {/* Portail de facturation Stripe */}
                <TouchableOpacity
                    style={styles.stripeLink}
                    disabled={portalLoading}
                    onPress={async () => {
                        if (!chauffeurId) return;
                        setPortalLoading(true);
                        try {
                            const r = await getChauffeurBillingPortal(chauffeurId);
                            await Linking.openURL(r.data.url);
                        } catch { /* Ignorer */ } finally {
                            setPortalLoading(false);
                        }
                    }}
                >
                    {portalLoading
                        ? <ActivityIndicator size="small" color={colors.textSecondary} />
                        : <Text style={styles.stripeLinkText}>Mes factures → Stripe</Text>
                    }
                </TouchableOpacity>
            </ScrollView>
            <BottomNav role="chauffeur" />
        </SafeAreaView>
    );
}

function makeStyles(colors: typeof Colors.nocturne) {
    return StyleSheet.create({
        safe: { flex: 1, backgroundColor: colors.background },
        scroll: { padding: 20, paddingBottom: 120 },
        title: {
            fontSize: Typography.sizes.title,
            fontWeight: Typography.weights.black as any,
            color: Colors.brand.gold,
            marginBottom: 20,
        },
        tabs: { flexDirection: 'row', gap: 8, marginBottom: 24 },
        tab: {
            flex: 1, paddingVertical: 10, borderRadius: 8,
            backgroundColor: colors.card, alignItems: 'center',
        },
        tabActive: { backgroundColor: Colors.brand.gold },
        tabText: { color: colors.textSecondary, fontWeight: Typography.weights.semiBold as any },
        tabTextActive: { color: '#101018' },
        kpiRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
        kpiCard: {
            flex: 1, backgroundColor: colors.card,
            borderRadius: 12, padding: 20, alignItems: 'center',
        },
        kpiValue: { fontSize: 26, fontWeight: Typography.weights.bold as any, color: colors.textPrimary },
        kpiLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
        section: { backgroundColor: colors.card, borderRadius: 12, padding: 16, marginBottom: 16 },
        sectionTitle: { fontSize: 14, color: colors.textSecondary, marginBottom: 12 },
        courseRow: {
            flexDirection: 'row', justifyContent: 'space-between',
            alignItems: 'center', paddingVertical: 10,
            borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
        },
        courseLeft: { flex: 1, marginRight: 12 },
        courseRef: { fontSize: 13, fontWeight: Typography.weights.semiBold as any, color: colors.textPrimary },
        courseAddr: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
        courseDate: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
        courseMontant: { fontSize: 15, fontWeight: Typography.weights.bold as any, color: Colors.brand.success },
        empty: { textAlign: 'center', color: colors.textSecondary, marginTop: 40 },
        stripeLink: { marginTop: 32, alignItems: 'center' },
        stripeLinkText: { color: colors.textSecondary, fontSize: 12, textDecorationLine: 'underline' },
    });
}
