import http from 'node:http'
import https from 'node:https'
import { installCamouflageSettings } from './settings.js'

export const name = 'client-camouflage'

/** composition 与 settings 都没给身份时用的默认值。 */
export const DEFAULT_USER_AGENT = 'Cline/3.0.0'

/** 常用客户端身份预设，供前端与配置快捷选用。 */
export const USER_AGENT_PRESETS = [
  'Cline/3.0.0',
  'claude-cli/2.1.161 (external, cli)',
  'claude-cli/2.1.161',
  'claude-code/1.0.0',
  'claude-code/0.1.0',
  'Kilo-Code/1.0',
  'Roo-Code/3.8.0',
]

/** 默认生效范围：所有出站请求。与 settings schema 和卡片的退回值保持一致。 */
export const DEFAULT_TARGET_HOSTS = ['*']

/** RFC 7230 / 9110 标准 HTTP Token 正则。 */
export const HTTP_TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/

/**
 * 校验请求头名称是否合法。
 * @param {any} name
 * @returns {boolean}
 */
export function isValidHeaderName(name) {
  return typeof name === 'string' && name.length > 0 && HTTP_TOKEN.test(name)
}

/**
 * 校验请求头值是否安全（防 CRLF 注入）。
 * @param {any} value
 * @returns {boolean}
 */
export function isValidHeaderValue(value) {
  return typeof value === 'string' && !/\r|\n/.test(value)
}

/**
 * 规格化自定义请求头字典。剔除不合法的头名和换行值，同名字段大小写去重保留最后一项。
 * @param {Record<string, string>|undefined} headers
 * @returns {Record<string, string>}
 */
export function normalizeCustomHeaders(headers) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return {}
  const merged = new Map()
  for (const [rawKey, rawValue] of Object.entries(headers)) {
    if (typeof rawKey !== 'string' || typeof rawValue !== 'string') continue
    const key = rawKey.trim()
    if (!isValidHeaderName(key)) continue
    const lower = key.toLowerCase()
    if (lower === 'user-agent') continue // User-Agent 有专有配置项
    if (!isValidHeaderValue(rawValue)) continue
    merged.set(lower, [key, rawValue])
  }
  return Object.fromEntries(merged.values())
}

/** OpenAI 官方 SDK 的指纹头前缀，会暴露调用方其实是哪个客户端。 */
const STAINLESS_PREFIX = 'x-stainless-'

/** 装在钩子函数上的标记，用来认出「这个钩子是本插件装的」。 */
const FETCH_HOOK_FLAG = '__dshCamouflageFetch'
const CLIENT_HOOK_FLAG = '__dshCamouflageClient'

/**
 * 伪装头（dsh-plugin-camouflage）
 *
 * 给上游 LLM 请求换一个 Client User-Agent（默认 Cline/3.0.0），用来过 API 中转站
 * 的客户端白名单，不用改宿主任何文件。
 *
 * 生效范围由 targetHosts 决定：URL 的主机名命中列表中的某一项（或它的子域）才改写，
 * 填 '*' 表示全部。开关、身份、范围、指纹头剥离、改写日志都在「设置 → 插件」里改，
 * 保存即生效。
 */

/**
 * 钩子读配置的唯一入口。挂在 globalThis 上而不是闭包里，是因为 fetch 和
 * http.request 的钩子每个进程只装一次：插件热重载会跑一次新的 apply，但装好的
 * 钩子可能仍是旧闭包，只有共享这一个槽位才能让新配置真的到达它们。
 */
const LIVE = '__dsh_camouflage_config'

/** LIVE 槽位的键名，供测试与其它半边直接读写。 */
export const LIVE_CONFIG_SLOT = LIVE

/**
 * 规格化主机名：剔除协议头、路径、端口及首尾空白，统一转小写。
 * @param {string} entry
 * @returns {string}
 */
