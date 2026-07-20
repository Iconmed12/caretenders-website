import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Linking } from 'react-native';
import { c } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import { supabase, useAuth } from '../auth';
import { IconFolder, IconChevron } from '../icons';

function longDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function initialsOf(email, meta) {
  const first = (meta && (meta.first_name || meta.firstName)) || '';
  const last = (meta && (meta.last_name || meta.lastName)) || '';
  if (first) return (first.charAt(0) + (last.charAt(0) || '')).toUpperCase();
  return (email || '?').charAt(0).toUpperCase();
}

function nameOf(email, meta) {
  const first = (meta && (meta.first_name || meta.firstName)) || '';
  const last = (meta && (meta.last_name || meta.lastName)) || '';
  const full = [first, last].filter(Boolean).join(' ');
  return full || email || '';
}

// Waiting on the new Calendly link. Until it lands this opens an email, which
// still reaches a human. Drop the booking URL in here and it takes over.
const BOOKING_URL = '';
const HELP_EMAIL = 'hello@getcana.co.uk';

export default function ProfileScreen({ navigation }) {
  const { session } = useAuth();
  const user = (session && session.user) || {};
  const meta = user.user_metadata || {};
  const [membership, setMembership] = useState({ state: 'loading', label: '' });

  useEffect(() => {
    let alive = true;
    if (!user.email) return;

    supabase
      .from('subscriptions')
      .select('status,term_months,current_period_end')
      .eq('email', user.email)
      .order('current_period_end', { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          setMembership({ state: 'error', label: 'Could not load' });
          return;
        }
        const row = data && data[0];
        if (!row) {
          setMembership({ state: 'none', label: 'No active membership' });
          return;
        }
        const active = row.status === 'active' || row.status === 'trialing';
        const term = row.term_months ? row.term_months + ' month' : '';
        setMembership({
          state: active ? 'active' : 'inactive',
          label: active ? ['Member', term].filter(Boolean).join(', ') : 'Membership ' + row.status,
          renews: row.current_period_end,
        });
      });

    return () => { alive = false; };
  }, [user.email]);

  function bookCall() {
    const url = BOOKING_URL
      || 'mailto:' + HELP_EMAIL + '?subject=' + encodeURIComponent('Can we book a call?');
    Linking.openURL(url).catch(() => {
      Alert.alert('Could not open', 'Please email ' + HELP_EMAIL + ' and we will get straight back to you.');
    });
  }

  function confirmSignOut() {
    Alert.alert('Sign out', 'You will need your password to get back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  const renews = longDate(membership.renews);
  // Supabase stamps the account when it is created, so this is the real
  // sign up date rather than anything we have to store ourselves.
  const memberSince = longDate(user.created_at);

  return (
    <View style={s.wrap}>
      <ScreenHeader
        title={nameOf(user.email, meta)}
        subtitle={meta.company || 'Your account'}
        right={
          <View style={s.avatar}><Text style={s.avatarText}>{initialsOf(user.email, meta)}</Text></View>
        }
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
      <View style={s.card}>
        <Text style={s.rowLabel}>EMAIL</Text>
        <Text style={s.rowValue}>{user.email}</Text>

        <View style={s.sep} />

        <Text style={s.rowLabel}>MEMBERSHIP</Text>
        {membership.state === 'loading'
          ? <Text style={s.rowMuted}>Checking...</Text>
          : (
            <View style={s.badgeRow}>
              <View style={[s.badge, membership.state === 'active' ? s.badgeOn : s.badgeOff]}>
                <Text style={[s.badgeText, membership.state === 'active' ? s.badgeTextOn : s.badgeTextOff]}>
                  {membership.label}
                </Text>
              </View>
            </View>
          )}
        {!!renews && membership.state === 'active' && (
          <Text style={s.rowMuted}>Renews {renews}</Text>
        )}

        {!!memberSince && (
          <>
            <View style={s.sep} />
            <Text style={s.rowLabel}>MEMBER SINCE</Text>
            <Text style={[s.rowValue, { fontWeight: '700', color: c.navy }]}>{memberSince}</Text>
          </>
        )}
      </View>

      {/* Evidence lives here now rather than in the tab bar. */}
      <TouchableOpacity
        style={s.tap}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('Evidence')}
      >
        <IconFolder size={19} color={c.teal} />
        <View style={s.tapText}>
          <Text style={s.tapTitle}>Evidence library</Text>
          <Text style={s.tapSub}>Documents Cana uses to answer your tenders</Text>
        </View>
        <IconChevron size={16} color={c.muted2} />
      </TouchableOpacity>

      <View style={s.help}>
        <Text style={s.helpTitle}>Not sure where to start?</Text>
        <Text style={s.helpBody}>
          Book fifteen minutes with a bid writer who knows the care sector.
        </Text>
        <TouchableOpacity style={s.helpBtn} activeOpacity={0.85} onPress={bookCall}>
          <Text style={s.helpBtnText}>Book a call</Text>
        </TouchableOpacity>
      </View>

      <Text style={s.note}>
        Membership and billing are managed on getcana.co.uk
      </Text>

      <TouchableOpacity style={s.signOut} onPress={confirmSignOut} activeOpacity={0.85}>
        <Text style={s.signOutText}>Sign out</Text>
      </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  avatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.11)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 12.5, fontWeight: '800', color: c.cyan },
  card: { backgroundColor: c.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: c.line },
  rowLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, color: c.muted2 },
  rowValue: { fontSize: 15, color: c.ink, marginTop: 4 },
  rowMuted: { fontSize: 13, color: c.muted, marginTop: 6 },
  sep: { height: 1, backgroundColor: c.line2, marginVertical: 15 },
  badgeRow: { flexDirection: 'row', marginTop: 7 },
  badge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  badgeOn: { backgroundColor: c.goodBg },
  badgeOff: { backgroundColor: c.line },
  badgeText: { fontSize: 12.5, fontWeight: '700' },
  badgeTextOn: { color: c.good },
  badgeTextOff: { color: c.muted },
  tap: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    backgroundColor: c.white, borderWidth: 1, borderColor: c.line,
    borderRadius: 14, padding: 14, marginTop: 12,
  },
  tapText: { flex: 1, gap: 2 },
  tapTitle: { fontSize: 14, fontWeight: '700', color: c.navy },
  tapSub: { fontSize: 11.5, color: c.muted2, lineHeight: 16 },
  help: { backgroundColor: c.navy, borderRadius: 14, padding: 16, marginTop: 12 },
  helpTitle: { fontSize: 14.5, fontWeight: '800', color: c.white },
  helpBody: { fontSize: 12.5, color: '#8fa7b8', marginTop: 5, lineHeight: 18 },
  helpBtn: { backgroundColor: c.cyan, borderRadius: 11, paddingVertical: 12, alignItems: 'center', marginTop: 13 },
  helpBtnText: { fontSize: 13.5, fontWeight: '800', color: '#04303a' },
  note: { fontSize: 12.5, color: c.muted2, textAlign: 'center', marginTop: 18, lineHeight: 19 },
  signOut: {
    borderWidth: 1, borderColor: c.line, backgroundColor: c.white,
    borderRadius: 13, paddingVertical: 15, alignItems: 'center', marginTop: 22,
  },
  signOutText: { fontSize: 14.5, fontWeight: '700', color: '#b4232a' },
});
