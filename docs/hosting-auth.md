# Hosting behind a reverse proxy, and signing in with Authelia

Advanced hosting notes for Nova Prime Chummer. The [README](../README.md) covers the basic install.

## Behind a reverse proxy (TRUST_PROXY)

Set `TRUST_PROXY` (template: **Trusted proxy**) to the address of the proxy that talks to the container, e.g.
`192.168.1.10`. Only requests from these addresses may set `X-Forwarded-For`, `-Proto` and `-Host`, which decide the
client's address (sign-in limits, logs), whether the request came over https (the secure cookie) and the public address.

- List **every hop** that adds `X-Forwarded-For`: with Cloudflare in front of NGINX Proxy Manager, list NPM's address
  *and* Cloudflare's published ranges (<https://www.cloudflare.com/ips/>), or have NPM restore the real address
  (`real_ip_header CF-Connecting-IP`). Otherwise every visitor looks like a few Cloudflare addresses, and one person's
  failed sign-ins slow down everyone's.
- Don't list a whole subnet or the Docker gateway (`172.17.0.1`) while the app's port is published: anything that can
  reach the port from there could claim any client address.
- Empty (the default): no forwarded header is believed.

The app limits sign-in tries itself (per address and network, per account, and a few password checks at a time), but
a flood from many addresses can still keep the sign-in queue full. Rate-limit `/api/auth/login` at the proxy too. In
NGINX Proxy Manager: **Advanced** tab of the proxy host (or plain nginx: the `server` block), with the zone in the
`http` context (NPM: `/data/nginx/custom/http_top.conf`):

```nginx
# http context
limit_req_zone $binary_remote_addr zone=ca2_login:10m rate=10r/m;

# server block
location = /api/auth/login {
    limit_req zone=ca2_login burst=5 nodelay;
    limit_req_status 429;
    proxy_pass $forward_scheme://$server:$port;   # NPM's variables; plain nginx: your upstream
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Behind Cloudflare, key the zone on the real client address (`$http_cf_connecting_ip`, or `real_ip_header
CF-Connecting-IP` with Cloudflare's ranges in `set_real_ip_from`), or use a Cloudflare rate-limiting rule instead.

## Cloudflare proxy and large uploads

> **Symptom:** book uploads hang at a low percentage (often around 9%) and never finish, with no error in the app or server log.

When `chummer.yourdomain.com` is **orange-cloud** in Cloudflare (proxied), all traffic — including PDF uploads — passes through Cloudflare's network. Cloudflare enforces a hard upload-size limit that cannot be changed on the free or Pro plan (~100 MB). An SR6 or Anarchy core rulebook PDF easily exceeds that. The request is silently cut off at Cloudflare's edge before it ever reaches your server; nginx and the app never see it, so there is no log entry.

**Fix: disable the Cloudflare proxy for the chummer subdomain** (gray-cloud it in your Cloudflare DNS dashboard). DNS-only mode means traffic goes directly from the browser to your server:

1. In the Cloudflare dashboard → DNS, find the `chummer` CNAME (or A) record and click the orange cloud to turn it gray (DNS only).
2. Because you are no longer behind Cloudflare's edge, **replace any Cloudflare Origin Certificate** with a Let's Encrypt certificate. A CF Origin Cert is only trusted by Cloudflare's proxy, not by browsers directly:
   ```bash
   certbot --nginx -d chummer.yourdomain.com
   ```
3. Add server-side protections to compensate for losing Cloudflare's proxy shield. At minimum, rate-limit the API and block scanners in nginx (see below), and consider fail2ban for repeated 4xx hits.

**nginx rate-limiting (add to the `http {}` block in nginx.conf):**

```nginx
limit_req_zone $binary_remote_addr zone=chummer_upload:10m rate=2r/m;
limit_req_zone $binary_remote_addr zone=chummer_api:10m rate=60r/m;
limit_conn_zone $binary_remote_addr zone=chummer_conn:10m;
```

Then inside the chummer server block's `location /` (or `location /api/`):

```nginx
limit_conn chummer_conn 20;
limit_req zone=chummer_api burst=120 nodelay;
proxy_read_timeout 300;
proxy_send_timeout 300;
```

Also make sure nginx allows large uploads (default is 1 MB):

```nginx
# inside the chummer server block
client_max_body_size 1g;
```

**Alternative (Cloudflare Enterprise only):** Cloudflare's upload-limit can only be raised above 500 MB on the Enterprise plan. The DNS-only approach above works on every plan.

## Sign in with Authelia (OpenID Connect)

Accounts can sign in through [Authelia](https://www.authelia.com/) instead of an app password, with Authelia's
two-factor. Each person still needs an account on the **Users** page with *Signs in with: Authelia*. Nobody is created
automatically: anyone else is told to ask the admin for an account. An Authelia account can't use an app password, and a
password account can't use Authelia.

- The first Authelia sign-in matches the Authelia username (`preferred_username`) to the account's username; only when
  Authelia sends no username, a verified email (`email_verified: true`) to the account's email. Only plain ASCII names
  match. Keep directory usernames and emails unique.
- That sign-in **links** the account to the Authelia user's `sub` (a stable, opaque id). From then on only that Authelia
  user gets in, even if the names change on either side. **Unlink Authelia** on the Users page undoes it (e.g. when the
  person's directory account was deleted and made again); so does changing the account's username, email or sign-in
  method, and a new issuer address unlinks every account.

1. Register the app as a client in Authelia's `configuration.yml` (Authelia 4.39 and later). The redirect
   URI is your public address + `/api/auth/oidc/callback`; **Settings → Sign-in** shows it.

   ```yaml
   identity_providers:
     oidc:
       clients:
         - client_id: 'nova-prime-chummer'
           client_name: 'Nova Prime Chummer'
           # a digest, not the secret itself. This prints both; the app gets the plain "Random Password", Authelia keeps the "Digest":
           #   authelia crypto hash generate pbkdf2 --variant sha512 --random --random.length 72 --random.charset rfc3986
           client_secret: '$pbkdf2-sha512$310000$…'
           public: false
           authorization_policy: 'two_factor'
           require_pkce: true
           pkce_challenge_method: 'S256'
           redirect_uris:
             - 'https://chummer.example.com/api/auth/oidc/callback'
           scopes: ['openid', 'profile', 'email']
           response_types: ['code']
           grant_types: ['authorization_code']
           token_endpoint_auth_method: 'client_secret_basic'  # or client_secret_post (pick the same in the app)
           id_token_signed_response_alg: 'RS256'              # or ES256 with an ES256 key in identity_providers.oidc.jwks
           userinfo_signed_response_alg: 'none'               # the app reads the userinfo endpoint as plain JSON
   ```

   Authelia (4.39+) keeps `preferred_username` and `email` out of the ID token by default; the app fetches them from the
   userinfo endpoint, so no `claims_policy` is needed.
2. In the app: **Settings → Sign-in** (admin): the issuer address exactly as Authelia names itself (e.g.
   `https://auth.example.com`, no trailing slash), the client ID, the plain client secret, **Test**, then tick *Show
   “Sign in with Authelia”* and **Save**. The secret is stored in `Config/auth-secret.xml` (readable by the
   server only), is never shown again, and is dropped when the issuer address changes. A backup carries it only with
   *Include my API keys*.
