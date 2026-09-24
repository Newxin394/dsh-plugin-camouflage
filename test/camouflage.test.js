import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import https from 'node:https'
import {
  LIVE_CONFIG_SLOT,
  DEFAULT_USER_AGENT,
  normalizeHost,
  extractHostname,
  shouldCamouflage,
  applyCamouflageHeaders,
  normalizeCustomHeaders,
  normalizeEntry,
  rulesOf,
  installFetchHook,
  installClientHooks,
} from '../index.js'

const LIVE = LIVE_CONFIG_SLOT

/** 每个用例开头重设 LIVE 槽位，避免用例之间互相污染。 */
function setConfig(overrides = {}) {
  globalThis[LIVE] = {
    enabled: true,
    userAgent: 'Test/1.0',
    targetHosts: ['*'],
    stripStainless: true,
    logRewrites: false,
    ...overrides,
  }
  return globalThis[LIVE]
}

afterEach(() => { delete globalThis[LIVE] })

/** 起一个只回声请求头的本地服务，端口交给系统分配。 */
function startServer() {
  const seen = []
  const server = http.createServer((req, res) => {
    seen.push(req.headers)
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('ok')
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, seen, port: server.address().port }))
  })
}

// ---------------------------------------------------------------- 主机匹配

test('normalizeHost 剥离协议、路径、端口与空白', () => {
  assert.equal(normalizeHost('  HTTPS://PS.Air-Outer.COM  '), 'ps.air-outer.com')
  assert.equal(normalizeHost('ps.air-outer.com/v1/chat'), 'ps.air-outer.com')
  assert.equal(normalizeHost('ps.air-outer.com:8443'), 'ps.air-outer.com')
  assert.equal(normalizeHost('http://ps.air-outer.com:443/v1'), 'ps.air-outer.com')
  assert.equal(normalizeHost('*'), '*')
  assert.equal(normalizeHost(''), '')
  assert.equal(normalizeHost(null), '')
})

test('extractHostname 认识字符串、URL、Request 与 options 四种形态', () => {
  assert.equal(extractHostname('https://api.example.com/v1/models'), 'api.example.com')
  assert.equal(extractHostname('api.example.com:8080/x'), 'api.example.com')
  assert.equal(extractHostname(new URL('https://api.example.com/x')), 'api.example.com')
  assert.equal(extractHostname({ url: 'https://api.example.com/x' }), 'api.example.com')
  assert.equal(extractHostname({ hostname: 'api.example.com' }), 'api.example.com')
  assert.equal(extractHostname({ host: 'api.example.com:443' }), 'api.example.com')
  assert.equal(extractHostname(''), '')
  assert.equal(extractHostname(undefined), '')
})

test('shouldCamouflage 精确匹配、子域匹配，但不匹配同名后缀', () => {
  setConfig({ targetHosts: ['ps.air-outer.com'] })
  assert.equal(shouldCamouflage('https://ps.air-outer.com/v1'), true)
  assert.equal(shouldCamouflage('https://edge.ps.air-outer.com/v1'), true)
  assert.equal(shouldCamouflage('https://evil-air-outer.com/v1'), false)
  assert.equal(shouldCamouflage('https://notps.air-outer.com/v1'), false)
  assert.equal(shouldCamouflage('https://example.com/v1'), false)
  assert.equal(shouldCamouflage(''), false)
})

test('shouldCamouflage 支持通配、URL 前缀写法与总开关', () => {
  setConfig({ targetHosts: ['*'] })
  assert.equal(shouldCamouflage('https://anything.example/x'), true)

  setConfig({ targetHosts: ['https://ps.air-outer.com', 'https://motomoto.lol'] })
  assert.equal(shouldCamouflage('https://ps.air-outer.com/v1'), true)
  assert.equal(shouldCamouflage('https://motomoto.lol/v1'), true)
  assert.equal(shouldCamouflage('https://other.lol/v1'), false)

  setConfig({ enabled: false, targetHosts: ['*'] })
  assert.equal(shouldCamouflage('https://anything.example/x'), false)
})

test('目标列表里的空项与重复项不会污染规则集', () => {
  const cfg = setConfig({ targetHosts: ['', '  ', 'a.com', 'A.COM', 'a.com'] })
  const rules = rulesOf(cfg)
  assert.deepEqual([...rules.exact], ['a.com'])
  assert.deepEqual(rules.suffixes, ['.a.com'])
  assert.equal(rules.wildcard, false)
})

