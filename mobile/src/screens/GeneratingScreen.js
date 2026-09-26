import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { c } from '../theme';
import { useAuth } from '../auth';
import { startGeneration, fetchJobStatus, jobState, fetchOngoing, orderRef } from '../api';
import TopBar from '../components/TopBar';
import TenderCard from '../components/TenderCard';
import LogoMark from '../components/LogoMark';
import { IconMail, IconDoc, IconBars, IconFolder } from '../icons';

const STEPS = [
  { title: 'Tender documents analysed', body: "We've reviewed all documents and requirements." },
  { title: 'Questions identified', body: "We've pulled out all questions and evaluation criteria." },
  { title: 'Company profile applied', body: 'Your company information and past experience has been applied.' },
  { title: 'Generating responses', body: "We're drafting your response and compiling your tender pack." },
];

const RECEIVE = [
  { icon: IconDoc, title: 'Completed response', body: 'A fully drafted response to all questions.' },
  { icon: IconDoc, title: 'ITT and specification', body: 'The original tender documents for your records.' },
  { icon: IconDoc, title: 'PSQ / SQ documents', body: 'Completed pre-qualification or selection questionnaires.' },
  { icon: IconBars, title: 'Pricing schedule', body: 'A completed pricing schedule (where required).' },
  { icon: IconFolder, title: 'Supporting tender documents', body: 'All supporting documents and appendices.' },
];

function initialsOf(user) {
  const meta = (user && user.user_metadata) || {};
  const first = meta.first_name || meta.firstName || '';
  const last = meta.last_name || meta.lastName || '';
  if (first) return (first.charAt(0) + (last.charAt(0) || '')).toUpperCase();
  return ((user && user.email) || '?').charAt(0).toUpperCase();
}

// Which step is currently running (steps before it are done).
function activeStepFor(phase, status) {
  if (phase === 'starting') return 0;
  const st = String(status).toLowerCase();
  if (st === 'pending' || st === 'queued') return 0;
  if (st === 'processing') return 1;
  return 3;
}

