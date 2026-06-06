import React, { useCallback, useState } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { getUserLibraryApi } from '@jellyfin/sdk/lib/utils/api/user-library-api';
import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
import { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { useAuth } from '../context/AuthContext';
import { createApi, getImageUrl, getStreamUrl } from '../api/jellyfin';
import { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Detail'>;

const STREAMABLE = new Set(['Movie', 'Episode', 'Audio', 'MusicVideo', 'Video']);
const HAS_CHILDREN = new Set(['Series', 'Season', 'Folder', 'CollectionFolder']);

function formatTicks(ticks: number): string {
  const totalSeconds = Math.floor(ticks / 10_000_000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function DetailScreen({ route, navigation }: Props) {
  const { itemId } = route.params;
  const { serverUrl, token, userId } = useAuth();
  const [item, setItem] = useState<BaseItemDto | null>(null);
  const [children, setChildren] = useState<BaseItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroImageType, setHeroImageType] = useState<'Backdrop' | 'Primary'>('Backdrop');

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);

      async function load() {
        try {
          const api = createApi(serverUrl, token);
          const { data } = await getUserLibraryApi(api).getItem({ userId, itemId });
          if (cancelled) return;
          setItem(data);

          if (HAS_CHILDREN.has(data.Type ?? '')) {
            const params = {
              userId,
              parentId: data.Id!,
              sortBy: ['IndexNumber', 'SortName'] as any,
              sortOrder: ['Ascending'] as any,
              limit: 200,
            };
            const { data: childData } = await getItemsApi(api).getItems(params);
            if (!cancelled) setChildren(childData.Items ?? []);
          }
        } catch (e) {
          console.error('DetailScreen load error:', e);
        } finally {
          if (!cancelled) setLoading(false);
        }
      }

      load();
      return () => { cancelled = true; };
    }, [itemId, serverUrl, token, userId])
  );

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

  const resumeTicks = item.UserData?.PlaybackPositionTicks ?? 0;
  const isWatched = item.UserData?.Played ?? false;
  const hasResume = resumeTicks > 0 && !isWatched;

  function navigateToPlayer(itemId: string, streamUrl: string, title: string, startPositionTicks = 0) {
    navigation.navigate('Player', { streamUrl, title, itemId, startPositionTicks });
  }

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
            {isWatched && (
              <View style={styles.watchedBadge}>
                <Text style={styles.watchedText}>✓ Watched</Text>
              </View>
            )}
          </View>

          {!!genres && <Text style={styles.genres}>{genres}</Text>}

          {canPlay && (
            <View style={styles.playActions}>
              {hasResume && (
                <TouchableOpacity
                  style={styles.playButton}
                  onPress={() => navigateToPlayer(item.Id!, streamUrl, item.Name ?? 'Playing', resumeTicks)}
                >
                  <Text style={styles.playButtonText}>▶  Resume from {formatTicks(resumeTicks)}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={hasResume ? styles.playButtonSecondary : styles.playButton}
                onPress={() => navigateToPlayer(item.Id!, streamUrl, item.Name ?? 'Playing')}
              >
                <Text style={hasResume ? styles.playButtonSecondaryText : styles.playButtonText}>
                  {hasResume ? 'Play from beginning' : '▶  Play'}
                </Text>
              </TouchableOpacity>
            </View>
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
                const epWatched = ep.UserData?.Played ?? false;
                const epResumeTicks = ep.UserData?.PlaybackPositionTicks ?? 0;
                const epProgress = ep.UserData?.PlayedPercentage ?? 0;
                const showProgress = epResumeTicks > 0 && !epWatched;

                return (
                  <TouchableOpacity
                    key={ep.Id}
                    style={styles.episodeRow}
                    onPress={() =>
                      canPlayEp
                        ? navigateToPlayer(ep.Id!, epStream, epLabel, epResumeTicks)
                        : navigation.navigate('Detail', { itemId: ep.Id! })
                    }
                  >
                    <View style={styles.epThumbContainer}>
                      <Image source={{ uri: epThumb }} style={styles.epThumb} />
                      {epWatched && (
                        <View style={styles.watchedOverlay}>
                          <Text style={styles.watchedOverlayText}>✓</Text>
                        </View>
                      )}
                      {showProgress && (
                        <View style={styles.progressBarTrack}>
                          <View style={[styles.progressBarFill, { width: `${Math.min(epProgress, 100)}%` as any }]} />
                        </View>
                      )}
                    </View>
                    <Text style={[styles.epLabel, epWatched && styles.epLabelWatched]} numberOfLines={2}>
                      {epLabel}
                    </Text>
                    {canPlayEp && (
                      <Text style={[styles.epPlay, epWatched && styles.epPlayWatched]}>
                        {epWatched ? '✓' : '▶'}
                      </Text>
                    )}
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
    flexWrap: 'wrap',
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
  watchedBadge: {
    backgroundColor: '#1a3a1a',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  watchedText: { color: '#4caf50', fontSize: 12, fontWeight: '600' },
  genres: { color: '#666', fontSize: 13, marginBottom: 20 },
  playActions: { gap: 10, marginBottom: 20 },
  playButton: {
    backgroundColor: '#00A4DC',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  playButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  playButtonSecondary: {
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  playButtonSecondaryText: { color: '#aaa', fontSize: 14 },
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
  epThumbContainer: { width: 100, height: 56, position: 'relative' },
  epThumb: { width: 100, height: 56, borderRadius: 4, backgroundColor: '#1A1A1A' },
  watchedOverlay: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(76,175,80,0.85)',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  watchedOverlayText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  progressBarTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  progressBarFill: {
    height: 3,
    backgroundColor: '#00A4DC',
    borderBottomLeftRadius: 4,
  },
  epLabel: { flex: 1, color: '#ddd', fontSize: 13 },
  epLabelWatched: { color: '#666' },
  epPlay: { color: '#00A4DC', fontSize: 18, paddingHorizontal: 4 },
  epPlayWatched: { color: '#4caf50', fontSize: 16 },
});
