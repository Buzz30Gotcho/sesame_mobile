import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    ScrollView, ActivityIndicator, Platform, FlatList,
    KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { createCourse, estimerCourse, getAdminParameters, getAmbassadorProfile } from '../services/api';
import { Colors, Typography } from '../theme';
import type { RootStackParamList } from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type Coords = { lat: number; lon: number };
type Suggestion = { label: string; lat: number; lon: number };

const FRANCE_BBOX = '-5.142,41.333,9.561,51.089';

async function searchAddress(query: string, bias?: Coords): Promise<Suggestion[]> {
    if (query.length < 3) return [];
    const biasLat = bias?.lat ?? 43.6119;
    const biasLon = bias?.lon ?? 3.8772;

    const [govResults, photonResults] = await Promise.allSettled([
        fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5&lat=${biasLat}&lon=${biasLon}`)
            .then(r => r.json())
            .then(data => (data.features || []).map((f: any) => ({
                label: f.properties.label,
                lat: f.geometry.coordinates[1],
                lon: f.geometry.coordinates[0],
            } as Suggestion))),
        fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=fr&lat=${biasLat}&lon=${biasLon}&bbox=${FRANCE_BBOX}`, { headers: { 'User-Agent': 'SesameApp/1.0' } })
            .then(r => r.json())
            .then(data => (data.features || []).map((f: any) => {
                const p = f.properties;
                const name = p.name || '';
                const street = [p.housenumber, p.street].filter(Boolean).join(' ');
                const postcode = Array.isArray(p.postcode) ? null : p.postcode;
                const city = [postcode, p.city].filter(Boolean).join(' ');
                const label = [name || street, city].filter(Boolean).join(', ');
                return { label, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] } as Suggestion;
            }).filter((s: Suggestion) => s.label.length > 0)),
    ]);

    const gov: Suggestion[] = govResults.status === 'fulfilled' ? govResults.value : [];
    const photon: Suggestion[] = photonResults.status === 'fulfilled' ? photonResults.value : [];

    // Fusion avec déduplication (rayon ~200m)
    const merged: Suggestion[] = [];
    for (const s of [...photon, ...gov]) {
        const isDup = merged.some(m => Math.abs(m.lat - s.lat) < 0.002 && Math.abs(m.lon - s.lon) < 0.002);
        if (!isDup) merged.push(s);
    }
    return merged.slice(0, 5);
}

async function geocodeAddress(address: string): Promise<Coords | null> {
    try {
        const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data.features?.length) return null;
        const [lon, lat] = data.features[0].geometry.coordinates;
        return { lat, lon };
    } catch {
        return null;
    }
}

