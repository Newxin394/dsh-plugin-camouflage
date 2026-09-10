import http from 'node:http'
import https from 'node:https'
import { installCamouflageSettings } from './settings.js'

export const name = 'client-camouflage'

/**
 * 伪装头（dsh-plugin-camouflage）
 *
 * 给上游 LLM 请求换一个 Client User-Agent（默认 Cline/3.0.0），用来过 API 中转站
 * 的客户端白名单，不用改宿主任何文件。
 *
 * 生效范围由 targetHosts 决定：只有 URL 里出现列表中的主机名才会被改写，
 * 填 '*' 表示全部。开关和这两个值都在「设置 → 插件 → 插件配置」里改，保存即生效。
 */

/**
 * 钩子读配置的唯一入口。挂在 globalThis 上而不是闭包里，是因为 fetch 和
 * http.request 的钩子每个进程只装一次（下面的 __dsh_camouflage_*_hooked 守卫）：
 * 插件热重载会跑一次新的 apply，但装好的钩子还是旧闭包，只有共享这一个槽位
 * 才能让新配置真的到达它们。
 */
const LIVE = '__dsh_camouflage_config'

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
 * 判断请求目标是否命中伪装配置。
 * @param {any} target
 * @returns {boolean}
 */
export function shouldCamouflage(target) {
  const cfg = globalThis[LIVE]
  if (!cfg || cfg.enabled !== true) return false
  const targetHost = extractHostname(target)
  if (!targetHost) return false
  if (Array.isArray(cfg.targetHosts) && cfg.targetHosts.includes('*')) return true
  if (!Array.isArray(cfg.targetHosts)) return false

  for (const configured of cfg.targetHosts) {
    const norm = normalizeHost(configured)
    if (norm === '*' || norm === targetHost || targetHost.endsWith('.' + norm)) {
      return true
    }
  }
  return false
}

/** 读当前生效的 User-Agent。 */
export function activeUserAgent() {
  return globalThis[LIVE]?.userAgent ?? 'Cline/3.0.0'
}

/**
 * 统一对各种形态的请求头注入伪装：
 * 1. 设置规范的 User-Agent
 * 2. 剥离暴露 Node.js / OpenAI SDK 指纹的 x-stainless-* 头
 *
 * @param {Headers|Array|Object} headers
 * @param {string} ua
 * @returns {Headers|Array|Object}
 */
