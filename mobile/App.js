import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import HomeScreen from './src/screens/HomeScreen';
import OpportunitiesScreen from './src/screens/OpportunitiesScreen';
import TenderDetailScreen from './src/screens/TenderDetailScreen';
import GeneratingScreen from './src/screens/GeneratingScreen';
import BidReadyScreen from './src/screens/BidReadyScreen';
import OngoingScreen from './src/screens/OngoingScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import JoinScreen from './src/screens/JoinScreen';
import EvidenceScreen from './src/screens/EvidenceScreen';
import CompanyProfileScreen from './src/screens/CompanyProfileScreen';
import TeamScreen from './src/screens/TeamScreen';
import TeamInviteScreen from './src/screens/TeamInviteScreen';
import TeamMemberScreen from './src/screens/TeamMemberScreen';
import SatScreen from './src/screens/SatScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import SignInScreen from './src/screens/SignInScreen';
import { AuthProvider, useAuth } from './src/auth';
import { IconHome, IconDoc, IconTeam, IconMore, IconSpark } from './src/icons';
import Wordmark from './src/components/Wordmark';
import { c } from './src/theme';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const stackOptions = {
  headerStyle: { backgroundColor: c.white },
  headerTintColor: c.navy,
  headerTitleStyle: { fontWeight: '700' },
  headerShadowVisible: false,
};

// The tender flow (detail, writing, bid ready) shows the Cana Bids wordmark in
// the header, matching the marketing screens. The Profile sub-screens keep plain
// text titles so "Company profile" / "Your team" stay clear.
const brandedStackOptions = {
  ...stackOptions,
  headerTitle: () => <Wordmark height={20} />,
  headerTitleAlign: 'center',
};

// A tender can be opened from Home or from Find, so both tabs carry their own
// copy of the detail, writing and bid screens. Listed out in full in both
// rather than shared, because a navigator wants Screen elements directly.

// Home is the landing screen: greeting, what is waiting, a few tenders.
function HomeStack() {
  return (
    <Stack.Navigator screenOptions={brandedStackOptions}>
      <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="TenderDetail" component={TenderDetailScreen} options={{ title: 'Tender' }} />
      <Stack.Screen name="Generating" component={GeneratingScreen} options={{ headerShown: false }} />
      <Stack.Screen name="BidReady" component={BidReadyScreen} options={{ title: 'Your bid' }} />
    </Stack.Navigator>
  );
}

