window.__ModuleLoader__.load({
  id: 'dsh-plugin-camouflage',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    // 只 require 平台种子表里的标准基础模块，确保在任何 DSH 运行环境 100% 能够加载
    const React = require('react')
    const { createElement: h, useEffect, useRef, useState, Fragment } = React

    let createSnapshotStore = null
    try {
      createSnapshotStore = require('@deepseek-ai/dsh-client-store').createSnapshotStore
    } catch {
      createSnapshotStore = null
    }

    let primitives = {}
    try {
      primitives = require('@deepseek-ai/dsh-client-ui-primitives') || {}
    } catch {
      primitives = {}
    }

    const {
      IconChevronDownOutline14,
    } = primitives

    /** 词典命名空间，同时也是这张卡片认领的 settings 命名空间。 */
    const NS = 'client-camouflage'

    /** 模型思考等级列表（与 DSH 原生 llm-pi-ai 保持完全一致）。 */
    const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
    const NON_OFF_LEVELS = LEVELS.filter(level => level !== 'off')

    /** 常用 5 档预设（加上原生 off，在输入框弹出完整的 5 档选择：Off / Low / Medium / High / Max） */
    const COMMON_5_LEVELS = {
      low: 'low',
      medium: 'medium',
      high: 'high',
      max: 'max',
    }

    /** 5 级思考深度预设（Minimal / Low / Medium / High / Max） */
    const DEPTH_5_LEVELS = {
      minimal: 'minimal',
      low: 'low',
      medium: 'medium',
      high: 'high',
      max: 'max',
    }

    /** 常用 3 档预设（Low / Medium / High） */
    const COMMON_3_LEVELS = {
      low: 'low',
      medium: 'medium',
      high: 'high',
    }

    /** DSH 原生支持的思考协议格式 */
    const THINKING_FORMATS = [
      'openai', 'deepseek', 'openrouter', 'together', 'zai', 'qwen', 'string-thinking', 'ant-ling',
    ]

    /** 需要支持 developer 角色兼容的 API 协议 */
    const DEVELOPER_ROLE_APIS = new Set([
      'openai-completions',
      'openai-responses',
      'azure-openai-responses',
      'openai-codex-responses',
    ])

    /** 常用客户端身份预设，与 index.js 一致。 */
    const USER_AGENT_PRESETS = [
      'Cline/3.0.0',
      'claude-cli/2.1.161 (external, cli)',
      'claude-cli/2.1.161',
      'claude-code/1.0.0',
      'claude-code/0.1.0',
      'Kilo-Code/1.0',
      'Roo-Code/3.8.0',
    ]

    /** RFC 7230 / 9110 标准 HTTP Token 正则。 */
    const HTTP_TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/

    /** 宿主没提供 targetHosts 时表单退回的值，与 index.js 的 DEFAULT_TARGET_HOSTS 一致。 */
    const DEFAULT_HOSTS = ['*']

    const CSS = `
.dshcam_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}
.dshcam_card:hover{border-color:var(--dsw-alias-label-dimmed)}
.dshcam_cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}
.dshcam_header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}
.dshcam_header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dshcam_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}
.dshcam_name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}
.dshcam_description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}
.dshcam_chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}
.dshcam_chevronOpen{transform:rotate(180deg)}
.dshcam_pending{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}
.dshcam_body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}
.dshcam_readOnly{color:var(--dsw-alias-label-tertiary);margin:12px 0 0;font-size:12px;line-height:1.5}
.dshcam_field{flex-direction:column;gap:6px;padding:12px 0;display:flex}
.dshcam_field+.dshcam_field{border-top:1px solid var(--dsw-alias-border-l2)}
.dshcam_head{align-items:center;gap:8px;display:flex}
.dshcam_label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}
.dshcam_badges{align-items:center;gap:8px;display:inline-flex}
.dshcam_badge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}
.dshcam_reset{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;padding:0;font-size:12px;line-height:1.5}
.dshcam_reset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
.dshcam_reset:disabled{cursor:default;opacity:.4}
.dshcam_input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5;width:100%;box-sizing:border-box}
.dshcam_area{height:76px;padding-top:7px;padding-bottom:7px;resize:vertical;line-height:1.5}
.dshcam_input:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}
.dshcam_input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
.dshcam_inputInvalid{border-color:var(--dsw-alias-state-error-primary)}
.dshcam_invalid{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px;line-height:1.5}
.dshcam_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}
.dshcam_toggleRow{color:var(--dsw-alias-label-secondary);justify-content:space-between;align-items:flex-start;gap:16px;font-size:13px;line-height:1.5;display:flex}
.dshcam_toggleLabel{flex:1;min-width:0;color:var(--dsw-alias-label-primary);font-weight:500}
.dshcam_switch{box-sizing:border-box;background:var(--dsw-alias-border-l3);cursor:pointer;border:0;border-radius:10px;flex:none;width:36px;height:20px;padding:2px;position:relative}
.dshcam_switchOn{background:var(--dsw-alias-brand-primary)}
.dshcam_switch:disabled{cursor:default;opacity:.5}
.dshcam_switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dshcam_thumb{background:var(--dsw-alias-label-primary-foreground);border-radius:50%;width:16px;height:16px;transition:transform .12s;display:block}
.dshcam_switchOn .dshcam_thumb{transform:translate(16px)}
.dshcam_footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}
.dshcam_failed{min-width:0;color:var(--dsw-alias-state-error-primary);flex:1;margin:0;font-size:12px;line-height:1.5}
.dshcam_discard,.dshcam_save{appearance:none;font:inherit;cursor:pointer;border:1px solid #0000;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}
.dshcam_discard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}
.dshcam_discard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}
.dshcam_save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
.dshcam_discard:disabled,.dshcam_save:disabled{opacity:.4;cursor:default}
.dshcam_uaRow{display:grid;grid-template-columns:minmax(0,1fr) minmax(130px,auto);gap:8px;align-items:center}
.dshcam_select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 8px;font-size:13px;line-height:1.5;box-sizing:border-box}
.dshcam_select:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}
.dshcam_select:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
.dshcam_headersList{display:flex;flex-direction:column;gap:8px;margin-top:2px}
.dshcam_headerRow{display:grid;grid-template-columns:minmax(110px,.8fr) minmax(140px,1.2fr) 34px;gap:8px;align-items:center}
.dshcam_delBtn{appearance:none;border:1px solid var(--dsw-alias-border-l2);background:0 0;color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:8px;width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;padding:0;font-size:14px;line-height:1}
.dshcam_delBtn:hover:not(:disabled){color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.dshcam_delBtn:disabled{cursor:default;opacity:.4}
.dshcam_addBtn{appearance:none;font:inherit;border:1px dashed var(--dsw-alias-border-l2);background:0 0;color:var(--dsw-alias-brand-primary);cursor:pointer;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:500;display:inline-flex;align-items:center;gap:6px;align-self:flex-start;margin-top:2px}
.dshcam_addBtn:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}
.dshcam_addBtn:disabled{cursor:default;opacity:.4}
.dshcam_section{width:100%;max-width:800px;display:flex;flex-direction:column;gap:18px}
.dshcam_sectionHead{display:flex;flex-direction:column;gap:4px}
.dshcam_sectionTitle{margin:0;font-size:16px;font-weight:600;line-height:24px;color:var(--dsw-alias-label-primary)}
.dshcam_sectionDesc{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}

/* 模型思考能力与扩展面板 */
.dshcam_thinkingSection{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:14px}
.dshcam_thinkingDisabledBanner{background:var(--dsw-alias-bg-layer-1);border:1px dashed var(--dsw-alias-border-l2);border-radius:8px;padding:12px 14px;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}
.dshcam_thinkingToolsBar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding-bottom:4px}
.dshcam_providerTabs{display:flex;flex-wrap:wrap;gap:6px;border-bottom:1px solid var(--dsw-alias-border-l2);padding-bottom:10px}
.dshcam_tabBtn{appearance:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:8px;padding:5px 12px;font-size:12px;font-weight:500;line-height:1.5;transition:all .15s}
.dshcam_tabBtn:hover{border-color:var(--dsw-alias-label-dimmed);color:var(--dsw-alias-label-primary)}
.dshcam_tabBtnActive{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground);border-color:var(--dsw-alias-brand-primary)}
.dshcam_emptyProviders{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.6;margin:8px 0}

.dsh-mrs-band{display:flex;flex-direction:column;gap:12px}
.dsh-mrs-band h4{margin:0;font-size:14px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dsh-mrs-field,.dsh-mrs-mode,.dsh-mrs-wire{display:flex;flex-direction:column;gap:5px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.dsh-mrs-field input,.dsh-mrs-field select,.dsh-mrs-mode select,.dsh-mrs-wire input{box-sizing:border-box;width:100%;height:32px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;letter-spacing:0}
.dsh-mrs-field input:focus,.dsh-mrs-field select:focus,.dsh-mrs-mode select:focus,.dsh-mrs-wire input:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}
.dsh-mrs-route-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.dsh-mrs-compat-check{display:flex;align-items:flex-start;gap:8px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;cursor:pointer}
.dsh-mrs-compat-check input{margin:3px 0 0;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.dsh-mrs-compat-check span{display:flex;flex-direction:column;gap:2px}
.dsh-mrs-compat-check strong{font-size:13px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-primary)}
.dsh-mrs-compat-check small{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.dsh-mrs-models{display:flex;flex-direction:column;border-top:1px solid var(--dsw-alias-border-l2);margin-top:4px}
.dsh-mrs-model{padding:12px 0;border-bottom:1px solid var(--dsw-alias-border-l2);display:flex;flex-direction:column;gap:10px}
.dsh-mrs-model-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.dsh-mrs-model-head>div:first-child{display:flex;align-items:baseline;gap:8px;min-width:0;flex-wrap:wrap}
.dsh-mrs-model strong{font-size:13px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-primary)}
.dsh-mrs-model code{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-module-platform);padding:1px 5px;border-radius:4px;overflow-wrap:anywhere}
.dsh-mrs-model-controls{display:flex;justify-content:flex-end;gap:8px;flex:1;flex-wrap:wrap}
.dsh-mrs-mode{width:min(180px,100%)}
.dsh-mrs-presets{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0}
.dsh-mrs-levels{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px}
.dsh-mrs-level{min-height:34px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;display:flex;flex-direction:column;gap:6px;background:var(--dsw-alias-bg-layer-1)}
.dsh-mrs-level-active{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-interactive-bg-hover)}
.dsh-mrs-check{display:flex;align-items:center;gap:7px;font-size:12px;line-height:18px;font-weight:500;cursor:pointer}
.dsh-mrs-check input{margin:0;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.dsh-mrs-wire input{height:28px;font-size:12px;background:var(--dsw-alias-bg-layer-2)}
.dsh-mrs-actions{display:flex;justify-content:flex-end;align-items:center;gap:10px;padding-top:8px}
.dsh-mrs-error{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary)}
.dsh-mrs-empty-inline{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dsh-mrs-btn{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);padding:5px 12px;font-size:12px;font-weight:500;display:inline-flex;align-items:center;gap:4px;transition:all .15s}
.dsh-mrs-btn:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.dsh-mrs-btn:disabled{opacity:.4;cursor:default}
.dsh-mrs-btnPrimary{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3);border-color:transparent}
.dsh-mrs-btnPrimary:hover:not(:disabled){background:var(--dsw-alias-label-secondary);color:var(--dsw-alias-bg-layer-3)}
.dsh-mrs-btnHighlight{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground);border-color:var(--dsw-alias-brand-primary)}
.dsh-mrs-btnHighlight:hover:not(:disabled){filter:brightness(1.1)}
.dsh-mrs-toast{position:fixed;z-index:10000;right:20px;bottom:20px;max-width:min(440px,calc(100vw - 40px));padding:10px 16px;border:1px solid var(--dsw-alias-brand-primary);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 8px 24px rgba(0,0,0,.24);font-size:13px;line-height:20px}
.dsh-mrs-toast-error{border-color:var(--dsw-alias-state-error-primary)}
`

    if (typeof document !== 'undefined' && document.getElementById('dshcam-style') === null) {
      const style = document.createElement('style')
      style.id = 'dshcam-style'
      style.textContent = CSS
      document.head.appendChild(style)
    }

    // ---------------------------------------------------------------- 核心纯函数与状态处理

    function objectOf(value) {
      return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
    }

    function clone(value) {
      return value === undefined ? undefined : structuredClone(value)
    }

    function hostsToText(hosts) {
      return Array.isArray(hosts) ? hosts.join('\n') : ''
    }

    function textToHosts(text) {
      const kept = []
      for (const piece of String(text).split(/[\s,]+/)) {
        const host = piece.trim()
        if (host !== '' && !kept.includes(host)) kept.push(host)
      }
      return kept
    }

    function sameHosts(a, b) {
      return a.length === b.length && a.every((host, index) => host === b[index])
    }

    function headersToList(dict) {
      if (!dict || typeof dict !== 'object' || Array.isArray(dict)) return []
      return Object.entries(dict).map(([name, value]) => ({
        id: Math.random().toString(36).slice(2, 10),
        name: String(name),
        value: String(value),
      }))
    }

    function listToHeaders(list) {
      const dict = {}
      if (!Array.isArray(list)) return dict
      for (const item of list) {
        if (!item) continue
        const name = String(item.name ?? '').trim()
        const value = String(item.value ?? '')
        if (name !== '') dict[name] = value
      }
      return dict
    }

    function sameHeaders(listA, listB) {
      const dictA = listToHeaders(listA)
      const dictB = listToHeaders(listB)
      const keysA = Object.keys(dictA)
      const keysB = Object.keys(dictB)
      if (keysA.length !== keysB.length) return false
      for (const k of keysA) {
        if (dictA[k] !== dictB[k]) return false
      }
      return true
    }

    function validateCustomHeaders(list) {
      if (!Array.isArray(list) || list.length === 0) return { error: null }
      const seen = new Set()
      for (const item of list) {
        const name = String(item.name ?? '').trim()
        const value = String(item.value ?? '')
        if (name === '' && value === '') continue
        if (name === '') return { error: 'headerNameRequired' }
        if (!HTTP_TOKEN.test(name)) return { error: 'headerNameInvalid' }
        const lower = name.toLowerCase()
        if (lower === 'user-agent') return { error: 'headerUserAgentDuplicate' }
        if (seen.has(lower)) return { error: 'headerNameDuplicate' }
        seen.add(lower)
        if (/\r|\n/.test(value)) return { error: 'headerValueInvalid' }
      }
      return { error: null }
    }

    function formOf(value) {
      const source = value !== null && typeof value === 'object' ? value : {}
      return {
        enabled: source.enabled !== false,
        enableThinking: source.enableThinking !== false,
        stripStainless: source.stripStainless !== false,
        userAgent: typeof source.userAgent === 'string' ? source.userAgent : 'Cline/3.0.0',
        hostsText: hostsToText(Array.isArray(source.targetHosts) ? source.targetHosts : DEFAULT_HOSTS),
        customHeaders: headersToList(source.customHeaders),
      }
    }

    // ---------------------------------------------------------------- 模型思考算法（llm-pi-ai 映射）

    function modelState(raw) {
      const model = clone(objectOf(raw))
      const configured = model.reasoningEfforts
      const input = Array.isArray(model.input) ? model.input : []
      let mode = 'inherit'
      let efforts = {}
      if (configured === false) {
        mode = 'disabled'
      } else if (configured !== null && typeof configured === 'object' && !Array.isArray(configured)) {
        mode = 'custom'
        efforts = Object.fromEntries(
          LEVELS.filter(level => Object.prototype.hasOwnProperty.call(configured, level))
            .map(level => [level, configured[level]]),
        )
      }
      return {
        id: typeof model.id === 'string' ? model.id : '',
        name: typeof model.name === 'string' && model.name.length > 0 ? model.name : undefined,
        raw: model,
        inputMode: input.includes('image') ? 'image' : input.includes('text') ? 'text' : 'inherit',
        mode,
        efforts,
      }
    }

    function headerState(raw) {
      const headers = objectOf(raw)
      let userAgent = ''
      const otherHeaders = new Map()
      for (const [name, value] of Object.entries(headers)) {
        if (typeof value !== 'string') continue
        const normalized = name.toLowerCase()
        if (normalized === 'user-agent') {
          userAgent = value
          continue
        }
        const previous = otherHeaders.get(normalized)
        otherHeaders.set(normalized, {
          id: previous?.id ?? `stored-header-${otherHeaders.size}`,
          name,
          value,
        })
      }
      return { userAgent, otherHeaders: [...otherHeaders.values()] }
    }

    function validateHeaderDraft(value) {
      if (value.userAgent !== undefined && (typeof value.userAgent !== 'string' || /\r|\n/.test(value.userAgent))) {
        return { key: 'validationHeaderValue' }
      }
      const seen = new Set()
      const headers = Array.isArray(value.headers) ? value.headers : []
      for (const header of headers) {
        const name = String(header.name ?? '').trim()
        if (!HTTP_TOKEN.test(name)) return { key: 'validationHeaderName', header: name }
        if (/\r|\n/.test(header.value ?? '')) return { key: 'validationHeaderValue', header: name }
        const normalized = name.toLowerCase()
        if (normalized === 'user-agent') return { key: 'validationUserAgentDuplicate', header: name }
        if (seen.has(normalized)) return { key: 'validationHeaderDuplicate', header: name }
        seen.add(normalized)
      }
      return undefined
    }

    function providerDrafts(snapshot) {
      const effectiveProviders = objectOf(objectOf(snapshot && (snapshot.value || snapshot)).providers)
      const userProviders = objectOf(objectOf(snapshot && snapshot.user).providers)
      const allKeys = new Set([...Object.keys(effectiveProviders), ...Object.keys(userProviders)])
      const providers = []
      for (const id of allKeys) {
        const user = objectOf(userProviders[id])
        const effective = objectOf(effectiveProviders[id])
        const modelsSource = Array.isArray(user.models) && user.models.length > 0 ? user.models : (Array.isArray(effective.models) ? effective.models : [])
        const models = modelsSource
          .filter(model => typeof objectOf(model).id === 'string')
          .map(modelState)
        const defaultEffort = typeof user.reasoning === 'string'
          ? user.reasoning
          : typeof effective.reasoning === 'string' ? effective.reasoning : ''
        const userCompat = objectOf(user.compat)
        const effectiveCompat = objectOf(effective.compat)
        const thinkingFormat = typeof userCompat.thinkingFormat === 'string'
          ? userCompat.thinkingFormat
          : typeof effectiveCompat.thinkingFormat === 'string' ? effectiveCompat.thinkingFormat : ''
        const supportsDeveloperRole = typeof userCompat.supportsDeveloperRole === 'boolean'
          ? userCompat.supportsDeveloperRole
          : effectiveCompat.supportsDeveloperRole
        const { userAgent, otherHeaders } = headerState(user.headers || effective.headers)
        providers.push({
          id,
          name: typeof effective.displayName === 'string' && effective.displayName.length > 0
            ? effective.displayName : id,
          api: typeof effective.api === 'string' ? effective.api : (typeof user.api === 'string' ? user.api : ''),
          defaultEffort,
          thinkingFormat,
          systemRole: supportsDeveloperRole === false,
          userAgent,
          headers: otherHeaders,
          models,
        })
      }
      return providers
    }

    function supportedLevels(model) {
      if (model.mode !== 'custom') return []
      return LEVELS.filter(level => Object.prototype.hasOwnProperty.call(model.efforts, level))
    }

    function commonLevels(provider) {
      if (!provider || !Array.isArray(provider.models) || provider.models.length === 0) return []
      let common = supportedLevels(provider.models[0])
      for (const model of provider.models.slice(1)) {
        const current = new Set(supportedLevels(model))
        common = common.filter(level => current.has(level))
      }
      return common
    }

    function validateProvider(provider) {
      const headerError = validateHeaderDraft(provider)
      if (headerError !== undefined) return headerError
      for (const model of provider.models) {
        if (model.mode !== 'custom') continue
        const selected = supportedLevels(model)
        if (!selected.some(level => level !== 'off')) return { model: model.id, key: 'validationNoLevel' }
        for (const level of selected) {
          if (level === 'off') continue
          const wire = model.efforts[level]
          if (typeof wire !== 'string' || wire.trim().length === 0) {
            return { model: model.id, key: 'validationWire' }
          }
        }
      }
      if (provider.defaultEffort && !commonLevels(provider).includes(provider.defaultEffort)) {
        return { key: 'validationDefault' }
      }
      return undefined
    }

    function patchModel(provider, modelId, update) {
      const next = {
        ...provider,
        models: provider.models.map(model => model.id === modelId ? update(model) : model),
      }
      const common = commonLevels(next)
      if (next.defaultEffort && !common.includes(next.defaultEffort)) next.defaultEffort = ''
      return next
    }

    function mergeModelSettings(rawModels, configured) {
      const byId = new Map(configured.map(model => [model.id, model]))
      return rawModels.map((raw) => {
        const model = objectOf(raw)
        const state = byId.get(typeof model.id === 'string' ? model.id : '')
        if (state === undefined) return clone(model)
        const next = clone(model)
        if (state.inputMode === 'inherit') delete next.input
        else if (state.inputMode === 'text') next.input = ['text']
        else next.input = ['text', 'image']
        if (state.mode === 'inherit') delete next.reasoningEfforts
        else if (state.mode === 'disabled') next.reasoningEfforts = false
        else {
          next.reasoningEfforts = Object.fromEntries(
            LEVELS.filter(level => Object.prototype.hasOwnProperty.call(state.efforts, level))
              .map(level => [level, level === 'off' && (state.efforts[level] === '' || state.efforts[level] === null)
                ? null : String(state.efforts[level]).trim()]),
          )
        }
        return next
      })
    }

    function extensionOps(provider, profile) {
      const root = ['providers', provider.id]
      const ops = []
      const rawModels = Array.isArray(profile.models) ? profile.models : []
      if (rawModels.length > 0) {
        ops.push(
          { op: 'set', path: [...root, 'models'], value: mergeModelSettings(rawModels, provider.models) },
          provider.defaultEffort
            ? { op: 'set', path: [...root, 'reasoning'], value: provider.defaultEffort }
            : { op: 'unset', path: [...root, 'reasoning'] },
        )
      }
      if (provider.api === 'openai-completions') {
        ops.push(provider.thinkingFormat
          ? { op: 'set', path: [...root, 'compat', 'thinkingFormat'], value: provider.thinkingFormat }
          : { op: 'unset', path: [...root, 'compat', 'thinkingFormat'] })
      }
      if (DEVELOPER_ROLE_APIS.has(provider.api)) {
        ops.push(provider.systemRole === true
          ? { op: 'set', path: [...root, 'compat', 'supportsDeveloperRole'], value: false }
          : { op: 'unset', path: [...root, 'compat', 'supportsDeveloperRole'] })
      }
      return ops
    }

    function messageOf(error) {
      return error instanceof Error ? error.message : String(error)
    }

    // ---------------------------------------------------------------- 卡片表单控制器（伪装头设置）

    class CamouflageCardController {
      constructor(scope) {
        this.scope = scope
        this.draft = null
        this.saving = false
        this.failed = false
        this.store = createSnapshotStore ? createSnapshotStore(this.projection()) : null
        this.listeners = new Set()
        this.unsubscribe = scope.subscribe(() => { this.publish() })
      }

      dispose() {
        this.unsubscribe()
        this.listeners.clear()
      }

      projection() {
        const snapshot = this.scope.getSnapshot()
        const committed = formOf(snapshot.value)
        const shown = this.draft ?? committed
        const user = snapshot.user !== null && typeof snapshot.user === 'object' ? snapshot.user : {}
        const hosts = textToHosts(shown.hostsText)
        const uaInvalid = shown.userAgent.trim() === ''
        const hostsInvalid = hosts.length === 0
        const headersVal = validateCustomHeaders(shown.customHeaders)
        return {
          available: snapshot.status === 'ready',
          writable: snapshot.writable === true,
          saving: this.saving,
          failed: this.failed,
          dirty: shown.enabled !== committed.enabled
            || shown.enableThinking !== committed.enableThinking
            || shown.stripStainless !== committed.stripStainless
            || shown.userAgent !== committed.userAgent
            || !sameHosts(hosts, textToHosts(committed.hostsText))
            || !sameHeaders(shown.customHeaders, committed.customHeaders),
          invalid: uaInvalid || hostsInvalid || headersVal.error !== null,
          enabled: shown.enabled,
          enableThinking: shown.enableThinking,
          userAgent: {
            text: shown.userAgent,
            overridden: Object.prototype.hasOwnProperty.call(user, 'userAgent'),
            invalid: uaInvalid,
          },
          targetHosts: {
            text: shown.hostsText,
            overridden: Object.prototype.hasOwnProperty.call(user, 'targetHosts'),
            invalid: hostsInvalid,
          },
          stripStainless: {
            checked: shown.stripStainless,
            overridden: Object.prototype.hasOwnProperty.call(user, 'stripStainless'),
          },
          customHeaders: {
            list: shown.customHeaders,
            overridden: Object.prototype.hasOwnProperty.call(user, 'customHeaders'),
            error: headersVal.error,
          },
        }
      }

      useSnapshot(selector) {
        const [val, setVal] = useState(() => (selector ? selector(this.projection()) : this.projection()))
        useEffect(() => {
          if (this.store) {
            return this.store.subscribe((snap) => {
              setVal(selector ? selector(snap) : snap)
            })
          }
          const listener = (snap) => setVal(selector ? selector(snap) : snap)
          this.listeners.add(listener)
          return () => { this.listeners.delete(listener) }
        }, [selector])
        return val
      }

      inject() {
        return {
          hooks: this.store ? { camouflageCard: this.store } : {},
          useCamouflageCard: (selector) => this.useSnapshot(selector),
          toggle: () => { this.stage({ enabled: !this.shown().enabled }) },
          toggleEnableThinking: () => { this.stage({ enableThinking: !this.shown().enableThinking }) },
          toggleStripStainless: () => { this.stage({ stripStainless: !this.shown().stripStainless }) },
          edit: (field, text) => {
            this.stage(field === 'userAgent' ? { userAgent: text } : { hostsText: text })
          },
          editHeader: (id, field, text) => {
            const list = this.shown().customHeaders.map(item => item.id === id ? { ...item, [field]: text } : item)
            this.stage({ customHeaders: list })
          },
          addHeader: () => {
            const list = [...this.shown().customHeaders, { id: Math.random().toString(36).slice(2, 10), name: '', value: '' }]
            this.stage({ customHeaders: list })
          },
          removeHeader: (id) => {
            const list = this.shown().customHeaders.filter(item => item.id !== id)
            this.stage({ customHeaders: list })
          },
          resetField: (field) => {
            const base = formOf(this.scope.getSnapshot().base)
            if (field === 'userAgent') this.stage({ userAgent: base.userAgent })
            else if (field === 'enableThinking') this.stage({ enableThinking: base.enableThinking })
            else if (field === 'stripStainless') this.stage({ stripStainless: base.stripStainless })
            else if (field === 'targetHosts') this.stage({ hostsText: base.hostsText })
            else if (field === 'customHeaders') this.stage({ customHeaders: base.customHeaders })
          },
          save: () => { void this.save() },
          discard: () => {
            if (this.draft === null && !this.failed) return
            this.draft = null
            this.failed = false
            this.publish()
          },
        }
      }

      shown() {
        return this.draft ?? formOf(this.scope.getSnapshot().value)
      }

      stage(patch) {
        this.draft = { ...this.shown(), ...patch }
        this.failed = false
        this.publish()
      }

      async save() {
        const state = this.projection()
        if (!state.dirty || state.invalid || this.saving || !state.writable) return
        const shown = this.shown()
        const base = formOf(this.scope.getSnapshot().base)
        const intent = {
          enabled: shown.enabled,
          enableThinking: shown.enableThinking,
          stripStainless: shown.stripStainless,
          userAgent: shown.userAgent.trim(),
          targetHosts: textToHosts(shown.hostsText),
          customHeaders: listToHeaders(shown.customHeaders),
        }
        const ops = [
          intent.enabled === base.enabled
            ? { op: 'unset', path: ['enabled'] }
            : { op: 'set', path: ['enabled'], value: intent.enabled },
          intent.enableThinking === base.enableThinking
            ? { op: 'unset', path: ['enableThinking'] }
            : { op: 'set', path: ['enableThinking'], value: intent.enableThinking },
          intent.userAgent === base.userAgent
            ? { op: 'unset', path: ['userAgent'] }
            : { op: 'set', path: ['userAgent'], value: intent.userAgent },
          sameHosts(intent.targetHosts, textToHosts(base.hostsText))
            ? { op: 'unset', path: ['targetHosts'] }
            : { op: 'set', path: ['targetHosts'], value: intent.targetHosts },
          intent.stripStainless === base.stripStainless
            ? { op: 'unset', path: ['stripStainless'] }
            : { op: 'set', path: ['stripStainless'], value: intent.stripStainless },
          sameHeaders(shown.customHeaders, base.customHeaders)
            ? { op: 'unset', path: ['customHeaders'] }
            : { op: 'set', path: ['customHeaders'], value: intent.customHeaders },
        ]

        this.saving = true
        this.failed = false
        this.publish()
        try {
          await this.scope.mutate(ops)
        } finally {
          this.saving = false
        }

        const settled = formOf(this.scope.getSnapshot().value)
        const landed = settled.enabled === intent.enabled
          && settled.enableThinking === intent.enableThinking
          && settled.stripStainless === intent.stripStainless
          && settled.userAgent === intent.userAgent
          && sameHosts(textToHosts(settled.hostsText), intent.targetHosts)
          && sameHeaders(settled.customHeaders, shown.customHeaders)
        if (landed) this.draft = null
        this.failed = !landed
        this.publish()
      }

      publish() {
        const proj = this.projection()
        if (this.store) this.store.set(proj)
        for (const listener of this.listeners) listener(proj)
      }
    }

    // ---------------------------------------------------------------- UI 基础字段渲染组件

    function ToggleField(props) {
      return h('div', { className: 'dshcam_field' },
        h('div', { className: 'dshcam_toggleRow' },
          h('span', { className: 'dshcam_toggleLabel' }, props.label),
          h('span', { className: 'dshcam_badges' },
            props.overridden === true ? h('span', { className: 'dshcam_badge' }, props.overriddenLabel) : null,
            props.onReset === undefined
              ? null
              : h('button', {
                type: 'button',
                className: 'dshcam_reset',
                disabled: props.disabled || props.overridden !== true,
                onClick: props.onReset,
              }, props.resetLabel),
            h('button', {
              type: 'button',
              role: 'switch',
              'aria-checked': props.checked,
              'aria-label': props.label,
              className: props.checked ? 'dshcam_switch dshcam_switchOn' : 'dshcam_switch',
              disabled: props.disabled,
              onClick: props.onToggle,
            }, h('span', { className: 'dshcam_thumb' })),
          ),
        ),
        h('p', { className: 'dshcam_hint' }, props.hint),
      )
    }

    function TextField(props) {
      const className = props.invalid ? 'dshcam_input dshcam_inputInvalid' : 'dshcam_input'
      const shared = {
        id: props.id,
        value: props.text,
        disabled: props.disabled,
        spellCheck: false,
        onChange: (event) => { props.onEdit(event.target.value) },
      }
      return h('div', { className: 'dshcam_field' },
        h('div', { className: 'dshcam_head' },
          h('label', { className: 'dshcam_label', htmlFor: props.id }, props.label),
          h('span', { className: 'dshcam_badges' },
            props.overridden ? h('span', { className: 'dshcam_badge' }, props.overriddenLabel) : null,
            h('button', {
              type: 'button',
              className: 'dshcam_reset',
              disabled: props.disabled || !props.overridden,
              onClick: props.onReset,
            }, props.resetLabel),
          ),
        ),
        props.multiline === true
          ? h('textarea', { ...shared, className: `${className} dshcam_area` })
          : h('input', { ...shared, className, type: 'text', autoComplete: 'off' }),
        props.invalid ? h('p', { className: 'dshcam_invalid' }, props.invalidLabel) : null,
        h('p', { className: 'dshcam_hint' }, props.hint),
      )
    }

    function UserAgentField(props) {
      const className = props.invalid ? 'dshcam_input dshcam_inputInvalid' : 'dshcam_input'
      const matched = USER_AGENT_PRESETS.includes(props.text) ? props.text : '__custom__'
      return h('div', { className: 'dshcam_field' },
        h('div', { className: 'dshcam_head' },
          h('label', { className: 'dshcam_label', htmlFor: props.id }, props.label),
          h('span', { className: 'dshcam_badges' },
            props.overridden ? h('span', { className: 'dshcam_badge' }, props.overriddenLabel) : null,
            h('button', {
              type: 'button',
              className: 'dshcam_reset',
              disabled: props.disabled || !props.overridden,
              onClick: props.onReset,
            }, props.resetLabel),
          ),
        ),
        h('div', { className: 'dshcam_uaRow' },
          h('input', {
            id: props.id,
            value: props.text,
            disabled: props.disabled,
            className,
            type: 'text',
            autoComplete: 'off',
            spellCheck: false,
            onChange: (e) => props.onEdit(e.target.value),
          }),
          h('select', {
            className: 'dshcam_select',
            value: matched,
            disabled: props.disabled,
            'aria-label': props.presetLabel,
            onChange: (e) => {
              if (e.target.value !== '__custom__') {
                props.onEdit(e.target.value)
              }
            },
          },
            h('option', { value: '__custom__', disabled: true }, props.presetLabel),
            ...USER_AGENT_PRESETS.map((preset) => h('option', { key: preset, value: preset }, preset))
          )
        ),
        props.invalid ? h('p', { className: 'dshcam_invalid' }, props.invalidLabel) : null,
        h('p', { className: 'dshcam_hint' }, props.hint),
      )
    }

    function CustomHeadersField(props) {
      const { list, error, onAdd, onRemove, onEdit, disabled, t } = props
      const rows = (Array.isArray(list) ? list : []).map((item) => h('div', { key: item.id, className: 'dshcam_headerRow' },
        h('input', {
          type: 'text',
          className: 'dshcam_input',
          value: item.name,
          placeholder: t('headerNamePlaceholder'),
          disabled,
          spellCheck: false,
          onChange: (e) => onEdit(item.id, 'name', e.target.value),
        }),
        h('input', {
          type: 'text',
          className: 'dshcam_input',
          value: item.value,
          placeholder: t('headerValuePlaceholder'),
          disabled,
          spellCheck: false,
          onChange: (e) => onEdit(item.id, 'value', e.target.value),
        }),
        h('button', {
          type: 'button',
          className: 'dshcam_delBtn',
          disabled,
          title: t('removeHeader'),
          'aria-label': t('removeHeader'),
          onClick: () => onRemove(item.id),
        }, '✕')
      ))

      return h('div', { className: 'dshcam_field' },
        h('div', { className: 'dshcam_head' },
          h('span', { className: 'dshcam_label' }, t('customHeadersLabel')),
          h('span', { className: 'dshcam_badges' },
            props.overridden ? h('span', { className: 'dshcam_badge' }, props.overriddenLabel) : null,
            h('button', {
              type: 'button',
              className: 'dshcam_reset',
              disabled: props.disabled || !props.overridden,
              onClick: props.onReset,
            }, props.resetLabel),
          ),
        ),
        h('p', { className: 'dshcam_hint' }, t('customHeadersHint')),
        rows.length > 0 ? h('div', { className: 'dshcam_headersList' }, rows) : null,
        error ? h('p', { className: 'dshcam_invalid' }, t(error)) : null,
        h('button', {
          type: 'button',
          className: 'dshcam_addBtn',
          disabled,
          onClick: onAdd,
        }, '+ ' + t('addHeader')),
      )
    }

    // ---------------------------------------------------------------- 模型思考编辑组件

    function ModelEditor({ provider, model, t, writable, busy, updateProvider }) {
      const selected = new Set(supportedLevels(model))
      const updateModel = update => updateProvider(provider.id, current => patchModel(current, model.id, update))
      const setPreset = efforts => updateModel(item => ({ ...item, mode: 'custom', efforts }))

      return h('div', { className: 'dsh-mrs-model' },
        h('div', { className: 'dsh-mrs-model-head' },
          h('div', null,
            h('strong', null, model.name || model.id),
            model.name && model.name !== model.id ? h('code', null, model.id) : null),
          h('div', { className: 'dsh-mrs-model-controls' },
            h('label', { className: 'dsh-mrs-mode' },
              h('span', null, t('inputCapability')),
              h('select', {
                value: model.inputMode,
                disabled: !writable || busy,
                onChange: event => updateModel(item => ({ ...item, inputMode: event.target.value })),
              },
              h('option', { value: 'inherit' }, t('inputInherit')),
              h('option', { value: 'text' }, t('textOnly')),
              h('option', { value: 'image' }, t('textAndImage')))),
            h('label', { className: 'dsh-mrs-mode' },
              h('span', null, t('mode')),
              h('select', {
                value: model.mode,
                disabled: !writable || busy,
                onChange: event => updateModel((item) => {
                  const mode = event.target.value
                  return {
                    ...item,
                    mode,
                    efforts: mode === 'custom' && Object.keys(item.efforts).length === 0
                      ? { ...COMMON_5_LEVELS }
                      : item.efforts,
                  }
                }),
              },
              h('option', { value: 'inherit' }, t('inherit')),
              h('option', { value: 'disabled' }, t('disabled')),
              h('option', { value: 'custom' }, t('custom')))))),
        model.mode !== 'custom' ? null : h(Fragment, null,
          h('div', { className: 'dsh-mrs-presets' },
            h('button', {
              type: 'button',
              className: 'dsh-mrs-btn',
              disabled: !writable || busy,
              onClick: () => setPreset({ ...COMMON_5_LEVELS }),
            }, t('common5Preset')),
            h('button', {
              type: 'button',
              className: 'dsh-mrs-btn',
              disabled: !writable || busy,
              onClick: () => setPreset({ ...DEPTH_5_LEVELS }),
            }, t('depth5Preset')),
            h('button', {
              type: 'button',
              className: 'dsh-mrs-btn',
              disabled: !writable || busy,
              onClick: () => setPreset({ ...COMMON_3_LEVELS }),
            }, t('common3Preset')),
            h('button', {
              type: 'button',
              className: 'dsh-mrs-btn',
              disabled: !writable || busy,
              onClick: () => setPreset(Object.fromEntries(NON_OFF_LEVELS.map(level => [level, level]))),
            }, t('fullPreset'))),
          h('div', { className: 'dsh-mrs-levels' },
            LEVELS.map(level => h('div', {
              className: `dsh-mrs-level${selected.has(level) ? ' dsh-mrs-level-active' : ''}`,
              key: level,
            },
            h('label', { className: 'dsh-mrs-check' },
              h('input', {
                type: 'checkbox', checked: selected.has(level), disabled: !writable || busy,
                onChange: event => updateModel((item) => {
                  const efforts = { ...item.efforts }
                  if (event.target.checked) efforts[level] = level === 'off' ? null : level
                  else delete efforts[level]
                  return { ...item, efforts }
                }),
              }),
              h('span', null, level)),
            selected.has(level) ? h('label', { className: 'dsh-mrs-wire' },
              h('span', null, t('wireValue')),
              h('input', {
                type: 'text', value: model.efforts[level] ?? '',
                placeholder: level === 'off' ? t('noWireValue') : level,
                disabled: !writable || busy,
                onChange: event => updateModel(item => ({
                  ...item, efforts: { ...item.efforts, [level]: event.target.value },
                })),
              })) : null)))))
    }

    function ModelSettingsEditor({ provider, t, writable, busy, updateProvider }) {
      const common = commonLevels(provider)
      return h('section', { className: 'dsh-mrs-band' },
        h('h4', null, t('modelSettings')),
        provider.models.length === 0
          ? h('p', { className: 'dsh-mrs-empty-inline' }, t('noModels'))
          : h(Fragment, null,
            h('div', { className: 'dsh-mrs-route-fields' },
              h('label', { className: 'dsh-mrs-field' },
                h('span', null, t('defaultEffort')),
                h('select', {
                  value: provider.defaultEffort,
                  disabled: !writable || busy,
                  onChange: event => updateProvider(provider.id, current => ({
                    ...current, defaultEffort: event.target.value,
                  })),
                },
                h('option', { value: '' }, t('unspecified')),
                common.map(level => h('option', { value: level, key: level }, level)))),
              provider.api === 'openai-completions'
                ? h('label', { className: 'dsh-mrs-field' },
                    h('span', null, t('thinkingFormat')),
                    h('select', {
                      value: provider.thinkingFormat,
                      disabled: !writable || busy,
                      onChange: event => updateProvider(provider.id, current => ({
                        ...current, thinkingFormat: event.target.value,
                      })),
                    },
                    h('option', { value: '' }, t('autoDetect')),
                    THINKING_FORMATS.map(format => h('option', { value: format, key: format }, format))))
                : null),
            DEVELOPER_ROLE_APIS.has(provider.api)
              ? h('label', { className: 'dsh-mrs-compat-check' },
                  h('input', {
                    type: 'checkbox', checked: provider.systemRole === true,
                    disabled: !writable || busy,
                    onChange: event => updateProvider(provider.id, current => ({
                      ...current, systemRole: event.target.checked,
                    })),
                  }),
                  h('span', null,
                    h('strong', null, t('systemRole')),
                    h('small', null, t('systemRoleDesc'))))
              : null,
            h('div', { className: 'dsh-mrs-models' }, provider.models.map(model => h(ModelEditor, {
              key: model.id, provider, model, t, writable, busy, updateProvider,
            })))))
    }

    // ---------------------------------------------------------------- 模型思考主面板（一站式管理与一键开启）

    function ModelThinkingSection({ t, modelController, enableThinking }) {
      const [providers, setProviders] = useState([])
      const [activeId, setActiveId] = useState('')
      const [writable, setWritable] = useState(true)
      const [saving, setSaving] = useState(false)
      const [batchSaving, setBatchSaving] = useState(false)
      const [errorMsg, setErrorMsg] = useState('')

      useEffect(() => {
        if (!modelController) return
        return modelController.subscribe((state) => {
          setProviders(state.providers || [])
          setWritable(state.writable !== false)
          if (!activeId && state.providers && state.providers.length > 0) {
            setActiveId(state.providers[0].id)
          }
        })
      }, [modelController, activeId])

      if (!modelController) return null

      if (!enableThinking) {
        return h('div', { className: 'dshcam_thinkingSection' },
          h('div', { className: 'dshcam_sectionHead' },
            h('h3', { className: 'dshcam_sectionTitle' }, t('modelThinkingTitle')),
            h('p', { className: 'dshcam_sectionDesc' }, t('modelThinkingDesc')),
          ),
          h('div', { className: 'dshcam_thinkingDisabledBanner' }, t('thinkingDisabledNotice')),
        )
      }

      const activeProvider = providers.find(p => p.id === activeId) || providers[0]

      const updateProvider = (id, update) => {
        setErrorMsg('')
        setProviders(prev => prev.map(p => p.id === id ? update(p) : p))
      }

      const handleSave = async () => {
        if (!activeProvider || saving || !writable) return
        const validation = validateProvider(activeProvider)
        if (validation !== undefined) {
          const detail = `${validation.header ?? validation.model ?? ''}${validation.header || validation.model ? ': ' : ''}${t(validation.key)}`
          setErrorMsg(detail)
          return
        }
        setSaving(true)
        setErrorMsg('')
        try {
          await modelController.persist(activeProvider)
        } catch (err) {
          setErrorMsg(messageOf(err))
        } finally {
          setSaving(false)
        }
      }

      const handleEnableAll = async () => {
        if (batchSaving || !writable) return
        setBatchSaving(true)
        setErrorMsg('')
        try {
          await modelController.enableAllCommon()
        } catch (err) {
          setErrorMsg(messageOf(err))
        } finally {
          setBatchSaving(false)
        }
      }

      return h('div', { className: 'dshcam_thinkingSection' },
        h('div', { className: 'dshcam_sectionHead' },
          h('h3', { className: 'dshcam_sectionTitle' }, t('modelThinkingTitle')),
          h('p', { className: 'dshcam_sectionDesc' }, t('modelThinkingDesc')),
        ),
        h('div', { className: 'dshcam_thinkingToolsBar' },
          h('button', {
            type: 'button',
            className: 'dsh-mrs-btn dsh-mrs-btnHighlight',
            disabled: !writable || batchSaving || providers.length === 0,
            onClick: handleEnableAll,
          }, batchSaving ? t('enablingAllThinking') : t('enableAllThinking')),
        ),
        providers.length === 0
          ? h('p', { className: 'dshcam_emptyProviders' }, t('noProvidersFound'))
          : h(Fragment, null,
              h('div', { className: 'dshcam_providerTabs' },
                providers.map(p => h('button', {
                  key: p.id,
                  type: 'button',
                  className: `dshcam_tabBtn${p.id === activeProvider?.id ? ' dshcam_tabBtnActive' : ''}`,
                  onClick: () => { setActiveId(p.id); setErrorMsg('') },
                }, p.name || p.id))
              ),
              activeProvider ? h(ModelSettingsEditor, {
                provider: activeProvider,
                t,
                writable,
                busy: saving || batchSaving,
                updateProvider,
              }) : null,
              errorMsg ? h('p', { className: 'dsh-mrs-error', role: 'alert' }, errorMsg) : null,
              h('div', { className: 'dsh-mrs-actions' },
                h('button', {
                  type: 'button',
                  className: 'dsh-mrs-btn dsh-mrs-btnPrimary',
                  disabled: !writable || saving || batchSaving || !activeProvider,
                  onClick: handleSave,
                }, saving ? t('savingModelThinking') : t('saveModelThinking'))
              )
            )
      )
    }

    // ---------------------------------------------------------------- 伪装头插件主卡片

    function CamouflageCard(props) {
      const { t } = props
      if (props && props.view === 'summary') return t('description')
      const useHook = props.useCamouflageCard || (props.cardController ? props.cardController.useSnapshot.bind(props.cardController) : null)
      const state = useHook ? useHook((snapshot) => snapshot) : (props.cardController ? props.cardController.projection() : {})
      const pageMode = !!(props && props.view === 'page')
      const [open, setOpen] = useState(pageMode)
      const saveStarted = useRef(false)

      useEffect(() => {
        if (state.saving) {
          saveStarted.current = true
          return
        }
        if (!saveStarted.current) return
        saveStarted.current = false
        if (!state.dirty && !state.failed && !pageMode) setOpen(false)
      }, [state.dirty, state.failed, state.saving, pageMode])

      if (!state.available) return null

      const disabled = !state.writable || state.saving
      const fieldChrome = {
        overriddenLabel: t('overridden'),
        resetLabel: t('reset'),
        disabled,
      }

      return h('li', { className: open ? 'dshcam_card dshcam_cardOpen' : 'dshcam_card' },
        h('button', {
          type: 'button',
          className: 'dshcam_header',
          'aria-expanded': open,
          'aria-label': `${t(open ? 'collapse' : 'expand')}: ${t('title')}`,
          onClick: () => { setOpen(!open) },
        },
          h('span', { className: 'dshcam_headText' },
            h('span', { className: 'dshcam_name' }, t('title')),
            h('span', { className: 'dshcam_description' }, t('description')),
          ),
          state.dirty ? h('span', { className: 'dshcam_pending' }, t('unsaved')) : null,
          IconChevronDownOutline14 === undefined
            ? null
            : h(IconChevronDownOutline14, {
              className: open ? 'dshcam_chevron dshcam_chevronOpen' : 'dshcam_chevron',
            }),
        ),
        open ? h('div', { className: 'dshcam_body' },
          state.writable ? null : h('p', { className: 'dshcam_readOnly', role: 'status' }, t('readOnly')),
          h(ToggleField, {
            label: t('enabledLabel'),
            hint: t('enabledHint'),
            checked: state.enabled,
            disabled,
            onToggle: props.toggle,
          }),
          h(ToggleField, {
            ...fieldChrome,
            label: t('enableThinkingLabel'),
            hint: t('enableThinkingHint'),
            checked: state.enableThinking,
            onToggle: props.toggleEnableThinking,
            onReset: () => { props.resetField('enableThinking') },
          }),
          h(UserAgentField, {
            ...fieldChrome,
            id: 'dshcam-user-agent',
            label: t('userAgentLabel'),
            hint: t('userAgentHint'),
            invalidLabel: t('userAgentInvalid'),
            presetLabel: t('presetSelectPlaceholder'),
            ...state.userAgent,
            onEdit: (text) => { props.edit('userAgent', text) },
            onReset: () => { props.resetField('userAgent') },
          }),
          h(CustomHeadersField, {
            ...fieldChrome,
            list: state.customHeaders.list,
            overridden: state.customHeaders.overridden,
            error: state.customHeaders.error,
            onAdd: props.addHeader,
            onRemove: props.removeHeader,
            onEdit: props.editHeader,
            onReset: () => { props.resetField('customHeaders') },
            t,
          }),
          h(TextField, {
            ...fieldChrome,
            id: 'dshcam-target-hosts',
            label: t('targetHostsLabel'),
            hint: t('targetHostsHint'),
            invalidLabel: t('targetHostsInvalid'),
            multiline: true,
            ...state.targetHosts,
            onEdit: (text) => { props.edit('targetHosts', text) },
            onReset: () => { props.resetField('targetHosts') },
          }),
          h(ToggleField, {
            ...fieldChrome,
            label: t('stripStainlessLabel'),
            hint: t('stripStainlessHint'),
            ...state.stripStainless,
            onToggle: () => { props.toggleStripStainless() },
            onReset: () => { props.resetField('stripStainless') },
          }),
          h('div', { className: 'dshcam_footer' },
            state.failed ? h('p', { className: 'dshcam_failed', role: 'status' }, t('saveFailed')) : null,
            h('button', {
              type: 'button',
              className: 'dshcam_discard',
              disabled: !state.dirty || state.saving,
              onClick: props.discard,
            }, t('discard')),
            h('button', {
              type: 'button',
              className: 'dshcam_save',
              disabled: !state.dirty || state.invalid || state.saving,
              onClick: props.save,
            }, t(state.saving ? 'saving' : 'save')),
          ),
        ) : null,
      )
    }

    // ---------------------------------------------------------------- 一级设置与 Tab 分区

    function CamouflageSettingsSection(props) {
      const { t, modelController, cardController } = props
      const state = cardController?.projection() || {}
      return h('div', { className: 'dshcam_section' },
        h('div', { className: 'dshcam_sectionHead' },
          h('h2', { className: 'dshcam_sectionTitle' }, t('title')),
          h('p', { className: 'dshcam_sectionDesc' }, t('description')),
        ),
        h('ul', { style: { listStyle: 'none', margin: 0, padding: 0 } },
          h(CamouflageCard, { ...props, view: 'page' }),
        ),
        h(ModelThinkingSection, { t, modelController, enableThinking: state.enableThinking !== false }),
      )
    }

    function CamouflageTabSection(props) {
      const { t, modelController, cardController } = props
      const state = cardController?.projection() || {}
      return h('div', { className: 'dshcam_section' },
        h('ul', { style: { listStyle: 'none', margin: 0, padding: 0 } },
          h(CamouflageCard, { ...props, view: 'page' }),
        ),
        h(ModelThinkingSection, { t, modelController, enableThinking: state.enableThinking !== false }),
      )
    }

    // ---------------------------------------------------------------- 通过 settingsScope 操控 llm-pi-ai

    function createModelController(llmScope, t) {
      let toast
      let toastTimer
      const storeListeners = new Set()

      const showToast = (text, failed = false) => {
        if (typeof document === 'undefined') return
        if (toast === undefined) {
          toast = document.createElement('div')
          toast.className = 'dsh-mrs-toast'
          if (typeof toast.setAttribute === 'function') toast.setAttribute('role', 'status')
          if (document.body && typeof document.body.appendChild === 'function') {
            document.body.appendChild(toast)
          }
        }
        if (toast.classList && typeof toast.classList.toggle === 'function') {
          toast.classList.toggle('dsh-mrs-toast-error', failed)
        }
        toast.textContent = text
        clearTimeout(toastTimer)
        toastTimer = setTimeout(() => { toast?.remove?.(); toast = undefined }, 5000)
      }

      const getSnapshot = () => {
        const snap = llmScope.getSnapshot()
        const drafts = providerDrafts(snap)
        return {
          providers: drafts,
          writable: snap.writable !== false,
          snapshot: snap,
        }
      }

      const publish = () => {
        const current = getSnapshot()
        for (const listener of storeListeners) listener(current)
      }

      const unsubscribe = llmScope.subscribe(() => {
        publish()
      })

      const persist = async (provider) => {
        const snap = llmScope.getSnapshot()
        const userProviders = objectOf(objectOf(snap.user).providers)
        const effectiveProviders = objectOf(objectOf(snap.value).providers)
        const userProfile = objectOf(userProviders[provider.id])
        const effectiveProfile = objectOf(effectiveProviders[provider.id])
        const profile = {
          ...effectiveProfile,
          ...userProfile,
          models: Array.isArray(userProfile.models) && userProfile.models.length > 0
            ? userProfile.models : (Array.isArray(effectiveProfile.models) ? effectiveProfile.models : []),
        }
        if (!Array.isArray(profile.models) || profile.models.length === 0) {
          throw new Error(`${provider.id}: ${t('noModels')}`)
        }
        const ops = extensionOps(provider, profile)
        await llmScope.mutate(ops)
        showToast(`${t('saved')}: ${provider.name || provider.id}`)
      }

      const enableAllCommon = async (preset = COMMON_5_LEVELS) => {
        const current = getSnapshot()
        const allOps = []
        let modelCount = 0
        for (const p of current.providers) {
          const snap = llmScope.getSnapshot()
          const userProviders = objectOf(objectOf(snap.user).providers)
          const effectiveProviders = objectOf(objectOf(snap.value).providers)
          const userProfile = objectOf(userProviders[p.id])
          const effectiveProfile = objectOf(effectiveProviders[p.id])
          const profile = {
            ...effectiveProfile,
            ...userProfile,
            models: Array.isArray(userProfile.models) && userProfile.models.length > 0
              ? userProfile.models : (Array.isArray(effectiveProfile.models) ? effectiveProfile.models : []),
          }
          if (!Array.isArray(profile.models) || profile.models.length === 0) continue

          const updatedProvider = {
            ...p,
            models: p.models.map(m => {
              modelCount++
              return {
                ...m,
                mode: 'custom',
                efforts: { ...preset },
              }
            }),
          }
          allOps.push(...extensionOps(updatedProvider, profile))
        }

        if (allOps.length === 0) {
          showToast(t('noModels'), true)
          return
        }

        await llmScope.mutate(allOps)
        showToast(t('allThinkingEnabled'))
      }

      return {
        subscribe(listener) {
          storeListeners.add(listener)
          listener(getSnapshot())
          return () => { storeListeners.delete(listener) }
        },
        persist,
        enableAllCommon,
        dispose() {
          unsubscribe()
          storeListeners.clear()
          clearTimeout(toastTimer)
          toast?.remove()
        }
      }
    }

    // ---------------------------------------------------------------- 国际化字典

    const zh = {
      title: '伪装头',
      description: '给上游 LLM 请求换一个客户端 User-Agent，用来过 API 中转站的客户端白名单。',
      enabledLabel: '启用伪装',
      enabledHint: '关闭后请求按原样发出，不再改写任何请求头。',
      enableThinkingLabel: '开启模型思考增强 (Reasoning Efforts)',
      enableThinkingHint: '为自定义模型启用思考能力与思考等级控制，DSH 对话输入框将自动显示原生思考等级选择器（Off / Low / Medium / High / Max）。',
      userAgentLabel: '伪装的 User-Agent',
      userAgentHint: '中转站白名单认哪个客户端就填哪个，例如 Cline/3.0.0。',
      userAgentInvalid: '不能为空。',
      presetSelectPlaceholder: '常用预设…',
      customHeadersLabel: '额外自定义请求头',
      customHeadersHint: '在中转站需要特定请求头（如 anthropic-version、X-Title、HTTP-Referer 等）时填写，随匹配请求一同发出。',
      headerNamePlaceholder: '头名称 (如 anthropic-version)',
      headerValuePlaceholder: '值 (如 2023-06-01)',
      addHeader: '添加请求头',
      removeHeader: '删除',
      headerNameRequired: '请求头名称不能为空。',
      headerNameInvalid: '请求头名称不合法（只能包含字母、数字及 !#$%&*+-.^_`|~ 等字符）。',
      headerNameDuplicate: '请求头名称不能重复。',
      headerUserAgentDuplicate: 'User-Agent 请在上方专用输入框中设置。',
      headerValueInvalid: '请求头值不能包含换行。',
      targetHostsLabel: '生效的目标主机',
      targetHostsHint: '每行一个主机名或 URL；请求的主机名等于它、或是它的子域才改写。填 * 表示所有请求。',
      targetHostsInvalid: '至少要填一个主机名。',
      stripStainlessLabel: '剥离 SDK 指纹头',
      stripStainlessHint: '删掉 x-stainless-* 这类暴露 OpenAI SDK 身份的请求头。若中转站认的正是官方 SDK 的指纹，关掉它。',
      overridden: '已覆盖',
      reset: '重置',
      unsaved: '未保存',
      readOnly: '当前连接不能写入设置，以下为只读。',
      save: '保存',
      saving: '保存中…',
      discard: '放弃',
      saveFailed: '保存没有生效，请重试。',
      expand: '展开',
      collapse: '收起',
      // 模型思考设置专用词条
      modelThinkingTitle: '模型思考能力设置',
      modelThinkingDesc: '为自定义提供方及模型配置深度思考（Reasoning Efforts）与输入多模态能力。配置后，DSH 原生对话输入框将自动显示思考等级切换器。',
      thinkingDisabledNotice: '模型思考增强功能已通过上方开关关闭。如需为自定义模型启用思考深度切换器，请开启上方开关。',
      enableAllThinking: '⚡ 一键为所有自定义模型开启 5 档思考 (Off / Low / Med / High / Max)',
      enablingAllThinking: '正在批量启用 5 档思考能力…',
      allThinkingEnabled: '已成功为所有自定义模型启用 5 档思考等级（Off / Low / Medium / High / Max）！',
      noProvidersFound: '暂未检测到已添加的自定义模型提供方。请先在「设置 → 模型」中添加自定义提供方。',
      saveModelThinking: '保存当前提供方思考设置',
      savingModelThinking: '正在保存模型能力…',
      noModels: '此 Provider 没有可编辑的自定义模型。',
      loadFailed: '读取失败',
      saved: '已保存',
      modelSettings: '模型能力',
      defaultEffort: '默认思考等级',
      unspecified: '不指定',
      mode: '思考能力',
      inherit: '保持未声明',
      disabled: '明确不支持',
      custom: '自定义等级',
      common5Preset: '常用五档 (Off ~ Max)',
      depth5Preset: '五级深度 (Minimal ~ Max)',
      common3Preset: '常用三档 (Low ~ High)',
      fullPreset: '完整七档 (全部)',
      wireValue: '传输值',
      noWireValue: '留空表示不发送',
      thinkingFormat: '思考参数格式',
      systemRole: '使用 system 角色发送系统提示词',
      systemRoleDesc: '通过 DSH 原生兼容配置，支持不接受 developer 角色的第三方接口。',
      autoDetect: '自动检测',
      inputCapability: '输入能力',
      inputInherit: '保持未声明',
      textOnly: '仅文本',
      textAndImage: '文本与图像',
      validationHeaderName: '请求头名称不合法。',
      validationHeaderValue: '请求头值不能包含换行。',
      validationHeaderDuplicate: '请求头名称不能重复。',
      validationUserAgentDuplicate: '其他请求头中不能再次填写 User-Agent。',
      validationNoLevel: '至少选择一个非 off 等级。',
      validationWire: '已启用等级必须填写传输值。',
      validationDefault: '默认等级必须被该 Provider 的全部模型支持。',
    }

    const en = {
      title: 'Camouflage header',
      description: 'Spoof the client User-Agent on upstream LLM requests to pass an API gateway client allowlist.',
      enabledLabel: 'Enable camouflage',
      enabledHint: 'When off, requests go out untouched and no header is rewritten.',
      enableThinkingLabel: 'Enable Model Reasoning (Thinking) Enhancement',
      enableThinkingHint: 'Enable reasoning efforts for custom providers. DSH native chat input will automatically show reasoning level toggles (Off / Low / Medium / High / Max).',
      userAgentLabel: 'Spoofed User-Agent',
      userAgentHint: 'Whichever client the gateway allowlists, for example Cline/3.0.0.',
      userAgentInvalid: 'Cannot be empty.',
      presetSelectPlaceholder: 'Presets…',
      customHeadersLabel: 'Custom request headers',
      customHeadersHint: 'Additional HTTP headers (e.g. anthropic-version, X-Title) to send with matching requests.',
      headerNamePlaceholder: 'Header name (e.g. anthropic-version)',
      headerValuePlaceholder: 'Value (e.g. 2023-06-01)',
      addHeader: 'Add header',
      removeHeader: 'Remove',
      headerNameRequired: 'Header name cannot be empty.',
      headerNameInvalid: 'Header name is invalid (letters, digits and !#$%&*+-.^_`|~ only).',
      headerNameDuplicate: 'Duplicate header names are not allowed.',
      headerUserAgentDuplicate: 'Configure User-Agent in the designated field above.',
      headerValueInvalid: 'Header value cannot contain line breaks.',
      targetHostsLabel: 'Target hosts',
      targetHostsHint: 'One host or URL per line; rewritten only when the request host equals it or is its subdomain. Use * for every request.',
      targetHostsInvalid: 'At least one host is required.',
      stripStainlessLabel: 'Strip SDK fingerprint headers',
      stripStainlessHint: 'Removes x-stainless-* headers that reveal the OpenAI SDK identity. Turn it off if the gateway expects that official SDK fingerprint.',
      overridden: 'Overridden',
      reset: 'Reset',
      unsaved: 'Unsaved',
      readOnly: 'This connection cannot write settings; the fields below are read-only.',
      save: 'Save',
      saving: 'Saving…',
      discard: 'Discard',
      saveFailed: 'The save did not take effect. Try again.',
      expand: 'Expand',
      collapse: 'Collapse',
      // Model Thinking strings
      modelThinkingTitle: 'Model Reasoning & Thinking Capabilities',
      modelThinkingDesc: 'Configure reasoning efforts and input capabilities for custom providers and models. DSH native chat input will automatically show reasoning level toggles.',
      thinkingDisabledNotice: 'Model reasoning enhancement is turned off via the switch above. Turn it on to configure and display reasoning levels.',
      enableAllThinking: '⚡ Enable 5 Levels (Off / Low / Med / High / Max) for All Models',
      enablingAllThinking: 'Enabling 5-level reasoning capabilities…',
      allThinkingEnabled: 'Successfully enabled 5 reasoning levels (Off / Low / Medium / High / Max) for all custom models!',
      noProvidersFound: 'No custom providers found. Please add a custom provider in "Settings → Models" first.',
      saveModelThinking: 'Save Thinking Settings for Provider',
      savingModelThinking: 'Saving model capabilities…',
      noModels: 'This provider has no editable custom models.',
      loadFailed: 'Failed to load',
      saved: 'Saved',
      modelSettings: 'Model capabilities',
      defaultEffort: 'Default level',
      unspecified: 'Unspecified',
      mode: 'Reasoning capability',
      inherit: 'Leave undeclared',
      disabled: 'Explicitly unsupported',
      custom: 'Custom levels',
      common5Preset: 'Common 5 (Off ~ Max)',
      depth5Preset: '5-level depth (Minimal ~ Max)',
      common3Preset: 'Common 3 (Low ~ High)',
      fullPreset: 'All 7 levels',
      wireValue: 'Wire value',
      noWireValue: 'Blank sends no value',
      thinkingFormat: 'Reasoning wire format',
      systemRole: 'Send system prompts with the system role',
      systemRoleDesc: 'Uses native DSH compatibility setting for endpoints that reject the developer role.',
      autoDetect: 'Auto-detect',
      inputCapability: 'Input capability',
      inputInherit: 'Leave undeclared',
      textOnly: 'Text only',
      textAndImage: 'Text and images',
      validationHeaderName: 'Header name is invalid.',
      validationHeaderValue: 'Header values cannot contain line breaks.',
      validationHeaderDuplicate: 'Header names must be unique.',
      validationUserAgentDuplicate: 'Do not add User-Agent again under other headers.',
      validationNoLevel: 'Select at least one non-off level.',
      validationWire: 'Every enabled level needs a wire value.',
      validationDefault: 'The default level must be supported by every model in this provider.',
    }

    // ---------------------------------------------------------------- 浏览器插件挂载入口

    // 只保留标准可靠的服务依赖，彻底避免因缺失 connection/remote 导致被 Cordis 阻塞不执行
    const inject = ['slots', 'locale', 'settingsScope']

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'camouflage: dictionaries')
      const t = ctx.locale.bind(NS)

      const settingsScope = ctx.settingsScope
      if (!settingsScope) return

      // 1. 初始化伪装头自身配置控制器 (client-camouflage)
      const card = new CamouflageCardController(settingsScope.bind({ namespace: NS }))
      ctx.effect(() => () => { card.dispose() }, 'camouflage: card form')

      // 2. 初始化官方模型思考控制器 (llm-pi-ai)
      let modelController = null
      try {
        const llmScope = settingsScope.bind({ namespace: 'llm-pi-ai' })
        modelController = createModelController(llmScope, t)
        ctx.effect(() => () => { modelController.dispose() }, 'camouflage: model controller')
      } catch {
        // 容错降级
      }

      const cardProps = () => ({
        t,
        ...card.inject(),
        cardController: card,
        modelController,
      })
      const pageProps = () => ({
        t,
        ...card.inject(),
        cardController: card,
        view: 'page',
        modelController,
      })

      // 1. 独立一级设置分区（左侧导航条目，与通用设置、模型并列）
      ctx.slots.inject('settings.section', function* () {
        yield ctx.slots.register({
          name: 'settings.section',
          id: 'client-camouflage',
          order: 510,
          label: () => t('title'),
          locale: NS,
          inject: pageProps,
        }, CamouflageSettingsSection)
      })

      // 2. 内置插件选项卡（与插件列表等并列）
      ctx.slots.inject('settings.plugins.tab', function* () {
        yield ctx.slots.register({
          name: 'settings.plugins.tab',
          id: 'camouflage',
          order: 25,
          label: () => t('title'),
          locale: NS,
          inject: pageProps,
        }, CamouflageTabSection)
      })

      // 3. 插件页通用插槽
      ctx.slots.inject('plugins.item', function* () {
        yield ctx.slots.register({
          name: 'plugins.item',
          id: 'dsh-plugin-camouflage',
          order: 70,
          label: () => t('title'),
          locale: NS,
          inject: cardProps,
        }, CamouflageCard)
        yield ctx.slots.register({
          name: 'plugins.item',
          key: NS,
          order: 70,
          label: () => t('title'),
          locale: NS,
          inject: cardProps,
        }, CamouflageCard)
      })

      // 4. 旧桌面设置页
      ctx.slots.inject('settings.plugin.item', function* () {
        yield ctx.slots.register({
          name: 'settings.plugin.item',
          key: NS,
          order: 70,
          locale: NS,
          inject: cardProps,
        }, CamouflageCard)
      })

      // 5. 侧栏 插件 → 已安装 → 行配置页
      ctx.slots.inject('plugins.row.config', function* () {
        yield ctx.slots.register({
          name: 'plugins.row.config',
          key: 'dsh-plugin-camouflage#client-camouflage',
          locale: NS,
          inject: cardProps,
        }, CamouflageCard)
        yield ctx.slots.register({
          name: 'plugins.row.config',
          key: 'dsh-plugin-camouflage',
          locale: NS,
          inject: cardProps,
        }, CamouflageCard)
      })

      // 6. 组合包配置页
      ctx.slots.inject('plugins.bundle.config', function* () {
        yield ctx.slots.register({
          name: 'plugins.bundle.config',
          key: 'dsh-plugin-camouflage',
          locale: NS,
          inject: cardProps,
        }, CamouflageCard)
      })
    }

    exports.apply = apply
    exports.inject = inject
    exports.__test = {
      LEVELS,
      NON_OFF_LEVELS,
      COMMON_5_LEVELS,
      DEPTH_5_LEVELS,
      COMMON_3_LEVELS,
      THINKING_FORMATS,
      USER_AGENT_PRESETS,
      modelState,
      supportedLevels,
      commonLevels,
      validateProvider,
      mergeModelSettings,
      extensionOps,
      providerDrafts,
      createModelController,
    }
    return module.exports
  },
})
