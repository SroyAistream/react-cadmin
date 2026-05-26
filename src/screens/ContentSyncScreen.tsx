import React, {useCallback, useState} from 'react';
import {Alert, FlatList, StyleSheet, Text, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {CAdminApi} from '../api/cadminApi';
import type {MovieItem, Status} from '../api/types';
import {ConnectionBanner} from '../components/ConnectionBanner';
import {PrimaryButton} from '../components/PrimaryButton';
import {CAdminNative} from '../native/CAdminNative';
import {colors} from '../theme/colors';
import {errorMessage} from '../utils/errors';

export function ContentSyncScreen() {
  const [connectionState, setConnectionState] = useState(0);
  const [progress, setProgress] = useState(0);
  const [movies, setMovies] = useState<MovieItem[]>([]);
  const [syncDir, setSyncDir] = useState('');
  const [mode, setMode] = useState<0 | 1>(0);
  const [canSync, setCanSync] = useState(false);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  async function loadData() {
    setError('');
    try {
      const status = await CAdminApi.usbCheck();
      handleStatus(status);
      setConnectionState(1);
    } catch (err) {
      setConnectionState(2);
      setError(errorMessage(err));
    }
  }

  function handleStatus(status: Status) {
    switch (status.code) {
      case 0:
      case 1:
      case 2:
        setCanSync(true);
        break;
      case 3:
      case 4:
        showUpdatingProgress();
        break;
    }

    if (status.code === 0 || status.code === 3) {
      setMode(0);
    } else {
      setMode(1);
    }
  }

  async function chooseFolder() {
    const dir = await CAdminNative.pickSyncDirectory();
    if (!dir) {
      return;
    }
    const valid = await CAdminNative.isValidSyncDir(dir);
    if (!valid) {
      Alert.alert('', 'Invalid sync dir, can not find movie source file.');
      return;
    }
    setSyncDir(dir);
    setCanSync(true);
  }

  async function syncUpdate() {
    if (!canSync) {
      return;
    }
    setError('');
    setProgress(0);
    setMovies([]);
    setCanSync(false);

    try {
      let syncSource: unknown = '';
      if (mode === 1) {
        if (!syncDir) {
          Alert.alert('', 'Please select a sync dir first');
          setCanSync(true);
          return;
        }
        const server = await CAdminNative.startSyncServer(syncDir);
        syncSource = {type: 'wifi', ...server};
      }
      await CAdminApi.syncUpdate(syncSource);
      await showUpdatingProgress();
    } catch (err) {
      setError(errorMessage(err, 'Sync failed'));
      setCanSync(true);
    }
  }

  async function showUpdatingProgress() {
    try {
      const source = await CAdminApi.getUpdatingMovies();
      const sourceMovies = source.movieItems ?? [];
      if (!sourceMovies.length) {
        setError(mode === 0 ? 'Not found movie resource in FMA USB Storage' : `Not found movie resource in local storage[${syncDir}]`);
        setCanSync(false);
        return;
      }
      await pollTargetMovies(sourceMovies);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function pollTargetMovies(sourceMovies: MovieItem[]) {
    const target = await CAdminApi.getTargetMovies();
    const targetMovies = target.movieItems ?? [];
    const nextProgress = Math.floor((targetMovies.length * 100) / sourceMovies.length);
    setMovies(targetMovies);
    setProgress(nextProgress);

    if (nextProgress < 100) {
      setTimeout(() => pollTargetMovies(sourceMovies).catch(err => setError(errorMessage(err))), 1000);
    } else {
      setCanSync(true);
    }
  }

  return (
    <View style={styles.page}>
      <ConnectionBanner state={connectionState} />
      {mode === 1 && (
        <View style={styles.pathRow}>
          <Text style={styles.pathLabel}>Content Folder: </Text>
          <Text style={styles.path} numberOfLines={2}>{syncDir}</Text>
          <PrimaryButton title="Change" onPress={chooseFolder} />
        </View>
      )}

      <View style={styles.body}>
        <View style={styles.progressLabel}>
          <Text>Progress: </Text>
          <Text>{progress}%</Text>
        </View>
        <View style={styles.track}><View style={[styles.fill, {width: `${progress}%`}]} /></View>
        <View style={styles.action}><PrimaryButton title="Upload" onPress={syncUpdate} disabled={!canSync} /></View>
        {!!error && <Text style={styles.error}>{error}</Text>}
        <FlatList
          data={movies}
          keyExtractor={(item, index) => `${item.name}-${index}`}
          contentContainerStyle={styles.list}
          renderItem={({item}) => (
            <View style={styles.movie}>
              <Text style={styles.movieName}>{item.name}</Text>
              <Text style={styles.movieStatus}>{item.msg ?? statusText(item.code)}</Text>
            </View>
          )}
        />
      </View>
    </View>
  );
}

function statusText(code?: number) {
  if (code === 0) return 'success';
  if (code === 1) return 'failed';
  if (code === 2) return 'pending';
  return '';
}

const styles = StyleSheet.create({
  page: {flex: 1, backgroundColor: colors.white},
  body: {paddingTop: 10},
  pathRow: {minHeight: 42, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8},
  pathLabel: {color: colors.text},
  path: {flex: 1, color: '#7ac85b'},
  progressLabel: {flexDirection: 'row', paddingHorizontal: 10},
  track: {height: 3, marginTop: 10, backgroundColor: '#d6d6d6'},
  fill: {height: 3, backgroundColor: colors.green},
  action: {alignItems: 'center', marginTop: 30},
  error: {marginTop: 20, color: colors.error, paddingHorizontal: 10},
  list: {padding: 10, paddingBottom: 60},
  movie: {paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line},
  movieName: {color: colors.text},
  movieStatus: {marginTop: 4, color: colors.value, fontSize: 12}
});
