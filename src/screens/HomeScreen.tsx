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

  const loadFmaDetails = useCallback(async () => {
    console.log(LOG_PREFIX, 'loadFmaDetails:start', {mediaHubBaseUrl: HTTPS_URL});
    try {
      console.log(LOG_PREFIX, 'loadFmaDetails:checkStatus:start');
      await CAdminApi.checkStatus();
      console.log(LOG_PREFIX, 'loadFmaDetails:checkStatus:success');
      console.log(LOG_PREFIX, 'loadFmaDetails:getRouterDetails:start');
      const details = await CAdminApi.getRouterDetails(0);
      console.log(LOG_PREFIX, 'loadFmaDetails:getRouterDetails:success', details);
      const router = details.routerInfo ?? details.data;
      setFmaName(router?.name ?? '');
      setFmaId(router?.uuid ?? '');
      setFmaLastUpdate((router?.fmaSyncTime ?? router?.fma_sync_time ?? 0) * 1000);
      setFmaState('CONNECTED');
      setError2('');

      const currentSsid = await CAdminNative.getCurrentSsid();
      console.log(LOG_PREFIX, 'loadFmaDetails:currentSsid', {currentSsid});
      if (currentSsid) {
        const updates = await getFmaWifiLastUpdates();
        const syncTime = (router?.fmaSyncTime ?? router?.fma_sync_time ?? 0) * 1000;
        if (!updates[currentSsid] || updates[currentSsid] < syncTime) {
          console.log(LOG_PREFIX, 'loadFmaDetails:updateLastSyncForSsid', {currentSsid, syncTime});
          await setValues({fmaWifiLastUpdates: JSON.stringify({...updates, [currentSsid]: syncTime || Date.now()})});
        }
      }
    } catch (error) {
      console.log(LOG_PREFIX, 'loadFmaDetails:error', {
        name: error instanceof Error ? error.name : typeof error,
        message: errorMessage(error),
        raw: error
      });
      setFmaName('');
      setFmaId('');
      setFmaLastUpdate(0);
      setFmaState('DISCONNECTED');
      setError2(`Please Connect to SoNET Wi-Fi to Sync Data with SMA. Media hub: ${HTTPS_URL} ${errorMessage(error)}`);
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
      loadFmaDetails();
      const timer = setInterval(() => {
        checkInternetConnection();
        loadFmaDetails();
      }, 5000);
      return () => clearInterval(timer);
    }, [refreshLocal, checkInternetConnection, loadFmaDetails])
  );

  useEffect(() => {
    if (dataExpired) {
      setError2('FAG data has expired, Please Synchronize Data with SoNET Head-End System.');
    }
  }, [dataExpired]);

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
      console.log(LOG_PREFIX, 'fetchDataFromFag:fagDataSummary', {
        userPermissions: fagData.user_permissions?.length ?? 0,
        movies: fagData.movies?.length ?? 0,
        fmaList: fagData.fma_list?.length ?? 0,
        drmKeys: fagData.drm_keys?.length ?? 0,
        players: fagData.players?.length ?? 0,
        hasFirmware: Boolean(fagData.firmware)
      });
      const now = Date.now();
      await setValues({
        fagIp: getHttpFag(),
        lastUpdate: now,
        dataExpiryTime: now + 24 * 60 * 60 * 1000,
        fagData: JSON.stringify(fagData)
      });
      await refreshLocal();
      const connected = await promptAndConnectFmaWifi();
      if (connected) {
        await loadFmaDetails();
      }
    } catch (error) {
      console.log(LOG_PREFIX, 'fetchDataFromFag:error', {message: errorMessage(error), raw: error});
      setError1(errorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  async function runFetchStep(label: string, action: () => Promise<unknown>) {
    try {
      console.log(LOG_PREFIX, 'runFetchStep:start', {label});
      const result = await action();
      console.log(LOG_PREFIX, 'runFetchStep:success', {label});
      return result;
    } catch (error) {
      console.log(LOG_PREFIX, 'runFetchStep:error', {label, message: errorMessage(error), raw: error});
      throw new Error(`${label}: ${errorMessage(error)}`);
    }
  }

  async function promptAndConnectFmaWifi() {
    console.log(LOG_PREFIX, 'promptAndConnectFmaWifi:start');
    const selected = await findFmaWifi();
    console.log(LOG_PREFIX, 'promptAndConnectFmaWifi:selected', selected);

    if (!selected) {
      Alert.alert('', 'Fetch Data Success. No SoNET media hub Wi-Fi was found nearby.');
      setError2('No SoNET media hub Wi-Fi was found nearby. Please move closer to the media hub and try again.');
      return false;
    }

    const shouldConnect = await confirmAlert(
      'Fetch Data Success',
      `Connect to media hub Wi-Fi "${selected}" now to sync data with SMA?`
    );
    console.log(LOG_PREFIX, 'promptAndConnectFmaWifi:userChoice', {selected, shouldConnect});
    if (!shouldConnect) {
      setError2(`Please connect to ${selected} Wi-Fi to sync data with SMA.`);
      return false;
    }

    return switchFmaWifi(selected);
  }

  async function findFmaWifi() {
    console.log(LOG_PREFIX, 'switchFmaWifi:start');
    const scannedWifi = await CAdminNative.scanWifi();
    console.log(LOG_PREFIX, 'switchFmaWifi:scanResults', {
      count: scannedWifi.length,
      items: scannedWifi.map(item => ({ssid: item.ssid, bssid: item.bssid, level: item.level}))
    });
    const scannedByBssid = new Map<string, string>();
    const scannedSsids = new Set<string>();
    scannedWifi.forEach(item => {
      if (item.ssid) {
        scannedSsids.add(item.ssid);
      }
      const bssid = normalizeBssid(item.bssid);
      if (bssid && item.ssid) {
        scannedByBssid.set(bssid, item.ssid);
      }
    });

    const fagData = await getStoredFagData();
    const knownFmas = asArray(fagData.fma_list) as FmaWifiInfo[];
    console.log(LOG_PREFIX, 'switchFmaWifi:knownFmas', {
      count: knownFmas.length,
      items: knownFmas.map(fma => ({
        routerid: fma.routerid,
        ssid: fma.ssid,
        ssid5g: fma.ssid5g,
        mac: fma.mac,
        mac_5g: fma.mac_5g
      }))
    });
    const candidates = new Set<string>();
    knownFmas.forEach(fma => {
      const mac = normalizeBssid(fma.mac);
      const mac5g = normalizeBssid(fma.mac_5g);
      const ssid = mac ? scannedByBssid.get(mac) : undefined;
      const ssid5g = mac5g ? scannedByBssid.get(mac5g) : undefined;
      console.log(LOG_PREFIX, 'switchFmaWifi:matchAttempt', {
        routerid: fma.routerid,
        mac,
        mac5g,
        matchedSsid: ssid,
        matchedSsid5g: ssid5g
      });
      if (ssid) candidates.add(ssid);
      if (ssid5g) candidates.add(ssid5g);
    });

    if (!candidates.size) {
      console.log(LOG_PREFIX, 'switchFmaWifi:noBssidMatches:fallbackToAllScannedSsids');
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

    console.log(LOG_PREFIX, 'switchFmaWifi:selected', {
      selected,
      candidates: Array.from(candidates),
      updates
    });
    return selected;
  }

  async function switchFmaWifi(selected: string) {
    console.log(LOG_PREFIX, 'switchFmaWifi:connect:start', {selected});
    const switched = await CAdminNative.switchWifi(selected, '');
    console.log(LOG_PREFIX, 'switchFmaWifi:switchResult', {selected, switched});
    if (!switched) {
      Alert.alert(
        '',
        `Could not connect automatically to ${selected}. Please connect to this Wi-Fi from the Android prompt or Wi-Fi settings, then press Sync Data.`
      );
      setError2(`Please connect to ${selected} Wi-Fi to sync data with SMA.`);
      return false;
    }
    return true;
  }

  async function syncFmaData() {
    console.log(LOG_PREFIX, 'syncFmaData:start');
    if (dataExpired) {
      console.log(LOG_PREFIX, 'syncFmaData:blocked:dataExpired');
      setError2('FAG data has expired, Please Synchronize Data with SoNET Head-End System.');
      return;
    }
    setWorking(true);
    setError2('');
    try {
      await CAdminApi.checkStatus();
      const saved = await getString('fagData');
      const fagData = saved ? (JSON.parse(saved) as FagSyncData) : {};
      console.log(LOG_PREFIX, 'syncFmaData:fagDataSummary', {
        userPermissions: fagData.user_permissions?.length ?? 0,
        movies: fagData.movies?.length ?? 0,
        fmaList: fagData.fma_list?.length ?? 0,
        drmKeys: fagData.drm_keys?.length ?? 0,
        players: fagData.players?.length ?? 0,
        hasFirmware: Boolean(fagData.firmware)
      });
      const fmaOffline = await CAdminApi.getFmaData(Date.now());
      console.log(LOG_PREFIX, 'syncFmaData:getFmaData:success', fmaOffline);
      await CAdminApi.updateFmaData(fagData);
      console.log(LOG_PREFIX, 'syncFmaData:updateFmaData:success');
      await loadFmaDetails();
      Alert.alert('', 'Sync Data Success');
      const internetSSID = await getString('internetSSID');
      const currentSSID = await CAdminNative.getCurrentSsid();
      console.log(LOG_PREFIX, 'syncFmaData:restoreInternet', {internetSSID, currentSSID});
      if (internetSSID && internetSSID !== currentSSID) {
        const switched = await CAdminNative.switchWifi(internetSSID, '');
        console.log(LOG_PREFIX, 'syncFmaData:restoreWifiResult', {internetSSID, switched});
      } else if (!internetSSID) {
        const opened = await CAdminNative.openMobileData();
        console.log(LOG_PREFIX, 'syncFmaData:openMobileDataResult', {opened});
      }
      const fmaData = readDataField(fmaOffline) as Record<string, unknown> | undefined;
      console.log(LOG_PREFIX, 'syncFmaData:uploadFmaHistorySummary', {
        routerState: asArray(fmaData?.router_state).length,
        userPermissions: asArray(fmaData?.user_permissions).length,
        userDatas: asArray(fmaData?.user_datas).length
      });
      await CAdminApi.reportWifiStates(asArray(fmaData?.router_state));
      await CAdminApi.syncFmaData(asArray(fmaData?.user_permissions));
      await CAdminApi.reportUserData({report_data: asArray(fmaData?.user_datas)});
      Alert.alert('', 'Upload Data Success');
    } catch (error) {
      console.log(LOG_PREFIX, 'syncFmaData:error', {message: errorMessage(error), raw: error});
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
        <View style={styles.action}><PrimaryButton title="FETCH DATA" onPress={fetchDataFromFag} disabled={working || fagState !== 'CONNECTED' || hasFreshFagData} /></View>
        {!!error1 && <Text style={styles.error}>{error1}</Text>}
      </Section>

      <Section title="-----SoNET MEDIA APPLIANCE(SMA) INFO-----">
        <Pair label="Connection Status:" value={fmaState} connected={fmaState === 'CONNECTED'} />
        <Pair label="SMA Name:" value={fmaName} />
        <Pair label="SMA ID:" value={fmaId} />
        <Pair label="Last Update Time:" value={formatTime(fmaLastUpdate)} />
        <View style={styles.action}><PrimaryButton title="Sync DATA" onPress={syncFmaData} disabled={working || fmaState !== 'CONNECTED' || dataExpired} /></View>
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
