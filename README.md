# 伪装头（dsh-plugin-camouflage）

> **提示**：本项目仅供个人 AI 自用与开发测试，非商业项目。

DeepSeek Harness (DSH) 客户端身份伪装与自定义请求头插件。在 DSH 发起对外 LLM 请求时，把 `User-Agent` 换成一个白名单客户端身份（内置主流常用预设，默认 `Cline/3.0.0`），支持配置额外的自定义 HTTP 请求头（如中转站常要求的 `anthropic-version`、`X-Title`、`HTTP-Referer` 等），并顺手剥掉暴露 OpenAI SDK 身份的指纹头，稳定跨过各类 API 中转站的白名单与特征检测。

## 为什么必须从全局 fetch 下手

`settings.yaml` 里给 provider 配 `headers: { User-Agent: ... }` 不会生效。DSH 把 `User-Agent` 当作强制产品归属头：`dsh-llm-pi-ai` 的 `requestHeaders()` 先按大小写无关的名字剔除与归属头冲突的键，再把归属头放在最后展开。配置能保存、能读回，但请求上没有。

pi-ai 每个请求新建一次 `OpenAI` client 且不传 `fetch`，SDK 因此通过 `Shims.getDefaultFetch()` 读取全局 `fetch` 绑定。包一层全局 `fetch`（以及 `node:http` / `node:https` 的 `request`）是唯一能在归属头合并**之后**、字节出网**之前**改写请求头的位置。整个过程不改宿主一个文件，且天然自动覆盖模型对话推理、模型发现（Discover Models）等全部出网动作。

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
| `userAgent` | 伪装成哪个客户端（卡片提供快捷预设下拉菜单）。 | `Cline/3.0.0` |
| `customHeaders` | 额外自定义请求头键值对（动态增删改，自动安全校验）。 | `{}` |
| `targetHosts` | 命中哪些主机才改写；`*` 表示全部。 | `*` |
| `stripStainless` | 剥离 `x-stainless-*` 指纹头。 | `true` |
| `logRewrites` | 每次改写写一行日志，排查用。 | `false` |

与 composition（`cordis.patch.yml`）里相同的字段保存时会被写成 unset，所以 `settings.yaml` 里只留你真正改过的东西，卡片上的「已覆盖」标记和「重置」按钮也才有意义。

## 常用 User-Agent 预设

卡片内置了主流白名单客户端的常用预设，在前端下拉菜单中选择即可自动填入，同时保持完全自由手写编辑：

- `Cline/3.0.0`（原默认）
- `claude-cli/2.1.161 (external, cli)`
- `claude-cli/2.1.161`
- `claude-code/1.0.0`
- `claude-code/0.1.0`
- `Kilo-Code/1.0`
- `Roo-Code/3.8.0`

## 匹配语义

`targetHosts` 每项可以是主机名、URL 或 `*`，写法会被规格化（去协议、去路径、去端口、转小写）后比较：

- 命中条件是**请求主机名等于它，或是它的子域**。子域判断锚在点上，所以 `evil-air-outer.com`、`notps.air-outer.com` 都不会命中 `air-outer.com`。
- `https://ps.air-outer.com` 这类 URL 写法等价于 `ps.air-outer.com`。
- `*` 命中所有请求。

## 安全与边界

- 只有命中主机的请求被改写，其余请求原样透传。
- 自定义请求头遵循 RFC 7230 / 9110 标准 HTTP Token 规范校验，并防范 CRLF（`\r`, `\n`）字符注入。
- 请求头合并采用大小写不敏感去重并始终返回新副本，不污染调用方传入的 headers 实例或字面量。
- 改写失败（配置读不到、头名非法）一律按原样发出：伪装是可选增益，不该让请求本身失败。
- 在 `http.request` 路径上拦截 `ClientRequest.setHeader`，阻止 SDK 在出网前将伪装头或指纹头回注覆盖。
- 插件卸载时还原 `fetch` 与 `http.request` 的原绑定，且只在自己仍是最外层时回退。
- 不修改宿主任何文件，DSH 升级或重装不会让它失效。

## 已知限制

- 这是**进程级**补丁，所有出网请求都会过一遍匹配逻辑（不命中则零改动）。
- 只覆盖全局 `fetch` 与 `node:http`、`node:https` 的 `request`。绕过这三者自建传输的请求不会被改写。
- 只换 UA、自定义 Headers 与剥离指纹头。TLS 指纹等更深的底层网络特征不在范围内。
- 规则按 URL 主机名匹配，同域名下的多个 provider route 无法区分。

## 模型思考能力（Reasoning Efforts）与多模态扩展

