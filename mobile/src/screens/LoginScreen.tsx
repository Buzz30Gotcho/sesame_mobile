import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, SafeAreaView, StatusBar, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { login } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Colors, Typography } from '../theme';
import type { RootStackParamList, UserRole } from '../types';

export default function LoginScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Login'>) {
    const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { setAuth } = useAuth();

    const handleLogin = async () => {
        if (!email || !password) {
            setError('Email et mot de passe requis');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await login(email, password);
            const { token, userId, role, ambassadeur_id, chauffeur_id } = response.data;

            // Optional: check if role matches selected role
            // But for now, we just redirect based on actual backend role
            
            setAuth({
                token,
                userId,
                email,
                role,
                ambassadorId: ambassadeur_id || null,
                chauffeurId: chauffeur_id || null,
                adminId: role === 'admin' ? userId : null,
            });

            if (role === 'chauffeur' && chauffeur_id) {
                navigation.replace('ChauffeurHome');
            } else if (role === 'admin') {
                navigation.replace('AdminDashboard');
            } else if (role === 'ambassadeur' && ambassadeur_id) {
                navigation.replace('AmbassadorAccueil'); // Use replace to clear stack
            } else {
                setError('Type de compte non géré.');
            }
        } catch (error: any) {
            setError(error.response?.data?.error || 'Email ou mot de passe incorrect.');
        } finally {
            setLoading(false);
        }
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

                            <TouchableOpacity style={[styles.roleBtn, styles.roleBtnAdmin]} onPress={() => setSelectedRole('admin')}>
                                <Text style={styles.roleLabelSmall}>ADMINISTRATION</Text>
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
                            <TextInput
                                style={styles.input}
                                placeholder="Mot de passe"
                                placeholderTextColor={Colors.nocturne.textSecondary}
                                secureTextEntry
                                value={password}
                                onChangeText={setPassword}
                            />

                            {error && <Text style={styles.errorText}>{error}</Text>}

                            <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
                                {loading ? <ActivityIndicator color="#101018" /> : <Text style={styles.buttonText}>SE CONNECTER</Text>}
                            </TouchableOpacity>

                            <View style={styles.footerLinks}>
                                <TouchableOpacity>
                                    <Text style={styles.footerLinkText}>Mot de passe oublié ?</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.registerRow}>
                                <Text style={styles.registerText}>Pas encore de compte ? </Text>
                                <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                                    <Text style={styles.registerLink}>S'inscrire</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
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
});
