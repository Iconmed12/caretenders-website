import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { c } from '../theme';

// Preview snippets stand in until the real generated answers are returned.
const SAMPLE = {
  'Person-centred care': 'Our approach begins at assessment, where we invest time understanding preferences, routines and personal goals rather than clinical needs alone…',
  'Safeguarding': 'All staff complete Level 2 safeguarding adults training before working unsupervised, with annual refreshers and an immediate debrief after any concern…',
};

export default function BidReadyScreen({ route, navigation }) {
  const tender = (route.params && route.params.tender) || {};
  const questions = (route.params && route.params.questions) || [];

  return (
    <View style={s.wrap}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
        <View style={s.okCircle}><Text style={s.okTick}>✓</Text></View>
        <Text style={s.h1}>Your bid is ready</Text>
        <Text style={s.sub}>
          {questions.length
            ? questions.length + ' answers for ' + tender.title
            : tender.title}
        </Text>

        {/* Opened from Ongoing we have the run but not the answer text yet, so
            say so rather than showing an empty page. */}
        {!questions.length && (
          <View style={s.ans}>
            <Text style={s.ansBody}>
              This bid has finished writing. Reading the answers on your phone is coming shortly.
              For now, tap below and we will email you the full document.
            </Text>
          </View>
        )}

        {questions.map((q, i) => {
          const name = typeof q === 'string' ? q : q.title;
          return (
            <View key={i} style={s.ans}>
              <Text style={s.ansTitle}>{name}</Text>
              <Text style={s.ansBody} numberOfLines={3}>
                {SAMPLE[name] || 'Drafted from your evidence library and this tender’s requirements…'}
              </Text>
            </View>
          );
        })}
      </ScrollView>

      <View style={s.footer}>
        {/* The server emails the documents itself as the last step of the run,
            so there is nothing to tap. Say so rather than offering a button
            that would only repeat what already happened. */}
        <View style={s.sent}>
          <Text style={s.sentTitle}>Sent to your inbox</Text>
          <Text style={s.sentBody}>
            The full bid and your Word documents have been emailed to you.
          </Text>
        </View>
        <TouchableOpacity
          style={s.ghost}
          activeOpacity={0.85}
          onPress={() => Linking.openURL('https://caretenders-website.netlify.app/plans.html')}
        >
          <Text style={s.ghostText}>Add Silver Add-on review</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.white },
  okCircle: { width: 58, height: 58, borderRadius: 29, backgroundColor: c.goodBg, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 10 },
  okTick: { fontSize: 26, color: c.good, fontWeight: '800' },
  h1: { fontSize: 21, fontWeight: '700', color: c.navy, textAlign: 'center', marginTop: 12 },
  sub: { fontSize: 13, color: c.muted, textAlign: 'center', marginTop: 5, marginBottom: 18 },
  ans: { borderWidth: 1, borderColor: c.line, borderRadius: 13, padding: 13, marginBottom: 10 },
  ansTitle: { fontSize: 14, fontWeight: '700', color: c.navy },
  ansBody: { fontSize: 12.5, color: c.muted, lineHeight: 19, marginTop: 6 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: c.line2 },
  sent: { backgroundColor: c.goodBg, borderRadius: 13, padding: 14 },
  sentTitle: { fontSize: 14, fontWeight: '700', color: c.good },
  sentBody: { fontSize: 12.5, color: c.ink, marginTop: 4, lineHeight: 18 },
  cta: { backgroundColor: c.cyan, borderRadius: 13, paddingVertical: 16, alignItems: 'center' },
  ctaText: { fontSize: 15, fontWeight: '700', color: '#04303a' },
  ghost: { borderWidth: 1, borderColor: c.line, borderRadius: 13, paddingVertical: 15, alignItems: 'center', marginTop: 10 },
  ghostText: { fontSize: 14, fontWeight: '700', color: c.navy },
});
