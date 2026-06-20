import React, { useEffect, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    ActivityIndicator, StatusBar, Linking,
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

// Specs §6.1 : date ET heure EXACTES (à la minute), pour la remise et l'expiration.
function formatDateTime(iso?: string) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function prestationAdresse(bon: ExchangeBon): string {
    return [bon.prest_adresse, [bon.prest_cp, bon.prest_ville].filter(Boolean).join(' ')]
        .filter(Boolean).join(', ');
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

    const adresse = bon ? prestationAdresse(bon) : '';

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

                        {/* QR Code avec logo SÉSAME au centre (ecl=H pour rester scannable) */}
                        <View style={styles.qrContainer}>
                            <QRCode
                                value={bon.token_qr ? `${FOURNISSEUR_VALIDER_URL}?token=${bon.token_qr}` : 'INVALID'}
                                size={200}
                                ecl="H"
                                color="#1A1A2A"
                                backgroundColor="#FFFFFF"
                            />
                            <View style={styles.logoBadge}>
                                <Text style={styles.logoBadgeText}>S</Text>
                            </View>
                        </View>

                        <Text style={styles.usageLine}>⚡ Usage unique — non partageable</Text>

                        {/* Remise + expiration : date ET heure exactes (specs §6.1) */}
                        <View style={styles.datesRow}>
                            <View style={styles.dateBox}>
                                <Text style={styles.dateLabel}>REMIS LE</Text>
                                <Text style={styles.dateValue}>{formatDateTime(bon.remis_at)}</Text>
                            </View>
                            <View style={styles.dateBox}>
                                <Text style={styles.dateLabel}>EXPIRE LE</Text>
                                <Text style={[styles.dateValue, styles.dateValueGold]}>{formatDateTime(bon.expire_at)}</Text>
                            </View>
                        </View>

                        {/* Coordonnées du lieu de prestation (specs §6.1) */}
                        {(adresse || bon.prest_telephone) ? (
                            <View style={styles.prestaCard}>
                                <Text style={styles.prestaTitle}>LIEU DE PRESTATION</Text>
                                {!!adresse && <Text style={styles.prestaText}>{adresse}</Text>}
                                {!!bon.prest_telephone && (
                                    <TouchableOpacity onPress={() => Linking.openURL(`tel:${bon.prest_telephone}`)}>
                                        <Text style={styles.prestaPhone}>📞 {bon.prest_telephone}</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        ) : null}
                    </View>
                ) : null}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: Colors.nocturne.background },
    container: { padding: 24, paddingBottom: 24 },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
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
        marginBottom: 16,
    },
    qrContainer: {
        backgroundColor: '#FFFFFF',
        padding: 18,
        borderRadius: 24,
        marginBottom: 12,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: Colors.brand.gold,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 8,
    },
    logoBadge: {
        position: 'absolute',
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#FFFFFF',
        borderWidth: 2,
        borderColor: Colors.brand.gold,
        alignItems: 'center',
        justifyContent: 'center',
    },
    logoBadgeText: {
        color: Colors.brand.gold,
        fontSize: 22,
        fontWeight: Typography.weights.black as any,
    },
    usageLine: {
        color: Colors.brand.error,
        fontSize: Typography.sizes.small,
        fontWeight: Typography.weights.black as any,
        letterSpacing: 0.3,
        textAlign: 'center',
        marginBottom: 16,
    },
    datesRow: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
        marginBottom: 12,
    },
    dateBox: {
        flex: 1,
        backgroundColor: Colors.nocturne.card,
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 12,
        alignItems: 'center',
    },
    dateLabel: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.black as any,
        letterSpacing: 1,
        marginBottom: 4,
    },
    dateValue: {
        color: Colors.nocturne.textPrimary,
        fontSize: Typography.sizes.small,
        fontWeight: Typography.weights.bold as any,
        fontFamily: 'monospace',
        textAlign: 'center',
    },
    dateValueGold: { color: Colors.brand.gold },
    prestaCard: {
        backgroundColor: 'rgba(201,168,76,0.06)',
        borderRadius: 14,
        padding: 14,
        width: '100%',
        borderWidth: 1,
        borderColor: 'rgba(201,168,76,0.15)',
        alignItems: 'center',
    },
    prestaTitle: {
        color: Colors.brand.gold,
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.black as any,
        letterSpacing: 1,
        marginBottom: 6,
    },
    prestaText: {
        color: Colors.nocturne.textPrimary,
        fontSize: Typography.sizes.small,
        textAlign: 'center',
    },
    prestaPhone: {
        color: Colors.brand.info,
        fontSize: Typography.sizes.small,
        fontWeight: Typography.weights.bold as any,
        marginTop: 6,
    },
});
