import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { c } from '../theme';
import TopBar from '../components/TopBar';
import TenderCard from '../components/TenderCard';
import {
  IconFind, IconSliders, IconChevron, IconDoc, IconSpark,
  IconHeart, IconBuilding, IconTeam, IconHardhat, IconLaptop,
} from '../icons';
import { useAuth } from '../auth';
import {
  fetchTenders, fetchOngoing, jobState, agoLabel, daysUntil, SECTORS,
} from '../api';

const SECTOR_ICON = { care: IconHeart, facilities: IconBuilding, recruitment: IconTeam, construction: IconHardhat, it: IconLaptop };
const HOME_SECTORS = SECTORS.filter((x) => x.key !== 'other');

function initialsOf(user) {
  const meta = (user && user.user_metadata) || {};
  const first = meta.first_name || meta.firstName || '';
  const last = meta.last_name || meta.lastName || '';
  if (first) return (first.charAt(0) + (last.charAt(0) || '')).toUpperCase();
  return ((user && user.email) || '?').charAt(0).toUpperCase();
}

export default function HomeScreen({ navigation }) {
  const { session } = useAuth();
  const user = (session && session.user) || {};
  const token = (session && session.access_token) || '';

  const [tenders, setTenders] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (isPull) => {
    if (isPull) setRefreshing(true);
    const [tRes, jRes] = await Promise.allSettled([fetchTenders(), fetchOngoing(token)]);
    setTenders(tRes.status === 'fulfilled' ? tRes.value : []);
    setJobs(jRes.status === 'fulfilled' ? jRes.value : []);
    setError(tRes.status === 'rejected' ? 'Could not load tenders. Pull down to try again.' : '');
    setLoading(false);
    setRefreshing(false);
  }, [token]);

  useFocusEffect(useCallback(() => { load(false); }, [load]));

  // Soonest to close first, so the home list leads with what needs attention.
  const latest = tenders
    .slice()
    .sort((a, b) => {
      const da = daysUntil(a.deadline); const db = daysUntil(b.deadline);
      if (da === null) return 1; if (db === null) return -1;
      return da - db;
    })
    .slice(0, 3);

  const running = jobs.filter((j) => ['running', 'queued'].includes(jobState(j)));
  const recent = jobs.slice(0, 2);

  const openTab = (name, params) => navigation.getParent()?.navigate(name, params);
  const openFind = (sector) => openTab('Find', { screen: 'Opportunities', params: sector ? { sector } : undefined });

  return (
    <View style={s.wrap}>
      <TopBar
        brand
        subtitle="Your procurement team, in your pocket"
        initials={initialsOf(user)}
        alert={running.length > 0}
        onBell={() => openTab('Ongoing')}
        onAvatar={() => openTab('Profile')}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 26 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={c.teal} />}
      >
        {/* Search opens the full list. */}
        <TouchableOpacity style={s.search} activeOpacity={0.8} onPress={() => openFind()}>
          <IconFind size={19} color={c.muted2} />
          <Text style={s.searchText}>Search tenders, keywords or reference number</Text>
          <IconSliders size={19} color={c.muted2} />
        </TouchableOpacity>

        {/* Sector tiles. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.sectorRow}>
          {HOME_SECTORS.map((sec) => {
            const Icon = SECTOR_ICON[sec.key] || IconDoc;
            return (
              <TouchableOpacity key={sec.key} style={s.sectorTile} activeOpacity={0.85} onPress={() => openFind(sec.key)}>
                <View style={[s.sectorIcon, { backgroundColor: sec.bg }]}><Icon size={22} color={sec.color} /></View>
                <Text style={s.sectorLabel} numberOfLines={2}>{sec.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Latest tender opportunities</Text>
          <TouchableOpacity onPress={() => openFind()} activeOpacity={0.7} style={s.viewAll}>
            <Text style={s.viewAllText}>View all</Text>
            <IconChevron size={15} color={c.navy} />
          </TouchableOpacity>
        </View>

        <View style={s.pad}>
          {loading ? (
            <ActivityIndicator color={c.teal} style={{ marginTop: 20 }} />
          ) : latest.length === 0 ? (
            <View style={s.none}>
              <Text style={s.noneTitle}>{error ? 'Could not load' : 'Nothing open right now'}</Text>
              <Text style={s.noneText}>{error || 'We check for new public sector contracts every day.'}</Text>
            </View>
          ) : (
            latest.map((t) => (
              <TenderCard key={String(t.id)} tender={t} onPress={() => navigation.navigate('TenderDetail', { tender: t })} />
            ))
          )}
        </View>

        {/* Two actions. */}
        <View style={[s.pad, s.tiles]}>
          <TouchableOpacity style={[s.tile, s.tileDark]} activeOpacity={0.9} onPress={() => openTab('Profile', { screen: 'Sat' })}>
            <View style={s.tileIconDark}><IconDoc size={19} color={c.cyan} /></View>
            <Text style={s.tileTitleDark}>Send a Tender (S.A.T)</Text>
            <Text style={s.tileBodyDark}>Found a tender elsewhere? Paste the link and we will add it for you.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[s.tile, s.tileTeal]} activeOpacity={0.9} onPress={() => openFind()}>
            <View style={s.tileIconTeal}><IconSpark size={19} color={c.navy} /></View>
            <Text style={s.tileTitleTeal}>Generate a Response</Text>
            <Text style={s.tileBodyTeal}>Open a tender and let Cana generate your full response and documents.</Text>
          </TouchableOpacity>
        </View>

        {recent.length > 0 && (
          <>
            <View style={s.section}>
              <Text style={s.sectionTitle}>Your recent activity</Text>
              <TouchableOpacity onPress={() => openTab('Ongoing')} activeOpacity={0.7} style={s.viewAll}>
                <Text style={s.viewAllText}>View all</Text>
                <IconChevron size={15} color={c.navy} />
              </TouchableOpacity>
            </View>
            <View style={s.pad}>
              {recent.map((j) => {
                const st = jobState(j);
                const when = st === 'ready' ? 'Generated ' + agoLabel(j.completed_at || j.created_at)
                  : st === 'failed' ? 'Did not finish' : 'Started ' + agoLabel(j.created_at);
                return (
                  <TouchableOpacity
                    key={String(j.id)}
                    style={s.actRow}
                    activeOpacity={0.8}
                    onPress={() => openTab('Ongoing')}
                  >
                    <View style={s.actIcon}><IconDoc size={17} color={c.navy} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.actTitle} numberOfLines={1}>{j.tender_title}</Text>
                      <Text style={s.actWhen}>{when}</Text>
                    </View>
                    <IconChevron size={16} color={c.muted2} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  pad: { paddingHorizontal: 16 },

  search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, marginHorizontal: 16, marginTop: 14 },
  searchText: { flex: 1, fontSize: 13.5, color: c.muted2 },

  sectorRow: { paddingHorizontal: 16, paddingVertical: 16, gap: 10 },
  sectorTile: { width: 92, backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 8, alignItems: 'center', gap: 8 },
  sectorIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sectorLabel: { fontSize: 11, fontWeight: '700', color: c.navy, textAlign: 'center', lineHeight: 14 },

  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 6, marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: c.navy, letterSpacing: -0.3 },
  viewAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewAllText: { fontSize: 13, fontWeight: '700', color: c.navy },

  none: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderStyle: 'dashed', borderRadius: 16, paddingVertical: 26, paddingHorizontal: 20, alignItems: 'center' },
  noneTitle: { fontSize: 15, fontWeight: '800', color: c.navy },
  noneText: { fontSize: 12.5, color: c.muted, textAlign: 'center', marginTop: 6, lineHeight: 18 },

  tiles: { flexDirection: 'row', gap: 12, marginTop: 6 },
  tile: { flex: 1, borderRadius: 16, padding: 15, minHeight: 150, justifyContent: 'flex-start' },
  tileDark: { backgroundColor: '#0e2033' },
  tileTeal: { backgroundColor: c.tealBg },
  tileIconDark: { width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  tileIconTeal: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#d3eef3', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  tileTitleDark: { fontSize: 14.5, fontWeight: '800', color: '#fff' },
  tileBodyDark: { fontSize: 11.5, color: '#8fa7b8', marginTop: 5, lineHeight: 16 },
  tileTitleTeal: { fontSize: 14.5, fontWeight: '800', color: c.navy },
  tileBodyTeal: { fontSize: 11.5, color: c.muted, marginTop: 5, lineHeight: 16 },

  actRow: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 13, padding: 12, marginBottom: 10 },
  actIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: c.tealBg, alignItems: 'center', justifyContent: 'center' },
  actTitle: { fontSize: 13.5, fontWeight: '700', color: c.navy },
  actWhen: { fontSize: 11.5, color: c.muted, marginTop: 2, fontWeight: '600' },
});
