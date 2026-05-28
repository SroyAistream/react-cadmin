import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Alert, Image, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {CAdminApi} from '../api/cadminApi';
import {getHttpFag, HTTPS_URL} from '../api/config';
import {PrimaryButton} from '../components/PrimaryButton';
import {CAdminNative} from '../native/CAdminNative';
import {getNumber, getString, setValues} from '../state/storage';
import {colors} from '../theme/colors';
import {strings} from '../theme/strings';
import {errorMessage} from '../utils/errors';
import {formatTime} from '../utils/time';

type Conn = 'CONNECTED' | 'DISCONNECTED';
const LOG_PREFIX = '[CADMIN_HOME]';
type FagSyncData = {
  user_permissions?: unknown[];
  movies?: unknown[];
  fma_list?: unknown[];
  drm_keys?: unknown[];
  players?: unknown[];
  firmware?: unknown;
};
type FmaWifiInfo = {
  routerid?: string;
  mac?: string;
  mac_5g?: string;
  ssid?: string;
  ssid5g?: string;
  password?: string;
};

function readDataField(response: unknown) {
  if (response && typeof response === 'object' && 'data' in response) {
    return (response as {data?: unknown}).data;
  }
  return undefined;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizeBssid(value?: string) {
  return value?.trim().toUpperCase() ?? '';
}

function parseJsonObject<T>(value: string, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function getStoredFagData() {
  return parseJsonObject<FagSyncData>(await getString('fagData'), {});
}

async function getFmaWifiLastUpdates() {
  return parseJsonObject<Record<string, number>>(await getString('fmaWifiLastUpdates'), {});
}

export function HomeScreen() {
  const [fagState, setFagState] = useState<Conn>('DISCONNECTED');
  const [fmaState, setFmaState] = useState<Conn>('DISCONNECTED');
  const [fagIp, setFagIp] = useState('');
  const [lastUpdate, setLastUpdate] = useState(0);
  const [expiry, setExpiry] = useState(0);
  const [fmaName, setFmaName] = useState('');
  const [fmaId, setFmaId] = useState('');
  const [fmaLastUpdate, setFmaLastUpdate] = useState(0);
  const [working, setWorking] = useState(false);
  const [error1, setError1] = useState('');
  const [error2, setError2] = useState('');
  
  // STATE MACHINE LOCK
  const [syncStep, setSyncStep] = useState<'IDLE' | 'FETCHED' | 'HUB_SYNCED'>('IDLE');

  const hasFreshFagData = useMemo(() => Boolean(expiry && expiry > Date.now()), [expiry]);
  const dataExpired = useMemo(() => Boolean(expiry && expiry <= Date.now()), [expiry]);

  const refreshLocal = useCallback(async () => {
    const [ip, update, exp] = await Promise.all([
      getString('fagIp'),
      getNumber('lastUpdate'),
      getNumber('dataExpiryTime')
    ]);
    setFagIp(ip);
    setLastUpdate(update);
    setExpiry(exp);
  }, []);

  const loadFmaDetails = useCallback(async (isBackgroundPoll = false) => {
    console.log(LOG_PREFIX, 'loadFmaDetails:start', {mediaHubBaseUrl: HTTPS_URL});
    try {
      await CAdminApi.checkStatus();
      const details = await CAdminApi.getRouterDetails(0);
      const router = details.routerInfo ?? details.data;
      const uuid = router?.uuid ?? '';
      setFmaName(router?.name ?? '');
      setFmaId(uuid);
      setFmaLastUpdate((router?.fmaSyncTime ?? router?.fma_sync_time ?? 0) * 1000);
      setFmaState('CONNECTED');

      if (uuid) {
        await setValues({ fmaUuid: uuid });
      }
      if (!isBackgroundPoll) setError2(''); 

      const currentSsid = await CAdminNative.getCurrentSsid();
      if (currentSsid) {
        const updates = await getFmaWifiLastUpdates();
        const syncTime = (router?.fmaSyncTime ?? router?.fma_sync_time ?? 0) * 1000;
        if (!updates[currentSsid] || updates[currentSsid] < syncTime) {
          await setValues({fmaWifiLastUpdates: JSON.stringify({...updates, [currentSsid]: syncTime || Date.now()})});
        }
      }
    } catch (error) {
      setFmaName('');
      setFmaId('');
      setFmaLastUpdate(0);
      setFmaState('DISCONNECTED');
      if (!isBackgroundPoll) {
        setError2(`Media hub unreachable: ${errorMessage(error)}`);
      }
    }
  }, []);

  const checkInternetConnection = useCallback(async () => {
    console.log(LOG_PREFIX, 'checkInternetConnection:start');
    try {
      await CAdminApi.getFagVersion(getHttpFag());
      const ssid = await CAdminNative.getCurrentSsid();
      console.log(LOG_PREFIX, 'checkInternetConnection:success', {ssid});
      await setValues({internetSSID: ssid});
      setFagState('CONNECTED');
    } catch (error) {
      console.log(LOG_PREFIX, 'checkInternetConnection:error', {message: errorMessage(error), raw: error});
      setFagState('DISCONNECTED');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshLocal();
      checkInternetConnection();
      
      if (hasFreshFagData && syncStep !== 'HUB_SYNCED') {
         loadFmaDetails(true); 
      } else if (syncStep === 'HUB_SYNCED') {
         // UI Cleanup: Force UI to update when returning from Wi-Fi settings
         setFmaState('DISCONNECTED'); 
      }
    }, [refreshLocal, checkInternetConnection, loadFmaDetails, hasFreshFagData, syncStep])
  );

  // INTELLIGENT UI PROMPTS
  useEffect(() => {
    if (dataExpired) {
      setError2('FAG data has expired, Please Synchronize Data with SoNET Head-End System.');
    } else if (hasFreshFagData && fagState === 'CONNECTED' && fmaState === 'DISCONNECTED' && syncStep !== 'HUB_SYNCED') {
      // Automatically prompt the user to switch to the Hub if they are on the internet with fresh data
      setError2('Data is ready. Please connect to the Media Hub Wi-Fi to sync the data.');
    }
  }, [dataExpired, hasFreshFagData, fagState, fmaState, syncStep]);

  async function fetchDataFromFag() {
    console.log(LOG_PREFIX, 'fetchDataFromFag:start');
    setWorking(true);
    setError1('');
    try {
      const rechargePins = await runFetchStep('Recharge pins', CAdminApi.getRechargePins);
      const movies = await runFetchStep('Movies', CAdminApi.getMovies);
      const wifiList = await runFetchStep('Wi-Fi list', CAdminApi.getWifiList);
      const drmKeys = await runFetchStep('DRM keys', CAdminApi.getDrmKeys);
      const playerInfo = await runFetchStep('Player info', CAdminApi.getAppPlayerInfos);
      const firmware = await CAdminApi.getFmaVersionInfo().catch(() => undefined);

      const fagData: FagSyncData = {
        user_permissions: asArray(readDataField(rechargePins)),
        movies: asArray(readDataField(movies)),
        fma_list: asArray(readDataField(wifiList)),
        drm_keys: asArray(readDataField(drmKeys)),
        players: asArray(readDataField(playerInfo)),
        firmware
      };

      const now = Date.now();
      await setValues({
        fagIp: getHttpFag(),
        lastUpdate: now,
        dataExpiryTime: now + 24 * 60 * 60 * 1000,
        fagData: JSON.stringify(fagData)
      });
      
      setSyncStep('FETCHED');
      Alert.alert('Success', 'Data fetched from server. Now searching for Media Hub...');

      await refreshLocal();
      const connected = await promptAndConnectFmaWifi();
      if (connected) {
        await loadFmaDetails();
      }
    } catch (error) {
      setError1(errorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  async function runFetchStep(label: string, action: () => Promise<unknown>) {
    try {
      return await action();
    } catch (error) {
      throw new Error(`${label}: ${errorMessage(error)}`);
    }
  }

  async function promptAndConnectFmaWifi() {
    console.log(LOG_PREFIX, 'promptAndConnectFmaWifi:start');
    const selected = await findFmaWifi();

    if (!selected) {
      setError2('No SoNET media hub Wi-Fi was found nearby. Please move closer to the media hub and try again.');
      return false;
    }

    const shouldConnect = await confirmAlert(
      'Fetch Data Success',
      `Connect to media hub Wi-Fi "${selected}" now to sync data with SMA?`
    );
    
    if (!shouldConnect) {
      setError2(`Please connect to ${selected} Wi-Fi to sync data with SMA.`);
      return false;
    }

    return switchFmaWifi(selected);
  }

  async function findFmaWifi() {
    const scannedWifi = await CAdminNative.scanWifi();
    const scannedByBssid = new Map<string, string>();
    const scannedSsids = new Set<string>();
    
    scannedWifi.forEach(item => {
      if (item.ssid) scannedSsids.add(item.ssid);
      const bssid = normalizeBssid(item.bssid);
      if (bssid && item.ssid) scannedByBssid.set(bssid, item.ssid);
    });

    const fagData = await getStoredFagData();
    const knownFmas = asArray(fagData.fma_list) as FmaWifiInfo[];
    const candidates = new Set<string>();
    
    knownFmas.forEach(fma => {
      const mac = normalizeBssid(fma.mac);
      const mac5g = normalizeBssid(fma.mac_5g);
      const ssid = mac ? scannedByBssid.get(mac) : undefined;
      const ssid5g = mac5g ? scannedByBssid.get(mac5g) : undefined;
      if (ssid) candidates.add(ssid);
      if (ssid5g) candidates.add(ssid5g);
    });

    if (!candidates.size) {
      scannedSsids.forEach(ssid => candidates.add(ssid));
    }

    const updates = await getFmaWifiLastUpdates();
    let selected = 'SoNET';
    for (const ssid of candidates) {
      if (!updates[ssid]) {
        selected = ssid;
        break;
      }
      if (!updates[selected] || updates[ssid] < updates[selected]) {
        selected = ssid;
      }
    }
    return selected;
  }

  async function switchFmaWifi(selected: string) {
    const switched = await CAdminNative.switchWifi(selected, '');
    if (!switched) {
      Alert.alert('', `Could not connect automatically to ${selected}. Please connect to this Wi-Fi from the Android settings, then press Sync Data.`);
      setError2(`Please connect to ${selected} Wi-Fi to sync data with SMA.`);
      return false;
    }
    return true;
  }

  async function syncFmaData() {
    if (dataExpired) {
      setError2('FAG data has expired, Please Synchronize Data with SoNET Head-End System.');
      return;
    }
    setWorking(true);
    setError2('');
    
    try {
      await loadFmaDetails(false);
      await CAdminApi.checkStatus();
      
      const saved = await getString('fagData');
      const fagData = saved ? (JSON.parse(saved) as FagSyncData) : {};
      
      const fmaOffline = await CAdminApi.getFmaData(Date.now());
      await CAdminApi.updateFmaData(fagData);
      
      setSyncStep('HUB_SYNCED');
      const fmaData = readDataField(fmaOffline) as Record<string, unknown> | undefined;

      Alert.alert(
        'Hub Sync Complete',
        'Data successfully synced to Media Hub.\n\nTo complete the final server upload, please switch to Internet (Wi-Fi or Mobile Data) and then press Continue Upload.',
        [
          {
            text: 'Continue Upload',
            onPress: async () => {
              setFmaState('DISCONNECTED'); // Clean up UI state immediately
              setWorking(true);
              try {
                await CAdminApi.reportWifiStates(asArray(fmaData?.router_state));
                await CAdminApi.syncFmaData(asArray(fmaData?.user_permissions));
                await CAdminApi.reportUserData({report_data: asArray(fmaData?.user_datas)});
                
                setSyncStep('IDLE');
                setError2(''); 
                Alert.alert('Success', 'All Data Uploaded to Head-End Successfully.');
              } catch (uploadError) {
                setError2('Final upload failed. Are you sure you are connected to the internet?');
              } finally {
                setWorking(false);
              }
            }
          }
        ],
        { cancelable: false }
      );
    } catch (error) {
      setError2(errorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Image source={require('../assets/logo.jpg')} style={styles.logo} resizeMode="contain" />
      <Text style={styles.title}>{strings.mainTitle}</Text>

      <Section title="-----SoNET HEAD-END SYSTEM INFO-----">
        <Pair label="Connection Status:" value={fagState} connected={fagState === 'CONNECTED'} />
        <Pair label="Data Server(FAG) IP:" value={fagIp} />
        <Pair label="Last Update Time:" value={formatTime(lastUpdate)} />
        <Pair label="Data Expiry Date:" value={formatTime(expiry)} danger={dataExpired} />
        <View style={styles.action}>
           {/* FIX: Removed hasFreshFagData, added fmaState lock so it enables strictly when on Internet */}
           <PrimaryButton title="FETCH DATA" onPress={fetchDataFromFag} disabled={working || fagState !== 'CONNECTED' || fmaState === 'CONNECTED'} />
        </View>
        {!!error1 && <Text style={styles.error}>{error1}</Text>}
      </Section>

      <Section title="-----SoNET MEDIA APPLIANCE(SMA) INFO-----">
        <Pair label="Connection Status:" value={fmaState} connected={fmaState === 'CONNECTED'} />
        <Pair label="SMA Name:" value={fmaName} />
        <Pair label="SMA ID:" value={fmaId} />
        <Pair label="Last Update Time:" value={formatTime(fmaLastUpdate)} />
        <View style={styles.action}>
           {/* FIX: Added syncStep lock to explicitly disable button when waiting to upload */}
           <PrimaryButton title="Sync DATA" onPress={syncFmaData} disabled={working || fmaState !== 'CONNECTED' || dataExpired || syncStep === 'HUB_SYNCED'} />
        </View>
        {!!error2 && <Text style={styles.error}>{error2}</Text>}
      </Section>
    </ScrollView>
  );
}

function Section({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Pair({label, value, connected, danger}: {label: string; value?: string; connected?: boolean; danger?: boolean}) {
  return (
    <View style={styles.pair}>
      <Text style={styles.pairLabel}>{label} </Text>
      <Text style={[styles.pairValue, connected && styles.connected, danger && styles.danger]}>{value}</Text>
    </View>
  );
}

function confirmAlert(title: string, message: string) {
  return new Promise<boolean>(resolve => {
    Alert.alert(title, message, [
      {text: 'Cancel', style: 'cancel', onPress: () => resolve(false)},
      {text: 'Connect', onPress: () => resolve(true)}
    ]);
  });
}

const styles = StyleSheet.create({
  page: {flex: 1, backgroundColor: colors.white},
  content: {paddingTop: 20, paddingBottom: 70},
  logo: {width: '100%', height: 96},
  title: {marginTop: 20, color: colors.title, textAlign: 'center'},
  section: {marginTop: 30},
  sectionTitle: {textAlign: 'center', color: colors.text, marginBottom: 15},
  pair: {flexDirection: 'row', marginTop: 5, alignItems: 'center'},
  pairLabel: {width: 170, color: colors.text, textAlign: 'right'},
  pairValue: {color: colors.value, flex: 1},
  connected: {color: colors.green},
  danger: {color: colors.error},
  action: {alignItems: 'center', marginTop: 20},
  error: {marginTop: 20, marginHorizontal: 15, color: colors.error}
});