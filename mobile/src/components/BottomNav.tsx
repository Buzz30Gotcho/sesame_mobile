import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Typography } from '../theme';
import type { RootStackParamList } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type NavItem = {
    label: string;
    icon: string;
    screen: keyof RootStackParamList;
};

const AMBASSADOR_NAV: NavItem[] = [
    { label: 'Accueil', icon: '🏠', screen: 'AmbassadorAccueil' },
    { label: 'VTC', icon: '🚗', screen: 'AmbassadorHome' },
    { label: 'Boutique', icon: '🎁', screen: 'AmbassadorBoutique' },
    { label: 'Niveaux', icon: '🏆', screen: 'AmbassadorNiveaux' },
    { label: 'Profil', icon: '👤', screen: 'AmbassadorProfil' },
];

const CHAUFFEUR_NAV: NavItem[] = [
    { label: 'Accueil', icon: '🏠', screen: 'ChauffeurHome' },
    { label: 'Courses', icon: '🚗', screen: 'ChauffeurCourses' },
    { label: 'Revenus', icon: '💰', screen: 'ChauffeurHome' }, // Simulated link to current home or specific revenue screen
    { label: 'Profil', icon: '👤', screen: 'ChauffeurProfile' },
];

type Props = {
    role: 'ambassadeur' | 'chauffeur';
};

export default function BottomNav({ role }: Props) {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const route = useRoute();
    const items = role === 'ambassadeur' ? AMBASSADOR_NAV : CHAUFFEUR_NAV;

    return (
        <View style={styles.container}>
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

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 80,
        backgroundColor: Colors.nocturne.card,
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingBottom: 20,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)',
    },
    navItem: {
        alignItems: 'center',
    },
    navIcon: {
        fontSize: 20,
        color: Colors.nocturne.textSecondary,
        marginBottom: 4,
    },
    navLabel: {
        fontSize: Typography.sizes.tiny,
        color: Colors.nocturne.textSecondary,
        fontWeight: Typography.weights.bold as any,
    },
});
