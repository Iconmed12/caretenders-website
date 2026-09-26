import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, RefreshControl, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { c } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import { useAuth } from '../auth';
import { fetchOngoing, jobState, jobStageLabel, agoLabel, orderRef } from '../api';

/**
 * Everything this member has started, so a bid is never started twice and a
 * long run can be walked away from.
 *
 * The writing runs on the server, so this screen is only ever reading. It
 * refreshes on focus, which is what makes "carry on in the background" honest:
 * come back to this tab and the state is current.
 */
export default function OngoingScreen({ navigation }) {
  const { session } = useAuth();
  const token = (session && session.access_token) || '';

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (isPull) => {
    if (isPull) setRefreshing(true);
    try {
      setJobs(await fetchOngoing(token));
      setError('');
    } catch (e) {
      setError('Could not load your bids. Pull down to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  // Refresh on open, then keep it live: while the tab is focused, poll so a bid
  // being written updates its stage and flips to ready on its own.
  useFocusEffect(useCallback(() => {
    load(false);
    const id = setInterval(() => load(false), 10000);
    return () => clearInterval(id);
  }, [load]));

  function openJob(job) {
    const state = jobState(job);
    if (state === 'ready') {
      navigation.navigate('Find', {
        screen: 'BidReady',
        params: { tender: { id: job.tender_id, title: job.tender_title, org: job.org } },
      });
    }
  }

  function renderItem({ item }) {
    const state = jobState(item);
    const chip = {
      running: { text: jobStageLabel(item), style: s.chipRun, textStyle: s.chipRunText },
      queued: { text: 'Queued', style: s.chipWait, textStyle: s.chipWaitText },
      ready: { text: 'Ready', style: s.chipDone, textStyle: s.chipDoneText },
      failed: { text: 'Did not finish', style: s.chipFail, textStyle: s.chipFailText },
    }[state];

    const when = state === 'ready'
      ? 'Finished ' + agoLabel(item.completed_at || item.created_at)
      : state === 'failed'
        ? agoLabel(item.created_at)
        : 'Started ' + agoLabel(item.created_at);

    return (
      <TouchableOpacity
        style={s.card}
        activeOpacity={state === 'ready' ? 0.8 : 1}
        onPress={() => openJob(item)}
      >
        <Text style={s.title}>{item.tender_title}</Text>
        <Text style={s.ref}>{orderRef(item)}{item.org ? '  ·  ' + item.org : ''}</Text>

        {state === 'running' && (
          <View style={s.bar}><View style={s.barFill} /></View>
        )}

        <View style={s.row}>
          <View style={[s.chip, chip.style]}>
            <Text style={[s.chipText, chip.textStyle]}>{chip.text}</Text>
          </View>
          <Text style={s.when}>{when}</Text>
        </View>

        {state === 'ready' && <Text style={s.link}>View your bid</Text>}
        {state === 'failed' && (
          <Text style={s.failNote}>Something went wrong. Open the tender to start it again.</Text>
        )}
      </TouchableOpacity>
    );
  }

  const running = jobs.filter((j) => ['running', 'queued'].includes(jobState(j))).length;
  const ready = jobs.filter((j) => jobState(j) === 'ready').length;

  const stats = jobs.length > 0 ? (
    <View style={s.stats}>
      <View style={s.statCell}>
        <Text style={s.statNum}>{running}</Text>
        <Text style={s.statLabel}>Being written</Text>
      </View>
      <View style={s.statCell}>
        <Text style={s.statNum}>{ready}</Text>
        <Text style={s.statLabel}>Ready</Text>
      </View>
      <View style={s.statCell}>
        <Text style={s.statNum}>{jobs.length}</Text>
        <Text style={s.statLabel}>Total</Text>
      </View>
    </View>
  ) : null;

  if (loading) {
    return (
      <View style={s.wrap}>
        <ScreenHeader title="My bids" subtitle="Everything you have started" />
        <View style={s.centre}><ActivityIndicator color={c.teal} /></View>
      </View>
    );
  }

  return (
    <View style={s.wrap}>
      <ScreenHeader
        title="My bids"
        subtitle={running > 0
          ? running + (running === 1 ? ' bid being written' : ' bids being written')
          : 'Everything you have started'}
      />

      <FlatList
        data={jobs}
        keyExtractor={(j) => String(j.id)}
        renderItem={renderItem}
        ListHeaderComponent={stats}
        contentContainerStyle={{ padding: 13, paddingTop: 4, paddingBottom: 24, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={c.teal} />
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyTitle}>{error ? 'Could not load' : 'Nothing started yet'}</Text>
            <Text style={s.emptyText}>
              {error || 'Find a tender you want to bid for and tap Generate responses. It will appear here while it is being written.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  stats: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 2 },
  statCell: { flex: 1, backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 13, paddingVertical: 13, alignItems: 'center' },
  statNum: { fontSize: 21, fontWeight: '800', color: c.navy, lineHeight: 24 },
  statLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3, color: c.muted2, marginTop: 4 },

  card: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 13, marginTop: 10, gap: 7 },
  title: { fontSize: 14.5, fontWeight: '700', color: c.navy, lineHeight: 19 },
  ref: { fontSize: 11, color: c.muted2, fontWeight: '600', letterSpacing: 0.2 },

  bar: { height: 5, borderRadius: 3, backgroundColor: c.line, overflow: 'hidden', marginTop: 2 },
  // Indeterminate on purpose: the server records that a run is in progress but
  // not how far through it is, so a precise percentage would be invented.
  barFill: { height: '100%', width: '45%', borderRadius: 3, backgroundColor: c.brand },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.3 },
  chipRun: { backgroundColor: c.tealBg }, chipRunText: { color: c.teal },
  chipWait: { backgroundColor: '#fdf3e2' }, chipWaitText: { color: '#b7791f' },
  chipDone: { backgroundColor: c.goodBg }, chipDoneText: { color: c.good },
  chipFail: { backgroundColor: '#fdeaea' }, chipFailText: { color: '#b4232a' },
  when: { fontSize: 11, color: c.muted2 },

  link: { fontSize: 12.5, fontWeight: '700', color: c.teal },
  failNote: { fontSize: 11.5, color: c.muted, lineHeight: 17 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, paddingBottom: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: c.navy },
  emptyText: { fontSize: 13, color: c.muted, textAlign: 'center', marginTop: 7, lineHeight: 20 },
});
