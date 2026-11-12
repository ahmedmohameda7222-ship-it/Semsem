// No credentials or private data: a safe, anonymous production smoke test.
const base = 'https://sasa-semsem.vercel.app'
const expected = [
  ['/', 200],
  ['/manifest.webmanifest', 200],
  ['/sw.js', 200],
  ['/api/auth', 405],
  ['/api/push', 405],
  ['/api/voice', 405],
  ['/api/push-cron', 401],
]

async function check(path, status) {
  let error
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(base + path, {
        signal: AbortSignal.timeout(15000),
        cache: 'no-store',
        headers: { Accept: 'text/html, application/json, */*' },
      })
      if (response.status !== status)
        throw new Error(path + ': HTTP ' + response.status + ', expected ' + status)
      if (path === '/') {
        const html = await response.text()
        if (!html.includes('Our Space') || !html.includes('/assets/'))
          throw new Error('Production app shell or bundled assets missing')
        const csp = response.headers.get('content-security-policy') || ''
        if (!csp.includes("script-src 'self'") || !csp.includes("frame-ancestors 'none'"))
          throw new Error('Production Content-Security-Policy is missing')
        if (!response.headers.get('strict-transport-security'))
          throw new Error('Production HSTS header is missing')
      }
      if (path === '/manifest.webmanifest') {
        const manifest = await response.json()
        if (manifest.name !== 'Our Space' || manifest.display !== 'standalone')
          throw new Error('Invalid install manifest')
      }
      if (path === '/sw.js') {
        const worker = await response.text()
        if (!worker.includes("addEventListener('push'") ||
            !worker.includes("addEventListener('notificationclick'"))
          throw new Error('Web Push Service Worker is missing')
      }
      console.log('PASS ' + path + ' -> HTTP ' + status)
      return
    } catch (caught) {
      error = caught
      if (attempt !== 2) await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
  throw error
}

let failed = false
for (const [path, status] of expected) {
  try {
    await check(path, status)
  } catch (error) {
    console.error('FAIL ' + path + ': ' + error.message)
    failed = true
  }
}
if (failed) process.exitCode = 1
else console.log('Production public availability, security headers and API access checks passed')
