import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, StatusBar, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { getCommissions } from '../services/api';
import { Colors } from '../theme';
import BottomNav from '../components/BottomNav';
import type { RootStackParamList, CommissionMois } from '../types';

export default function AmbassadorCommissionsScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const { ambassadorId } = useAuth();
    const [mois, setMois] = useState<CommissionMois[]>([]);
    const [tauxPct, setTauxPct] = useState(10);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!ambassadorId) return;
        getCommissions(ambassadorId)
            .then(r => {
                setMois(r.data.mois);
                setTauxPct(r.data.taux_pct);
            })
            .finally(() => setLoading(false));
    }, [ambassadorId]);

    const totalCommission = mois.reduce((s, m) => s + Number(m.commission ?? 0), 0);
    const moisCourant = new Date().toISOString().slice(0, 7);
    const commissionMoisCourant = mois.find(m => m.mois === moisCourant);

    const formatMois = (moisStr: string) => {
        const [y, m] = moisStr.split('-');
        const noms = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
        return `${noms[parseInt(m) - 1]} ${y}`;
    };

    return (
        <SafeAreaView style={styles.safe}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.nocturne.background} />
            <ScrollView contentContainerStyle={styles.scroll}>
                <Text style={styles.title}>Commissions</Text>
                <Text style={styles.sub}>Taux : {tauxPct}% TTC par course</Text>

                {loading && <ActivityIndicator color={Colors.brand.gold} style={{ marginTop: 40 }} />}

                {!loading && (
                    <>
                        {/* Mois courant en vedette */}
                        <View style={styles.hero}>
                            <Text style={styles.heroLabel}>Ce mois</Text>
                            <Text style={styles.heroValue}>
                                {Number(commissionMoisCourant?.commission ?? 0).toFixed(2)} €
                            </Text>
                            <Text style={styles.heroSub}>
                                {commissionMoisCourant?.nb_courses ?? 0} courses · {Number(commissionMoisCourant?.ca_brut_ttc ?? 0).toFixed(2)} € CA
                            </Text>
                            <Text style={styles.heroNote}>
                                Versement le 1er du mois suivant par virement SEPA
                            </Text>
                        </View>

                        {/* Historique */}
                        {mois.length > 0 && (
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Historique (12 derniers mois)</Text>
                                {mois.map(m => (
                                    <View key={m.mois} style={styles.row}>
                                        <View>
                                            <Text style={styles.rowMois}>{formatMois(m.mois)}</Text>
                                            <Text style={styles.rowSub}>{m.nb_courses} courses · {Number(m.ca_brut_ttc).toFixed(2)} € CA</Text>
                                        </View>
                                        <Text style={styles.rowCommission}>
                                            + {Number(m.commission).toFixed(2)} €
                                        </Text>
                                    </View>
                                ))}
                                <View style={styles.totalRow}>
                                    <Text style={styles.totalLabel}>Total cumulé</Text>
                                    <Text style={styles.totalValue}>{totalCommission.toFixed(2)} €</Text>
                                </View>
                            </View>
                        )}

                        {mois.length === 0 && (
                            <Text style={styles.empty}>Aucune commission enregistrée pour l'instant.</Text>
                        )}
                    </>
                )}
            </ScrollView>
            <BottomNav role="ambassadeur" active="commissions" navigation={navigation} />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.nocturne.background },
    scroll: { padding: 20, paddingBottom: 100 },
    title: { fontSize: 24, fontWeight: '700', color: Colors.brand.gold, marginBottom: 4 },
    sub: { fontSize: 13, color: Colors.nocturne.textSecondary, marginBottom: 24 },
    hero: {
        backgroundColor: Colors.nocturne.card,
        borderRadius: 16, padding: 24,
        alignItems: 'center', marginBottom: 20,
        borderWidth: 1, borderColor: Colors.brand.gold + '40',
    },
    heroLabel: { fontSize: 12, color: Colors.nocturne.textSecondary, marginBottom: 8 },
    heroValue: { fontSize: 40, fontWeight: '700', color: Colors.brand.gold },
    heroSub: { fontSize: 13, color: Colors.nocturne.textSecondary, marginTop: 6 },
    heroNote: { fontSize: 11, color: Colors.nocturne.textSecondary, marginTop: 10, textAlign: 'center', fontStyle: 'italic' },
    section: { backgroundColor: Colors.nocturne.card, borderRadius: 12, padding: 16 },
    sectionTitle: { fontSize: 13, color: Colors.nocturne.textSecondary, marginBottom: 12 },
    row: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1E1E30',
    },
    rowMois: { fontSize: 14, fontWeight: '600', color: Colors.nocturne.textPrimary },
    rowSub: { fontSize: 11, color: Colors.nocturne.textSecondary, marginTop: 2 },
    rowCommission: { fontSize: 15, fontWeight: '700', color: Colors.brand.success },
    totalRow: {
        flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'center', paddingTop: 12, marginTop: 4,
    },
    totalLabel: { fontSize: 14, fontWeight: '600', color: Colors.nocturne.textPrimary },
    totalValue: { fontSize: 18, fontWeight: '700', color: Colors.brand.gold },
    empty: { textAlign: 'center', color: Colors.nocturne.textSecondary, marginTop: 40 },
});
