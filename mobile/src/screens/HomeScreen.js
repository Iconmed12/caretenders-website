import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { c } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import { useAuth } from '../auth';
import {
  fetchTenders, fetchOngoing, jobState, agoLabel,
  closingLabel, valueLabel, daysUntil,
} from '../api';

// Anything closing inside a week is worth flagging: too little time to write a
// bid comfortably, still enough to be worth trying.
const SOON_DAYS = 7;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function firstNameOf(user) {
  const meta = (user && user.user_metadata) || {};
  const first = meta.first_name || meta.firstName || '';
  if (first) return first;
  const email = (user && user.email) || '';
  const handle = email.split('@')[0] || '';
  // Turn "joelmbala" into "Joelmbala" rather than showing a raw email.
  return handle ? handle.charAt(0).toUpperCase() + handle.slice(1) : 'there';
}

function initialsOf(user) {
  const meta = (user && user.user_metadata) || {};
  const first = meta.first_name || meta.firstName || '';
  const last = meta.last_name || meta.lastName || '';
  if (first) return (first.charAt(0) + (last.charAt(0) || '')).toUpperCase();
  return ((user && user.email) || '?').charAt(0).toUpperCase();
}

/**
 * The landing screen. Greets the member, says what is waiting, and offers to
 * pick up anything already being written, before showing a few tenders.
 *
 * Every number here is counted from data we already load. Nothing is invented.
 */
export default function HomeScreen({ navigation }) {
  const { session } = useAuth();
  const user = (session && session.user) || {};

  const [tenders, setTenders] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (isPull) => {
    if (isPull) setRefreshing(true);
    // The two feeds are independent, so one failing should not blank the other.
    const [tRes, jRes] = await Promise.allSettled([
      fetchTenders(),
      fetchOngoing(user.email),
    ]);
    setTenders(tRes.status === 'fulfilled' ? tRes.value : []);
    setJobs(jRes.status === 'fulfilled' ? jRes.value : []);
    setError(tRes.status === 'rejected' ? 'Could not load tenders. Pull down to try again.' : '');
    setLoading(false);
    setRefreshing(false);
  }, [user.email]);

  useFocusEffect(useCallback(() => { load(false); }, [load]));

  const closingSoon = tenders.filter((t) => {
    const d = daysUntil(t.deadline);
    return d !== null && d >= 0 && d <= SOON_DAYS;
  });
  const running = jobs.filter((j) => {
    const st = jobState(j);
    return st === 'running' || st === 'queued';
  });

  if (loading) {
    return (
      <View style={[s.wrap, s.centre]}>
        <ActivityIndicator color={c.teal} />
      </View>
    );
  }

  return (
    <View style={s.wrap}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 26 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={c.teal} />
        }
      >
        <ScreenHeader
          subtitle={greeting()}
          title={firstNameOf(user)}
          right={
            <TouchableOpacity
              style={s.avatar}
              activeOpacity={0.8}
              onPress={() => navigation.getParent()?.navigate('Profile')}
            >
              <Text style={s.avatarText}>{initialsOf(user)}</Text>
            </TouchableOpacity>
          }
        >
          <View style={s.stats}>
            <View style={s.stat}>
              <Text style={s.statNum}>{tenders.length}</Text>
              <Text style={s.statLabel}>OPEN NOW</Text>
            </View>
            <View style={s.stat}>
              <Text style={[s.statNum, closingSoon.length > 0 && { color: c.cyan }]}>{closingSoon.length}</Text>
              <Text style={s.statLabel}>CLOSING SOON</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statNum}>{running.length}</Text>
              <Text style={s.statLabel}>BID WRITING</Text>
            </View>
          </View>
        </ScreenHeader>

        <View style={s.body}>
          {running.length > 0 && (
            <TouchableOpacity
              style={s.resume}
              activeOpacity={0.85}
              onPress={() => navigation.getParent()?.navigate('Ongoing')}
            >
              <Text style={s.resumeKey}>PICK UP WHERE YOU LEFT OFF</Text>
              <Text style={s.resumeTitle}>{running[0].tender_title}</Text>
              <Text style={s.resumeMeta}>
                Writing now, started {agoLabel(running[0].created_at)}
                {running.length > 1 ? '  ·  +' + (running.length - 1) + ' more' : ''}
              </Text>
            </TouchableOpacity>
          )}

          <View style={s.secHead}>
            <Text style={s.secTitle}>Open opportunities</Text>
            {/* Find has its own tab, so See all switches to it rather than
                pushing a second copy of the list on top of Home. */}
            <TouchableOpacity onPress={() => navigation.getParent()?.navigate('Find')} activeOpacity={0.7}>
              <Text style={s.secLink}>See all</Text>
            </TouchableOpacity>
          </View>

          {error ? (
            <Text style={s.error}>{error}</Text>
          ) : tenders.length === 0 ? (
            <Text style={s.error}>No care tenders are open right now. We will keep looking.</Text>
          ) : (
            tenders.slice(0, 4).map((item, i) => (
              <TouchableOpacity
                key={String(item.id || i)}
                style={s.card}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('TenderDetail', { tender: item })}
              >
                <Text style={s.cardTitle}>{item.title}</Text>
                <Text style={s.cardOrg}>{item.org || item.organisation || ''}</Text>
                <View style={s.cardFoot}>
                  <Text style={s.closing}>{closingLabel(item)}</Text>
                  <Text style={s.value}>{valueLabel(item)}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  centre: { alignItems: 'center', justifyContent: 'center' },

  avatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.11)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 12.5, fontWeight: '800', color: c.cyan },

  stats: { flexDirection: 'row', gap: 8, marginTop: 16 },
  stat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 11 },
  statNum: { fontSize: 19, fontWeight: '800', color: '#fff', lineHeight: 22 },
  statLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, color: '#8fa7b8', marginTop: 3 },

  body: { paddingHorizontal: 14, paddingTop: 14, gap: 10 },

  resume: {
    backgroundColor: c.white, borderWidth: 1, borderColor: c.line,
    borderLeftWidth: 3, borderLeftColor: c.cyan, borderRadius: 13, padding: 12, gap: 5,
  },
  resumeKey: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, color: c.teal },
  resumeTitle: { fontSize: 13.5, fontWeight: '700', color: c.navy, lineHeight: 18 },
  resumeMeta: { fontSize: 11, color: c.muted2 },

  secHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 },
  secTitle: { fontSize: 14.5, fontWeight: '800', color: c.navy, letterSpacing: -0.2 },
  secLink: { fontSize: 12.5, fontWeight: '700', color: c.teal },

  card: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 13, padding: 13, gap: 6 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: c.navy, lineHeight: 19 },
  cardOrg: { fontSize: 11.5, color: c.muted2 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  closing: { fontSize: 11.5, fontWeight: '700', color: c.teal },
  value: { fontSize: 12, fontWeight: '700', color: c.navy },

  error: { fontSize: 13, color: c.muted, lineHeight: 20, paddingVertical: 14 },
});
