import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getAmbassadorDashboard } from '../services/api';
import type { AmbassadorDashboard, RootStackParamList } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export default function AmbassadorNiveauxScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AmbassadorNiveaux'>>();
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
                setError('Impossible de charger les niveaux.');
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [ambassadorId]);

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                <Text style={styles.backText}>← Retour</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Niveaux SESAME</Text>
            <Text style={styles.subtitle}>Suivez votre progression et vos objectifs de points.</Text>
            {loading ? (
                <ActivityIndicator size="large" color="#C9A84C" />
            ) : error ? (
                <Text style={styles.errorText}>{error}</Text>
            ) : dashboard ? (
                <>
                    <View style={styles.card}>
                        <Text style={styles.label}>Niveau actuel</Text>
                        <Text style={styles.value}>{dashboard.niveau}</Text>
                        <Text style={styles.help}>Points : {dashboard.points_solde}</Text>
                    </View>
                    <View style={styles.card}>
                        <Text style={styles.label}>Palier suivant</Text>
                        <Text style={styles.value}>{dashboard.next_level || 'Niveau maximum'}</Text>
                        <Text style={styles.help}>{dashboard.next_level_target ? `Objectif : ${dashboard.next_level_target} points` : 'Plus de palier disponible'}</Text>
                        {dashboard.next_level && (
                            <Text style={styles.help}>Points restants : {dashboard.points_to_next_level}</Text>
                        )}
                    </View>
                    <View style={styles.card}> 
                        <Text style={styles.label}>Progression</Text>
                        <View style={styles.progressBarBackground}>
                            <View style={[styles.progressBarFill, { width: `${dashboard.next_level_target ? Math.min(100, (dashboard.points_solde / dashboard.next_level_target) * 100) : 100}%` }]} />
                        </View>
                    </View>
                </>
            ) : null}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 24,
        backgroundColor: '#101018',
        minHeight: '100%',
    },
    backButton: {
        marginBottom: 16,
    },
    backText: {
        color: '#C9A84C',
    },
    title: {
        color: '#C9A84C',
        fontSize: 28,
        fontWeight: '700',
        marginBottom: 8,
    },
    subtitle: {
        color: '#E0DBD2',
        marginBottom: 24,
        lineHeight: 22,
    },
    card: {
        backgroundColor: '#161624',
        borderRadius: 18,
        padding: 20,
        marginBottom: 16,
    },
    label: {
        color: '#8F8F8F',
        marginBottom: 10,
    },
    value: {
        color: '#FFFFFF',
        fontSize: 24,
        fontWeight: '700',
        marginBottom: 8,
    },
    help: {
        color: '#C9A84C',
        lineHeight: 22,
    },
    progressBarBackground: {
        height: 12,
        borderRadius: 8,
        backgroundColor: '#1F1F30',
        overflow: 'hidden',
        marginTop: 12,
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: '#C9A84C',
    },
    errorText: {
        color: '#FF6B6B',
    },
});
