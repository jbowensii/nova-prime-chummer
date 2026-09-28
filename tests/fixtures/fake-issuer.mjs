// A made-up OpenID Connect issuer on 127.0.0.1 for the server tests and e2e: discovery, a key set (RSA and EC keys),
// /authorize (consents at once and sends the browser back), /token (checks the client, the code and PKCE) and /userinfo.
// Everything it does can be bent through the returned object to make each failure the server must refuse.
import { createHash, createHmac, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { createServer } from 'node:http'

const b64u = v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url')

export async function fakeIssuer({ clientId = 'chummer', secret = 'fake-client-secret-1' } = {}) {
  const keys = {}
  const addKey = (kid, alg) => {
    keys[kid] = { alg, ...(alg === 'ES256' ? generateKeyPairSync('ec', { namedCurve: 'P-256' }) : generateKeyPairSync('rsa', { modulusLength: 2048 })) }
  }
  addKey('rsa1', 'RS256'); addKey('ec1', 'ES256')
  const f = {
    base: '', clientId, secret, addKey,
    user: { sub: 'u-kim', preferred_username: 'kim', email: 'kim@example.test', email_verified: true },
    alg: 'RS256', kid: 'rsa1', // how the next ID token is signed (alg none/HS256 too)
    published: ['rsa1', 'ec1'], // the key set's kids
    claims: {}, // merged into the next ID tokens (a value of undefined drops that claim)
    userinfoOnly: false, // preferred_username and email only at /userinfo (as Authelia does by default)
    tokenAuth: 'client_secret_basic', discovery: {}, deny: false, corrupt: false,
    delay: {}, huge: {}, // path -> ms before answering / path -> answer 100 KB
    issued: [], // every token and code handed out: none may reach a log
    codes: new Map(),
  }
  const idToken = nonce => {
    const now = Math.floor(Date.now() / 1000)
    const claims = { iss: f.base, aud: f.clientId, sub: f.user.sub, iat: now, exp: now + 300, nonce,
      ...(f.userinfoOnly ? {} : { preferred_username: f.user.preferred_username, email: f.user.email, email_verified: f.user.email_verified }), ...f.claims }
    for (const k of Object.keys(claims)) if (claims[k] === undefined) delete claims[k]
    const head = `${b64u({ alg: f.alg, kid: f.kid, typ: 'JWT' })}.${b64u(claims)}`
    let sig = f.alg === 'none' ? Buffer.alloc(0) : f.alg === 'HS256' ? createHmac('sha256', f.secret).update(head).digest()
      : sign('sha256', Buffer.from(head), { key: keys[f.kid].privateKey, dsaEncoding: 'ieee-p1363' })
    if (f.corrupt) sig = Buffer.from(sig.map((b, i) => i === 5 ? b ^ 1 : b))
    return `${head}.${sig.toString('base64url')}`
  }
  const answer = (res, code, body, type = 'application/json') => res.writeHead(code, { 'Content-Type': type }).end(typeof body === 'string' ? body : JSON.stringify(body))

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, f.base), p = url.pathname
    if (f.delay[p]) await new Promise(ok => setTimeout(ok, f.delay[p]))
    if (res.destroyed) return
    if (f.huge[p]) return answer(res, 200, JSON.stringify({ pad: 'x'.repeat(100 * 1024) }))
    if (p === '/.well-known/openid-configuration') return answer(res, 200, { issuer: f.base, authorization_endpoint: `${f.base}/authorize`,
      token_endpoint: `${f.base}/token`, jwks_uri: `${f.base}/jwks`, userinfo_endpoint: `${f.base}/userinfo`, response_types_supported: ['code'],
      code_challenge_methods_supported: ['S256'], id_token_signing_alg_values_supported: ['RS256', 'ES256'], ...f.discovery })
    if (p === '/jwks') return answer(res, 200, { keys: f.published.map(kid => ({ ...keys[kid].publicKey.export({ format: 'jwk' }), kid, alg: keys[kid].alg, use: 'sig' })) })
    if (p === '/authorize') {
      const q = url.searchParams, back = new URL(q.get('redirect_uri'))
      if (q.get('client_id') !== f.clientId || q.get('response_type') !== 'code' || q.get('code_challenge_method') !== 'S256' || q.get('scope') !== 'openid profile email')
        return answer(res, 400, 'bad authorize request', 'text/plain')
      back.searchParams.set('state', q.get('state'))
      if (f.deny) back.searchParams.set('error', 'access_denied')
      else {
        const code = randomBytes(16).toString('hex')
        f.codes.set(code, { nonce: q.get('nonce'), challenge: q.get('code_challenge'), redirect: q.get('redirect_uri') })
        f.issued.push(code)
        back.searchParams.set('code', code)
      }
      return res.writeHead(302, { Location: back.href }).end()
    }
    if (p === '/token' && req.method === 'POST') {
      let body = ''
      for await (const c of req) body += c
      const form = new URLSearchParams(body)
      const basic = /^Basic (.+)$/.exec(req.headers.authorization ?? '')?.[1]
      const [id, pw] = basic ? Buffer.from(basic, 'base64').toString().split(':').map(decodeURIComponent) : [form.get('client_id'), form.get('client_secret')]
      if ((f.tokenAuth === 'client_secret_basic') !== !!basic || id !== f.clientId || pw !== f.secret) return answer(res, 401, { error: 'invalid_client' })
      const c = f.codes.get(form.get('code'))
      f.codes.delete(form.get('code'))
      if (!c || c.redirect !== form.get('redirect_uri') || createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url') !== c.challenge)
        return answer(res, 400, { error: 'invalid_grant' })
      const access = randomBytes(16).toString('hex'), id_token = idToken(c.nonce)
      f.issued.push(access, id_token)
      return answer(res, 200, { access_token: access, token_type: 'Bearer', expires_in: 300, id_token })
    }
    if (p === '/userinfo') {
      if (!f.issued.includes(/^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1])) return answer(res, 401, { error: 'invalid_token' })
      return answer(res, 200, { ...f.user })
    }
    answer(res, 404, 'not found', 'text/plain')
  })
  await new Promise(ok => server.listen(0, '127.0.0.1', ok))
  f.base = `http://127.0.0.1:${server.address().port}`
  f.close = () => { server.closeAllConnections(); server.close() }
  return f
}
