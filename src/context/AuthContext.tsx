import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { getUserApi } from '@jellyfin/sdk/lib/utils/api/user-api';
import { createApi } from '../api/jellyfin';

interface AuthState {
  serverUrl: string;
  token: string;
  userId: string;
}

interface StoredCreds {
  serverUrl: string;
  username: string;
  password: string;
}

interface AuthContextValue extends AuthState {
  loading: boolean;
  login: (serverUrl: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'babu_auth';
const CREDS_KEY = 'babu_creds';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ serverUrl: '', token: '', userId: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    restore();
  }, []);

  async function restore() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved: AuthState = JSON.parse(raw);
        try {
          const api = createApi(saved.serverUrl, saved.token);
          await getUserApi(api).getCurrentUser();
          // Token is still valid
          setAuth(saved);
          return;
        } catch (err: any) {
          const status = err?.response?.status ?? err?.status;
          // No status means genuine network failure (no connection) — trust the cached token
          // Any HTTP status (including 5xx from a dead tunnel) means the URL is reachable
          // but broken, so fall through to silent re-auth
          if (status == null) {
            setAuth(saved);
            return;
          }
          // Token expired or server error — fall through to silent re-auth
        }
      }

      // Attempt silent re-auth with cached credentials
      const credsRaw = await SecureStore.getItemAsync(CREDS_KEY);
      if (credsRaw) {
        const creds: StoredCreds = JSON.parse(credsRaw);
        try {
          const api = createApi(creds.serverUrl);
          const { data } = await getUserApi(api).authenticateUserByName({
            authenticateUserByName: { Username: creds.username, Pw: creds.password },
          });
          const newAuth: AuthState = {
            serverUrl: creds.serverUrl,
            token: data.AccessToken!,
            userId: data.User!.Id!,
          };
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newAuth));
          setAuth(newAuth);
        } catch {
          // Credentials no longer valid — clear them and show login
          await SecureStore.deleteItemAsync(CREDS_KEY);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function login(serverUrl: string, username: string, password: string) {
    const api = createApi(serverUrl);
    const { data } = await getUserApi(api).authenticateUserByName({
      authenticateUserByName: { Username: username, Pw: password },
    });
    const newAuth: AuthState = {
      serverUrl,
      token: data.AccessToken!,
      userId: data.User!.Id!,
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newAuth));
    await SecureStore.setItemAsync(CREDS_KEY, JSON.stringify({ serverUrl, username, password }));
    setAuth(newAuth);
  }

  async function logout() {
    await AsyncStorage.removeItem(STORAGE_KEY);
    await SecureStore.deleteItemAsync(CREDS_KEY);
    setAuth({ serverUrl: '', token: '', userId: '' });
  }

  return (
    <AuthContext.Provider value={{ ...auth, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
