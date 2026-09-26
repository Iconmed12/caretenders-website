import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { c } from '../theme';
import Wordmark from '../components/Wordmark';
import { IconFind, IconDoc, IconOngoing, IconArrowRight } from '../icons';

const STEPS = [
  { n: '1', Icon: IconFind, title: 'Discover opportunities', body: 'Find relevant tenders from across the UK, tailored to your organisation.' },
  { n: '2', Icon: IconDoc, title: 'Generate your response', body: 'Create high-quality, compliant responses faster with Cana.' },
  { n: '3', Icon: IconOngoing, title: 'Receive your tender package', body: 'Get a complete, tailored tender package ready to review and submit.' },
];

export default function OnboardingScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  async function go() {
    try { await AsyncStorage.setItem('cana_seen_onboarding', '1'); } catch (e) {}
    navigation.replace('SignIn');
  }

  return (
    <View style={[s.wrap, { paddingTop: Math.max(insets.top, 20) + 8, paddingBottom: Math.max(insets.bottom, 16) }]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
        <View style={s.brand}><Wordmark height={34} /></View>

        <Text style={s.h1}>
          <Text style={{ color: c.navy }}>Find it. </Text>
          <Text style={{ color: c.cyan }}>Generate it.</Text>
        </Text>
        <Text style={s.sub}>
          Bid for tenders and contract opportunities from anywhere, with less admin and more winning possibilities.
        </Text>

        {STEPS.map((st) => (
          <View key={st.n} style={s.card}>
            <View style={s.num}><Text style={s.numText}>{st.n}</Text></View>
            <View style={s.cardText}>
              <Text style={s.cardTitle}>{st.title}</Text>
              <Text style={s.cardBody}>{st.body}</Text>
            </View>
            <View style={s.illus}><st.Icon size={22} color={c.navy} /></View>
          </View>
        ))}
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity style={s.primary} activeOpacity={0.85} onPress={go}>
          <Text style={s.primaryText}>Get started</Text>
          <IconArrowRight size={19} color="#04303a" />
        </TouchableOpacity>
        <TouchableOpacity style={s.ghost} activeOpacity={0.85} onPress={go}>
          <Text style={s.ghostText}>Sign in</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.white },
  brand: { alignItems: 'center', marginTop: 10, marginBottom: 22 },
  h1: { fontSize: 33, fontWeight: '800', textAlign: 'center', letterSpacing: -0.8, lineHeight: 38 },
  sub: { fontSize: 14.5, color: c.muted, textAlign: 'center', marginTop: 12, marginBottom: 22, lineHeight: 21, paddingHorizontal: 6 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.white, borderRadius: 16, borderWidth: 1, borderColor: c.line, padding: 16, marginBottom: 14, gap: 13 },
  num: { width: 30, height: 30, borderRadius: 15, backgroundColor: c.tealBg, alignItems: 'center', justifyContent: 'center' },
  numText: { fontSize: 13.5, fontWeight: '800', color: c.navy },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: c.navy },
  cardBody: { fontSize: 12.5, color: c.muted, marginTop: 4, lineHeight: 18 },
  illus: { width: 44, height: 44, borderRadius: 12, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: 22, paddingTop: 8, gap: 11 },
  primary: { flexDirection: 'row', gap: 8, backgroundColor: c.brand, borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 15.5, fontWeight: '800', color: '#04303a' },
  ghost: { borderWidth: 1, borderColor: c.line, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  ghostText: { fontSize: 15, fontWeight: '700', color: c.navy },
});
