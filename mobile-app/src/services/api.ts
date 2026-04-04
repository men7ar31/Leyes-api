type ApiError = Error & { status?: number; data?: unknown };

const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
};
const REQUEST_TIMEOUT_MS = 20000;

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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const externalSignal = options.signal;
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let res: Response;
  let data: any;
  try {
    res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    data = await parseJson(res);
  } catch (error: any) {
    if (controller.signal.aborted && !externalSignal?.aborted) {
      const err = new Error("La solicitud demoro demasiado. Intenta nuevamente.") as ApiError;
      err.status = 408;
      throw err;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

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
