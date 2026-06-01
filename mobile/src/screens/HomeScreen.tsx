import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { supabase } from '../lib/supabase';

type Course = {
    id: string;
    reference?: string;
    adresse_depart?: string;
    adresse_destination?: string;
    statut?: string;
};

export default function HomeScreen() {
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchCourses() {
            setLoading(true);
            const { data, error } = await supabase
                .from('courses')
                .select<'id,reference,adresse_depart,adresse_destination,statut'>('id,reference,adresse_depart,adresse_destination,statut')
                .limit(5);

            if (error) {
                setError(error.message);
            } else if (data) {
                setCourses(data);
            }

            setLoading(false);
        }

        fetchCourses();
    }, []);

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>Bienvenue sur SESAME</Text>
            <Text style={styles.description}>Accédez aux commandes, à votre solde de points et à votre historique de courses.</Text>
            <TouchableOpacity style={styles.card}>
                <Text style={styles.cardTitle}>Commander un véhicule</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cardSecondary}>
                <Text style={styles.cardTitleSecondary}>Mes bons cadeaux</Text>
            </TouchableOpacity>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Dernières courses</Text>
                {loading && <ActivityIndicator color="#C9A84C" />}
                {error ? (
                    <Text style={styles.errorText}>{error}</Text>
                ) : courses.length === 0 && !loading ? (
                    <Text style={styles.emptyText}>Aucune course disponible pour le moment.</Text>
                ) : (
                    courses.map((course) => (
                        <View key={course.id} style={styles.courseCard}>
                            <Text style={styles.courseReference}>{course.reference || 'N° inconnu'}</Text>
                            <Text style={styles.courseText}>{course.adresse_depart || 'Départ inconnu'}</Text>
                            <Text style={styles.courseText}>{course.adresse_destination || 'Destination inconnue'}</Text>
                            <Text style={styles.courseStatus}>{course.statut || 'Statut inconnu'}</Text>
                        </View>
                    ))
                )}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#101018',
        padding: 24,
    },
    title: {
        color: '#C9A84C',
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    description: {
        color: '#E0DBD2',
        marginBottom: 24,
        lineHeight: 22,
    },
    card: {
        backgroundColor: '#161624',
        borderRadius: 18,
        padding: 20,
        marginBottom: 16,
    },
    cardTitle: {
        color: '#C9A84C',
        fontSize: 18,
        fontWeight: '700',
    },
    cardSecondary: {
        backgroundColor: '#1C1C2E',
        borderRadius: 18,
        padding: 20,
    },
    cardTitleSecondary: {
        color: '#E0DBD2',
        fontSize: 18,
        fontWeight: '700',
    },
    section: {
        marginTop: 32,
    },
    sectionTitle: {
        color: '#C9A84C',
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 12,
    },
    courseCard: {
        backgroundColor: '#161624',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
    },
    courseReference: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 6,
    },
    courseText: {
        color: '#E0DBD2',
        marginBottom: 4,
    },
    courseStatus: {
        color: '#9D9D9D',
        marginTop: 8,
        fontSize: 13,
    },
    errorText: {
        color: '#FF635F',
        marginTop: 8,
    },
    emptyText: {
        color: '#E0DBD2',
        marginTop: 8,
    },
});
