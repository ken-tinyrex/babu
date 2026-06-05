import { Jellyfin } from '@jellyfin/sdk';

const jellyfin = new Jellyfin({
  clientInfo: { name: 'Babu', version: '1.0.0' },
  deviceInfo: { name: 'Babu Mobile', id: 'babu-mobile-001' },
});

export function createApi(serverUrl: string, token?: string) {
  const api = jellyfin.createApi(serverUrl);
  if (token) {
    api.accessToken = token;
  }
  return api;
}

export function getImageUrl(serverUrl: string, itemId: string, token: string, width = 400) {
  return `${serverUrl}/Items/${itemId}/Images/Primary?api_key=${token}&maxWidth=${width}&quality=90`;
}

export function getStreamUrl(serverUrl: string, itemId: string, token: string) {
  return `${serverUrl}/Videos/${itemId}/stream?api_key=${token}&static=true&mediaSourceId=${itemId}`;
}
