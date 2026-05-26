import {apiRequest} from './client';
import {getHttpFag, getHttpsFag, HTTP_URL, HTTPS_URL} from './config';
import type {AccountLogin, MovieItemResponse, NetState, RouterDetails, Status} from './types';

export const CAdminApi = {
  signIn(name: string, password: string) {
    return apiRequest<AccountLogin>('fag/admin/rights', {
      baseUrl: getHttpsFag(),
      query: {name, password}
    });
  },
  usbCheck() {
    return apiRequest<Status>('router_manager/content/check', {baseUrl: HTTPS_URL});
  },
  syncUpdate(syncSource: unknown) {
    return apiRequest<Status>('router_manager/content/update', {
      baseUrl: HTTPS_URL,
      method: 'POST',
      body: syncSource
    });
  },
  getUpdatingMovies() {
    return apiRequest<MovieItemResponse>('router_manager/content/get_updating_source', {baseUrl: HTTPS_URL});
  },
  getTargetMovies() {
    return apiRequest<MovieItemResponse>('router_manager/content/get_target_movies', {baseUrl: HTTPS_URL});
  },
  getRouterDetails(cache = 0) {
    return apiRequest<RouterDetails>('router_manager/details', {
      baseUrl: HTTPS_URL,
      query: {cache}
    });
  },
  checkStatus() {
    return apiRequest<Status>('check_status', {baseUrl: HTTPS_URL});
  },
  checkInternet(url: string) {
    return apiRequest<NetState>('router_manager/check_internet', {
      baseUrl: HTTPS_URL,
      query: {url}
    });
  },
  speedTest() {
    return apiRequest<unknown>('router_manager/speed_test', {baseUrl: HTTP_URL});
  },
  updateFmaData(data: unknown) {
    return apiRequest<unknown>('router_manager/update_offline_data', {
      baseUrl: HTTPS_URL,
      method: 'POST',
      body: data
    });
  },
  getFmaData(time: number) {
    return apiRequest<unknown>('router_manager/get_offline_data', {
      baseUrl: HTTPS_URL,
      query: {time}
    });
  },
  checkMix() {
    return apiRequest<unknown>('router_manager/mix/check', {baseUrl: HTTPS_URL});
  },
  mix() {
    return apiRequest<unknown>('router_manager/mix/mix', {baseUrl: HTTPS_URL});
  },
  getMixProgress() {
    return apiRequest<unknown>('router_manager/mix/progress', {baseUrl: HTTPS_URL});
  },
  demix() {
    return apiRequest<unknown>('router_manager/mix/demix', {baseUrl: HTTPS_URL});
  },
  getRechargePins() {
    return apiRequest<unknown>('fag/admin/data', {baseUrl: getHttpsFag(), auth: true});
  },
  getMovies() {
    return apiRequest<unknown>('fag/allmovies', {baseUrl: getHttpsFag(), auth: true});
  },
  getWifiList() {
    return apiRequest<unknown>('fag/routers', {baseUrl: getHttpsFag(), auth: true});
  },
  getDrmKeys() {
    return apiRequest<unknown>('fag/allmovies/drm', {baseUrl: getHttpsFag(), auth: true});
  },
  getAppPlayerInfos() {
    return apiRequest<unknown>('fag/admin/players', {baseUrl: getHttpsFag(), auth: true});
  },
  getFmaVersionInfo() {
    return apiRequest<unknown>('fag/router/update?version=0.0.0.0', {baseUrl: getHttpsFag(), auth: true});
  },
  getConfigInfo() {
    return apiRequest<unknown>('fag/router/me', {baseUrl: getHttpsFag(), auth: true});
  },
  syncFmaData(data: unknown[]) {
    return apiRequest<unknown>('fag/admin/data', {baseUrl: getHttpsFag(), method: 'POST', auth: true, gzip: true, body: data});
  },
  reportUserData(data: unknown) {
    return apiRequest<unknown>('fag/data/report', {baseUrl: getHttpsFag(), method: 'POST', auth: true, gzip: true, body: data});
  },
  reportWifiStates(data: unknown) {
    const reportData = Array.isArray(data) ? data : [];
    return apiRequest<unknown>('fag/router/state', {
      baseUrl: getHttpsFag(),
      method: 'POST',
      auth: true,
      gzip: true,
      bodyEncoding: 'raw',
      contentType: 'text/html; charset=utf-8',
      body: `report_data=${JSON.stringify(reportData)}`
    });
  },
  getFagVersion(baseUrl = getHttpFag()) {
    return apiRequest<unknown>('fag/version', {baseUrl});
  }
};
