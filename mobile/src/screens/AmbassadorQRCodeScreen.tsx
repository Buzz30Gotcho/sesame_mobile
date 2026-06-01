import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getBonList } from '../services/api';
import QRCode from 'react-native-qrcode-svg';
import type { ExchangeBon } from '../types';
import type { RootStackParamList } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export default function AmbassadorQRCodeScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AmbassadorQRCode'>>();
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
                setError('Impossible de charger vos bons QR.');
            } finally {
                setLoading(false);
            }
        }
        loadBons();
    }, [ambassadorId]);

    const validBon = bons.find((bon) => bon.statut === 'valide');

    if (loading) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator size="large" color="#C9A84C" />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView contentContainerStyle={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Text style={styles.backText}>←</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>Bon cadeau</Text>
                    <View style={{ width: 40 }} />
                </View>

                {validBon ? (
                    <View style={styles.content}>
                        <Text style={styles.offerTitle}>🏎️ Karting Aventure</Text>
                        
                        <View style={styles.qrContainer}>
                            <QRCode
                                value={validBon.token_qr || 'INVALID'}
                                size={200}
                                color="#1A1A2A"
                                backgroundColor="#FFFFFF"
                            />
                        </View>

                        <View style={styles.detailsCard}>
                            <View style={styles.row}>
                                <Text style={styles.label}>Remis le</Text>
                                <Text style={styles.valueBlue}>{validBon.remis_at ? new Date(validBon.remis_at).toLocaleDateString() : 'N/A'}</Text>
                            </View>
                            <View style={styles.row}>
                                <Text style={styles.label}>Expire le</Text>
                                <Text style={styles.valueGreen}>{validBon.expire_at ? new Date(validBon.expire_at).toLocaleDateString() : 'N/A'}</Text>
                            </View>
                            <View style={styles.row}>
                                <Text style={styles.label}>Réf.</Text>
                                <Text style={styles.valueBlue}>{validBon.reference}</Text>
                            </View>
                        </View>

                        <Text style={styles.warningText}>⚡ Usage unique — non partageable</Text>

                        <View style={styles.supplierCard}>
                            <Text style={styles.supplierName}>Karting Aventure</Text>
                            <Text style={styles.supplierInfo}>📍 12 Rue des Sports · 34000</Text>
                            <Text style={styles.supplierInfo}>📞 04 67 12 34 56</Text>
                        </View>
                    </View>
                ) : (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyText}>Aucun bon cadeau validé disponible.</Text>
                        <TouchableOpacity style={styles.shopBtn} onPress={() => navigation.navigate('AmbassadorBoutique')}>
                            <Text style={styles.shopBtnText}>Aller à la boutique</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#101018',
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    container: {
        padding: 24,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 32,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
    },
    backText: {
        color: '#C9A84C',
        fontSize: 24,
    },
    title: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '700',
    },
    content: {
        alignItems: 'center',
    },
    offerTitle: {
        color: '#C9A84C',
        fontSize: 18,
        fontWeight: '800',
        marginBottom: 24,
    },
    qrContainer: {
        backgroundColor: '#FFFFFF',
        padding: 16,
        borderRadius: 20,
        marginBottom: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 8,
    },
    detailsCard: {
        backgroundColor: '#161624',
        borderRadius: 18,
        padding: 16,
        width: '100%',
        marginBottom: 20,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    label: {
        color: '#6A6680',
        fontSize: 11,
    },
    valueBlue: {
        color: '#4A9EFF',
        fontSize: 11,
        fontWeight: '700',
        fontFamily: 'monospace',
    },
    valueGreen: {
        color: '#4CAF82',
        fontSize: 11,
        fontWeight: '700',
        fontFamily: 'monospace',
    },
    warningText: {
        color: '#FF6464',
        fontSize: 10,
        fontWeight: '700',
        marginBottom: 24,
    },
    supplierCard: {
        backgroundColor: '#161624',
        borderRadius: 18,
        padding: 16,
        width: '100%',
    },
    supplierName: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 8,
    },
    supplierInfo: {
        color: '#6A6680',
        fontSize: 11,
        marginBottom: 4,
    },
    emptyState: {
        alignItems: 'center',
        marginTop: 64,
    },
    emptyText: {
        color: '#6A6680',
        fontSize: 14,
        marginBottom: 24,
    },
    shopBtn: {
        backgroundColor: '#C9A84C',
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 12,
    },
    shopBtnText: {
        color: '#09090F',
        fontWeight: '800',
    },
});
