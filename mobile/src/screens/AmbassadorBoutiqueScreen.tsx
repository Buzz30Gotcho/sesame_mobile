import React, { useEffect, useState, useMemo } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    ActivityIndicator, StatusBar, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLang } from '../context/LanguageContext';
import { getOffers, createExchange, getAmbassadorDashboard } from '../services/api';
import BottomNav from '../components/BottomNav';
import { Colors, Typography } from '../theme';
import type { BoutiqueOffer, RootStackParamList } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export default function AmbassadorBoutiqueScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AmbassadorBoutique'>>();
    const { ambassadorId } = useAuth();
    const { colors } = useTheme();
    const { t } = useLang();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const [offers, setOffers] = useState<BoutiqueOffer[]>([]);
    const [points, setPoints] = useState(0);
    const [loading, setLoading] = useState(true);
    const [exchangingId, setExchangingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function load() {
            try {
                const [offersRes, dashRes] = await Promise.all([
                    getOffers(),
                    ambassadorId ? getAmbassadorDashboard(ambassadorId) : Promise.resolve(null),
                ]);
                setOffers(offersRes.data);
                if (dashRes) setPoints(dashRes.data.points_solde || 0);
            } catch {
                setError(t('impossible_boutique'));
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [ambassadorId]);

    const handleExchange = (offer: BoutiqueOffer) => {
        if (!ambassadorId) return;
        if (points < offer.pts_requis) {
            Alert.alert(t('points_insuffisants'), t('il_vous_faut').replace('{requis}', String(offer.pts_requis)).replace('{solde}', String(points)));
            return;
        }
        Alert.alert(
            t('echanger_titre').replace('{nom}', offer.nom),
            t('echanger_msg').replace('{requis}', String(offer.pts_requis)).replace('{solde}', String(points)),
            [
                { text: t('annuler'), style: 'cancel' },
                {
                    text: t('confirmer'),
                    onPress: async () => {
                        setExchangingId(offer.id);
                        setError(null);
                        try {
                            await createExchange(ambassadorId, offer.id);
                            setPoints(p => p - offer.pts_requis);
                            Alert.alert(
                                t('demande_enregistree'),
                                t('bon_dispo_notification'),
                                [{ text: t('ok'), onPress: () => navigation.navigate('AmbassadorBonsCadeaux') }]
                            );
                        } catch (e: any) {
                            setError(e.response?.data?.error || t('erreur_echange'));
                        } finally {
                            setExchangingId(null);
                        }
                    },
                },
            ]
        );
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
            <StatusBar barStyle={colors.background === '#101018' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Text style={styles.backText}>←</Text>
                </TouchableOpacity>
                <Text style={styles.title}>{t('boutique')}</Text>
                <View style={{ width: 36 }} />
            </View>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={styles.subtitle}>{t('echangez_points')}</Text>

                {/* Solde */}
                <View style={styles.balanceCard}>
                    <Text style={styles.balanceLabel}>{t('votre_solde')}</Text>
                    <Text style={styles.balanceValue}>{points} pts</Text>
                </View>

                {error && <Text style={styles.errorText}>{error}</Text>}

                {loading ? (
                    <ActivityIndicator size="large" color={Colors.brand.gold} style={{ marginTop: 32 }} />
                ) : offers.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyEmoji}>🎁</Text>
                        <Text style={styles.emptyTitle}>{t('aucune_offre')}</Text>
                        <Text style={styles.emptyText}>{t('nouvelles_offres_bientot')}</Text>
                    </View>
                ) : (
                    offers.map(offer => {
                        const canAfford = points >= offer.pts_requis;
                        return (
                            <View key={offer.id} style={[styles.offerCard, !canAfford && styles.offerCardLocked]}>
                                <View style={styles.offerHeader}>
                                    <Text style={styles.offerName}>{offer.nom}</Text>
                                    <View style={[styles.pointsBadge, !canAfford && styles.pointsBadgeLocked]}>
                                        <Text style={[styles.pointsText, !canAfford && styles.pointsTextLocked]}>
                                            {offer.pts_requis} pts
                                        </Text>
                                    </View>
                                </View>

                                {offer.description ? (
                                    <Text style={styles.offerDesc}>{offer.description}</Text>
                                ) : null}

                                <View style={styles.offerFooter}>
                                    <Text style={styles.offerStock}>
                                        {offer.stock == null ? t('stock_illimite') : `${offer.stock} ${t('disponibles')}`}
                                    </Text>
                                    <TouchableOpacity
                                        style={[styles.exchangeBtn, !canAfford && styles.exchangeBtnLocked]}
                                        onPress={() => handleExchange(offer)}
                                        disabled={!canAfford || exchangingId === offer.id}
                                    >
                                        {exchangingId === offer.id
                                            ? <ActivityIndicator color="#09090F" size="small" />
                                            : <Text style={[styles.exchangeBtnText, !canAfford && styles.exchangeBtnTextLocked]}>
                                                {canAfford ? t('echanger_btn') : t('insuffisant_btn')}
                                            </Text>
                                        }
                                    </TouchableOpacity>
                                </View>
                            </View>
                        );
                    })
                )}
            </ScrollView>
            <BottomNav role="ambassadeur" />
        </SafeAreaView>
    );
}

