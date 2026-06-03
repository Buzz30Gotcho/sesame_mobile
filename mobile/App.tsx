import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaView, StyleSheet } from 'react-native';

import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';
import { LanguageProvider } from './src/context/LanguageContext';

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

import AdminDashboardScreen from './src/screens/AdminDashboardScreen';
import AdminAmbassadeursScreen from './src/screens/AdminAmbassadeursScreen';
import AdminChauffeursScreen from './src/screens/AdminChauffeursScreen';
import AdminCoursesScreen from './src/screens/AdminCoursesScreen';
import AdminBlacklistScreen from './src/screens/AdminBlacklistScreen';

import FournisseurScreen from './src/screens/FournisseurScreen';
import ChatScreen from './src/screens/ChatScreen';

import type { RootStackParamList } from './src/types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
    return (
        <ThemeProvider>
            <LanguageProvider>
                <AuthProvider>
                    <NavigationContainer>
                        <SafeAreaView style={styles.safeArea}>
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
                                <Stack.Screen name="AmbassadorQRCode" component={AmbassadorQRCodeScreen} />
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

                                {/* Admin */}
                                <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
                                <Stack.Screen name="AdminAmbassadeurs" component={AdminAmbassadeursScreen} />
                                <Stack.Screen name="AdminChauffeurs" component={AdminChauffeursScreen} />
                                <Stack.Screen name="AdminCourses" component={AdminCoursesScreen} />
                                <Stack.Screen name="AdminBlacklist" component={AdminBlacklistScreen} />

                                {/* Fournisseur & Chat */}
                                <Stack.Screen name="FournisseurValidation" component={FournisseurScreen} />
                                <Stack.Screen name="Chat" component={ChatScreen} />
                            </Stack.Navigator>
                        </SafeAreaView>
                    </NavigationContainer>
                </AuthProvider>
            </LanguageProvider>
        </ThemeProvider>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#101018',
    },
});
