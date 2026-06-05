import React, { useEffect, useState, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLang } from '../context/LanguageContext';
import { getBonList } from '../services/api';
import BottomNav from '../components/BottomNav';
import { Colors, Typography } from '../theme';
import type { ExchangeBon, RootStackParamList } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';


function daysUntil(iso?: string): number | null {
    if (!iso) return null;
    const diff = new Date(iso).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function statutConfig(statut: string | undefined, t: (k: string) => string): { label: string; color: string; bg: string } {
    switch (statut) {
        case 'valide': return { label: t('bon_statut_valide'), color: Colors.brand.gold, bg: 'rgba(201,168,76,0.1)' };
        case 'en_attente_admin': return { label: t('bon_statut_attente'), color: Colors.brand.warning, bg: 'rgba(255,154,60,0.1)' };
        case 'utilise': return { label: t('bon_statut_utilise'), color: Colors.brand.success, bg: 'rgba(76,175,130,0.1)' };
        case 'expire': return { label: t('bon_statut_expire'), color: Colors.nocturne.textSecondary, bg: 'rgba(106,102,128,0.1)' };
        case 'refuse': return { label: t('bon_statut_refuse'), color: Colors.brand.error, bg: 'rgba(255,100,100,0.1)' };
        default: return { label: statut || '—', color: Colors.nocturne.textSecondary, bg: 'rgba(106,102,128,0.1)' };
    }
}

function sortBons(bons: ExchangeBon[]): ExchangeBon[] {
    const order: Record<string, number> = { valide: 0, en_attente_admin: 1, utilise: 2, expire: 3, refuse: 4 };
    return [...bons].sort((a, b) => (order[a.statut || ''] ?? 9) - (order[b.statut || ''] ?? 9));
}

export default function AmbassadorBonsCadeauxScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AmbassadorBonsCadeaux'>>();
    const { ambassadorId } = useAuth();
    const { colors } = useTheme();
    const { t, locale } = useLang();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const [bons, setBons] = useState<ExchangeBon[]>([]);

    const formatDateTime = (iso?: string) => {
        if (!iso) return '—';
        return new Date(iso).toLocaleString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function load() {
            if (!ambassadorId) return;
            try {
                const res = await getBonList(ambassadorId);
                setBons(res.data);
            } catch {
                setError(t('impossible_bons'));
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [ambassadorId]);

    const sorted = sortBons(bons);

    const urgentBons = bons.filter(b => {
        if (b.statut !== 'valide') return false;
        const days = daysUntil(b.expire_at);
        return days !== null && days <= 7 && days > 0;
    });

    return (
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
            <StatusBar barStyle={colors.background === '#101018' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
            <ScrollView contentContainerStyle={styles.scrollContent}>

                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Text style={styles.backText}>←</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>{t('mes_bons_cadeaux')}</Text>
                    <View style={{ width: 36 }} />
                </View>

                {/* Bannières d'alerte expiration */}
                {urgentBons.map(b => {
                    const days = daysUntil(b.expire_at)!;
                    return (
                        <TouchableOpacity
                            key={`alert-${b.id}`}
                            style={[styles.alertBanner, days <= 1 && styles.alertBannerCritical]}
                            onPress={() => navigation.navigate('AmbassadorQRCode', { bonId: b.id })}
                        >
                            <Text style={[styles.alertText, days <= 1 && styles.alertTextCritical]}>
                                {days <= 1
                                    ? t('expire_demain').replace('{nom}', b.nom_offre || 'Bon').replace('{heure}', new Date(b.expire_at!).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }))
                                    : t('expire_dans').replace('{nom}', b.nom_offre || 'Bon').replace('{jours}', String(days)).replace('{date}', formatDateTime(b.expire_at))
                                }
                            </Text>
                        </TouchableOpacity>
                    );
                })}

                {loading ? (
                    <ActivityIndicator size="large" color={Colors.brand.gold} style={{ marginTop: 40 }} />
                ) : error ? (
                    <Text style={styles.errorText}>{error}</Text>
                ) : sorted.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyEmoji}>🎁</Text>
                        <Text style={styles.emptyTitle}>{t('aucun_bon')}</Text>
                        <Text style={styles.emptyText}>{t('utiliser_points_boutique')}</Text>
                        <TouchableOpacity
                            style={styles.shopBtn}
                            onPress={() => navigation.navigate('AmbassadorBoutique')}
                        >
                            <Text style={styles.shopBtnText}>{t('aller_boutique_btn')}</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    sorted.map(bon => {
                        const cfg = statutConfig(bon.statut, t);
                        const days = daysUntil(bon.expire_at);
                        return (
                            <View key={bon.id} style={[styles.bonCard, bon.statut === 'expire' && styles.bonCardExpired]}>
                                <View style={styles.bonHeader}>
                                    <Text style={styles.bonName}>{bon.nom_offre || 'Bon cadeau'}</Text>
                                    <View style={[styles.statutBadge, { backgroundColor: cfg.bg }]}>
                                        <Text style={[styles.statutText, { color: cfg.color }]}>{cfg.label}</Text>
                                    </View>
                                </View>

                                <Text style={styles.bonRef}>{bon.reference}</Text>

                                <View style={styles.bonDates}>
                                    <View style={styles.bonDateItem}>
                                        <Text style={styles.bonDateLabel}>{t('points_deduits')}</Text>
                                        <Text style={styles.bonDateValue}>{bon.points_deduits} pts</Text>
                                    </View>
                                    {bon.remis_at && (
                                        <View style={styles.bonDateItem}>
                                            <Text style={styles.bonDateLabel}>{t('remis_le')}</Text>
                                            <Text style={styles.bonDateValue}>{formatDateTime(bon.remis_at)}</Text>
                                        </View>
                                    )}
                                    {bon.expire_at && (
                                        <View style={styles.bonDateItem}>
                                            <Text style={styles.bonDateLabel}>{t('expire_le')}</Text>
                                            <Text style={[styles.bonDateValue, days !== null && days <= 7 && days > 0 ? { color: Colors.brand.warning } : {}]}>
                                                {formatDateTime(bon.expire_at)}
                                            </Text>
                                        </View>
                                    )}
                                </View>

                                {bon.statut === 'valide' && (
                                    <TouchableOpacity
                                        style={styles.qrBtn}
                                        onPress={() => navigation.navigate('AmbassadorQRCode', { bonId: bon.id })}
                                    >
                                        <Text style={styles.qrBtnText}>{t('voir_qr_code')}</Text>
                                    </TouchableOpacity>
                                )}

                                {bon.statut === 'en_attente_admin' && (
                                    <Text style={styles.pendingNote}>
                                        {t('bon_attente_validation')}
                                    </Text>
                                )}
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
        scrollContent: { padding: 20, paddingBottom: 120 },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
        },
        backBtn: { width: 36, height: 36, justifyContent: 'center' },
        backText: { color: Colors.brand.gold, fontSize: 22, fontWeight: '700' },
        title: {
            color: Colors.brand.gold,
            fontSize: Typography.sizes.title,
            fontWeight: Typography.weights.black as any,
        },
        alertBanner: {
            backgroundColor: 'rgba(255,154,60,0.1)',
            borderWidth: 1,
            borderColor: 'rgba(255,154,60,0.3)',
            borderRadius: 12,
            padding: 12,
            marginBottom: 10,
        },
        alertBannerCritical: {
            backgroundColor: 'rgba(255,100,100,0.1)',
            borderColor: 'rgba(255,100,100,0.3)',
        },
        alertText: {
            color: Colors.brand.warning,
            fontSize: Typography.sizes.small,
            fontWeight: Typography.weights.bold as any,
        },
        alertTextCritical: { color: Colors.brand.error },
        errorText: { color: Colors.brand.error, textAlign: 'center', marginTop: 40 },
        emptyCard: {
            backgroundColor: colors.card,
            borderRadius: 24,
            padding: 32,
            alignItems: 'center',
            marginTop: 20,
        },
        emptyEmoji: { fontSize: 40, marginBottom: 12 },
        emptyTitle: {
            color: colors.textPrimary,
            fontSize: Typography.sizes.sub,
            fontWeight: Typography.weights.bold as any,
            marginBottom: 8,
        },
        emptyText: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.small,
            textAlign: 'center',
            marginBottom: 20,
        },
        shopBtn: {
            backgroundColor: Colors.brand.gold,
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 12,
        },
        shopBtnText: {
            color: '#09090F',
            fontWeight: Typography.weights.black as any,
            fontSize: Typography.sizes.sub,
        },
        bonCard: {
            backgroundColor: colors.card,
            borderRadius: 20,
            padding: 18,
            marginBottom: 14,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.05)',
        },
        bonCardExpired: { opacity: 0.5 },
        bonHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 6,
        },
        bonName: {
            color: colors.textPrimary,
            fontSize: Typography.sizes.sub,
            fontWeight: Typography.weights.bold as any,
            flex: 1,
            marginRight: 8,
        },
        statutBadge: {
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 8,
        },
        statutText: {
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.bold as any,
        },
        bonRef: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
            fontFamily: 'monospace',
            marginBottom: 12,
        },
        bonDates: { gap: 8, marginBottom: 14 },
        bonDateItem: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        bonDateLabel: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
            fontWeight: Typography.weights.black as any,
            letterSpacing: 1,
        },
        bonDateValue: {
            color: colors.textPrimary,
            fontSize: Typography.sizes.tiny,
            fontFamily: 'monospace',
        },
        qrBtn: {
            backgroundColor: Colors.brand.gold,
            borderRadius: 12,
            paddingVertical: 12,
            alignItems: 'center',
        },
        qrBtnText: {
            color: '#09090F',
            fontWeight: Typography.weights.black as any,
            fontSize: Typography.sizes.sub,
        },
        pendingNote: {
            color: colors.textSecondary,
            fontSize: Typography.sizes.tiny,
            textAlign: 'center',
            fontStyle: 'italic',
        },
    });
}
