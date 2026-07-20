import React from 'react';
import { View, Text, ScrollView, TextInput, StyleSheet } from 'react-native';
import { c, t } from '../theme';

// Placeholder list. Wires to the vault documents endpoint next.
const DOCS = [
  { name: 'Safeguarding Policy', meta: 'Updated Mar 2026', state: 'current' },
  { name: 'Training Matrix', meta: 'Updated Jan 2026', state: 'current' },
  { name: 'Insurance Certificate', meta: 'Expires 14 Aug 2026', state: 'due', chip: '25 days' },
  { name: 'Mobilisation Plan', meta: 'Updated Feb 2026', state: 'current' },
  { name: 'CQC Registration', meta: 'Updated Nov 2025', state: 'current' },
];

export default function EvidenceScreen() {
  return (
    <View style={s.wrap}>
      {/* No heading here: it opens from Profile with a header that names it. */}
      <TextInput style={s.search} placeholder="Search your documents" placeholderTextColor={c.muted2} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        {DOCS.map((d) => (
          <View key={d.name} style={s.doc}>
            <View style={s.icon} />
            <View style={{ flex: 1 }}>
              <Text style={s.docName}>{d.name}</Text>
              <Text style={s.docMeta}>{d.meta}</Text>
            </View>
            <View style={[s.chip, d.state === 'due' ? s.chipDue : s.chipOk]}>
              <Text style={[s.chipText, d.state === 'due' ? { color: c.amber } : { color: c.good }]}>
                {d.chip || 'Current'}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg, paddingHorizontal: 16, paddingTop: 8 },
  h1: { ...t.h1, marginBottom: 12 },
  search: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: c.ink, marginBottom: 12 },
  doc: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 13, padding: 13, marginBottom: 9 },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: c.tealBg },
  docName: { fontSize: 14, fontWeight: '700', color: c.navy },
  docMeta: { fontSize: 11.5, color: c.muted2, marginTop: 2 },
  chip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  chipOk: { backgroundColor: c.goodBg },
  chipDue: { backgroundColor: '#fff3e0' },
  chipText: { fontSize: 10.5, fontWeight: '800' },
});