export default function GeneratingScreen({ route, navigation }) {
  const tender = (route.params && route.params.tender) || {};
  const { session } = useAuth();
  const user = (session && session.user) || {};
  const token = (session && session.access_token) || '';

  const [phase, setPhase] = useState('starting'); // starting | writing | failed
  const [status, setStatus] = useState('pending');
  const [ref, setRef] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const jobRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    let alive = true;

    async function begin() {
      try {
        // If this tender is already being generated, attach to that job rather
        // than starting a second one. This is what makes leaving and coming back
        // safe: no duplicate, no "start again". This check is best-effort: if the
        // history lookup fails, we simply carry on and start the job.
        let mine = [];
        try {
          mine = (await fetchOngoing(token)).filter(
            (j) => j.tender_id === tender.id && ['running', 'queued'].includes(jobState(j))
          );
        } catch (lookupErr) {
          mine = [];
        }
        if (!alive) return;
        if (mine.length) {
          jobRef.current = mine[0].id;
          setRef(orderRef(mine[0]));
          setPhase('writing');
          poll();
          return;
        }

        const { jobId } = await startGeneration(tender, user, token);
        if (!alive) return;
        jobRef.current = jobId;
        setRef(orderRef(jobId));
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
      if (state === 'ready') { navigation.replace('BidReady', { tender }); return; }
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

  if (phase === 'failed') {
    return (
      <View style={s.wrap}>
        <TopBar brand initials={initialsOf(user)} onBell={() => navigation.getParent()?.navigate('Ongoing')} />
        <View style={[s.centre, { padding: 24 }]}>
          <View style={s.errCircle}><Text style={s.errMark}>!</Text></View>
          <Text style={s.errTitle}>Could not generate</Text>
          <Text style={s.errText}>{errorMsg}</Text>
          <TouchableOpacity style={s.retry} activeOpacity={0.85} onPress={() => navigation.goBack()}>
            <Text style={s.retryText}>Back to tender</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const active = activeStepFor(phase, status);

  return (
    <View style={s.wrap}>
      <TopBar
        brand
        initials={initialsOf(user)}
        onBell={() => navigation.getParent()?.navigate('Ongoing')}
        onAvatar={() => navigation.getParent()?.navigate('Profile')}
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <Text style={s.h1}>Generate Response</Text>
        <Text style={s.sub}>We're preparing your tender response. You can keep using the app while this runs in the background.</Text>

        {phase === 'writing' && !!ref && (
          <View style={s.confirm}>
            <View style={s.confirmTop}>
              <Text style={s.confirmTitle}>Response requested</Text>
              <View style={s.refPill}><Text style={s.refText}>{ref}</Text></View>
            </View>
            <Text style={s.confirmBody}>
              This is now running on our servers. You can close the app. We will email you when it is ready, and you can track it under My Bids.
            </Text>
          </View>
        )}

        <View style={{ marginTop: 14 }}>
          <TenderCard tender={tender} />
        </View>

        {/* Progress */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Generating your response</Text>
          <Text style={s.cardSub}>We're analysing the tender and building your response.</Text>

          {STEPS.map((step, i) => {
            const done = i < active;
            const isActive = i === active;
            const last = i === STEPS.length - 1;
            return (
              <View key={i} style={s.step}>
                <View style={s.stepCol}>
                  {done ? (
                    <View style={s.circleDone}><Text style={s.check}>✓</Text></View>
                  ) : isActive ? (
                    <View style={s.circleActive}><ActivityIndicator size="small" color={c.teal} /></View>
                  ) : (
                    <View style={s.circlePending} />
                  )}
                  {!last && <View style={[s.line, done && s.lineDone]} />}
                </View>
                <View style={s.stepText}>
                  <Text style={[s.stepTitle, !done && !isActive && s.stepTitleMuted]}>{step.title}</Text>
                  <Text style={s.stepBody}>{step.body}</Text>
                </View>
              </View>
            );
          })}

          <View style={s.inbox}>
            <IconMail size={18} color={c.navy} />
            <Text style={s.inboxText}>Your response and tender pack will be sent to your inbox.</Text>
          </View>
        </View>

        {/* What you will receive */}
        <View style={s.card}>
          <Text style={s.cardTitle}>What you will receive</Text>
          <Text style={s.cardSub}>A complete and ready-to-review tender pack, including:</Text>
          {RECEIVE.map((r, i) => (
            <View key={i} style={s.recRow}>
              <View style={s.recIcon}><r.icon size={19} color={c.navy} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.recTitle}>{r.title}</Text>
                <Text style={s.recBody}>{r.body}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Strap */}
        <View style={s.strap}>
          <LogoMark size={30} />
          <View style={{ flex: 1 }}>
            <Text style={s.strapTitle}>Open the tender. Generate. Keep moving.</Text>
            <Text style={s.strapBody}>Turn opportunities into ready-to-review responses, faster.</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 27, fontWeight: '800', color: c.navy, letterSpacing: -0.5, marginTop: 2 },
  sub: { fontSize: 13.5, color: c.muted, marginTop: 6, lineHeight: 20 },

  confirm: { backgroundColor: c.goodBg, borderRadius: 14, padding: 15, marginTop: 14 },
  confirmTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  confirmTitle: { fontSize: 14.5, fontWeight: '800', color: c.good },
  refPill: { backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  refText: { fontSize: 12, fontWeight: '800', color: c.good, letterSpacing: 0.5 },
  confirmBody: { fontSize: 12.5, color: c.ink, marginTop: 6, lineHeight: 18 },

  card: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 16, padding: 16, marginTop: 14 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: c.navy },
  cardSub: { fontSize: 13, color: c.muted, marginTop: 4, marginBottom: 6, lineHeight: 18 },

  step: { flexDirection: 'row', gap: 13, marginTop: 12 },
  stepCol: { alignItems: 'center', width: 40 },
  circleDone: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.teal, alignItems: 'center', justifyContent: 'center' },
  circleActive: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.tealBg, alignItems: 'center', justifyContent: 'center' },
  circlePending: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: c.line },
  check: { fontSize: 18, fontWeight: '900', color: '#fff' },
  line: { width: 2, flex: 1, minHeight: 14, backgroundColor: c.line, marginTop: 4 },
  lineDone: { backgroundColor: c.teal },
  stepText: { flex: 1, paddingBottom: 6 },
  stepTitle: { fontSize: 15, fontWeight: '800', color: c.navy },
  stepTitleMuted: { color: c.muted2 },
  stepBody: { fontSize: 12.5, color: c.muted, marginTop: 3, lineHeight: 18 },

  inbox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#eaf4fb', borderRadius: 12, padding: 13, marginTop: 14 },
  inboxText: { flex: 1, fontSize: 12.5, color: c.ink, lineHeight: 17 },

  recRow: { flexDirection: 'row', alignItems: 'center', gap: 13, marginTop: 14 },
  recIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: c.tealBg, alignItems: 'center', justifyContent: 'center' },
  recTitle: { fontSize: 14.5, fontWeight: '800', color: c.navy },
  recBody: { fontSize: 12.5, color: c.muted, marginTop: 2, lineHeight: 17 },

  strap: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: c.tealBg, borderRadius: 14, padding: 15, marginTop: 14 },
  strapTitle: { fontSize: 14, fontWeight: '800', color: c.navy },
  strapBody: { fontSize: 12, color: c.muted, marginTop: 3, lineHeight: 16 },

  errCircle: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fdeaea', alignItems: 'center', justifyContent: 'center' },
  errMark: { fontSize: 28, fontWeight: '800', color: '#b4232a' },
  errTitle: { fontSize: 18, fontWeight: '800', color: c.navy, marginTop: 14 },
  errText: { fontSize: 13, color: c.muted, textAlign: 'center', marginTop: 8, lineHeight: 19, paddingHorizontal: 10 },
  retry: { backgroundColor: c.brand, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 26, marginTop: 20 },
  retryText: { fontSize: 14, fontWeight: '800', color: '#04303a' },
});
