import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { getAdminAmbassadeurs } from '../services/api';
import type { AdminAmbassadorRow } from '../types';

export default function AdminAmbassadeursScreen() {
    const [ambassadeurs, setAmbassadeurs] = useState<AdminAmbassadorRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadAmbassadeurs() {
            try {
                const response = await getAdminAmbassadeurs();
                setAmbassadeurs(response.data);
            } catch (err) {
                setError('Impossible de charger les ambassadeurs.');
            } finally {
                setLoading(false);
            }
        }
        loadAmbassadeurs();
    }, []);

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>Ambassadeurs</Text>
            {loading ? (
                <ActivityIndicator size="large" color="#C9A84C" style={styles.loader} />
            ) : error ? (
                <Text style={styles.errorText}>{error}</Text>
            ) : ambassadeurs.length ? (
                ambassadeurs.map((item) => (
                    <View key={item.ambassadeur_id} style={styles.card}>
                        <Text style={styles.rowText}>{item.prenom} {item.nom}</Text>
                        <Text style={styles.metaText}>{item.email} · {item.telephone}</Text>
                        <Text style={styles.metaText}>Points: {item.points_solde} · Niveau: {item.niveau}</Text>
                        <Text style={styles.statusText}>Contrat moral : {item.contrat_moral_signe ? 'Validé' : 'En attente'}</Text>
                    </View>
                ))
            ) : (
                <Text style={styles.emptyText}>Aucun ambassadeur trouvé.</Text>
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
        color: '#C9A84C',
        marginTop: 10,
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
