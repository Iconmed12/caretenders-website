import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { c } from '../theme';
import TopBar from '../components/TopBar';
import TenderCard from '../components/TenderCard';
import { IconFind, IconSliders, IconChevron } from '../icons';
import { useAuth } from '../auth';
import {
  fetchTenders, fetchCompanyProfile, sectorKeyOf, sectorMeta, isNewTender, daysUntil,
} from '../api';

// The profile's own sector label maps to one of our card buckets, so "My
// Department" can filter the list to the member's area.
const PROFILE_TO_KEY = {
  'Care & Support': 'care', 'Healthcare / Clinical': 'care',
  'IT & Digital': 'it', 'Recruitment & Staffing': 'recruitment',
  'Facilities & Maintenance': 'facilities', 'Cleaning': 'facilities',
  'Construction': 'construction',
};

function initialsOf(user) {
  const meta = (user && user.user_metadata) || {};
  const first = meta.first_name || meta.firstName || '';
  const last = meta.last_name || meta.lastName || '';
  if (first) return (first.charAt(0) + (last.charAt(0) || '')).toUpperCase();
  return ((user && user.email) || '?').charAt(0).toUpperCase();
}

export default function OpportunitiesScreen({ navigation, route }) {
  const { session } = useAuth();
  const user = (session && session.user) || {};

  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [chip, setChip] = useState('All');
  const [sort, setSort] = useState('closing'); // closing | new
  const [mySectorKey, setMySectorKey] = useState(null);
  const [sectorFilter, setSectorFilter] = useState((route.params && route.params.sector) || null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchTenders();
      setAll(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Work out the member's own sector once, for the "My Department" filter.
  useEffect(() => {
    let alive = true;
    fetchCompanyProfile(user.id).then((p) => {
      if (!alive) return;
      const key = p && p.sector ? PROFILE_TO_KEY[p.sector] : null;
      setMySectorKey(key || null);
    });
    return () => { alive = false; };
  }, [user.id]);

  // A sector tapped on Home arrives as a route param.
  useEffect(() => {
    if (route.params && route.params.sector) setSectorFilter(route.params.sector);
  }, [route.params]);

  const chips = ['All', 'New', 'Closing Soon'].concat(mySectorKey ? ['My Department'] : []);

  let visible = all.filter((t) => {
    if (sectorFilter && sectorKeyOf(t) !== sectorFilter) return false;
    if (chip === 'New' && !isNewTender(t)) return false;
    if (chip === 'Closing Soon') { const d = daysUntil(t.deadline); if (d === null || d < 0 || d > 14) return false; }
    if (chip === 'My Department' && sectorKeyOf(t) !== mySectorKey) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return String(t.title || '').toLowerCase().includes(s)
      || String(t.org || t.organisation || '').toLowerCase().includes(s)
      || String(t.region || '').toLowerCase().includes(s)
      || String(t.reference || t.ref || '').toLowerCase().includes(s);
  });

  visible = visible.sort((a, b) => {
    if (sort === 'new') {
      return new Date(b.published_date || b.created_at) - new Date(a.published_date || a.created_at);
    }
    const da = daysUntil(a.deadline); const db = daysUntil(b.deadline);
    if (da === null) return 1; if (db === null) return -1;
    return da - db;
  });

  const header = (
    <View style={s.listHead}>
      <Text style={s.count}>{visible.length} {visible.length === 1 ? 'opportunity' : 'opportunities'}</Text>
      <TouchableOpacity
        style={s.sort}
        activeOpacity={0.7}
        onPress={() => setSort((v) => (v === 'closing' ? 'new' : 'closing'))}
      >
        <Text style={s.sortText}>Sort by: {sort === 'closing' ? 'Closing soon' : 'Newest'}</Text>
        <IconChevron size={14} color={c.muted2} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={s.wrap}>
      <TopBar
        title="Opportunities"
        initials={initialsOf(user)}
        onBell={() => navigation.getParent()?.navigate('Ongoing')}
        onAvatar={() => navigation.getParent()?.navigate('Profile')}
      >
        <View style={s.search}>
          <IconFind size={19} color={c.muted2} />
          <TextInput
            style={s.searchInput}
            value={q}
            onChangeText={setQ}
            placeholder="Search tenders, keywords or reference number"
            placeholderTextColor={c.muted2}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <IconSliders size={19} color={c.muted2} />
        </View>
      </TopBar>

      {/* Filters. */}
      <View style={s.chipsWrap}>
        <FlatList
          horizontal
          data={chips}
          keyExtractor={(x) => x}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => setChip(item)} style={[s.chip, chip === item && s.chipOn]} activeOpacity={0.85}>
              <Text style={[s.chipText, chip === item && s.chipTextOn]}>{item}</Text>
            </TouchableOpacity>
          )}
          ListFooterComponent={sectorFilter ? (
            <TouchableOpacity onPress={() => setSectorFilter(null)} style={[s.chip, s.chipSector]} activeOpacity={0.85}>
              <Text style={[s.chipText, s.chipSectorText]}>{sectorMeta(sectorFilter).label}  ✕</Text>
            </TouchableOpacity>
          ) : null}
        />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={c.teal} />
      ) : error ? (
        <View style={s.empty}><Text style={s.emptyText}>{error}</Text></View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item, i) => String(item.id || i)}
          renderItem={({ item }) => (
            <TenderCard tender={item} onPress={() => navigation.navigate('TenderDetail', { tender: item })} />
          )}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.teal} />}
          ListEmptyComponent={<View style={s.empty}><Text style={s.emptyText}>No tenders match that filter.</Text></View>}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4, marginTop: 16 },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 13.5, color: c.ink },
  chipsWrap: { paddingVertical: 12, backgroundColor: c.bg },
  chip: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 999, paddingHorizontal: 15, paddingVertical: 9 },
  chipOn: { backgroundColor: c.teal, borderColor: c.teal },
  chipText: { fontSize: 12.5, fontWeight: '700', color: c.muted },
  chipTextOn: { color: '#fff' },
  chipSector: { backgroundColor: c.navy, borderColor: c.navy, marginLeft: 8 },
  chipSectorText: { color: '#fff' },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 2 },
  count: { fontSize: 14, fontWeight: '800', color: c.navy },
  sort: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sortText: { fontSize: 12.5, color: c.muted, fontWeight: '600' },
  empty: { padding: 30, alignItems: 'center' },
  emptyText: { fontSize: 13, color: c.muted, textAlign: 'center' },
});
