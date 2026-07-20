import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import OpportunitiesScreen from './src/screens/OpportunitiesScreen';
import TenderDetailScreen from './src/screens/TenderDetailScreen';
import GeneratingScreen from './src/screens/GeneratingScreen';
import BidReadyScreen from './src/screens/BidReadyScreen';
import EvidenceScreen from './src/screens/EvidenceScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import SignInScreen from './src/screens/SignInScreen';
import { AuthProvider, useAuth } from './src/auth';
import { c } from './src/theme';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

// Simple text glyphs stand in for the icon set until we add one.
function TabIcon({ label, focused }) {
  return <Text style={{ fontSize: 17, opacity: focused ? 1 : 0.45 }}>{label}</Text>;
}

function Placeholder({ title, note }) {
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: c.navy }}>{title}</Text>
      <Text style={{ fontSize: 13, color: c.muted, textAlign: 'center', marginTop: 8 }}>{note}</Text>
    </View>
  );
}

function OpportunitiesStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: c.white },
        headerTintColor: c.navy,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="Opportunities" component={OpportunitiesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="TenderDetail" component={TenderDetailScreen} options={{ title: 'Tender' }} />
      <Stack.Screen name="Generating" component={GeneratingScreen} options={{ title: 'Writing', headerBackVisible: false }} />
      <Stack.Screen name="BidReady" component={BidReadyScreen} options={{ title: 'Your bid' }} />
    </Stack.Navigator>
  );
}

// Held while we check AsyncStorage for a saved session, so a returning member
// does not see the sign in screen flash up before their tenders load.
function Splash() {
  return (
    <View style={{ flex: 1, backgroundColor: c.navy, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={c.cyan} size="large" />
    </View>
  );
}

function SignedInApp() {
  return (
    <NavigationContainer>
      <Tabs.Navigator
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: c.teal,
            tabBarInactiveTintColor: '#aebac2',
            tabBarStyle: { backgroundColor: c.white, borderTopColor: c.line2, height: 84, paddingTop: 8 },
            tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          }}
        >
          <Tabs.Screen
            name="Find"
            component={OpportunitiesStack}
            options={{ title: 'Opportunities', tabBarIcon: ({ focused }) => <TabIcon label="🔍" focused={focused} /> }}
          />
          <Tabs.Screen
            name="Evidence"
            component={EvidenceScreen}
            options={{ tabBarIcon: ({ focused }) => <TabIcon label="📁" focused={focused} /> }}
          />
          <Tabs.Screen
            name="Alerts"
            options={{ tabBarIcon: ({ focused }) => <TabIcon label="🔔" focused={focused} /> }}
          >
            {() => <Placeholder title="Alerts" note="New care tenders matching your services will appear here." />}
          </Tabs.Screen>
          <Tabs.Screen
            name="Profile"
            component={ProfileScreen}
            options={{ tabBarIcon: ({ focused }) => <TabIcon label="👤" focused={focused} /> }}
          />
        </Tabs.Navigator>
    </NavigationContainer>
  );
}

// Members only: no session, no app. The auth listener swaps these over the
// moment someone signs in or out, so neither screen needs to navigate.
function Root() {
  const { session, loading } = useAuth();
  // Signed out and loading are both navy screens, so the clock and battery
  // need to be white there and dark once the app proper is showing.
  return (
    <>
      <StatusBar style={session && !loading ? 'dark' : 'light'} />
      {loading ? <Splash /> : session ? <SignedInApp /> : <SignInScreen />}
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