3. The app must know its public https address: set `PUBLIC_URL` (template: **Public address**, e.g.
   `https://chummer.example.com`, no path), or pass the proxy's `X-Forwarded-Proto`/`-Host` from a `TRUST_PROXY` peer.
   The redirect URI is built from it. With `PUBLIC_URL` set, the app works only at that address (the sign-in and write
   checks compare against it rather than the Host header).

The app checks the ID token itself (RS256 or ES256 signature against Authelia's published keys, issuer, audience,
expiry, nonce) and uses PKCE and a one-time state sealed in a 10-minute browser cookie; it logs who signed in, never a
token. The issuer must be https, and its authorization, token, key-set and userinfo endpoints must be on the issuer's own
host (Authelia's are). Plain http to `localhost`/`127.0.0.1` is only allowed for development, with `ALLOW_INSECURE_OIDC=1`.
Signing out of the app doesn't sign you out of Authelia.

**Link my Authelia account.** With Authelia on, someone who signs in with a password can choose **Link my Authelia
account** in the account menu. It asks for their current password, then sends them to Authelia to sign in fresh. On
success the account switches to Authelia only: the password stops working, their other sessions end and they stay signed
in. It's refused if that Authelia user is already linked to another account or names a different one. Only the admin can
switch the account back (Users page).

## Any static host

`npm run build` and serve `dist/`. The build ships no core data, so a static copy needs the core files too: unzip
a data pack (Books → Download data pack on a server) and put its `core/*.xml` in `dist/custom/imported/core/`.
Without a server there are no accounts, no Books page and no importer; runners stay in the browser.

