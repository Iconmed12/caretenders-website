import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Linking } from 'react-native';
import { c } from '../theme';
import TopBar from '../components/TopBar';
import { supabase, useAuth } from '../auth';
import {
  IconLink, IconReview, IconDoc, IconBuilding, IconCard, IconAlerts,
  IconShield, IconHelp, IconBook, IconMail, IconSignOut, IconChevron,
} from '../icons';

const WEB = 'https://getcana.co.uk';
const HELP_EMAIL = 'hello@getcana.co.uk';

function initialsOf(email, meta) {
  const first = (meta && (meta.first_name || meta.firstName)) || '';
  const last = (meta && (meta.last_name || meta.lastName)) || '';
  if (first) return (first.charAt(0) + (last.charAt(0) || '')).toUpperCase();
  return (email || '?').charAt(0).toUpperCase();
}

function Row({ icon: Icon, label, sub, onPress, danger }) {
  return (
    <TouchableOpacity style={s.row} activeOpacity={0.75} onPress={onPress}>
      <View style={s.rowIcon}><Icon size={19} color={danger ? '#b4232a' : c.navy} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[s.rowLabel, danger && { color: '#b4232a' }]}>{label}</Text>
        {!!sub && <Text style={s.rowSub}>{sub}</Text>}
      </View>
      <IconChevron size={16} color={c.muted2} />
    </TouchableOpacity>
  );
}

export default function ProfileScreen({ navigation }) {
  const { session } = useAuth();
  const user = (session && session.user) || {};
  const meta = user.user_metadata || {};

  const openWeb = (path) => Linking.openURL(WEB + (path || '')).catch(() => {});
  const email = (url) => Linking.openURL(url).catch(() => Alert.alert('Could not open', 'Please email ' + HELP_EMAIL));

  function loginSecurity() {
    Alert.alert('Login & security', 'Send a password reset link to ' + user.email + '?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send link', onPress: () => {
          supabase.auth.resetPasswordForEmail(user.email);
          Alert.alert('Check your email', 'A link to set a new password is on its way.');
        },
      },
    ]);
  }

  function signOut() {
    Alert.alert('Sign out', 'You will need your password to get back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  return (
    <View style={s.wrap}>
      <TopBar brand initials={initialsOf(user.email, meta)} onBell={() => navigation.getParent()?.navigate('Ongoing')} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <Text style={s.h1}>More</Text>
        <Text style={s.sub}>Tools, settings and support to help you get the most out of Cana Bids.</Text>

        {/* S.A.T */}
        <TouchableOpacity style={s.feature} activeOpacity={0.85} onPress={() => navigation.navigate('Sat')}>
          <View style={s.featureIcon}><IconLink size={24} color={c.navy} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.featureTitle}>S.A.T. - Send A Tender</Text>
            <Text style={s.featureBody}>Paste a tender link and let Cana add it for you.</Text>
          </View>
          <IconChevron size={18} color={c.muted2} />
        </TouchableOpacity>

        {/* Cana Reviews */}
        <View style={s.reviews}>
          <View style={s.reviewHead}>
            <View style={s.featureIcon}><IconReview size={24} color={c.navy} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.featureTitle}>Cana Reviews</Text>
              <Text style={s.featureBody}>Get expert feedback to make your bid stronger.</Text>
            </View>
          </View>
          <View style={s.reviewCards}>
            <TouchableOpacity style={s.reviewCard} activeOpacity={0.85} onPress={() => openWeb('/plans.html')}>
              <IconDoc size={19} color={c.navy} />
              <Text style={s.reviewCardTitle}>Response Review</Text>
              <Text style={s.reviewCardBody}>Review a specific response or section.</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.reviewCard} activeOpacity={0.85} onPress={() => openWeb('/plans.html')}>
              <IconReview size={19} color={c.navy} />
              <Text style={s.reviewCardTitle}>Full Tender Review</Text>
              <Text style={s.reviewCardBody}>A complete review of your bid.</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Company & account */}
        <Text style={s.section}>Company & account</Text>
        <View style={s.group}>
          <Row icon={IconBuilding} label="Company profile" onPress={() => navigation.navigate('CompanyProfile')} />
          <View style={s.divider} />
          <Row icon={IconCard} label="My plan & billing" onPress={() => openWeb('')} />
          <View style={s.divider} />
          <Row icon={IconAlerts} label="Notifications" onPress={() => Alert.alert('Notifications', 'Notification settings are coming soon.')} />
          <View style={s.divider} />
          <Row icon={IconShield} label="Login & security" onPress={loginSecurity} />
        </View>

        {/* Cana */}
        <Text style={s.section}>Cana</Text>
        <View style={s.group}>
          <Row icon={IconHelp} label="Help & support" onPress={() => email('mailto:' + HELP_EMAIL + '?subject=' + encodeURIComponent('Help with Cana Bids'))} />
          <View style={s.divider} />
          <Row icon={IconBook} label="How Cana works" onPress={() => openWeb('')} />
          <View style={s.divider} />
          <Row icon={IconDoc} label="Terms & privacy" onPress={() => openWeb('/privacy.html')} />
          <View style={s.divider} />
          <Row icon={IconMail} label="Contact Cana" onPress={() => email('mailto:' + HELP_EMAIL)} />
          <View style={s.divider} />
          <Row icon={IconSignOut} label="Sign out" danger onPress={signOut} />
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  h1: { fontSize: 30, fontWeight: '800', color: c.navy, letterSpacing: -0.6, marginTop: 2 },
  sub: { fontSize: 14, color: c.muted, marginTop: 6, lineHeight: 20 },

  feature: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.tealBg, borderRadius: 16, padding: 16, marginTop: 18 },
  featureIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#d3eef3', alignItems: 'center', justifyContent: 'center' },
  featureTitle: { fontSize: 16, fontWeight: '800', color: c.navy },
  featureBody: { fontSize: 12.5, color: c.muted, marginTop: 3, lineHeight: 17 },

  reviews: { backgroundColor: c.tealBg, borderRadius: 16, padding: 16, marginTop: 12 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  reviewCards: { flexDirection: 'row', gap: 10, marginTop: 14 },
  reviewCard: { flex: 1, backgroundColor: c.white, borderRadius: 13, padding: 13, gap: 6 },
  reviewCardTitle: { fontSize: 13, fontWeight: '800', color: c.navy, marginTop: 2 },
  reviewCardBody: { fontSize: 11, color: c.muted, lineHeight: 15 },

  section: { fontSize: 16, fontWeight: '800', color: c.navy, marginTop: 24, marginBottom: 10 },
  group: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, paddingVertical: 14 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 14.5, fontWeight: '700', color: c.navy },
  rowSub: { fontSize: 11.5, color: c.teal, marginTop: 2, fontWeight: '600' },
  divider: { height: 1, backgroundColor: c.line2, marginLeft: 61 },
});
