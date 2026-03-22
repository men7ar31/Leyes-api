type ApiError = Error & { status?: number; data?: unknown };

const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
};

const getBaseUrl = () => {
  const base = process.env.EXPO_PUBLIC_API_URL;
  if (!base) {
    throw new Error("EXPO_PUBLIC_API_URL is not set");
  }
  return base.replace(/\/$/, "");
};

const buildUrl = (path: string) => {
  if (path.startsWith("http")) return path;
  const base = getBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
};

const parseJson = async (res: Response) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

const request = async <T>(path: string, options: RequestInit): Promise<T> => {
  const url = buildUrl(path);
  const res = await fetch(url, options);
  const data = await parseJson(res);

  if (!res.ok) {
    const message =
      (data && (data.message || data.error)) ||
      `Request failed with status ${res.status}`;
    const err = new Error(message) as ApiError;
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data as T;
};

export const api = {
  get: <T>(path: string) =>
    request<T>(path, {
      method: "GET",
      headers: DEFAULT_HEADERS,
    }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      headers: DEFAULT_HEADERS,
      body: body ? JSON.stringify(body) : undefined,
    }),
};

export type { ApiError };