import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Switch, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { c } from '../theme';
import { useAuth } from '../auth';
import { fetchAlerts, saveAlerts } from '../api';
import { IconChevron, IconMail, IconAlerts } from '../icons';

// A collapsible section: header shows a summary, tapping opens the pick list.
function Section({ title, summary, open, onToggle, children }) {
  return (
    <View style={s.section}>
      <TouchableOpacity style={s.secHead} activeOpacity={0.8} onPress={onToggle}>
        <View style={{ flex: 1 }}>
          <Text style={s.secTitle}>{title}</Text>
          {!!summary && <Text style={s.secSummary} numberOfLines={1}>{summary}</Text>}
        </View>
        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
          <IconChevron size={18} color={c.muted2} />
        </View>
      </TouchableOpacity>
      {open && <View style={s.secBody}>{children}</View>}
    </View>
  );
}

function CheckRow({ label, on, onPress, last }) {
  return (
    <TouchableOpacity style={[s.checkRow, !last && s.checkDivider]} activeOpacity={0.75} onPress={onPress}>
      <Text style={[s.checkLabel, on && s.checkLabelOn]}>{label}</Text>
      <View style={[s.box, on && s.boxOn]}>{on && <View style={s.tick} />}</View>
    </TouchableOpacity>
  );
}

