import { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect } from '@react-navigation/native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getPlaystateApi } from '@jellyfin/sdk/lib/utils/api/playstate-api';
import { RootStackParamList } from '../../App';
import { useAuth } from '../context/AuthContext';
import { createApi } from '../api/jellyfin';

type Props = NativeStackScreenProps<RootStackParamList, 'Player'>;

const TICKS_PER_SECOND = 10_000_000;
const REPORT_INTERVAL_MS = 10_000;

export default function PlayerScreen({ route, navigation }: Props) {
  const { streamUrl, title, itemId, startPositionTicks = 0 } = route.params;
  const { serverUrl, token } = useAuth();

  const [error, setError] = useState<string | null>(null);

  const playstateApi = useRef(getPlaystateApi(createApi(serverUrl, token)));
  const hasSeekRef = useRef(false);
  const lastReportedRef = useRef(0);
  const positionTicksRef = useRef(startPositionTicks);
  const isPlayingRef = useRef(true);

  const player = useVideoPlayer(streamUrl, (p) => {
    p.timeUpdateEventInterval = 1;
    p.play();
  });

  // Mirror player.playing into a plain ref so callbacks never touch the native object
  useEffect(() => {
    const sub = player.addListener('playingChange', ({ isPlaying }) => {
      isPlayingRef.current = isPlaying;
    });
    return () => sub.remove();
  }, [player]);

  // Seek to resume position once ready; surface errors
  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status, error: playerError }) => {
      if (status === 'readyToPlay' && !hasSeekRef.current) {
        hasSeekRef.current = true;
        if (startPositionTicks > 0) {
          player.currentTime = startPositionTicks / TICKS_PER_SECOND;
        }
      }
      if (status === 'error') {
        setError(playerError?.message ?? 'Playback failed');
      }
    });
    return () => sub.remove();
  }, [player]);

  // Report progress to Jellyfin — uses only refs, never touches native object
  useEffect(() => {
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      positionTicksRef.current = Math.floor(currentTime * TICKS_PER_SECOND);
      const now = Date.now();
      if (now - lastReportedRef.current < REPORT_INTERVAL_MS) return;
      lastReportedRef.current = now;
      playstateApi.current.reportPlaybackProgress({
        playbackProgressInfo: {
          ItemId: itemId,
          PositionTicks: positionTicksRef.current,
          IsPaused: !isPlayingRef.current,
        },
      }).catch(() => {});
    });
    return () => sub.remove();
  }, [player]);

  // Jellyfin session start / stop
  useEffect(() => {
    playstateApi.current.reportPlaybackStart({
      playbackStartInfo: { ItemId: itemId, PositionTicks: startPositionTicks },
    }).catch(() => {});

    return () => {
      playstateApi.current.reportPlaybackStopped({
        playbackStopInfo: {
          ItemId: itemId,
          PositionTicks: positionTicksRef.current,
        },
      }).catch(() => {});
    };
  }, []);

  // Allow free rotation while the player is on screen
  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.unlockAsync();
      return () => {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      };
    }, [])
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Playback failed</Text>
          <Text style={styles.errorDetail}>{error}</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.goBack}>Go back</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <VideoView
          player={player}
          style={styles.video}
          nativeControls
          contentFit="contain"
          allowsFullscreen
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  closeButton: { padding: 8 },
  closeText: { color: '#fff', fontSize: 22 },
  title: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '600', marginLeft: 4 },
  video: { flex: 1 },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  errorText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  errorDetail: { color: '#888', fontSize: 14, textAlign: 'center' },
  goBack: { color: '#00A4DC', fontSize: 15 },
});
