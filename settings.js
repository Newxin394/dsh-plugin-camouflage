/**
 * 伪装头（client-camouflage）的设置命名空间：把 enabled / userAgent /
 * targetHosts / stripStainless / logRewrites 变成「设置 → 插件」里可以点、
 * 可以填的东西，而不是必须手写进 settings.yaml 的几行 YAML。
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 命名空间；浏览器那半张卡片用同一个字符串认领自己。 */
export const CAMOUFLAGE_NS = 'client-camouflage'

/** 本文件所在目录 —— 唯一一个不随宿主工作目录漂移的锚点。 */
const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * 从插件自身向上收集解析锚点。
 *
 * 不用 process.cwd()：那是用户当前打开的项目文件夹，和插件装在哪没有关系。
 * 也不写死 profile 的绝对路径：那会把用户名和盘符钉进源码，换台机器或换个
 * home 就再也找不到 schemastery。从插件目录向上走，profile 的 node_modules
 * 和宿主的 node_modules 都在这条链上，谁装了都能找到。
 *
 * @returns {string[]} createRequire 可用的锚点文件路径，由近及远。
 */
export function resolutionAnchors() {
  const anchors = []
  let current = HERE
  for (let depth = 0; depth < 8; depth += 1) {
    anchors.push(join(current, 'package.json'))
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return anchors
}

/**
 * 包名候选：先宿主那一份，再社区同名包。
 *
 * 顺序有意义：宿主自己用 @deepseek-ai/schemastery 校验 profile 里的 schema，
 * 插件这边若拿到另一个副本，两边对同一份 schema 的解读就可能不一致。
 */
const CANDIDATES = ['@deepseek-ai/schemastery', 'schemastery']

/**
 * 动态探测环境中的 schemastery 实例，确保无论通过软链接还是直接安装都能找到。
 * @returns 可用的 schemastery 模块，或 null（调用方降级到 composition 配置）。
 */
export function resolveSchemastery() {
  for (const anchor of resolutionAnchors()) {
    let req
    try {
      req = createRequire(anchor)
    } catch {
      continue
    }
    for (const candidate of CANDIDATES) {
      try {
        const mod = req(candidate)
        const z = mod?.default ?? mod
        if (z && typeof z.object === 'function') return z
      } catch {
        // 这个锚点没有这个包，接着找下一个。
      }
    }
  }
  return null
}

/**
 * 把命名空间挂到 settings 服务上，并让每次保存立刻流回运行中的钩子。
 *
 * @param ctx - 拥有这份接线的插件上下文。
 * @param entry - composition 里那份配置，作为 settings 的 base 层。
 * @param adopt - 收到新值时调用；卸载时会用 entry 再调一次。
 */
export function installCamouflageSettings(ctx, entry, adopt) {
  ctx.inject(['settings'], (scopedCtx) => {
    const z = resolveSchemastery()
    if (!z || typeof z.object !== 'function') {
      ctx?.logger?.('camouflage')?.warn?.('[伪装头] 未找到可用的 schemastery 库，跳过注册 settings 服务')
      return
    }
    const CamouflageSettings = z.object({
      enabled: z.boolean().default(true),
      enableThinking: z.boolean().default(true),
      userAgent: z.string().default('Cline/3.0.0'),
      targetHosts: z.array(z.string()).default(['*']),
      customHeaders: typeof z.dict === 'function' ? z.dict(z.string()).default({}) : z.object({}).default({}),
      stripStainless: z.boolean().default(true),
      logRewrites: z.boolean().default(false),
    })
    const scope = scopedCtx.settings.register(CAMOUFLAGE_NS, CamouflageSettings, { base: entry })
    const push = () => { adopt(scope.get()) }
    scopedCtx.effect(() => () => { adopt(entry) })
    push()
    scope.watch(push)
  })
}