export function normalizeHost(entry) {
  if (!entry || typeof entry !== 'string') return ''
  let host = entry.trim().toLowerCase()
  if (host === '*') return '*'
  host = host.replace(/^https?:\/\//, '')
  host = host.replace(/\/.*$/, '')
  host = host.replace(/:\d+$/, '')
  return host
}

/**
 * 从不同类型的目标（URL 字符串、URL 对象、Request、ClientRequest 配置等）中提取标准主机名。
 * @param {any} target
 * @returns {string}
 */
export function extractHostname(target) {
  if (!target) return ''
  if (typeof target === 'string') {
    try {
      const u = target.includes('://') ? new URL(target) : new URL('http://' + target)
      return u.hostname.toLowerCase()
    } catch {
      return normalizeHost(target)
    }
  }
  if (target instanceof URL) {
    return target.hostname.toLowerCase()
  }
  if (typeof target === 'object' && target !== null) {
    if (typeof target.url === 'string') return extractHostname(target.url)
    const raw = target.hostname || target.host || ''
    return normalizeHost(raw)
  }
  return ''
}

/**
 * 主机规则的查表结构，按配置对象缓存。
 *
 * 配置对象由 adopt() 整体替换，引用一变缓存自然失效，所以这里用 WeakMap 而不是
 * 手写失效逻辑：既不会因为忘记失效而读到旧规则，也不会攒住已经不用的配置。
 */
const rulesCache = new WeakMap()

/**
 * 把 targetHosts 折成「通配 / 精确集合 / 子域后缀」三份查表结构。
 * 子域判断锚在点上，所以 evil-air-outer.com 不会命中 air-outer.com。
 * @param {object} cfg
 * @returns {{wildcard: boolean, exact: Set<string>, suffixes: string[]}}
 */
export function rulesOf(cfg) {
  const cached = rulesCache.get(cfg)
  if (cached !== undefined) return cached
  const exact = new Set()
  const suffixes = []
  let wildcard = false
  const hosts = Array.isArray(cfg.targetHosts) ? cfg.targetHosts : []
  for (const entry of hosts) {
    const host = normalizeHost(entry)
    if (host === '') continue
    if (host === '*') {
      wildcard = true
      continue
    }
    if (exact.has(host)) continue
    exact.add(host)
    suffixes.push('.' + host)
  }
  const rules = { wildcard, exact, suffixes }
  rulesCache.set(cfg, rules)
  return rules
}

/**
 * 判断请求目标是否命中伪装配置。
 * @param {any} target
 * @returns {boolean}
 */
export function shouldCamouflage(target) {
  const cfg = globalThis[LIVE]
  if (!cfg || cfg.enabled !== true) return false
  const targetHost = extractHostname(target)
  if (targetHost === '') return false
  const rules = rulesOf(cfg)
  if (rules.wildcard) return true
  if (rules.exact.has(targetHost)) return true
  for (const suffix of rules.suffixes) {
    if (targetHost.endsWith(suffix)) return true
  }
  return false
}

/** 读当前生效的 User-Agent。 */
export function activeUserAgent() {
  return globalThis[LIVE]?.userAgent ?? DEFAULT_USER_AGENT
}

/** 读当前生效的额外自定义请求头。 */
export function activeCustomHeaders() {
  return globalThis[LIVE]?.customHeaders ?? {}
}

/** 当前是否剥离 x-stainless-* 指纹头。 */
export function activeStripStainless() {
  return globalThis[LIVE]?.stripStainless !== false
}

/** 当前是否逐次记录改写日志。 */
export function activeLogRewrites() {
  return globalThis[LIVE]?.logRewrites === true
}

/**
 * 统一对各种形态的请求头注入伪装与自定义头，并返回改写后的**新**副本。
 *
 * 约束与安全保证：
 * 1. 不就地修改入参，始终返回干净的新副本。
 * 2. 同一头名的不同大小写只留一份，避免发出冲突或重复的头。
 * 3. 默认剥离 x-stainless-*；关掉开关时原样保留。
 * 4. 深度合并 options.customHeaders，优先使用用户配置的自定义头覆盖同名头。
 *
 * @param {Headers|Array|Object|undefined} headers
 * @param {string} ua
 * @param {{stripStainless?: boolean, customHeaders?: Record<string, string>}} [options]
 * @returns {Headers|Array|Object}
 */
export function applyCamouflageHeaders(headers, ua, options = {}) {
  const strip = options.stripStainless !== false
  const custom = normalizeCustomHeaders(options.customHeaders)
  const customLowerMap = new Map()
  for (const [k, v] of Object.entries(custom)) {
    customLowerMap.set(k.toLowerCase(), [k, v])
  }

  const isBlocked = (value) => {
    const lower = String(value).toLowerCase()
    return lower === 'user-agent'
      || (strip && lower.startsWith(STAINLESS_PREFIX))
      || customLowerMap.has(lower)
  }

  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    const next = new Headers()
    for (const [key, value] of headers.entries()) {
      if (!isBlocked(key)) next.append(key, value)
    }
    next.set('User-Agent', ua)
    for (const [, [k, v]] of customLowerMap.entries()) {
      next.set(k, v)
    }
    return next
  }

  if (Array.isArray(headers)) {
    const next = headers.filter((pair) => !isBlocked(Array.isArray(pair) ? pair[0] : ''))
    next.push(['User-Agent', ua])
    for (const [, [k, v]] of customLowerMap.entries()) {
      next.push([k, v])
    }
    return next
  }

  const source = headers && typeof headers === 'object' ? headers : {}
  const next = {}
  for (const [key, value] of Object.entries(source)) {
    if (!isBlocked(key)) next[key] = value
  }
  next['User-Agent'] = ua
  for (const [, [k, v]] of customLowerMap.entries()) {
    next[k] = v
  }
  return next
}

