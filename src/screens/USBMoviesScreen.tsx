import React, {useCallback, useState} from 'react';
import {FlatList, StyleSheet, Text, View, Image, ActivityIndicator} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {CAdminApi} from '../api/cadminApi';
import type {MovieItem} from '../api/types';
import {colors} from '../theme/colors';
import {errorMessage} from '../utils/errors';

export function USBMoviesScreen() {
  const [movies, setMovies] = useState<MovieItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      fetchMovies();
    }, [])
  );

  async function fetchMovies() {
    setLoading(true);
    setError('');
    try {
      // Replicates native Android initialization checks safely
      await CAdminApi.usbCheck();
      const response = await CAdminApi.getMovies();
      setMovies(response?.movieItems ?? []);
    } catch (err) {
      setError(errorMessage(err, 'Failed to scan USB storage media'));
    } finally {
      setLoading(false);
    }
  }

  // Prevents silent thread hangs if the layout crashes during initial fetch
  if (loading && movies.length === 0) {
    return (
      <View style={[styles.page, styles.center]}>
        <ActivityIndicator size="large" color={colors.green} />
      </View>
    );
  }

  return (
    <View style={styles.page}>
      {/* Structural Top Header Banner Block matching native USBMoviesFragment configuration */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Local USB Movies ({movies.length})</Text>
      </View>

      {!!error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={movies}
        numColumns={2}
        keyExtractor={(item, index) => item?.name ? `${item.name}-${index}` : `movie-${index}`}
        contentContainerStyle={styles.list}
        renderItem={({item}) => {
          // Safeguard: Skip corrupted indices instead of breaking the bundle render tree
          if (!item) return null;

          return (
            <View style={styles.card}>
              {item.poster ? (
                <Image source={{uri: item.poster}} style={styles.poster} resizeMode="cover" />
              ) : (
                <View style={[styles.poster, styles.placeholderPoster]}>
                  <Text style={styles.placeholderText}>No Image Available</Text>
                </View>
              )}
              <Text style={styles.title} numberOfLines={2}>
                {item.name || 'Unnamed Asset String'}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={
          !loading && !error ? (
            <View style={styles.center}>
              <Text style={styles.emptyText}>No discoverable media sources found on USB interface devices.</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.white || '#FFFFFF',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  header: {
    height: 52,
    backgroundColor: colors.tab || '#202020',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  headerTitle: {
    color: colors.white || '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  list: {
    padding: 8,
  },
  card: {
    flex: 1,
    margin: 6,
    backgroundColor: '#F8F9FA',
    borderRadius: 6,
    padding: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
  },
  poster: {
    width: '100%',
    height: 180,
    borderRadius: 4,
    backgroundColor: '#E9ECEF',
  },
  placeholderPoster: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  placeholderText: {
    color: '#6C757D',
    fontSize: 11,
    textAlign: 'center',
  },
  title: {
    marginTop: 8,
    color: colors.text || '#333333',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorContainer: {
    padding: 12,
    backgroundColor: '#FFF5F5',
    margin: 8,
    borderRadius: 4,
  },
  errorText: {
    color: '#E53E3E',
    textAlign: 'center',
    fontSize: 13,
  },
  emptyText: {
    color: colors.disabled || '#999999',
    textAlign: 'center',
    fontSize: 14,
    marginTop: 40,
  },
});