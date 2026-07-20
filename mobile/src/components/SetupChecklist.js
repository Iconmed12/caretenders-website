import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { c } from '../theme';

/**
 * The one card that is more useful the emptier the account is, which is exactly
 * when the home screen has least to show.
 *
 * Every step is real state, not a tour: having an account, having documents in
 * the vault, having a company profile. Once all three are true the card is gone
 * for good.
 */
export default function SetupChecklist({ hasDocs, hasProfile, onAddEvidence, onOpenProfile }) {
  const steps = [
    { key: 'account', title: 'Create your account', sub: 'Done', done: true },
    {
      key: 'evidence',
      title: 'Add your evidence',
      sub: 'Policies, insurance, certificates',
      done: hasDocs,
      action: 'Add',
      onPress: onAddEvidence,
    },
    {
      key: 'profile',
      title: 'Complete your company profile',
      sub: 'Used in every bid',
      done: hasProfile,
      action: 'Open',
      onPress: onOpenProfile,
    },
  ];

  const done = steps.filter((x) => x.done).length;
  if (done === steps.length) return null;

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Text style={s.title}>Finish setting up</Text>
        <Text style={s.count}>{done} of {steps.length}</Text>
      </View>

      <View style={s.prog}>
        <View style={[s.progFill, { width: Math.round((done / steps.length) * 100) + '%' }]} />
      </View>

      {steps.map((step, i) => (
        <View key={step.key} style={s.step}>
          <View style={[s.tick, step.done ? s.tickDone : s.tickTodo]}>
            <Text style={[s.tickText, step.done ? s.tickTextDone : s.tickTextTodo]}>
              {step.done ? '✓' : String(i + 1)}
            </Text>
          </View>
          <View style={s.stepText}>
            <Text style={[s.stepTitle, step.done && s.stepTitleDone]}>{step.title}</Text>
            <Text style={s.stepSub}>{step.sub}</Text>
          </View>
          {!step.done && !!step.action && (
            <TouchableOpacity onPress={step.onPress} activeOpacity={0.7}>
              <Text style={s.action}>{step.action}</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  title: { fontSize: 13.5, fontWeight: '800', color: c.navy, letterSpacing: -0.15 },
  count: { fontSize: 11, fontWeight: '800', color: c.teal },

  prog: { height: 5, backgroundColor: c.line, borderRadius: 3, overflow: 'hidden', marginBottom: 12 },
  progFill: { height: '100%', backgroundColor: c.cyan, borderRadius: 3 },

  step: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 7 },
  tick: { width: 21, height: 21, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  tickDone: { backgroundColor: c.goodBg },
  tickTodo: { backgroundColor: c.line },
  tickText: { fontSize: 10.5, fontWeight: '800' },
  tickTextDone: { color: c.good },
  tickTextTodo: { color: c.muted2 },
  stepText: { flex: 1, gap: 1 },
  stepTitle: { fontSize: 12.5, fontWeight: '700', color: c.navy },
  stepTitleDone: { color: c.muted2, textDecorationLine: 'line-through' },
  stepSub: { fontSize: 10, color: c.muted2 },
  action: { fontSize: 11, fontWeight: '800', color: c.teal },
});
