import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { c } from '../theme';

const RING = 118;
const R = 50;
const CIRC = 2 * Math.PI * R;

/**
 * Shows Cana working through the tender's questions.
 *
 * NOTE: this currently simulates progress on a timer so the screen and flow can
 * be built and reviewed. The real version polls the generate-cana-background
 * job and reflects the actual per-answer status. Swap `simulate()` for the
 * job poll when the mobile endpoint is wired up.
 */
export default function GeneratingScreen({ route, navigation }) {
  const tender = (route.params && route.params.tender) || {};
  const questions = (route.params && route.params.questions) || [];
  const [statuses, setStatuses] = useState(questions.map(() => 'queued'));
  const progress = useRef(new Animated.Value(0)).current;

  const done = statuses.filter((x) => x === 'done').length;

  useEffect(() => {
    // simulate() — replace with a poll of the real generation job
    let i = 0;
    const tick = setInterval(() => {
      setStatuses((prev) => {
        const next = [...prev];
        if (i < next.length) {
          if (i > 0) next[i - 1] = 'done';
          next[i] = 'writing';
        } else {
          if (next.length) next[next.length - 1] = 'done';
          clearInterval(tick);
        }
        return next;
      });
      i += 1;
    }, 1400);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: questions.length ? done / questions.length : 0,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    if (questions.length && done === questions.length) {
      const g = setTimeout(() => navigation.replace('BidReady', { tender, questions }), 900);
      return () => clearTimeout(g);
    }
  }, [done]);

  const offset = progress.interpolate({ inputRange: [0, 1], outputRange: [CIRC, 0] });
  const AnimatedCircle = Animated.createAnimatedComponent(Circle);

  return (
    <View style={s.wrap}>
      <View style={s.top}>
        <View style={s.ring}>
          <Svg width={RING} height={RING} style={{ transform: [{ rotate: '-90deg' }] }}>
            <Circle cx={RING / 2} cy={RING / 2} r={R} stroke={c.line} strokeWidth={10} fill="none" />
            <AnimatedCircle
              cx={RING / 2} cy={RING / 2} r={R}
              stroke={c.cyan} strokeWidth={10} fill="none" strokeLinecap="round"
              strokeDasharray={CIRC} strokeDashoffset={offset}
            />
          </Svg>
          <View style={s.ringCentre}>
            <Text style={s.ringNum}>{done}/{questions.length}</Text>
            <Text style={s.ringLabel}>drafted</Text>
          </View>
        </View>
        <View style={s.pill}><Text style={s.pillText}>Using your evidence library</Text></View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
        {questions.map((q, i) => {
          const st = statuses[i];
          return (
            <View key={i} style={s.row}>
              <View style={[s.dot, st === 'done' && s.dotDone, st === 'writing' && s.dotWriting]}>
                <Text style={[s.dotText, st === 'done' && { color: c.good }, st === 'writing' && { color: c.teal }]}>
                  {st === 'done' ? '✓' : st === 'writing' ? '•' : '○'}
                </Text>
              </View>
              <Text style={s.rowText}>{typeof q === 'string' ? q : q.title}</Text>
              <Text style={[s.status, st === 'done' && { color: c.good }, st === 'writing' && { color: c.teal }]}>
                {st === 'done' ? 'Done' : st === 'writing' ? 'Writing' : 'Queued'}
              </Text>
            </View>
          );
        })}
      </ScrollView>

      <TouchableOpacity style={s.ghost} onPress={() => navigation.popToTop()} activeOpacity={0.85}>
        <Text style={s.ghostText}>Carry on in the background</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.white, paddingHorizontal: 16 },
  top: { alignItems: 'center', paddingTop: 18, paddingBottom: 12 },
  ring: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ringCentre: { position: 'absolute', alignItems: 'center' },
  ringNum: { fontSize: 27, fontWeight: '700', color: c.navy },
  ringLabel: { fontSize: 11, color: c.muted2, fontWeight: '600', marginTop: 2 },
  pill: { backgroundColor: c.tealBg, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7, marginTop: 14 },
  pillText: { fontSize: 12, fontWeight: '700', color: c.teal },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line2 },
  dot: { width: 22, height: 22, borderRadius: 11, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: c.goodBg },
  dotWriting: { backgroundColor: c.tealBg },
  dotText: { fontSize: 11, fontWeight: '800', color: c.muted2 },
  rowText: { flex: 1, fontSize: 14, color: c.ink },
  status: { fontSize: 11, fontWeight: '700', color: c.muted2 },
  ghost: { borderWidth: 1, borderColor: c.line, borderRadius: 13, paddingVertical: 15, alignItems: 'center', marginBottom: 16 },
  ghostText: { fontSize: 14, fontWeight: '700', color: c.navy },
});
