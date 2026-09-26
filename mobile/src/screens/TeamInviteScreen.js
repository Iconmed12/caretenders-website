import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { c } from '../theme';
import { useAuth } from '../auth';
import { teamAction } from '../api';
import { IconMail, IconBuilding, IconArrowRight, IconTeam } from '../icons';

// Fixed department options, so departments stay consistent across the company
// (and match the website). One person = one department.
const DEPARTMENTS = ['Care & Health', 'Facilities Management', 'Recruitment & HR', 'Construction & Property', 'IT & Technology', 'Professional Services', 'Other'];

// What every teammate can do (the email model). Shown as reassurance, and it is
// exactly true, so it is safe to promise.
const CAN_DO = [
  'View opportunities across your company',
  'Generate full tender responses',
  'Use your shared company profile and evidence',
  'See their own bid history',
];

export default function TeamInviteScreen({ navigation }) {
  const { session } = useAuth();
  const token = (session && session.access_token) || '';
  const [email, setEmail] = useState('');
  const [dept, setDept] = useState('');
  const [busy, setBusy] = useState(false);

  function send() {
    if (!email.trim()) { Alert.alert('Add an email', 'Please enter the person\'s work email.'); return; }
    setBusy(true);
    teamAction(token, { action: 'invite', email: email.trim(), department: dept.trim() })
      .then(() => {
        Alert.alert('Invitation sent', 'We have emailed them a link to join your company.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      })
      .catch((e) => Alert.alert('Could not send', e.message || 'Please try again.'))
      .finally(() => setBusy(false));
  }

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
        <View style={s.head}>
          <View style={{ flex: 1 }}>
            <Text style={s.h1}>Invite a team member</Text>
            <Text style={s.sub}>Add someone to your company. Their seat is covered by your plan.</Text>
          </View>
          <View style={s.headIcon}><IconTeam size={24} color={c.navy} /></View>
        </View>

        <View style={s.labelRow}><IconMail size={17} color={c.navy} /><Text style={s.label}>Email address</Text></View>
        <TextInput
          style={s.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Enter work email"
          placeholderTextColor={c.muted2}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />

        <View style={s.labelRow}><IconBuilding size={17} color={c.navy} /><Text style={s.label}>Department (optional)</Text></View>
        <View style={s.chips}>
          {DEPARTMENTS.map((d) => (
            <TouchableOpacity
              key={d}
              style={[s.chip, dept === d && s.chipOn]}
              activeOpacity={0.8}
              onPress={() => setDept(dept === d ? '' : d)}
            >
              <Text style={[s.chipText, dept === d && s.chipTextOn]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.canBox}>
          <Text style={s.canTitle}>This team member will be able to:</Text>
          {CAN_DO.map((t) => (
            <View key={t} style={s.canRow}>
              <View style={s.tick}><Text style={s.tickText}>✓</Text></View>
              <Text style={s.canText}>{t}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={[s.send, busy && s.off]} activeOpacity={0.85} onPress={send} disabled={busy}>
          {busy ? <ActivityIndicator color="#04303a" /> : (
            <><Text style={s.sendText}>Send invitation</Text><IconArrowRight size={19} color="#04303a" /></>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.white },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 8 },
  h1: { fontSize: 24, fontWeight: '800', color: c.navy, letterSpacing: -0.5 },
  sub: { fontSize: 13.5, color: c.muted, marginTop: 6, lineHeight: 19 },
  headIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: c.tealBg, alignItems: 'center', justifyContent: 'center' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, marginBottom: 8 },
  label: { fontSize: 14, fontWeight: '700', color: c.navy },
  input: { borderWidth: 1, borderColor: c.line, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, color: c.ink, backgroundColor: c.white },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: c.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: c.white },
  chipOn: { backgroundColor: c.navy, borderColor: c.navy },
  chipText: { fontSize: 13, fontWeight: '600', color: c.muted },
  chipTextOn: { color: '#fff' },
  canBox: { backgroundColor: c.tealBg, borderRadius: 14, padding: 16, marginTop: 22 },
  canTitle: { fontSize: 13.5, fontWeight: '800', color: c.navy, marginBottom: 10 },
  canRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  tick: { width: 20, height: 20, borderRadius: 10, backgroundColor: c.good, alignItems: 'center', justifyContent: 'center' },
  tickText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  canText: { fontSize: 12.5, color: c.ink, flex: 1 },
  send: { flexDirection: 'row', gap: 8, backgroundColor: c.brand, borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  off: { opacity: 0.6 },
  sendText: { fontSize: 15.5, fontWeight: '800', color: '#04303a' },
});
