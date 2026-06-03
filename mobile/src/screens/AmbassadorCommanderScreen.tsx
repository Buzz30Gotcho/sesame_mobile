import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { createCourse, getAdminParameters } from '../services/api';
import type { RootStackParamList } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

// Redefining pricing logic here to avoid deep backend import issues in mobile build if necessary
function getPrice(type: 'berline' | 'van', km: number, params: any) {
    const base = type === 'van' ? Number(params.van_forfait || 12) : Number(params.berline_forfait || 12);
    const threshold = type === 'van' ? Number(params.van_seuil_km || 6) : Number(params.berline_seuil_km || 6);
    const rate = type === 'van' ? Number(params.van_prix_km || 3) : Number(params.berline_prix_km || 2);
    
    if (km <= threshold) return base.toFixed(2);
    return (base + (km - threshold) * rate).toFixed(2);
}

export default function AmbassadorCommanderScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AmbassadorCommander'>>();
    const { ambassadorId } = useAuth();
    
    const [adresseDepart, setAdresseDepart] = useState('Hôtel Mercure'); // Default as per spec
    const [adresseDestination, setAdresseDestination] = useState('');
    const [vehiculeType, setVehiculeType] = useState<'berline' | 'van'>('berline');
    const [kilometrage, setKilometrage] = useState('12');
    const [type, setType] = useState<'immediate' | 'reservation'>('immediate');
    const [dateReservation, setDateReservation] = useState('');
    const [timeReservation, setTimeReservation] = useState('');
    
    const [params, setParams] = useState<any>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isImmediateEnabled, setIsImmediateEnabled] = useState(true);

    useEffect(() => {
        async function loadParams() {
            try {
                const response = await getAdminParameters();
                const p: any = {};
                response.data.forEach((item: any) => p[item.cle] = item.valeur);
                setParams(p);
                setIsImmediateEnabled(p.mode_course_immediate === 'true');
                if (p.mode_course_immediate !== 'true') {
                    setType('reservation');
                }
            } catch (err) {
                console.error('Error loading params', err);
            }
        }
        loadParams();
    }, []);

    const handleSubmit = async () => {
        if (!ambassadorId) return;
        if (!adresseDepart || !adresseDestination || !kilometrage) {
            setError('Veuillez remplir les adresses et le kilométrage.');
            return;
        }

        const km = Number(kilometrage);
        const fullDate = type === 'reservation' ? `${dateReservation} ${timeReservation}` : undefined;

        setLoading(true);
        setError(null);

        try {
            await createCourse({
                ambassadeur_id: ambassadorId,
                adresse_depart: adresseDepart,
                adresse_destination: adresseDestination,
                vehicule_type: vehiculeType,
                kilometrage: km,
                type,
                date_reservation: fullDate,
            });
            navigation.navigate('AmbassadorAccueil');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Impossible d’enregistrer la commande.');
        } finally {
            setLoading(false);
        }
    };

    const currentPrice = getPrice(vehiculeType, Number(kilometrage), params);
    const otherPrice = getPrice(vehiculeType === 'berline' ? 'van' : 'berline', Number(kilometrage), params);

    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView contentContainerStyle={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Text style={styles.backText}>←</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>Commander</Text>
                    <View style={{ width: 40 }} />
                </View>

                {/* Status Bar for Mode */}
                {!isImmediateEnabled && (
                    <View style={styles.modeAlert}>
                        <Text style={styles.modeAlertText}>📅 Réservation uniquement. Délai min: 1h</Text>
                    </View>
                )}

                <View style={styles.card}>
                    <Text style={styles.label}>DÉPART</Text>
                    <View style={styles.inputContainer}>
                        <TextInput 
                            style={styles.input} 
                            value={adresseDepart} 
                            onChangeText={setAdresseDepart} 
                            placeholder="Point de départ"
                            placeholderTextColor="#6A6680"
                        />
                        <View style={styles.badgeDefault}><Text style={styles.badgeDefaultText}>Par défaut</Text></View>
                    </View>

                    <Text style={styles.label}>DESTINATION</Text>
                    <TextInput 
                        style={styles.input} 
                        value={adresseDestination} 
                        onChangeText={setAdresseDestination} 
                        placeholder="Où allez-vous ?"
                        placeholderTextColor="#6A6680"
                    />

                    <Text style={styles.label}>DISTANCE ESTIMÉE (KM)</Text>
                    <TextInput 
                        style={styles.input} 
                        value={kilometrage} 
                        onChangeText={setKilometrage} 
                        keyboardType="numeric"
                        placeholder="10"
                        placeholderTextColor="#6A6680"
                    />
                </View>

                {/* Vehicle Selection */}
                <View style={styles.vehicleRow}>
                    <TouchableOpacity 
                        style={[styles.vehicleCard, vehiculeType === 'berline' && styles.vehicleCardSelected]}
                        onPress={() => setVehiculeType('berline')}
                    >
                        <Text style={styles.vehicleEmoji}>🚗</Text>
                        <Text style={[styles.vehicleLabel, vehiculeType === 'berline' && styles.vehicleLabelSelected]}>Berline</Text>
                        <Text style={styles.vehiclePrice}>{vehiculeType === 'berline' ? currentPrice : otherPrice} €</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                        style={[styles.vehicleCard, vehiculeType === 'van' && styles.vehicleCardSelected]}
                        onPress={() => setVehiculeType('van')}
                    >
                        <Text style={styles.vehicleEmoji}>🚐</Text>
                        <Text style={[styles.vehicleLabel, vehiculeType === 'van' && styles.vehicleLabelSelected]}>Van</Text>
                        <Text style={styles.vehiclePrice}>{vehiculeType === 'van' ? currentPrice : otherPrice} €</Text>
                    </TouchableOpacity>
                </View>

                {/* Mode Selection */}
                {isImmediateEnabled && (
                    <View style={styles.modeToggle}>
                        <TouchableOpacity 
                            style={[styles.modeButton, type === 'immediate' && styles.modeButtonSelected]}
                            onPress={() => setType('immediate')}
                        >
                            <Text style={[styles.modeButtonText, type === 'immediate' && styles.modeButtonTextSelected]}>⚡ Immédiat</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={[styles.modeButton, type === 'reservation' && styles.modeButtonSelected]}
                            onPress={() => setType('reservation')}
                        >
                            <Text style={[styles.modeButtonText, type === 'reservation' && styles.modeButtonTextSelected]}>📅 Réservation</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Reservation Details */}
                {type === 'reservation' && (
                    <View style={styles.card}>
                        <Text style={styles.label}>DATE ET HEURE</Text>
                        <View style={styles.dateTimeRow}>
                            <TextInput 
                                style={[styles.input, { flex: 1, marginRight: 8 }]} 
                                placeholder="📅 DD/MM/YYYY" 
                                value={dateReservation}
                                onChangeText={setDateReservation}
                                placeholderTextColor="#6A6680"
                            />
                            <TextInput 
                                style={[styles.input, { flex: 1 }]} 
                                placeholder="🕐 HH:MM" 
                                value={timeReservation}
                                onChangeText={setTimeReservation}
                                placeholderTextColor="#6A6680"
                            />
                        </View>
                        <Text style={styles.infoText}>✓ Délai minimum respecté (simulation)</Text>
                    </View>
                )}

                {error && <Text style={styles.errorText}>{error}</Text>}

                <TouchableOpacity 
                    style={styles.submitButton} 
                    onPress={handleSubmit}
                    disabled={loading}
                >
                    {loading ? <ActivityIndicator color="#09090F" /> : (
                        <Text style={styles.submitText}>
                            {type === 'immediate' ? 'Rechercher un chauffeur' : 'Confirmer la réservation'}
                        </Text>
                    )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.cancelText}>Annuler</Text>
                </TouchableOpacity>

            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#101018',
    },
    container: {
        padding: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
    },
    backText: {
        color: '#C9A84C',
        fontSize: 24,
    },
    title: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '700',
    },
    modeAlert: {
        backgroundColor: 'rgba(74, 158, 255, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(74, 158, 255, 0.3)',
        padding: 12,
        borderRadius: 12,
        marginBottom: 20,
    },
    modeAlertText: {
        color: '#4A9EFF',
        fontSize: 12,
        textAlign: 'center',
        fontWeight: '600',
    },
    card: {
        backgroundColor: '#161624',
        borderRadius: 18,
        padding: 16,
        marginBottom: 16,
    },
    label: {
        color: '#6A6680',
        fontSize: 10,
        fontWeight: '700',
        marginBottom: 8,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
        marginBottom: 16,
    },
    input: {
        color: '#FFFFFF',
        fontSize: 14,
        paddingVertical: 10,
        flex: 1,
    },
    badgeDefault: {
        backgroundColor: 'rgba(76, 175, 130, 0.15)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    badgeDefaultText: {
        color: '#4CAF82',
        fontSize: 9,
        fontWeight: '700',
    },
    vehicleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    vehicleCard: {
        flex: 1,
        backgroundColor: '#161624',
        borderRadius: 18,
        padding: 16,
        alignItems: 'center',
        marginHorizontal: 4,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    vehicleCardSelected: {
        borderColor: 'rgba(201, 168, 76, 0.3)',
        backgroundColor: 'rgba(201, 168, 76, 0.05)',
    },
    vehicleEmoji: {
        fontSize: 32,
        marginBottom: 8,
    },
    vehicleLabel: {
        color: '#6A6680',
        fontSize: 12,
        fontWeight: '700',
        marginBottom: 4,
    },
    vehicleLabelSelected: {
        color: '#C9A84C',
    },
    vehiclePrice: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '800',
    },
    modeToggle: {
        flexDirection: 'row',
        backgroundColor: '#161624',
        borderRadius: 14,
        padding: 4,
        marginBottom: 20,
    },
    modeButton: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderRadius: 12,
    },
    modeButtonSelected: {
        backgroundColor: '#C9A84C',
    },
    modeButtonText: {
        color: '#6A6680',
        fontWeight: '700',
        fontSize: 13,
    },
    modeButtonTextSelected: {
        color: '#09090F',
    },
    dateTimeRow: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    infoText: {
        color: '#4A9EFF',
        fontSize: 10,
    },
    submitButton: {
        backgroundColor: '#C9A84C',
        borderRadius: 16,
        paddingVertical: 18,
        alignItems: 'center',
        marginBottom: 12,
    },
    submitText: {
        color: '#09090F',
        fontSize: 16,
        fontWeight: '900',
    },
    cancelButton: {
        paddingVertical: 12,
        alignItems: 'center',
    },
    cancelText: {
        color: '#6A6680',
        fontSize: 14,
    },
    errorText: {
        color: '#FF6464',
        fontSize: 12,
        textAlign: 'center',
        marginBottom: 16,
    },
});
