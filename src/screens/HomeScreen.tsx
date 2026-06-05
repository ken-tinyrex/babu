import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getUserViewsApi } from '@jellyfin/sdk/lib/utils/api/user-views-api';
import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
import { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { useAuth } from '../context/AuthContext';
import { createApi, getImageUrl } from '../api/jellyfin';
import { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

interface Section {
  library: BaseItemDto;
  items: BaseItemDto[];
}

export default function HomeScreen({ navigation }: Props) {
  const { serverUrl, token, userId, logout } = useAuth();
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const api = createApi(serverUrl, token);
        const { data: views } = await getUserViewsApi(api).getUserViews({ userId });
        const libraries = views.Items ?? [];

        const sectionData = await Promise.all(
          libraries.map(async (lib) => {
            const { data } = await getItemsApi(api).getItems({
              userId,
              parentId: lib.Id!,
              limit: 20,
              sortBy: ['DateCreated'],
              sortOrder: ['Descending'],
              recursive: true,
              includeItemTypes: ['Movie', 'Series', 'Episode', 'Audio'],
            });
            return { library: lib, items: data.Items ?? [] };
          })
        );

        setSections(sectionData.filter((s) => s.items.length > 0));
      } catch (e) {
        console.error('HomeScreen load error:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [serverUrl, token, userId]);

  function renderItem(item: BaseItemDto) {
    const imageUrl = getImageUrl(serverUrl, item.Id!, token);
    return (
      <TouchableOpacity
        key={item.Id}
        style={styles.card}
        onPress={() => navigation.navigate('Detail', { itemId: item.Id! })}
      >
        <Image source={{ uri: imageUrl }} style={styles.poster} />
        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.Name}
        </Text>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#00A4DC" size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>babu</Text>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {sections.map(({ library, items }) => (
          <View key={library.Id} style={styles.section}>
            <Text style={styles.sectionTitle}>{library.Name}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.row}
            >
              {items.map(renderItem)}
            </ScrollView>
          </View>
        ))}
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  logo: { fontSize: 24, fontWeight: '700', color: '#00A4DC', letterSpacing: 1 },
  logoutText: { color: '#555', fontSize: 14 },
  section: { marginBottom: 28 },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  row: { paddingHorizontal: 10 },
  card: { width: 120, marginHorizontal: 6 },
  poster: {
    width: 120,
    height: 180,
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
  },
  cardTitle: { color: '#aaa', fontSize: 12, marginTop: 6 },
});
