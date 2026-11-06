// A minimal S3 client for the cloud backup (server/backup.mjs): SigV4 over node:crypto, PUT / GET / LIST / DELETE, no SDK.
// The settings file (the awsConfig setting) is JSON, written and kept by the operator; secretAccessKey never leaves this module:
//   { "endpoint": "https://s3.us-west-004.backblazeb2.com"   (optional: B2, R2, MinIO ...; omit for AWS),
//     "region": "us-west-004", "bucket": "my-backups", "forcePathStyle": false,
//     "accessKeyId": "...", "secretAccessKey": "..." }
// ponytail: single PUT only (no multipart) -- fine for these backup sizes (Config + Data); add multipart if a backup can exceed 5 GB.
// ponytail: the payload is hashed (one extra read of the file) rather than sent as UNSIGNED-PAYLOAD, so plain-http MinIO works too.
import { createHash, createHmac } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import { pipeline } from 'node:stream/promises'
import { fail } from './common.mjs'

const sha = d => createHash('sha256').update(d).digest('hex')
const hmac = (k, d) => createHmac('sha256', k).update(d).digest()
const enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
export const EMPTY_SHA = sha('')

/** The Authorization header value. `headers`: every header to sign (names lowercase, values trimmed); `query`: { name: value }. */
export function authorization({ method, path, query = {}, headers, payloadHash, region, service = 's3', accessKeyId, secretAccessKey, amzDate }) {
  const day = amzDate.slice(0, 8),
    names = Object.keys(headers).sort()
  const canonical = [
    method,
    path,
    Object.keys(query)
      .sort()
      .map(k => `${enc(k)}=${enc(query[k])}`)
      .join('&'),
    names.map(n => `${n}:${headers[n]}\n`).join(''),
    names.join(';'),
    payloadHash,
  ].join('\n')
  const scope = `${day}/${region}/${service}/aws4_request`
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha(canonical)].join('\n')
  const key = hmac(hmac(hmac(hmac('AWS4' + secretAccessKey, day), region), service), 'aws4_request')
  const sig = createHmac('sha256', key).update(toSign).digest('hex')
  return `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${sig}`
}

/** Read and check the settings file; a clear error (never the secret) when it is missing or wrong. */
export async function loadS3Config(path) {
  if (!path) throw fail(400, 'cloud backup isn’t set up: set awsConfig to the S3 settings file')
  let c
  try {
    c = JSON.parse(await readFile(path, 'utf8'))
  } catch (e) {
    throw fail(400, e.code === 'ENOENT' ? 'the S3 settings file (awsConfig) wasn’t found' : 'the S3 settings file isn’t valid JSON')
  }
  if (!c || typeof c !== 'object' || Array.isArray(c)) throw fail(400, 'the S3 settings file must be a JSON object')
  for (const k of ['region', 'bucket', 'accessKeyId', 'secretAccessKey'])
    if (typeof c[k] !== 'string' || !c[k] || /\s/.test(c[k])) throw fail(400, `the S3 settings file needs a ${k}`)
  if (c.endpoint !== undefined && !/^https?:\/\/[^/\s]+\/?$/.test(c.endpoint)) throw fail(400, 'the S3 settings file’s endpoint must be http(s)://host[:port]')
  if (c.forcePathStyle !== undefined && typeof c.forcePathStyle !== 'boolean') throw fail(400, 'the S3 settings file’s forcePathStyle must be true or false')
  return {
    endpoint: c.endpoint?.replace(/\/$/, ''),
    region: c.region,
    bucket: c.bucket,
    forcePathStyle: !!c.forcePathStyle,
    accessKeyId: c.accessKeyId,
    secretAccessKey: c.secretAccessKey,
  }
}

