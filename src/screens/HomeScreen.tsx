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
import FeaturedCarousel from '../components/FeaturedCarousel';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

interface Section {
  library: BaseItemDto;
  items: BaseItemDto[];
}

function ItemCard({
  item,
  serverUrl,
  token,
  onPress,
}: {
  item: BaseItemDto;
  serverUrl: string;
  token: string;
  onPress: () => void;
}) {
  const thumbUrl = getImageUrl(serverUrl, item.Id!, token, 400, 'Thumb');
  const backdropUrl = getImageUrl(serverUrl, item.Id!, token, 400, 'Backdrop');
  const [imgUri, setImgUri] = useState(thumbUrl);
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <Image
        source={{ uri: imgUri }}
        style={styles.poster}
        onError={() => imgUri === thumbUrl && setImgUri(backdropUrl)}
      />
      <Text style={styles.cardTitle} numberOfLines={1}>{item.Name}</Text>
    </TouchableOpacity>
  );
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
              includeItemTypes: ['Movie', 'Series', 'Folder', 'Video', 'Audio', 'MusicVideo', 'BoxSet'],
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
        <Image source={require('../../assets/app_logo.png')} style={styles.logo} resizeMode="contain" />
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <FeaturedCarousel
          serverUrl={serverUrl}
          token={token}
          userId={userId}
          onPress={(item) => navigation.navigate('Detail', { itemId: item.Id! })}
        />
        {sections.map(({ library, items }) => (
          <View key={library.Id} style={styles.section}>
            <Text style={styles.sectionTitle}>{library.Name}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.row}
            >
              {items.map((item) => (
                <ItemCard
                  key={item.Id}
                  item={item}
                  serverUrl={serverUrl}
                  token={token}
                  onPress={() => navigation.navigate('Detail', { itemId: item.Id! })}
                />
              ))}
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
  logo: { height: 32, width: 120 },
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
  card: { width: 200, marginHorizontal: 6 },
  poster: {
    width: 200,
    height: 113,
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
  },
  cardTitle: { color: '#aaa', fontSize: 12, marginTop: 6 },
});
