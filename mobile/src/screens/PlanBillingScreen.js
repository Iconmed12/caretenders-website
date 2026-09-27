import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { c } from '../theme';
import { useAuth } from '../auth';
import { fetchMembership, fetchTeam } from '../api';
import { IconCard, IconClock, IconTeam, IconLock, IconLink } from '../icons';

const WEB = 'https://getcana.co.uk';

// current_period_end can be an ISO string or a unix seconds number. Show it as
// "12 October 2026", or null if we cannot read it.
function formatDate(v) {
  if (!v) return null;
  let d;
  if (typeof v === 'number') d = new Date(v * 1000);
  else if (/^\d+$/.test(String(v))) d = new Date(Number(v) * 1000);
  else d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function termLabel(months) {
  if (months === 1) return 'Billed monthly';
  if (months === 12) return 'Billed annually';
  if (months) return 'Every ' + months + ' months';
  return 'Subscription';
}

function planTitle(plan) {
  if (!plan) return 'Your plan';
  return plan.charAt(0).toUpperCase() + plan.slice(1) + ' plan';
}

function Detail({ icon: Icon, label, value }) {
  return (
    <View style={s.detail}>
      <View style={s.detailLabel}>
        <Icon size={15} color={c.muted} />
        <Text style={s.detailLabelText}>{label}</Text>
      </View>
      <Text style={s.detailValue}>{value}</Text>
    </View>
  );
}

const INCLUDED = [
  'Unlimited bid generation',
  'Team seats and departments',
  'Expert review add-ons',
];

export default function PlanBillingScreen({ navigation }) {
  const { session } = useAuth();
  const user = (session && session.user) || {};
  const token = (session && session.access_token) || '';

  const [mem, setMem] = useState(null);
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    let alive = true;
    setLoading(true);
    Promise.all([fetchMembership(user.email), fetchTeam(token)]).then(([m, t]) => {
      if (!alive) return;
      setMem(m);
      setTeam(t);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [user.email, token]);

  useFocusEffect(load);

  const openWeb = (path) => Linking.openURL(WEB + (path || '')).catch(() => {});

  if (loading) {
    return <View style={s.centre}><ActivityIndicator color={c.teal} /></View>;
  }

  const isMember = !!(mem && mem.member);
  const active = isMember && (!mem.status || mem.status === 'active');
  const renews = formatDate(mem && mem.current_period_end);

  // Seats, only when the person is in a company circle.
  let seatsValue = null;
  if (team && team.role) {
    const members = (team.members || []).length;
    const limit = team.enterprise && team.enterprise.seat_limit;
    seatsValue = (team.role === 'owner' && limit)
      ? members + ' of ' + limit + ' in use'
      : members + (members === 1 ? ' person' : ' people');
  }

  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 16, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
      <Text style={s.h1}>My plan and billing</Text>
      <Text style={s.sub}>Your subscription, seats and renewal.</Text>

      {!isMember ? (
        <View style={s.card}>
          <Text style={s.noneTitle}>No active plan</Text>
          <Text style={s.noneBody}>You do not have a Cana plan on this account yet. Plans are set up on our website.</Text>
          <TouchableOpacity style={s.cta} activeOpacity={0.9} onPress={() => openWeb('/plans.html')}>
            <Text style={s.ctaText}>See plans</Text>
            <IconLink size={16} color="#04303a" />
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={s.card}>
            <View style={s.planTop}>
              <View style={s.planLeft}>
                <View style={s.planIcon}><IconCard size={20} color={c.navy} /></View>
                <View>
                  <Text style={s.planName}>{planTitle(mem.plan)}</Text>
                  <Text style={s.planTerm}>{termLabel(mem.term_months)}</Text>
                </View>
              </View>
              <View style={[s.status, active ? s.statusOn : s.statusOff]}>
                <Text style={[s.statusText, active ? s.statusTextOn : s.statusTextOff]}>
                  {active ? 'Active' : 'Expired'}
                </Text>
              </View>
            </View>

            <View style={s.details}>
              {renews && (
                <Detail icon={IconClock} label={active ? 'Renews on' : 'Ended on'} value={renews} />
              )}
              {seatsValue && <Detail icon={IconTeam} label="Seats" value={seatsValue} />}
            </View>
          </View>

          <Text style={s.section}>INCLUDED IN {String(mem.plan || 'your plan').toUpperCase()}</Text>
          <View style={s.card}>
            {INCLUDED.map((line, i) => (
              <View key={line} style={[s.incRow, i < INCLUDED.length - 1 && s.incDivider]}>
                <View style={s.dot} />
                <Text style={s.incText}>{line}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <View style={s.note}>
        <IconLock size={15} color={c.muted} />
        <Text style={s.noteText}>Plan changes and payment details are handled securely on getcana.co.uk.</Text>
      </View>

      <TouchableOpacity style={s.cta} activeOpacity={0.9} onPress={() => openWeb('/plans.html')}>
        <Text style={s.ctaText}>{isMember ? 'Change or upgrade plan' : 'See plans'}</Text>
        <IconLink size={16} color="#04303a" />
      </TouchableOpacity>
      <TouchableOpacity style={s.secondary} activeOpacity={0.85} onPress={() => openWeb('')}>
        <Text style={s.secondaryText}>View invoices</Text>
        <IconLink size={15} color={c.navy} />
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg },
  h1: { fontSize: 24, fontWeight: '800', color: c.navy, letterSpacing: -0.4 },
  sub: { fontSize: 13, color: c.muted, marginTop: 4 },

  card: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 16, padding: 16, marginTop: 16 },

  planTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planLeft: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  planIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: c.tealBg, alignItems: 'center', justifyContent: 'center' },
  planName: { fontSize: 16, fontWeight: '800', color: c.navy },
  planTerm: { fontSize: 11.5, color: c.muted, marginTop: 1 },
  status: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusOn: { backgroundColor: c.goodBg }, statusOff: { backgroundColor: '#fdf3e2' },
  statusText: { fontSize: 10.5, fontWeight: '800' },
  statusTextOn: { color: c.good }, statusTextOff: { color: c.amber },

  details: { borderTopWidth: 1, borderTopColor: c.line2, marginTop: 14, paddingTop: 8 },
  detail: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7 },
  detailLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailLabelText: { fontSize: 12.5, color: c.muted },
  detailValue: { fontSize: 12.5, fontWeight: '700', color: c.navy },

  section: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, color: c.muted2, marginTop: 20, marginBottom: 8 },
  incRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  incDivider: { borderBottomWidth: 1, borderBottomColor: c.line2 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.teal },
  incText: { fontSize: 13, color: c.navy, fontWeight: '600' },

  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: c.tealBg, borderRadius: 12, padding: 12, marginTop: 18 },
  noteText: { flex: 1, fontSize: 11.5, color: c.muted, lineHeight: 17 },

  cta: { flexDirection: 'row', gap: 6, backgroundColor: c.brand, borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  ctaText: { fontSize: 14.5, fontWeight: '800', color: '#04303a' },
  secondary: { flexDirection: 'row', gap: 6, backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  secondaryText: { fontSize: 14, fontWeight: '700', color: c.navy },

  noneTitle: { fontSize: 15.5, fontWeight: '800', color: c.navy },
  noneBody: { fontSize: 12.5, color: c.muted, marginTop: 6, lineHeight: 18 },
});