function parseDateFR(date: string, time: string): string | undefined {
    if (!date || !time) return undefined;
    const dateParts = date.split('/');
    if (dateParts.length !== 3) return undefined;
    const [day, month, year] = dateParts;
    const [hh, mm] = time.split(':');
    const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hh.padStart(2, '0')}:${(mm || '00').padStart(2, '0')}:00`;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return undefined;
    return d.toISOString();
}

function formatDateFR(d: Date): { date: string; time: string } {
    const dd = d.getDate().toString().padStart(2, '0');
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    return { date: `${dd}/${mm}/${yyyy}`, time: `${hh}:${min}` };
}

export default function AmbassadorCommanderScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AmbassadorCommander'>>();
    const route = useRoute();
    const defaultType = ((route.params as any)?.defaultType as 'immediate' | 'reservation') || 'immediate';
    const { ambassadorId } = useAuth();

    const [adresseDepart, setAdresseDepart] = useState('');
    // Adresse de l'établissement (pré-remplie) — sert à distinguer « Par défaut » vs « Modifié » (specs §3.2).
    const [etablissementDefault, setEtablissementDefault] = useState('');
    const [adresseDestination, setAdresseDestination] = useState('');
    const [departCoords, setDepartCoords] = useState<Coords | null>(null);
    const [destCoords, setDestCoords] = useState<Coords | null>(null);
    const [departSuggestions, setDepartSuggestions] = useState<Suggestion[]>([]);
    const [destSuggestions, setDestSuggestions] = useState<Suggestion[]>([]);
    const [departSearching, setDepartSearching] = useState(false);
    const [destSearching, setDestSearching] = useState(false);

    const [vehiculeType, setVehiculeType] = useState<'berline' | 'van'>('berline');
    const [kilometrage, setKilometrage] = useState('12');
    const [type, setType] = useState<'immediate' | 'reservation'>(defaultType);
    const [dateReservation, setDateReservation] = useState('');
    const [timeReservation, setTimeReservation] = useState('');
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);

    const [params, setParams] = useState<any>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [distanceLoading, setDistanceLoading] = useState(false);
    const [distanceError, setDistanceError] = useState<string | null>(null);
    // Prix calculés par le backend (un seul point de calcul, source de confiance)
    const [prixBerline, setPrixBerline] = useState<string | null>(null);
    const [prixVan, setPrixVan] = useState<string | null>(null);
    // Vrai indicateur « distance calculée » — évite de détourner la valeur '12' comme sentinelle.
    const [distanceCalculee, setDistanceCalculee] = useState(false);
    const [isImmediateEnabled, setIsImmediateEnabled] = useState(true);
    const [minDelayHours, setMinDelayHours] = useState(1);
    const [dateError, setDateError] = useState<string | null>(null);
    const [minDateStr, setMinDateStr] = useState('');

    // Autocomplétion départ — biais sur destCoords si dispo, sinon pas de biais
    useEffect(() => {
        if (departCoords || adresseDepart.length < 3) {
            setDepartSuggestions([]);
            return;
        }
        setDepartSearching(true);
        const timer = setTimeout(async () => {
            const results = await searchAddress(adresseDepart, destCoords ?? undefined);
            setDepartSuggestions(results);
            setDepartSearching(false);
        }, 300);
        return () => { clearTimeout(timer); setDepartSearching(false); };
    }, [adresseDepart, departCoords, destCoords]);

    // Autocomplétion destination — biais sur departCoords pour rester dans la même zone
    useEffect(() => {
        if (destCoords || adresseDestination.length < 3) {
            setDestSuggestions([]);
            return;
        }
        setDestSearching(true);
        const timer = setTimeout(async () => {
            const results = await searchAddress(adresseDestination, departCoords ?? undefined);
            setDestSuggestions(results);
            setDestSearching(false);
        }, 300);
        return () => { clearTimeout(timer); setDestSearching(false); };
    }, [adresseDestination, destCoords, departCoords]);

    // Distance + prix calculés par le BACKEND dès que les deux adresses sont définies.
    // L'app n'appelle plus OSRM ni ne décide du kilométrage / du prix.
    useEffect(() => {
        if (!adresseDepart || !adresseDestination) return;
        const timer = setTimeout(async () => {
            setDistanceLoading(true);
            setDistanceError(null);
            try {
                const { kilometrage: km, prix_berline, prix_van } = await estimerCourse(adresseDepart, adresseDestination);
                setKilometrage(String(km));
                setPrixBerline(Number(prix_berline).toFixed(2));
                setPrixVan(Number(prix_van).toFixed(2));
                setDistanceCalculee(true);
            } catch (err: any) {
                setPrixBerline(null);
                setPrixVan(null);
                setDistanceCalculee(false);
                setDistanceError(err.response?.data?.error || 'Erreur lors du calcul de distance');
            } finally {
                setDistanceLoading(false);
            }
        }, 800);
        return () => clearTimeout(timer);
    }, [adresseDepart, adresseDestination]);

    const onPickerDateChange = (_: any, selected?: Date) => {
        setShowDatePicker(false);
        if (!selected) return;
        const { date, time } = formatDateFR(selected);
        setDateReservation(date);
        if (!timeReservation) setTimeReservation(time);
    };

    const onPickerTimeChange = (_: any, selected?: Date) => {
        setShowTimePicker(false);
        if (!selected) return;
        const hh = selected.getHours().toString().padStart(2, '0');
        const mm = selected.getMinutes().toString().padStart(2, '0');
        setTimeReservation(`${hh}:${mm}`);
    };

    useEffect(() => {
        async function loadParams() {
            try {
                const [paramsRes, profileRes] = await Promise.all([
                    getAdminParameters(),
                    ambassadorId ? getAmbassadorProfile(ambassadorId) : Promise.resolve(null),
                ]);
                const p: any = {};
                Object.entries(paramsRes.data as Record<string, string>).forEach(([cle, valeur]) => { p[cle] = valeur; });
                setParams(p);
                setIsImmediateEnabled(p.mode_course_immediate === 'true');
                const delai = Number(p.delai_minimum_reservation_heures || 1);
                setMinDelayHours(delai);
                const minDate = new Date(Date.now() + delai * 60 * 60 * 1000);
                const { date: md, time: mt } = formatDateFR(minDate);
                setMinDateStr(`${md} a ${mt}`);
                if (p.mode_course_immediate !== 'true') setType('reservation');
                if (profileRes && profileRes.data.etablissement) {
                    const etab = profileRes.data.etablissement;
                    setAdresseDepart(etab);
                    setEtablissementDefault(etab);
                    geocodeAddress(etab).then(coords => {
                        if (coords) setDepartCoords(coords);
                    }).catch(() => {});
                }
            } catch {}
        }
        loadParams();
    }, [ambassadorId]);

    useEffect(() => {
        if (type !== 'reservation' || !dateReservation || !timeReservation) {
            setDateError(null);
            return;
        }
        const iso = parseDateFR(dateReservation, timeReservation);
        if (!iso) { setDateError('Format invalide. Utilisez JJ/MM/YYYY et HH:MM'); return; }
        const minDate = new Date(Date.now() + minDelayHours * 60 * 60 * 1000);
        if (new Date(iso) < minDate) {
            setDateError(`Doit etre apres le ${minDateStr}`);
        } else {
            setDateError(null);
        }
    }, [dateReservation, timeReservation, type, minDelayHours, minDateStr]);

    const handleSelectDepart = (s: Suggestion) => {
        setAdresseDepart(s.label);
        setDepartCoords({ lat: s.lat, lon: s.lon });
        setDepartSuggestions([]);
        setDistanceError(null);
    };

    const handleSelectDest = (s: Suggestion) => {
        setAdresseDestination(s.label);
        setDestCoords({ lat: s.lat, lon: s.lon });
        setDestSuggestions([]);
        setDistanceError(null);
    };

    const handleSubmit = async () => {
        if (!ambassadorId) return;
        if (!adresseDepart || !adresseDestination || !kilometrage) {
            setError('Veuillez remplir les adresses et le kilométrage.');
            return;
        }
        if (distanceLoading) {
            setError('Calcul de distance en cours, veuillez patienter...');
            return;
        }
        if (distanceError) {
            setError('Veuillez corriger les adresses avant de continuer.');
            return;
        }
        if (type === 'reservation') {
            if (!dateReservation || !timeReservation) {
                setError("Veuillez saisir la date et l'heure de réservation.");
                return;
            }
            if (dateError) { setError(dateError); return; }
        }

        const km = Number(kilometrage);
        const isoDate = type === 'reservation' ? parseDateFR(dateReservation, timeReservation) : undefined;
        setLoading(true);
        setError(null);
        try {
            await createCourse({
                ambassadeur_id: ambassadorId,
                adresse_depart: adresseDepart,
                adresse_destination: adresseDestination,
                vehicule_type: vehiculeType,
                kilometrage: km,
                type_course: type,
                date_reservation: isoDate,
            });
            navigation.navigate('AmbassadorAccueil');
        } catch (err: any) {
            const backendError = err.response?.data?.error;
            if (backendError === 'LIMIT_5_COURSES') {
                setError('Vous avez atteint la limite de 5 courses simultanées. Attendez qu\'une course se termine avant d\'en créer une nouvelle.');
            } else {
                setError(backendError || "Impossible d'enregistrer la commande.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            >
            <ScrollView
                contentContainerStyle={styles.container}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Text style={styles.backText}>←</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>Commander</Text>
                    <View style={{ width: 40 }} />
                </View>

                {!isImmediateEnabled && (
                    <View style={styles.modeAlert}>
                        <Text style={styles.modeAlertText}>Reservation uniquement. Delai min: {minDelayHours}h</Text>
                    </View>
                )}

                <View style={styles.card}>
                    {/* Départ */}
                    <Text style={styles.label}>DÉPART</Text>
                    <View style={styles.inputContainer}>
                        <TextInput
                            style={styles.input}
                            value={adresseDepart}
                            onChangeText={(v) => {
                                setAdresseDepart(v);
                                setDepartCoords(null);
                                setDistanceError(null);
                                setDistanceCalculee(false);
                            }}
                            placeholder="Point de départ"
                            placeholderTextColor="#6A6680"
                        />
                        <View style={styles.inputRight}>
                            {departSearching && <ActivityIndicator size="small" color={Colors.brand.gold} />}
                            {departCoords && !departSearching && (
                                <Text style={styles.validIcon}>✓</Text>
                            )}
                            {/* Étiquette Par défaut (établissement) / Modifié (adresse changée) — specs §3.2 */}
                            {etablissementDefault.length > 0 && adresseDepart.length > 0 && (
                                adresseDepart.trim() === etablissementDefault.trim() ? (
                                    <View style={styles.badgeDefault}>
                                        <Text style={styles.badgeDefaultText}>Par défaut</Text>
                                    </View>
                                ) : (
                                    <View style={styles.badgeModified}>
                                        <Text style={styles.badgeModifiedText}>Modifié</Text>
                                    </View>
                                )
                            )}
                        </View>
                    </View>
                    {departSuggestions.length > 0 && (
                        <View style={styles.suggestionList}>
                            {departSuggestions.map((s, i) => (
                                <TouchableOpacity
                                    key={i}
                                    style={[styles.suggestionItem, i < departSuggestions.length - 1 && styles.suggestionBorder]}
                                    onPress={() => handleSelectDepart(s)}
                                >
                                    <Text style={styles.suggestionIcon}>📍</Text>
                                    <Text style={styles.suggestionText} numberOfLines={2}>{s.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {/* Destination */}
                    <Text style={[styles.label, { marginTop: 16 }]}>DESTINATION</Text>
                    <View style={styles.inputContainer}>
                        <TextInput
                            style={styles.input}
                            value={adresseDestination}
                            onChangeText={(v) => {
                                setAdresseDestination(v);
                                setDestCoords(null);
                                setDistanceError(null);
                                setDistanceCalculee(false);
                            }}
                            placeholder="Où allez-vous ?"
                            placeholderTextColor="#6A6680"
                        />
                        <View style={styles.inputRight}>
                            {destSearching && <ActivityIndicator size="small" color={Colors.brand.gold} />}
                            {destCoords && !destSearching && (
                                <Text style={styles.validIcon}>✓</Text>
                            )}
                        </View>
                    </View>
                    {destSuggestions.length > 0 && (
                        <View style={styles.suggestionList}>
                            {destSuggestions.map((s, i) => (
                                <TouchableOpacity
                                    key={i}
                                    style={[styles.suggestionItem, i < destSuggestions.length - 1 && styles.suggestionBorder]}
                                    onPress={() => handleSelectDest(s)}
                                >
                                    <Text style={styles.suggestionIcon}>📍</Text>
                                    <Text style={styles.suggestionText} numberOfLines={2}>{s.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {/* Distance */}
                    <Text style={[styles.label, { marginTop: 16 }]}>DISTANCE (KM)</Text>
                    <View style={styles.distanceRow}>
                        <View style={[styles.input, { flex: 1, justifyContent: 'center' }]}>
                            {distanceLoading
                                ? <ActivityIndicator size="small" color={Colors.brand.gold} />
                                : <Text style={{ color: distanceCalculee ? '#E0DBD2' : '#6A6680' }}>
                                    {distanceCalculee ? `${kilometrage} km` : '—'}
                                  </Text>
                            }
                        </View>
                    </View>
                    {distanceError && <Text style={styles.distanceErrorText}>{distanceError}</Text>}
                    {!distanceError && !distanceLoading && departCoords && destCoords && (
                        <Text style={styles.distanceOkText}>✓ Distance calculée : {kilometrage} km</Text>
                    )}
                </View>

                {/* Véhicule */}
                <View style={styles.vehicleRow}>
                    <TouchableOpacity
                        style={[styles.vehicleCard, vehiculeType === 'berline' && styles.vehicleCardSelected]}
                        onPress={() => setVehiculeType('berline')}
                    >
                        <Text style={styles.vehicleEmoji}>🚗</Text>
                        <Text style={[styles.vehicleLabel, vehiculeType === 'berline' && styles.vehicleLabelSelected]}>Berline</Text>
                        <Text style={styles.vehiclePrice}>{prixBerline ? `${prixBerline} €` : '—'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.vehicleCard, vehiculeType === 'van' && styles.vehicleCardSelected]}
                        onPress={() => setVehiculeType('van')}
                    >
                        <Text style={styles.vehicleEmoji}>🚐</Text>
                        <Text style={[styles.vehicleLabel, vehiculeType === 'van' && styles.vehicleLabelSelected]}>Van</Text>
                        <Text style={styles.vehiclePrice}>{prixVan ? `${prixVan} €` : '—'}</Text>
                    </TouchableOpacity>
                </View>

                {/* Mode */}
                {isImmediateEnabled && (
                    <View style={styles.modeToggle}>
                        <TouchableOpacity
                            style={[styles.modeButton, type === 'immediate' && styles.modeButtonSelected]}
                            onPress={() => setType('immediate')}
                        >
                            <Text style={[styles.modeButtonText, type === 'immediate' && styles.modeButtonTextSelected]}>Immediat</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.modeButton, type === 'reservation' && styles.modeButtonSelected]}
                            onPress={() => setType('reservation')}
                        >
                            <Text style={[styles.modeButtonText, type === 'reservation' && styles.modeButtonTextSelected]}>Reservation</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Réservation */}
                {type === 'reservation' && (
                    <View style={styles.card}>
                        <Text style={styles.label}>DATE ET HEURE</Text>
                        <Text style={styles.minDateInfo}>Date minimum : {minDateStr}</Text>
                        <View style={styles.dateTimeRow}>
                            <View style={styles.dateInputWrapper}>
                                <TextInput
                                    style={[styles.input, { flex: 1 }]}
                                    placeholder="JJ/MM/AAAA"
                                    value={dateReservation}
                                    onChangeText={setDateReservation}
                                    placeholderTextColor="#6A6680"
                                    keyboardType="numbers-and-punctuation"
                                />
                                <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.pickerIcon}>
                                    <Text style={styles.pickerIconText}>📅</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.dateInputWrapper}>
                                <TextInput
                                    style={[styles.input, { flex: 1 }]}
                                    placeholder="HH:MM"
                                    value={timeReservation}
                                    onChangeText={setTimeReservation}
                                    placeholderTextColor="#6A6680"
                                    keyboardType="numbers-and-punctuation"
                                />
                                <TouchableOpacity onPress={() => setShowTimePicker(true)} style={styles.pickerIcon}>
                                    <Text style={styles.pickerIconText}>🕐</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                        {showDatePicker && (
                            <DateTimePicker
                                value={parseDateFR(dateReservation, timeReservation) ? new Date(parseDateFR(dateReservation, timeReservation)!) : new Date()}
                                mode="date"
                                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                                onChange={onPickerDateChange}
                                minimumDate={new Date(Date.now() + minDelayHours * 60 * 60 * 1000)}
                            />
                        )}
                        {showTimePicker && (
                            <DateTimePicker
                                value={parseDateFR(dateReservation, timeReservation) ? new Date(parseDateFR(dateReservation, timeReservation)!) : new Date()}
                                mode="time"
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                onChange={onPickerTimeChange}
                                is24Hour
                            />
                        )}
                        {dateError ? (
                            <Text style={styles.dateErrorText}>{dateError}</Text>
                        ) : (
                            dateReservation && timeReservation && (
                                <Text style={styles.infoText}>✓ Date valide</Text>
                            )
                        )}
                    </View>
                )}

                {error && <Text style={styles.errorText}>{error}</Text>}

                <TouchableOpacity
                    style={styles.submitButton}
                    onPress={handleSubmit}
                    disabled={loading}
                >
                    {loading
                        ? <ActivityIndicator color="#09090F" />
                        : <Text style={styles.submitText}>
                            {type === 'immediate' ? 'Rechercher un chauffeur' : 'Confirmer la reservation'}
                          </Text>
                    }
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.cancelText}>Annuler</Text>
                </TouchableOpacity>
            </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#101018' },
    container: { padding: 20 },
    header: {
        flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 20,
    },
    backButton: { width: 40, height: 40, justifyContent: 'center' },
    backText: { color: Colors.brand.gold, fontSize: 24 },
    title: { color: Colors.brand.gold, fontSize: Typography.sizes.title, fontWeight: Typography.weights.black as any },
    modeAlert: {
        backgroundColor: 'rgba(74, 158, 255, 0.1)',
        borderWidth: 1, borderColor: 'rgba(74, 158, 255, 0.3)',
        padding: 12, borderRadius: 12, marginBottom: 20,
    },
    modeAlertText: { color: Colors.brand.info, fontSize: 12, textAlign: 'center', fontWeight: '600' },
    card: { backgroundColor: '#161624', borderRadius: 18, padding: 16, marginBottom: 16 },
    label: { color: '#6A6680', fontSize: 10, fontWeight: '700', marginBottom: 8 },
    inputContainer: {
        flexDirection: 'row', alignItems: 'center',
        borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
        paddingBottom: 4, marginBottom: 4,
    },
    input: { color: '#FFFFFF', fontSize: 14, paddingVertical: 10, flex: 1 },
    inputRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    validIcon: { color: Colors.brand.success, fontSize: 16, fontWeight: '700' },
    badgeDefault: {
        backgroundColor: 'rgba(76, 175, 130, 0.15)',
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
    },
    badgeDefaultText: { color: Colors.brand.success, fontSize: 9, fontWeight: '700' },
    badgeModified: {
        backgroundColor: 'rgba(255, 154, 60, 0.15)',
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
    },
    badgeModifiedText: { color: Colors.brand.warning, fontSize: 9, fontWeight: '700' },
    suggestionList: {
        backgroundColor: '#1E1E30',
        borderRadius: 12,
        marginTop: 4,
        marginBottom: 8,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    suggestionItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 12,
        gap: 8,
    },
    suggestionBorder: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    suggestionIcon: { fontSize: 14, marginTop: 1 },
    suggestionText: { flex: 1, color: '#E0DBD2', fontSize: Typography.sizes.sub, lineHeight: 20 },
    distanceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    distanceErrorText: { color: Colors.brand.error, fontSize: 11, marginTop: 6, fontWeight: '600' },
    distanceOkText: { color: Colors.brand.success, fontSize: 11, marginTop: 6, fontWeight: '600' },
    vehicleRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
    vehicleCard: {
        flex: 1, backgroundColor: '#161624', borderRadius: 18,
        padding: 16, alignItems: 'center', marginHorizontal: 4,
        borderWidth: 2, borderColor: 'transparent',
    },
    vehicleCardSelected: {
        borderColor: 'rgba(201, 168, 76, 0.3)',
        backgroundColor: 'rgba(201, 168, 76, 0.05)',
    },
    vehicleEmoji: { fontSize: 32, marginBottom: 8 },
    vehicleLabel: { color: '#6A6680', fontSize: 12, fontWeight: '700', marginBottom: 4 },
    vehicleLabelSelected: { color: Colors.brand.gold },
    vehiclePrice: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
    modeToggle: {
        flexDirection: 'row', backgroundColor: '#161624',
        borderRadius: 14, padding: 4, marginBottom: 20,
    },
    modeButton: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 12 },
    modeButtonSelected: { backgroundColor: Colors.brand.gold },
    modeButtonText: { color: '#6A6680', fontWeight: '700', fontSize: 13 },
    modeButtonTextSelected: { color: '#09090F' },
    minDateInfo: { color: Colors.brand.info, fontSize: 11, marginBottom: 10, fontWeight: '600' },
    dateTimeRow: { flexDirection: 'row', marginBottom: 8, gap: 8 },
    dateInputWrapper: {
        flex: 1, flexDirection: 'row', alignItems: 'center',
        borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    pickerIcon: { paddingHorizontal: 6, paddingVertical: 8 },
    pickerIconText: { fontSize: 18 },
    infoText: { color: Colors.brand.success, fontSize: 10 },
    dateErrorText: { color: Colors.brand.error, fontSize: 11, fontWeight: '600' },
    submitButton: {
        backgroundColor: Colors.brand.gold, borderRadius: 16,
        paddingVertical: 18, alignItems: 'center', marginBottom: 12,
    },
    submitText: { color: '#09090F', fontSize: 16, fontWeight: '900' },
    cancelButton: { paddingVertical: 12, alignItems: 'center' },
    cancelText: { color: '#6A6680', fontSize: 14 },
    errorText: { color: Colors.brand.error, fontSize: 12, textAlign: 'center', marginBottom: 16 },
});
