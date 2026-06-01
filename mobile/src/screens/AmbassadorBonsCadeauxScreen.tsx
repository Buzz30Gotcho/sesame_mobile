import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getBonList } from '../services/api';
import type { ExchangeBon } from '../types';
import type { RootStackParamList } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export default function AmbassadorBonsCadeauxScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AmbassadorBonsCadeaux'>>();
    const { ambassadorId } = useAuth();
    const [bons, setBons] = useState<ExchangeBon[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadBons() {
            if (!ambassadorId) return;
            try {
                const response = await getBonList(ambassadorId);
                setBons(response.data);
            } catch {
                setError('Impossible de récupérer vos bons cadeaux.');
            } finally {
                setLoading(false);
            }
        }
        loadBons();
    }, [ambassadorId]);

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                <Text style={styles.backText}>← Retour</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Bons cadeaux</Text>
            <Text style={styles.subtitle}>Suivez vos demandes de bons et leur statut de validation.</Text>
            {loading ? (
                <ActivityIndicator size="large" color="#C9A84C" style={styles.loader} />
            ) : error ? (
                <Text style={styles.errorText}>{error}</Text>
            ) : bons.length === 0 ? (
                <Text style={styles.emptyText}>Aucun bon cadeau n’a encore été demandé.</Text>
            ) : (
                bons.map((bon) => (
                    <View key={bon.id} style={styles.bonCard}>
                        <Text style={styles.bonReference}>{bon.reference || 'Référence indisponible'}</Text>
                        <Text style={styles.bonText}>Statut : {bon.statut}</Text>
                        <Text style={styles.bonText}>Points : {bon.points_deduits}</Text>
                        <Text style={styles.bonText}>QR token : {bon.token_qr || 'En attente'}</Text>
                        <Text style={styles.bonText}>Validité : {bon.expire_at || 'N/A'}</Text>
                    </View>
                ))
            )}
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
    loader: {
        marginTop: 32,
    },
    emptyText: {
        color: '#8F8F8F',
    },
    bonCard: {
        backgroundColor: '#161624',
        borderRadius: 18,
        padding: 18,
        marginBottom: 16,
    },
    bonReference: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 8,
    },
    bonText: {
        color: '#E0DBD2',
        marginBottom: 6,
        lineHeight: 20,
    },
    errorText: {
        color: '#FF6B6B',
        marginBottom: 14,
    },
});
