import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getUserLibraryApi } from '@jellyfin/sdk/lib/utils/api/user-library-api';
import { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { useAuth } from '../context/AuthContext';
import { createApi, getImageUrl, getStreamUrl } from '../api/jellyfin';
import { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Detail'>;

const STREAMABLE = new Set(['Movie', 'Episode', 'Audio', 'MusicVideo']);

export default function DetailScreen({ route, navigation }: Props) {
  const { itemId } = route.params;
  const { serverUrl, token, userId } = useAuth();
  const [item, setItem] = useState<BaseItemDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const api = createApi(serverUrl, token);
        const { data } = await getUserLibraryApi(api).getItem({ userId, itemId });
        setItem(data);
      } catch (e) {
        console.error('DetailScreen load error:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [itemId, serverUrl, token, userId]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#00A4DC" size="large" />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Could not load item.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const imageUrl = getImageUrl(serverUrl, item.Id!, token, 600);
  const canPlay = STREAMABLE.has(item.Type ?? '');
  const streamUrl = getStreamUrl(serverUrl, item.Id!, token);

  const year = item.ProductionYear?.toString() ?? '';
  const rating = item.OfficialRating ?? '';
  const runtime = item.RunTimeTicks
    ? `${Math.round(item.RunTimeTicks / 600_000_000)} min`
    : '';
  const genres = item.Genres?.join(', ') ?? '';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Image source={{ uri: imageUrl }} style={styles.poster} resizeMode="cover" />

        <View style={styles.content}>
          <Text style={styles.title}>{item.Name}</Text>

          <View style={styles.metaRow}>
            {!!year && <Text style={styles.metaText}>{year}</Text>}
            {!!rating && (
              <View style={styles.ratingBadge}>
                <Text style={styles.ratingText}>{rating}</Text>
              </View>
            )}
            {!!runtime && <Text style={styles.metaText}>{runtime}</Text>}
          </View>

          {!!genres && <Text style={styles.genres}>{genres}</Text>}

          {canPlay && (
            <TouchableOpacity
              style={styles.playButton}
              onPress={() =>
                navigation.navigate('Player', {
                  streamUrl,
                  title: item.Name ?? 'Playing',
                })
              }
            >
              <Text style={styles.playButtonText}>▶  Play</Text>
            </TouchableOpacity>
          )}

          {!!item.Overview && (
            <Text style={styles.overview}>{item.Overview}</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  centered: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  errorText: { color: '#fff', fontSize: 16 },
  backLink: { color: '#00A4DC', fontSize: 14 },
  backButton: { padding: 16 },
  backText: { color: '#00A4DC', fontSize: 16 },
  poster: { width: '100%', aspectRatio: 2 / 3, backgroundColor: '#1A1A1A' },
  content: { padding: 16 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 10 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  metaText: { color: '#888', fontSize: 14 },
  ratingBadge: {
    borderWidth: 1,
    borderColor: '#555',
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  ratingText: { color: '#888', fontSize: 12 },
  genres: { color: '#666', fontSize: 13, marginBottom: 20 },
  playButton: {
    backgroundColor: '#00A4DC',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  playButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  overview: { color: '#ccc', fontSize: 15, lineHeight: 24 },
});
