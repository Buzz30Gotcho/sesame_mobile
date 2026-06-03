import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, SafeAreaView, Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { register } from '../services/api';
import type { RootStackParamList, UserRole } from '../types';

type Step = 1 | 2;
type AmbassadorType = 'physique' | 'moral';

export default function RegisterScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Register'>) {
    const [step, setStep] = useState<Step>(1);
    
    // Step 1: Role Selection
    const [role, setRole] = useState<UserRole | null>(null);
    
    // Step 2: Details
    const [ambassadorType, setAmbassadorType] = useState<AmbassadorType>('physique');
    
    // Identity
    const [prenom, setPrenom] = useState('');
    const [nom, setNom] = useState('');
    const [email, setEmail] = useState('');
    const [telephone, setTelephone] = useState('');
    const [password, setPassword] = useState('');
    const [dateNaissance, setDateNaissance] = useState('');
    const [lieuNaissance, setLieuNaissance] = useState('');
    const [paysNaissance, setPaysNaissance] = useState('');

    // Ambassador specific
    const [etablissement, setEtablissement] = useState('');
    const [metier, setMetier] = useState('');
    const [cp, setCp] = useState('');
    const [raisonSociale, setRaisonSociale] = useState('');
    const [siret, setSiret] = useState('');
    const [iban, setIban] = useState('');

    // Driver specific
    const [vehiculeType, setVehiculeType] = useState<'berline' | 'van'>('berline');
    const [vehiculeMarque, setVehiculeMarque] = useState('');
    const [vehiculeModele, setVehiculeModele] = useState('');
    const [vehiculeCouleur, setVehiculeCouleur] = useState('');
    const [vehiculeImmat, setVehiculeImmat] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleNextStep = () => {
        if (!role) {
            setError('Veuillez choisir un rôle.');
            return;
        }
        setError(null);
        setStep(2);
    };

    const handleRegister = async () => {
        // Validation basic
        if (!email || !telephone || !password) {
            setError('Les champs Email, Téléphone et Mot de passe sont obligatoires.');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const payload: any = {
                type: role,
                prenom,
                nom,
                email,
                telephone,
                mot_de_passe: password,
                date_naissance: dateNaissance,
                lieu_naissance: lieuNaissance,
                pays_naissance: paysNaissance,
                iban,
                siret,
            };

            if (role === 'ambassadeur') {
                payload.ambassador_type = ambassadorType;
                payload.etablissement = etablissement;
                payload.metier = metier;
                payload.cp = cp;
                payload.raison_sociale = raisonSociale;
            } else {
                payload.vehicule_type = vehiculeType;
                payload.vehicule_marque = vehiculeMarque;
                payload.vehicule_modele = vehiculeModele;
                payload.vehicule_couleur = vehiculeCouleur;
                payload.vehicule_immat = vehiculeImmat;
            }

            await register(payload);
            navigation.navigate('Login');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Une erreur est survenue lors de l’inscription.');
        } finally {
            setLoading(false);
        }
    };

    const renderStep1 = () => (
        <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Étape 1 : Vous êtes ?</Text>
            <Text style={styles.stepSubtitle}>Choisissez votre rôle au sein de SÉSAME.</Text>
            
            <TouchableOpacity 
                style={[styles.roleCard, role === 'ambassadeur' && styles.roleCardSelected]} 
                onPress={() => setRole('ambassadeur')}
            >
                <View style={styles.roleIconContainer}><Text style={styles.roleIcon}>🗝</Text></View>
                <View style={styles.roleTextContainer}>
                    <Text style={[styles.roleLabel, role === 'ambassadeur' && styles.roleLabelSelected]}>Ambassadeur</Text>
                    <Text style={styles.roleDescription}>Prescrivez des courses et gagnez des points ou commissions.</Text>
                </View>
            </TouchableOpacity>

            <TouchableOpacity 
                style={[styles.roleCard, role === 'chauffeur' && styles.roleCardSelected]} 
                onPress={() => setRole('chauffeur')}
            >
                <View style={[styles.roleIconContainer, { backgroundColor: '#2A6ECC20' }]}><Text style={[styles.roleIcon, { color: '#4A9EFF' }]}>🚗</Text></View>
                <View style={styles.roleTextContainer}>
                    <Text style={[styles.roleLabel, role === 'chauffeur' && styles.roleLabelSelected]}>Chauffeur</Text>
                    <Text style={styles.roleDescription}>Transportez les clients et développez votre activité.</Text>
                </View>
            </TouchableOpacity>

            {error && <Text style={styles.errorText}>{error}</Text>}

            <TouchableOpacity style={styles.button} onPress={handleNextStep}>
                <Text style={styles.buttonText}>Continuer</Text>
            </TouchableOpacity>
        </View>
    );

    const renderStep2Ambassador = () => (
        <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Étape 2 : Type d'Ambassadeur</Text>
            
            <View style={styles.toggleContainer}>
                <TouchableOpacity 
                    style={[styles.toggleButton, ambassadorType === 'physique' && styles.toggleButtonSelected]}
                    onPress={() => setAmbassadorType('physique')}
                >
                    <Text style={[styles.toggleButtonText, ambassadorType === 'physique' && styles.toggleButtonTextSelected]}>Particulier</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.toggleButton, ambassadorType === 'moral' && styles.toggleButtonSelected]}
                    onPress={() => setAmbassadorType('moral')}
                >
                    <Text style={[styles.toggleButtonText, ambassadorType === 'moral' && styles.toggleButtonTextSelected]}>Entreprise</Text>
                </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                <Text style={styles.sectionLabel}>Identité</Text>
                {ambassadorType === 'moral' && (
                    <TextInput style={styles.input} placeholder="Raison Sociale" placeholderTextColor="#6A6680" value={raisonSociale} onChangeText={setRaisonSociale} />
                )}
                <TextInput style={styles.input} placeholder="Prénom" placeholderTextColor="#6A6680" value={prenom} onChangeText={setPrenom} />
                <TextInput style={styles.input} placeholder="Nom" placeholderTextColor="#6A6680" value={nom} onChangeText={setNom} />
                <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#6A6680" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
                <TextInput style={styles.input} placeholder="Téléphone" placeholderTextColor="#6A6680" keyboardType="phone-pad" value={telephone} onChangeText={setTelephone} />
                <TextInput style={styles.input} placeholder="Mot de passe" placeholderTextColor="#6A6680" secureTextEntry value={password} onChangeText={setPassword} />
                
                <Text style={styles.sectionLabel}>Informations complémentaires</Text>
                <TextInput style={styles.input} placeholder="Date de naissance (JJ/MM/AAAA)" placeholderTextColor="#6A6680" value={dateNaissance} onChangeText={setDateNaissance} />
                <TextInput style={styles.input} placeholder="Lieu de naissance" placeholderTextColor="#6A6680" value={lieuNaissance} onChangeText={setLieuNaissance} />
                <TextInput style={styles.input} placeholder="Pays de naissance" placeholderTextColor="#6A6680" value={paysNaissance} onChangeText={setPaysNaissance} />

                {ambassadorType === 'physique' ? (
                    <>
                        <TextInput style={styles.input} placeholder="Établissement" placeholderTextColor="#6A6680" value={etablissement} onChangeText={setEtablissement} />
                        <TextInput style={styles.input} placeholder="Métier" placeholderTextColor="#6A6680" value={metier} onChangeText={setMetier} />
                        <TextInput style={styles.input} placeholder="Code Postal" placeholderTextColor="#6A6680" value={cp} onChangeText={setCp} />
                    </>
                ) : (
                    <>
                        <TextInput style={styles.input} placeholder="SIRET" placeholderTextColor="#6A6680" value={siret} onChangeText={setSiret} />
                        <TextInput style={styles.input} placeholder="IBAN" placeholderTextColor="#6A6680" value={iban} onChangeText={setIban} />
                    </>
                )}

                {error && <Text style={styles.errorText}>{error}</Text>}

                <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
                    {loading ? <ActivityIndicator color="#101018" /> : <Text style={styles.buttonText}>S'inscrire</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.backButton} onPress={() => setStep(1)}>
                    <Text style={styles.backButtonText}>Retour</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );

    const renderStep2Driver = () => (
        <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Étape 2 : Informations Chauffeur</Text>
            
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                <Text style={styles.sectionLabel}>Identité</Text>
                <TextInput style={styles.input} placeholder="Prénom" placeholderTextColor="#6A6680" value={prenom} onChangeText={setPrenom} />
                <TextInput style={styles.input} placeholder="Nom" placeholderTextColor="#6A6680" value={nom} onChangeText={setNom} />
                <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#6A6680" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
                <TextInput style={styles.input} placeholder="Téléphone" placeholderTextColor="#6A6680" keyboardType="phone-pad" value={telephone} onChangeText={setTelephone} />
                <TextInput style={styles.input} placeholder="Mot de passe" placeholderTextColor="#6A6680" secureTextEntry value={password} onChangeText={setPassword} />
                
                <Text style={styles.sectionLabel}>Informations complémentaires</Text>
                <TextInput style={styles.input} placeholder="Date de naissance (JJ/MM/AAAA)" placeholderTextColor="#6A6680" value={dateNaissance} onChangeText={setDateNaissance} />
                <TextInput style={styles.input} placeholder="Lieu de naissance" placeholderTextColor="#6A6680" value={lieuNaissance} onChangeText={setLieuNaissance} />
                <TextInput style={styles.input} placeholder="Pays de naissance" placeholderTextColor="#6A6680" value={paysNaissance} onChangeText={setPaysNaissance} />

                <Text style={styles.sectionLabel}>Véhicule</Text>
                <View style={styles.toggleContainer}>
                    <TouchableOpacity 
                        style={[styles.toggleButton, vehiculeType === 'berline' && styles.toggleButtonSelected]}
                        onPress={() => setVehiculeType('berline')}
                    >
                        <Text style={[styles.toggleButtonText, vehiculeType === 'berline' && styles.toggleButtonTextSelected]}>Berline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={[styles.toggleButton, vehiculeType === 'van' && styles.toggleButtonSelected]}
                        onPress={() => setVehiculeType('van')}
                    >
                        <Text style={[styles.toggleButtonText, vehiculeType === 'van' && styles.toggleButtonTextSelected]}>Van</Text>
                    </TouchableOpacity>
                </View>
                <TextInput style={styles.input} placeholder="Marque" placeholderTextColor="#6A6680" value={vehiculeMarque} onChangeText={setVehiculeMarque} />
                <TextInput style={styles.input} placeholder="Modèle" placeholderTextColor="#6A6680" value={vehiculeModele} onChangeText={setVehiculeModele} />
                <TextInput style={styles.input} placeholder="Couleur" placeholderTextColor="#6A6680" value={vehiculeCouleur} onChangeText={setVehiculeCouleur} />
                <TextInput style={styles.input} placeholder="Immatriculation (ex: AB-123-CD)" placeholderTextColor="#6A6680" value={vehiculeImmat} onChangeText={setVehiculeImmat} />

                <Text style={styles.sectionLabel}>Facturation</Text>
                <TextInput style={styles.input} placeholder="SIRET" placeholderTextColor="#6A6680" value={siret} onChangeText={setSiret} />
                <TextInput style={styles.input} placeholder="IBAN" placeholderTextColor="#6A6680" value={iban} onChangeText={setIban} />

                {error && <Text style={styles.errorText}>{error}</Text>}

                <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
                    {loading ? <ActivityIndicator color="#101018" /> : <Text style={styles.buttonText}>S'inscrire</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.backButton} onPress={() => setStep(1)}>
                    <Text style={styles.backButtonText}>Retour</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                <Text style={styles.headerTitle}>SÉSAME</Text>
                {step === 1 ? renderStep1() : (role === 'ambassadeur' ? renderStep2Ambassador() : renderStep2Driver())}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#101018',
    },
    container: {
        flex: 1,
        padding: 24,
    },
    headerTitle: {
        fontSize: 24,
        color: '#C9A84C',
        fontWeight: '900',
        letterSpacing: 2,
        textAlign: 'center',
        marginBottom: 32,
    },
    stepContainer: {
        flex: 1,
    },
    stepTitle: {
        fontSize: 22,
        color: '#FFFFFF',
        fontWeight: '700',
        marginBottom: 8,
    },
    stepSubtitle: {
        color: '#6A6680',
        fontSize: 14,
        marginBottom: 32,
    },
    roleCard: {
        flexDirection: 'row',
        backgroundColor: '#161624',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    roleCardSelected: {
        borderColor: '#C9A84C',
        backgroundColor: '#1A1A2A',
    },
    roleIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: '#C9A84C20',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    roleIcon: {
        fontSize: 24,
        color: '#C9A84C',
    },
    roleTextContainer: {
        flex: 1,
    },
    roleLabel: {
        fontSize: 18,
        color: '#FFFFFF',
        fontWeight: '700',
        marginBottom: 4,
    },
    roleLabelSelected: {
        color: '#C9A84C',
    },
    roleDescription: {
        fontSize: 12,
        color: '#6A6680',
        lineHeight: 18,
    },
    toggleContainer: {
        flexDirection: 'row',
        backgroundColor: '#161624',
        borderRadius: 12,
        padding: 4,
        marginBottom: 20,
    },
    toggleButton: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 8,
    },
    toggleButtonSelected: {
        backgroundColor: '#C9A84C',
    },
    toggleButtonText: {
        color: '#6A6680',
        fontWeight: '700',
    },
    toggleButtonTextSelected: {
        color: '#101018',
    },
    sectionLabel: {
        color: '#C9A84C',
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginTop: 20,
        marginBottom: 12,
    },
    input: {
        backgroundColor: '#161624',
        color: '#FFFFFF',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 15,
        marginBottom: 12,
    },
    button: {
        backgroundColor: '#C9A84C',
        paddingVertical: 16,
        borderRadius: 14,
        alignItems: 'center',
        marginTop: 20,
    },
    buttonText: {
        color: '#101018',
        fontWeight: '800',
        fontSize: 16,
    },
    backButton: {
        paddingVertical: 16,
        alignItems: 'center',
    },
    backButtonText: {
        color: '#6A6680',
        fontSize: 14,
    },
    errorText: {
        color: '#FF6B6B',
        textAlign: 'center',
        fontSize: 14,
        marginTop: 10,
    },
});
