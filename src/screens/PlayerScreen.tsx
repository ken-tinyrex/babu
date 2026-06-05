import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Player'>;

export default function PlayerScreen({ route, navigation }: Props) {
  const { streamUrl, title } = route.params;
  const videoRef = useRef<Video>(null);
  const [buffering, setBuffering] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function onPlaybackStatusUpdate(status: AVPlaybackStatus) {
    if (!status.isLoaded) {
      if (status.error) {
        setBuffering(false);
        setError(status.error);
      }
      return;
    }
    setBuffering(status.isBuffering && !status.isPlaying);
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
