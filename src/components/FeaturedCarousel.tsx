import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  View,
  Text,
  Image,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
import { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { createApi, getImageUrl, getPreviewUrl } from '../api/jellyfin';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CAROUSEL_HEIGHT = 240;
const AUTO_ADVANCE_MS = 12000; // longer to accommodate video preview
const PREVIEW_DELAY_MS = 1500; // wait after slide settles before loading video
const PREVIEW_DURATION_MS = 8000; // how long the preview plays
const MAX_FEATURED = 8;

interface Props {
  serverUrl: string;
  token: string;
  userId: string;
  onPress: (item: BaseItemDto) => void;
}

export default function FeaturedCarousel({ serverUrl, token, userId, onPress }: Props) {
  const [items, setItems] = useState<BaseItemDto[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef<FlatList<BaseItemDto>>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchFeatured() {
      try {
        const api = createApi(serverUrl, token);
        const [ratedRes, newestRes] = await Promise.all([
          getItemsApi(api).getItems({
            userId,
            sortBy: ['CommunityRating'],
            sortOrder: ['Descending'],
            limit: 5,
            recursive: true,
            includeItemTypes: ['Movie', 'Series'],
          }),
          getItemsApi(api).getItems({
            userId,
            sortBy: ['DateCreated'],
            sortOrder: ['Descending'],
            limit: 5,
            recursive: true,
            includeItemTypes: ['Movie', 'Series'],
          }),
        ]);

        if (cancelled) return;

        const seen = new Set<string>();
        const merged: BaseItemDto[] = [];
        const ratedItems = (ratedRes.data.Items ?? []).filter(
          (item) => (item.CommunityRating ?? 0) > 0
        );

        for (const item of [...(newestRes.data.Items ?? []), ...ratedItems]) {
          if (item.Id && !seen.has(item.Id)) {
            seen.add(item.Id);
            merged.push(item);
          }
        }

        setItems(merged.slice(0, MAX_FEATURED));
      } catch (e) {
        console.error('[FeaturedCarousel] fetch error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchFeatured();
    return () => {
      cancelled = true;
    };
  }, [serverUrl, token, userId]);

  // Auto-advance; resets on manual swipe via activeIndex change
  useEffect(() => {
    if (items.length <= 1) return;
    const timer = setTimeout(() => {
      const next = (activeIndex + 1) % items.length;
      setActiveIndex(next);
      flatListRef.current?.scrollToIndex({ index: next, animated: true });
    }, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [activeIndex, items.length]);

  const onScrollEnd = (e: { nativeEvent: { contentOffset: { x: number } } }) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (index !== activeIndex) setActiveIndex(index);
  };

  if (loading) {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color="#00A4DC" />
      </View>
    );
  }

  if (items.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      <Text style={styles.sectionLabel}>Featured</Text>
      <FlatList
        ref={flatListRef}
        data={items}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        keyExtractor={(item) => item.Id!}
        renderItem={({ item, index }) => (
          <FeaturedSlide
            item={item}
            serverUrl={serverUrl}
            token={token}
            isActive={index === activeIndex}
            onPress={() => onPress(item)}
          />
        )}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
      />
      <View style={styles.dots}>
        {items.map((_, i) => (
          <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

function FeaturedSlide({
  item,
  serverUrl,
  token,
  isActive,
  onPress,
}: {
  item: BaseItemDto;
  serverUrl: string;
  token: string;
  isActive: boolean;
  onPress: () => void;
}) {
  const backdropUrl = getImageUrl(serverUrl, item.Id!, token, SCREEN_WIDTH, 'Backdrop');
  const primaryUrl = getImageUrl(serverUrl, item.Id!, token, SCREEN_WIDTH, 'Primary');
  const [imgUri, setImgUri] = useState(backdropUrl);

  const [showVideo, setShowVideo] = useState(false);
  const videoOpacity = useRef(new Animated.Value(0)).current;
  const videoRef = useRef<Video>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start position: 20% into runtime, capped at 5 minutes
  const startMs = item.RunTimeTicks
    ? Math.min(item.RunTimeTicks / 10000 * 0.2, 300_000)
    : 120_000;

  // Show/hide video based on whether this slide is active
  useEffect(() => {
    if (isActive) {
      showTimerRef.current = setTimeout(() => setShowVideo(true), PREVIEW_DELAY_MS);
    } else {
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      // Instantly hide and reset
      videoOpacity.setValue(0);
      setShowVideo(false);
    }

    return () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
    };
  }, [isActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    };
  }, []);

  const handleReadyForDisplay = async () => {
    if (!videoRef.current) return;
    try {
      // Seek to interesting part then play
      await videoRef.current.setPositionAsync(startMs);
      await videoRef.current.playAsync();

      // Fade the video overlay in
      Animated.timing(videoOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start();

      // Auto-stop after preview duration
      stopTimerRef.current = setTimeout(() => {
        Animated.timing(videoOpacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }).start(() => setShowVideo(false));
      }, PREVIEW_DURATION_MS);
    } catch {
      setShowVideo(false);
    }
  };

  const year = item.ProductionYear;
  const rating = item.OfficialRating;
  const score = item.CommunityRating;
  const genres = item.Genres?.slice(0, 3) ?? [];

  return (
    <TouchableOpacity activeOpacity={0.92} onPress={onPress} style={styles.slide}>
      {/* Static backdrop — always visible underneath */}
      <Image
        source={{ uri: imgUri }}
        style={styles.backdrop}
        resizeMode="cover"
        onError={() => imgUri === backdropUrl && setImgUri(primaryUrl)}
      />

      {/* Muted video preview — fades in over the backdrop */}
      {showVideo && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: videoOpacity }]}>
          <Video
            ref={videoRef}
            source={{ uri: getPreviewUrl(serverUrl, item.Id!, token) }}
            style={styles.backdrop}
            resizeMode={ResizeMode.COVER}
            isMuted
            shouldPlay={false}
            isLooping={false}
            onReadyForDisplay={handleReadyForDisplay}
            onError={() => setShowVideo(false)}
          />
        </Animated.View>
      )}

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={styles.gradient}
      />

      <View style={styles.slideContent}>
        <Text style={styles.title} numberOfLines={2}>
          {item.Name}
        </Text>
        <View style={styles.metaRow}>
          {year ? <Text style={styles.metaText}>{year}</Text> : null}
          {rating ? (
            <View style={styles.ratingBadge}>
              <Text style={styles.ratingText}>{rating}</Text>
            </View>
          ) : null}
          {score ? (
            <Text style={styles.metaText}>★ {score.toFixed(1)}</Text>
          ) : null}
          {genres.map((g) => (
            <View key={g} style={styles.genrePill}>
              <Text style={styles.genreText}>{g}</Text>
            </View>
          ))}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 28 },
  placeholder: {
    width: SCREEN_WIDTH,
    height: CAROUSEL_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    marginBottom: 28,
  },
  sectionLabel: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  slide: {
    width: SCREEN_WIDTH,
    height: CAROUSEL_HEIGHT,
    backgroundColor: '#1A1A1A',
    overflow: 'hidden',
  },
  backdrop: {
    width: SCREEN_WIDTH,
    height: CAROUSEL_HEIGHT,
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: CAROUSEL_HEIGHT * 0.65,
  },
  slideContent: {
    position: 'absolute',
    bottom: 14,
    left: 16,
    right: 16,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    color: '#bbb',
    fontSize: 12,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  ratingBadge: {
    borderWidth: 1,
    borderColor: '#888',
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  ratingText: { color: '#bbb', fontSize: 10 },
  genrePill: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  genreText: { color: '#ccc', fontSize: 10 },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#333',
  },
  dotActive: {
    backgroundColor: '#00A4DC',
    width: 20,
  },
});
