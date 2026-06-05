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
} from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const [serverUrl, setServerUrl] = useState('http://192.168.100.2:8096');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!serverUrl.trim() || !username.trim()) {
      Alert.alert('Missing fields', 'Please enter server URL and username.');
      return;
    }
    setLoading(true);
    try {
      await login(serverUrl.trim(), username.trim(), password);
    } catch {
      Alert.alert('Login failed', 'Could not connect to server. Check the URL and credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Text style={styles.title}>babu</Text>
      <Text style={styles.subtitle}>Your personal media player</Text>

      <TextInput
        style={styles.input}
        placeholder="Server URL"
        placeholderTextColor="#555"
        value={serverUrl}
        onChangeText={setServerUrl}
        autoCapitalize="none"
        keyboardType="url"
      />
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
  title: {
    fontSize: 52,
    fontWeight: '700',
    color: '#00A4DC',
    marginBottom: 8,
    letterSpacing: 3,
  },
  subtitle: {
    fontSize: 14,
    color: '#555',
    marginBottom: 48,
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
