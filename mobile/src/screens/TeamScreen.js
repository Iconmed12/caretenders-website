import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { c } from '../theme';
import TopBar from '../components/TopBar';
import { useAuth } from '../auth';
import { fetchTeam, teamAction, fetchMembership } from '../api';
import { IconTeam, IconFind, IconChevron, IconDots, IconSend } from '../icons';

export function displayName(email) {
  const local = String(email || '').split('@')[0];
  if (!local) return email || '';
  return local.split(/[._-]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
export function initialsOfEmail(email) {
  const n = displayName(email);
  const parts = n.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (n[0] || '?').toUpperCase();
}
function myInitials(user) {
  const meta = (user && user.user_metadata) || {};
  const first = meta.first_name || meta.firstName || '';
  const last = meta.last_name || meta.lastName || '';
  if (first) return (first.charAt(0) + (last.charAt(0) || '')).toUpperCase();
  return ((user && user.email) || '?').charAt(0).toUpperCase();
}

export default function TeamScreen({ navigation }) {
  const { session } = useAuth();
  const token = (session && session.access_token) || '';
  const user = (session && session.user) || {};

  const [data, setData] = useState(null);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [tab, setTab] = useState('members');
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    let alive = true;
    setLoading(true);
    Promise.all([fetchTeam(token), fetchMembership(user.email)]).then(([d, m]) => {
      if (!alive) return;
      setData(d);
      setPlan(m && m.plan ? m.plan : null);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [token, user.email]);

  useFocusEffect(load);

  const header = (
    <TopBar
      title="Team"
      initials={myInitials(user)}
      onBell={() => navigation.getParent()?.navigate('Ongoing')}
      onAvatar={() => navigation.getParent()?.navigate('Profile')}
    />
  );

  function createTeam() {
    if (!newName.trim()) { Alert.alert('Add a name', 'Please enter your company name.'); return; }
    setBusy(true);
    teamAction(token, { action: 'create', name: newName.trim() })
      .then(() => { setNewName(''); load(); })
      .catch((e) => Alert.alert('Could not do that', e.message || 'Please try again.'))
      .finally(() => setBusy(false));
  }

  if (loading) {
    return (
      <View style={s.wrap}>
        {header}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.teal} size="large" /></View>
      </View>
    );
  }

  const role = data && data.role;

  // Not in a team yet: offer to start a company circle.
  if (!role) {
    return (
      <View style={s.wrap}>
        {header}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            <View style={s.card}>
              <Text style={s.cardTitle}>Start a company circle</Text>
              <Text style={s.cardBody}>Bring your team onto Cana under one company. Invite colleagues, each with their own department, all covered by your plan.</Text>
              <Text style={s.label}>COMPANY NAME</Text>
              <TextInput style={s.input} value={newName} onChangeText={setNewName} placeholder="Your company name" placeholderTextColor={c.muted2} />
              <TouchableOpacity style={[s.primary, busy && s.off]} activeOpacity={0.85} onPress={createTeam} disabled={busy}>
                {busy ? <ActivityIndicator color="#04303a" /> : <Text style={s.primaryText}>Create company circle</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  const isOwner = role === 'owner';
  const members = (data && data.members) || [];
  const seatLimit = data && data.enterprise && data.enterprise.seat_limit;
  const usersLabel = isOwner && seatLimit ? `${members.length} / ${seatLimit} users` : `${members.length} ${members.length === 1 ? 'user' : 'users'}`;
  const planLabel = plan ? plan.charAt(0).toUpperCase() + plan.slice(1) + ' plan' : 'Member';

  const shown = members.filter((m) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return String(m.email || '').toLowerCase().includes(s)
      || displayName(m.email).toLowerCase().includes(s)
      || String(m.department || '').toLowerCase().includes(s);
  });

  // Departments view: group by department.
  const byDept = {};
  members.forEach((m) => { const d = m.department || 'No department'; (byDept[d] = byDept[d] || []).push(m); });
  const depts = Object.keys(byDept).sort();

  return (
    <View style={s.wrap}>
      {header}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <View style={s.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.pageTitle}>{data.enterprise && data.enterprise.name ? data.enterprise.name : 'Your team'}</Text>
            <Text style={s.pageSub}>Manage your team, access and activity.</Text>
          </View>
          {isOwner && (
            <TouchableOpacity style={s.inviteBtn} activeOpacity={0.85} onPress={() => navigation.navigate('TeamInvite')}>
              <IconSend size={15} color="#04303a" />
              <Text style={s.inviteBtnText}>Invite</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Summary */}
        <View style={s.summary}>
          <View style={s.summaryIcon}><IconTeam size={22} color={c.navy} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.summaryTitle}>{usersLabel}</Text>
            <Text style={s.summaryPlan}>{planLabel}</Text>
            <Text style={s.summarySub}>Your team members and their departments.</Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={s.tabs}>
          <TouchableOpacity style={[s.tab, tab === 'members' && s.tabOn]} onPress={() => setTab('members')} activeOpacity={0.8}>
            <Text style={[s.tabText, tab === 'members' && s.tabTextOn]}>Team members</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.tab, tab === 'departments' && s.tabOn]} onPress={() => setTab('departments')} activeOpacity={0.8}>
            <Text style={[s.tabText, tab === 'departments' && s.tabTextOn]}>Departments</Text>
          </TouchableOpacity>
        </View>

        {tab === 'members' ? (
          <>
            <View style={s.search}>
              <IconFind size={17} color={c.muted2} />
              <TextInput style={s.searchInput} value={q} onChangeText={setQ} placeholder="Search team members" placeholderTextColor={c.muted2} autoCapitalize="none" />
            </View>

            {shown.map((m, i) => {
              const owner = m.role === 'owner';
              return (
                <TouchableOpacity
                  key={m.id || m.email || i}
                  style={s.memberRow}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('TeamMember', { member: m, isOwner })}
                >
                  <View style={s.avatar}><Text style={s.avatarText}>{initialsOfEmail(m.email)}</Text></View>
                  <View style={{ flex: 1 }}>
                    <View style={s.nameRow}>
                      <Text style={s.name} numberOfLines={1}>{displayName(m.email)}</Text>
                      <View style={[s.roleBadge, owner && s.roleBadgeOwner]}>
                        <Text style={[s.roleBadgeText, owner && s.roleBadgeTextOwner]}>{owner ? 'Owner' : 'Member'}</Text>
                      </View>
                    </View>
                    <Text style={s.email} numberOfLines={1}>{m.email}</Text>
                    <Text style={s.dept} numberOfLines={1}>{owner ? 'All departments' : (m.department || 'No department')}</Text>
                  </View>
                  <View style={s.statusCol}>
                    <View style={s.statusRow}>
                      <View style={[s.statusDot, m.status === 'active' ? s.dotOn : s.dotWait]} />
                      <Text style={s.statusText}>{m.status === 'active' ? 'Active' : 'Invited'}</Text>
                    </View>
                    <IconDots size={18} color={c.muted2} />
                  </View>
                </TouchableOpacity>
              );
            })}
            {shown.length === 0 && <Text style={s.empty}>No team members match that search.</Text>}
          </>
        ) : (
          depts.map((d) => (
            <View key={d} style={s.deptRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.deptName}>{d}</Text>
                <Text style={s.deptCount}>{byDept[d].length} {byDept[d].length === 1 ? 'person' : 'people'}</Text>
              </View>
              <IconChevron size={16} color={c.muted2} />
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  card: { backgroundColor: c.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: c.line },
  cardTitle: { fontSize: 15.5, fontWeight: '800', color: c.navy },
  cardBody: { fontSize: 12.5, color: c.muted, marginTop: 5, lineHeight: 18 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, color: c.muted2, marginTop: 16, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: c.line, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, color: c.ink, backgroundColor: c.white },
  primary: { backgroundColor: c.brand, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 18 },
  off: { opacity: 0.7 },
  primaryText: { fontSize: 14.5, fontWeight: '800', color: '#04303a' },

  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  pageTitle: { fontSize: 22, fontWeight: '800', color: c.navy, letterSpacing: -0.4 },
  pageSub: { fontSize: 12.5, color: c.muted, marginTop: 3 },
  inviteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.brand, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 10 },
  inviteBtnText: { fontSize: 13, fontWeight: '800', color: '#04303a' },

  summary: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 15, padding: 15, marginTop: 16 },
  summaryIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: c.tealBg, alignItems: 'center', justifyContent: 'center' },
  summaryTitle: { fontSize: 16, fontWeight: '800', color: c.navy },
  summaryPlan: { fontSize: 12.5, fontWeight: '700', color: c.teal, marginTop: 1 },
  summarySub: { fontSize: 11.5, color: c.muted2, marginTop: 2 },

  tabs: { flexDirection: 'row', gap: 22, borderBottomWidth: 1, borderBottomColor: c.line, marginTop: 18 },
  tab: { paddingBottom: 10 },
  tabOn: { borderBottomWidth: 2, borderBottomColor: c.teal, marginBottom: -1 },
  tabText: { fontSize: 14, fontWeight: '700', color: c.muted2 },
  tabTextOn: { color: c.navy },

  search: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 12, paddingHorizontal: 12, marginTop: 14, marginBottom: 4 },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 13.5, color: c.ink },

  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 13, marginTop: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.tealBg, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '800', color: c.navy },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  name: { fontSize: 14.5, fontWeight: '800', color: c.navy, flexShrink: 1 },
  roleBadge: { backgroundColor: c.line, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  roleBadgeOwner: { backgroundColor: c.tealBg },
  roleBadgeText: { fontSize: 9.5, fontWeight: '800', color: c.muted, letterSpacing: 0.3 },
  roleBadgeTextOwner: { color: c.teal },
  email: { fontSize: 11.5, color: c.muted2, marginTop: 2 },
  dept: { fontSize: 11.5, color: c.muted, marginTop: 1 },
  statusCol: { alignItems: 'flex-end', gap: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  dotOn: { backgroundColor: c.good },
  dotWait: { backgroundColor: c.amber },
  statusText: { fontSize: 11, fontWeight: '700', color: c.muted },

  deptRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 15, marginTop: 10 },
  deptName: { fontSize: 14.5, fontWeight: '800', color: c.navy },
  deptCount: { fontSize: 12, color: c.muted2, marginTop: 2 },

  empty: { fontSize: 12.5, color: c.muted2, textAlign: 'center', marginTop: 20 },
});