/**
 * 读出 fetch 入参对应的 URL。
 * @param {any} input
 * @returns {URL|undefined} 读不出形态时返回 undefined，调用方原样透传。
 */
export function urlOf(input) {
  try {
    if (typeof input === 'string') return new URL(input)
    if (input instanceof URL) return input
    if (input !== null && typeof input === 'object' && typeof input.url === 'string') {
      return new URL(input.url)
    }
  } catch {
    return undefined
  }
  return undefined
}

/** 配置里那个 logRewrites 打开时，逐条记一行改写日志。 */
function traceRewrite(logger, target, ua, customHeaders = {}) {
  if (!activeLogRewrites()) return
  const url = urlOf(target)
  const host = url ? url.host : extractHostname(target)
  const extraKeys = Object.keys(customHeaders)
  const extraNote = extraKeys.length > 0 ? ` (+${extraKeys.length} 个自定义头: ${extraKeys.join(', ')})` : ''
  logger?.info?.('[伪装头] %s → User-Agent: %s%s', host || '未知主机', ua, extraNote)
}

/**
 * 包一层 globalThis.fetch。
 *
 * 这是唯一能看见「归属头已合并、字节还没出网」的位置：SDK 每个请求新建 client
 * 且不传 fetch，只能从全局绑定上取。
 *
 * @param {any} logger
 * @returns {() => void} 卸载函数，恢复原始绑定。
 */
