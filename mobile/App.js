import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import HomeScreen from './src/screens/HomeScreen';
import OpportunitiesScreen from './src/screens/OpportunitiesScreen';
import TenderDetailScreen from './src/screens/TenderDetailScreen';
import GeneratingScreen from './src/screens/GeneratingScreen';
import BidReadyScreen from './src/screens/BidReadyScreen';
import OngoingScreen from './src/screens/OngoingScreen';
import EvidenceScreen from './src/screens/EvidenceScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import SignInScreen from './src/screens/SignInScreen';
import { AuthProvider, useAuth } from './src/auth';
import { IconHome, IconFind, IconOngoing, IconProfile } from './src/icons';
import { c } from './src/theme';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const stackOptions = {
  headerStyle: { backgroundColor: c.white },
  headerTintColor: c.navy,
  headerTitleStyle: { fontWeight: '700' },
  headerShadowVisible: false,
};

// A tender can be opened from Home or from Find, so both tabs carry the same
// detail, writing and bid screens behind their own root.
function tenderScreens() {
  return (
    <>
      <Stack.Screen name="TenderDetail" component={TenderDetailScreen} options={{ title: 'Tender' }} />
      <Stack.Screen name="Generating" component={GeneratingScreen} options={{ title: 'Writing', headerBackVisible: false }} />
      <Stack.Screen name="BidReady" component={BidReadyScreen} options={{ title: 'Your bid' }} />
    </>
  );
}

// Home is the landing screen: greeting, what is waiting, a few tenders.
function HomeStack() {
  return (
    <Stack.Navigator screenOptions={stackOptions}>
      <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      {tenderScreens()}
    </Stack.Navigator>
  );
}

// Find keeps its own tab: the full list, with search and filters.
function FindStack() {
  return (
    <Stack.Navigator screenOptions={stackOptions}>
      <Stack.Screen name="Opportunities" component={OpportunitiesScreen} options={{ headerShown: false }} />
      {tenderScreens()}
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
          name="HomeTab"
          component={HomeStack}
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => <IconHome size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="Find"
          component={FindStack}
          options={{ tabBarIcon: ({ color }) => <IconFind size={22} color={color} /> }}
        />
        <Tabs.Screen
          name="Ongoing"
          component={OngoingScreen}
          options={{ tabBarIcon: ({ color }) => <IconOngoing size={22} color={color} /> }}
        />
        {/* Alerts is hidden until it does something. The screen is written and
            the icon is drawn, so putting it back is a matter of restoring this
            block once matching tenders actually push a notification. */}
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
