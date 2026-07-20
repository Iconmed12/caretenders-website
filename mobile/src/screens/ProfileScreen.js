import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { c } from '../theme';
import { supabase, useAuth } from '../auth';

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

export default function ProfileScreen() {
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

  function confirmSignOut() {
    Alert.alert('Sign out', 'You will need your password to get back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  const renews = membership.renews
    ? new Date(membership.renews).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 16, paddingTop: 28 }}>
      <View style={s.head}>
        <View style={s.avatar}><Text style={s.avatarText}>{initialsOf(user.email, meta)}</Text></View>
        <Text style={s.name}>{nameOf(user.email, meta)}</Text>
        {!!meta.company && <Text style={s.company}>{meta.company}</Text>}
      </View>

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
      </View>

      <Text style={s.note}>
        Membership and billing are managed on getcana.co.uk
      </Text>

      <TouchableOpacity style={s.signOut} onPress={confirmSignOut} activeOpacity={0.85}>
        <Text style={s.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  head: { alignItems: 'center', marginBottom: 22 },
  avatar: {
    width: 66, height: 66, borderRadius: 33, backgroundColor: c.navy,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: c.cyan, fontSize: 24, fontWeight: '700' },
  name: { fontSize: 18, fontWeight: '700', color: c.navy, marginTop: 12 },
  company: { fontSize: 13, color: c.muted, marginTop: 3 },
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
  note: { fontSize: 12.5, color: c.muted2, textAlign: 'center', marginTop: 18, lineHeight: 19 },
  signOut: {
    borderWidth: 1, borderColor: c.line, backgroundColor: c.white,
    borderRadius: 13, paddingVertical: 15, alignItems: 'center', marginTop: 22,
  },
  signOutText: { fontSize: 14.5, fontWeight: '700', color: '#b4232a' },
});
