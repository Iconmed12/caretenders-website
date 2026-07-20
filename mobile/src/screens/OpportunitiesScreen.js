import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { c, t } from '../theme';
import { fetchTenders, closingLabel, valueLabel } from '../api';

const FILTERS = ['All', 'Domiciliary care', 'Supported living', 'Residential', 'Nursing', 'Mental health'];

export default function OpportunitiesScreen({ navigation }) {
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('All');

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

  const visible = all.filter((x) => {
    if (filter !== 'All' && String(x.category || '').toLowerCase() !== filter.toLowerCase()) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return String(x.title || '').toLowerCase().includes(s)
      || String(x.org || '').toLowerCase().includes(s)
      || String(x.region || '').toLowerCase().includes(s);
  });

  const renderCard = ({ item }) => (
    <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={() => navigation.navigate('TenderDetail', { tender: item })}>
      <Text style={s.cardTitle}>{item.title}</Text>
      <Text style={s.cardOrg}>{item.org || item.organisation || ''}</Text>
      {!!item.category && (
        <View style={s.tagRow}><View style={s.tag}><Text style={s.tagText}>{item.category}</Text></View></View>
      )}
      <View style={s.cardFoot}>
        <Text style={s.value}>{valueLabel(item)}</Text>
        <Text style={s.closing}>{closingLabel(item)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={s.wrap}>
      {/* Opens from Home with a header that names it, so no heading here and
          the header already clears the notch. */}
      <TextInput
        style={s.search}
        placeholder="Search care tenders"
        placeholderTextColor={c.muted2}
        value={q}
        onChangeText={setQ}
      />

      <View style={s.chips}>
        {FILTERS.map((f) => (
          <TouchableOpacity key={f} onPress={() => setFilter(f)} style={[s.chip, filter === f && s.chipOn]}>
            <Text style={[s.chipText, filter === f && s.chipTextOn]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={c.teal} />
      ) : error ? (
        <View style={s.empty}><Text style={s.emptyText}>{error}</Text></View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item, i) => String(item.id || i)}
          renderItem={renderCard}
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.teal} />}
          ListEmptyComponent={<View style={s.empty}><Text style={s.emptyText}>No care tenders match that search.</Text></View>}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg, paddingHorizontal: 16, paddingTop: 12 },
  h1: { ...t.h1, marginBottom: 12 },
  search: {
    backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: c.ink, marginBottom: 10,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 },
  chip: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { backgroundColor: c.navy, borderColor: c.navy },
  chipText: { fontSize: 12, fontWeight: '600', color: c.muted },
  chipTextOn: { color: c.white },
  card: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 14, marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: c.navy, lineHeight: 20 },
  cardOrg: { fontSize: 12, color: c.muted2, marginTop: 3 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 },
  tag: { backgroundColor: c.tealBg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  tagText: { fontSize: 11, fontWeight: '600', color: c.teal },
  cardFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 11, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.line2 },
  value: { fontSize: 16, fontWeight: '700', color: c.navy },
  closing: { fontSize: 11, fontWeight: '700', color: c.amber },
  empty: { padding: 30, alignItems: 'center' },
  emptyText: { ...t.small, textAlign: 'center' },
});
