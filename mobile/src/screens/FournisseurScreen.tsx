import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator } from 'react-native';
import { api } from '../services/api';

type State = 'saisie' | 'erreur' | 'bloque' | 'valide' | 'utilise' | 'expire' | 'loading';

export default function FournisseurScreen() {
    const [tokenQr, setTokenQr] = useState('');
    const [code, setCode] = useState('');
    const [state, setState] = useState<State>('saisie');
    const [tentatives, setTentatives] = useState(3);
    const [validationData, setValidationData] = useState<any>(null);

    const handleValidate = async () => {
        if (!tokenQr || !code) return;
        setState('loading');
        try {
            const response = await api.post('/api/fournisseurs/valider-bon', { token_qr: tokenQr, code_secret: code });
            setValidationData(response.data);
            setState('valide');
        } catch (err: any) {
            const error = err.response?.data?.error || '';
            if (error.includes('Code secret incorrect')) {
                setTentatives(t => t - 1);
                if (tentatives - 1 <= 0) {
                    setState('bloque');
                } else {
                    setState('erreur');
                }
            } else if (error.includes('déjà utilisé')) {
                setState('utilise');
            } else if (error.includes('expiré')) {
                setState('expire');
            } else {
                setState('erreur');
            }
        }
    };

    const renderContent = () => {
        switch (state) {
            case 'loading':
                return <ActivityIndicator size="large" color="#C9A84C" />;

            case 'saisie':
            case 'erreur':
                return (
                    <View style={styles.card}>
                        {state === 'erreur' && (
                            <View style={styles.errorBanner}>
                                <Text style={styles.errorText}>⚠️ Code incorrect</Text>
                            </View>
                        )}
                        <View style={styles.offerBox}>
                            <Text style={styles.offerTitle}>🏎️ Karting Aventure</Text>
                            <View style={styles.row}>
                                <Text style={styles.label}>Client</Text>
                                <Text style={styles.value}>Jean Dupont</Text>
                            </View>
                            <View style={styles.row}>
                                <Text style={styles.label}>Référence</Text>
                                <Text style={styles.valueBlue}>BON-KRT-X7K2</Text>
                            </View>
                        </View>

                        <Text style={styles.inputLabel}>Code à 4 chiffres</Text>
                        <TextInput 
                            style={styles.codeInput}
                            value={code}
                            onChangeText={setCode}
                            keyboardType="numeric"
                            maxLength={4}
                            secureTextEntry
                            placeholder="_ _ _ _"
                            placeholderTextColor="#6A6680"
                        />
                        
                        <View style={styles.attemptsRow}>
                            <View style={[styles.dot, tentatives < 3 && styles.dotActive]} />
                            <View style={[styles.dot, tentatives < 2 && styles.dotActive]} />
                            <View style={[styles.dot, tentatives < 1 && styles.dotActive]} />
                            <Text style={styles.attemptsText}>{tentatives} tentatives</Text>
                        </View>

                        <TouchableOpacity style={styles.validateBtn} onPress={handleValidate}>
                            <Text style={styles.validateBtnText}>{state === 'erreur' ? 'Réessayer' : 'Valider'}</Text>
                        </TouchableOpacity>
                        
                        {/* Hidden input for Token QR in this simulation */}
                        <TextInput 
                            style={{ height: 0, opacity: 0 }}
                            value={tokenQr}
                            onChangeText={setTokenQr}
                            placeholder="QR Token"
                        />
                    </View>
                );

            case 'valide':
                return (
                    <View style={[styles.card, styles.cardSuccess]}>
                        <Text style={styles.bigEmoji}>✅</Text>
                        <Text style={styles.successTitle}>Bon validé !</Text>
                        <Text style={styles.successSub}>Jean Dupont peut bénéficier de sa prestation. Bon désormais inutilisable.</Text>
                        
                        <View style={styles.detailsBox}>
                            <View style={styles.row}>
                                <Text style={styles.label}>Prestation</Text>
                                <Text style={styles.value}>🏎️ Karting</Text>
                            </View>
                            <View style={styles.row}>
                                <Text style={styles.label}>Validé le</Text>
                                <Text style={styles.value}>11/05/2026 14:35</Text>
                            </View>
                            <View style={styles.row}>
                                <Text style={styles.label}>Référence</Text>
                                <Text style={styles.valueBlue}>{validationData?.reference}</Text>
                            </View>
                        </View>
                    </View>
                );

            case 'utilise':
                return (
                    <View style={[styles.card, styles.cardError]}>
                        <Text style={styles.bigEmoji}>❌</Text>
                        <Text style={styles.errorTitle}>Bon invalide</Text>
                        <Text style={styles.errorSub}>Ce bon a déjà été utilisé et ne peut pas être accepté une seconde fois.</Text>
                        <Text style={styles.supportText}>Contactez SÉSAME : support@sesame-pro.com</Text>
                    </View>
                );

            case 'expire':
                return (
                    <View style={[styles.card, styles.cardError]}>
                        <Text style={styles.bigEmoji}>⌛</Text>
                        <Text style={styles.errorTitle}>Bon expiré</Text>
                        <Text style={styles.errorSub}>Ce bon a dépassé sa date de validité.</Text>
                        <View style={styles.detailsBox}>
                            <View style={styles.row}>
                                <Text style={styles.label}>Expiré le</Text>
                                <Text style={styles.valueRed}>10/04/2026 · 09h22</Text>
                            </View>
                        </View>
                        <Text style={styles.supportText}>Vous n'avez aucune obligation d'accepter ce bon.</Text>
                    </View>
                );

            case 'bloque':
                return (
                    <View style={[styles.card, styles.cardBlocked]}>
                        <Text style={styles.bigEmoji}>🔒</Text>
                        <Text style={styles.blockedTitle}>Validation bloquée</Text>
                        <Text style={styles.blockedSub}>3 tentatives incorrectes</Text>
                        <View style={styles.detailsBox}>
                            <Text style={styles.label}>Contactez SÉSAME</Text>
                            <View style={styles.contactItem}><Text style={styles.contactText}>✉️ support@sesame-pro.com</Text></View>
                            <TouchableOpacity style={styles.callBtn}>
                                <Text style={styles.callBtnText}>📞 07 45 20 70 06</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                );
        }
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
                <Text style={styles.logo}>SÉSAME 🗝</Text>
                <Text style={styles.headerSub}>Validation bon cadeau</Text>
            </View>
            <ScrollView contentContainerStyle={styles.container}>
                {renderContent()}
                
                {/* Reset button for demo */}
                <TouchableOpacity onPress={() => setState('saisie')} style={{ marginTop: 40 }}>
                    <Text style={{ color: '#6A6680', fontSize: 10 }}>Réinitialiser (démo)</Text>
                </TouchableOpacity>
            </ScrollView>
            
            <View style={styles.footer}>
                <Text style={styles.footerText}>SÉSAME 🗝</Text>
                <Text style={styles.footerSubText}>Fondateur & Concepteur : NAJAH Abdallah</Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#F2F2F7',
    },
    header: {
        backgroundColor: '#FFFFFF',
        padding: 16,
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.05)',
    },
    logo: {
        color: '#C9A84C',
        fontSize: 20,
        fontWeight: '900',
    },
    headerSub: {
        color: '#8A8AA0',
        fontSize: 10,
        marginTop: 4,
    },
    container: {
        padding: 24,
        alignItems: 'center',
    },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 16,
        width: '100%',
        maxWidth: 320,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
    },
    errorBanner: {
        backgroundColor: '#FFF0F0',
        borderWidth: 1,
        borderColor: 'rgba(204, 34, 34, 0.2)',
        borderRadius: 8,
        padding: 8,
        marginBottom: 12,
        alignItems: 'center',
    },
    errorText: {
        color: '#CC2222',
        fontSize: 12,
        fontWeight: '700',
    },
    offerBox: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
        borderRadius: 8,
        padding: 12,
        marginBottom: 20,
    },
    offerTitle: {
        fontSize: 14,
        fontWeight: '800',
        color: '#1C1C2E',
        marginBottom: 8,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    label: {
        fontSize: 10,
        color: '#8A8AA0',
    },
    value: {
        fontSize: 10,
        fontWeight: '600',
        color: '#1C1C2E',
    },
    valueBlue: {
        fontSize: 10,
        fontWeight: '700',
        color: '#2A6ECC',
        fontFamily: 'monospace',
    },
    inputLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: '#1C1C2E',
        textAlign: 'center',
        marginBottom: 10,
    },
    codeInput: {
        fontSize: 24,
        fontWeight: '900',
        color: '#1C1C2E',
        textAlign: 'center',
        letterSpacing: 10,
        backgroundColor: '#F2F2F7',
        borderRadius: 8,
        paddingVertical: 12,
        marginBottom: 12,
    },
    attemptsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
        marginBottom: 20,
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: 'rgba(0,0,0,0.1)',
    },
    dotActive: {
        backgroundColor: '#CC2222',
    },
    attemptsText: {
        fontSize: 10,
        color: '#8A8AA0',
        marginLeft: 4,
    },
    validateBtn: {
        backgroundColor: '#C9A84C',
        borderRadius: 8,
        paddingVertical: 14,
        alignItems: 'center',
    },
    validateBtnText: {
        color: '#09090F',
        fontWeight: '900',
        fontSize: 13,
    },
    cardSuccess: {
        borderWidth: 2,
        borderColor: 'rgba(46, 138, 90, 0.2)',
        backgroundColor: '#EEF9F4',
    },
    bigEmoji: {
        fontSize: 48,
        textAlign: 'center',
        marginBottom: 16,
    },
    successTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#2E8A5A',
        textAlign: 'center',
        marginBottom: 8,
    },
    successSub: {
        fontSize: 11,
        color: '#4A7A5A',
        textAlign: 'center',
        lineHeight: 16,
        marginBottom: 20,
    },
    detailsBox: {
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        padding: 12,
        width: '100%',
    },
    cardError: {
        borderWidth: 2,
        borderColor: 'rgba(204, 34, 34, 0.2)',
        backgroundColor: '#FFF0F0',
    },
    errorTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#CC2222',
        textAlign: 'center',
        marginBottom: 8,
    },
    errorSub: {
        fontSize: 11,
        color: '#993333',
        textAlign: 'center',
        lineHeight: 16,
        marginBottom: 20,
    },
    supportText: {
        fontSize: 10,
        color: '#8A8AA0',
        textAlign: 'center',
        marginTop: 16,
    },
    valueRed: {
        fontSize: 10,
        fontWeight: '700',
        color: '#CC2222',
    },
    cardBlocked: {
        backgroundColor: '#FFF5EC',
        borderWidth: 2,
        borderColor: 'rgba(204, 102, 0, 0.2)',
    },
    blockedTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#CC6600',
        textAlign: 'center',
        marginBottom: 8,
    },
    blockedSub: {
        fontSize: 12,
        color: '#8A6030',
        textAlign: 'center',
        marginBottom: 20,
    },
    contactItem: {
        backgroundColor: '#F2F2F7',
        padding: 8,
        borderRadius: 6,
        marginBottom: 8,
        alignItems: 'center',
    },
    contactText: {
        fontSize: 10,
        color: '#1C1C2E',
    },
    callBtn: {
        backgroundColor: '#CC2222',
        padding: 10,
        borderRadius: 6,
        alignItems: 'center',
    },
    callBtnText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '800',
    },
    footer: {
        padding: 24,
        alignItems: 'center',
        borderTopWidth: 2,
        borderTopColor: '#C9A84C',
    },
    footerText: {
        color: '#C9A84C',
        fontSize: 16,
        fontWeight: '900',
    },
    footerSubText: {
        color: '#8A8AA0',
        fontSize: 9,
        marginTop: 4,
    },
});
