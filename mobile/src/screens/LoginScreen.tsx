import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { login } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../types';

export default function LoginScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Login'>) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { setAuth } = useAuth();

    const handleLogin = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await login(email, password);
            const { token, userId, role, ambassadeur_id, chauffeur_id } = response.data;

            if (!userId || !role) {
                setError('Impossible de récupérer les informations du compte.');
                setLoading(false);
                return;
            }

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
                navigation.replace('AmbassadorHome');
            } else {
                setError('Type de compte non géré.');
            }
        } catch (error) {
            setError('Email ou mot de passe incorrect.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>SESAME</Text>
            <Text style={styles.subtitle}>Connectez-vous pour accéder à votre espace SESAME: Ambassadeur, Chauffeur ou Admin.</Text>
            <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#999"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
            />
            <TextInput
                style={styles.input}
                placeholder="Mot de passe"
                placeholderTextColor="#999"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
                {loading ? <ActivityIndicator color="#101018" /> : <Text style={styles.buttonText}>Se connecter</Text>}
            </TouchableOpacity>
            <Text style={styles.hint}>Utilisez les identifiants de votre compte Ambassadeur.</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#101018',
        justifyContent: 'center',
        padding: 24,
    },
    title: {
        fontSize: 36,
        color: '#C9A84C',
        marginBottom: 12,
        fontWeight: 'bold',
    },
    subtitle: {
        color: '#E0DBD2',
        marginBottom: 24,
        fontSize: 16,
        lineHeight: 22,
    },
    input: {
        backgroundColor: '#161624',
        color: '#FFFFFF',
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 14,
    },
    button: {
        backgroundColor: '#C9A84C',
        paddingVertical: 16,
        borderRadius: 14,
        alignItems: 'center',
        marginTop: 6,
    },
    buttonText: {
        color: '#101018',
        fontWeight: '700',
    },
    hint: {
        color: '#8F8F8F',
        marginTop: 16,
        textAlign: 'center',
        lineHeight: 20,
    },
    errorText: {
        color: '#FF6B6B',
        marginBottom: 10,
        textAlign: 'center',
    },
});
