// Push notification setup. Asks for permission, gets this device's Expo push
// token, and registers it against the signed-in user so send-alerts can reach
// them. Android push is delivered through Firebase (FCM); that credential is set
// up once on the Expo side and does not change this code.
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { registerPush, unregisterPush } from './api';

// Show a banner + play sound when a push arrives while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const projectId =
  (Constants.expoConfig && Constants.expoConfig.extra && Constants.expoConfig.extra.eas && Constants.expoConfig.extra.eas.projectId) ||
  (Constants.easConfig && Constants.easConfig.projectId);

async function getExpoToken() {
  if (!Device.isDevice) return null; // push does not work on simulators
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Tender alerts',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#00AFC1',
    });
  }
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const asked = await Notifications.requestPermissionsAsync();
    status = asked.status;
  }
  if (status !== 'granted') return { denied: true };
  const res = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return { token: res.data };
}

// Turn push on: ask permission, get the token, save it. Returns true if the
// device is now registered, false if permission was refused or unavailable.
export async function enablePush(authToken) {
  try {
    const r = await getExpoToken();
    if (!r || r.denied || !r.token) return false;
    const ok = await registerPush(authToken, r.token, Platform.OS);
    return !!ok;
  } catch (e) {
    return false;
  }
}

// Turn push off: remove this device's token.
export async function disablePush(authToken) {
  try {
    const r = await getExpoToken();
    if (r && r.token) await unregisterPush(authToken, r.token);
  } catch (e) { /* best effort */ }
}
