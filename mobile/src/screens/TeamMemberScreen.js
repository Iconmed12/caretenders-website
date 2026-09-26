import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { c } from '../theme';
import { useAuth } from '../auth';
import { teamAction } from '../api';
import { displayName, initialsOfEmail } from './TeamScreen';
import { IconTrash } from '../icons';

function longDate(v) {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function TeamMemberScreen({ route, navigation }) {
  const { session } = useAuth();
  const token = (session && session.access_token) || '';
  const member = (route.params && route.params.member) || {};
  const isOwner = route.params && route.params.isOwner;
  const owner = member.role === 'owner';
  const [busy, setBusy] = useState(false);

  function confirmRemove() {
    Alert.alert('Remove ' + displayName(member.email) + '?', 'They will lose access to your company on Cana.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: () => {
          setBusy(true);
          teamAction(token, { action: 'remove', memberId: member.id })
            .then(() => navigation.goBack())
            .catch((e) => { setBusy(false); Alert.alert('Could not remove', e.message || 'Please try again.'); });
        },
      },
    ]);
  }

  return (
    <View style={s.wrap}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <View style={s.headCard}>
          <View style={s.avatar}><Text style={s.avatarText}>{initialsOfEmail(member.email)}</Text></View>
          <Text style={s.name}>{displayName(member.email)}</Text>
          <Text style={s.email}>{member.email}</Text>
          <View style={s.badgeRow}>
            <View style={[s.badge, owner && s.badgeTeal]}>
              <Text style={[s.badgeText, owner && s.badgeTextTeal]}>{owner ? 'Owner' : (member.department || 'Member')}</Text>
            </View>
            <View style={s.statusRow}>
              <View style={[s.dot, member.status === 'active' ? s.dotOn : s.dotWait]} />
              <Text style={s.statusText}>{member.status === 'active' ? 'Active' : 'Invited'}</Text>
            </View>
          </View>
        </View>

        <View style={[s.card, { marginTop: 18 }]}>
          <Row label="DEPARTMENT" value={owner ? 'All departments' : (member.department || 'No department')} />
          <Row label="STATUS" value={member.status === 'active' ? 'Active' : 'Invited'} />
          {!!member.joined_at && <Row label="JOINED" value={longDate(member.joined_at)} />}
          {typeof member.bids === 'number' && <Row label="BIDS GENERATED" value={String(member.bids)} last />}
        </View>

        {isOwner && !owner && (
          <TouchableOpacity style={[s.remove, busy && s.off]} activeOpacity={0.85} onPress={confirmRemove} disabled={busy}>
            {busy ? <ActivityIndicator color="#b4232a" /> : (
              <><IconTrash size={17} color="#b4232a" /><Text style={s.removeText}>Remove team member</Text></>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

function Row({ label, value, last }) {
  return (
    <View style={[rs.row, !last && rs.rowBorder]}>
      <Text style={rs.label}>{label}</Text>
      <Text style={rs.value}>{value}</Text>
    </View>
  );
}

const rs = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: c.line2 },
  label: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5, color: c.muted2 },
  value: { fontSize: 14, fontWeight: '700', color: c.navy, flexShrink: 1, textAlign: 'right', marginLeft: 12 },
});

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  headCard: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 16, padding: 18, alignItems: 'center' },
  avatar: { width: 68, height: 68, borderRadius: 34, backgroundColor: c.tealBg, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontWeight: '800', color: c.navy },
  name: { fontSize: 19, fontWeight: '800', color: c.navy, marginTop: 12 },
  email: { fontSize: 13, color: c.muted2, marginTop: 3 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  badge: { backgroundColor: c.line, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 },
  badgeTeal: { backgroundColor: c.tealBg },
  badgeText: { fontSize: 11.5, fontWeight: '800', color: c.muted },
  badgeTextTeal: { color: c.teal },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOn: { backgroundColor: c.good },
  dotWait: { backgroundColor: c.amber },
  statusText: { fontSize: 12.5, fontWeight: '700', color: c.muted },

  tabs: { flexDirection: 'row', gap: 22, borderBottomWidth: 1, borderBottomColor: c.line, marginTop: 18, marginBottom: 14 },
  tab: { paddingBottom: 10 },
  tabOn: { borderBottomWidth: 2, borderBottomColor: c.teal, marginBottom: -1 },
  tabText: { fontSize: 14, fontWeight: '700', color: c.muted2 },
  tabTextOn: { color: c.navy },

  card: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 2 },
  bidRow: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 13, padding: 13, marginBottom: 10 },
  bidTitle: { fontSize: 13.5, fontWeight: '700', color: c.navy },
  bidWhen: { fontSize: 11.5, color: c.muted2, marginTop: 3 },
  empty: { fontSize: 12.5, color: c.muted2, textAlign: 'center', marginTop: 20 },

  remove: { flexDirection: 'row', gap: 8, borderWidth: 1, borderColor: '#f3c9c9', backgroundColor: '#fdf4f4', borderRadius: 13, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  off: { opacity: 0.6 },
  removeText: { fontSize: 14, fontWeight: '800', color: '#b4232a' },
});
