import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getAmbassadorDashboard } from '../services/api';
import type { RootStackParamList, AmbassadorDashboard } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export default function AmbassadorHomeScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AmbassadorHome'>>();
    const { ambassadorId, logout } = useAuth();
    const [dashboard, setDashboard] = useState<AmbassadorDashboard | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadDashboard() {
            if (!ambassadorId) {
                setError('Identifiant Ambassadeur manquant');
                setLoading(false);
                return;
            }
            try {
                const response = await getAmbassadorDashboard(ambassadorId);
                setDashboard(response.data);
            } catch (err) {
                setError('Impossible de charger le tableau de bord.');
            } finally {
                setLoading(false);
            }
        }

        loadDashboard();
    }, [ambassadorId]);

    const pages: Array<{ label: string; screen: keyof RootStackParamList }> = [
        { label: 'Accueil', screen: 'AmbassadorAccueil' },
        { label: 'Commander', screen: 'AmbassadorCommander' },
        { label: 'Boutique', screen: 'AmbassadorBoutique' },
        { label: 'Bons cadeaux', screen: 'AmbassadorBonsCadeaux' },
        { label: 'QR Code', screen: 'AmbassadorQRCode' },
        { label: 'Parrainage', screen: 'AmbassadorParrainage' },
        { label: 'Profil', screen: 'AmbassadorProfil' },
        { label: 'Niveaux', screen: 'AmbassadorNiveaux' },
    ];

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <View style={styles.headerRow}>
                <Text style={styles.title}>Tableau Ambassadeur</Text>
                <TouchableOpacity onPress={logout} style={styles.logoutButton}>
                    <Text style={styles.logoutText}>Déconnexion</Text>
                </TouchableOpacity>
            </View>
            <Text style={styles.description}>Gérez vos missions, vos performances et vos bons cadeaux depuis un seul endroit.</Text>

            {loading ? (
                <ActivityIndicator size="large" color="#C9A84C" style={styles.loader} />
            ) : error ? (
                <Text style={styles.errorText}>{error}</Text>
            ) : dashboard ? (
                <>
                    <View style={styles.summaryRow}>
                        <View style={styles.summaryCard}>
                            <Text style={styles.summaryLabel}>Points</Text>
                            <Text style={styles.summaryValue}>{dashboard.points_solde}</Text>
                            <Text style={styles.summarySmall}>Niveau {dashboard.niveau}</Text>
                        </View>
                        <View style={styles.summaryCard}>
                            <Text style={styles.summaryLabel}>Courses actives</Text>
                            <Text style={styles.summaryValue}>{dashboard.active_course_count}</Text>
                            <Text style={styles.summarySmall}>{dashboard.pending_bons_count} bons attente</Text>
                        </View>
                    </View>

                    <View style={styles.grid}>
                        {pages.map((page) => (
                            <TouchableOpacity
                                key={page.screen}
                                style={styles.card}
                                onPress={() => navigation.navigate(page.screen)}
                            >
                                <Text style={styles.cardTitle}>{page.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </>
            ) : (
                <Text style={styles.errorText}>Aucune donnée disponible.</Text>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flexGrow: 1,
        backgroundColor: '#101018',
        padding: 24,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    title: {
        color: '#C9A84C',
        fontSize: 28,
        fontWeight: 'bold',
    },
    description: {
        color: '#E0DBD2',
        marginBottom: 24,
        lineHeight: 22,
    },
    logoutButton: {
        backgroundColor: '#2B2B3B',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 12,
    },
    logoutText: {
        color: '#FFFFFF',
        fontSize: 12,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 24,
    },
    summaryCard: {
        flex: 1,
        backgroundColor: '#141423',
        borderRadius: 18,
        padding: 18,
        marginRight: 8,
    },
    summaryLabel: {
        color: '#8F8F8F',
        marginBottom: 8,
    },
    summaryValue: {
        color: '#FFFFFF',
        fontSize: 32,
        fontWeight: '700',
    },
    summarySmall: {
        color: '#C9A84C',
        marginTop: 8,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    card: {
        backgroundColor: '#161624',
        borderRadius: 18,
        padding: 18,
        width: '48%',
        marginBottom: 16,
    },
    cardTitle: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
    loader: {
        marginVertical: 32,
    },
    errorText: {
        color: '#FF6B6B',
        marginTop: 16,
    },
});