// ---------------------------------------------------------------- 头改写

test('applyCamouflageHeaders 不就地修改调用方传入的对象', () => {
  const original = { Authorization: 'Bearer token', 'x-stainless-lang': 'js' }
  const next = applyCamouflageHeaders(original, 'Cline/3.0.0')
  assert.deepEqual(original, { Authorization: 'Bearer token', 'x-stainless-lang': 'js' })
  assert.deepEqual(next, { Authorization: 'Bearer token', 'User-Agent': 'Cline/3.0.0' })
})

test('applyCamouflageHeaders 处理 Headers 实例与数组，并且只留一份 UA', () => {
  const headers = new Headers({ authorization: 'Bearer t', 'user-agent': 'python-requests/2' })
  const next = applyCamouflageHeaders(headers, 'Cline/3.0.0')
  assert.equal(next.get('user-agent'), 'Cline/3.0.0')
  assert.equal(next.get('authorization'), 'Bearer t')
  assert.equal(headers.get('user-agent'), 'python-requests/2')

  const list = applyCamouflageHeaders([['user-agent', 'old'], ['accept', '*/*']], 'Cline/3.0.0')
  assert.deepEqual(list, [['accept', '*/*'], ['User-Agent', 'Cline/3.0.0']])
})

test('stripStainless 关闭时保留 SDK 指纹头', () => {
  const next = applyCamouflageHeaders(
    { 'x-stainless-lang': 'js', 'X-Stainless-Package-Version': '4.0.0' },
    'Cline/3.0.0',
    { stripStainless: false },
  )
  assert.deepEqual(next, {
    'x-stainless-lang': 'js',
    'X-Stainless-Package-Version': '4.0.0',
    'User-Agent': 'Cline/3.0.0',
  })
})

test('applyCamouflageHeaders 在没有入参时从零造一份', () => {
  assert.deepEqual(applyCamouflageHeaders(undefined, 'Cline/3.0.0'), { 'User-Agent': 'Cline/3.0.0' })
})

test('applyCamouflageHeaders 注入自定义头并让同名原值让位', () => {
  const options = { customHeaders: { 'X-Client-Name': 'my-client', 'X-Trace-Id': 'abc' } }
  const next = applyCamouflageHeaders(
    { Authorization: 'Bearer t', 'x-client-name': 'old', 'x-stainless-lang': 'js' },
    'Cline/3.0.0',
    options,
  )
  assert.deepEqual(next, {
    Authorization: 'Bearer t',
    'X-Client-Name': 'my-client',
    'X-Trace-Id': 'abc',
    'User-Agent': 'Cline/3.0.0',
  })

  const list = applyCamouflageHeaders(
    [['X-TRACE-ID', 'old'], ['accept', '*/*']],
    'Cline/3.0.0',
    { customHeaders: { 'X-Trace-Id': 'xyz' } },
  )
  assert.deepEqual(list, [['accept', '*/*'], ['User-Agent', 'Cline/3.0.0'], ['X-Trace-Id', 'xyz']])
})

test('normalizeCustomHeaders 清洗非法头名、换行值、重复头与 user-agent', () => {
  assert.deepEqual(normalizeCustomHeaders({
    'X-Client': 'ok',
    'x-client': 'late',           // 大小写不敏感去重，后出现的覆盖，头名取后出现原形
    'Bad Header': 'x',            // 含空格的非法 token，丢弃
    'X-Newline': 'a\nb',          // 含换行的值，丢弃
    'X-Num': 42,                  // 非 string 值，丢弃
    'User-Agent': 'clash/1.0',    // UA 走 userAgent 字段，丢弃
  }), { 'x-client': 'late' })

  assert.deepEqual(normalizeCustomHeaders(undefined), {})
  assert.deepEqual(normalizeCustomHeaders(['a', 'b']), {})
})

// ---------------------------------------------------------------- fetch 钩子

