import { env } from '../../config/env';
import { HttpError } from '../../utils/httpError';
import { logger } from '../../utils/logger';

type ProxyFailureReason = 'forbidden' | 'timeout' | 'econnreset' | 'etimedout' | 'econnrefused' | 'network_error' | 'unknown';

type SaijProxyConfig = {
  id: string;
  host: string;
  port: number;
  username: string;
  password: string;
  agentUrl: string;
};

type SaijProxyRuntimeState = {
  totalRequests: number;
  successCount: number;
  failCount: number;
  lastError: string | null;
  blockedUntil: number | null;
  lastUsedAt: number | null;
};

export type SaijProxySelection = {
  proxyId: string;
  host: string;
  port: number;
  agentUrl: string;
};

const isRetryableNetworkCode = (code?: string | null) => {
  const normalized = String(code || '').trim().toUpperCase();
  return normalized === 'ECONNRESET' || normalized === 'ETIMEDOUT' || normalized === 'ECONNREFUSED' || normalized === 'ECONNABORTED';
};

const parseProxyFailureReason = (input: { status?: number; errorCode?: string | null; message?: string | null }): ProxyFailureReason => {
  if (input.status === 403) return 'forbidden';
  const code = String(input.errorCode || '').trim().toUpperCase();
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') return 'timeout';
  if (code === 'ECONNRESET') return 'econnreset';
  if (code === 'ECONNREFUSED') return 'econnrefused';
  if (isRetryableNetworkCode(code)) return 'network_error';
  return 'unknown';
};

const shouldBlockProxy = (reason: ProxyFailureReason) =>
  reason === 'forbidden' ||
  reason === 'timeout' ||
  reason === 'econnreset' ||
  reason === 'etimedout' ||
  reason === 'econnrefused' ||
  reason === 'network_error';

const parseProxyToken = (rawToken: string, index: number): SaijProxyConfig | null => {
  const token = String(rawToken || '').trim();
  if (!token) return null;
  const withProtocol = token.includes('://') ? token : `http://${token}`;
  try {
    const parsed = new URL(withProtocol);
    const host = String(parsed.hostname || '').trim();
    const port = Number(parsed.port || '0');
    const username = decodeURIComponent(parsed.username || '');
    const password = decodeURIComponent(parsed.password || '');
    if (!host || !Number.isFinite(port) || port <= 0) return null;
    if (!username || !password) return null;
    const safeUsername = encodeURIComponent(username);
    const safePassword = encodeURIComponent(password);
    const agentUrl = `${parsed.protocol || 'http:'}//${safeUsername}:${safePassword}@${host}:${port}`;
    return {
      id: `proxy-${index + 1}`,
      host,
      port,
      username,
      password,
      agentUrl,
    };
  } catch {
    return null;
  }
};

class SaijProxyPool {
  private readonly enabled: boolean;
  private readonly proxies: SaijProxyConfig[];
  private readonly stateByProxyId = new Map<string, SaijProxyRuntimeState>();
  private readonly cooldownMs: number;
  private cursor = 0;

  constructor() {
    this.enabled = env.saijProxyEnabled;
    this.cooldownMs = env.saijProxyCooldownMs;
    this.proxies = this.parseProxyList(env.saijProxyList);
    this.proxies.forEach((proxy) => {
      this.stateByProxyId.set(proxy.id, {
        totalRequests: 0,
        successCount: 0,
        failCount: 0,
        lastError: null,
        blockedUntil: null,
        lastUsedAt: null,
      });
    });

    logger.info(
      {
        proxyEnabled: this.enabled,
        configuredProxies: this.proxies.length,
      },
      'SAIJ proxy pool initialized'
    );
  }

  isEnabled() {
    return this.enabled;
  }

  getMaxAttempts() {
    return env.saijProxyMaxAttempts;
  }

  assertReady() {
    if (!this.enabled) return;
    if (this.proxies.length > 0) return;
    throw new HttpError(503, 'saij_proxy_pool_empty', 'No hay proxies validos configurados para SAIJ');
  }

  acquireProxy(): SaijProxySelection {
    this.assertReady();
    const now = Date.now();
    const available: SaijProxyConfig[] = [];
    for (const proxy of this.proxies) {
      const state = this.stateByProxyId.get(proxy.id);
      if (!state) continue;
      if (state.blockedUntil && state.blockedUntil > now) continue;
      available.push(proxy);
    }

    if (available.length < 1) {
      throw new HttpError(503, 'saij_proxy_pool_exhausted', 'No se pudo acceder a SAIJ usando los proxies configurados');
    }

    const selected = available[this.cursor % available.length];
    this.cursor = (this.cursor + 1) % Math.max(1, available.length);

    const state = this.stateByProxyId.get(selected.id);
    if (state) {
      state.totalRequests += 1;
      state.lastUsedAt = now;
    }

    return {
      proxyId: selected.id,
      host: selected.host,
      port: selected.port,
      agentUrl: selected.agentUrl,
    };
  }

  markSuccess(proxyId: string) {
    const state = this.stateByProxyId.get(proxyId);
    if (!state) return;
    state.successCount += 1;
    state.lastError = null;
    state.blockedUntil = null;
    state.lastUsedAt = Date.now();
  }

  markFailure(
    proxyId: string,
    input: {
      status?: number;
      errorCode?: string | null;
      message?: string | null;
    }
  ) {
    const state = this.stateByProxyId.get(proxyId);
    if (!state) return;
    const reason = parseProxyFailureReason(input);
    state.failCount += 1;
    state.lastError = input.message || input.errorCode || reason;
    state.lastUsedAt = Date.now();

    if (shouldBlockProxy(reason)) {
      state.blockedUntil = Date.now() + this.cooldownMs;
    }
  }

  getSanitizedStats() {
    const now = Date.now();
    const stats = this.proxies.map((proxy) => {
      const state = this.stateByProxyId.get(proxy.id);
      const blockedUntil = state?.blockedUntil ?? null;
      const blocked = Boolean(blockedUntil && blockedUntil > now);
      return {
        proxyId: proxy.id,
        host: proxy.host,
        port: proxy.port,
        totalRequests: state?.totalRequests ?? 0,
        successCount: state?.successCount ?? 0,
        failCount: state?.failCount ?? 0,
        lastError: state?.lastError ?? null,
        blockedUntil: blockedUntil ? new Date(blockedUntil).toISOString() : null,
        lastUsedAt: state?.lastUsedAt ? new Date(state.lastUsedAt).toISOString() : null,
        blocked,
      };
    });

    return {
      proxyEnabled: this.enabled,
      totalProxies: this.proxies.length,
      availableProxies: stats.filter((item) => !item.blocked).length,
      blockedProxies: stats.filter((item) => item.blocked).length,
      proxies: stats,
    };
  }

  private parseProxyList(rawList: string): SaijProxyConfig[] {
    const tokens = String(rawList || '')
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean);
    if (tokens.length < 1) return [];

    const parsed = tokens
      .map((token, index) => parseProxyToken(token, index))
      .filter((item): item is SaijProxyConfig => Boolean(item));

    if (tokens.length > 0 && parsed.length < 1) {
      logger.error(
        {
          configuredTokens: tokens.length,
          validTokens: parsed.length,
        },
        'SAIJ proxy pool has no valid proxy entries'
      );
    }

    return parsed;
  }
}

export const saijProxyPool = new SaijProxyPool();

