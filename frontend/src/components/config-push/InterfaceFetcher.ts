interface InterfaceMap {
  interfaces: string[];
  loopbacks: string[];
  port_channels: string[];
  ethernet: string[];
  mgmt: string[];
}

const cache = new Map<string, InterfaceMap>();

export async function fetchSwitchInterfaces(
  switchId: string,
  token: string,
  tenant?: string,
  force = false,
): Promise<InterfaceMap> {
  if (!force && cache.has(switchId)) {
    return cache.get(switchId)!;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (tenant) headers['X-Tenant-ID'] = tenant;

  const res = await fetch(
    `/api/v5/admin/switches/${switchId}/interfaces`,
    { headers },
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch interfaces: ${res.statusText}`);
  }

  const data: InterfaceMap = await res.json();
  cache.set(switchId, data);
  return data;
}

export function clearInterfaceCache(switchId?: string) {
  if (switchId) {
    cache.delete(switchId);
  } else {
    cache.clear();
  }
}
