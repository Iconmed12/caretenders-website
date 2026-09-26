import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { c } from '../theme';
import { useAuth } from '../auth';
import { startGeneration, fetchJobStatus, jobState, jobStageLabel } from '../api';

const RING = 118;
const R = 50;
const CIRC = 2 * Math.PI * R;

// How far round the ring each stage sits. Real generation does not report a
// per-answer percentage, so the ring reflects the stage the server is at.
const STAGE_PROGRESS = {
  pending: 0.12, queued: 0.12, processing: 0.3,
  generating_responses: 0.6, completing_sq: 0.75,
  building_documents: 0.88, sending_email: 0.96,
};

/**
 * Runs a REAL generation: starts the job on the server, then polls its status.
 * The server writes and emails the finished bid, so this screen reflects the
 * live job and hands off to Bid ready when it is done. Leaving is safe: the run
 * lives on the server.
 */
export default function GeneratingScreen({ route, navigation }) {
  const tender = (route.params && route.params.tender) || {};
  const { session } = useAuth();
  const user = (session && session.user) || {};
  const token = (session && session.access_token) || '';

  const [phase, setPhase] = useState('starting'); // starting | writing | failed
  const [status, setStatus] = useState('pending');
  const [errorMsg, setErrorMsg] = useState('');
  const progress = useRef(new Animated.Value(0.08)).current;
  const jobRef = useRef(null);
  const timerRef = useRef(null);

  // Start the job once, then poll.
  useEffect(() => {
    let alive = true;

    async function begin() {
      try {
        const { jobId } = await startGeneration(tender, user, token);
        if (!alive) return;
        jobRef.current = jobId;
        setPhase('writing');
        poll();
      } catch (e) {
        if (!alive) return;
        setPhase('failed');
        setErrorMsg(e.message || 'Could not start generation.');
      }
    }

    async function poll() {
      if (!alive || !jobRef.current) return;
      const st = await fetchJobStatus(jobRef.current);
      if (!alive) return;
      setStatus(st);
      const state = jobState({ status: st });
      if (state === 'ready') {
        navigation.replace('BidReady', { tender });
        return;
      }
      if (state === 'failed') {
        setPhase('failed');
        setErrorMsg('The bid could not be completed. Please try again, or contact us.');
        return;
      }
      timerRef.current = setTimeout(poll, 5000);
    }

    begin();
    return () => { alive = false; if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  // Move the ring to the current stage.
  useEffect(() => {
    const target = phase === 'writing' ? (STAGE_PROGRESS[String(status).toLowerCase()] || 0.5) : 0.08;
    Animated.timing(progress, { toValue: target, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [status, phase]);

  const offset = progress.interpolate({ inputRange: [0, 1], outputRange: [CIRC, 0] });
  const AnimatedCircle = Animated.createAnimatedComponent(Circle);
  const stage = jobStageLabel({ status });

  if (phase === 'failed') {
    return (
      <View style={[s.wrap, s.centre]}>
        <View style={s.errCircle}><Text style={s.errMark}>!</Text></View>
        <Text style={s.errTitle}>Could not generate</Text>
        <Text style={s.errText}>{errorMsg}</Text>
        <TouchableOpacity style={s.retry} activeOpacity={0.85} onPress={() => navigation.goBack()}>
          <Text style={s.retryText}>Back to tender</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
            <Text style={s.ringNum}>{phase === 'starting' ? '…' : ''}</Text>
            <Text style={s.ringLabel}>{phase === 'starting' ? 'starting' : 'writing'}</Text>
          </View>
        </View>
        <View style={s.pill}><Text style={s.pillText}>{phase === 'starting' ? 'Starting your bid' : stage}</Text></View>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>{tender.title}</Text>
        <Text style={s.cardBody}>
          Cana is writing your responses from your company profile and evidence, tailored to this tender.
        </Text>
      </View>

      <View style={s.footer}>
        <TouchableOpacity
          style={s.ghost}
          onPress={() => navigation.getParent()?.navigate('Ongoing')}
          activeOpacity={0.85}
        >
          <Text style={s.ghostText}>Carry on in the background</Text>
        </TouchableOpacity>
        <Text style={s.footNote}>
          You can close the app. We keep writing on our servers, email you the finished bid,
          and it will be waiting under Ongoing.
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.white, paddingHorizontal: 16 },
  centre: { alignItems: 'center', justifyContent: 'center' },
  top: { alignItems: 'center', paddingTop: 26, paddingBottom: 12 },
  ring: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ringCentre: { position: 'absolute', alignItems: 'center' },
  ringNum: { fontSize: 27, fontWeight: '700', color: c.navy },
  ringLabel: { fontSize: 11, color: c.muted2, fontWeight: '600', marginTop: 2 },
  pill: { backgroundColor: c.tealBg, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7, marginTop: 14 },
  pillText: { fontSize: 12, fontWeight: '700', color: c.teal },
  card: { backgroundColor: c.bg, borderRadius: 14, padding: 16, marginTop: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: c.navy, lineHeight: 20 },
  cardBody: { fontSize: 13, color: c.muted, lineHeight: 19, marginTop: 8 },
  footer: { marginTop: 'auto', paddingBottom: 16 },
  ghost: { borderWidth: 1, borderColor: c.line, borderRadius: 13, paddingVertical: 15, alignItems: 'center' },
  ghostText: { fontSize: 14, fontWeight: '700', color: c.navy },
  footNote: { fontSize: 11.5, color: c.muted2, textAlign: 'center', marginTop: 9, lineHeight: 17 },
  errCircle: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fdeaea', alignItems: 'center', justifyContent: 'center' },
  errMark: { fontSize: 28, fontWeight: '800', color: '#b4232a' },
  errTitle: { fontSize: 18, fontWeight: '800', color: c.navy, marginTop: 14 },
  errText: { fontSize: 13, color: c.muted, textAlign: 'center', marginTop: 8, lineHeight: 19, paddingHorizontal: 20 },
  retry: { backgroundColor: c.cyan, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 26, marginTop: 20 },
  retryText: { fontSize: 14, fontWeight: '800', color: '#04303a' },
});
