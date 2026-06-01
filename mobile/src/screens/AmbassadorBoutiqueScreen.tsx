import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getOffers, createExchange } from '../services/api';
import type { BoutiqueOffer } from '../types';
import type { RootStackParamList } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export default function AmbassadorBoutiqueScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AmbassadorBoutique'>>();
    const { ambassadorId } = useAuth();
    const [offers, setOffers] = useState<BoutiqueOffer[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        async function loadOffers() {
            try {
                const response = await getOffers();
                setOffers(response.data);
            } catch {
                setError('Impossible de charger les offres pour l’instant.');
            } finally {
                setLoading(false);
            }
        }
        loadOffers();
    }, []);

    const handleBuy = async (offerId: string) => {
        if (!ambassadorId) return;
        setLoading(true);
        setError(null);
        setSuccess(null);
        try {
            await createExchange(ambassadorId, offerId);
            setSuccess('Demande d’échange enregistrée. Un bon vous sera attribué dès validation admin.');
        } catch {
            setError('Impossible d’échanger cette offre pour le moment.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                <Text style={styles.backText}>← Retour</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Boutique</Text>
            <Text style={styles.subtitle}>Choisissez un bon cadeau ou une offre à proposer à vos clients.</Text>
            {success ? <Text style={styles.successText}>{success}</Text> : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {loading ? (
                <ActivityIndicator size="large" color="#C9A84C" style={styles.loader} />
            ) : offers.length === 0 ? (
                <Text style={styles.emptyText}>Aucune offre disponible pour le moment.</Text>
            ) : (
                offers.map((offer) => (
                    <View key={offer.id} style={styles.offerCard}>
                        <View style={styles.offerHeader}>
                            <Text style={styles.offerName}>{offer.nom}</Text>
                            <Text style={styles.offerPoints}>{offer.pts_requis} pts</Text>
                        </View>
                        <Text style={styles.offerDescription}>{offer.description || 'Description non renseignée.'}</Text>
                        <View style={styles.offerFooter}>
                            <Text style={styles.offerStock}>{offer.stock == null ? 'Stock illimité' : `Stock ${offer.stock}`}</Text>
                            <TouchableOpacity style={styles.buyButton} onPress={() => handleBuy(offer.id)}>
                                <Text style={styles.buyButtonText}>Échanger</Text>
                            </TouchableOpacity>
                        </View>
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
        marginTop: 16,
    },
    offerCard: {
        backgroundColor: '#161624',
        borderRadius: 18,
        padding: 18,
        marginBottom: 16,
    },
    offerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    offerName: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '700',
        flex: 1,
        marginRight: 8,
    },
    offerPoints: {
        color: '#C9A84C',
        fontWeight: '700',
    },
    offerDescription: {
        color: '#E0DBD2',
        marginBottom: 14,
        lineHeight: 20,
    },
    offerFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    offerStock: {
        color: '#8F8F8F',
    },
    buyButton: {
        backgroundColor: '#C9A84C',
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    buyButtonText: {
        color: '#101818',
        fontWeight: '700',
    },
    errorText: {
        color: '#FF6B6B',
        marginBottom: 14,
    },
    successText: {
        color: '#7CD18E',
        marginBottom: 14,
    },
});
