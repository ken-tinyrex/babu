import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserApi } from '@jellyfin/sdk/lib/utils/api/user-api';
import { createApi } from '../api/jellyfin';

interface AuthState {
  serverUrl: string;
  token: string;
  userId: string;
}

interface AuthContextValue extends AuthState {
  loading: boolean;
  login: (serverUrl: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'babu_auth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ serverUrl: '', token: '', userId: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) setAuth(JSON.parse(raw));
      setLoading(false);
    });
  }, []);

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
    setAuth(newAuth);
  }

  async function logout() {
    await AsyncStorage.removeItem(STORAGE_KEY);
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
