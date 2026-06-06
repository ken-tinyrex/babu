import { useCallback, useEffect, useState } from 'react';

export interface DiscoveredServer {
  name: string;
  url: string;
}

const JELLYFIN_PORT = 8096;
const PROBE_TIMEOUT_MS = 1500;

// Common private network prefixes × typical server octets
const CANDIDATE_IPS: string[] = [
  '192.168.0', '192.168.1', '192.168.2', '192.168.100',
  '10.0.0', '10.0.1', '10.1.1', '172.16.0',
].flatMap((prefix) =>
  [1, 2, 3, 4, 5, 6, 7, 8, 10, 20, 50, 100, 200, 254].map((n) => `${prefix}.${n}`)
);

async function probeJellyfin(ip: string): Promise<DiscoveredServer | null> {
  const url = `http://${ip}:${JELLYFIN_PORT}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/System/Info/Public`, { signal: controller.signal });
    if (!res.ok) return null;
    const data: { ServerName?: string } = await res.json();
    return { name: data.ServerName ?? ip, url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function useJellyfinDiscovery() {
  const [servers, setServers] = useState<DiscoveredServer[]>([]);
  const [scanning, setScanning] = useState(true);

  const scan = useCallback(() => {
    setServers([]);
    setScanning(true);

    const found: DiscoveredServer[] = [];
    let settled = 0;
    const total = CANDIDATE_IPS.length;

    CANDIDATE_IPS.forEach((ip) => {
      probeJellyfin(ip).then((server) => {
        if (server) {
          found.push(server);
          setServers([...found]);
        }
        settled++;
        if (settled === total) setScanning(false);
      });
    });
  }, []);

  useEffect(() => {
    scan();
  }, [scan]);

  return { servers, scanning, rescan: scan };
}