function makeStyles(colors: typeof Colors.nocturne) {
    return StyleSheet.create({
        safeArea: { flex: 1, backgroundColor: colors.background },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(255,255,255,0.05)',
        },
        backBtn: { width: 36, height: 36, justifyContent: 'center' },
        backText: { color: Colors.brand.gold, fontSize: 22, fontWeight: Typography.weights.bold as any },
        scrollContent: { padding: 20, paddingBottom: 120 },
        title: {
            color: Colors.brand.gold,
            fontSize: Typography.sizes.title,
            fontWeight: Typography.weights.black as any,
        },
        subtitle: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.sub,
            marginBottom: 20,
        },
        balanceCard: {
            backgroundColor: 'rgba(201,168,76,0.08)',
            borderRadius: 18,
            padding: 18,
            marginBottom: 20,
            borderWidth: 1,
            borderColor: 'rgba(201,168,76,0.2)',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        balanceLabel: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.black as any,
            letterSpacing: 1,
        },
        balanceValue: {
            color: Colors.brand.gold,
            fontSize: Typography.sizes.title,
            fontWeight: Typography.weights.black as any,
        },
        errorText: {
            color: Colors.brand.error,
            fontSize: Typography.sizes.small,
            marginBottom: 14,
            textAlign: 'center',
        },
        emptyCard: {
            backgroundColor: colors.card,
            borderRadius: 24,
            padding: 32,
            alignItems: 'center',
            marginTop: 10,
        },
        emptyEmoji: { fontSize: 40, marginBottom: 12 },
        emptyTitle: {
            color: colors.textPrimary,
            fontSize: Typography.sizes.sub,
            fontWeight: Typography.weights.bold as any,
            marginBottom: 6,
        },
        emptyText: { color: colors.textSecondary, fontSize: Typography.sizes.small, textAlign: 'center' },
        offerCard: {
            backgroundColor: colors.card,
            borderRadius: 20,
            padding: 18,
            marginBottom: 14,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.05)',
        },
        offerCardLocked: { opacity: 0.6 },
        offerHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 8,
        },
        offerName: {
            color: colors.textPrimary,
            fontSize: Typography.sizes.sub,
            fontWeight: Typography.weights.bold as any,
            flex: 1,
            marginRight: 10,
        },
        pointsBadge: {
            backgroundColor: 'rgba(201,168,76,0.15)',
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 10,
        },
        pointsBadgeLocked: { backgroundColor: 'rgba(106,102,128,0.2)' },
        pointsText: {
            color: Colors.brand.gold,
            fontWeight: Typography.weights.black as any,
            fontSize: Typography.sizes.small,
        },
        pointsTextLocked: { color: colors.textSecondary },
        offerDesc: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.small,
            marginBottom: 14,
            lineHeight: 18,
        },
        offerFooter: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        offerStock: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
        },
        exchangeBtn: {
            backgroundColor: Colors.brand.gold,
            borderRadius: 12,
            paddingHorizontal: 16,
            paddingVertical: 10,
            minWidth: 90,
            alignItems: 'center',
        },
        exchangeBtnLocked: { backgroundColor: 'rgba(106,102,128,0.3)' },
        exchangeBtnText: {
            color: '#09090F',
            fontWeight: Typography.weights.black as any,
            fontSize: Typography.sizes.small,
        },
        exchangeBtnTextLocked: { color: colors.textSecondary },
    });
}
