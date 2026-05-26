export const HTTP_URL = 'http://192.168.39.20/';
export const HTTPS_URL = 'https://192.168.39.20:443/';
export const PING_TEST_URLS = ['https://www.google.com', 'https://www.msn.com', 'https://www.baidu.com'];

const HTTP_PORT = ':88';
export const DOMAINS = ['demo.aistream.tv', 'demo.aistream.tv'];

let fagDomain = DOMAINS[0];

export function getHttpFag() {
  return `http://${fagDomain}${HTTP_PORT}`;
}

export function getHttpsFag() {
  return `https://${fagDomain}`;
}

export function changeFma(server: string) {
  if (server?.startsWith('https://')) {
    fagDomain = server.substring('https://'.length);
  }
}

