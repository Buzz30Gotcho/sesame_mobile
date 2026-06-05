import React, { useEffect, useRef } from 'react';
import {
    Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import CountdownRing from './CountdownRing';
import { Colors, Typography } from '../theme';
import type { ActiveCourse } from '../types';

type Props = {
    course: ActiveCourse | null;
    onAccept: (courseId: string) => Promise<void>;
    onRefuse: (courseId: string) => void;
    accepting: boolean;
};

export default function IncomingCourseModal({ course, onAccept, onRefuse, accepting }: Props) {
    const refusedRef = useRef(false);

    useEffect(() => {
        refusedRef.current = false;
    }, [course?.id]);

    if (!course) return null;

    const handleTimeout = () => {
        if (!refusedRef.current) {
            refusedRef.current = true;
            onRefuse(course.id);
        }
    };

    const handleRefuse = () => {
        refusedRef.current = true;
        onRefuse(course.id);
    };

    const handleAccept = async () => {
        refusedRef.current = true;
        await onAccept(course.id);
    };

    return (
        <Modal transparent animationType="fade" visible={!!course}>
            <View style={styles.backdrop}>
                <View style={styles.card}>
                    {/* Header */}
                    <Text style={styles.header}>NOUVELLE COURSE</Text>

                    {/* Countdown */}
                    <View style={styles.ringContainer}>
                        <CountdownRing
                            duration={10}
                            size={120}
                            onComplete={handleTimeout}
                        />
                    </View>

                    {/* Infos course */}
                    <View style={styles.infoCard}>
                        <View style={styles.vehicleRow}>
                            <Text style={styles.vehicleEmoji}>
                                {course.vehicule_type === 'van' ? '🚐' : '🚗'}
                            </Text>
                            <Text style={styles.vehicleLabel}>
                                {course.vehicule_type === 'van' ? 'Van' : 'Berline'}
                                {course.type_course === 'reservation' ? ' · Réservation' : ''}
                            </Text>
                        </View>

                        <View style={styles.addressRow}>
                            <View style={styles.dot} />
                            <Text style={styles.addressText} numberOfLines={2}>
                                {course.adresse_depart}
                            </Text>
                        </View>
                        <View style={styles.addressLine} />
                        <View style={styles.addressRow}>
                            <View style={[styles.dot, styles.dotDest]} />
                            <Text style={styles.addressText} numberOfLines={2}>
                                {course.adresse_destination}
                            </Text>
                        </View>
                    </View>

                    {/* Montant */}
                    <Text style={styles.montant}>
                        {Number(course.montant || 0).toFixed(2)} €
                    </Text>

                    {/* Boutons */}
                    <View style={styles.buttonRow}>
                        <TouchableOpacity
                            style={styles.refuseBtn}
                            onPress={handleRefuse}
                            disabled={accepting}
                        >
                            <Text style={styles.refuseBtnText}>REFUSER</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.acceptBtn}
                            onPress={handleAccept}
                            disabled={accepting}
                        >
                            {accepting
                                ? <ActivityIndicator color="#09090F" size="small" />
                                : <Text style={styles.acceptBtnText}>ACCEPTER</Text>
                            }
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.legalNote}>
                        Refus libre — aucune sanction
                    </Text>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.75)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    card: {
        backgroundColor: '#161624',
        borderRadius: 28,
        padding: 28,
        width: '100%',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(201,168,76,0.25)',
    },
    header: {
        color: Colors.brand.gold,
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.black as any,
        letterSpacing: 3,
        marginBottom: 20,
    },
    ringContainer: {
        marginBottom: 24,
    },
    infoCard: {
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 16,
        padding: 16,
        width: '100%',
        marginBottom: 16,
    },
    vehicleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 14,
    },
    vehicleEmoji: { fontSize: 20 },
    vehicleLabel: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.small,
        fontWeight: Typography.weights.bold as any,
    },
    addressRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        marginBottom: 4,
    },
    addressLine: {
        width: 2,
        height: 12,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginLeft: 5,
        marginBottom: 4,
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: Colors.brand.gold,
        marginTop: 3,
        flexShrink: 0,
    },
    dotDest: {
        backgroundColor: Colors.brand.success,
    },
    addressText: {
        color: '#FFFFFF',
        fontSize: Typography.sizes.sub,
        flex: 1,
        lineHeight: 18,
    },
    montant: {
        color: Colors.brand.gold,
        fontSize: 36,
        fontWeight: Typography.weights.black as any,
        marginBottom: 24,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
        marginBottom: 12,
    },
    refuseBtn: {
        flex: 1,
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        backgroundColor: 'rgba(255,100,100,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255,100,100,0.25)',
    },
    refuseBtnText: {
        color: Colors.brand.error,
        fontWeight: Typography.weights.black as any,
        fontSize: Typography.sizes.sub,
    },
    acceptBtn: {
        flex: 2,
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        backgroundColor: Colors.brand.gold,
    },
    acceptBtnText: {
        color: '#09090F',
        fontWeight: Typography.weights.black as any,
        fontSize: Typography.sizes.sub,
    },
    legalNote: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.tiny,
        fontStyle: 'italic',
    },
});
