import React, { useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    SafeAreaView, ActivityIndicator, StatusBar, Modal, Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Colors, Typography } from '../theme';
import { validateFournisseurBon } from '../services/api';

type State = 'saisie' | 'erreur' | 'bloque' | 'valide' | 'loading';
type Mode = 'qr' | 'manuel';

export default function FournisseurScreen() {
    const [mode, setMode] = useState<Mode>('qr');
    const [scannerVisible, setScannerVisible] = useState(false);
    const [scannedToken, setScannedToken] = useState<string | null>(null);
    const [codeDigits, setCodeDigits] = useState(['', '', '', '']);
    const [state, setState] = useState<State>('saisie');
    const [tentatives, setTentatives] = useState(3);
    const [bonInfo, setBonInfo] = useState<{ reference: string } | null>(null);
    const [permission, requestPermission] = useCameraPermissions();

    const handleOpenScanner = async () => {
        if (!permission?.granted) {
            const result = await requestPermission();
            if (!result.granted) {
                Alert.alert('Permission caméra requise', 'Veuillez autoriser l\'accès à la caméra pour scanner les QR codes.');
                return;
            }
        }
        setScannerVisible(true);
    };

    const handleBarcodeScanned = ({ data }: { data: string }) => {
        setScannerVisible(false);
        setScannedToken(data);
        setMode('manuel');
        setState('saisie');
        setCodeDigits(['', '', '', '']);
    };

    const handleDigitPress = (digit: string) => {
        const nextEmptyIndex = codeDigits.findIndex(d => d === '');
        if (nextEmptyIndex !== -1) {
            const newDigits = [...codeDigits];
            newDigits[nextEmptyIndex] = digit;
            setCodeDigits(newDigits);
        }
    };

    const handleDelete = () => {
        const lastFilledIndex = codeDigits.findLastIndex(d => d !== '');
        if (lastFilledIndex !== -1) {
            const newDigits = [...codeDigits];
            newDigits[lastFilledIndex] = '';
            setCodeDigits(newDigits);
        }
    };

    const handleValidate = async () => {
        const code_secret = codeDigits.join('');
        if (code_secret.length < 4) return;
        if (!scannedToken) {
            Alert.alert('QR non scanné', 'Veuillez scanner le QR code du client avant de valider.');
            return;
        }

        setState('loading');
        try {
            const res = await validateFournisseurBon({ token_qr: scannedToken, code_secret });
            setBonInfo({ reference: res.data.reference || '' });
            setState('valide');
        } catch (err: any) {
            const nextTentatives = tentatives - 1;
            setTentatives(nextTentatives);
            setCodeDigits(['', '', '', '']);
            if (nextTentatives <= 0) {
                setState('bloque');
            } else {
                setState('erreur');
            }
        }
    };

    const handleReset = () => {
        setState('saisie');
        setCodeDigits(['', '', '', '']);
        setScannedToken(null);
        setTentatives(3);
        setBonInfo(null);
        setMode('qr');
    };

    const renderContent = () => {
        if (state === 'loading') {
            return (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={Colors.brand.gold} />
                    <Text style={styles.loadingText}>Vérification en cours...</Text>
                </View>
            );
        }

        if (state === 'valide') {
            return (
                <View style={[styles.card, styles.cardSuccess]}>
                    <Text style={styles.bigEmoji}>✅</Text>
                    <Text style={styles.successTitle}>BON VALIDÉ !</Text>
                    <Text style={styles.successSub}>Le client peut bénéficier de sa prestation. Ce bon est désormais inutilisable.</Text>
                    {bonInfo?.reference ? (
                        <View style={styles.recapDetails}>
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>RÉFÉRENCE</Text>
                                <Text style={styles.infoValueBlue}>{bonInfo.reference}</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>VALIDÉ LE</Text>
                                <Text style={styles.infoValue}>{new Date().toLocaleDateString('fr-FR')} à {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</Text>
                            </View>
                        </View>
                    ) : null}
                    <TouchableOpacity style={styles.finishBtn} onPress={handleReset}>
                        <Text style={styles.finishBtnText}>NOUVEAU BON</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        if (state === 'bloque') {
            return (
                <View style={[styles.card, styles.cardBlocked]}>
                    <Text style={styles.bigEmoji}>🔒</Text>
                    <Text style={styles.blockedTitle}>VALIDATION BLOQUÉE</Text>
                    <Text style={styles.blockedSub}>3 TENTATIVES INCORRECTES</Text>
                    <View style={styles.supportBox}>
                        <Text style={styles.supportLabel}>CONTACTEZ L'ÉQUIPE SÉSAME</Text>
                        <Text style={styles.supportEmail}>support@sesame-pro.com</Text>
                        <TouchableOpacity style={styles.callBtn}>
                            <Text style={styles.callBtnText}>📞 07 45 20 70 06</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            );
        }

        return (
            <View style={styles.card}>
                {/* Étape 1 : QR scan */}
                <View style={styles.stepBlock}>
                    <View style={styles.stepHeader}>
                        <View style={[styles.stepBadge, scannedToken && styles.stepBadgeDone]}>
                            <Text style={styles.stepBadgeText}>{scannedToken ? '✓' : '1'}</Text>
                        </View>
                        <Text style={styles.stepTitle}>Scanner le QR code client</Text>
                    </View>

                    {scannedToken ? (
                        <View style={styles.scannedBadge}>
                            <Text style={styles.scannedText}>QR scanné avec succès</Text>
                            <TouchableOpacity onPress={() => setScannedToken(null)}>
                                <Text style={styles.rescanText}>Rescanner</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity style={styles.scanBtn} onPress={handleOpenScanner}>
                            <Text style={styles.scanBtnText}>📷 SCANNER LE QR CODE</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Étape 2 : Code secret fournisseur */}
                <View style={[styles.stepBlock, !scannedToken && styles.stepBlockDisabled]}>
                    <View style={styles.stepHeader}>
                        <View style={[styles.stepBadge, !scannedToken && styles.stepBadgeInactive]}>
                            <Text style={styles.stepBadgeText}>2</Text>
                        </View>
                        <Text style={[styles.stepTitle, !scannedToken && styles.stepTitleInactive]}>
                            Saisir votre code secret
                        </Text>
                    </View>

                    {state === 'erreur' && (
                        <View style={styles.errorBanner}>
                            <Text style={styles.errorTextBanner}>CODE INCORRECT — {tentatives} tentative{tentatives > 1 ? 's' : ''} restante{tentatives > 1 ? 's' : ''}</Text>
                        </View>
                    )}

                    <View style={styles.codeRow}>
                        {codeDigits.map((d, i) => (
                            <View key={i} style={[
                                styles.codeBox,
                                state === 'erreur' && styles.codeBoxError,
                                !scannedToken && styles.codeBoxDisabled,
                            ]}>
                                <Text style={styles.codeDigit}>{d ? '●' : ''}</Text>
                            </View>
                        ))}
                    </View>

                    <View style={[styles.numpad, !scannedToken && styles.numpadDisabled]}>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                            <TouchableOpacity
                                key={n}
                                style={styles.numKey}
                                onPress={() => scannedToken && handleDigitPress(n.toString())}
                                disabled={!scannedToken}
                            >
                                <Text style={styles.numText}>{n}</Text>
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity style={styles.numKey} onPress={handleDelete} disabled={!scannedToken}>
                            <Text style={styles.numText}>⌫</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.numKey} onPress={() => scannedToken && handleDigitPress('0')} disabled={!scannedToken}>
                            <Text style={styles.numText}>0</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.numKey, styles.okKey, (!scannedToken || codeDigits.join('').length < 4) && styles.okKeyDisabled]}
                            onPress={handleValidate}
                            disabled={!scannedToken || codeDigits.join('').length < 4}
                        >
                            <Text style={styles.okText}>OK</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.header}>
                <Text style={styles.logo}>SÉSAME 🗝</Text>
                <Text style={styles.headerSub}>ESPACE VALIDATION PARTENAIRE</Text>
            </View>

            <ScrollView contentContainerStyle={styles.container}>
                {renderContent()}
            </ScrollView>

            <View style={styles.footer}>
                <Text style={styles.footerText}>SÉSAME - OUVRE-TOI AU MONDE</Text>
                <Text style={styles.footerSub}>SÉCURITÉ & TRANSPARENCE • 2026</Text>
            </View>

            {/* Modal caméra QR */}
            <Modal visible={scannerVisible} animationType="slide" onRequestClose={() => setScannerVisible(false)}>
                <View style={styles.scannerContainer}>
                    <CameraView
                        style={styles.camera}
                        facing="back"
                        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                        onBarcodeScanned={handleBarcodeScanned}
                    />
                    <View style={styles.scannerOverlay}>
                        <View style={styles.scannerFrame} />
                        <Text style={styles.scannerHint}>Pointez la caméra vers le QR code du client</Text>
                        <TouchableOpacity style={styles.cancelScanBtn} onPress={() => setScannerVisible(false)}>
                            <Text style={styles.cancelScanText}>ANNULER</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: Colors.clair.background },
    header: {
        backgroundColor: '#FFFFFF',
        paddingVertical: 20,
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.05)',
    },
    logo: {
        fontSize: 22,
        fontWeight: Typography.weights.black as any,
        color: Colors.brand.gold,
        letterSpacing: 2,
    },
    headerSub: {
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.bold as any,
        color: Colors.clair.textSecondary,
        marginTop: 4,
        letterSpacing: 1,
    },
    container: {
        padding: 20,
        alignItems: 'center',
        paddingTop: 32,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 60,
    },
    loadingText: {
        marginTop: 16,
        color: Colors.clair.textSecondary,
        fontWeight: Typography.weights.semiBold as any,
    },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 24,
        width: '100%',
        maxWidth: 400,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 10,
    },
    stepBlock: {
        marginBottom: 24,
    },
    stepBlockDisabled: { opacity: 0.5 },
    stepHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 12,
    },
    stepBadge: {
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: Colors.brand.gold,
        justifyContent: 'center', alignItems: 'center',
    },
    stepBadgeDone: { backgroundColor: Colors.brand.success },
    stepBadgeInactive: { backgroundColor: 'rgba(0,0,0,0.1)' },
    stepBadgeText: { color: '#FFFFFF', fontWeight: Typography.weights.black as any, fontSize: 12 },
    stepTitle: {
        color: Colors.clair.textPrimary,
        fontSize: Typography.sizes.sub,
        fontWeight: Typography.weights.bold as any,
    },
    stepTitleInactive: { color: Colors.clair.textSecondary },
    scanBtn: {
        backgroundColor: Colors.brand.gold,
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: 'center',
    },
    scanBtnText: {
        color: '#FFFFFF',
        fontWeight: Typography.weights.black as any,
        fontSize: Typography.sizes.sub,
        letterSpacing: 1,
    },
    scannedBadge: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'rgba(76, 175, 130, 0.1)',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: 'rgba(76, 175, 130, 0.3)',
    },
    scannedText: {
        color: Colors.brand.success,
        fontWeight: Typography.weights.bold as any,
        fontSize: Typography.sizes.sub,
    },
    rescanText: {
        color: Colors.brand.info,
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.bold as any,
    },
    errorBanner: {
        backgroundColor: 'rgba(255, 100, 100, 0.1)',
        borderRadius: 10,
        padding: 10,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 100, 100, 0.2)',
    },
    errorTextBanner: {
        color: Colors.brand.error,
        fontWeight: Typography.weights.bold as any,
        fontSize: Typography.sizes.tiny,
        textAlign: 'center',
    },
    codeRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 12,
        marginBottom: 20,
    },
    codeBox: {
        width: 50, height: 65,
        backgroundColor: Colors.clair.background,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: 'rgba(0,0,0,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    codeBoxError: { borderColor: Colors.brand.error },
    codeBoxDisabled: { backgroundColor: 'rgba(0,0,0,0.03)' },
    codeDigit: {
        fontSize: 20,
        fontWeight: Typography.weights.black as any,
        color: Colors.clair.textPrimary,
    },
    numpad: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 10,
    },
    numpadDisabled: { opacity: 0.4 },
    numKey: {
        width: '30%', height: 52,
        backgroundColor: Colors.clair.background,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    numText: {
        fontSize: Typography.sizes.header,
        fontWeight: Typography.weights.bold as any,
        color: Colors.clair.textPrimary,
    },
    okKey: { backgroundColor: Colors.brand.gold },
    okKeyDisabled: { opacity: 0.4 },
    okText: { color: '#FFFFFF', fontWeight: Typography.weights.black as any, fontSize: Typography.sizes.sub },
    cardSuccess: {
        backgroundColor: '#F0FFF4',
        borderWidth: 1,
        borderColor: 'rgba(76, 175, 130, 0.2)',
    },
    bigEmoji: { fontSize: 64, textAlign: 'center', marginBottom: 16 },
    successTitle: {
        fontSize: Typography.sizes.header,
        fontWeight: Typography.weights.black as any,
        color: Colors.brand.success,
        textAlign: 'center',
        marginBottom: 12,
    },
    successSub: {
        fontSize: Typography.sizes.tiny,
        color: Colors.clair.textSecondary,
        textAlign: 'center',
        lineHeight: 18,
        marginBottom: 20,
    },
    recapDetails: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 14,
        marginBottom: 20,
    },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    infoLabel: { fontSize: 10, color: Colors.clair.textSecondary, fontWeight: Typography.weights.bold as any },
    infoValue: { fontSize: 10, color: Colors.clair.textPrimary, fontWeight: Typography.weights.black as any },
    infoValueBlue: { fontSize: 10, color: Colors.brand.info, fontWeight: Typography.weights.black as any },
    finishBtn: {
        backgroundColor: Colors.brand.success,
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    finishBtnText: { color: '#FFFFFF', fontWeight: Typography.weights.black as any },
    cardBlocked: {
        backgroundColor: '#FFF5F5',
        borderWidth: 1,
        borderColor: 'rgba(255, 100, 100, 0.2)',
    },
    blockedTitle: {
        fontSize: Typography.sizes.header,
        fontWeight: Typography.weights.black as any,
        color: Colors.brand.error,
        textAlign: 'center',
        marginBottom: 8,
    },
    blockedSub: {
        fontSize: Typography.sizes.tiny,
        color: Colors.brand.error,
        textAlign: 'center',
        fontWeight: Typography.weights.bold as any,
        marginBottom: 24,
    },
    supportBox: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
    },
    supportLabel: {
        fontSize: 9,
        fontWeight: Typography.weights.black as any,
        color: Colors.clair.textSecondary,
        marginBottom: 8,
    },
    supportEmail: {
        fontSize: Typography.sizes.sub,
        fontWeight: Typography.weights.bold as any,
        color: Colors.clair.textPrimary,
        marginBottom: 12,
    },
    callBtn: {
        backgroundColor: Colors.brand.error,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 10,
    },
    callBtnText: { color: '#FFFFFF', fontWeight: Typography.weights.black as any },
    footer: { padding: 24, alignItems: 'center' },
    footerText: {
        fontSize: Typography.sizes.tiny,
        fontWeight: Typography.weights.black as any,
        color: Colors.brand.gold,
        letterSpacing: 2,
    },
    footerSub: { fontSize: 8, color: Colors.clair.textSecondary, marginTop: 4 },
    // Scanner
    scannerContainer: { flex: 1, backgroundColor: '#000' },
    camera: { flex: 1 },
    scannerOverlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scannerFrame: {
        width: 250, height: 250,
        borderWidth: 3,
        borderColor: Colors.brand.gold,
        borderRadius: 20,
        marginBottom: 30,
    },
    scannerHint: {
        color: '#FFFFFF',
        fontSize: Typography.sizes.sub,
        textAlign: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 10,
        marginBottom: 40,
        marginHorizontal: 40,
    },
    cancelScanBtn: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderWidth: 1,
        borderColor: '#FFFFFF',
        borderRadius: 14,
        paddingHorizontal: 32,
        paddingVertical: 14,
    },
    cancelScanText: {
        color: '#FFFFFF',
        fontWeight: Typography.weights.black as any,
        letterSpacing: 1,
    },
});
