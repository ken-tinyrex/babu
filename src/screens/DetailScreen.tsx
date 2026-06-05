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
import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
import { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { useAuth } from '../context/AuthContext';
import { createApi, getImageUrl, getStreamUrl } from '../api/jellyfin';
import { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Detail'>;

const STREAMABLE = new Set(['Movie', 'Episode', 'Audio', 'MusicVideo', 'Video']);
const HAS_CHILDREN = new Set(['Series', 'Season', 'Folder', 'CollectionFolder']);

export default function DetailScreen({ route, navigation }: Props) {
  const { itemId } = route.params;
  const { serverUrl, token, userId } = useAuth();
  const [item, setItem] = useState<BaseItemDto | null>(null);
  const [children, setChildren] = useState<BaseItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroImageType, setHeroImageType] = useState<'Backdrop' | 'Primary'>('Backdrop');

  useEffect(() => {
    async function load() {
      try {
        const api = createApi(serverUrl, token);
        const { data } = await getUserLibraryApi(api).getItem({ userId, itemId });
        setItem(data);

        if (HAS_CHILDREN.has(data.Type ?? '')) {
          const params =
            data.Type === 'Series'
              ? {
                  userId,
                  seriesId: data.Id!,
                  recursive: true,
                  includeItemTypes: ['Episode'] as any,
                  sortBy: ['ParentIndexNumber', 'IndexNumber'] as any,
                  sortOrder: ['Ascending'] as any,
                  limit: 200,
                }
              : {
                  userId,
                  parentId: data.Id!,
                  sortBy: ['IndexNumber', 'Name'] as any,
                  sortOrder: ['Ascending'] as any,
                  limit: 200,
                };
          const { data: childData } = await getItemsApi(api).getItems(params);
          setChildren(childData.Items ?? []);
        }
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

  const imageUrl = getImageUrl(serverUrl, item.Id!, token, 800, heroImageType);
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

        <Image
          source={{ uri: imageUrl }}
          style={styles.poster}
          resizeMode="cover"
          onError={() => heroImageType === 'Backdrop' && setHeroImageType('Primary')}
        />

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

          {children.length > 0 && (
            <View style={styles.episodesSection}>
              <Text style={styles.episodesHeading}>Episodes</Text>
              {children.map((ep) => {
                const epThumb = getImageUrl(serverUrl, ep.Id!, token, 320, 'Primary');
                const epStream = getStreamUrl(serverUrl, ep.Id!, token);
                const epLabel =
                  ep.IndexNumber != null
                    ? `${ep.IndexNumber}. ${ep.Name}`
                    : ep.Name ?? 'Untitled';
                const canPlayEp = STREAMABLE.has(ep.Type ?? '');
                return (
                  <TouchableOpacity
                    key={ep.Id}
                    style={styles.episodeRow}
                    onPress={() =>
                      canPlayEp
                        ? navigation.navigate('Player', { streamUrl: epStream, title: epLabel })
                        : navigation.navigate('Detail', { itemId: ep.Id! })
                    }
                  >
                    <Image source={{ uri: epThumb }} style={styles.epThumb} />
                    <Text style={styles.epLabel} numberOfLines={2}>{epLabel}</Text>
                    {canPlayEp && <Text style={styles.epPlay}>▶</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
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
  poster: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#1A1A1A' },
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
  episodesSection: { marginTop: 24 },
  episodesHeading: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 12 },
  episodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  epThumb: { width: 100, height: 56, borderRadius: 4, backgroundColor: '#1A1A1A' },
  epLabel: { flex: 1, color: '#ddd', fontSize: 13 },
  epPlay: { color: '#00A4DC', fontSize: 18, paddingHorizontal: 4 },
});
