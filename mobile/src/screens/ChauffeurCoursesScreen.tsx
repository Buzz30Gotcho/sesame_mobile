import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { getChauffeurCourses, acceptChauffeurCourse, validateCourseCode, finishChauffeurCourse } from '../services/api';
import type { ActiveCourse } from '../types';

export default function ChauffeurCoursesScreen() {
    const { chauffeurId } = useAuth();
    const [courses, setCourses] = useState<ActiveCourse[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadCourses() {
            if (!chauffeurId) {
                setError('Identifiant Chauffeur manquant');
                setLoading(false);
                return;
            }
            try {
                const response = await getChauffeurCourses(chauffeurId);
                setCourses(response.data);
            } catch (err) {
                setError('Impossible de charger les courses.');
            } finally {
                setLoading(false);
            }
        }

        loadCourses();
    }, [chauffeurId]);

    const handleAccept = async (courseId: string) => {
        if (!chauffeurId) return;
        try {
            await acceptChauffeurCourse(chauffeurId, courseId);
            Alert.alert('Accepté', 'Vous avez accepté la course.');
        } catch (err) {
            Alert.alert('Erreur', 'Impossible d’accepter la course.');
        }
    };

    const handleValidate = async (courseId: string) => {
        if (!chauffeurId) return;
        try {
            await validateCourseCode(chauffeurId, courseId, '1234');
            Alert.alert('Validation', 'Code validé.');
        } catch (err) {
            Alert.alert('Erreur', 'Impossible de valider le code.');
        }
    };

    const handleFinish = async (courseId: string) => {
        if (!chauffeurId) return;
        try {
            await finishChauffeurCourse(chauffeurId, courseId);
            Alert.alert('Terminé', 'Course marquée comme terminée.');
        } catch (err) {
            Alert.alert('Erreur', 'Impossible de terminer la course.');
        }
    };

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>Mes Courses</Text>
            {loading ? (
                <ActivityIndicator size="large" color="#C9A84C" style={styles.loader} />
            ) : error ? (
                <Text style={styles.errorText}>{error}</Text>
            ) : courses.length ? (
                courses.map((course) => (
                    <View key={course.id} style={styles.courseCard}>
                        <Text style={styles.courseLabel}>Référence</Text>
                        <Text style={styles.courseValue}>{course.reference ?? course.id}</Text>
                        <Text style={styles.courseText}>{course.adresse_depart} → {course.adresse_destination}</Text>
                        <Text style={styles.courseText}>Statut : {course.statut}</Text>
                        <View style={styles.buttonRow}>
                            {course.statut === 'recherche' ? (
                                <TouchableOpacity style={styles.courseButton} onPress={() => handleAccept(course.id)}>
                                    <Text style={styles.courseButtonText}>Accepter</Text>
                                </TouchableOpacity>
                            ) : null}
                            {course.statut === 'acceptee' ? (
                                <TouchableOpacity style={styles.courseButton} onPress={() => handleValidate(course.id)}>
                                    <Text style={styles.courseButtonText}>Valider code</Text>
                                </TouchableOpacity>
                            ) : null}
                            {course.statut === 'code_valide' || course.statut === 'en_cours' ? (
                                <TouchableOpacity style={styles.courseButton} onPress={() => handleFinish(course.id)}>
                                    <Text style={styles.courseButtonText}>Terminer</Text>
                                </TouchableOpacity>
                            ) : null}
                        </View>
                    </View>
                ))
            ) : (
                <Text style={styles.emptyText}>Aucune course disponible pour le moment.</Text>
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
    errorText: {
        color: '#FF6B6B',
        marginTop: 16,
    },
    courseCard: {
        backgroundColor: '#161624',
        borderRadius: 18,
        padding: 18,
        marginBottom: 16,
    },
    courseLabel: {
        color: '#8F8F8F',
        marginBottom: 8,
    },
    courseValue: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 8,
    },
    courseText: {
        color: '#E0DBD2',
        marginBottom: 6,
    },
    buttonRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 12,
    },
    courseButton: {
        backgroundColor: '#C9A84C',
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginRight: 10,
        marginTop: 8,
    },
    courseButtonText: {
        color: '#101018',
        fontWeight: '700',
    },
    emptyText: {
        color: '#E0DBD2',
        marginTop: 24,
    },
});
