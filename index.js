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
 * 判断一个 URL 是否该被伪装。
 * @param urlStr - 待判断的完整 URL 字符串；空串一律不改写。
 * @returns 命中 targetHosts 且开关打开时为 true。
 */
function shouldCamouflage(urlStr) {
  const cfg = globalThis[LIVE]
  if (!cfg || cfg.enabled !== true) return false
  if (!urlStr) return false
  if (cfg.targetHosts.includes('*')) return true
  for (const host of cfg.targetHosts) {
    if (urlStr.includes(host)) return true
  }
  return false
}

/** 读当前生效的 User-Agent。 */
function activeUserAgent() {
  return globalThis[LIVE]?.userAgent ?? 'Cline/3.0.0'
}

/**
 * 覆盖 fetch init 里的 User-Agent，三种 headers 形态都要处理：Headers 实例、
 * [name, value] 数组、普通对象。原有的同名键先删再写，避免大小写不同的两份并存。
 */
function overwriteFetchUserAgent(init, ua) {
  if (typeof Headers !== 'undefined' && init.headers instanceof Headers) {
    init.headers.set('User-Agent', ua)
    return
  }
  if (Array.isArray(init.headers)) {
    const kept = init.headers.filter((pair) => String(pair[0]).toLowerCase() !== 'user-agent')
    kept.push(['User-Agent', ua])
    init.headers = kept
    return
  }
  for (const key of Object.keys(init.headers)) {
    if (key.toLowerCase() === 'user-agent') delete init.headers[key]
  }
  init.headers['User-Agent'] = ua
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
        let urlStr = ''
        if (typeof input === 'string') urlStr = input
        else if (input instanceof URL) urlStr = input.href
        else if (input && typeof input.url === 'string') urlStr = input.url

        if (shouldCamouflage(urlStr)) {
          if (!init) init = {}
          if (!init.headers) init.headers = {}
          overwriteFetchUserAgent(init, activeUserAgent())
        }
      } catch (_headerRewriteFailure) {
        // 改不动 header 就按原样发出去：伪装是可选增益，不该让请求本身失败。
      }
      return originalFetch.call(this, input, init)
    }
  }

  /** 给 node:http / node:https 的 request 装同一套改写。 */
  function hookClient(mod) {
    if (!mod || !mod.request || mod.__dsh_camouflage_hooked) return
    mod.__dsh_camouflage_hooked = true
    const orig = mod.request
    mod.request = function (...args) {
      try {
        let urlStr = ''
        let opts = null

        if (typeof args[0] === 'string' || args[0] instanceof URL) {
          urlStr = String(args[0])
          opts = args[1]
        } else if (typeof args[0] === 'object' && args[0] !== null) {
          opts = args[0]
          urlStr = (opts.protocol || 'http:') + '//' + (opts.hostname || opts.host || '') + (opts.path || '')
        }

        if (shouldCamouflage(urlStr) && opts) {
          opts.headers = opts.headers || {}
          for (const key of Object.keys(opts.headers)) {
            if (key.toLowerCase() === 'user-agent') delete opts.headers[key]
          }
          opts.headers['User-Agent'] = activeUserAgent()
        }
      } catch (_headerRewriteFailure) {
        // 同上：改写失败不阻断请求。
      }
      return orig.apply(this, args)
    }
  }

  hookClient(http)
  hookClient(https)

  logger?.info?.(
    `[伪装头] 已就绪：上游请求 User-Agent 伪装为 "${entry.userAgent}"（目标 ${entry.targetHosts.join(', ')}，开关 ${entry.enabled ? '开' : '关'}）`,
  )
}
