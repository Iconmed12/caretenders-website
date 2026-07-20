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
  fetchTenders, fetchOngoing, fetchVaultDocs, jobState, agoLabel,
  daysUntil, docDaysLeft, docLabelOf, parseVaultDate,
} from '../api';

// Anything closing inside a week is worth flagging: too little time to write a
// bid comfortably, still enough to be worth trying.
const SOON_DAYS = 7;

// Matches the vault expiry reminder emails, which warn well ahead so there is
// time to actually renew a certificate.
const EXPIRY_WARN_DAYS = 90;

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
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (isPull) => {
    if (isPull) setRefreshing(true);
    // The three feeds are independent, so one failing should not blank the others.
    const [tRes, jRes, dRes] = await Promise.allSettled([
      fetchTenders(),
      fetchOngoing(user.email),
      fetchVaultDocs(user.id),
    ]);
    setTenders(tRes.status === 'fulfilled' ? tRes.value : []);
    setJobs(jRes.status === 'fulfilled' ? jRes.value : []);
    setDocs(dRes.status === 'fulfilled' ? dRes.value : []);
    setError(tRes.status === 'rejected' ? 'Could not load tenders. Pull down to try again.' : '');
    setLoading(false);
    setRefreshing(false);
  }, [user.email, user.id]);

  useFocusEffect(useCallback(() => { load(false); }, [load]));

  const closingSoon = tenders
    .filter((t) => {
      const d = daysUntil(t.deadline);
      return d !== null && d >= 0 && d <= SOON_DAYS;
    })
    .sort((a, b) => daysUntil(a.deadline) - daysUntil(b.deadline));

  const running = jobs.filter((j) => {
    const st = jobState(j);
    return st === 'running' || st === 'queued';
  });

  // Anything already expired or inside the warning window, soonest first.
  const expiring = docs
    .filter((d) => {
      const left = docDaysLeft(d);
      return left !== null && left <= EXPIRY_WARN_DAYS;
    })
    .sort((a, b) => docDaysLeft(a) - docDaysLeft(b));
  const inDate = docs.length - expiring.length;

  const thisYear = new Date().getFullYear();
  const bidsThisYear = jobs.filter((j) => new Date(j.created_at).getFullYear() === thisYear).length;
  const completed = jobs.filter((j) => jobState(j) === 'ready').length;

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

          {/* Closing this week. Deadline pressure, not browsing: Find is where
              you browse. Hidden entirely when nothing is close. */}
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

          {/* Evidence check. Real documents from the same vault as the website. */}
          {docs.length > 0 && (
            <View style={s.card}>
              <View style={s.cardHead}>
                <Text style={s.cardHeadTitle}>Evidence check</Text>
                <TouchableOpacity
                  onPress={() => navigation.getParent()?.navigate('Profile', { screen: 'Evidence' })}
                  activeOpacity={0.7}
                >
                  <Text style={s.cardHeadLink}>Open</Text>
                </TouchableOpacity>
              </View>

              {expiring.slice(0, 2).map((d, i) => {
                const left = docDaysLeft(d);
                const gone = left !== null && left < 0;
                return (
                  <View key={String(d.id)} style={[s.row, i === 0 && s.rowFirst]}>
                    <View style={s.rowText}>
                      <Text style={s.rowTitle}>{docLabelOf(d)}</Text>
                      <Text style={s.rowSub}>
                        {gone ? 'Expired' : 'Expires ' + parseVaultDate(d.expiry_date || d.review_date)
                          .toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
                      </Text>
                    </View>
                    <View style={[s.pill, gone || left <= 30 ? s.pillRed : s.pillAmber]}>
                      <Text style={[s.pillText, gone || left <= 30 ? s.pillRedText : s.pillAmberText]}>
                        {gone ? 'Expired' : left + ' days'}
                      </Text>
                    </View>
                  </View>
                );
              })}

              {inDate > 0 && (
                <View style={[s.row, expiring.length === 0 && s.rowFirst]}>
                  <View style={s.rowText}>
                    <Text style={s.rowTitle}>
                      {inDate} {inDate === 1 ? 'document' : 'documents'}
                    </Text>
                    <Text style={s.rowSub}>Nothing expiring soon</Text>
                  </View>
                  <View style={[s.pill, s.pillGood]}>
                    <Text style={[s.pillText, s.pillGoodText]}>Ready</Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Your track record, counted from bids already recorded. */}
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

          {!!error && <Text style={s.error}>{error}</Text>}
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

  card: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 13, padding: 13 },
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
  pillGood: { backgroundColor: c.goodBg }, pillGoodText: { color: c.good },

  track: { flexDirection: 'row', gap: 8 },
  trackCell: {
    flex: 1, backgroundColor: c.white, borderWidth: 1, borderColor: c.line,
    borderRadius: 13, paddingVertical: 12, alignItems: 'center',
  },
  trackNum: { fontSize: 19, fontWeight: '800', color: c.navy, lineHeight: 22 },
  trackLabel: { fontSize: 8.5, fontWeight: '700', letterSpacing: 0.4, color: c.muted2, marginTop: 4 },

  error: { fontSize: 13, color: c.muted, lineHeight: 20, paddingVertical: 14 },
});
