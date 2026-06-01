import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Share } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getAmbassadorProfile } from '../services/api';
import type { AmbassadorProfile, RootStackParamList } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export default function AmbassadorParrainageScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AmbassadorParrainage'>>();
    const { ambassadorId } = useAuth();
    const [profile, setProfile] = useState<AmbassadorProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadProfile() {
            if (!ambassadorId) return;
            try {
                const response = await getAmbassadorProfile(ambassadorId);
                setProfile(response.data);
            } catch {
                setError('Impossible de charger votre code de parrainage.');
            } finally {
                setLoading(false);
            }
        }
        loadProfile();
    }, [ambassadorId]);

    const handleShare = async () => {
        if (!profile?.code_parrainage) return;
        const message = `Rejoins SESAME avec mon code : ${profile.code_parrainage}`;
        await Share.share({ message });
    };

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                <Text style={styles.backText}>← Retour</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Parrainage</Text>
            <Text style={styles.subtitle}>Partagez votre code et gagnez des points supplémentaires.</Text>
            {loading ? (
                <ActivityIndicator size="large" color="#C9A84C" />
            ) : error ? (
                <Text style={styles.errorText}>{error}</Text>
            ) : profile ? (
                <View style={styles.card}>
                    <Text style={styles.cardLabel}>Votre code</Text>
                    <Text style={styles.codeText}>{profile.code_parrainage || 'Pas encore défini'}</Text>
                    <TouchableOpacity style={styles.shareButton} onPress={handleShare} disabled={!profile.code_parrainage}>
                        <Text style={styles.shareText}>Partager le code</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <Text style={styles.emptyText}>Aucun code trouvé.</Text>
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
    card: {
        backgroundColor: '#161624',
        borderRadius: 18,
        padding: 24,
        alignItems: 'center',
    },
    cardLabel: {
        color: '#8F8F8F',
        marginBottom: 12,
    },
    codeText: {
        color: '#FFFFFF',
        fontSize: 28,
        fontWeight: '700',
        marginBottom: 24,
    },
    shareButton: {
        backgroundColor: '#C9A84C',
        borderRadius: 14,
        paddingHorizontal: 18,
        paddingVertical: 14,
    },
    shareText: {
        color: '#101818',
        fontWeight: '700',
    },
    errorText: {
        color: '#FF6B6B',
    },
    emptyText: {
        color: '#8F8F8F',
    },
});
