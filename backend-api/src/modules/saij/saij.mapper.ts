import { logger } from '../../utils/logger';
import {
  SaijContentType,
  SaijSearchHit,
  SaijSearchHitRaw,
} from './saij.types';

const normalizeContentType = (value: any, fallback: SaijContentType): SaijContentType => {
  const normalized = String(value || '').toLowerCase();
  if (['legislacion', 'fallo', 'sumario', 'dictamen', 'doctrina', 'todo'].includes(normalized)) {
    return normalized as SaijContentType;
  }
  return fallback;
};

const safeParseJson = (payload?: string | null) => {
  if (!payload) return null;
  try {
    return JSON.parse(payload);
  } catch (err) {
    logger.warn({ err, preview: payload.slice(0, 200) }, 'No se pudo parsear documentAbstract');
    return null;
  }
};

const prettifyFriendlyDescription = (value?: string | null) => {
  if (!value) return null;
  try {
    return decodeURIComponent(value.replace(/\+/g, ' ')).replace(/-/g, ' ').trim();
  } catch {
    return value.replace(/-/g, ' ').trim();
  }
};

const joinNonEmpty = (parts: Array<string | null | undefined>, sep = ' · ') =>
  parts.filter((p) => p && String(p).trim().length > 0).map((p) => String(p).trim()).join(sep) || null;

const truncate = (text: string | undefined, max = 180) => {
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

export const mapSaijSearchHit = (
  raw: SaijSearchHitRaw,
  fallbackContentType: SaijContentType
): SaijSearchHit => {
  const abstractObj = safeParseJson(typeof raw.documentAbstract === 'string' ? raw.documentAbstract : undefined);
  const metadata = (abstractObj as any)?.document?.metadata ?? {};
  const content = (abstractObj as any)?.document?.content ?? {};

  const friendlyMeta = metadata['friendly-url'] ?? metadata['friendly_url'];
  const subdomain = friendlyMeta?.subdomain as string | undefined;
  const description = friendlyMeta?.description as string | undefined;
  const friendlyUrl =
    subdomain && description ? `https://www.saij.gob.ar/${subdomain}-${description}` : null;

  const title =
    content['titulo-norma'] ??
    content['nombre-coloquial'] ??
    prettifyFriendlyDescription(description) ??
    (raw as any).uuid ??
    '';

  const subtitle =
    truncate(content['sumario'], 180) ??
    joinNonEmpty(
      [
        content['tipo-norma']?.texto,
        content['fecha'],
        content['jurisdiccion']?.provincia ?? content['jurisdiccion']?.descripcion,
      ],
      ' · '
    );

  const summary = content['sumario'] ?? null;

  const inferredContentType =
    metadata['document-content-type'] ??
    (abstractObj as any)?.['document-content-type'] ??
    raw.documentContentType;

  const contentType = normalizeContentType(inferredContentType, fallbackContentType);

  return {
    guid: (raw as any).uuid ?? raw.guid ?? raw.id ?? '',
    title,
    subtitle,
    summary,
    contentType,
    fecha: content['fecha'] ?? null,
    estado: content['estado'] ?? null,
    jurisdiccion:
      content['jurisdiccion']?.provincia ??
      content['jurisdiccion']?.descripcion ??
      null,
    fuente: 'SAIJ',
    friendlyUrl,
    sourceUrl: friendlyUrl,
    raw,
  };
};
