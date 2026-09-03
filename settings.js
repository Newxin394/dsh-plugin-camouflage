/**
 * 伪装头（client-camouflage）的设置命名空间：把 enabled / userAgent /
 * targetHosts 变成「设置 → 插件」里可以点、可以填的东西，而不是必须手写
 * 进 settings.yaml 的三行 YAML。
 *
 * 这个模块被 index.js 用 `await import()` 动态加载，失败只降级、不致命：
 * 它是唯一一处依赖外部包（schemastery）的地方，而 User-Agent 伪装本身
 * 一个依赖都不需要。ESM 的静态 import 一旦解析失败就是模块求值期的
 * SyntaxError，cordis 会把整个 entry 判为加载失败 —— 那会连带把伪装功能
 * 一起弄没。动态导入把这个风险关进 try 里：设置面板没了，钩子还在。
 *
 * 用 `@deepseek-ai/schemastery` 而不是裸 `schemastery`，是为了和宿主
 * dsh-settings 用的是同一份实例 —— 它要对同一个 schema 调 toJSON() 下发给
 * 浏览器、再 rehydrate 回来校验，两份不同副本没必要冒风险。
 */
import z from '@deepseek-ai/schemastery'

/** 命名空间；浏览器那半张卡片用同一个字符串认领自己。 */
export const CAMOUFLAGE_NS = 'client-camouflage'

/**
 * 宿主校验与浏览器表单共用的 schema。
 *
 * 三个字段都给 default，是因为 settings 的 register 会用
 * `schema(merge(base, user))` 求解：给了默认值，用户section 缺字段时才不会
 * 变成 undefined 落到钩子里。
 */
export const CamouflageSettings = z.object({
  enabled: z.boolean().default(true),
  userAgent: z.string().default('Cline/3.0.0'),
  targetHosts: z.array(z.string()).default(['api.example.com']),
})

/**
 * 把命名空间挂到 settings 服务上，并让每次保存立刻流回运行中的钩子。
 *
 * `ctx.inject(['settings'], ...)` 是优雅降级的边界：宿主没有 settings 服务时
 * 回调根本不执行，composition 里的 entry 配置继续生效，行为和加这个模块之前
 * 完全一样。
 *
 * @param ctx - 拥有这份接线的插件上下文。
 * @param entry - composition 里那份配置，作为 settings 的 base 层。
 * @param adopt - 收到新值时调用；卸载时会用 entry 再调一次，
 *   这样一个被禁用的 section 不会让钩子停在谁都看不见改不了的值上。
 * @returns 无。
 */
export function installCamouflageSettings(ctx, entry, adopt) {
  ctx.inject(['settings'], (scopedCtx) => {
    const scope = scopedCtx.settings.register(CAMOUFLAGE_NS, CamouflageSettings, { base: entry })
    const push = () => { adopt(scope.get()) }
    scopedCtx.effect(() => () => { adopt(entry) })
    push()
    scope.watch(push)
  })
}
