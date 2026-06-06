import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Image,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { useAuth } from '../context/AuthContext';
import { useJellyfinDiscovery, DiscoveredServer } from '../hooks/useJellyfinDiscovery';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

const HARDCODED_SERVER: DiscoveredServer = {
  name: 'Babu (Remote)',
  url: 'https://constitution-constructed-animation-startup.trycloudflare.com',
};

type Step = 'discovering' | 'pick-server' | 'credentials';

export default function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const { servers, scanning, rescan } = useJellyfinDiscovery();
  const [step, setStep] = useState<Step>('discovering');
  const [selectedServer, setSelectedServer] = useState<DiscoveredServer | null>(null);
  const [manualUrl, setManualUrl] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Transition out of discovering once scan completes
  React.useEffect(() => {
    if (!scanning && step === 'discovering') {
      if (servers.length === 1) {
        setSelectedServer(servers[0]);
        setStep('credentials');
      } else {
        setStep('pick-server');
      }
    }
  }, [scanning, step, servers]);

  async function handleLogin() {
    const url = selectedServer?.url ?? manualUrl.trim();
    if (!url || !username.trim()) {
      Alert.alert('Missing fields', 'Please enter a server URL and username.');
      return;
    }
    setLoading(true);
    try {
      await login(url, username.trim(), password);
    } catch {
      Alert.alert('Login failed', 'Could not connect to server. Check URL and credentials.');
    } finally {
      setLoading(false);
    }
  }

  function selectServer(server: DiscoveredServer) {
    setSelectedServer(server);
    setShowManual(false);
    setStep('credentials');
  }

  function handleManualSubmit() {
    if (!manualUrl.trim()) return;
    setSelectedServer(null);
    setStep('credentials');
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Image source={require('../../assets/icon.png')} style={styles.icon} />
      <Image source={require('../../assets/app_logo.png')} style={styles.logo} resizeMode="contain" />

      {/* Discovery phase */}
      {step === 'discovering' && (
        <View style={styles.discoveryContainer}>
          <ActivityIndicator color="#00A4DC" size="large" />
          <Text style={styles.scanningText}>Scanning for Jellyfin servers…</Text>
        </View>
      )}

      {/* Server selection */}
      {step === 'pick-server' && (
        <View style={styles.serverListContainer}>
          {(() => {
            const allServers = [
              ...servers.filter((s) => s.url !== HARDCODED_SERVER.url),
              HARDCODED_SERVER,
            ];
            return (
              <>
                <Text style={styles.sectionLabel}>Select a server</Text>
                <FlatList
                  data={allServers}
                  keyExtractor={(s) => s.url}
                  renderItem={({ item }) => (
                    <TouchableOpacity style={styles.serverCard} onPress={() => selectServer(item)}>
                      <Text style={styles.serverName}>{item.name}</Text>
                      <Text style={styles.serverUrl}>{item.url}</Text>
                    </TouchableOpacity>
                  )}
                  style={styles.serverList}
                />
              </>
            );
          })()}

          {showManual ? (
            <View style={styles.manualContainer}>
              <TextInput
                style={styles.input}
                placeholder="http://192.168.x.x:8096"
                placeholderTextColor="#555"
                value={manualUrl}
                onChangeText={setManualUrl}
                autoCapitalize="none"
                keyboardType="url"
                autoFocus
              />
              <TouchableOpacity
                style={[styles.button, !manualUrl.trim() && styles.buttonDisabled]}
                onPress={handleManualSubmit}
                disabled={!manualUrl.trim()}
              >
                <Text style={styles.buttonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.row}>
              <TouchableOpacity style={styles.linkButton} onPress={() => setShowManual(true)}>
                <Text style={styles.linkText}>Enter manually</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.linkButton} onPress={rescan}>
                <Text style={styles.linkText}>Scan again</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Credentials */}
      {step === 'credentials' && (
        <>
          <TextInput
            style={styles.input}
            placeholder="Username"
            placeholderTextColor="#555"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#555"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => {
              const url = selectedServer?.url ?? manualUrl.trim();
              navigation.navigate('Register', { serverUrl: url });
            }}
          >
            <Text style={styles.linkText}>Don't have an account? Create one</Text>
          </TouchableOpacity>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  icon: {
    width: 100,
    height: 100,
    marginBottom: 16,
  },
  logo: {
    width: 160,
    height: 56,
    marginBottom: 48,
  },
  discoveryContainer: {
    alignItems: 'center',
    gap: 16,
  },
  scanningText: {
    color: '#888',
    fontSize: 14,
  },
  serverListContainer: {
    width: '100%',
  },
  sectionLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  serverList: {
    maxHeight: 200,
  },
  serverCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  serverName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  serverUrl: {
    color: '#555',
    fontSize: 12,
  },
  noServersText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  manualContainer: {
    width: '100%',
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  linkButton: {
    padding: 8,
  },
  linkText: {
    color: '#00A4DC',
    fontSize: 13,
  },
  input: {
    width: '100%',
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  button: {
    width: '100%',
    backgroundColor: '#00A4DC',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
