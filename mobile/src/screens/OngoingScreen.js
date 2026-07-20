import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, RefreshControl, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { c } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import { useAuth } from '../auth';
import { fetchOngoing, jobState, agoLabel } from '../api';

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
  const email = (session && session.user && session.user.email) || '';

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (isPull) => {
    if (isPull) setRefreshing(true);
    try {
      setJobs(await fetchOngoing(email));
      setError('');
    } catch (e) {
      setError('Could not load your bids. Pull down to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [email]);

  // Refresh every time the tab is opened, so a bid that finished while they
  // were elsewhere shows as ready without them doing anything.
  useFocusEffect(useCallback(() => { load(false); }, [load]));

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
      running: { text: 'Writing', style: s.chipRun, textStyle: s.chipRunText },
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
        {!!item.org && <Text style={s.org}>{item.org}</Text>}

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

  if (loading) {
    return (
      <View style={s.wrap}>
        <ScreenHeader title="Ongoing tenders" subtitle="Everything you have started" />
        <View style={s.centre}><ActivityIndicator color={c.teal} /></View>
      </View>
    );
  }

  return (
    <View style={s.wrap}>
      <ScreenHeader
        title="Ongoing tenders"
        subtitle={running > 0
          ? running + (running === 1 ? ' bid being written' : ' bids being written')
          : 'Everything you have started'}
      />

      <FlatList
        data={jobs}
        keyExtractor={(j) => String(j.id)}
        renderItem={renderItem}
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

  card: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 13, marginTop: 10, gap: 7 },
  title: { fontSize: 14.5, fontWeight: '700', color: c.navy, lineHeight: 19 },
  org: { fontSize: 11.5, color: c.muted2 },

  bar: { height: 5, borderRadius: 3, backgroundColor: c.line, overflow: 'hidden', marginTop: 2 },
  // Indeterminate on purpose: the server records that a run is in progress but
  // not how far through it is, so a precise percentage would be invented.
  barFill: { height: '100%', width: '45%', borderRadius: 3, backgroundColor: c.cyan },

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
