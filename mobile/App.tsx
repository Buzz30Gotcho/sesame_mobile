import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';

import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';
import { LanguageProvider } from './src/context/LanguageContext';
// Enregistre la tâche de localisation en arrière-plan (doit être importée au démarrage)
import './src/services/locationTask';

import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';

import AmbassadorVTCScreen from './src/screens/AmbassadorVTCScreen';
import AmbassadorAccueilScreen from './src/screens/AmbassadorAccueilScreen';
import AmbassadorCommanderScreen from './src/screens/AmbassadorCommanderScreen';
import AmbassadorBoutiqueScreen from './src/screens/AmbassadorBoutiqueScreen';
import AmbassadorBonsCadeauxScreen from './src/screens/AmbassadorBonsCadeauxScreen';
import AmbassadorQRCodeScreen from './src/screens/AmbassadorQRCodeScreen';
import AmbassadorParrainageScreen from './src/screens/AmbassadorParrainageScreen';
import AmbassadorProfilScreen from './src/screens/AmbassadorProfilScreen';
import AmbassadorNiveauxScreen from './src/screens/AmbassadorNiveauxScreen';
import AmbassadorEquipeScreen from './src/screens/AmbassadorEquipeScreen';
import AmbassadorCommissionsScreen from './src/screens/AmbassadorCommissionsScreen';

import ChauffeurHomeScreen from './src/screens/ChauffeurHomeScreen';
import ChauffeurCoursesScreen from './src/screens/ChauffeurCoursesScreen';
import ChauffeurProfileScreen from './src/screens/ChauffeurProfileScreen';
import ChauffeurRevenusScreen from './src/screens/ChauffeurRevenusScreen';

import ChatScreen from './src/screens/ChatScreen';

import type { RootStackParamList } from './src/types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
    const notificationListener = useRef<Notifications.EventSubscription | null>(null);
    const responseListener = useRef<Notifications.EventSubscription | null>(null);

    useEffect(() => {
        // Configurer le handler de notifications
        Notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldShowAlert: true,
                shouldPlaySound: true,
                shouldSetBadge: true,
                shouldShowBanner: true,
                shouldShowList: true,
            }),
        });

        // Listener pour les notifications reçues en foreground
        notificationListener.current = Notifications.addNotificationReceivedListener((_notification) => {
            // Notification reçue — pas d'action supplémentaire par défaut
        });

        // Listener pour quand l'utilisateur appuie sur une notification
        responseListener.current = Notifications.addNotificationResponseReceivedListener((_response) => {
            // L'utilisateur a appuyé sur la notification — navigation possible ici si besoin
        });

        return () => {
            if (notificationListener.current) {
                notificationListener.current.remove();
            }
            if (responseListener.current) {
                responseListener.current.remove();
            }
        };
    }, []);

    return (
        <SafeAreaProvider>
        <ThemeProvider>
            <LanguageProvider>
                <AuthProvider>
                    <NavigationContainer>
                        <View style={styles.safeArea}>
                            <Stack.Navigator id="Main" initialRouteName="Login" screenOptions={{ headerShown: false }}>
                                <Stack.Screen name="Login" component={LoginScreen} />
                                <Stack.Screen name="Register" component={RegisterScreen} />
                                <Stack.Screen name="Onboarding" component={OnboardingScreen} />

                                {/* Ambassadeur */}
                                <Stack.Screen name="AmbassadorHome" component={AmbassadorVTCScreen} />
                                <Stack.Screen name="AmbassadorAccueil" component={AmbassadorAccueilScreen} />
                                <Stack.Screen name="AmbassadorCommander" component={AmbassadorCommanderScreen} />
                                <Stack.Screen name="AmbassadorBoutique" component={AmbassadorBoutiqueScreen} />
                                <Stack.Screen name="AmbassadorBonsCadeaux" component={AmbassadorBonsCadeauxScreen} />
                                <Stack.Screen name="AmbassadorQRCode" component={AmbassadorQRCodeScreen} options={{ animation: 'slide_from_bottom' }} />
                                <Stack.Screen name="AmbassadorParrainage" component={AmbassadorParrainageScreen} />
                                <Stack.Screen name="AmbassadorProfil" component={AmbassadorProfilScreen} />
                                <Stack.Screen name="AmbassadorNiveaux" component={AmbassadorNiveauxScreen} />
                                <Stack.Screen name="AmbassadorEquipe" component={AmbassadorEquipeScreen} />
                                <Stack.Screen name="AmbassadorCommissions" component={AmbassadorCommissionsScreen} />

                                {/* Chauffeur */}
                                <Stack.Screen name="ChauffeurHome" component={ChauffeurHomeScreen} />
                                <Stack.Screen name="ChauffeurCourses" component={ChauffeurCoursesScreen} />
                                <Stack.Screen name="ChauffeurProfile" component={ChauffeurProfileScreen} />
                                <Stack.Screen name="ChauffeurRevenus" component={ChauffeurRevenusScreen} />

                                {/* Chat */}
                                <Stack.Screen name="Chat" component={ChatScreen} />
                            </Stack.Navigator>
                        </View>
                    </NavigationContainer>
                </AuthProvider>
            </LanguageProvider>
        </ThemeProvider>
        </SafeAreaProvider>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#101018',
    },
});
