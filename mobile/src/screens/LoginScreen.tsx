import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, StatusBar, KeyboardAvoidingView, Platform, ScrollView, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { login, demanderResetMotDePasse, reinitialiserMotDePasse } from '../services/api';
import { clearDashboardCache } from './AmbassadorAccueilScreen';
import { useAuth } from '../context/AuthContext';
import { registerForPushNotifications } from '../services/notifications';
import { Colors, Typography } from '../theme';
import PasswordInput from '../components/PasswordInput';
import type { RootStackParamList, UserRole } from '../types';

export default function LoginScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Login'>) {
    const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { setAuth } = useAuth();

    // Reset mot de passe
    const [resetStep, setResetStep] = useState<0 | 1 | 2 | 3>(0); // 0=fermé 1=email 2=code 3=nouveau mdp
    const [resetEmail, setResetEmail] = useState('');
    const [resetCode, setResetCode] = useState('');
    const [resetNewPassword, setResetNewPassword] = useState('');
    const [resetLoading, setResetLoading] = useState(false);
    const [resetError, setResetError] = useState<string | null>(null);
    const [resetSuccess, setResetSuccess] = useState(false);

    const handleLogin = async () => {
        if (!email || !password) {
            setError('Email et mot de passe requis');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await login(email, password);
            const { token, userId, role, ambassadeur_id, chauffeur_id, type_ambassadeur, is_sous_compte } = response.data;

            // Optional: check if role matches selected role
            // But for now, we just redirect based on actual backend role

            setAuth({
                token,
                userId,
                email,
                role,
                ambassadorId: ambassadeur_id || null,
                chauffeurId: chauffeur_id || null,
                typeAmbassadeur: type_ambassadeur || null,
                isSousCompte: !!is_sous_compte,
            });

            // Enregistrement push notifications
            if (role === 'ambassadeur' && ambassadeur_id) {
                registerForPushNotifications({ ambassadorId: ambassadeur_id }).catch(() => {});
            } else if (role === 'chauffeur' && chauffeur_id) {
                registerForPushNotifications({ chauffeurId: chauffeur_id }).catch(() => {});
            }

            if (role === 'chauffeur' && chauffeur_id) {
                navigation.replace('ChauffeurHome');
            } else if (role === 'ambassadeur' && ambassadeur_id) {
                clearDashboardCache();
                navigation.replace('AmbassadorAccueil');
            } else {
                setError('Type de compte non géré.');
            }
        } catch (error: any) {
            const msg = error.response?.data?.error
                || (error.message === 'Network Error' ? `Serveur inaccessible (${error.config?.baseURL ?? 'URL inconnue'})` : error.message)
                || 'Email ou mot de passe incorrect.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleDemanderReset = async () => {
        if (!resetEmail) { setResetError('Email requis'); return; }
        setResetLoading(true); setResetError(null);
        try {
            await demanderResetMotDePasse(resetEmail);
            setResetStep(2);
        } catch {
            setResetError('Erreur réseau. Réessayez.');
        } finally {
            setResetLoading(false);
        }
    };

    const handleVerifierCode = async () => {
        if (!resetCode || resetCode.length !== 6) { setResetError('Code à 6 chiffres requis'); return; }
        setResetStep(3);
        setResetError(null);
    };

    const handleNouveauMotDePasse = async () => {
        if (!resetNewPassword || resetNewPassword.length < 8) {
            setResetError('Mot de passe trop court (8 caractères minimum)');
            return;
        }
        setResetLoading(true); setResetError(null);
        try {
            await reinitialiserMotDePasse(resetEmail, resetCode, resetNewPassword);
            setResetSuccess(true);
            setTimeout(() => {
                setResetStep(0);
                setResetEmail(''); setResetCode(''); setResetNewPassword('');
                setResetSuccess(false);
            }, 2000);
        } catch (e: any) {
            setResetError(e.response?.data?.error || 'Erreur. Vérifiez le code.');
        } finally {
            setResetLoading(false);
        }
    };

    const fermerReset = () => {
        setResetStep(0);
        setResetEmail(''); setResetCode(''); setResetNewPassword('');
        setResetError(null); setResetSuccess(false);
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" />
            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
                style={styles.container}
            >
                <ScrollView contentContainerStyle={styles.scrollContent} centerContent>
                    
                    {/* Header: Huge Logo */}
                    <View style={styles.header}>
                        <Text style={styles.logoText}>SÉSAME</Text>
                        <Text style={styles.welcomeText}>Bienvenue</Text>
                    </View>

                    {/* Role Selection Portal */}
                    {!selectedRole ? (
                        <View style={styles.portalContainer}>
                            <Text style={styles.instructionText}>Choisissez votre espace pour commencer</Text>
                            
                            <TouchableOpacity style={styles.roleBtn} onPress={() => setSelectedRole('ambassadeur')}>
                                <Text style={styles.roleEmoji}>🗝</Text>
                                <Text style={styles.roleLabel}>AMBASSADEUR</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.roleBtn} onPress={() => setSelectedRole('chauffeur')}>
                                <Text style={styles.roleEmoji}>🚗</Text>
                                <Text style={styles.roleLabel}>CHAUFFEUR</Text>
                            </TouchableOpacity>

                        </View>
                    ) : (
                        <View style={styles.formContainer}>
                            <TouchableOpacity style={styles.backLink} onPress={() => setSelectedRole(null)}>
                                <Text style={styles.backLinkText}>← Retour au choix</Text>
                            </TouchableOpacity>

                            <Text style={styles.roleIndicator}>ESPACE {selectedRole.toUpperCase()}</Text>

                            <TextInput
                                style={styles.input}
                                placeholder="Email professionnel"
                                placeholderTextColor={Colors.nocturne.textSecondary}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                value={email}
                                onChangeText={setEmail}
                            />
                            <PasswordInput
                                style={styles.input}
                                placeholder="Mot de passe"
                                placeholderTextColor={Colors.nocturne.textSecondary}
                                value={password}
                                onChangeText={setPassword}
                            />

                            {error && <Text style={styles.errorText}>{error}</Text>}

                            <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
                                {loading ? <ActivityIndicator color="#101018" /> : <Text style={styles.buttonText}>SE CONNECTER</Text>}
                            </TouchableOpacity>

                            <View style={styles.footerLinks}>
                                <TouchableOpacity onPress={() => { setResetStep(1); }}>
                                    <Text style={styles.footerLinkText}>Mot de passe oublié ?</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.registerRow}>
                                <Text style={styles.registerText}>Pas encore de compte ? </Text>
                                <TouchableOpacity onPress={() => navigation.navigate('Register', { initialRole: (selectedRole === 'admin' ? undefined : selectedRole) ?? undefined })}>
                                    <Text style={styles.registerLink}>S'inscrire</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
            {/* Modal reset mot de passe */}
            <Modal visible={resetStep > 0} transparent animationType="slide" onRequestClose={fermerReset}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <TouchableOpacity style={styles.modalClose} onPress={fermerReset}>
                            <Text style={styles.modalCloseText}>✕</Text>
                        </TouchableOpacity>

                        {resetSuccess ? (
                            <View style={styles.modalSuccessContainer}>
                                <Text style={styles.modalSuccessIcon}>✓</Text>
                                <Text style={styles.modalSuccessText}>Mot de passe modifié !</Text>
                            </View>
                        ) : (
                            <>
                                <Text style={styles.modalTitle}>
                                    {resetStep === 1 ? 'Mot de passe oublié' : resetStep === 2 ? 'Code de vérification' : 'Nouveau mot de passe'}
                                </Text>
                                <Text style={styles.modalSubtitle}>
                                    {resetStep === 1
                                        ? 'Entrez votre email pour recevoir un code par email.'
                                        : resetStep === 2
                                        ? `Un code à 6 chiffres a été envoyé à ${resetEmail}`
                                        : 'Choisissez un nouveau mot de passe.'}
                                </Text>

                                {resetStep === 1 && (
                                    <TextInput
                                        style={styles.modalInput}
                                        placeholder="votre@email.com"
                                        placeholderTextColor={Colors.nocturne.textSecondary}
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                        value={resetEmail}
                                        onChangeText={setResetEmail}
                                    />
                                )}
                                {resetStep === 2 && (
                                    <TextInput
                                        style={[styles.modalInput, styles.modalInputCode]}
                                        placeholder="000000"
                                        placeholderTextColor={Colors.nocturne.textSecondary}
                                        keyboardType="number-pad"
                                        maxLength={6}
                                        value={resetCode}
                                        onChangeText={setResetCode}
                                    />
                                )}
                                {resetStep === 3 && (
                                    <PasswordInput
                                        style={styles.modalInput}
                                        placeholder="Nouveau mot de passe"
                                        placeholderTextColor={Colors.nocturne.textSecondary}
                                        value={resetNewPassword}
                                        onChangeText={setResetNewPassword}
                                    />
                                )}

                                {resetError && <Text style={styles.modalError}>{resetError}</Text>}

                                <TouchableOpacity
                                    style={styles.modalBtn}
                                    onPress={resetStep === 1 ? handleDemanderReset : resetStep === 2 ? handleVerifierCode : handleNouveauMotDePasse}
                                    disabled={resetLoading}
                                >
                                    {resetLoading
                                        ? <ActivityIndicator color="#101018" />
                                        : <Text style={styles.modalBtnText}>
                                            {resetStep === 1 ? 'ENVOYER LE CODE' : resetStep === 2 ? 'VÉRIFIER' : 'CONFIRMER'}
                                          </Text>
                                    }
                                </TouchableOpacity>

                                {resetStep === 2 && (
                                    <TouchableOpacity onPress={() => { setResetCode(''); setResetStep(1); }} style={styles.modalRetry}>
                                        <Text style={styles.modalRetryText}>Renvoyer un code par email</Text>
                                    </TouchableOpacity>
                                )}
                            </>
                        )}
                    </View>
                </View>
            </Modal>
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
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: 32,
    },
    header: {
        alignItems: 'center',
        marginBottom: 60,
    },
    logoText: {
        fontSize: 48,
        color: Colors.brand.gold,
        fontWeight: Typography.weights.black as any,
        letterSpacing: 4,
    },
    welcomeText: {
        fontSize: Typography.sizes.header,
        color: Colors.nocturne.textPrimary,
        fontWeight: Typography.weights.semiBold as any,
        marginTop: 8,
    },
    portalContainer: {
        gap: 16,
    },
    instructionText: {
        color: Colors.nocturne.textSecondary,
        textAlign: 'center',
        fontSize: Typography.sizes.sub,
        marginBottom: 24,
        fontWeight: Typography.weights.bold as any,
    },
    roleBtn: {
        backgroundColor: Colors.nocturne.card,
        borderRadius: 20,
        padding: 24,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(201, 168, 76, 0.1)',
    },
    roleBtnAdmin: {
        padding: 16,
        justifyContent: 'center',
        opacity: 0.6,
        marginTop: 20,
    },
    roleEmoji: {
        fontSize: 32,
        marginRight: 20,
    },
    roleLabel: {
        color: '#FFFFFF',
        fontSize: Typography.sizes.header,
        fontWeight: Typography.weights.black as any,
        letterSpacing: 1,
    },
    roleLabelSmall: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.bold as any,
        letterSpacing: 2,
    },
    formContainer: {
        width: '100%',
    },
    backLink: {
        marginBottom: 32,
    },
    backLinkText: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.sub,
    },
    roleIndicator: {
        color: Colors.brand.gold,
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.black as any,
        letterSpacing: 2,
        marginBottom: 24,
        textAlign: 'center',
    },
    input: {
        backgroundColor: Colors.nocturne.card,
        color: '#FFFFFF',
        borderRadius: 16,
        paddingHorizontal: 20,
        paddingVertical: 18,
        fontSize: Typography.sizes.body,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    button: {
        backgroundColor: Colors.brand.gold,
        paddingVertical: 20,
        borderRadius: 16,
        alignItems: 'center',
        marginTop: 10,
        shadowColor: Colors.brand.gold,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 5,
    },
    buttonText: {
        color: '#101018',
        fontWeight: Typography.weights.black as any,
        fontSize: 16,
        letterSpacing: 1,
    },
    footerLinks: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 32,
    },
    footerLinkText: {
        color: Colors.brand.gold,
        fontSize: Typography.sizes.sub,
        fontWeight: Typography.weights.semiBold as any,
    },
    dot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: Colors.nocturne.textSecondary,
        marginHorizontal: 12,
        opacity: 0.5,
    },
    errorText: {
        color: Colors.brand.error,
        marginBottom: 20,
        textAlign: 'center',
        fontSize: Typography.sizes.sub,
        fontWeight: Typography.weights.bold as any,
    },
    registerRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 20,
    },
    registerText: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.sub,
    },
    registerLink: {
        color: Colors.brand.gold,
        fontSize: Typography.sizes.sub,
        fontWeight: Typography.weights.bold as any,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'flex-end',
    },
    modalCard: {
        backgroundColor: Colors.nocturne.card,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        padding: 32,
        paddingBottom: 48,
    },
    modalClose: {
        alignSelf: 'flex-end',
        marginBottom: 16,
    },
    modalCloseText: {
        color: Colors.nocturne.textSecondary,
        fontSize: 18,
    },
    modalTitle: {
        color: Colors.brand.gold,
        fontSize: Typography.sizes.header,
        fontWeight: Typography.weights.black as any,
        marginBottom: 8,
    },
    modalSubtitle: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.sub,
        marginBottom: 24,
        lineHeight: 20,
    },
    modalInput: {
        backgroundColor: Colors.nocturne.background,
        color: '#FFFFFF',
        borderRadius: 16,
        paddingHorizontal: 20,
        paddingVertical: 18,
        fontSize: Typography.sizes.body,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    modalInputCode: {
        fontSize: 28,
        letterSpacing: 12,
        textAlign: 'center',
        fontWeight: Typography.weights.black as any,
    },
    modalError: {
        color: Colors.brand.error,
        fontSize: Typography.sizes.sub,
        marginBottom: 16,
        textAlign: 'center',
    },
    modalBtn: {
        backgroundColor: Colors.brand.gold,
        paddingVertical: 18,
        borderRadius: 16,
        alignItems: 'center',
    },
    modalBtnText: {
        color: '#101018',
        fontWeight: Typography.weights.black as any,
        fontSize: 14,
        letterSpacing: 1,
    },
    modalRetry: {
        marginTop: 16,
        alignItems: 'center',
    },
    modalRetryText: {
        color: Colors.nocturne.textSecondary,
        fontSize: Typography.sizes.sub,
        textDecorationLine: 'underline',
    },
    modalSuccessContainer: {
        alignItems: 'center',
        paddingVertical: 32,
    },
    modalSuccessIcon: {
        fontSize: 48,
        color: Colors.brand.success,
        marginBottom: 16,
    },
    modalSuccessText: {
        color: Colors.nocturne.textPrimary,
        fontSize: Typography.sizes.header,
        fontWeight: Typography.weights.bold as any,
    },
});
