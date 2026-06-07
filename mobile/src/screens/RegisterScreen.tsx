import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { register, setAuthToken } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList, UserRole } from '../types';

type Step = 1 | 2;

function luhnCheck(num: string): boolean {
    let sum = 0;
    for (let i = 0; i < num.length; i++) {
        let d = parseInt(num[num.length - 1 - i]);
        if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
        sum += d;
    }
    return sum % 10 === 0;
}

export default function RegisterScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Register'>) {
    const { setAuth } = useAuth();
    const [step, setStep] = useState<Step>(1);
    
    // Step 1: Role Selection
    const [role, setRole] = useState<UserRole | null>(null);
    
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

    // Driver + shared
    const [siret, setSiret] = useState('');
    const [iban, setIban] = useState('');

    // Driver specific
    const [vehiculeType, setVehiculeType] = useState<'berline' | 'van'>('berline');
    const [vehiculeMarque, setVehiculeMarque] = useState('');
    const [vehiculeModele, setVehiculeModele] = useState('');
    const [vehiculeCouleur, setVehiculeCouleur] = useState('');
    const [vehiculeImmat, setVehiculeImmat] = useState('');

    const [mandatSepa, setMandatSepa] = useState(false);
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
        if (!email || !telephone || !password) {
            setError('Les champs Email, Téléphone et Mot de passe sont obligatoires.');
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            setError('Adresse email invalide.');
            return;
        }
        const phoneClean = telephone.replace(/[\s\-\.]/g, '');
        if (!/^(\+?\d{9,15})$/.test(phoneClean)) {
            setError('Numéro de téléphone invalide (ex: 0612345678 ou +33612345678).');
            return;
        }
        if (password.length < 4) {
            setError('Mot de passe trop court (4 caractères minimum).');
            return;
        }

        if (role === 'chauffeur') {
            const siretClean = siret.replace(/\s/g, '');
            if (siretClean && (!/^\d{14}$/.test(siretClean) || !luhnCheck(siretClean))) {
                setError('SIRET invalide (14 chiffres).');
                return;
            }
            const ibanClean = iban.replace(/\s/g, '').toUpperCase();
            if (ibanClean && !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(ibanClean)) {
                setError('IBAN invalide (ex: FR76 3000 6000 0112 3456 7890 189).');
                return;
            }
            if (vehiculeImmat) {
                const immat = vehiculeImmat.replace(/[\s\-]/g, '').toUpperCase();
                if (!/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(immat)) {
                    setError("Immatriculation invalide (format attendu : AB-123-CD).");
                    return;
                }
            }
            if (iban && !mandatSepa) {
                setError("Vous devez accepter le mandat SEPA pour autoriser le prélèvement des frais.");
                return;
            }
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
                payload.ambassador_type = 'physique';
                payload.etablissement = etablissement;
                payload.metier = metier;
                payload.cp = cp;
            } else {
                payload.vehicule_type = vehiculeType;
                payload.vehicule_marque = vehiculeMarque;
                payload.vehicule_modele = vehiculeModele;
                payload.vehicule_couleur = vehiculeCouleur;
                payload.vehicule_immat = vehiculeImmat;
            }

            const response = await register(payload);
            const { token, userId, role: userRole, ambassadeur_id, chauffeur_id } = response.data;

            setAuthToken(token);
            setAuth({ token, userId, email, role: userRole, ambassadorId: ambassadeur_id || null, chauffeurId: chauffeur_id || null, typeAmbassadeur: null, isSousCompte: false });

            Alert.alert(
                "Inscription reussie !",
                prenom ? `Bienvenue sur SESAME, ${prenom} !` : "Bienvenue sur SESAME !",
                [{
                    text: "Continuer",
                    onPress: () => {
                        if (userRole === "ambassadeur") navigation.replace("AmbassadorAccueil");
                        else if (userRole === "chauffeur") navigation.replace("ChauffeurHome");
                        else navigation.replace("Login");
                    }
                }]
            );
        } catch (err: any) {
            setError(err.response?.data?.error || "Une erreur est survenue lors de l'inscription.");
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
                    <Text style={styles.roleDescription}>Prescrivez des courses et gagnez des points échangeables contre des récompenses.</Text>
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
            <Text style={styles.stepTitle}>Étape 2 : Informations Ambassadeur</Text>

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
                <TextInput style={styles.input} placeholder="Établissement" placeholderTextColor="#6A6680" value={etablissement} onChangeText={setEtablissement} />
                <TextInput style={styles.input} placeholder="Métier" placeholderTextColor="#6A6680" value={metier} onChangeText={setMetier} />
                <TextInput style={styles.input} placeholder="Code Postal" placeholderTextColor="#6A6680" value={cp} onChangeText={setCp} />

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

                {iban.length > 0 && (
                    <TouchableOpacity
                        style={styles.mandatRow}
                        onPress={() => setMandatSepa(v => !v)}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.checkbox, mandatSepa && styles.checkboxChecked]}>
                            {mandatSepa && <Text style={styles.checkmark}>✓</Text>}
                        </View>
                        <Text style={styles.mandatText}>
                            J'autorise SÉSAME à prélever les frais de service (20% de mon CA) sur cet IBAN via SEPA Direct Debit.
                        </Text>
                    </TouchableOpacity>
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
    mandatRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        marginTop: 12,
        marginBottom: 4,
        paddingHorizontal: 4,
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#C9A84C',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 1,
        flexShrink: 0,
    },
    checkboxChecked: {
        backgroundColor: '#C9A84C',
    },
    checkmark: {
        color: '#101018',
        fontSize: 13,
        fontWeight: '900',
    },
    mandatText: {
        flex: 1,
        color: '#6A6680',
        fontSize: 12,
        lineHeight: 18,
    },
});
