import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors} from '../theme/colors';

type Props = {
  label: string;
  value?: string | number;
};

export function InfoRow({label, value = 'N/A'}: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    paddingHorizontal: 18,
    backgroundColor: colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  label: {
    color: colors.text,
    fontSize: 14,
    flexShrink: 0
  },
  value: {
    color: colors.value,
    fontSize: 12,
    textAlign: 'right',
    flexShrink: 1
  }
});
