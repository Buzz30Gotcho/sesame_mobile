import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Switch } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { getChauffeurProfile, setChauffeurAvailability } from '../services/api';
import type { ChauffeurProfile } from '../types';

export default function ChauffeurProfileScreen() {
    const { chauffeurId } = useAuth();
    const [profile, setProfile] = useState<ChauffeurProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [available, setAvailable] = useState(false);

    useEffect(() => {
        async function loadProfile() {
            if (!chauffeurId) {
                setError('Identifiant Chauffeur manquant.');
                setLoading(false);
                return;
            }
            try {
                const response = await getChauffeurProfile(chauffeurId);
                setProfile(response.data);
                setAvailable(response.data.disponible);
            } catch (err) {
                setError('Impossible de charger le profil.');
            } finally {
                setLoading(false);
            }
        }

        loadProfile();
    }, [chauffeurId]);

    const toggleAvailability = async () => {
        if (!chauffeurId) return;
        const nextStatus = !available;
        try {
            await setChauffeurAvailability(chauffeurId, nextStatus);
            setAvailable(nextStatus);
        } catch (err) {
            setError('Impossible de mettre à jour la disponibilité.');
        }
    };

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>Profil Chauffeur</Text>
            {loading ? (
                <ActivityIndicator size="large" color="#C9A84C" style={styles.loader} />
            ) : error ? (
                <Text style={styles.errorText}>{error}</Text>
            ) : profile ? (
                <View style={styles.card}>
                    <Text style={styles.fieldLabel}>Nom</Text>
                    <Text style={styles.fieldValue}>{profile.prenom} {profile.nom}</Text>
                    <Text style={styles.fieldLabel}>Email</Text>
                    <Text style={styles.fieldValue}>{profile.email}</Text>
                    <Text style={styles.fieldLabel}>Téléphone</Text>
                    <Text style={styles.fieldValue}>{profile.telephone}</Text>
                    <Text style={styles.fieldLabel}>Véhicule</Text>
                    <Text style={styles.fieldValue}>{profile.vehicule_type} {profile.vehicule_marque} {profile.vehicule_modele}</Text>
                    <Text style={styles.fieldLabel}>Immatriculation</Text>
                    <Text style={styles.fieldValue}>{profile.vehicule_immat || 'Non renseignée'}</Text>
                    <View style={styles.row}> 
                        <Text style={styles.fieldLabel}>Disponible</Text>
                        <Switch value={available} onValueChange={toggleAvailability} thumbColor="#C9A84C" trackColor={{ false: '#888', true: '#FFC107' }} />
                    </View>
                </View>
            ) : (
                <Text style={styles.errorText}>Aucune donnée de profil trouvée.</Text>
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
    },
    fieldLabel: {
        color: '#8F8F8F',
        fontWeight: '600',
        marginTop: 14,
    },
    fieldValue: {
        color: '#FFFFFF',
        marginTop: 4,
        fontSize: 16,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 16,
    },
    errorText: {
        color: '#FF6B6B',
        marginTop: 16,
    },
});
