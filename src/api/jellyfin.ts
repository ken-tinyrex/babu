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

export type JellyfinImageType = 'Primary' | 'Backdrop' | 'Thumb' | 'Screenshot' | 'Logo';

export function getImageUrl(
  serverUrl: string,
  itemId: string,
  token: string,
  width = 400,
  imageType: JellyfinImageType = 'Primary'
) {
  return `${serverUrl}/Items/${itemId}/Images/${imageType}?api_key=${token}&maxWidth=${width}&quality=90`;
}

export function getStreamUrl(
  serverUrl: string,
  itemId: string,
  token: string,
  mediaSourceId = itemId,
  container?: string,
) {
  const ext = container ? `.${container}` : '';
  return `${serverUrl}/Videos/${itemId}/stream${ext}?api_key=${token}&static=true&mediaSourceId=${mediaSourceId}`;
}

// HLS stream used for muted video previews in the Featured carousel
export function getPreviewUrl(serverUrl: string, itemId: string, token: string): string {
  return (
    `${serverUrl}/Videos/${itemId}/master.m3u8` +
    `?api_key=${token}` +
    `&MediaSourceId=${itemId}` +
    `&VideoCodec=h264` +
    `&AudioCodec=aac` +
    `&MaxStreamingBitrate=4000000` +
    `&DeviceId=babu-mobile-001`
  );
}
