# 伪装头（dsh-plugin-camouflage）

> **提示**：本项目仅供个人 AI 自用与开发测试，非商业项目。

DeepSeek Harness (DSH) 客户端身份伪装插件。

## 功能

在 DSH 发起对外 LLM 请求（通过 `globalThis.fetch`、`http.request` 或 `https.request`）时，自动将 `User-Agent` 标头伪装为白名单客户端身份（如 `Cline/3.0.0`），解决 API 中转站（如 AgentRouter、OneAPI/NewAPI 客户端白名单拦截）返回 `401 Unauthorized (API 密钥无效)` 的问题。

## 特点

- **零侵入**：无需篡改 DSH 核心 unpacked 源码文件，版本升级或重装不失效。
- **开箱即用**：默认伪装为 `Cline/3.0.0`，只改写命中目标主机的请求。
- **有界面**：「设置 → 插件 → 插件配置」里有一张「伪装头」卡片，开关、User-Agent、目标主机都能直接改，保存即生效，不用重启。

## 设置界面

卡片键在 settings 命名空间 `client-camouflage` 上，三个字段：

| 字段 | 含义 | 默认 |
| --- | --- | --- |
| `enabled` | 总开关。关掉后请求按原样发出。 | `true` |
| `userAgent` | 伪装成哪个客户端。 | `Cline/3.0.0` |
| `targetHosts` | 命中哪些主机才改写；`*` 表示全部。 | `api.example.com` |

和 composition（`cordis.patch.yml`）里那份配置相同的字段保存时会被写成 unset，所以 `settings.yaml` 里只留你真正改过的东西，卡片上的「已覆盖」标记和「重置」按钮也才有意义。

## 结构

- `index.js` —— 宿主半边：装 fetch / http / https 钩子，把 settings 的值喂给它们。
- `settings.js` —— 注册 `client-camouflage` 命名空间。宿主半边用动态 `import()` 加载它，解析失败只降级到 composition 配置，不会让整个插件加载失败。
- `client.js` —— 浏览器半边：那张卡片，自带样式与中英词典。

## 免责声明

1. **自用测试**：本项目仅供个人学习、技术研究及 AI 自用场景测试，切勿用于任何商业用途或未经授权的环境。
2. **合规义务**：使用者在使用本插件及相关接口时，应严格遵守国家相关法律法规以及各大模型提供方、API 中转平台的服务条款与开发者规范。
3. **免责条款**：本项目按“现状”（AS-IS）提供，不对插件的可用性、完整性或因使用本插件可能导致的任何风险作担保。任何因使用本项目而导致的账号封禁、风控拦截、数据丢失或法律纠纷，均由使用者自行承担，作者概不承担任何连带责任。

