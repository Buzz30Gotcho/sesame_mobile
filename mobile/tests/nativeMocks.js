/* Mocks globaux des modules natifs Expo / navigation, appliqués à tous les tests.
   Évite de répéter ces jest.mock dans chaque fichier de test d'écran. Un test peut
   toujours surcharger localement (jest.mock dans le fichier a priorité). */
/* eslint-disable @typescript-eslint/no-var-requires */

jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('react-native-safe-area-context', () => {
    const React = require('react');
    const pass = ({ children }) => React.createElement(React.Fragment, null, children);
    return { SafeAreaView: pass, SafeAreaProvider: pass, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

jest.mock('@react-navigation/native', () => ({
    useNavigation: () => ({ navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), addListener: jest.fn(() => jest.fn()), setOptions: jest.fn() }),
    useRoute: () => ({ params: {} }),
    useIsFocused: () => true,
    useFocusEffect: (cb) => {
        const React = require('react');
        React.useEffect(() => { const r = cb(); return typeof r === 'function' ? r : undefined; }, []);
    },
}));

jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));

jest.mock('expo-location', () => ({
    Accuracy: { High: 4 },
    requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
    requestBackgroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'denied' })),
    getForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
    hasStartedLocationUpdatesAsync: jest.fn(() => Promise.resolve(false)),
    startLocationUpdatesAsync: jest.fn(() => Promise.resolve()),
    stopLocationUpdatesAsync: jest.fn(() => Promise.resolve()),
    getCurrentPositionAsync: jest.fn(() => Promise.resolve({ coords: { latitude: 48.85, longitude: 2.35 } })),
}));

jest.mock('expo-image-picker', () => ({
    launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true })),
    launchCameraAsync: jest.fn(() => Promise.resolve({ canceled: true })),
    requestCameraPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
    requestMediaLibraryPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
    MediaTypeOptions: { Images: 'Images' },
}));

jest.mock('expo-notifications', () => ({
    setNotificationHandler: jest.fn(),
    getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
    requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
    getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ data: 'ExpoTok' })),
    addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
    addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

// Modules potentiellement non installés selon les écrans → mocks virtuels (sans résolution réelle).
jest.mock('expo-camera', () => ({
    CameraView: 'CameraView',
    useCameraPermissions: () => [{ granted: true }, jest.fn(() => Promise.resolve({ granted: true }))],
}), { virtual: true });

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve()) }), { virtual: true });

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker', { virtual: true });
jest.mock('react-native-qrcode-svg', () => 'QRCode', { virtual: true });
