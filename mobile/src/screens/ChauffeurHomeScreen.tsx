import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, SafeAreaView, Switch } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getChauffeurDashboard, setChauffeurAvailability, validateCourseCode, finishChauffeurCourse } from '../services/api';
import type { RootStackParamList, ChauffeurDashboard, ActiveCourse } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export default function ChauffeurHomeScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'ChauffeurHome'>>();
    const { chauffeurId, logout } = useAuth();
    const [dashboard, setDashboard] = useState<ChauffeurDashboard | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // Pivot UI state
    const [codeDigits, setCodeDigits] = useState(['', '', '', '']);
    const [pivotError, setPivotError] = useState<string | null>(null);

    useEffect(() => {
        loadDashboard();
    }, [chauffeurId]);

    async function loadDashboard() {
        if (!chauffeurId) return;
        try {
            const response = await getChauffeurDashboard(chauffeurId);
            setDashboard(response.data);
        } catch (err) {
            setError('Erreur de chargement.');
        } finally {
            setLoading(false);
        }
    }

    const toggleAvailability = async (val: boolean) => {
        if (!chauffeurId) return;
        try {
            await setChauffeurAvailability(chauffeurId, val);
            loadDashboard();
        } catch (err) {
            console.error(err);
        }
    };

    const handleDigitPress = (digit: string) => {
        const nextEmptyIndex = codeDigits.findIndex(d => d === '');
        if (nextEmptyIndex !== -1) {
            const newDigits = [...codeDigits];
            newDigits[nextEmptyIndex] = digit;
            setCodeDigits(newDigits);
        }
    };

    const handleDelete = () => {
        const lastFilledIndex = codeDigits.findLastIndex(d => d !== '');
        if (lastFilledIndex !== -1) {
            const newDigits = [...codeDigits];
            newDigits[lastFilledIndex] = '';
            setCodeDigits(newDigits);
        }
    };

    const handleValidateCode = async () => {
        if (!chauffeurId || !dashboard?.current_course) return;
        const code = codeDigits.join('');
        if (code.length < 4) return;

        try {
            setPivotError(null);
            await validateCourseCode(chauffeurId, dashboard.current_course.id, code);
            loadDashboard();
            setCodeDigits(['', '', '', '']);
        } catch (err: any) {
            setPivotError(err.response?.data?.error || 'Code incorrect');
        }
    };

    const handleFinishCourse = async () => {
        if (!chauffeurId || !dashboard?.current_course) return;
        try {
            await finishChauffeurCourse(chauffeurId, dashboard.current_course.id);
            loadDashboard();
        } catch (err) {
            console.error(err);
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator size="large" color="#C9A84C" />
            </View>
        );
    }

    const currentCourse = dashboard?.current_course;

    return (
        <SafeAreaView style={styles.safeArea}>
            {/* Availability Header */}
            <View style={[styles.statusHeader, dashboard?.disponible ? styles.statusOnline : styles.statusOffline]}>
                <View>
                    <Text style={styles.driverName}>{dashboard?.prenom} {dashboard?.nom}</Text>
                    <Text style={dashboard?.disponible ? styles.onlineText : styles.offlineText}>
                        ● {dashboard?.disponible ? 'En ligne' : 'Hors ligne'}
                    </Text>
                </View>
                <Switch 
                    value={dashboard?.disponible} 
                    onValueChange={toggleAvailability} 
                    trackColor={{ false: '#CCCCDD', true: '#2E8A5A' }}
                    thumbColor="#FFFFFF"
                />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                
                {!currentCourse ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyCard}>
                            <Text style={styles.emptyTitle}>DISPONIBLE</Text>
                            <Text style={styles.emptySub}>En attente de courses...</Text>
                        </View>
                        <View style={styles.statsRow}>
                            <View style={styles.statCard}>
                                <Text style={styles.statLabel}>Courses</Text>
                                <Text style={styles.statValue}>3</Text>
                            </View>
                            <View style={styles.statCard}>
                                <Text style={styles.statLabel}>CA encaissé</Text>
                                <Text style={styles.statValue}>108,00 €</Text>
                            </View>
                        </View>
                        <Text style={styles.footerInfo}>Frais SÉSAME : visible uniquement sur factures Stripe</Text>
                    </View>
                ) : (
                    <View style={styles.courseActiveContainer}>
                        {/* Course Step Indicator */}
                        <View style={styles.stepCard}>
                            <Text style={styles.stepTitle}>
                                {currentCourse.statut === 'acceptee' ? 'En route vers le client' : 
                                 currentCourse.statut === 'en_route' ? 'Arrivé sur place' : 
                                 currentCourse.statut === 'code_valide' ? 'Course en cours' : 'Course terminée'}
                            </Text>
                            <Text style={styles.stepSub}>{currentCourse.adresse_depart} • ~4 min</Text>
                        </View>

                        {/* Pivot UI: Code Entry */}
                        {['acceptee', 'en_route'].includes(currentCourse.statut || '') && (
                            <View style={styles.pivotCard}>
                                <Text style={styles.pivotTitle}>Code client — PIVOT</Text>
                                <Text style={styles.pivotSub}>Saisissez le code communiqué par l'Ambassadeur</Text>
                                
                                <View style={styles.codeRow}>
                                    {codeDigits.map((d, i) => (
                                        <View key={i} style={[styles.codeBox, d !== '' && styles.codeBoxFilled]}>
                                            <Text style={styles.codeDigit}>{d}</Text>
                                        </View>
                                    ))}
                                </View>

                                {pivotError && <Text style={styles.errorText}>{pivotError}</Text>}

                                <View style={styles.numpad}>
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                                        <TouchableOpacity key={n} style={styles.numKey} onPress={() => handleDigitPress(n.toString())}>
                                            <Text style={styles.numText}>{n}</Text>
                                        </TouchableOpacity>
                                    ))}
                                    <TouchableOpacity style={styles.numKey} onPress={handleDelete}>
                                        <Text style={styles.numText}>⌫</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.numKey} onPress={() => handleDigitPress('0')}>
                                        <Text style={styles.numText}>0</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.numKey, styles.okKey]} onPress={handleValidateCode}>
                                        <Text style={styles.okText}>OK</Text>
                                    </TouchableOpacity>
                                </View>
                                
                                <Text style={styles.pivotWarning}>⚡ PIVOT JURIDIQUE ET FINANCIER</Text>
                            </View>
                        )}

                        {/* Course in progress */}
                        {currentCourse.statut === 'code_valide' && (
                            <View style={styles.inProgressCard}>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>DESTINATION</Text>
                                    <Text style={styles.infoValue}>{currentCourse.adresse_destination}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>MONTANT</Text>
                                    <Text style={styles.infoValueGold}>{currentCourse.montant} €</Text>
                                </View>
                                <TouchableOpacity style={styles.finishButton} onPress={handleFinishCourse}>
                                    <Text style={styles.finishButtonText}>Terminer la course</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* Action Buttons */}
                        <View style={styles.actionRow}>
                            <TouchableOpacity style={styles.actionBtn}>
                                <Text style={styles.actionBtnText}>💬 Chat</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionBtn}>
                                <Text style={styles.actionBtnText}>📞 Appeler</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Client Absent Option */}
                        <TouchableOpacity style={styles.absentBtn}>
                            <Text style={styles.absentBtnText}>🆘 Client absent — Contacter SÉSAME</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>

            {/* Bottom Nav */}
            <View style={styles.bottomNav}>
                <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('ChauffeurHome')}>
                    <Text style={[styles.navIcon, { color: '#4A9EFF' }]}>🏠</Text>
                    <Text style={[styles.navLabel, { color: '#4A9EFF' }]}>Accueil</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItem}>
                    <Text style={styles.navIcon}>🚗</Text>
                    <Text style={styles.navLabel}>Course</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItem}>
                    <Text style={styles.navIcon}>💰</Text>
                    <Text style={styles.navLabel}>Revenus</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItem}>
                    <Text style={styles.navIcon}>👤</Text>
                    <Text style={styles.navLabel}>Profil</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#101018',
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    statusHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    statusOnline: {
        backgroundColor: 'rgba(46, 138, 82, 0.05)',
    },
    statusOffline: {
        backgroundColor: 'rgba(119, 119, 136, 0.05)',
    },
    driverName: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
    onlineText: {
        color: '#4CAF82',
        fontSize: 10,
        marginTop: 2,
    },
    offlineText: {
        color: '#777788',
        fontSize: 10,
        marginTop: 2,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 100,
    },
    emptyState: {
        alignItems: 'center',
    },
    emptyCard: {
        backgroundColor: 'rgba(46, 138, 82, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(46, 138, 82, 0.2)',
        borderRadius: 18,
        padding: 24,
        width: '100%',
        alignItems: 'center',
        marginBottom: 20,
    },
    emptyTitle: {
        color: '#4CAF82',
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: 1,
        marginBottom: 8,
    },
    emptySub: {
        color: '#6A6680',
        fontSize: 12,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: 20,
    },
    statCard: {
        flex: 1,
        backgroundColor: '#161624',
        borderRadius: 18,
        padding: 16,
        marginHorizontal: 4,
    },
    statLabel: {
        color: '#6A6680',
        fontSize: 10,
        marginBottom: 8,
    },
    statValue: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: '800',
    },
    footerInfo: {
        color: '#6A6680',
        fontSize: 10,
        textAlign: 'center',
    },
    courseActiveContainer: {
        width: '100%',
    },
    stepCard: {
        backgroundColor: 'rgba(74, 158, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(74, 158, 255, 0.2)',
        borderRadius: 18,
        padding: 16,
        marginBottom: 16,
    },
    stepTitle: {
        color: '#4A9EFF',
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 4,
    },
    stepSub: {
        color: '#6A6680',
        fontSize: 12,
    },
    pivotCard: {
        backgroundColor: '#161624',
        borderRadius: 24,
        padding: 20,
        alignItems: 'center',
        marginBottom: 16,
    },
    pivotTitle: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 8,
    },
    pivotSub: {
        color: '#6A6680',
        fontSize: 10,
        marginBottom: 20,
        textAlign: 'center',
    },
    codeRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 10,
        marginBottom: 24,
    },
    codeBox: {
        width: 45,
        height: 55,
        backgroundColor: 'rgba(201, 168, 76, 0.08)',
        borderWidth: 1,
        borderColor: '#C9A84C',
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    codeBoxFilled: {
        backgroundColor: 'rgba(201, 168, 76, 0.2)',
    },
    codeDigit: {
        color: '#C9A84C',
        fontSize: 24,
        fontWeight: '900',
    },
    numpad: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 10,
        width: '100%',
        marginBottom: 20,
    },
    numKey: {
        width: '30%',
        height: 50,
        backgroundColor: '#1F1F30',
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    numText: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: '700',
    },
    okKey: {
        backgroundColor: '#C9A84C',
    },
    okText: {
        color: '#09090F',
        fontWeight: '900',
    },
    pivotWarning: {
        color: '#FF9A3C',
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 0.5,
    },
    inProgressCard: {
        backgroundColor: '#161624',
        borderRadius: 18,
        padding: 20,
        marginBottom: 16,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    infoLabel: {
        color: '#6A6680',
        fontSize: 10,
        fontWeight: '700',
    },
    infoValue: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
    },
    infoValueGold: {
        color: '#C9A84C',
        fontSize: 18,
        fontWeight: '900',
    },
    finishButton: {
        backgroundColor: '#C9A84C',
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 8,
    },
    finishButtonText: {
        color: '#09090F',
        fontSize: 14,
        fontWeight: '800',
    },
    actionRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 12,
    },
    actionBtn: {
        flex: 1,
        backgroundColor: 'rgba(74, 158, 255, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(74, 158, 255, 0.2)',
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
    },
    actionBtnText: {
        color: '#4A9EFF',
        fontWeight: '700',
    },
    absentBtn: {
        backgroundColor: 'rgba(255, 154, 60, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255, 154, 60, 0.2)',
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
    },
    absentBtnText: {
        color: '#FF9A3C',
        fontWeight: '700',
    },
    bottomNav: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 80,
        backgroundColor: '#161624',
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
        color: '#6A6680',
        marginBottom: 4,
    },
    navLabel: {
        fontSize: 10,
        color: '#6A6680',
    },
    errorText: {
        color: '#FF6464',
        fontSize: 12,
        marginBottom: 16,
    },
});
