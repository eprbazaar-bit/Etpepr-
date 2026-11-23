export interface ApiJsonResponse<T> {
  ok: boolean;
  status: number;
  data: T | null;
  isHtmlFallback: boolean;
  error?: string;
}

function getApiBaseUrl(): string {
  const configured =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
      ? String(import.meta.env.VITE_API_BASE_URL).trim()
      : '';
  return configured.replace(/\/+$/, '');
}

export function resolveApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBaseUrl();
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

function looksLikeHtml(contentType: string, bodyText: string): boolean {
  const ct = contentType.toLowerCase();
  if (ct.includes('text/html') || ct.includes('application/xhtml')) {
    return true;
  }
  const trimmed = bodyText.trimStart().toLowerCase();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html') || trimmed.startsWith('<head') || trimmed.startsWith('<body');
}

export async function apiFetchJson<T extends { error?: string }>(
  path: string,
  init: RequestInit = {},
  unavailableMessage = 'Backend API service is not connected on this host.'
): Promise<ApiJsonResponse<T>> {
  try {
    const resp = await fetch(resolveApiUrl(path), init);
    const contentType = resp.headers.get('content-type') || '';
    const rawText = await resp.text();

    if (looksLikeHtml(contentType, rawText)) {
      return {
        ok: false,
        status: resp.status,
        data: null,
        isHtmlFallback: true,
        error: unavailableMessage,
      };
    }

    if (!rawText.trim()) {
      return {
        ok: resp.ok,
        status: resp.status,
        data: null,
        isHtmlFallback: false,
        error: resp.ok ? undefined : `Request failed (HTTP ${resp.status}).`,
      };
    }

    try {
      const parsed = JSON.parse(rawText) as T;
      return {
        ok: resp.ok,
        status: resp.status,
        data: parsed,
        isHtmlFallback: false,
        error: resp.ok ? undefined : parsed?.error || `Request failed (HTTP ${resp.status}).`,
      };
    } catch {
      return {
        ok: false,
        status: resp.status,
        data: null,
        isHtmlFallback: false,
        error: unavailableMessage,
      };
    }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      isHtmlFallback: false,
      error: err instanceof Error ? err.message : unavailableMessage,
    };
  }
}
