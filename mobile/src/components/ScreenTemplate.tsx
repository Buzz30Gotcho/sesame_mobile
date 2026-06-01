import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

type Section = {
    title: string;
    description: string;
};

type Props = {
    title: string;
    subtitle?: string;
    sections: Section[];
    footer?: string;
    onBack?: () => void;
};

export default function ScreenTemplate({ title, subtitle, sections, footer, onBack }: Props) {
    return (
        <ScrollView contentContainerStyle={styles.container}>
            {onBack && (
                <TouchableOpacity style={styles.backButton} onPress={onBack}>
                    <Text style={styles.backText}>← Retour</Text>
                </TouchableOpacity>
            )}
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            {sections.map((section, index) => (
                <View key={`${section.title}-${index}`} style={styles.card}>
                    <Text style={styles.cardTitle}>{section.title}</Text>
                    <Text style={styles.cardDescription}>{section.description}</Text>
                </View>
            ))}
            {footer ? <Text style={styles.footer}>{footer}</Text> : null}
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
        marginBottom: 20,
    },
    backText: {
        color: '#C9A84C',
        fontSize: 16,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: '#C9A84C',
        marginBottom: 10,
    },
    subtitle: {
        color: '#E0DBD2',
        fontSize: 16,
        marginBottom: 20,
        lineHeight: 22,
    },
    card: {
        backgroundColor: '#161624',
        borderRadius: 18,
        padding: 18,
        marginBottom: 16,
    },
    cardTitle: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 6,
    },
    cardDescription: {
        color: '#E0DBD2',
        lineHeight: 22,
    },
    footer: {
        marginTop: 24,
        color: '#9D9D9D',
        fontSize: 14,
        lineHeight: 20,
    },
});
