import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { getAdminCourses } from '../services/api';
import type { AdminCourseRow } from '../types';

export default function AdminCoursesScreen() {
    const [courses, setCourses] = useState<AdminCourseRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadCourses() {
            try {
                const response = await getAdminCourses();
                setCourses(response.data);
            } catch (err) {
                setError('Impossible de charger les courses.');
            } finally {
                setLoading(false);
            }
        }
        loadCourses();
    }, []);

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>Courses</Text>
            {loading ? (
                <ActivityIndicator size="large" color="#C9A84C" style={styles.loader} />
            ) : error ? (
                <Text style={styles.errorText}>{error}</Text>
            ) : courses.length ? (
                courses.map((course) => (
                    <View key={course.id} style={styles.card}>
                        <Text style={styles.rowText}>{course.reference ?? course.id}</Text>
                        <Text style={styles.metaText}>Statut : {course.statut}</Text>
                        <Text style={styles.metaText}>{course.adresse_depart} → {course.adresse_destination}</Text>
                        <Text style={styles.metaText}>Ambassadeur: {course.ambassadeur_id ?? 'N/A'} · Chauffeur: {course.chauffeur_id ?? 'N/A'}</Text>
                    </View>
                ))
            ) : (
                <Text style={styles.emptyText}>Aucune course trouvée.</Text>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flexGrow: 1,
        backgroundColor: '#101018',
        padding: 24,
    },
    title: {
        color: '#C9A84C',
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 18,
    },
    loader: {
        marginTop: 32,
    },
    card: {
        backgroundColor: '#161624',
        borderRadius: 18,
        padding: 18,
        marginBottom: 16,
    },
    rowText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
    metaText: {
        color: '#E0DBD2',
        marginTop: 6,
    },
    errorText: {
        color: '#FF6B6B',
        marginTop: 16,
    },
    emptyText: {
        color: '#E0DBD2',
        marginTop: 24,
    },
});
