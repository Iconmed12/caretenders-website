import React from 'react';
import { Text, View } from 'react-native';
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

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
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
            options={{ tabBarIcon: ({ focused }) => <TabIcon label="👤" focused={focused} /> }}
          >
            {() => <Placeholder title="Profile" note="Sign in with your Cana Bids account to generate bids." />}
          </Tabs.Screen>
        </Tabs.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
