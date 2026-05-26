import React, {useCallback, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {CAdminApi} from '../api/cadminApi';
import type {RouterInfo} from '../api/types';
import {InfoRow} from '../components/InfoRow';
import {PrimaryButton} from '../components/PrimaryButton';
import {CAdminNative} from '../native/CAdminNative';
import {colors} from '../theme/colors';
import {formatTime} from '../utils/time';

type Tab = 'info' | 'tools';

export function SupportScreen() {
  const [tab, setTab] = useState<Tab>('info');
  const [router, setRouter] = useState<RouterInfo>({});
  const [wifiName, setWifiName] = useState('N/A');
  const [frequency, setFrequency] = useState('N/A');
  const [strength, setStrength] = useState('N/A');
  const [speed, setSpeed] = useState('0 Mbps');

  useFocusEffect(
    useCallback(() => {
      CAdminApi.getRouterDetails(0)
        .then(details => setRouter(details.routerInfo ?? {}))
        .catch(() => setRouter({}));

      CAdminNative.getCurrentSsid().then(ssid => setWifiName(ssid || 'N/A')).catch(() => undefined);
      CAdminNative.scanWifi()
        .then(list => {
          const best = list[0];
          setFrequency(best?.bssid ?? 'N/A');
          setStrength(best?.level == null ? 'N/A' : `${best.level}`);
        })
        .catch(() => undefined);
    }, [])
  );

  async function beginSpeedTest() {
    setSpeed('Testing...');
    try {
      const result = await CAdminApi.speedTest();
      setSpeed(typeof result === 'string' ? result : 'Done');
    } catch {
      setSpeed('N/A');
    }
  }

  return (
    <View style={styles.page}>
      <View style={styles.segment}>
        <SegmentButton title="Support Info" active={tab === 'info'} onPress={() => setTab('info')} />
        <SegmentButton title="Support Tools" active={tab === 'tools'} onPress={() => setTab('tools')} />
      </View>

      {tab === 'info' ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <InfoRow label="FMA Name" value={router.name} />
          <InfoRow label="FMA Current Time" value={formatTime((router.time ?? 0) * 1000)} />
          <InfoRow label="FMA Last Sync Time" value={formatTime((router.fmaSyncTime ?? 0) * 1000)} />
          <InfoRow label="FMA License" value={router.license} />
          <InfoRow label="Service State" value={router.state} />
          <InfoRow label="FMA Internet" value={router.internet} />
          <InfoRow label="Downloading | Max Allowed" value={`${router.downloadCount ?? 'N/A'} | ${router.maxDownloadCount ?? 'N/A'}`} />
          <InfoRow label="WIFI Users | Max Allowed" value={`${router.wifiCount ?? 'N/A'} | ${router.maxWifiCount ?? 'N/A'}`} />
          <InfoRow label="CPU | RAM | HDD Usage" value={`${router.cpuUsage ?? 'N/A'} | ${router.ramUsage ?? 'N/A'} | ${router.hddUsage ?? 'N/A'}`} />
          <InfoRow label="FMA | Throughput" value={router.throughput} />
          <InfoRow label="FMA Domain" value={router.domain} />
          <InfoRow label="FMA | CADMIN Version" value={`${router.appVersion ?? 'N/A'} | 2.0.4.0`} />
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.groupTitle}>WIFI State</Text>
          <InfoRow label="WIFI Name" value={wifiName} />
          <InfoRow label="WIFI Frequency" value={frequency} />
          <InfoRow label="WIFI Strength" value={strength} />
          <Text style={styles.groupTitle}>Speed Test</Text>
          <View style={styles.speedPanel}>
            <Text style={styles.speed}>{speed}</Text>
            <PrimaryButton title="Begin Test" onPress={beginSpeedTest} />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function SegmentButton({title, active, onPress}: {title: string; active: boolean; onPress: () => void}) {
  return (
    <Pressable onPress={onPress} style={styles.segmentButton}>
      <Text style={[styles.segmentText, active && styles.segmentActive]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: {flex: 1, backgroundColor: colors.page},
  segment: {height: 40, flexDirection: 'row'},
  segmentButton: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  segmentText: {fontSize: 13, color: colors.disabled},
  segmentActive: {color: colors.green},
  scroll: {paddingTop: 0, paddingBottom: 60},
  groupTitle: {color: colors.text, paddingTop: 10, paddingHorizontal: 0},
  speedPanel: {alignItems: 'center', paddingVertical: 18, gap: 12},
  speed: {fontSize: 28, color: colors.title}
});
