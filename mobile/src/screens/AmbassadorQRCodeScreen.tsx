import React, { useEffect, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    ActivityIndicator, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getBonList, FOURNISSEUR_VALIDER_URL } from '../services/api';
import QRCode from 'react-native-qrcode-svg';
import { Colors, Typography } from '../theme';
import type { ExchangeBon, RootStackParamList } from '../types';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<RootStackParamList, 'AmbassadorQRCode'>;

function formatDateTime(iso?: string) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

export default function AmbassadorQRCodeScreen({ route }: Props) {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const { ambassadorId, typeAmbassadeur, isSousCompte } = useAuth();
    const { bonId } = route.params;
    const [bon, setBon] = useState<ExchangeBon | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Bons cadeaux (issus d'échanges de points) : Ambassadeur Physique indépendant uniquement.
    const isAllowed = typeAmbassadeur !== 'moral' && !isSousCompte;

    useEffect(() => {
        async function load() {
            if (!ambassadorId) return;
            if (!isAllowed) {
                setError('Réservé aux Ambassadeurs Particuliers.');
                setLoading(false);
                return;
            }
            try {
                const res = await getBonList(ambassadorId);
                const found = res.data.find((b: ExchangeBon) => b.id === bonId);
                if (!found) {
                    setError('Bon introuvable.');
                } else if (found.statut !== 'valide') {
                    setError('Ce bon n\'est pas encore disponible.');
                } else {
                    setBon(found);
                }
            } catch {
                setError('Impossible de charger le bon.');
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [ambassadorId, bonId]);

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" />
            <ScrollView contentContainerStyle={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Text style={styles.backText}>←</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>QR Code</Text>
                    <View style={{ width: 40 }} />
                </View>

                {loading ? (
                    <ActivityIndicator size="large" color={Colors.brand.gold} style={{ marginTop: 60 }} />
                ) : error ? (
                    <View style={styles.errorState}>
                        <Text style={styles.errorEmoji}>🔒</Text>
                        <Text style={styles.errorText}>{error}</Text>
                        <TouchableOpacity style={styles.backBtn2} onPress={() => navigation.goBack()}>
                            <Text style={styles.backBtn2Text}>Retour</Text>
                        </TouchableOpacity>
                    </View>
                ) : bon ? (
                    <View style={styles.content}>
                        <Text style={styles.offerName}>{bon.nom_offre || 'Bon cadeau'}</Text>

                        {/* QR Code */}
                        <View style={styles.qrContainer}>
                            <QRCode
                                value={bon.token_qr ? `${FOURNISSEUR_VALIDER_URL}?token=${bon.token_qr}` : 'INVALID'}
                                size={220}
                                color="#1A1A2A"
                                backgroundColor="#FFFFFF"
                            />
                        </View>

                        <Text style={styles.usageWarning}>⚡ Usage unique — non partageable</Text>

                        {/* Détails */}
                        <View style={styles.detailsCard}>
                            <View style={styles.row}>
                                <Text style={styles.label}>RÉFÉRENCE</Text>
                                <Text style={styles.valueBlue}>{bon.reference}</Text>
                            </View>
                            <View style={styles.divider} />
                            <View style={styles.row}>
                                <Text style={styles.label}>REMIS LE</Text>
                                <Text style={styles.valueBlue}>{formatDateTime(bon.remis_at)}</Text>
                            </View>
                            <View style={styles.divider} />
                            <View style={styles.row}>
                                <Text style={styles.label}>EXPIRE LE</Text>
                                <Text style={styles.valueGold}>{formatDateTime(bon.expire_at)}</Text>
                            </View>
                            <View style={styles.divider} />
                            <View style={styles.row}>
                                <Text style={styles.label}>POINTS DÉDUITS</Text>
                                <Text style={styles.valueGold}>{bon.points_deduits} pts</Text>
                            </View>
                        </View>

                        {/* Instructions */}
                        <View style={styles.instructionBox}>
                            <Text style={styles.instructionTitle}>COMMENT UTILISER</Text>
                            <Text style={styles.instructionText}>
                                Présentez ce QR code au prestataire SÉSAME.
                                Il scannera le code depuis son interface de validation.
                                Le bon sera marqué utilisé à la seconde du scan.
                            </Text>
                        </View>
                    </View>
                ) : null}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: Colors.nocturne.background },
    container: { padding: 24, paddingBottom: 40 },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    backButton: { width: 40, height: 40, justifyContent: 'center' },
    backText: { color: Colors.brand.gold, fontSize: 24, fontWeight: '700' },
    title: {
        color: Colors.brand.gold,
        fontSize: Typography.sizes.title,
        fontWeight: Typography.weights.black as any,
    },
    errorState: { alignItems: 'center', marginTop: 60 },
    errorEmoji: { fontSize: 48, marginBottom: 16 },
    errorText: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.sub,
        textAlign: 'center',
        marginBottom: 24,
    },
    backBtn2: {
        backgroundColor: Colors.nocturne.card,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 12,
    },
    backBtn2Text: { color: '#FFFFFF', fontWeight: '700' },
    content: { alignItems: 'center' },
    offerName: {
        color: Colors.brand.gold,
        fontSize: Typography.sizes.header,
        fontWeight: Typography.weights.black as any,
        textAlign: 'center',
        marginBottom: 24,
    },
    qrContainer: {
        backgroundColor: '#FFFFFF',
        padding: 20,
        borderRadius: 24,
        marginBottom: 16,
        shadowColor: Colors.brand.gold,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 8,
    },
    usageWarning: {
        color: Colors.brand.error,
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.black as any,
        marginBottom: 24,
        letterSpacing: 0.5,
    },
    detailsCard: {
        backgroundColor: Colors.nocturne.card,
        borderRadius: 18,
        padding: 18,
        width: '100%',
        marginBottom: 16,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 10,
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    label: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.black as any,
        letterSpacing: 1,
    },
    valueBlue: {
        color: Colors.brand.info,
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.bold as any,
        fontFamily: 'monospace',
    },
    valueGold: {
        color: Colors.brand.gold,
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.bold as any,
        fontFamily: 'monospace',
    },
    instructionBox: {
        backgroundColor: 'rgba(201,168,76,0.06)',
        borderRadius: 14,
        padding: 16,
        width: '100%',
        borderWidth: 1,
        borderColor: 'rgba(201,168,76,0.15)',
    },
    instructionTitle: {
        color: Colors.brand.gold,
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.black as any,
        letterSpacing: 1,
        marginBottom: 8,
    },
    instructionText: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.small,
        lineHeight: 18,
    },
});