export function installFetchHook(logger) {
  const original = globalThis.fetch
  if (typeof original !== 'function') {
    throw new Error('camouflage: globalThis.fetch 不可用，无法安装钩子')
  }
  if (original[FETCH_HOOK_FLAG] === true) {
    throw new Error('camouflage: fetch 钩子已经装过了')
  }

  const patched = async function camouflageFetch(input, init) {
    try {
      if (shouldCamouflage(input)) {
        const ua = activeUserAgent()
        const stripStainless = activeStripStainless()
        const customHeaders = activeCustomHeaders()
        let nextInit = init
        if (typeof Request !== 'undefined' && input instanceof Request) {
          // Request 自带的鉴权头必须留下，init.headers 若有则覆盖同名项。
          const headers = new Headers(input.headers)
          if (init && init.headers !== undefined) {
            for (const [key, value] of new Headers(init.headers).entries()) {
              headers.set(key, value)
            }
          }
          nextInit = { ...init, headers: applyCamouflageHeaders(headers, ua, { stripStainless, customHeaders }) }
        } else {
          nextInit = { ...init, headers: applyCamouflageHeaders(init?.headers, ua, { stripStainless, customHeaders }) }
        }
        traceRewrite(logger, input, ua, customHeaders)
        return original.call(this, input, nextInit)
      }
    } catch {
      // 改不动 header 就按原样发出去：伪装是可选增益，不该让请求本身失败。
    }
    return original.call(this, input, init)
  }
  Object.defineProperty(patched, FETCH_HOOK_FLAG, { value: true })
  globalThis.fetch = patched

  return () => {
    // 只在自己仍是最外层时回退，否则会连别人叠在更外层的包装一起拆掉。
    if (globalThis.fetch === patched) globalThis.fetch = original
  }
}

/**
 * 给单个 node:http / node:https 模块的 request 装同一套改写。
 * @param {any} mod
 * @param {any} logger
 * @returns {() => void} 卸载函数。
 */
function installOneClient(mod, logger) {
  if (!mod || typeof mod.request !== 'function') return () => {}
  if (mod[CLIENT_HOOK_FLAG] === true) return () => {}
  const original = mod.request

  const patched = function camouflageRequest(...args) {
    let hit = false
    let urlArg = null
    let options = null
    let rest = []

    try {
      const first = args[0]
      if (typeof first === 'string' || first instanceof URL) {
        urlArg = first
        if (args[1] !== null && typeof args[1] === 'object') {
          options = { ...args[1] }
          rest = args.slice(2)
        } else {
          // request(url, cb) 这种形态原本没有 options 可以写，补一个空对象把
          // 回调退到第三位：Node 认这种调用。
          options = {}
          rest = args.slice(1)
        }
      } else if (first !== null && typeof first === 'object') {
        options = { ...first }
        rest = args.slice(1)
      }

      if (shouldCamouflage(urlArg ?? options)) {
        hit = true
        const ua = activeUserAgent()
        const stripStainless = activeStripStainless()
        const customHeaders = activeCustomHeaders()
        options.headers = applyCamouflageHeaders(options.headers, ua, {
          stripStainless,
          customHeaders,
        })
        traceRewrite(logger, urlArg ?? options, ua, customHeaders)
      }
    } catch {
      // 同上：改写失败不阻断请求。
    }

    const nextArgs = urlArg !== null ? [urlArg, options, ...rest] : [options, ...rest]
    const req = original.apply(this, nextArgs)

    // SDK 拿到 ClientRequest 之后还会自己 setHeader，把 x-stainless-* 和
    // 它自己的 User-Agent 或默认头再压回来。这一层拦截就是为了堵住后手。
    if (hit && req && typeof req.setHeader === 'function') {
      try {
        const originalSetHeader = req.setHeader
        req.setHeader = function (name, value) {
          const lower = String(name).toLowerCase()
          if (activeStripStainless() && lower.startsWith(STAINLESS_PREFIX)) {
            return this
          }
          if (lower === 'user-agent') {
            return originalSetHeader.call(this, 'User-Agent', activeUserAgent())
          }
          const custom = activeCustomHeaders()
          for (const [k, v] of Object.entries(custom)) {
            if (k.toLowerCase() === lower) {
              return originalSetHeader.call(this, k, v)
            }
          }
          return originalSetHeader.call(this, name, value)
        }
        req.setHeader('User-Agent', activeUserAgent())
        const custom = activeCustomHeaders()
        for (const [k, v] of Object.entries(custom)) {
          req.setHeader(k, v)
        }
      } catch {
        // 拦截装不上也不影响已经写进 options 的那一份。
      }
    }

    return req
  }
  Object.defineProperty(patched, CLIENT_HOOK_FLAG, { value: true })
  mod.request = patched

  return () => {
    if (mod.request === patched) mod.request = original
  }
}

