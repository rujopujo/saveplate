import React, { useState } from 'react';
import { View, StyleSheet, StatusBar, ActivityIndicator, Text } from 'react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import ConsumerMap from './src/screens/ConsumerMap';
import RestaurantScanner from './src/screens/RestaurantScanner';
import RestaurantDashboard from './src/screens/RestaurantDashboard';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';

type AuthScreen = 'login' | 'register';

function AppContent() {
  const { isAuthenticated, isLoading, userRole, logout } = useAuth();
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#FF8C00" />
      </View>
    );
  }

  if (!isAuthenticated) {
    if (authScreen === 'login') {
      return <LoginScreen navigation={{ navigate: (screen: string) => setAuthScreen(screen.toLowerCase() as AuthScreen) }} />;
    }
    return <RegisterScreen navigation={{ navigate: (screen: string) => setAuthScreen(screen.toLowerCase() as AuthScreen) }} />;
  }

  if (userRole === 'consumer') return <ConsumerMap />;
  if (userRole === 'restaurant') return <RestaurantDashboard />;

  return (
    <View style={[styles.container, styles.center]}>
      <Text style={{color: '#fff', marginBottom: 20}}>Unknown Role</Text>
      <Text style={{color: '#FF8C00', padding: 10}} onPress={logout}>Logout</Text>
    </View>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      <AppContent />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  center: { justifyContent: 'center', alignItems: 'center' }
});

