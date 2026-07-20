import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import OpportunitiesScreen from './src/screens/OpportunitiesScreen';
import TenderDetailScreen from './src/screens/TenderDetailScreen';
import GeneratingScreen from './src/screens/GeneratingScreen';
import BidReadyScreen from './src/screens/BidReadyScreen';
import OngoingScreen from './src/screens/OngoingScreen';
import EvidenceScreen from './src/screens/EvidenceScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import SignInScreen from './src/screens/SignInScreen';
import { AuthProvider, useAuth } from './src/auth';
import { IconFind, IconOngoing, IconAlerts, IconProfile } from './src/icons';
import { c } from './src/theme';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function Placeholder({ title, note }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 30, paddingTop: insets.top }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: c.navy }}>{title}</Text>
      <Text style={{ fontSize: 13, color: c.muted, textAlign: 'center', marginTop: 8 }}>{note}</Text>
    </View>
  );
}

const stackOptions = {
  headerStyle: { backgroundColor: c.white },
  headerTintColor: c.navy,
  headerTitleStyle: { fontWeight: '700' },
  headerShadowVisible: false,
};

function OpportunitiesStack() {
  return (
    <Stack.Navigator screenOptions={stackOptions}>
      <Stack.Screen name="Opportunities" component={OpportunitiesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="TenderDetail" component={TenderDetailScreen} options={{ title: 'Tender' }} />
      <Stack.Screen name="Generating" component={GeneratingScreen} options={{ title: 'Writing', headerBackVisible: false }} />
      <Stack.Screen name="BidReady" component={BidReadyScreen} options={{ title: 'Your bid' }} />
    </Stack.Navigator>
  );
}

// Evidence sits under Profile rather than in the tab bar, so it opens with a
// back arrow instead of taking a slot along the bottom.
function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={stackOptions}>
      <Stack.Screen name="ProfileHome" component={ProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Evidence" component={EvidenceScreen} options={{ title: 'Evidence library' }} />
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
          tabBarInactiveTintColor: c.muted2,
          tabBarStyle: { backgroundColor: c.white, borderTopColor: c.line, height: 84, paddingTop: 8 },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        }}
      >
        <Tabs.Screen
          name="Find"
          component={OpportunitiesStack}
          options={{
            title: 'Find',
            tabBarIcon: ({ color }) => <IconFind size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="Ongoing"
          component={OngoingScreen}
          options={{ tabBarIcon: ({ color }) => <IconOngoing size={22} color={color} /> }}
        />
        <Tabs.Screen
          name="Alerts"
          options={{ tabBarIcon: ({ color }) => <IconAlerts size={22} color={color} /> }}
        >
          {() => <Placeholder title="Alerts" note="New care tenders matching your services will appear here." />}
        </Tabs.Screen>
        <Tabs.Screen
          name="Profile"
          component={ProfileStack}
          options={{ tabBarIcon: ({ color }) => <IconProfile size={22} color={color} /> }}
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
