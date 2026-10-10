// Share a song as a link: song JSON → deflate (CompressionStream) → base64url,
// carried in the URL hash (#/shared?s=…). Nothing is uploaded anywhere.
import { sanitizeSong } from '../state/schema.js';

const PREFIX = '1.'; // format version, so future encodings stay decodable
export const SHARE_URL_WARN_LENGTH = 8000;

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

function toBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Strip fields that don't need to travel (ids are regenerated on import if missing). */
function compact(song) {
  const { schemaVersion, createdAt, updatedAt, ...rest } = song;
  return rest;
}

export function shareSupported() {
  return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
}

/** Song → compact code string. */
export async function encodeSong(song) {
  const json = new TextEncoder().encode(JSON.stringify(compact(song)));
  return PREFIX + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

/** Code string → sanitised Song (throws a friendly error on bad input). */
export async function decodeSong(code) {
  if (typeof code !== 'string' || !code.startsWith(PREFIX)) throw new Error('This share link is not recognised (wrong or unsupported format).');
  let data;
  try {
    const bytes = await pipe(fromBase64Url(code.slice(PREFIX.length)), new DecompressionStream('deflate-raw'));
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('This share link is damaged or incomplete — ask for it to be copied again.');
  }
  return sanitizeSong(data).song;
}

/** Full shareable URL for the current page location. */
export async function shareUrl(song, base = location.href) {
  const u = new URL(base);
  u.hash = `#/shared?s=${await encodeSong(song)}`;
  return u.toString();
}
