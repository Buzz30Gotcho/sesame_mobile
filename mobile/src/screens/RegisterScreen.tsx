import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { register, setAuthToken, uploadChauffeurDocument } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList, UserRole } from '../types';

type Step = 1 | 2 | 3 | 4;
type AmbassadeurType = 'physique' | 'moral' | null;

const DOCS_REQUIS = [
    { type: 'carte_identite',     label: "Carte d'identité",                                  hasVerso: true  },
    { type: 'carte_vtc',          label: 'Carte VTC Professionnelle',                          hasVerso: true  },
    { type: 'revtc',              label: 'REVTC (Registre des VTC)',                            hasVerso: false },
    { type: 'kbis',               label: 'Kbis — moins de 6 mois',                             hasVerso: false },
    { type: 'permis',             label: 'Permis de conduire',                                  hasVerso: true  },
    { type: 'rir',                label: 'RIR (Relevé d\'Information Routier)',                 hasVerso: false },
    { type: 'rc_pro',             label: 'RC Pro (Responsabilité Civile Professionnelle)',      hasVerso: false },
    { type: 'rc_circulation',     label: 'RC Circulation (assurance du véhicule)',              hasVerso: false },
    { type: 'carte_grise',        label: 'Carte grise du véhicule',                            hasVerso: true  },
    { type: 'certificat_medical', label: 'Certificat médical d\'aptitude',                     hasVerso: false },
    { type: 'photo_profil',       label: 'Photo de profil (format identité)',                  hasVerso: false },
];

function luhnCheck(num: string): boolean {
    let sum = 0;
    for (let i = 0; i < num.length; i++) {
        let d = parseInt(num[num.length - 1 - i]);
        if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
        sum += d;
    }
    return sum % 10 === 0;
}

