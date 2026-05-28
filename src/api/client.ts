import {clearSession, getString, setValues} from '../state/storage';
import {CAdminNative} from '../native/CAdminNative';
import {CAdminApi} from './cadminApi';
import {getHttpFag, HTTPS_URL} from './config';
import type {ResponseWrapper, Status} from './types';

export class TokenExpiredError extends Error {}
export class NetworkRequestError extends Error {}
export class NonJsonResponseError extends Error {}

const LOG_PREFIX = '[CADMIN_API]';

type ApiOptions = {
  baseUrl?: string;
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
  bodyEncoding?: 'json' | 'raw';
  contentType?: string;
  auth?: boolean;
  gzip?: boolean;
  query?: Record<string, string | number | undefined>;
};

function buildUrl(baseUrl: string, path: string, query?: ApiOptions['query']) {
  const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

function readStatus(body: unknown): Status | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const candidate = body as {status?: Status; body?: {status?: Status}};
  return candidate.status ?? candidate.body?.status;
}

export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'User-Agent': 'OGLE-APP/Android'
  };
  
  const url = buildUrl(options.baseUrl ?? getHttpFag(), path, options.query);
  
  const getRouterHeader = async () => {
    let fmaUuid = await getString('fmaUuid');
    if (!fmaUuid) {
      try {
        const details = await CAdminApi.getRouterDetails(0);
        fmaUuid = details.routerInfo?.uuid ?? details.data?.uuid;
        if (fmaUuid) await setValues({ fmaUuid });
      } catch (e) {
        console.warn(LOG_PREFIX, 'Failed to fetch UUID for header');
      }
    }
    return fmaUuid;
  };

  // Attach Router header (Capital R) for head-end server requests
  if (url.includes('demo.aistream.tv') || url.includes('/fag/')) {
    const uuid = await getRouterHeader();
    if (uuid) {
      headers['RouterUUID'] = uuid; 
    }
  }

  if (options.auth) {
    const token = await getString('token');
    headers.Authentication = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }
  if (options.gzip) {
    headers['Content-Encoding'] = 'gzip';
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = options.contentType ?? 'application/json';
  }

  const requestBody =
    options.body === undefined
      ? undefined
      : options.bodyEncoding === 'raw'
        ? String(options.body)
        : JSON.stringify(options.body);

  // ENHANCED READABLE LOGGING: REQUEST
  console.log(
    LOG_PREFIX, 
    'request:start\n', 
    JSON.stringify({
      method: options.method ?? 'GET',
      url,
      headers: headers, // Explicitly log the headers being sent
      auth: Boolean(options.auth),
      gzip: Boolean(options.gzip),
      bodyPreview: requestBody ? requestBody.slice(0, 500) : undefined
    }, null, 2) // The '2' adds beautiful indentation
  );

  let response: Response;
  try {
    const isMediaHubRequest = url.startsWith(HTTPS_URL) || url.includes('192.168.39.20');

    if (isMediaHubRequest) {
      console.log(LOG_PREFIX, 'request:media-hub-native', {url});
      const nativeResponse = await CAdminNative.mediaHubRequest(
        options.method ?? 'GET',
        url,
        requestBody,
        headers['Content-Type']
      );
      response = {
        status: nativeResponse.status,
        ok: nativeResponse.ok,
        headers: {get: () => nativeResponse.contentType ?? null},
        text: async () => nativeResponse.text
      } as unknown as Response;
    } else {
      response = await fetch(url, {
        method: options.method ?? 'GET',
        headers,
        body: requestBody
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network request failed';
    console.log(LOG_PREFIX, 'request:network-error', {url, message});
    throw new NetworkRequestError(`${message}: ${url}`);
  }

  let parsed: ResponseWrapper<T> | T | undefined;
  const text = await response.text();
  
  // ENHANCED READABLE LOGGING: RESPONSE
  console.log(
    LOG_PREFIX, 
    'response:raw\n', 
    JSON.stringify({
      url,
      status: response.status,
      ok: response.ok,
      fullBody: text // Log the entire response body cleanly
    }, null, 2)
  );

  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      const preview = text.length > 120 ? `${text.slice(0, 120)}...` : text;
      console.log(LOG_PREFIX, 'response:non-json', {url, preview});
      throw new NonJsonResponseError(`Unexpected non-JSON response from ${url}: ${preview}`);
    }
  }

  if (response.status === 401) {
    await clearSession();
    throw new TokenExpiredError('Token expired');
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const body = (parsed as ResponseWrapper<T>)?.body ?? (parsed as T);
  const status = readStatus(body);
  
  if (status?.code === 401) {
    await clearSession();
    throw new TokenExpiredError('Token expired');
  }
  if (status && status.code !== 0) {
    throw Object.assign(new Error(status.message ?? `Status ${status.code}`), {status, body});
  }
  return body as T;
}