test('fetch 钩子命中时改写 UA、留住鉴权头、剥掉指纹头', async () => {
  setConfig({ targetHosts: ['ps.air-outer.com'] })
  const savedFetch = globalThis.fetch
  const captured = []
  globalThis.fetch = async (input, init) => {
    captured.push(init)
    return new Response('ok')
  }
  const dispose = installFetchHook(console)
  try {
    await globalThis.fetch('https://ps.air-outer.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret', 'x-stainless-lang': 'js', 'content-type': 'application/json' },
    })
  } finally {
    dispose()
    globalThis.fetch = savedFetch
  }

  assert.equal(captured.length, 1)
  const headers = new Headers(captured[0].headers)
  assert.equal(headers.get('user-agent'), 'Test/1.0')
  assert.equal(headers.get('authorization'), 'Bearer secret')
  assert.equal(headers.get('content-type'), 'application/json')
  assert.equal(headers.get('x-stainless-lang'), null)
  assert.equal(captured[0].method, 'POST')
})

test('fetch 钩子把自定义头一起钉进命中的请求', async () => {
  setConfig({ targetHosts: ['ps.air-outer.com'], customHeaders: { 'X-Client-Name': 'my-client' } })
  const savedFetch = globalThis.fetch
  const captured = []
  globalThis.fetch = async (input, init) => {
    captured.push(init)
    return new Response('ok')
  }
  const dispose = installFetchHook(console)
  try {
    await globalThis.fetch('https://ps.air-outer.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret', 'x-client-name': 'old' },
    })
  } finally {
    dispose()
    globalThis.fetch = savedFetch
  }

  assert.equal(captured.length, 1)
  const headers = new Headers(captured[0].headers)
  assert.equal(headers.get('x-client-name'), 'my-client')
  assert.equal(headers.get('user-agent'), 'Test/1.0')
  assert.equal(headers.get('authorization'), 'Bearer secret')
})

test('fetch 钩子不碰未命中的主机，且不传 init 也能工作', async () => {
  setConfig({ targetHosts: ['ps.air-outer.com'] })
  const savedFetch = globalThis.fetch
  const captured = []
  globalThis.fetch = async (input, init) => {
    captured.push(init)
    return new Response('ok')
  }
  const dispose = installFetchHook(console)
  try {
    await globalThis.fetch('https://other.example/v1', { headers: { 'user-agent': 'keep-me' } })
    await globalThis.fetch('https://ps.air-outer.com/v1')
  } finally {
    dispose()
    globalThis.fetch = savedFetch
  }

  assert.equal(new Headers(captured[0].headers).get('user-agent'), 'keep-me')
  assert.equal(captured[1].headers['User-Agent'], 'Test/1.0')
})

test('fetch 钩子处理 Request 实例，init.headers 覆盖同名项', async () => {
  setConfig({ targetHosts: ['*'] })
  const savedFetch = globalThis.fetch
  const captured = []
  globalThis.fetch = async (input, init) => {
    captured.push(init)
    return new Response('ok')
  }
  const dispose = installFetchHook(console)
  try {
    const request = new Request('https://ps.air-outer.com/v1', {
      method: 'POST',
      headers: { Authorization: 'Bearer from-request', 'x-stainless-lang': 'js' },
    })
    await globalThis.fetch(request, { headers: { 'x-custom': 'yes' } })
  } finally {
    dispose()
    globalThis.fetch = savedFetch
  }

  const headers = new Headers(captured[0].headers)
  assert.equal(headers.get('authorization'), 'Bearer from-request')
  assert.equal(headers.get('x-custom'), 'yes')
  assert.equal(headers.get('user-agent'), 'Test/1.0')
  assert.equal(headers.get('x-stainless-lang'), null)
})

test('fetch 钩子的卸载会还原绑定，重复安装会被拒绝', () => {
  const savedFetch = globalThis.fetch
  const stub = async () => new Response('ok')
  globalThis.fetch = stub
  const dispose = installFetchHook(console)
  try {
    assert.notEqual(globalThis.fetch, stub)
    assert.throws(() => installFetchHook(console), /已经装过/)
    dispose()
    assert.equal(globalThis.fetch, stub)
  } finally {
    globalThis.fetch = savedFetch
  }
})

// ---------------------------------------------------------------- http 钩子

