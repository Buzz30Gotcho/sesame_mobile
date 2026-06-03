import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, SafeAreaView, Switch, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getChauffeurDashboard, setChauffeurAvailability, validateCourseCode, finishChauffeurCourse } from '../services/api';
import { Colors, Typography } from '../theme';
import BottomNav from '../components/BottomNav';
import type { RootStackParamList, ChauffeurDashboard } from '../types';
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
        const interval = setInterval(loadDashboard, 10000);
        return () => clearInterval(interval);
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
                <ActivityIndicator size="large" color={Colors.brand.gold} />
            </View>
        );
    }

    const currentCourse = dashboard?.current_course;

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" />
            
            {/* Availability Header - Driver Status System */}
            <View style={[styles.statusHeader, dashboard?.disponible ? styles.statusOnline : styles.statusOffline]}>
                <View>
                    <Text style={styles.driverName}>{dashboard?.prenom} {dashboard?.nom}</Text>
                    <Text style={dashboard?.disponible ? styles.onlineText : styles.offlineText}>
                        ● {dashboard?.disponible ? 'EN LIGNE' : 'HORS LIGNE'}
                    </Text>
                </View>
                <Switch 
                    value={dashboard?.disponible} 
                    onValueChange={toggleAvailability} 
                    trackColor={{ false: '#303040', true: Colors.brand.success }}
                    thumbColor="#FFFFFF"
                />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                
                {!currentCourse ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyCard}>
                            <Text style={styles.emptyTitle}>PRÊT À ACCEPTER</Text>
                            <Text style={styles.emptySub}>Recherche de courses en cours...</Text>
                        </View>
                        <View style={styles.statsRow}>
                            <View style={styles.statCard}>
                                <Text style={styles.statLabel}>COURSES JOUR</Text>
                                <Text style={styles.statValue}>3</Text>
                            </View>
                            <View style={styles.statCard}>
                                <Text style={styles.statLabel}>CA ESTIMÉ</Text>
                                <Text style={styles.statValue}>108,00 €</Text>
                            </View>
                        </View>
                        <Text style={styles.footerInfo}>CA AFFICHÉ : MONTANT TOTAL ENCAISSÉ CLIENT</Text>
                    </View>
                ) : (
                    <View style={styles.courseActiveContainer}>
                        {/* Course Step Indicator */}
                        <View style={styles.stepCard}>
                            <Text style={styles.stepTitle}>
                                {currentCourse.statut === 'acceptee' ? 'EN ROUTE VERS LE CLIENT' : 
                                 currentCourse.statut === 'en_route' ? 'ARRIVÉ SUR PLACE' : 
                                 currentCourse.statut === 'code_valide' ? 'COURSE EN COURS' : 'MISSION TERMINÉE'}
                            </Text>
                            <Text style={styles.stepSub}>{currentCourse.adresse_depart}</Text>
                        </View>

                        {/* Pivot UI: Code Entry - MANDATORY FOR REVENUE */}
                        {['acceptee', 'en_route'].includes(currentCourse.statut || '') && (
                            <View style={styles.pivotCard}>
                                <Text style={styles.pivotTitle}>CODE CLIENT SESAME</Text>
                                <Text style={styles.pivotSub}>Le client doit vous communiquer son code à 4 chiffres</Text>
                                
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
                                
                                <View style={styles.pivotWarningBox}>
                                    <Text style={styles.pivotWarning}>⚡ PIVOT JURIDIQUE ET FINANCIER OBLIGATOIRE</Text>
                                </View>
                            </View>
                        )}

                        {/* Course in progress - Billing Context */}
                        {currentCourse.statut === 'code_valide' && (
                            <View style={styles.inProgressCard}>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>DESTINATION</Text>
                                    <Text style={styles.infoValue}>{currentCourse.adresse_destination}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>MONTANT À ENCAISSER</Text>
                                    <Text style={styles.infoValueGold}>{currentCourse.montant} €</Text>
                                </View>
                                <TouchableOpacity style={styles.finishButton} onPress={handleFinishCourse}>
                                    <Text style={styles.finishButtonText}>TERMINER ET FERMER LA COURSE</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* Action Buttons */}
                        <View style={styles.actionRow}>
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => chauffeurId && currentCourse && navigation.navigate('Chat', {
                                    courseId: currentCourse.id,
                                    senderRole: 'chauffeur',
                                    senderId: chauffeurId,
                                    courseRef: currentCourse.reference,
                                })}
                            >
                                <Text style={styles.actionBtnText}>💬 CHAT</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionBtn}>
                                <Text style={styles.actionBtnText}>📞 APPELER</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Client Absent Option */}
                        <TouchableOpacity style={styles.absentBtn}>
                            <Text style={styles.absentBtnText}>🆘 CLIENT ABSENT / LITIGE</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>

            <BottomNav role="chauffeur" />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: Colors.nocturne.background,
    },
    container: {
        flex: 1,
        backgroundColor: Colors.nocturne.background,
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
        backgroundColor: 'rgba(76, 175, 130, 0.05)',
    },
    statusOffline: {
        backgroundColor: 'rgba(106, 102, 128, 0.05)',
    },
    driverName: {
        color: '#FFFFFF',
        fontSize: Typography.sizes.body,
        fontWeight: Typography.weights.bold as any,
    },
    onlineText: {
        color: Colors.brand.success,
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.black as any,
        marginTop: 2,
    },
    offlineText: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.black as any,
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
        backgroundColor: 'rgba(76, 175, 130, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(76, 175, 130, 0.2)',
        borderRadius: 18,
        padding: 24,
        width: '100%',
        alignItems: 'center',
        marginBottom: 20,
    },
    emptyTitle: {
        color: Colors.brand.success,
        fontSize: Typography.sizes.sub,
        fontWeight: Typography.weights.black as any,
        letterSpacing: 1,
        marginBottom: 8,
    },
    emptySub: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.sub,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: 20,
    },
    statCard: {
        flex: 1,
        backgroundColor: Colors.nocturne.card,
        borderRadius: 18,
        padding: 16,
        marginHorizontal: 4,
    },
    statLabel: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.bold as any,
        marginBottom: 8,
    },
    statValue: {
        color: '#FFFFFF',
        fontSize: Typography.sizes.header,
        fontWeight: Typography.weights.black as any,
    },
    footerInfo: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.tiny,
        textAlign: 'center',
        fontWeight: Typography.weights.bold as any,
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
        color: Colors.brand.info,
        fontSize: Typography.sizes.sub,
        fontWeight: Typography.weights.black as any,
        marginBottom: 4,
    },
    stepSub: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.sub,
    },
    pivotCard: {
        backgroundColor: Colors.nocturne.card,
        borderRadius: 24,
        padding: 20,
        alignItems: 'center',
        marginBottom: 16,
    },
    pivotTitle: {
        color: '#FFFFFF',
        fontSize: Typography.sizes.body,
        fontWeight: Typography.weights.black as any,
        marginBottom: 8,
    },
    pivotSub: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.tiny,
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
        borderColor: Colors.brand.gold,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    codeBoxFilled: {
        backgroundColor: 'rgba(201, 168, 76, 0.2)',
    },
    codeDigit: {
        color: Colors.brand.gold,
        fontSize: Typography.sizes.title,
        fontWeight: Typography.weights.black as any,
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
        fontSize: Typography.sizes.header,
        fontWeight: Typography.weights.bold as any,
    },
    okKey: {
        backgroundColor: Colors.brand.gold,
    },
    okText: {
        color: '#09090F',
        fontWeight: Typography.weights.black as any,
    },
    pivotWarningBox: {
        marginTop: 10,
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: 'rgba(255, 154, 60, 0.1)',
        borderRadius: 6,
    },
    pivotWarning: {
        color: Colors.brand.warning,
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.black as any,
        letterSpacing: 0.5,
    },
    inProgressCard: {
        backgroundColor: Colors.nocturne.card,
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
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.bold as any,
    },
    infoValue: {
        color: '#FFFFFF',
        fontSize: Typography.sizes.body,
        fontWeight: Typography.weights.semiBold as any,
    },
    infoValueGold: {
        color: Colors.brand.gold,
        fontSize: Typography.sizes.header,
        fontWeight: Typography.weights.black as any,
    },
    finishButton: {
        backgroundColor: Colors.brand.gold,
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 8,
    },
    finishButtonText: {
        color: '#09090F',
        fontSize: Typography.sizes.body,
        fontWeight: Typography.weights.black as any,
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
        color: Colors.brand.info,
        fontWeight: Typography.weights.bold as any,
        fontSize: Typography.sizes.tiny,
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
        color: Colors.brand.warning,
        fontWeight: Typography.weights.bold as any,
        fontSize: Typography.sizes.tiny,
    },
    errorText: {
        color: Colors.brand.error,
        fontSize: Typography.sizes.tiny,
        marginBottom: 16,
    },
});
