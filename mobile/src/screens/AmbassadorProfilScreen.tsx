import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getAmbassadorProfile, updateAmbassadorProfile } from '../services/api';
import type { AmbassadorProfile, RootStackParamList } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export default function AmbassadorProfilScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AmbassadorProfil'>>();
    const { ambassadorId } = useAuth();
    const [profile, setProfile] = useState<AmbassadorProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [prenom, setPrenom] = useState('');
    const [nom, setNom] = useState('');
    const [telephone, setTelephone] = useState('');
    const [metier, setMetier] = useState('');
    const [etablissement, setEtablissement] = useState('');

    useEffect(() => {
        async function loadProfile() {
            if (!ambassadorId) return;
            try {
                const response = await getAmbassadorProfile(ambassadorId);
                setProfile(response.data);
                setPrenom(response.data.prenom);
                setNom(response.data.nom);
                setTelephone(response.data.telephone);
                setMetier(response.data.metier || '');
                setEtablissement(response.data.etablissement || '');
            } catch {
                setError('Impossible de charger les informations de profil.');
            } finally {
                setLoading(false);
            }
        }
        loadProfile();
    }, [ambassadorId]);

    const handleSave = async () => {
        if (!ambassadorId) return;
        setSaving(true);
        setMessage(null);
        setError(null);

        try {
            const response = await updateAmbassadorProfile(ambassadorId, {
                prenom,
                nom,
                telephone,
                metier,
                etablissement,
            });
            setProfile(response.data);
            setMessage('Profil mis à jour.');
        } catch {
            setError('Impossible de mettre à jour le profil.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                <Text style={styles.backText}>← Retour</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Profil</Text>
            <Text style={styles.subtitle}>Modifiez vos informations de contact et votre activité.</Text>
            {loading ? (
                <ActivityIndicator size="large" color="#C9A84C" />
            ) : error ? (
                <Text style={styles.errorText}>{error}</Text>
            ) : (
                <View>
                    <View style={styles.fieldGroup}>
                        <Text style={styles.label}>Prénom</Text>
                        <TextInput style={styles.input} value={prenom} onChangeText={setPrenom} placeholder="Prénom" placeholderTextColor="#999" />
                    </View>
                    <View style={styles.fieldGroup}>
                        <Text style={styles.label}>Nom</Text>
                        <TextInput style={styles.input} value={nom} onChangeText={setNom} placeholder="Nom" placeholderTextColor="#999" />
                    </View>
                    <View style={styles.fieldGroup}>
                        <Text style={styles.label}>Téléphone</Text>
                        <TextInput style={styles.input} value={telephone} onChangeText={setTelephone} placeholder="Téléphone" placeholderTextColor="#999" keyboardType="phone-pad" />
                    </View>
                    <View style={styles.fieldGroup}>
                        <Text style={styles.label}>Métier</Text>
                        <TextInput style={styles.input} value={metier} onChangeText={setMetier} placeholder="Métier" placeholderTextColor="#999" />
                    </View>
                    <View style={styles.fieldGroup}>
                        <Text style={styles.label}>Établissement</Text>
                        <TextInput style={styles.input} value={etablissement} onChangeText={setEtablissement} placeholder="Établissement" placeholderTextColor="#999" />
                    </View>
                    {message ? <Text style={styles.successText}>{message}</Text> : null}
                    <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
                        <Text style={styles.saveText}>{saving ? 'Enregistrement...' : 'Enregistrer'}</Text>
                    </TouchableOpacity>
                </View>
            )}
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
        marginBottom: 16,
    },
    backText: {
        color: '#C9A84C',
    },
    title: {
        color: '#C9A84C',
        fontSize: 28,
        fontWeight: '700',
        marginBottom: 8,
    },
    subtitle: {
        color: '#E0DBD2',
        marginBottom: 24,
        lineHeight: 22,
    },
    fieldGroup: {
        marginBottom: 16,
    },
    label: {
        color: '#E0DBD2',
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#161624',
        color: '#FFFFFF',
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    saveButton: {
        backgroundColor: '#C9A84C',
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 16,
    },
    saveText: {
        color: '#101818',
        fontWeight: '700',
    },
    errorText: {
        color: '#FF6B6B',
        marginBottom: 16,
    },
    successText: {
        color: '#7CD18E',
        marginBottom: 16,
    },
});
