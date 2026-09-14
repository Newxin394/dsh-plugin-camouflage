# 伪装头（dsh-plugin-camouflage）

> **提示**：本项目仅供个人 AI 自用与开发测试，非商业项目。

DeepSeek Harness (DSH) 客户端身份伪装插件。在 DSH 发起对外 LLM 请求时，把 `User-Agent` 换成一个白名单客户端身份（默认 `Cline/3.0.0`），并顺手剥掉暴露 OpenAI SDK 身份的指纹头，用来过 API 中转站的客户端白名单。

## 为什么必须从全局 fetch 下手

`settings.yaml` 里给 provider 配 `headers: { User-Agent: ... }` 不会生效。DSH 把 `User-Agent` 当作强制产品归属头：`dsh-llm-pi-ai` 的 `requestHeaders()` 先按大小写无关的名字剔除与归属头冲突的键，再把归属头放在最后展开。配置能保存、能读回，但请求上没有。

pi-ai 每个请求新建一次 `OpenAI` client 且不传 `fetch`，SDK 因此通过 `Shims.getDefaultFetch()` 读取全局 `fetch` 绑定。包一层全局 `fetch`（以及 `node:http` / `node:https` 的 `request`）是唯一能在归属头合并**之后**、字节出网**之前**改写请求头的位置。整个过程不改宿主一个文件。

## 安装

在 profile 的 `package.json` 里加依赖，再装回去：

```json
"dependencies": {
  "dsh-plugin-camouflage": "github:Newxin394/dsh-plugin-camouflage"
}
```

本地开发时用路径引用即可：`"dsh-plugin-camouflage": "file:./plugins/dsh-plugin-camouflage"`。

包自带 `cordis.patch.yml`（见 `dsh.bundle.patch`），装好以后由 loader 自动 insert 成 `client-camouflage` 这一行，不需要再往 profile 的 `cordis.patch.yml` 手写 insert 段。宿主半边与浏览器半边分别由 `index.js`、`client.js` 提供。

## 配置

在「设置 → 插件 → 插件配置」里改，保存即生效，不用重启。所有字段也都支持写进 `settings.yaml` 的 `client-camouflage` 段。

| 字段 | 含义 | 默认 |
| --- | --- | --- |
| `enabled` | 总开关。关掉后请求按原样发出。 | `true` |
| `userAgent` | 伪装成哪个客户端。 | `Cline/3.0.0` |
| `targetHosts` | 命中哪些主机才改写；`*` 表示全部。 | `*` |
| `stripStainless` | 剥离 `x-stainless-*` 指纹头。 | `true` |
| `logRewrites` | 每次改写写一行日志，排查用。 | `false` |

与 composition（`cordis.patch.yml`）里相同的字段保存时会被写成 unset，所以 `settings.yaml` 里只留你真正改过的东西，卡片上的「已覆盖」标记和「重置」按钮也才有意义。

## 匹配语义

`targetHosts` 每项可以是主机名、URL 或 `*`，写法会被规格化（去协议、去路径、去端口、转小写）后比较：

- 命中条件是**请求主机名等于它，或是它的子域**。子域判断锚在点上，所以 `evil-air-outer.com`、`notps.air-outer.com` 都不会命中 `air-outer.com`。
- `https://ps.air-outer.com` 这类 URL 写法等价于 `ps.air-outer.com`。
- `*` 命中所有请求。

## 安全与边界

- 只有命中主机的请求被改写，其余请求原样透传。
- 只动 `User-Agent` 与 `x-stainless-*` 两类头，`authorization`、`cookie` 等一律不碰。
- 改写失败（配置读不到、头名非法）一律按原样发出：伪装是可选增益，不该让请求本身失败。
- 插件卸载时还原 `fetch` 与 `http.request` 的原绑定，且只在自己仍是最外层时回退。
- 不修改宿主任何文件，DSH 升级或重装不会让它失效。

## 已知限制

- 这是**进程级**补丁，所有出网请求都会过一遍匹配逻辑（不命中则零改动）。
- 只覆盖全局 `fetch` 与 `node:http`、`node:https` 的 `request`。绕过这三者自建传输的请求不会被改写。
- 只换 UA 与指纹头。TLS 指纹、请求头顺序等更深的客户端特征不在范围内。
- 规则按 URL 主机名匹配，同域名下的多个 provider route 无法区分。

## 测试

```bash
npm test          # node --test test/
npm run check     # 语法检查 + 全部测试
```

18 项，零依赖。其中两项会起一个本地 HTTP 服务发真实请求，验证 `http.request` 那条路径确实改写了出网请求头，并且能拦下 SDK 随后用 `setHeader` 压回来的 `User-Agent` 与 `x-stainless-*`。

## 变更

### 1.2.0

- 修：`settings.js` 不再写死 profile 绝对路径。改为从插件自身位置向上解析 `schemastery`，并在多个副本中优先用宿主那一份。
- 修：`applyCamouflageHeaders` 不再就地修改调用方传入的头对象或 `Headers` 实例，改写结果一律是新副本。
- 修：`fetch` 与 `http.request` 钩子在插件卸载时还原原绑定，不再一装到底。
- 修：`targetHosts` 的默认值在 `index.js`、settings schema、卡片三处统一为 `*`。
- 新：`stripStainless` 开关。某些中转站认的恰恰是 OpenAI 官方 SDK 的指纹头，这时可以关掉剥离。
- 新：`logRewrites` 开关，逐条记录改写。
- 新：主机规则改为按配置对象缓存的查表结构，省掉每个请求重新规格化一遍。
- 新：18 项测试与 GitHub Actions CI。

### 1.1.4

- 主机名提取加固（URL、Request、options 多形态），点锚定的子域匹配。
- `fetch` 处理 `Request` 实例时保留其自带鉴权头，并与 `init.headers` 合并。
- 剥离 `x-stainless-*`，并拦截 `ClientRequest.setHeader` 阻止 SDK 回注。

### 1.1.3

- 设置卡片注册进 `settings.plugin.item`。
- 依赖解析加 `@deepseek-ai/schemastery` 回落。

