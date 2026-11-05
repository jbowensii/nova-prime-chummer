// Every install method's files agree with what the app expects. distribution/smoke.sh starts the real image.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

const read = (p: string) => readFileSync(p, 'utf8')
const IMAGE = 'ghcr.io/jbowensii/nova-prime-chummer'

test('the Unraid template and its in-repo mirror are identical and use the image', () => {
  const xml = read('unraid/nova-prime-chummer.xml')
  expect(read('distribution/unraid/nova-prime-chummer.xml')).toBe(xml)
  expect(xml).toContain(IMAGE)
})

test('the compose file runs the published image with one /data volume', () => {
  const y = read('distribution/docker/docker-compose.yml')
  expect(y).toContain(`image: ${IMAGE}:latest`)
  expect(y).toContain(':/data')
})

test('the Pelican egg is valid, keeps data under /home/container and waits for the real start line', () => {
  const egg = JSON.parse(read('distribution/pelican/egg-nova-prime-chummer.json'))
  expect(egg.meta.version).toBe('PTDL_v2')
  expect(Object.values(egg.docker_images)).toEqual([`${IMAGE}:latest`])
  const data = egg.variables.find((v: { env_variable: string }) => v.env_variable === 'DATA_PATH')
  expect(data.default_value).toMatch(/^\/home\/container\//)
  expect(read('server/server.mjs')).toContain(JSON.parse(egg.config.startup).done)
  expect(egg.startup).toContain('/app/server/server.mjs')
})

test('the entrypoint honours the port a panel allocates', () => {
  const out = execFileSync('sh', ['-c', 'SERVER_PORT=1234 PORT=80; eval "$(sed -n "/^export PORT/p" docker-entrypoint.sh)"; echo $PORT'])
  expect(String(out).trim()).toBe('1234')
})

test('the desktop bundle ships Python and can find the importer', () => {
  expect(read('electron-builder.yml')).toMatch(/from: build\/python\s+to: python/)
  expect(read('electron/main.mjs')).toContain("'python', 'python.exe'")
  const ps1 = read('tools/desktop-python/build-python.ps1')
  expect(ps1).toMatch(/Add-Content \$pth\.FullName '\.\..app\.asar\.unpacked'/)
  expect(ps1).toContain('import importer')
  expect(read('package.json')).toMatch(/desktop:build.*VERSION/)
})

test('the Ubuntu script refuses private home folders and refreshes its unit on update', () => {
  const sh = read('distribution/ubuntu/install.sh')
  expect(sh).toContain('/home/* | /root/*')
  expect(sh.match(/^update_app\(\) \{[\s\S]*?^\}/m)?.[0]).toContain('write_unit')
})
