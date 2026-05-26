export type Status = {
  code: number;
  message?: string;
};

export type ResponseWrapper<T> = {
  body: T;
};

export type AccountLogin = {
  status: Status;
  data?: {
    token?: string;
    token_expiry_times?: number;
    decrypt_rights?: number;
  };
};

export type RouterInfo = {
  name?: string;
  uuid?: string;
  version?: string;
  license?: string;
  state?: string;
  internet?: string;
  fma_sync_time?: number;
  current_time?: number;
  online_users?: number;
  max_session_allow?: number;
  wifi_users?: number;
  cpu_usage?: number;
  used_memory?: number;
  total_memory?: number;
  used_space?: number;
  total_space?: number;
  r2a_speed?: number;
  fma_license?: number;
  fag_connectivity?: number;
  downloadCount?: number;
  maxDownloadCount?: number;
  wifiCount?: number;
  maxWifiCount?: number;
  cpuUsage?: number;
  ramUsage?: number;
  hddUsage?: number;
  throughput?: string;
  domain?: string;
  time?: number;
  fmaSyncTime?: number;
  appVersion?: string;
};

export type RouterDetails = {
  status: Status;
  data?: RouterInfo;
  routerInfo?: RouterInfo;
};

export type MovieItem = {
  name: string;
  code?: number;
  msg?: string;
};

export type MovieItemResponse = {
  status: Status;
  movieItems: MovieItem[];
};

export type NetState = {
  status: Status;
  state?: number;
};
