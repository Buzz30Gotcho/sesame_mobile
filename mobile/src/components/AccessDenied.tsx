import React, { useMemo } from 'react';
import { View, Text, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { Colors, Typography } from '../theme';
import BottomNav from './BottomNav';

/**
 * Garde-fou défensif : affiché si un compte atteint un écran non autorisé pour son type
 * (ex. un employé ou un Ambassadeur Physique sur Commissions/Équipe). La navigation masque
 * déjà ces onglets — ce filet rattrape les accès directs (deep-link, notification, retour pile).
 */
export default function AccessDenied({ message }: { message?: string }) {
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    return (
        <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
            <StatusBar barStyle={colors.background === '#101018' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
            <View style={styles.center}>
                <Text style={styles.lock}>🔒</Text>
                <Text style={styles.title}>Accès réservé</Text>
                <Text style={styles.msg}>{message ?? "Cette section n'est pas disponible pour votre compte."}</Text>
            </View>
            <BottomNav role="ambassadeur" />
        </SafeAreaView>
    );
}

function makeStyles(colors: typeof Colors.nocturne) {
    return StyleSheet.create({
        safe: { flex: 1, backgroundColor: colors.background },
        center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, paddingBottom: 80 },
        lock: { fontSize: 48, marginBottom: 16 },
        title: { fontSize: Typography.sizes.header, fontWeight: Typography.weights.black as any, color: Colors.brand.gold, marginBottom: 8 },
        msg: { fontSize: Typography.sizes.sub, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
    });
}
