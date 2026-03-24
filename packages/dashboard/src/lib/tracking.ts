export interface TrackEventItem {
  name: string;
  data?: unknown;
}

export function normalizedPathname(pathname: string) {
  const patterns = {
    "/playground/mysql/[roomName]": /\/playground\/mysql\/(\w)+/i,
  };

  for (const [pattern, reg] of Object.entries(patterns)) {
    if (reg.test(pathname)) {
      return pattern;
    }
  }

  return pathname;
}

// Analytics disabled for poopabase
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function sendAnalyticEvents(_events: TrackEventItem[]) {
  return;
}