插件已完整整合模型思考能力控制，为第三方中转站的自定义模型（如 DeepSeek-R1、Claude 3.7 Sonnet、Qwen-QwQ 等）开启深度思考：

1. **聊天界面原生联动**：为自定义模型配置思考等级后，DSH 原生对话输入框右下角将**自动呼出原生思考等级选择器**（Off / Low / Medium / High / Max），随心调节推理深度。
2. **5 档标准模式与丰富预设**：
   - 默认支持 **5 档标准模式**（`Off`, `Low`, `Medium`, `High`, `Max`），让输入框下拉菜单呈现完整的 5 档控制。
   - 提供丰富的一键预设：
     - **常用五档**：映射 Low / Medium / High / Max，与系统内置 Off 组合成完整的 5 档选择；
     - **五级深度**：映射 Minimal / Low / Medium / High / Max 5 个思考深度级别；
     - **常用三档**：经典 Low / Medium / High 极速配置；
     - **完整七档**：映射 Minimal 到 Max 全部原生等级。
   - 细粒度自定义每个等级的实际传输值（Wire Value）。
   - 支持设置 Provider 级的默认思考等级 (`defaultEffort`)、思考格式 (`thinkingFormat`) 与 System 角色兼容 (`supportsDeveloperRole`)。
3. **独立开关与批量一键开启**：
   - 顶部提供【开启模型思考增强】总开关，可随心开启或关闭思考增强功能。
   - 提供「⚡ 一键为所有自定义模型开启 5 档思考」大按钮，秒级为几十个模型全量开启思考深度调节。
4. **多模态输入声明**：支持一键声明模型的输入能力（保持未声明 / 仅文本 / 文本与图像）。
5. **双通道配置**：
   - **通道一（伪装头主页直接配置）**：在左侧【伪装头】主菜单或内置插件 Tab 中直接浏览所有自定义 Provider，一键配置并持久化。
   - **通道二（原生模型页无缝嵌入）**：在原生「设置 → 模型」展开自定义提供方时，在表单中自动嵌入思考等级编辑区，原生保存同步生效。

## 测试

```bash
npm test          # node --test test/
npm run check     # 语法检查 + 全部测试
```

24 项测试，零依赖。涵盖出网拦截、自定义头注入、防 setHeader 回注，以及完整的模型思考等级算法校验。

## 变更

### 1.5.0

- 新：**模型思考能力管理（Model Thinking / Reasoning Efforts）**。完整整合模型思考控制，配置后 DSH 聊天输入框自动唤出原生思考等级切换器。
- 新：**伪装头主页一站式配置**。在「伪装头」独立菜单与 Tab 下新增【模型思考能力设置】面板，支持多 Provider 切换、一键三档预设与精细 Wire Value 调整。
- 新：**原生模型表单无缝挂载（Inline Manager）**。在「设置 → 模型」中展开自定义 Provider 时无缝嵌入思考等级与协议格式表单，原生保存自动同步。
- 新：**多模态能力配置与协议兼容**。支持声明图片输入（Text & Image）、DeepSeek/OpenAI 思考参数格式，以及使用 system 角色兼容不支持 developer 角色的端点。
- 新：新增 `test/client.test.mjs` 自动化测试套件，全面覆盖模型思考算法与配置流转。

### 1.4.0

- 新：**注册 `settings.section` 顶级设置分区**。在 DSH 设置窗口左侧导航栏直接生成独立的【伪装头】菜单条目（与 Wallpaper Engine、Vision Router 平级并列），点击即可直达完整配置界面。
- 新：**注册 `settings.plugins.tab` 插件页选项卡**。在「内置插件」页面顶部与【插件列表】、【插件管理】、【插件市场】等并列显示【伪装头】Tab。
- 优：详情页（`view: 'page'`）模式下卡片默认完整展开，且点击保存后保持常开状态，操作更流畅。
- 优：完善双层 Hooks 容错垫片，防止旧宿主环境缺少 `ui-slots` 状态派发。

### 1.3.0

- 新：**额外自定义请求头（`customHeaders`）**。支持添加任意中转站所需请求头（如 `anthropic-version`、`X-Title` 等），并在 `fetch`、`http.request` 和 `setHeader` 全链路改写注入。
- 新：**常用 User-Agent 预设下拉选择器**。在设置卡片中提供 Claude CLI、Claude Code、Kilo Code、Roo Code 等主流客户端一键填充，并保持完全可编辑。
- 新：请求头合法性校验（HTTP Token 标准字符校验与 CRLF 换行注入拦截）。
- 新：前端卡片支持动态添加/删除请求头、实时格式验证报错与独立重置。
- 新：23 项零依赖自动化测试，全面覆盖多请求头注入、去重与出网防御。

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

