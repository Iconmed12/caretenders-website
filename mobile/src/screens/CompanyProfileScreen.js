import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { c } from '../theme';
import { useAuth } from '../auth';
import { fetchCompanyProfile, fetchCompanyShared, saveCompanyProfile } from '../api';
import { IconFolder, IconChevron } from '../icons';

// Same sector list the website's profile uses.
const SECTORS = [
  'Care & Support', 'Healthcare / Clinical', 'Finance & Accounting', 'IT & Digital',
  'Facilities & Maintenance', 'Recruitment & Staffing', 'Construction',
  'Professional Services', 'Cleaning', 'Transport & Logistics',
  'Education & Training', 'Other',
];
function isCareSector(s) { return !s || s === 'Care & Support' || s === 'Healthcare / Clinical'; }

const CARE_ROLES = ['Registered Manager', 'Safeguarding Lead', 'Operations Lead', 'Nominated Individual', 'Care Coordinator', 'Other'];
const COMMERCIAL_ROLES = ['Managing Director', 'Operations Lead', 'Contract / Account Manager', 'Project Manager', 'Quality Manager', 'Health & Safety Lead', 'Finance Lead', 'Technical Lead', 'Other'];
const CQC_STATUSES = ['Registered', 'Applying', 'Not required', 'Outstanding', 'Good', 'Requires improvement'];

// The legal identity that an enterprise member sees locked to the owner's values.
const LEGAL_KEYS = ['company_name', 'company_number', 'founded_year', 'registered_address'];

