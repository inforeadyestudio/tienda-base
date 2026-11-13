export function normalizeComingSoon<T extends { enabled: boolean; launchAt: string | null }>(config: T, now: number): T {
  const launchMs = config.launchAt ? new Date(config.launchAt).getTime() : NaN;
  return config.enabled && Number.isFinite(launchMs) && now >= launchMs
    ? { ...config, enabled: false }
    : config;
}