/**
 * 给 node:http / node:https 装钩子。
 * @param {any} logger
 * @returns {() => void} 卸载函数。
 */
export function installClientHooks(logger) {
  const disposers = [installOneClient(http, logger), installOneClient(https, logger)]
  return () => {
    for (const dispose of disposers) dispose()
  }
}

/**
 * 把一份来路不明的配置折成完整、可用的形状。
 * @param {object} config - composition 或 settings 解出的值。
 * @param {object} [fallback] - 缺字段时回落到的上一份配置。
 * @returns {{enabled: boolean, userAgent: string, targetHosts: string[], customHeaders: Record<string, string>, stripStainless: boolean, logRewrites: boolean}}
 */
export function normalizeEntry(config = {}, fallback = {}) {
  const source = config && typeof config === 'object' ? config : {}
  const ua = typeof source.userAgent === 'string' && source.userAgent !== ''
    ? source.userAgent
    : (fallback.userAgent ?? DEFAULT_USER_AGENT)
  const hosts = Array.isArray(source.targetHosts) && source.targetHosts.length > 0
    ? [...source.targetHosts]
    : (fallback.targetHosts ?? DEFAULT_TARGET_HOSTS)
  const custom = source.customHeaders !== undefined
    ? normalizeCustomHeaders(source.customHeaders)
    : (fallback.customHeaders !== undefined ? normalizeCustomHeaders(fallback.customHeaders) : {})
  return {
    enabled: source.enabled !== false,
    enableThinking: source.enableThinking !== false,
    userAgent: ua,
    targetHosts: hosts,
    customHeaders: custom,
    stripStainless: source.stripStainless !== false,
    logRewrites: source.logRewrites === true,
  }
}

/**
 * 挂载插件。
 * @param ctx - cordis 插件上下文。
 * @param config - composition（cordis.patch.yml）里的这一行配置，同时作为
 *   settings 的 base 层：用户没改过的字段回落到它。
 * @returns 无。
 */
export function apply(ctx, config = {}) {
  const logger = ctx?.logger ? ctx.logger('camouflage') : console

  const entry = normalizeEntry(config)
  globalThis[LIVE] = { ...entry }

  /**
   * 接受一份新配置。整体替换而不是逐字段赋值，读的一侧就不必担心读到半份。
   * @param next - settings 求解出的完整值。
   */
  const adopt = (next) => {
    globalThis[LIVE] = normalizeEntry(next, entry)
  }

  try {
    installCamouflageSettings(ctx, entry, adopt)
  } catch (err) {
    logger?.warn?.('[伪装头] 设置面板注册异常：%s', err?.message ?? err)
  }

  let disposeFetch = null
  try {
    disposeFetch = installFetchHook(logger)
  } catch (err) {
    // 热重载后旧钩子仍在不算错误：LIVE 槽位保证新配置照样能到达它。
    logger?.warn?.('[伪装头] fetch 钩子未重装：%s', err?.message ?? err)
  }
  const disposeClients = installClientHooks(logger)

  ctx?.effect?.(() => () => {
    disposeFetch?.()
    disposeClients?.()
  }, 'camouflage: outbound hooks')

  const customKeys = Object.keys(entry.customHeaders)
  const customSummary = customKeys.length > 0 ? `，自定义头 ${customKeys.length} 个 [${customKeys.join(', ')}]` : ''
  logger?.info?.(
    '[伪装头] 已就绪：上游请求 User-Agent 伪装为 "%s"%s（目标 %s，开关 %s，指纹头剥离 %s）',
    entry.userAgent,
    customSummary,
    entry.targetHosts.join(', '),
    entry.enabled ? '开' : '关',
    entry.stripStainless ? '开' : '关',
  )
}