test('http.request 命中时改写真实请求头，并拦掉随后的 setHeader', async () => {
  const { server, seen, port } = await startServer()
  setConfig({ targetHosts: ['127.0.0.1'] })
  const dispose = installClientHooks(console)
  try {
    await new Promise((resolve, reject) => {
      const req = http.request('http://127.0.0.1:' + port + '/v1/chat', (res) => {
        res.resume()
        res.on('end', resolve)
      })
      req.on('error', reject)
      req.setHeader('x-stainless-lang', 'js')
      req.setHeader('User-Agent', 'python-requests/2')
      req.end()
    })
  } finally {
    dispose()
    server.close()
  }

  assert.equal(seen.length, 1)
  assert.equal(seen[0]['user-agent'], 'Test/1.0')
  assert.equal(seen[0]['x-stainless-lang'], undefined)
})

test('http.request 的 options 形态同样被改写，未命中主机原样放行', async () => {
  const { server, seen, port } = await startServer()
  const savedRequest = http.request
  setConfig({ targetHosts: ['127.0.0.1'] })
  const dispose = installClientHooks(console)
  try {
    await new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port, path: '/', method: 'GET' }, (res) => {
        res.resume()
        res.on('end', resolve)
      })
      req.on('error', reject)
      req.end()
    })
  } finally {
    dispose()
    server.close()
  }
  assert.equal(seen.length, 1)
  assert.equal(seen[0]['user-agent'], 'Test/1.0')

  // 未命中的主机不该被动过。
  const other = await startServer()
  setConfig({ targetHosts: ['example.invalid'] })
  const dispose2 = installClientHooks(console)
  try {
    await new Promise((resolve, reject) => {
      const req = http.request('http://127.0.0.1:' + other.port + '/', { headers: { 'user-agent': 'keep' } }, (res) => {
        res.resume()
        res.on('end', resolve)
      })
      req.on('error', reject)
      req.end()
    })
  } finally {
    dispose2()
    other.server.close()
  }
  assert.equal(other.seen[0]['user-agent'], 'keep')
  assert.equal(typeof savedRequest, 'function')
})

test('http 与 https 的 request 都在卸载时还原', () => {
  const beforeHttp = http.request
  const beforeHttps = https.request
  const dispose = installClientHooks(console)
  try {
    assert.notEqual(http.request, beforeHttp)
    assert.notEqual(https.request, beforeHttps)
  } finally {
    dispose()
  }
  assert.equal(http.request, beforeHttp)
  assert.equal(https.request, beforeHttps)
})

// ---------------------------------------------------------------- 配置折叠

test('normalizeEntry 补齐缺省字段并保留显式关闭', () => {
  assert.deepEqual(normalizeEntry({}), {
    enabled: true,
    enableThinking: true,
    userAgent: DEFAULT_USER_AGENT,
    targetHosts: ['*'],
    customHeaders: {},
    stripStainless: true,
    logRewrites: false,
  })
  assert.deepEqual(normalizeEntry({ enabled: false, userAgent: 'X/1', targetHosts: ['a.com'], stripStainless: false, logRewrites: true }), {
    enabled: false,
    enableThinking: true,
    userAgent: 'X/1',
    targetHosts: ['a.com'],
    customHeaders: {},
    stripStainless: false,
    logRewrites: true,
  })
  assert.deepEqual(normalizeEntry({ userAgent: '', targetHosts: [] }), {
    enabled: true,
    enableThinking: true,
    userAgent: DEFAULT_USER_AGENT,
    targetHosts: ['*'],
    customHeaders: {},
    stripStainless: true,
    logRewrites: false,
  })
})

test('normalizeEntry 缺字段时回落到上一份配置', () => {
  const entry = normalizeEntry({ userAgent: 'Cline/1.0.0', targetHosts: ['ps.air-outer.com'], customHeaders: { 'X-Client': 'a' } })
  const next = normalizeEntry({}, entry)
  assert.equal(next.userAgent, 'Cline/1.0.0')
  assert.deepEqual(next.targetHosts, ['ps.air-outer.com'])
  assert.deepEqual(next.customHeaders, { 'X-Client': 'a' })
})

test('normalizeEntry 显式空自定义头是清空而不是回落', () => {
  const prev = normalizeEntry({ customHeaders: { 'X-Client': 'a' } })
  const next = normalizeEntry({ customHeaders: {} }, prev)
  assert.deepEqual(next.customHeaders, {})
  assert.deepEqual(prev.customHeaders, { 'X-Client': 'a' })
})