export function s3Client(cfg) {
  const base = new URL(cfg.endpoint ?? `https://s3.${cfg.region}.amazonaws.com`)
  // a custom endpoint that is an IP or localhost can't take a bucket sub-domain
  const pathStyle = cfg.forcePathStyle || (!!cfg.endpoint && /^(\d+\.\d+\.\d+\.\d+|localhost|\[.*\])$/.test(base.hostname))
  const host = pathStyle ? base.host : `${cfg.bucket}.${base.host}`
  const bare = base.hostname.replace(/^\[|\]$/g, '')
  // never sign a request to cloud-metadata / link-local (SSRF footgun), even over https
  if (/^169\.254\./.test(bare) || /^fe80:/i.test(bare)) throw fail(400, 'that S3 endpoint host isn’t allowed')
  // a LAN/loopback host may use http (local MinIO); a public endpoint must be https so the backup and its signed headers aren’t sent in the clear
  const local =
    bare === 'localhost' || bare === '::1' || /^127\./.test(bare) || /^10\./.test(bare) || /^192\.168\./.test(bare) || /^172\.(1[6-9]|2\d|3[01])\./.test(bare)
  if (base.protocol === 'http:' && !local) throw fail(400, 'a public S3 endpoint must be https')
  const lib = base.protocol === 'http:' ? http : https

  /** -> the response stream, unread. `file`: path to upload (`size` bytes). */
  function send(method, key, { query = {}, file, size, payloadHash = EMPTY_SHA } = {}) {
    const path = (pathStyle ? `/${enc(cfg.bucket)}` : '') + '/' + key.split('/').map(enc).join('/')
    const amzDate = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '')
    const headers = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate }
    const Authorization = authorization({
      method,
      path,
      query,
      headers,
      payloadHash,
      region: cfg.region,
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      amzDate,
    })
    const qs = Object.keys(query).length
      ? '?' +
        Object.keys(query)
          .sort()
          .map(k => `${enc(k)}=${enc(query[k])}`)
          .join('&')
      : ''
    return new Promise((resolve, reject) => {
      const req = lib.request(
        {
          protocol: base.protocol,
          hostname: base.hostname,
          port: base.port || undefined,
          method,
          path: path + qs,
          headers: { ...headers, Authorization, ...(file ? { 'content-length': size } : {}) },
          timeout: 120000,
        },
        resolve,
      )
      req.on('timeout', () => req.destroy(new Error('the S3 server didn’t answer in time')))
      req.on('error', e => reject(fail(502, `couldn’t reach the S3 server (${e.code || e.message})`)))
      if (file) pipeline(createReadStream(file), req).catch(reject)
      else req.end()
    })
  }
  const text = async (res, cap = 8 << 20) => {
    const chunks = []
    let n = 0
    for await (const c of res) {
      n += c.length
      if (n > cap) {
        res.destroy()
        throw fail(502, 'the S3 server sent too much data')
      }
      chunks.push(c)
    }
    return Buffer.concat(chunks).toString('utf8')
  }
  async function ok(res) {
    if (res.statusCode < 300) return res
    const why = /<Code>([^<]{1,60})<\/Code>/.exec(await text(res))?.[1]
    throw fail(502, `the S3 server refused the request (${res.statusCode}${why ? ' ' + why : ''})`)
  }
  const unx = s =>
    s
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')

  return {
    async put(key, file, bytes) {
      const h = createHash('sha256')
      await pipeline(createReadStream(file), h)
      await text(await ok(await send('PUT', key, { file, size: bytes, payloadHash: h.digest('hex') })))
    },
    /** To the file `dest`, refused past `max` bytes: a wrong object can't fill the disk. */
    async get(key, dest, max = Infinity) {
      const res = await ok(await send('GET', key))
      let bytes = 0
      const capped = async function* (chunks) {
        for await (const c of chunks) {
          if ((bytes += c.length) > max) throw Object.assign(new Error('the cloud object is too large'), { code: 413 })
          yield c
        }
      }
      try {
        await pipeline(res, capped, createWriteStream(dest, { mode: 0o600 }))
      } catch (e) {
        await rm(dest, { force: true })
        throw e
      }
    },
    async del(key) {
      await text(await ok(await send('DELETE', key)))
    },
    /** -> [{ key, bytes, lastModified }], all pages. */
    async list(prefix) {
      const out = []
      for (let token, pages = 0; ;) {
        if (++pages > 50) throw fail(502, 'too many objects under the backups prefix') // ponytail: ~50k keys cap; raise if retention ever allows more
        const query = { 'list-type': '2', prefix, ...(token ? { 'continuation-token': token } : {}) }
        const xml = await text(await ok(await send('GET', '', { query })))
        for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
          const f = n => unx(new RegExp(`<${n}>([^<]*)</${n}>`).exec(m[1])?.[1] ?? '')
          out.push({ key: f('Key'), bytes: Number(f('Size')), lastModified: f('LastModified') })
        }
        token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? unx(/<NextContinuationToken>([^<]*)</.exec(xml)?.[1] ?? '') : ''
        if (!token) return out
      }
    },
  }
}
