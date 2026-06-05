import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Colors, Typography } from '../theme';
import type { RootStackParamList } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type NavItem = {
    label: string;
    icon: string;
    screen: keyof RootStackParamList;
};

const AMBASSADOR_NAV_FULL: NavItem[] = [
    { label: 'Accueil', icon: '🏠', screen: 'AmbassadorAccueil' },
    { label: 'Courses', icon: '🚗', screen: 'AmbassadorHome' },
    { label: 'Boutique', icon: '🎁', screen: 'AmbassadorBoutique' },
    { label: 'Niveaux', icon: '🏆', screen: 'AmbassadorNiveaux' },
    { label: 'Profil', icon: '👤', screen: 'AmbassadorProfil' },
];

const AMBASSADOR_NAV_SOUS_COMPTE: NavItem[] = [
    { label: 'Accueil', icon: '🏠', screen: 'AmbassadorAccueil' },
    { label: 'Courses', icon: '🚗', screen: 'AmbassadorHome' },
    { label: 'Niveaux', icon: '🏆', screen: 'AmbassadorNiveaux' },
    { label: 'Profil', icon: '👤', screen: 'AmbassadorProfil' },
];

const CHAUFFEUR_NAV: NavItem[] = [
    { label: 'Accueil', icon: '🏠', screen: 'ChauffeurHome' },
    { label: 'Courses', icon: '🚗', screen: 'ChauffeurCourses' },
    { label: 'Revenus', icon: '💰', screen: 'ChauffeurRevenus' },
    { label: 'Profil', icon: '👤', screen: 'ChauffeurProfile' },
];

type Props = {
    role: 'ambassadeur' | 'chauffeur';
};

export default function BottomNav({ role }: Props) {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const route = useRoute();
    const { isSousCompte } = useAuth();
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    let items: NavItem[];
    if (role === 'ambassadeur') {
        items = isSousCompte ? AMBASSADOR_NAV_SOUS_COMPTE : AMBASSADOR_NAV_FULL;
    } else {
        items = CHAUFFEUR_NAV;
    }

    const bottomPad = Math.max(insets.bottom, 8);
    const navHeight = 56 + bottomPad;

    return (
        <View style={[styles.container, { height: navHeight, paddingBottom: bottomPad }]}>
            {items.map((item) => {
                const isActive = route.name === item.screen;
                return (
                    <TouchableOpacity
                        key={item.screen}
                        style={styles.navItem}
                        onPress={() => navigation.navigate(item.screen as any)}
                    >
                        <Text style={[styles.navIcon, isActive && { color: role === 'ambassadeur' ? Colors.brand.gold : Colors.brand.info }]}>
                            {item.icon}
                        </Text>
                        <Text style={[styles.navLabel, isActive && { color: role === 'ambassadeur' ? Colors.brand.gold : Colors.brand.info }]}>
                            {item.label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

function makeStyles(colors: typeof Colors.nocturne) {
    return StyleSheet.create({
        container: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: colors.card,
            flexDirection: 'row',
            justifyContent: 'space-around',
            alignItems: 'flex-start',
            paddingTop: 8,
            borderTopWidth: 1,
            borderTopColor: 'rgba(255,255,255,0.05)',
        },
        navItem: {
            alignItems: 'center',
        },
        navIcon: {
            fontSize: 20,
            color: colors.textSecondary,
            marginBottom: 4,
        },
        navLabel: {
            fontSize: Typography.sizes.tiny,
            color: colors.textSecondary,
            fontWeight: Typography.weights.bold as any,
        },
    });
}
