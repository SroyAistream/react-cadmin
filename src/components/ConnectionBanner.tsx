import React from 'react';
import {StyleSheet, Text} from 'react-native';
import {colors} from '../theme/colors';
import {strings} from '../theme/strings';

export function ConnectionBanner({state}: {state: number}) {
  if (state === 0) {
    return null;
  }
  const backgroundColor = state === 1 ? colors.green : state === 3 ? colors.warn : colors.error;
  const text = state === 1 ? strings.connectNotice : state === 3 ? strings.noInternetNotice : strings.noConnectNotice;
  return <Text style={[styles.banner, {backgroundColor}]}>{text}</Text>;
}

const styles = StyleSheet.create({
  banner: {
    height: 25,
    color: colors.white,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 13
  }
});
