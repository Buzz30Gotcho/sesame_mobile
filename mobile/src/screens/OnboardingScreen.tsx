import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { Colors } from '../theme';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

const steps = [
    {
        emoji: '👋',
        titre: 'Bienvenue sur SESAME',
        texte: 'L\'application qui récompense vos prescriptions de véhicules. Commandez pour vos clients, gagnez des points.',
    },
    {
        emoji: '🚗',
        titre: 'Commander un véhicule',
        texte: 'En quelques secondes, trouvez un véhicule pour votre client. Berline ou Van, immédiatement ou en réservation.',
    },
    {
        emoji: '🔑',
        titre: 'Le code 4 chiffres',
        texte: 'Transmettez le code à votre client. Quand le chauffeur le valide, la prestation est officiellement démarrée.',
    },
    {
        emoji: '⭐',
        titre: 'Points & Boutique',
        texte: '1 point par tranche de 10€. Atteignez les niveaux STARTER, PRO, ELITE et BLACK. Échangez vos points contre des cadeaux.',
    },
    {
        emoji: '🔔',
        titre: 'Notifications',
        texte: 'Recevez en temps réel l\'acceptation du chauffeur, le code, et la confirmation de course terminée.',
    },
    {
        emoji: '🎉',
        titre: 'C\'est parti !',
        texte: 'Votre compte est prêt. Commencez à prescrire et accumulez vos premiers points SESAME.',
    },
];

export default function OnboardingScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const [step, setStep] = useState(0);
    const current = steps[step];

    const next = async () => {
        if (step < steps.length - 1) {
            setStep(step + 1);
        } else {
            await AsyncStorage.setItem('sesame_onboarding_done', 'true');
            navigation.replace('Login');
        }
    };

    const skip = async () => {
        await AsyncStorage.setItem('sesame_onboarding_done', 'true');
        navigation.replace('Login');
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.nocturne.background} />

            <TouchableOpacity style={styles.skipBtn} onPress={skip}>
                <Text style={styles.skipText}>Passer</Text>
            </TouchableOpacity>

            <View style={styles.content}>
                <Text style={styles.emoji}>{current.emoji}</Text>
                <Text style={styles.titre}>{current.titre}</Text>
                <Text style={styles.texte}>{current.texte}</Text>
            </View>

            {/* Dots */}
            <View style={styles.dots}>
                {steps.map((_, i) => (
                    <View
                        key={i}
                        style={[styles.dot, i === step && styles.dotActive]}
                    />
                ))}
            </View>

            <TouchableOpacity style={styles.nextBtn} onPress={next}>
                <Text style={styles.nextText}>
                    {step === steps.length - 1 ? 'Commencer' : 'Suivant'}
                </Text>
            </TouchableOpacity>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.nocturne.background,
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 40,
        paddingHorizontal: 24,
    },
    skipBtn: { alignSelf: 'flex-end' },
    skipText: { color: Colors.nocturne.textSecondary, fontSize: 14 },
    content: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%' },
    emoji: { fontSize: 72, marginBottom: 32 },
    titre: {
        fontSize: 26,
        fontWeight: '700',
        color: Colors.brand.gold,
        textAlign: 'center',
        marginBottom: 16,
    },
    texte: {
        fontSize: 16,
        color: Colors.nocturne.textPrimary,
        textAlign: 'center',
        lineHeight: 24,
        maxWidth: width * 0.85,
    },
    dots: { flexDirection: 'row', gap: 8, marginBottom: 32 },
    dot: {
        width: 8, height: 8, borderRadius: 4,
        backgroundColor: Colors.nocturne.textSecondary,
    },
    dotActive: { backgroundColor: Colors.brand.gold, width: 24 },
    nextBtn: {
        backgroundColor: Colors.brand.gold,
        paddingHorizontal: 48,
        paddingVertical: 16,
        borderRadius: 12,
        width: '100%',
        alignItems: 'center',
    },
    nextText: { color: '#101018', fontSize: 16, fontWeight: '700' },
});
