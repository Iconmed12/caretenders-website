import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, RefreshControl,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { c } from '../theme';
import { useAuth } from '../auth';
import { IconDoc } from '../icons';
import { fetchVaultDocs, docDaysLeft, docLabelOf, parseVaultDate } from '../api';

// Matches the warning window the vault reminder emails use.
const WARN_DAYS = 90;

function stateOf(doc) {
  const left = docDaysLeft(doc);
  if (left === null) return { key: 'none', label: 'On file' };
  if (left < 0) return { key: 'gone', label: 'Expired' };
  if (left <= WARN_DAYS) return { key: 'due', label: left + ' days' };
  return { key: 'ok', label: 'Valid' };
}

function metaOf(doc) {
  const expiry = parseVaultDate(doc.expiry_date || doc.review_date);
  if (expiry) {
    const word = doc.expiry_date ? 'Expires ' : 'Review ';
    return word + expiry.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  const added = doc.uploaded_at ? new Date(doc.uploaded_at) : null;
  return added && !isNaN(added.getTime())
    ? 'Added ' + added.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
}

/**
 * The member's real vault, the same documents the website holds. Read only for
 * now: uploading stays on the website, where the reader can extract expiry
 * dates from the file itself.
 */
export default function EvidenceScreen() {
  const { session } = useAuth();
  const userId = (session && session.user && session.user.id) || '';

  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async (isPull) => {
    if (isPull) setRefreshing(true);
    try {
      setDocs(await fetchVaultDocs(userId));
      setError('');
    } catch (e) {
      setError('Could not load your documents. Pull down to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { load(false); }, [load]));

  const visible = docs.filter((d) => {
    if (!q) return true;
    return docLabelOf(d).toLowerCase().includes(q.toLowerCase());
  });

  if (loading) {
    return <View style={[s.wrap, s.centre]}><ActivityIndicator color={c.teal} /></View>;
  }

  return (
    <View style={s.wrap}>
      <TextInput
        style={s.search}
        placeholder="Search your documents"
        placeholderTextColor={c.muted2}
        value={q}
        onChangeText={setQ}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={c.teal} />
        }
      >
        {visible.map((d) => {
          const st = stateOf(d);
          return (
            <View key={String(d.id)} style={s.doc}>
              <View style={s.icon}><IconDoc size={17} color={c.teal} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.docName}>{docLabelOf(d)}</Text>
                <Text style={s.docMeta}>{metaOf(d)}</Text>
              </View>
              <View style={[s.chip, s['chip_' + st.key]]}>
                <Text style={[s.chipText, s['chipText_' + st.key]]}>{st.label}</Text>
              </View>
            </View>
          );
        })}

        {visible.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>
              {error ? 'Could not load' : docs.length ? 'Nothing matches' : 'No documents yet'}
            </Text>
            <Text style={s.emptyText}>
              {error
                || (docs.length
                  ? 'Try a different search.'
                  : 'Upload your policies, insurance and certificates on getcana.co.uk and Cana will use them to answer your tenders.')}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg, paddingHorizontal: 16, paddingTop: 12 },
  centre: { alignItems: 'center', justifyContent: 'center' },
  search: {
    backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: c.ink, marginBottom: 12,
  },
  doc: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.white,
    borderWidth: 1, borderColor: c.line, borderRadius: 13, padding: 13, marginBottom: 9,
  },
  icon: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: c.tealBg,
    alignItems: 'center', justifyContent: 'center',
  },
  docName: { fontSize: 14, fontWeight: '700', color: c.navy },
  docMeta: { fontSize: 11.5, color: c.muted2, marginTop: 2 },

  chip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { fontSize: 10.5, fontWeight: '800' },
  chip_ok: { backgroundColor: c.goodBg }, chipText_ok: { color: c.good },
  chip_due: { backgroundColor: '#fdf3e2' }, chipText_due: { color: '#b7791f' },
  chip_gone: { backgroundColor: '#fdeaea' }, chipText_gone: { color: '#b4232a' },
  chip_none: { backgroundColor: c.line }, chipText_none: { color: c.muted },

  empty: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: c.navy },
  emptyText: { fontSize: 13, color: c.muted, textAlign: 'center', marginTop: 7, lineHeight: 20 },
});
