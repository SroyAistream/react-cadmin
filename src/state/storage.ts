import AsyncStorage from '@react-native-async-storage/async-storage';

export async function getString(key: string, fallback = '') {
  return (await AsyncStorage.getItem(key)) ?? fallback;
}

export async function getNumber(key: string, fallback = 0) {
  const value = await AsyncStorage.getItem(key);
  return value == null ? fallback : Number(value);
}

export async function setValues(values: Record<string, string | number>) {
  await AsyncStorage.multiSet(Object.entries(values).map(([key, value]) => [key, String(value)]));
}

export async function clearSession() {
  await AsyncStorage.multiSet([
    ['token', ''],
    ['tokenExpireTime', '0']
  ]);
}