export function applyCamouflageHeaders(headers, ua) {
  if (!headers) {
    return { 'User-Agent': ua }
  }

  // 1. WHATWG Headers 实例
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    const toDelete = []
    for (const [k] of headers.entries()) {
      const lower = k.toLowerCase()
      if (lower.startsWith('x-stainless-') || lower === 'user-agent') {
        toDelete.push(k)
      }
    }
    for (const k of toDelete) headers.delete(k)
    headers.set('User-Agent', ua)
    return headers
  }

  // 2. [key, value] 二维数组
  if (Array.isArray(headers)) {
    const kept = headers.filter(([k]) => {
      const lower = String(k).toLowerCase()
      return lower !== 'user-agent' && !lower.startsWith('x-stainless-')
    })
    kept.push(['User-Agent', ua])
    return kept
  }

  // 3. 普通字面量对象
  const result = typeof headers === 'object' ? headers : {}
  for (const key of Object.keys(result)) {
    const lower = key.toLowerCase()
    if (lower === 'user-agent' || lower.startsWith('x-stainless-')) {
      delete result[key]
    }
  }
  result['User-Agent'] = ua
  return result
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

  const entry = {
    enabled: config.enabled !== false,
    userAgent: typeof config.userAgent === 'string' && config.userAgent !== ''
      ? config.userAgent
      : 'Cline/3.0.0',
    targetHosts: Array.isArray(config.targetHosts) && config.targetHosts.length > 0
      ? [...config.targetHosts]
      : ['api.example.com'],
  }

  globalThis[LIVE] = { ...entry }

  /**
   * 接受一份新配置。整体替换而不是逐字段赋值，读的一侧就不必担心读到半份。
   * @param next - settings 求解出的完整值。
   */
  const adopt = (next) => {
    globalThis[LIVE] = {
      enabled: next.enabled !== false,
      userAgent: typeof next.userAgent === 'string' && next.userAgent !== '' ? next.userAgent : entry.userAgent,
      targetHosts: Array.isArray(next.targetHosts) && next.targetHosts.length > 0 ? [...next.targetHosts] : entry.targetHosts,
    }
  }

  try {
    installCamouflageSettings(ctx, entry, adopt)
  } catch (err) {
    logger?.warn?.('[伪装头] 设置面板注册异常：%s', err?.message ?? err)
  }

  const originalFetch = globalThis.fetch
  if (originalFetch && !globalThis.__dsh_camouflage_fetch_hooked) {
    globalThis.__dsh_camouflage_fetch_hooked = true
    globalThis.fetch = async function (input, init) {
      try {
        if (shouldCamouflage(input)) {
          const ua = activeUserAgent()
          if (input instanceof Request) {
            // 保留 Request 实例原有的鉴权头与其它必要头部，并与 init.headers 合并
            const headers = new Headers(input.headers)
            if (init && init.headers) {
              if (init.headers instanceof Headers) {
                for (const [k, v] of init.headers.entries()) headers.set(k, v)
              } else if (Array.isArray(init.headers)) {
                for (const [k, v] of init.headers) headers.set(k, v)
              } else if (typeof init.headers === 'object') {
                for (const [k, v] of Object.entries(init.headers)) headers.set(k, v)
              }
            }
            applyCamouflageHeaders(headers, ua)
            init = { ...init, headers }
          } else {
            if (!init) init = {}
            init.headers = applyCamouflageHeaders(init.headers || {}, ua)
          }
        }
      } catch (_headerRewriteFailure) {
        // 改不动 header 就按原样发出去：伪装是可选增益，不该让请求本身失败。
      }
      return originalFetch.call(this, input, init)
    }
  }

  /** 给 node:http / node:https 的 request 装同一套改写。 */
  function hookClient(mod, defaultProto = 'https:') {
    if (!mod || !mod.request || mod.__dsh_camouflage_hooked) return
    mod.__dsh_camouflage_hooked = true
    const orig = mod.request

    mod.request = function (...args) {
      let isHit = false
      try {
        let opts = null
        let target = null

        if (typeof args[0] === 'string' || args[0] instanceof URL) {
          target = args[0]
          if (typeof args[1] === 'object' && args[1] !== null) {
            opts = args[1]
          }
        } else if (typeof args[0] === 'object' && args[0] !== null) {
          opts = args[0]
          target = opts
        }

        isHit = shouldCamouflage(target)
        if (isHit) {
          const ua = activeUserAgent()
          if (opts) {
            opts.headers = applyCamouflageHeaders(opts.headers || {}, ua)
          }
        }
      } catch (_headerRewriteFailure) {
        // 同上：改写失败不阻断请求。
      }

      const req = orig.apply(this, args)

      // 拦截底层 ClientRequest.setHeader，防止 SDK 后续注入 x-stainless-* 或覆写 User-Agent
      if (isHit && req && typeof req.setHeader === 'function') {
        try {
          const ua = activeUserAgent()
          const origSetHeader = req.setHeader
          req.setHeader = function (name, value) {
            const lower = String(name).toLowerCase()
            if (lower.startsWith('x-stainless-')) {
              return this
            }
            if (lower === 'user-agent') {
              return origSetHeader.call(this, 'User-Agent', activeUserAgent())
            }
            return origSetHeader.call(this, name, value)
          }
          req.setHeader('User-Agent', ua)
        } catch {}
      }

      return req
    }
  }

  hookClient(http, 'http:')
  hookClient(https, 'https:')

  logger?.info?.(
    `[伪装头] 已就绪：上游请求 User-Agent 伪装为 "${entry.userAgent}"（目标 ${entry.targetHosts.join(', ')}，开关 ${entry.enabled ? '开' : '关'}）`,
  )
}
