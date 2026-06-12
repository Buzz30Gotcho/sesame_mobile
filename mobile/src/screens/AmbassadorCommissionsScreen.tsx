import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLang } from '../context/LanguageContext';
import { getCommissions } from '../services/api';
import { Colors } from '../theme';
import BottomNav from '../components/BottomNav';
import AccessDenied from '../components/AccessDenied';
import type { RootStackParamList, CommissionMois } from '../types';

export default function AmbassadorCommissionsScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const { ambassadorId, typeAmbassadeur, isSousCompte } = useAuth();
    const { colors } = useTheme();
    const { t, locale } = useLang();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const [mois, setMois] = useState<CommissionMois[]>([]);
    const [tauxPct, setTauxPct] = useState(10);
    const [totalGlobal, setTotalGlobal] = useState(0);
    const [selectedYear, setSelectedYear] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // Confidentialité (specs) : commissions réservées au responsable légal (Moral, compte principal).
    const isAllowed = typeAmbassadeur === 'moral' && !isSousCompte;

    useEffect(() => {
        if (!ambassadorId || !isAllowed) return;
        getCommissions(ambassadorId)
            .then(r => {
                setMois(r.data.mois);
                setTauxPct(r.data.taux_pct);
                setTotalGlobal(Number(r.data.total_commission ?? 0));
            })
            .finally(() => setLoading(false));
    }, [ambassadorId]);

    const moisCourant = new Date().toISOString().slice(0, 7);
    const commissionMoisCourant = mois.find(m => m.mois === moisCourant);

    const formatMoisMois = (moisStr: string) => {
        const [y, m] = moisStr.split('-');
        return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString(locale, { month: 'long' });
    };

    // Sélecteur d'année : la liste mensuelle est filtrée par année pour éviter un scroll infini.
    const years = Array.from(new Set(mois.map(m => m.mois.slice(0, 4)))).sort((a, b) => b.localeCompare(a));
    const effectiveYear = selectedYear && years.includes(selectedYear) ? selectedYear : years[0];
    const moisAnnee = mois.filter(m => m.mois.startsWith(`${effectiveYear}-`));
    const totalAnnee = moisAnnee.reduce((s, m) => s + Number(m.commission ?? 0), 0);

    if (!isAllowed) {
        return <AccessDenied message="Les commissions ne sont visibles que par le responsable légal de l'entreprise." />;
    }

    return (
        <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
            <StatusBar barStyle={colors.background === '#101018' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
            <ScrollView contentContainerStyle={styles.scroll}>
                <Text style={styles.title}>{t('commissions')}</Text>
                <Text style={styles.sub}>{t('taux_par_course').replace('{taux}', String(tauxPct))}</Text>

                {loading && <ActivityIndicator color={Colors.brand.gold} style={{ marginTop: 40 }} />}

                {!loading && (
                    <>
                        {/* Mois courant en vedette */}
                        <View style={styles.hero}>
                            <Text style={styles.heroLabel}>{t('ce_mois')}</Text>
                            <Text style={styles.heroValue}>
                                {Number(commissionMoisCourant?.commission ?? 0).toFixed(2)} €
                            </Text>
                            <Text style={styles.heroSub}>
                                {t('courses_ca').replace('{nb}', String(commissionMoisCourant?.nb_courses ?? 0)).replace('{ca}', Number(commissionMoisCourant?.ca_brut_ttc ?? 0).toFixed(2))}
                            </Text>
                            <Text style={styles.heroNote}>{t('versement_1er_mois')}</Text>
                        </View>

                        {/* Historique */}
                        {mois.length > 0 && (
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>{t('historique_12_mois')}</Text>

                                {/* Sélecteur d'année (affiché si plusieurs années) */}
                                {years.length > 1 && (
                                    <ScrollView
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        contentContainerStyle={styles.yearBar}
                                    >
                                        {years.map(y => (
                                            <TouchableOpacity
                                                key={y}
                                                style={[styles.yearChip, y === effectiveYear && styles.yearChipActive]}
                                                onPress={() => setSelectedYear(y)}
                                            >
                                                <Text style={[styles.yearChipText, y === effectiveYear && styles.yearChipTextActive]}>{y}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                )}

                                {moisAnnee.map(m => (
                                    <View key={m.mois} style={styles.row}>
                                        <View>
                                            <Text style={styles.rowMois}>{formatMoisMois(m.mois)}</Text>
                                            <Text style={styles.rowSub}>{t('courses_ca').replace('{nb}', String(m.nb_courses)).replace('{ca}', Number(m.ca_brut_ttc).toFixed(2))}</Text>
                                        </View>
                                        <Text style={styles.rowCommission}>
                                            + {Number(m.commission).toFixed(2)} €
                                        </Text>
                                    </View>
                                ))}

                                {/* Total de l'année sélectionnée */}
                                <View style={styles.totalRow}>
                                    <Text style={styles.totalLabel}>Total {effectiveYear}</Text>
                                    <Text style={styles.totalValue}>{totalAnnee.toFixed(2)} €</Text>
                                </View>
                                {/* Total tous mois confondus */}
                                <View style={styles.grandTotalRow}>
                                    <Text style={styles.grandTotalLabel}>{t('total_cumule')}</Text>
                                    <Text style={styles.grandTotalValue}>{totalGlobal.toFixed(2)} €</Text>
                                </View>
                            </View>
                        )}

                        {mois.length === 0 && (
                            <Text style={styles.empty}>{t('aucune_commission')}</Text>
                        )}
                    </>
                )}
            </ScrollView>
            <BottomNav role="ambassadeur" />
        </SafeAreaView>
    );
}

function makeStyles(colors: typeof Colors.nocturne) {
    return StyleSheet.create({
        safe: { flex: 1, backgroundColor: colors.background },
        scroll: { padding: 20, paddingBottom: 120 },
        title: { fontSize: 24, fontWeight: '700', color: Colors.brand.gold, marginBottom: 4 },
        sub: { fontSize: 13, color: colors.textSecondary, marginBottom: 24 },
        hero: {
            backgroundColor: colors.card,
            borderRadius: 16, padding: 24,
            alignItems: 'center', marginBottom: 20,
            borderWidth: 1, borderColor: Colors.brand.gold + '40',
        },
        heroLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 8 },
        heroValue: { fontSize: 40, fontWeight: '700', color: Colors.brand.gold },
        heroSub: { fontSize: 13, color: colors.textSecondary, marginTop: 6 },
        heroNote: { fontSize: 11, color: colors.textSecondary, marginTop: 10, textAlign: 'center', fontStyle: 'italic' },
        section: { backgroundColor: colors.card, borderRadius: 12, padding: 16 },
        sectionTitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 12 },
        row: {
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1E1E30',
        },
        rowMois: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
        rowSub: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
        rowCommission: { fontSize: 15, fontWeight: '700', color: Colors.brand.success },
        totalRow: {
            flexDirection: 'row', justifyContent: 'space-between',
            alignItems: 'center', paddingTop: 12, marginTop: 4,
        },
        totalLabel: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
        totalValue: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
        yearBar: { gap: 8, paddingBottom: 14 },
        yearChip: {
            paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20,
            backgroundColor: colors.background, borderWidth: 1, borderColor: '#1E1E30',
        },
        yearChipActive: { backgroundColor: Colors.brand.gold, borderColor: Colors.brand.gold },
        yearChipText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
        yearChipTextActive: { color: '#101018' },
        grandTotalRow: {
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            paddingTop: 12, marginTop: 8, borderTopWidth: 1, borderTopColor: '#1E1E30',
        },
        grandTotalLabel: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
        grandTotalValue: { fontSize: 18, fontWeight: '700', color: Colors.brand.gold },
        empty: { textAlign: 'center', color: colors.textSecondary, marginTop: 40 },
    });
}
