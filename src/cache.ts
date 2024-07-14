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

// https://stackoverflow.com/questions/59777670/how-can-i-hash-a-string-with-sha256
export async function hashStrings(...inputs: string[]): Promise<string> {
  const concatenatedInput = inputs.join("");
  const textAsBuffer = new TextEncoder().encode(concatenatedInput);
  const hashBuffer = await crypto.subtle.digest("SHA-256", textAsBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
  return hash;
}