export default function CompanyProfileScreen({ navigation }) {
  const { session } = useAuth();
  const user = (session && session.user) || {};
  const token = (session && session.access_token) || '';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [f, setF] = useState({
    sector: '', company_name: '', company_number: '', founded_year: '', registered_address: '',
    total_staff: '', cqc_status: '', cqc_provider_id: '', ico_number: '',
    services: '', regions: '', experience: '', achievements: '', kpis: '',
    policies: '', accreditations: '', social_value: '',
    key_people: [], contract_examples: [],
  });

  function set(key, val) { setF((prev) => Object.assign({}, prev, { [key]: val })); }

  useEffect(() => {
    let alive = true;
    async function load() {
      const [profile, shared] = await Promise.all([
        fetchCompanyProfile(user.id),
        fetchCompanyShared(token),
      ]);
      if (!alive) return;
      const next = {};
      if (profile) {
        Object.keys(f).forEach((k) => {
          if (k === 'key_people' || k === 'contract_examples') next[k] = Array.isArray(profile[k]) ? profile[k] : [];
          else next[k] = profile[k] != null ? String(profile[k]) : '';
        });
      }
      // Enterprise member: legal identity is the owner's, shown locked.
      if (shared && shared.role === 'member') {
        setIsMember(true);
        const sh = shared.shared || {};
        LEGAL_KEYS.forEach((k) => { if (sh[k] != null) next[k] = String(sh[k]); });
      }
      setF((prev) => Object.assign({}, prev, next));
      setLoading(false);
    }
    load();
    return () => { alive = false; };
  }, [user.id, token]);

  const care = isCareSector(f.sector);
  const roles = care ? CARE_ROLES : COMMERCIAL_ROLES;

  function addPerson() { set('key_people', f.key_people.concat([{ name: '', role: roles[0], experience: '' }])); }
  function updatePerson(i, key, val) {
    const list = f.key_people.slice();
    list[i] = Object.assign({}, list[i], { [key]: val });
    set('key_people', list);
  }
  function removePerson(i) { set('key_people', f.key_people.filter((_, idx) => idx !== i)); }

  function addContract() { set('contract_examples', f.contract_examples.concat([{ client: '', service: '', value: '' }])); }
  function updateContract(i, key, val) {
    const list = f.contract_examples.slice();
    list[i] = Object.assign({}, list[i], { [key]: val });
    set('contract_examples', list);
  }
  function removeContract(i) { set('contract_examples', f.contract_examples.filter((_, idx) => idx !== i)); }

  async function save() {
    setSaving(true);
    try {
      await saveCompanyProfile(user.id, f, isMember);
      Alert.alert('Saved', 'Your profile is saved. Cana uses this to write your bids.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Please try again in a moment.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <View style={[s.wrap, s.centre]}><ActivityIndicator color={c.teal} size="large" /></View>;
  }

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
        <Text style={s.lead}>
          The fuller this is, the more of your bid Cana can write, and the fewer blanks left for you.
        </Text>

        <TouchableOpacity style={s.evidence} activeOpacity={0.8} onPress={() => navigation.navigate('Evidence')}>
          <View style={s.evidenceIcon}><IconFolder size={19} color={c.navy} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.evidenceTitle}>Evidence library</Text>
            <Text style={s.evidenceSub}>Documents Cana uses to answer your tenders</Text>
          </View>
          <IconChevron size={16} color={c.muted2} />
        </TouchableOpacity>

        {/* Sector */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Your sector</Text>
          <Text style={s.cardHint}>This tailors your whole profile.</Text>
          <View style={s.chips}>
            {SECTORS.map((sec) => (
              <TouchableOpacity
                key={sec}
                style={[s.chip, f.sector === sec && s.chipOn]}
                activeOpacity={0.8}
                onPress={() => set('sector', sec)}
              >
                <Text style={[s.chipText, f.sector === sec && s.chipTextOn]}>{sec}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Company identity */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Company</Text>
          {isMember && (
            <Text style={s.locked}>Your company's legal details are set by your account owner and shown locked.</Text>
          )}
          <Field label="Company name" value={f.company_name} onChange={(v) => set('company_name', v)} locked={isMember} />
          <Field label="Companies House number" value={f.company_number} onChange={(v) => set('company_number', v)} locked={isMember} />
          <Field label="Year founded" value={f.founded_year} onChange={(v) => set('founded_year', v)} locked={isMember} keyboardType="number-pad" />
          <Field label="Registered address" value={f.registered_address} onChange={(v) => set('registered_address', v)} locked={isMember} multiline />
          <Field label="Total staff" value={f.total_staff} onChange={(v) => set('total_staff', v)} keyboardType="number-pad" />
        </View>

        {/* CQC, care sectors only */}
        {care && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Regulation (CQC)</Text>
            <Text style={s.label}>CQC STATUS</Text>
            <View style={s.chips}>
              {CQC_STATUSES.map((st) => (
                <TouchableOpacity
                  key={st}
                  style={[s.chip, f.cqc_status === st && s.chipOn]}
                  activeOpacity={0.8}
                  onPress={() => set('cqc_status', st)}
                >
                  <Text style={[s.chipText, f.cqc_status === st && s.chipTextOn]}>{st}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Field label="CQC provider ID" value={f.cqc_provider_id} onChange={(v) => set('cqc_provider_id', v)} />
            <Field label="ICO registration number" value={f.ico_number} onChange={(v) => set('ico_number', v)} />
          </View>
        )}

        {/* What you do */}
        <View style={s.card}>
          <Text style={s.cardTitle}>What you do</Text>
          <Field label="Services you deliver" value={f.services} onChange={(v) => set('services', v)} multiline />
          <Field label="Regions you cover" value={f.regions} onChange={(v) => set('regions', v)} multiline />
        </View>

        {/* Evidence */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Track record and evidence</Text>
          <Text style={s.cardHint}>Cana pulls from these to answer the harder questions.</Text>
          <Field label="Relevant experience" value={f.experience} onChange={(v) => set('experience', v)} multiline />
          <Field label="Achievements and outcomes" value={f.achievements} onChange={(v) => set('achievements', v)} multiline />
          <Field label="KPIs you track" value={f.kpis} onChange={(v) => set('kpis', v)} multiline />
          <Field label="Policies you hold" value={f.policies} onChange={(v) => set('policies', v)} multiline />
          <Field label="Accreditations" value={f.accreditations} onChange={(v) => set('accreditations', v)} multiline />
          <Field label="Social value" value={f.social_value} onChange={(v) => set('social_value', v)} multiline />
        </View>

        {/* Key people */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Key people</Text>
          <Text style={s.cardHint}>Named staff Cana matches to the right questions.</Text>
          {f.key_people.map((p, i) => (
            <View key={i} style={s.subCard}>
              <View style={s.subHead}>
                <Text style={s.subTitle}>Person {i + 1}</Text>
                <TouchableOpacity onPress={() => removePerson(i)}><Text style={s.remove}>Remove</Text></TouchableOpacity>
              </View>
              <Field label="Name" value={p.name} onChange={(v) => updatePerson(i, 'name', v)} tight />
              <Text style={s.label}>ROLE</Text>
              <View style={s.chips}>
                {roles.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[s.chipSm, p.role === r && s.chipOn]}
                    activeOpacity={0.8}
                    onPress={() => updatePerson(i, 'role', r)}
                  >
                    <Text style={[s.chipTextSm, p.role === r && s.chipTextOn]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Field label="Experience / qualifications" value={p.experience} onChange={(v) => updatePerson(i, 'experience', v)} multiline tight />
            </View>
          ))}
          <TouchableOpacity style={s.addBtn} activeOpacity={0.85} onPress={addPerson}>
            <Text style={s.addText}>+ Add a person</Text>
          </TouchableOpacity>
        </View>

        {/* Contract examples */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Contract examples</Text>
          <Text style={s.cardHint}>Past or current contracts Cana can cite as evidence.</Text>
          {f.contract_examples.map((ex, i) => (
            <View key={i} style={s.subCard}>
              <View style={s.subHead}>
                <Text style={s.subTitle}>Contract {i + 1}</Text>
                <TouchableOpacity onPress={() => removeContract(i)}><Text style={s.remove}>Remove</Text></TouchableOpacity>
              </View>
              <Field label="Client / buyer" value={ex.client} onChange={(v) => updateContract(i, 'client', v)} tight />
              <Field label="Service delivered" value={ex.service} onChange={(v) => updateContract(i, 'service', v)} multiline tight />
              <Field label="Contract value" value={ex.value} onChange={(v) => updateContract(i, 'value', v)} tight />
            </View>
          ))}
          <TouchableOpacity style={s.addBtn} activeOpacity={0.85} onPress={addContract}>
            <Text style={s.addText}>+ Add a contract</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[s.save, saving && s.saveOff]} activeOpacity={0.85} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#04303a" /> : <Text style={s.saveText}>Save profile</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, value, onChange, multiline, locked, keyboardType, tight }) {
  return (
    <View style={{ marginTop: tight ? 10 : 14 }}>
      <Text style={s.label}>{label.toUpperCase()}</Text>
      <TextInput
        style={[s.input, multiline && s.inputMulti, locked && s.inputLocked]}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        editable={!locked}
        keyboardType={keyboardType || 'default'}
        placeholder={locked ? '' : 'Type here'}
        placeholderTextColor={c.muted2}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  centre: { alignItems: 'center', justifyContent: 'center' },
  lead: { fontSize: 13, color: c.muted, lineHeight: 19, marginBottom: 14 },
  evidence: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 14, marginBottom: 12 },
  evidenceIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: c.tealBg, alignItems: 'center', justifyContent: 'center' },
  evidenceTitle: { fontSize: 14, fontWeight: '700', color: c.navy },
  evidenceSub: { fontSize: 11.5, color: c.muted2, marginTop: 2 },
  card: { backgroundColor: c.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: c.line, marginBottom: 12 },
  cardTitle: { fontSize: 15.5, fontWeight: '800', color: c.navy },
  cardHint: { fontSize: 12, color: c.muted2, marginTop: 3, lineHeight: 17 },
  locked: { fontSize: 12, color: c.teal, marginTop: 8, lineHeight: 17 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, color: c.muted2, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: c.line, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: c.ink, backgroundColor: c.white },
  inputMulti: { height: 78, textAlignVertical: 'top', paddingTop: 11 },
  inputLocked: { backgroundColor: c.bg, color: c.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { borderWidth: 1, borderColor: c.line, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: c.white },
  chipSm: { borderWidth: 1, borderColor: c.line, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: c.white },
  chipOn: { backgroundColor: c.navy, borderColor: c.navy },
  chipText: { fontSize: 12.5, fontWeight: '600', color: c.muted },
  chipTextSm: { fontSize: 11.5, fontWeight: '600', color: c.muted },
  chipTextOn: { color: '#fff' },
  subCard: { borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 13, marginTop: 12, backgroundColor: c.bg },
  subHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  subTitle: { fontSize: 13, fontWeight: '800', color: c.navy },
  remove: { fontSize: 12.5, fontWeight: '700', color: '#b4232a' },
  addBtn: { borderWidth: 1, borderColor: c.line, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 12 },
  addText: { fontSize: 13.5, fontWeight: '700', color: c.teal },
  save: { backgroundColor: c.brand, borderRadius: 13, paddingVertical: 16, alignItems: 'center', marginTop: 6 },
  saveOff: { opacity: 0.7 },
  saveText: { fontSize: 15, fontWeight: '800', color: '#04303a' },
});