// Find keeps its own tab: the full list, with search and filters.
function FindStack() {
  return (
    <Stack.Navigator screenOptions={brandedStackOptions}>
      <Stack.Screen name="Opportunities" component={OpportunitiesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="TenderDetail" component={TenderDetailScreen} options={{ title: 'Tender' }} />
      <Stack.Screen name="Generating" component={GeneratingScreen} options={{ headerShown: false }} />
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
      <Stack.Screen name="CompanyProfile" component={CompanyProfileScreen} options={{ title: 'Company profile' }} />
      <Stack.Screen name="Sat" component={SatScreen} options={{ title: 'Send a tender' }} />
      <Stack.Screen name="Evidence" component={EvidenceScreen} options={{ title: 'Evidence library' }} />
    </Stack.Navigator>
  );
}

// Team is its own tab: the roster, with invite and member detail pushed on top.
function TeamStack() {
  return (
    <Stack.Navigator screenOptions={brandedStackOptions}>
      <Stack.Screen name="TeamHome" component={TeamScreen} options={{ headerShown: false }} />
      <Stack.Screen name="TeamInvite" component={TeamInviteScreen} options={{ title: 'Invite' }} />
      <Stack.Screen name="TeamMember" component={TeamMemberScreen} options={{ title: 'Team member' }} />
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

// Generate has no screen of its own: tapping it opens Opportunities to pick a
// tender. The route exists only so the tab bar has a slot for the button.
function GeneratePlaceholder() { return <View style={{ flex: 1, backgroundColor: c.white }} />; }

// Which routes appear in the bar, in order, with their label and icon. "Find"
// (Opportunities) is intentionally absent: it is reached from Home and Generate.
const TAB_META = {
  HomeTab: { label: 'Home', Icon: IconHome },
  Ongoing: { label: 'My Bids', Icon: IconDoc },
  Generate: { label: 'Generate', fab: true },
  Team: { label: 'Team', Icon: IconTeam },
  Profile: { label: 'More', Icon: IconMore },
};

// One custom bar so every label sits on the same baseline (a raised icon can no
// longer push its own label out of line) and the Generate circle floats above.
function AppTabBar({ state, navigation }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[tb.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {state.routes.map((route, index) => {
        const meta = TAB_META[route.name];
        if (!meta) return null;
        const isFocused = state.index === index;
        const color = isFocused ? c.navy : c.muted2;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (route.name === 'Generate') { navigation.navigate('Find', { screen: 'Opportunities' }); return; }
          if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <TouchableOpacity
            key={route.key}
            style={tb.item}
            activeOpacity={0.8}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={meta.label}
          >
            <View style={tb.iconWrap}>
              {meta.fab ? (
                <View style={tb.glow}><View style={tb.circle}><IconSpark size={24} color="#ffffff" /></View></View>
              ) : (
                <meta.Icon size={22} color={color} />
              )}
            </View>
            <Text style={[tb.label, { color: meta.fab ? c.navy : color }]}>{meta.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function SignedInApp() {
  return (
    <NavigationContainer>
      <Tabs.Navigator screenOptions={{ headerShown: false }} tabBar={(props) => <AppTabBar {...props} />}>
        <Tabs.Screen name="HomeTab" component={HomeStack} />
        <Tabs.Screen name="Ongoing" component={OngoingScreen} />
        <Tabs.Screen name="Generate" component={GeneratePlaceholder} />
        <Tabs.Screen name="Team" component={TeamStack} />
        <Tabs.Screen name="Profile" component={ProfileStack} />
        <Tabs.Screen name="Find" component={FindStack} />
      </Tabs.Navigator>
    </NavigationContainer>
  );
}

const tb = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: c.white, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 10 },
  item: { flex: 1, alignItems: 'center' },
  // Uniform icon area for every tab, so all labels land on the same line.
  iconWrap: { height: 26, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, fontWeight: '600', marginTop: 4 },
  // translateY raises the circle without taking layout height, so the "Generate"
  // label stays aligned with the others.
  glow: { transform: [{ translateY: -16 }], borderRadius: 32, padding: 5, backgroundColor: 'rgba(0,175,193,0.14)' },
  circle: {
    width: 50, height: 50, borderRadius: 25, backgroundColor: c.brand,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0fb6bd', shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 9,
  },
});

// Signed out: onboarding the first time, then sign in, with the company-invite
// join flow reachable from sign in. First-run onboarding is remembered so it does
// not nag on every launch.
function SignedOutApp() {
  const [initial, setInitial] = useState(null); // null while we read the flag

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem('cana_seen_onboarding')
      .then((v) => { if (alive) setInitial(v ? 'SignIn' : 'Onboarding'); })
      .catch(() => { if (alive) setInitial('Onboarding'); });
    return () => { alive = false; };
  }, []);

  if (!initial) return <View style={{ flex: 1, backgroundColor: c.white }} />;

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName={initial} screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="SignIn" component={SignInScreen} />
        <Stack.Screen name="Join" component={JoinScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// Members only: no session, no app. The auth listener swaps these over the
// moment someone signs in or out, so neither screen needs to navigate.
function Root() {
  const { session, loading } = useAuth();
  // The signed-out screens are on white now, so keep the clock and battery dark
  // there too; only the navy splash needs light.
  return (
    <>
      <StatusBar style={loading ? 'light' : 'dark'} />
      {loading ? <Splash /> : session ? <SignedInApp /> : <SignedOutApp />}
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
