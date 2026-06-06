import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { useFocusEffect } from '@react-navigation/native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getPlaystateApi } from '@jellyfin/sdk/lib/utils/api/playstate-api';
import { RootStackParamList } from '../../App';
import { useAuth } from '../context/AuthContext';
import { createApi } from '../api/jellyfin';

type Props = NativeStackScreenProps<RootStackParamList, 'Player'>;

const TICKS_PER_MS = 10_000;
const REPORT_INTERVAL_MS = 10_000;

export default function PlayerScreen({ route, navigation }: Props) {
  const { streamUrl, title, itemId, startPositionTicks = 0 } = route.params;
  const { serverUrl, token } = useAuth();
  const videoRef = useRef<Video>(null);
  const [buffering, setBuffering] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const playstateApi = useRef(getPlaystateApi(createApi(serverUrl, token)));
  const positionTicksRef = useRef(startPositionTicks);
  const hasSeekRef = useRef(false);
  const lastReportedRef = useRef(0);

  useEffect(() => {
    playstateApi.current.reportPlaybackStart({
      playbackStartInfo: { ItemId: itemId, PositionTicks: startPositionTicks },
    }).catch(() => {});

    return () => {
      playstateApi.current.reportPlaybackStopped({
        playbackStopInfo: { ItemId: itemId, PositionTicks: positionTicksRef.current },
      }).catch(() => {});
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.unlockAsync();
      return () => {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      };
    }, [])
  );

  function onPlaybackStatusUpdate(status: AVPlaybackStatus) {
    if (!status.isLoaded) {
      if (status.error) {
        setBuffering(false);
        setError(status.error);
      }
      return;
    }

    setBuffering(status.isBuffering && !status.isPlaying);

    if (!hasSeekRef.current) {
      hasSeekRef.current = true;
      if (startPositionTicks > 0) {
        videoRef.current?.setPositionAsync(startPositionTicks / TICKS_PER_MS);
      }
    }

    if (status.positionMillis !== undefined) {
      positionTicksRef.current = status.positionMillis * TICKS_PER_MS;
    }

    const now = Date.now();
    if (now - lastReportedRef.current >= REPORT_INTERVAL_MS) {
      lastReportedRef.current = now;
      playstateApi.current.reportPlaybackProgress({
        playbackProgressInfo: {
          ItemId: itemId,
          PositionTicks: positionTicksRef.current,
          IsPaused: !status.isPlaying,
        },
      }).catch(() => {});
    }
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
        <Text style={styles.closeText}>✕</Text>
      </TouchableOpacity>

      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Playback failed</Text>
          <Text style={styles.errorDetail}>{error}</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.goBack}>Go back</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Video
          ref={videoRef}
          source={{ uri: streamUrl }}
          style={styles.video}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay
          useNativeControls
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
        />
      )}

      {buffering && !error && (
        <ActivityIndicator
          color="#00A4DC"
          size="large"
          style={styles.bufferingIndicator}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  closeButton: {
    position: 'absolute',
    top: 52,
    left: 16,
    zIndex: 10,
    padding: 8,
  },
  closeText: { color: '#fff', fontSize: 22 },
  title: {
    position: 'absolute',
    top: 56,
    left: 56,
    right: 16,
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    zIndex: 10,
  },
  video: { flex: 1 },
  bufferingIndicator: {
    position: 'absolute',
    alignSelf: 'center',
  },
  errorContainer: {
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  errorText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  errorDetail: { color: '#888', fontSize: 14, textAlign: 'center' },
  goBack: { color: '#00A4DC', fontSize: 15 },
});
