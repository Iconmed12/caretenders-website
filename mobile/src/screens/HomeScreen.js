import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { c } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import FeaturedTender from '../components/FeaturedTender';
import SetupChecklist from '../components/SetupChecklist';
import { IconFind } from '../icons';
import { useAuth } from '../auth';
import {
  fetchTenders, fetchOngoing, fetchVaultDocs, fetchCompanyProfile,
  jobState, agoLabel, daysUntil, pickFeatured,
} from '../api';

// Anything closing inside a week is worth flagging: too little time to write a
// bid comfortably, still enough to be worth trying.
const SOON_DAYS = 7;

// Deliberately conservative, and always shown as an estimate. Writing a full
// tender response set by hand is a day or more of someone's time; claiming a
// precise figure would not survive being questioned.
const HOURS_PER_BID = 6;

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
 * The landing screen. There is always a subject: a tender if one is open, a
 * setup list if the account is bare, a track record either way. No arrangement
 * of the data produces a blank page.
 */
export default function HomeScreen({ navigation }) {
  const { session } = useAuth();
  const user = (session && session.user) || {};

  const [tenders, setTenders] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [docs, setDocs] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (isPull) => {
    if (isPull) setRefreshing(true);
    // Independent feeds, so one failing should not blank the others.
    const [tRes, jRes, dRes, pRes] = await Promise.allSettled([
      fetchTenders(),
      fetchOngoing(user.email),
      fetchVaultDocs(user.id),
      fetchCompanyProfile(user.id),
    ]);
    setTenders(tRes.status === 'fulfilled' ? tRes.value : []);
    setJobs(jRes.status === 'fulfilled' ? jRes.value : []);
    setDocs(dRes.status === 'fulfilled' ? dRes.value : []);
    setProfile(pRes.status === 'fulfilled' ? pRes.value : null);
    setError(tRes.status === 'rejected' ? 'Could not load tenders. Pull down to try again.' : '');
    setLoading(false);
    setRefreshing(false);
  }, [user.email, user.id]);

  useFocusEffect(useCallback(() => { load(false); }, [load]));

  const featured = pickFeatured(tenders);
  const hero = featured[0];

  // What this member has already done with the featured tender, so it never
  // offers to write a bid that exists.
  function stateForTender(tenderId) {
    const mine = jobs.filter((j) => j.tender_id === tenderId);
    if (!mine.length) return null;
    return jobState(mine[0]);
  }

  const running = jobs.filter((j) => ['running', 'queued'].includes(jobState(j)));

  // Closing this week, excluding whatever is already the hero.
  const closingSoon = tenders
    .filter((t) => {
      if (hero && t.id === hero.id) return false;
      const d = daysUntil(t.deadline);
      return d !== null && d >= 0 && d <= SOON_DAYS;
    })
    .sort((a, b) => daysUntil(a.deadline) - daysUntil(b.deadline));

  const thisYear = new Date().getFullYear();
  const bidsThisYear = jobs.filter((j) => new Date(j.created_at).getFullYear() === thisYear).length;
  const completed = jobs.filter((j) => jobState(j) === 'ready').length;

  function openHero() {
    if (hero) navigation.navigate('TenderDetail', { tender: hero });
  }

  function heroAction() {
    if (!hero) return;
    const st = stateForTender(hero.id);
    if (st === 'running' || st === 'queued') {
      navigation.getParent()?.navigate('Ongoing');
      return;
    }
    if (st === 'ready') {
      navigation.navigate('BidReady', { tender: hero });
      return;
    }
    // Same step the tender screen's own button takes, one tap earlier.
    navigation.navigate('TenderDetail', { tender: hero });
  }

  if (loading) {
    return (
      <View style={s.wrap}>
        <ScreenHeader subtitle={greeting()} title={firstNameOf(user)} />
        <View style={s.centre}><ActivityIndicator color={c.teal} /></View>
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
        />

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

          {hero ? (
            <FeaturedTender
              tender={hero}
              state={stateForTender(hero.id)}
              onPress={heroAction}
              onOpen={openHero}
            />
          ) : (
            <View style={s.none}>
              <View style={s.noneIcon}><IconFind size={21} color={c.muted2} /></View>
              <Text style={s.noneTitle}>{error ? 'Could not load' : 'Nothing open right now'}</Text>
              <Text style={s.noneText}>
                {error || 'We check for new care contracts every day. You will hear from us the moment one lands.'}
              </Text>
            </View>
          )}

          <SetupChecklist
            hasDocs={docs.length > 0}
            hasProfile={!!profile}
            onAddEvidence={() => navigation.getParent()?.navigate('Profile', { screen: 'Evidence' })}
            onOpenProfile={() => navigation.getParent()?.navigate('Profile')}
          />

          {closingSoon.length > 0 && (
            <View style={s.card}>
              <View style={s.cardHead}>
                <Text style={s.cardHeadTitle}>Closing this week</Text>
                <TouchableOpacity onPress={() => navigation.getParent()?.navigate('Find')} activeOpacity={0.7}>
                  <Text style={s.cardHeadLink}>See all</Text>
                </TouchableOpacity>
              </View>
              {closingSoon.slice(0, 3).map((item, i) => {
                const days = daysUntil(item.deadline);
                return (
                  <TouchableOpacity
                    key={String(item.id || i)}
                    style={[s.row, i === 0 && s.rowFirst]}
                    activeOpacity={0.8}
                    onPress={() => navigation.navigate('TenderDetail', { tender: item })}
                  >
                    <View style={s.rowText}>
                      <Text style={s.rowTitle}>{item.title}</Text>
                      <Text style={s.rowSub}>{item.org || item.organisation || ''}</Text>
                    </View>
                    <View style={[s.pill, days <= 3 ? s.pillRed : s.pillAmber]}>
                      <Text style={[s.pillText, days <= 3 ? s.pillRedText : s.pillAmberText]}>
                        {days <= 0 ? 'Today' : days === 1 ? '1 day' : days + ' days'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {jobs.length > 0 && (
            <View style={s.track}>
              <View style={s.trackCell}>
                <Text style={s.trackNum}>{bidsThisYear}</Text>
                <Text style={s.trackLabel}>BIDS THIS YEAR</Text>
              </View>
              <View style={s.trackCell}>
                <Text style={s.trackNum}>{completed}</Text>
                <Text style={s.trackLabel}>COMPLETED</Text>
              </View>
              <View style={s.trackCell}>
                <Text style={s.trackNum}>{completed * HOURS_PER_BID}h</Text>
                <Text style={s.trackLabel}>SAVED, EST.</Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  avatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.11)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 12.5, fontWeight: '800', color: c.cyan },

  body: { paddingHorizontal: 14, paddingTop: 14, gap: 11 },

  resume: {
    backgroundColor: c.white, borderWidth: 1, borderColor: c.line,
    borderLeftWidth: 3, borderLeftColor: c.cyan, borderRadius: 13, padding: 12, gap: 4,
  },
  resumeKey: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, color: c.teal },
  resumeTitle: { fontSize: 13.5, fontWeight: '700', color: c.navy, lineHeight: 18 },
  resumeMeta: { fontSize: 11, color: c.muted2 },

  none: {
    backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderStyle: 'dashed',
    borderRadius: 16, paddingVertical: 30, paddingHorizontal: 22, alignItems: 'center',
  },
  noneIcon: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: c.bg,
    alignItems: 'center', justifyContent: 'center', marginBottom: 13,
  },
  noneTitle: { fontSize: 15, fontWeight: '800', color: c.navy },
  noneText: { fontSize: 12.5, color: c.muted, textAlign: 'center', marginTop: 7, lineHeight: 19 },

  card: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 },
  cardHeadTitle: { fontSize: 13.5, fontWeight: '800', color: c.navy, letterSpacing: -0.15 },
  cardHeadLink: { fontSize: 12, fontWeight: '700', color: c.teal },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: c.line2 },
  rowFirst: { borderTopWidth: 0, paddingTop: 0 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 12.5, fontWeight: '700', color: c.navy, lineHeight: 17 },
  rowSub: { fontSize: 10.5, color: c.muted2 },

  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  pillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },
  pillRed: { backgroundColor: '#fdeaea' }, pillRedText: { color: '#b4232a' },
  pillAmber: { backgroundColor: '#fdf3e2' }, pillAmberText: { color: '#b7791f' },

  track: { flexDirection: 'row', gap: 8 },
  trackCell: {
    flex: 1, backgroundColor: c.white, borderWidth: 1, borderColor: c.line,
    borderRadius: 13, paddingVertical: 12, alignItems: 'center',
  },
  trackNum: { fontSize: 19, fontWeight: '800', color: c.navy, lineHeight: 22 },
  trackLabel: { fontSize: 8.5, fontWeight: '700', letterSpacing: 0.4, color: c.muted2, marginTop: 4 },
});
