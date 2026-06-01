import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { getAdminChauffeurs } from '../services/api';
import type { AdminChauffeurRow } from '../types';

export default function AdminChauffeursScreen() {
    const [chauffeurs, setChauffeurs] = useState<AdminChauffeurRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadChauffeurs() {
            try {
                const response = await getAdminChauffeurs();
                setChauffeurs(response.data);
            } catch (err) {
                setError('Impossible de charger les chauffeurs.');
            } finally {
                setLoading(false);
            }
        }
        loadChauffeurs();
    }, []);

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>Chauffeurs</Text>
            {loading ? (
                <ActivityIndicator size="large" color="#C9A84C" style={styles.loader} />
            ) : error ? (
                <Text style={styles.errorText}>{error}</Text>
            ) : chauffeurs.length ? (
                chauffeurs.map((item) => (
                    <View key={item.chauffeur_id} style={styles.card}>
                        <Text style={styles.rowText}>{item.prenom} {item.nom}</Text>
                        <Text style={styles.metaText}>{item.email} · {item.telephone}</Text>
                        <Text style={styles.metaText}>{item.vehicule_type} · {item.vehicule_marque} {item.vehicule_modele}</Text>
                        <Text style={[styles.statusText, { color: item.disponible ? '#C9A84C' : '#FF6B6B' }]}>
                            {item.disponible ? 'Disponible' : 'Occupé'}
                        </Text>
                    </View>
                ))
            ) : (
                <Text style={styles.emptyText}>Aucun chauffeur trouvé.</Text>
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
    title: {
        color: '#C9A84C',
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 18,
    },
    loader: {
        marginTop: 32,
    },
    card: {
        backgroundColor: '#161624',
        borderRadius: 18,
        padding: 18,
        marginBottom: 16,
    },
    rowText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
    metaText: {
        color: '#E0DBD2',
        marginTop: 6,
    },
    statusText: {
        marginTop: 10,
        fontWeight: '700',
    },
    errorText: {
        color: '#FF6B6B',
        marginTop: 16,
    },
    emptyText: {
        color: '#E0DBD2',
        marginTop: 24,
    },
});
