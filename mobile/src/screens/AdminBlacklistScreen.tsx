import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TextInput, TouchableOpacity, Alert } from 'react-native';
import { getAdminBlacklist, addAdminBlacklist } from '../services/api';
import type { AdminBlacklistRow } from '../types';

export default function AdminBlacklistScreen() {
    const [blacklist, setBlacklist] = useState<AdminBlacklistRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [nomPrenom, setNomPrenom] = useState('');
    const [dateNaissance, setDateNaissance] = useState('');
    const [lieuNaissance, setLieuNaissance] = useState('');
    const [telephone, setTelephone] = useState('');
    const [motif, setMotif] = useState('');
    const [typeUtilisateur, setTypeUtilisateur] = useState<'ambassadeur' | 'chauffeur'>('ambassadeur');

    useEffect(() => {
        async function loadBlacklist() {
            try {
                const response = await getAdminBlacklist();
                setBlacklist(response.data);
            } catch (err) {
                setError('Impossible de charger la blacklist.');
            } finally {
                setLoading(false);
            }
        }
        loadBlacklist();
    }, []);

    const handleAdd = async () => {
        if (!nomPrenom || !dateNaissance || !lieuNaissance || !telephone || !motif) {
            return Alert.alert('Champs requis', 'Veuillez renseigner tous les champs.');
        }
        try {
            const response = await addAdminBlacklist({
                nom_prenom: nomPrenom,
                date_naissance: dateNaissance,
                lieu_naissance: lieuNaissance,
                telephone,
                motif,
                type_utilisateur: typeUtilisateur,
            });
            setBlacklist((prev) => [response.data, ...prev]);
            setNomPrenom('');
            setDateNaissance('');
            setLieuNaissance('');
            setTelephone('');
            setMotif('');
            Alert.alert('Ajouté', 'La personne a été ajoutée à la blacklist.');
        } catch (err) {
            Alert.alert('Erreur', 'Impossible d’ajouter à la blacklist.');
        }
    };

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>Blacklist</Text>
            <View style={styles.formCard}>
                <Text style={styles.fieldLabel}>Nom et prénom</Text>
                <TextInput style={styles.input} placeholder="Nom et prénom" placeholderTextColor="#777" value={nomPrenom} onChangeText={setNomPrenom} />
                <Text style={styles.fieldLabel}>Date de naissance</Text>
                <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#777" value={dateNaissance} onChangeText={setDateNaissance} />
                <Text style={styles.fieldLabel}>Lieu de naissance</Text>
                <TextInput style={styles.input} placeholder="Lieu de naissance" placeholderTextColor="#777" value={lieuNaissance} onChangeText={setLieuNaissance} />
                <Text style={styles.fieldLabel}>Téléphone</Text>
                <TextInput style={styles.input} placeholder="Téléphone" placeholderTextColor="#777" value={telephone} onChangeText={setTelephone} keyboardType="phone-pad" />
                <Text style={styles.fieldLabel}>Motif</Text>
                <TextInput style={styles.input} placeholder="Motif" placeholderTextColor="#777" value={motif} onChangeText={setMotif} />
                <Text style={styles.fieldLabel}>Type utilisateur</Text>
                <View style={styles.typeRow}>
                    <TouchableOpacity style={[styles.typeButton, typeUtilisateur === 'ambassadeur' && styles.typeSelected]} onPress={() => setTypeUtilisateur('ambassadeur')}>
                        <Text style={styles.typeText}>Ambassadeur</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.typeButton, typeUtilisateur === 'chauffeur' && styles.typeSelected]} onPress={() => setTypeUtilisateur('chauffeur')}>
                        <Text style={styles.typeText}>Chauffeur</Text>
                    </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.submitButton} onPress={handleAdd}>
                    <Text style={styles.submitText}>Ajouter</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color="#C9A84C" style={styles.loader} />
            ) : error ? (
                <Text style={styles.errorText}>{error}</Text>
            ) : blacklist.length ? (
                blacklist.map((item) => (
                    <View key={item.id} style={styles.card}>
                        <Text style={styles.rowText}>{item.nom_prenom}</Text>
                        <Text style={styles.metaText}>{item.lieu_naissance} · {item.date_naissance}</Text>
                        <Text style={styles.metaText}>{item.telephone} · {item.type_utilisateur}</Text>
                        <Text style={styles.statusText}>{item.motif}</Text>
                    </View>
                ))
            ) : (
                <Text style={styles.emptyText}>Aucune personne blacklistée.</Text>
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
    formCard: {
        backgroundColor: '#161624',
        borderRadius: 18,
        padding: 18,
        marginBottom: 24,
    },
    fieldLabel: {
        color: '#8F8F8F',
        marginTop: 14,
        marginBottom: 6,
    },
    input: {
        backgroundColor: '#101018',
        color: '#FFFFFF',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    typeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 10,
    },
    typeButton: {
        flex: 1,
        marginRight: 8,
        backgroundColor: '#2B2B3B',
        paddingVertical: 12,
        alignItems: 'center',
        borderRadius: 12,
    },
    typeSelected: {
        backgroundColor: '#C9A84C',
    },
    typeText: {
        color: '#FFFFFF',
    },
    submitButton: {
        marginTop: 16,
        backgroundColor: '#C9A84C',
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
    },
    submitText: {
        color: '#101018',
        fontWeight: '700',
    },
    loader: {
        marginTop: 24,
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
    statusText: {
        marginTop: 10,
        color: '#FF6B6B',
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
