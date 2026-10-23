// @vitest-environment node
// server/s3.mjs: the SigV4 signer against AWS's published "get-vanilla" test vector, and a PUT/LIST/GET/DELETE round trip on a local fake.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, test } from 'vitest'
// @ts-expect-error plain .mjs
import { EMPTY_SHA, authorization, loadS3Config, s3Client } from '../../server/s3.mjs'

test('SigV4 matches the AWS get-vanilla known answer', () => {
  const a = authorization({
    method: 'GET',
    path: '/',
    headers: { host: 'example.amazonaws.com', 'x-amz-date': '20150830T123600Z' },
    payloadHash: EMPTY_SHA,
    region: 'us-east-1',
    service: 'service',
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    amzDate: '20150830T123600Z',
  })
  expect(a).toBe(
    'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
  )
})

let srv: Server
afterAll(() => srv?.close())
test('PUT, LIST, GET, DELETE against a local fake (path style) and a bad settings file', async () => {
  const store = new Map<string, Buffer>()
  srv = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      expect(req.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AK\/\d{8}\/r1\/s3\/aws4_request/)
      const u = new URL(req.url!, 'http://x')
      const key = decodeURIComponent(u.pathname.replace(/^\/bkt\/?/, ''))
      if (req.method === 'PUT') store.set(key, Buffer.concat(chunks))
      if (req.method === 'DELETE') store.delete(key)
      if (req.method === 'GET' && !key)
        return void res.end(
          `<ListBucketResult>${[...store].map(([k, v]) => `<Contents><Key>${k}</Key><LastModified>2026-01-01T00:00:00.000Z</LastModified><Size>${v.length}</Size></Contents>`).join('')}<IsTruncated>false</IsTruncated></ListBucketResult>`,
        )
      res.end(req.method === 'GET' ? store.get(key) : '')
    })
  })
  await new Promise<void>(ok => srv.listen(0, '127.0.0.1', ok))
  const d = mkdtempSync(join(tmpdir(), 's3-'))
  const cfgPath = join(d, 's3.json')
  writeFileSync(
    cfgPath,
    JSON.stringify({
      endpoint: `http://127.0.0.1:${(srv.address() as { port: number }).port}`,
      region: 'r1',
      bucket: 'bkt',
      accessKeyId: 'AK',
      secretAccessKey: 'SK',
    }),
  )
  const c = s3Client(await loadS3Config(cfgPath))
  writeFileSync(join(d, 'a.zip'), 'zipdata')
  await c.put('backups/a.zip', join(d, 'a.zip'), 7)
  expect(await c.list('backups/')).toEqual([{ key: 'backups/a.zip', bytes: 7, lastModified: '2026-01-01T00:00:00.000Z' }])
  await c.get('backups/a.zip', join(d, 'b.zip'))
  expect(readFileSync(join(d, 'b.zip'), 'utf8')).toBe('zipdata')
  await c.del('backups/a.zip')
  expect(await c.list('backups/')).toEqual([])
  writeFileSync(cfgPath, '{"region":"r"}')
  await expect(loadS3Config(cfgPath)).rejects.toThrow(/needs a bucket/)
})