export default function RegisterScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Register'>) {
    const { setAuth } = useAuth();
    const initialRole = route.params?.initialRole ?? null;
    const [step, setStep] = useState<Step>(initialRole ? 2 : 1);

    // Step 1: Role Selection
    const [role, setRole] = useState<UserRole | null>(initialRole);
    
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
    const [ambassadeurType, setAmbassadeurType] = useState<AmbassadeurType>(null);
    const [etablissement, setEtablissement] = useState('');
    const [metier, setMetier] = useState('');
    const [cp, setCp] = useState('');
    const [codeParrainSaisi, setCodeParrainSaisi] = useState('');
    const [raisonSociale, setRaisonSociale] = useState('');

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

    // Étape 3 — upload documents
    const [registeredChauffeurId, setRegisteredChauffeurId] = useState<string | null>(null);
    const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
    const [uploadedDocs, setUploadedDocs] = useState<Record<string, boolean>>({});

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
        if (password.length < 8) {
            setError('Mot de passe trop court (8 caractères minimum).');
            return;
        }

        if (role === 'ambassadeur' && ambassadeurType === 'moral') {
            if (!raisonSociale.trim()) {
                setError('La raison sociale est obligatoire.');
                return;
            }
            const siretClean = siret.replace(/\s/g, '');
            if (!siretClean || !/^\d{14}$/.test(siretClean) || !luhnCheck(siretClean)) {
                setError('SIRET obligatoire et invalide (14 chiffres).');
                return;
            }
            const ibanClean = iban.replace(/\s/g, '').toUpperCase();
            if (!ibanClean || !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(ibanClean)) {
                setError('IBAN obligatoire et invalide (ex: FR76 3000 6000 0112 3456 7890 189).');
                return;
            }
        }

        if (role === 'chauffeur') {
            const siretClean = siret.replace(/\s/g, '');
            if (siretClean && (!/^\d{14}$/.test(siretClean) || !luhnCheck(siretClean))) {
                setError('SIRET invalide (14 chiffres).');
                return;
            }
            const ibanClean = iban.replace(/\s/g, '').toUpperCase();
            if (!ibanClean) {
                setError('IBAN obligatoire pour recevoir vos revenus.');
                return;
            }
            if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(ibanClean)) {
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
            if (!mandatSepa) {
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
                payload.ambassador_type = ambassadeurType;
                if (ambassadeurType === 'moral') {
                    payload.etablissement = raisonSociale;
                } else {
                    payload.etablissement = etablissement;
                    payload.metier = metier;
                    payload.cp = cp;
                    if (codeParrainSaisi.trim()) {
                        payload.code_parrainage_parrain = codeParrainSaisi.trim().toUpperCase();
                    }
                }
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
            setAuth({ token, userId, email, role: userRole, ambassadorId: ambassadeur_id || null, chauffeurId: chauffeur_id || null, typeAmbassadeur: ambassadeurType, isSousCompte: false });

            if (userRole === 'chauffeur' && chauffeur_id) {
                setRegisteredChauffeurId(chauffeur_id);
                setStep(3);
            } else if (userRole === 'ambassadeur' && ambassadeurType === 'moral') {
                // Compte moral suspendu jusqu'à validation admin — pas d'accès dashboard
                setStep(4 as any);
            } else if (userRole === 'ambassadeur') {
                navigation.replace('Onboarding');
            } else {
                navigation.replace('Login');
            }
        } catch (err: any) {
            const msg = err.response?.data?.error
                || (err.message === 'Network Error' ? `Impossible de joindre le serveur (${err.config?.baseURL ?? 'URL inconnue'})` : err.message)
                || "Une erreur est survenue lors de l'inscription.";
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleUploadDoc = async (docType: string, label: string, side: 'recto' | 'verso') => {
        if (!registeredChauffeurId) return;
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            Alert.alert('Permission requise', 'Veuillez autoriser l\'accès à vos photos.');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true });
        if (result.canceled || !result.assets[0]) return;

        setUploadingDoc(`${docType}_${side}`);
        try {
            await uploadChauffeurDocument(registeredChauffeurId, docType, side, result.assets[0].uri);
            setUploadedDocs(prev => ({ ...prev, [`${docType}_${side}`]: true }));
            Alert.alert('Document envoyé ✓', `${label} bien reçu. L'équipe SÉSAME va le vérifier prochainement.`);
        } catch {
            Alert.alert('Erreur', 'Impossible d\'envoyer le document. Vous pourrez le faire depuis votre profil.');
        } finally {
            setUploadingDoc(null);
        }
    };

    const handleTerminer = () => {
        const nbUploaded = Object.values(uploadedDocs).filter(Boolean).length;
        if (nbUploaded > 0) {
            Alert.alert(
                'Dossier soumis',
                'Vos documents ont bien été transmis à l\'équipe SÉSAME. Vous recevrez une notification dès que votre dossier sera validé.',
                [{ text: 'OK', onPress: () => navigation.replace('ChauffeurHome') }]
            );
        } else {
            Alert.alert(
                'Aucun document envoyé',
                'Pensez à uploader vos documents depuis votre profil. Vous ne pourrez pas recevoir de courses tant que votre dossier n\'est pas validé.',
                [{ text: 'OK', onPress: () => navigation.replace('ChauffeurHome') }]
            );
        }
    };

    const renderStepMoralPending = () => (
        <View style={[styles.stepContainer, { justifyContent: 'center', alignItems: 'center', paddingTop: 40 }]}>
            <Text style={{ fontSize: 64, marginBottom: 24 }}>⏳</Text>
            <Text style={[styles.stepTitle, { textAlign: 'center' }]}>Compte en attente</Text>
            <Text style={[styles.stepSubtitle, { textAlign: 'center', marginBottom: 32 }]}>
                Votre dossier entreprise a bien été enregistré.{'\n\n'}
                L'équipe SÉSAME va examiner votre demande et vous enverra une notification dès que votre compte sera validé.{'\n\n'}
                Vous recevrez un email à <Text style={{ color: '#C9A84C' }}>{email}</Text>
            </Text>
            <View style={{ backgroundColor: '#161624', borderRadius: 16, padding: 16, width: '100%', marginBottom: 32 }}>
                <Text style={{ color: '#6A6680', fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>CONTACT SÉSAME</Text>
                <Text style={{ color: '#E0DBD2', fontSize: 14 }}>support@sesame-pro.com</Text>
            </View>
            <TouchableOpacity style={styles.button} onPress={() => navigation.replace('Login')}>
                <Text style={styles.buttonText}>Retour à la connexion</Text>
            </TouchableOpacity>
        </View>
    );

    const renderStep3Driver = () => (
        <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Étape 3 : Vos 11 documents</Text>
            <Text style={styles.stepSubtitle}>
                0 document manquant = 0 course. Vous pouvez aussi les envoyer plus tard depuis votre profil.
            </Text>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                {DOCS_REQUIS.map(({ type, label, hasVerso }) => (
                    <View key={type} style={styles.docCard}>
                        <Text style={styles.docCardLabel}>{label}</Text>
                        <View style={styles.docCardButtons}>
                            <TouchableOpacity
                                style={[styles.docUploadBtn, uploadedDocs[`${type}_recto`] && styles.docUploadBtnDone]}
                                onPress={() => handleUploadDoc(type, label, 'recto')}
                                disabled={!!uploadingDoc}
                            >
                                {uploadingDoc === `${type}_recto`
                                    ? <ActivityIndicator size="small" color="#FFFFFF" />
                                    : <Text style={styles.docUploadBtnText}>
                                        {uploadedDocs[`${type}_recto`] ? '✓ Recto' : hasVerso ? 'Recto' : 'Envoyer'}
                                      </Text>
                                }
                            </TouchableOpacity>
                            {hasVerso && (
                                <TouchableOpacity
                                    style={[styles.docUploadBtn, uploadedDocs[`${type}_verso`] && styles.docUploadBtnDone]}
                                    onPress={() => handleUploadDoc(type, label, 'verso')}
                                    disabled={!!uploadingDoc}
                                >
                                    {uploadingDoc === `${type}_verso`
                                        ? <ActivityIndicator size="small" color="#FFFFFF" />
                                        : <Text style={styles.docUploadBtnText}>
                                            {uploadedDocs[`${type}_verso`] ? '✓ Verso' : 'Verso'}
                                          </Text>
                                    }
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                ))}

                <TouchableOpacity style={styles.button} onPress={handleTerminer}>
                    <Text style={styles.buttonText}>Terminer</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.backButton} onPress={handleTerminer}>
                    <Text style={styles.backButtonText}>Passer — je le ferai plus tard</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );

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

    const renderStep2Ambassador = () => {
        if (!ambassadeurType) {
            return (
                <View style={styles.stepContainer}>
                    <Text style={styles.stepTitle}>Étape 2 : Quel type ?</Text>
                    <Text style={styles.stepSubtitle}>Choisissez votre situation pour que SÉSAME adapte votre rémunération.</Text>

                    <TouchableOpacity style={styles.roleCard} onPress={() => setAmbassadeurType('physique')}>
                        <View style={styles.roleIconContainer}>
                            <Text style={styles.roleIcon}>👤</Text>
                        </View>
                        <View style={styles.roleTextContainer}>
                            <Text style={styles.roleLabel}>Particulier</Text>
                            <Text style={styles.roleDescription}>Réceptionniste, barman, concierge… Gagnez des points SESAME échangeables en boutique.</Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.roleCard} onPress={() => setAmbassadeurType('moral')}>
                        <View style={styles.roleIconContainer}>
                            <Text style={styles.roleIcon}>🏢</Text>
                        </View>
                        <View style={styles.roleTextContainer}>
                            <Text style={styles.roleLabel}>Entreprise</Text>
                            <Text style={styles.roleDescription}>Hôtel, restaurant, agence… Touchez 10% de commission sur chaque course, versés chaque mois.</Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.backButton} onPress={() => initialRole ? navigation.goBack() : setStep(1)}>
                        <Text style={styles.backButtonText}>Retour</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        if (ambassadeurType === 'physique') {
            return (
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

                        <Text style={styles.sectionLabel}>Parrainage (optionnel)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Code de parrainage (ex: AB3XY2)"
                            placeholderTextColor="#6A6680"
                            autoCapitalize="characters"
                            value={codeParrainSaisi}
                            onChangeText={setCodeParrainSaisi}
                        />

                        {error && <Text style={styles.errorText}>{error}</Text>}
                        <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
                            {loading ? <ActivityIndicator color="#101018" /> : <Text style={styles.buttonText}>S'inscrire</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.backButton} onPress={() => setAmbassadeurType(null)}>
                            <Text style={styles.backButtonText}>Retour</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            );
        }

        return (
            <View style={styles.stepContainer}>
                <Text style={styles.stepTitle}>Étape 2 : Compte Entreprise</Text>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                    <Text style={styles.sectionLabel}>Société</Text>
                    <Text style={styles.fieldLabel}>Raison sociale *</Text>
                    <TextInput style={styles.input} placeholder="Ex : Hôtel Bellevue SAS" placeholderTextColor="#6A6680" value={raisonSociale} onChangeText={setRaisonSociale} />
                    <Text style={styles.fieldLabel}>SIRET *</Text>
                    <TextInput style={styles.input} placeholder="14 chiffres" placeholderTextColor="#6A6680" keyboardType="numeric" value={siret} onChangeText={setSiret} />
                    <Text style={styles.fieldLabel}>IBAN *</Text>
                    <TextInput style={styles.input} placeholder="FR76 3000 6000 0112 3456 7890 189" placeholderTextColor="#6A6680" autoCapitalize="characters" value={iban} onChangeText={setIban} />

                    <Text style={styles.sectionLabel}>Votre compte (gérant / directeur)</Text>
                    <Text style={styles.fieldLabel}>Prénom *</Text>
                    <TextInput style={styles.input} placeholder="Prénom du responsable" placeholderTextColor="#6A6680" value={prenom} onChangeText={setPrenom} />
                    <Text style={styles.fieldLabel}>Nom *</Text>
                    <TextInput style={styles.input} placeholder="Nom du responsable" placeholderTextColor="#6A6680" value={nom} onChangeText={setNom} />
                    <Text style={styles.fieldLabel}>Email *</Text>
                    <TextInput style={styles.input} placeholder="email@societe.fr" placeholderTextColor="#6A6680" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
                    <Text style={styles.fieldLabel}>Téléphone *</Text>
                    <TextInput style={styles.input} placeholder="0612345678" placeholderTextColor="#6A6680" keyboardType="phone-pad" value={telephone} onChangeText={setTelephone} />
                    <Text style={styles.fieldLabel}>Mot de passe *</Text>
                    <TextInput style={styles.input} placeholder="8 caractères minimum" placeholderTextColor="#6A6680" secureTextEntry value={password} onChangeText={setPassword} />

                    <View style={styles.moralInfoBox}>
                        <Text style={styles.moralInfoText}>
                            Vous percevrez 10% de commission sur chaque course prescrite, versés le 1er de chaque mois par virement SEPA sur votre IBAN.
                        </Text>
                    </View>

                    {error && <Text style={styles.errorText}>{error}</Text>}
                    <TouchableOpacity style={[styles.button, { backgroundColor: '#4A9EFF' }]} onPress={handleRegister} disabled={loading}>
                        {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>Créer le compte entreprise</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.backButton} onPress={() => setAmbassadeurType(null)}>
                        <Text style={styles.backButtonText}>Retour</Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>
        );
    };

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
                <TextInput style={styles.input} placeholder="SIRET (optionnel)" placeholderTextColor="#6A6680" value={siret} onChangeText={setSiret} />
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
                <TouchableOpacity style={styles.backButton} onPress={() => initialRole ? navigation.goBack() : setStep(1)}>
                    <Text style={styles.backButtonText}>Retour</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                <Text style={styles.headerTitle}>SÉSAME</Text>
                {step === 1 ? renderStep1() : step === 4 ? renderStepMoralPending() : step === 3 ? renderStep3Driver() : (role === 'ambassadeur' ? renderStep2Ambassador() : renderStep2Driver())}
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
    docCard: {
        backgroundColor: '#161624',
        borderRadius: 14,
        padding: 16,
        marginBottom: 12,
    },
    docCardLabel: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 12,
    },
    docCardButtons: {
        flexDirection: 'row',
        gap: 10,
    },
    docUploadBtn: {
        flex: 1,
        backgroundColor: '#2A2A40',
        borderRadius: 10,
        paddingVertical: 10,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    docUploadBtnDone: {
        backgroundColor: 'rgba(76, 175, 130, 0.2)',
        borderColor: '#4CAF82',
    },
    docUploadBtnText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '600',
    },
    fieldLabel: {
        color: '#E0DBD2',
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 4,
        marginTop: 2,
    },
    moralInfoBox: {
        backgroundColor: 'rgba(74, 158, 255, 0.1)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(74, 158, 255, 0.3)',
        padding: 14,
        marginTop: 8,
        marginBottom: 4,
    },
    moralInfoText: {
        color: '#4A9EFF',
        fontSize: 13,
        lineHeight: 19,
    },
});
