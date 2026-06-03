import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getAmbassadorDashboard } from '../services/api';
import BottomNav from '../components/BottomNav';
import { Colors, Typography } from '../theme';
import type { RootStackParamList, AmbassadorDashboard } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export default function AmbassadorVTCScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AmbassadorHome'>>();
    const { ambassadorId } = useAuth();
    const [dashboard, setDashboard] = useState<AmbassadorDashboard | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            if (!ambassadorId) return;
            try {
                const response = await getAmbassadorDashboard(ambassadorId);
                setDashboard(response.data);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [ambassadorId]);

    const activeCourse = dashboard?.active_courses.find(c => ['recherche', 'acceptee', 'en_route', 'code_valide'].includes(c.statut || ''));
    const history = dashboard?.active_courses.filter(c => c.id !== activeCourse?.id) || [];

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
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={styles.title}>Mes Missions VTC</Text>
                
                {/* Active Course - Pinned at top (Rule 9.0 Point 3) */}
                {activeCourse ? (
                    <View style={styles.activeCard}>
                        <View style={styles.activeHeader}>
                            <Text style={styles.activeStatus}>COURSE EN COURS</Text>
                            <Text style={styles.activeRef}>{activeCourse.reference}</Text>
                        </View>
                        
                        <View style={styles.pivotSection}>
                            <Text style={styles.pivotLabel}>CODE CLIENT PIVOT</Text>
                            <Text style={styles.pivotValue}>{activeCourse.code_validation || '----'}</Text>
                        </View>

                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>DÉPART</Text>
                            <Text style={styles.infoValue}>{activeCourse.adresse_depart}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>DESTINATION</Text>
                            <Text style={styles.infoValue}>{activeCourse.adresse_destination}</Text>
                        </View>

                        <View style={styles.actionRow}>
                            <TouchableOpacity style={styles.actionBtn}>
                                <Text style={styles.actionBtnText}>📞 APPELER</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionBtn}>
                                <Text style={styles.actionBtnText}>💬 MESSAGE</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyText}>Aucune course active.</Text>
                        <TouchableOpacity 
                            style={styles.orderBtn}
                            onPress={() => navigation.navigate('AmbassadorCommander')}
                        >
                            <Text style={styles.orderBtnText}>COMMANDER UN VÉHICULE</Text>
                        </TouchableOpacity>
                    </View>
                )}

                <Text style={styles.sectionTitle}>HISTORIQUE RÉCENT</Text>
                {history.length > 0 ? history.map(c => (
                    <View key={c.id} style={styles.historyCard}>
                        <View style={styles.historyHeader}>
                            <Text style={styles.historyRef}>{c.reference}</Text>
                            <Text style={styles.historyDate}>{new Date().toLocaleDateString()}</Text>
                        </View>
                        <Text style={styles.historyAddress} numberOfLines={1}>{c.adresse_destination}</Text>
                        <View style={styles.historyFooter}>
                            <Text style={styles.historyStatus}>{c.statut?.toUpperCase()}</Text>
                            <Text style={styles.historyPrice}>{c.montant} €</Text>
                        </View>
                    </View>
                )) : (
                    <Text style={styles.noHistory}>Votre historique apparaîtra ici.</Text>
                )}

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
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrollContent: {
        padding: 24,
        paddingBottom: 100,
    },
    title: {
        color: Colors.brand.gold,
        fontSize: Typography.sizes.title,
        fontWeight: Typography.weights.black as any,
        marginBottom: 24,
    },
    activeCard: {
        backgroundColor: Colors.nocturne.card,
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: Colors.brand.gold,
        marginBottom: 32,
    },
    activeHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    activeStatus: {
        color: Colors.brand.gold,
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.black as any,
        letterSpacing: 1,
    },
    activeRef: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.tiny,
    },
    pivotSection: {
        alignItems: 'center',
        marginBottom: 24,
    },
    pivotLabel: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.bold as any,
        marginBottom: 8,
    },
    pivotValue: {
        color: Colors.brand.gold,
        fontSize: 48,
        fontWeight: Typography.weights.black as any,
        letterSpacing: 8,
    },
    infoRow: {
        marginBottom: 12,
    },
    infoLabel: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.bold as any,
        marginBottom: 2,
    },
    infoValue: {
        color: '#FFFFFF',
        fontSize: Typography.sizes.sub,
    },
    actionRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 12,
    },
    actionBtn: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
    },
    actionBtnText: {
        color: '#FFFFFF',
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.bold as any,
    },
    emptyCard: {
        backgroundColor: Colors.nocturne.card,
        borderRadius: 20,
        padding: 32,
        alignItems: 'center',
        marginBottom: 32,
    },
    emptyText: {
        color: Colors.nocturne.textSecondary,
        marginBottom: 20,
    },
    orderBtn: {
        backgroundColor: Colors.brand.gold,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 12,
    },
    orderBtnText: {
        color: '#101018',
        fontWeight: Typography.weights.black as any,
        fontSize: Typography.sizes.sub,
    },
    sectionTitle: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.black as any,
        letterSpacing: 2,
        marginBottom: 16,
    },
    historyCard: {
        backgroundColor: Colors.nocturne.card,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
    },
    historyHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    historyRef: {
        color: '#FFFFFF',
        fontWeight: Typography.weights.bold as any,
        fontSize: Typography.sizes.sub,
    },
    historyDate: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.tiny,
    },
    historyAddress: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.tiny,
        marginBottom: 12,
    },
    historyFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)',
        paddingTop: 12,
    },
    historyStatus: {
        color: Colors.brand.success,
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.bold as any,
    },
    historyPrice: {
        color: '#FFFFFF',
        fontWeight: Typography.weights.black as any,
    },
    noHistory: {
        color: Colors.nocturne.textSecondary,
        textAlign: 'center',
        marginTop: 20,
    },
});
