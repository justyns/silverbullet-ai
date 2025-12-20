let cache: { [key: string]: any } = {};

export function setCache(key: string, value: any) {
  cache[key] = value;
}

export function getCache(key: string): any {
  return cache[key];
}

export function clearCache() {
  cache = {};
}

export function removeCache(key: string) {
  delete cache[key];
}

export function hasCache(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(cache, key);
}
