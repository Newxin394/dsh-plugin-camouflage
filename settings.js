/**
 * 伪装头（client-camouflage）的设置命名空间：把 enabled / userAgent /
 * targetHosts 变成「设置 → 插件」里可以点、可以填的东西，而不是必须手写
 * 进 settings.yaml 的三行 YAML。
 */
import { createRequire } from 'node:module'

/** 命名空间；浏览器那半张卡片用同一个字符串认领自己。 */
export const CAMOUFLAGE_NS = 'client-camouflage'

/**
 * 动态探测环境中的 schemastery 实例，确保无论通过软链接还是直接安装都能找到。
 */
function resolveSchemastery() {
  const candidates = [
    'schemastery',
    '@deepseek-ai/schemastery'
  ]
  for (const name of candidates) {
    try {
      const req = createRequire(process.cwd() + '/package.json')
      const mod = req(name)
      if (mod && (mod.object || mod.default?.object)) return mod.default || mod
    } catch {}
  }
  try {
    const req = createRequire('C:/Users/Administrator/.dsh/profiles/web/package.json')
    const mod = req('schemastery')
    if (mod && (mod.object || mod.default?.object)) return mod.default || mod
  } catch {}
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
      userAgent: z.string().default('Cline/3.0.0'),
      targetHosts: z.array(z.string()).default(['*']),
    })
    const scope = scopedCtx.settings.register(CAMOUFLAGE_NS, CamouflageSettings, { base: entry })
    const push = () => { adopt(scope.get()) }
    scopedCtx.effect(() => () => { adopt(entry) })
    push()
    scope.watch(push)
  })
}