export default function AlertsScreen() {
  const { session } = useAuth();
  const token = (session && session.access_token) || '';

  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState('');

  const [sectors, setSectors] = useState([]);
  const [services, setServices] = useState([]);
  const [regions, setRegions] = useState([]);
  const [band, setBand] = useState('any');
  const [emailOn, setEmailOn] = useState(true);
  const [pushOn, setPushOn] = useState(false);
  const [frequency, setFrequency] = useState('daily');

  const load = useCallback(() => {
    let alive = true;
    fetchAlerts(token).then((d) => {
      if (!alive || !d) { setLoading(false); return; }
      setOptions(d.options);
      const p = d.prefs || {};
      setSectors(Array.isArray(p.sectors) ? p.sectors : []);
      setServices(Array.isArray(p.service_types) ? p.service_types : []);
      setRegions(Array.isArray(p.regions) ? p.regions : []);
      setBand(p.value_band || 'any');
      setEmailOn(p.email_on !== false);
      setPushOn(p.push_on === true);
      setFrequency(p.frequency || 'daily');
      setLoading(false);
    });
    return () => { alive = false; };
  }, [token]);

  useFocusEffect(load);

  const toggle = (list, setList, key) => {
    setList(list.indexOf(key) === -1 ? list.concat(key) : list.filter((x) => x !== key));
  };

  async function save() {
    setSaving(true);
    try {
      await saveAlerts(token, {
        sectors, service_types: services, regions,
        value_band: band, email_on: emailOn, push_on: pushOn, frequency,
      });
      Alert.alert('Saved', 'We will alert you when a matching tender appears.');
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <View style={s.centre}><ActivityIndicator color={c.teal} /></View>;
  }
  if (!options) {
    return (
      <View style={s.centre}>
        <Text style={s.err}>Could not load your alerts. Check your connection and try again.</Text>
        <TouchableOpacity style={s.retry} onPress={() => { setLoading(true); load(); }}><Text style={s.retryText}>Try again</Text></TouchableOpacity>
      </View>
    );
  }

  const labelFor = (arr, keys) => {
    const picked = arr.filter((o) => keys.indexOf(o.key) !== -1).map((o) => o.label);
    return picked.length ? picked.join(', ') : 'None yet, tap to choose';
  };
  const bandLabel = (options.valueBands.find((b) => b.key === band) || {}).label || 'Any value';
  // Service types narrow to the chosen sectors (or show all if no sector picked).
  const serviceList = sectors.length
    ? options.serviceTypes.filter((st) => sectors.indexOf(st.sector) !== -1)
    : options.serviceTypes;

  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 16, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
      <Text style={s.h1}>Tender alerts</Text>
      <Text style={s.sub}>Pick what you want. We alert you the moment it appears.</Text>

      <Text style={s.groupLabel}>SECTORS</Text>
      <View style={s.chips}>
        {options.sectors.filter((x) => x.key !== 'other').map((sec) => {
          const on = sectors.indexOf(sec.key) !== -1;
          return (
            <TouchableOpacity key={sec.key} style={[s.chip, on && s.chipOn]} activeOpacity={0.85} onPress={() => toggle(sectors, setSectors, sec.key)}>
              <Text style={[s.chipText, on && s.chipTextOn]}>{sec.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Section
        title="Service type"
        summary={labelFor(options.serviceTypes, services)}
        open={open === 'service'}
        onToggle={() => setOpen(open === 'service' ? '' : 'service')}
      >
        {serviceList.map((st, i) => (
          <CheckRow key={st.key} label={st.label} on={services.indexOf(st.key) !== -1} last={i === serviceList.length - 1} onPress={() => toggle(services, setServices, st.key)} />
        ))}
      </Section>

      <Section
        title="Region"
        summary={labelFor(options.regions, regions)}
        open={open === 'region'}
        onToggle={() => setOpen(open === 'region' ? '' : 'region')}
      >
        {options.regions.map((r, i) => (
          <CheckRow key={r.key} label={r.label} on={regions.indexOf(r.key) !== -1} last={i === options.regions.length - 1} onPress={() => toggle(regions, setRegions, r.key)} />
        ))}
      </Section>

      <Section
        title="Contract value"
        summary={bandLabel}
        open={open === 'band'}
        onToggle={() => setOpen(open === 'band' ? '' : 'band')}
      >
        {options.valueBands.map((b, i) => (
          <CheckRow key={b.key} label={b.label} on={band === b.key} last={i === options.valueBands.length - 1} onPress={() => setBand(b.key)} />
        ))}
      </Section>

      <Text style={s.groupLabel}>HOW YOU GET ALERTS</Text>
      <View style={s.card}>
        <View style={[s.toggleRow, s.checkDivider]}>
          <View style={s.toggleLeft}><IconMail size={17} color={c.muted} /><Text style={s.toggleLabel}>Email</Text></View>
          <Switch value={emailOn} onValueChange={setEmailOn} trackColor={{ true: c.teal, false: c.line }} thumbColor="#fff" />
        </View>
        <View style={s.toggleRow}>
          <View style={s.toggleLeft}>
            <IconAlerts size={17} color={c.muted} />
            <View>
              <Text style={s.toggleLabel}>Push notification</Text>
              <Text style={s.toggleNote}>Coming soon</Text>
            </View>
          </View>
          <Switch value={pushOn} onValueChange={setPushOn} disabled trackColor={{ true: c.teal, false: c.line }} thumbColor="#fff" />
        </View>
      </View>

      <View style={s.freq}>
        {[['instant', 'Instant'], ['daily', 'Daily'], ['weekly', 'Weekly']].map(([key, label]) => {
          const on = frequency === key;
          return (
            <TouchableOpacity key={key} style={[s.freqCell, on && s.freqCellOn]} activeOpacity={0.85} onPress={() => setFrequency(key)}>
              <Text style={[s.freqText, on && s.freqTextOn]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity style={[s.cta, saving && s.ctaOff]} activeOpacity={0.9} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#04303a" /> : <Text style={s.ctaText}>Save alert preferences</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg, padding: 24 },
  err: { fontSize: 13, color: c.muted, textAlign: 'center', lineHeight: 19 },
  retry: { marginTop: 14, backgroundColor: c.brand, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  retryText: { fontSize: 14, fontWeight: '800', color: '#04303a' },

  h1: { fontSize: 24, fontWeight: '800', color: c.navy, letterSpacing: -0.4 },
  sub: { fontSize: 13, color: c.muted, marginTop: 4, lineHeight: 19 },

  groupLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, color: c.muted2, marginTop: 22, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipOn: { backgroundColor: c.teal, borderColor: c.teal },
  chipText: { fontSize: 12.5, fontWeight: '700', color: c.navy },
  chipTextOn: { color: '#fff' },

  section: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 14, marginTop: 12, overflow: 'hidden' },
  secHead: { flexDirection: 'row', alignItems: 'center', padding: 15 },
  secTitle: { fontSize: 14.5, fontWeight: '800', color: c.navy },
  secSummary: { fontSize: 12, color: c.muted, marginTop: 3 },
  secBody: { borderTopWidth: 1, borderTopColor: c.line2, paddingHorizontal: 15 },

  checkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13 },
  checkDivider: { borderBottomWidth: 1, borderBottomColor: c.line2 },
  checkLabel: { fontSize: 13.5, color: c.muted, flex: 1 },
  checkLabelOn: { color: c.navy, fontWeight: '700' },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: c.line, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: c.teal, borderColor: c.teal },
  tick: { width: 10, height: 6, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: '#fff', transform: [{ rotate: '-45deg' }, { translateY: -1 }] },

  card: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 14, paddingHorizontal: 15 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13 },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggleLabel: { fontSize: 14, fontWeight: '700', color: c.navy },
  toggleNote: { fontSize: 11, color: c.muted2, marginTop: 1 },

  freq: { flexDirection: 'row', gap: 8, marginTop: 12 },
  freqCell: { flex: 1, backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 11, paddingVertical: 11, alignItems: 'center' },
  freqCellOn: { backgroundColor: c.navy, borderColor: c.navy },
  freqText: { fontSize: 12.5, fontWeight: '700', color: c.muted },
  freqTextOn: { color: '#fff' },

  cta: { backgroundColor: c.brand, borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  ctaOff: { opacity: 0.6 },
  ctaText: { fontSize: 14.5, fontWeight: '800', color: '#04303a' },
});
