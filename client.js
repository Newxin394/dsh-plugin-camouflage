window.__ModuleLoader__.load({
  id: 'dsh-plugin-camouflage',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    // 只 require 平台种子表里的模块（react / react-dom / cordis / client-store /
    // ui-slots / ui-primitives）。种子之外的 specifier 会在物化时抛
    // "missed the module table"，而不是在构建期被发现。
    const React = require('react')
    const { createElement: h, useEffect, useRef, useState } = React
    const { createSnapshotStore } = require('@deepseek-ai/dsh-client-store')
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')

    /** 词典命名空间，同时也是这张卡片认领的 settings 命名空间。 */
    const NS = 'client-camouflage'

    /**
     * 卡片自己画外壳。宿主的插件配置页只排一列 flex 并按命名空间派发
     * settings.plugin.item，容器归插件；而向 dsh-client-ui-settings-plugins
     * 取值会被客户端 bundle 纯度门拦下（跨插件只能走 cordis 服务与插槽）。
     *
     * 所以类名逐条对齐宿主 PluginCard / 字段行 / 开关的那几套样式，用同一批
     * --dsw-alias-* 令牌，避免这张卡看着像从别的产品飘进来的。
     *
     * 报错色是唯一一处故意偏离：宿主那几张卡写的 label-error 令牌在 ui-theme 的
     * design-platform.css 里没有定义（全仓只有 ui-settings-plugins 自己引用），
     * 落到未定义变量就退回继承色。这里用主题真正定义的
     * --dsw-alias-state-error-primary，报错文字才是红的。
     */
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
`

    // 样式注入留在 factory 闭包内：模块系统在物化期认领未标记的 <style> 记到
    // 本插件名下，HMR 卸载时才带得走。
    if (typeof document !== 'undefined' && document.getElementById('dshcam-style') === null) {
      const style = document.createElement('style')
      style.id = 'dshcam-style'
      style.textContent = CSS
      document.head.appendChild(style)
    }

    /** 宿主没提供 targetHosts 时表单退回的值，与 index.js 的默认一致。 */
    const DEFAULT_HOSTS = ['api.example.com']

    /** 主机名列表的显示形式：每行一个，比逗号更好读也更好改。 */
    function hostsToText(hosts) {
      return Array.isArray(hosts) ? hosts.join('\n') : ''
    }

    /** 反向解析：空白与逗号都当分隔符，顺手去掉空项与重复项。 */
    function textToHosts(text) {
      const kept = []
      for (const piece of String(text).split(/[\s,]+/)) {
        const host = piece.trim()
        if (host !== '' && !kept.includes(host)) kept.push(host)
      }
      return kept
    }

    /** 字符串数组逐项比较。 */
    function sameHosts(a, b) {
      return a.length === b.length && a.every((host, index) => host === b[index])
    }

    /** 把 settings 快照的一层折成表单初值；缺字段时退回插件自带默认。 */
    function formOf(value) {
      const source = value !== null && typeof value === 'object' ? value : {}
      return {
        enabled: source.enabled !== false,
        userAgent: typeof source.userAgent === 'string' ? source.userAgent : 'Cline/3.0.0',
        hostsText: hostsToText(Array.isArray(source.targetHosts) ? source.targetHosts : DEFAULT_HOSTS),
      }
    }

    /**
     * 暂存这张卡的编辑，保存时一次写回 client-camouflage 这一个命名空间。
     *
     * 走 store 而不是让组件自己订阅，是因为组件只能通过 use<Name> 选择器读
     * 会变的东西：scope 快照和本地草稿各自会动，投影必须由两者一起重算。
     */
    class CamouflageCardController {
      /** @param scope - 绑定到本命名空间的 settings scope。 */
      constructor(scope) {
        this.scope = scope
        /** 用户正在编辑的值；null 表示表单显示的就是已落库的值。 */
        this.draft = null
        this.saving = false
        this.failed = false
        this.store = createSnapshotStore(this.projection())
        this.unsubscribe = scope.subscribe(() => { this.publish() })
      }

      /** 停止跟随 scope。 */
      dispose() {
        this.unsubscribe()
      }

      /**
       * 组件读的整份卡片状态。
       * @returns 可用性、可写性、脏/非法判定，以及三个控件各自的值。
       */
      projection() {
        const snapshot = this.scope.getSnapshot()
        const committed = formOf(snapshot.value)
        const shown = this.draft ?? committed
        const user = snapshot.user !== null && typeof snapshot.user === 'object' ? snapshot.user : {}
        const hosts = textToHosts(shown.hostsText)
        const uaInvalid = shown.userAgent.trim() === ''
        const hostsInvalid = hosts.length === 0
        return {
          available: snapshot.status === 'ready',
          writable: snapshot.writable === true,
          saving: this.saving,
          failed: this.failed,
          dirty: shown.enabled !== committed.enabled
            || shown.userAgent !== committed.userAgent
            || !sameHosts(hosts, textToHosts(committed.hostsText)),
          invalid: uaInvalid || hostsInvalid,
          enabled: shown.enabled,
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
        }
      }

      /**
       * 卡片的插槽注册注入的那张脸。
       * @returns 快照源与全部动作。
       */
      inject() {
        return {
          hooks: { camouflageCard: this.store },
          toggle: () => { this.stage({ enabled: !this.shown().enabled }) },
          edit: (field, text) => {
            this.stage(field === 'userAgent' ? { userAgent: text } : { hostsText: text })
          },
          resetField: (field) => {
            const base = formOf(this.scope.getSnapshot().base)
            this.stage(field === 'userAgent' ? { userAgent: base.userAgent } : { hostsText: base.hostsText })
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

      /** 当前表单显示的值（草稿优先）。 */
      shown() {
        return this.draft ?? formOf(this.scope.getSnapshot().value)
      }

      stage(patch) {
        this.draft = { ...this.shown(), ...patch }
        this.failed = false
        this.publish()
      }

      /**
       * 写回三个字段，然后从宿主读回结果判断成败。
       *
       * 与 base 相同的字段写成 unset：settings.yaml 里只留用户真正改过的东西，
       * 「已覆盖」标记和重置按钮才有意义。三个字段走一次 mutate 而不是三次
       * set，是因为半套配置（例如换了 UA 但主机还没落库）会被运行中的钩子读到。
       * @returns 写入与回读都结束后 settle。
       */
      async save() {
        const state = this.projection()
        if (!state.dirty || state.invalid || this.saving || !state.writable) return
        const shown = this.shown()
        const base = formOf(this.scope.getSnapshot().base)
        const intent = {
          enabled: shown.enabled,
          userAgent: shown.userAgent.trim(),
          targetHosts: textToHosts(shown.hostsText),
        }
        const ops = [
          intent.enabled === base.enabled
            ? { op: 'unset', path: ['enabled'] }
            : { op: 'set', path: ['enabled'], value: intent.enabled },
          intent.userAgent === base.userAgent
            ? { op: 'unset', path: ['userAgent'] }
            : { op: 'set', path: ['userAgent'], value: intent.userAgent },
          sameHosts(intent.targetHosts, textToHosts(base.hostsText))
            ? { op: 'unset', path: ['targetHosts'] }
            : { op: 'set', path: ['targetHosts'], value: intent.targetHosts },
        ]

        this.saving = true
        this.failed = false
        this.publish()
        try {
          await this.scope.mutate(ops)
        } finally {
          this.saving = false
        }
        // mutate 把失败吞掉并回读宿主状态，所以成败只能从结果看：宿主的校验器
        // 拥有 schema 表达不了的约束，落库值才是唯一权威。
        const settled = formOf(this.scope.getSnapshot().value)
        const landed = settled.enabled === intent.enabled
          && settled.userAgent === intent.userAgent
          && sameHosts(textToHosts(settled.hostsText), intent.targetHosts)
        if (landed) this.draft = null
        this.failed = !landed
        this.publish()
      }

      publish() {
        this.store.set(this.projection())
      }
    }

    /**
     * 渲染一行开关。
     * @param props - 标签、提示、当前值、是否禁用与切换回调。
     * @returns 开关行。
     */
    function ToggleField(props) {
      return h('div', { className: 'dshcam_field' },
        h('div', { className: 'dshcam_toggleRow' },
          h('span', { className: 'dshcam_toggleLabel' }, props.label),
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
        h('p', { className: 'dshcam_hint' }, props.hint),
      )
    }

    /**
     * 渲染一行文本字段，带「已覆盖」标记与重置按钮。
     * @param props - 控件 id、标签、提示、字段状态与编辑回调。
     * @returns 字段行。
     */
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

    /**
     * 「伪装头」的插件配置卡片。
     * @param props - 取词函数、卡片快照源与表单动作。
     * @returns 卡片，或在宿主未提供本命名空间时返回 null。
     */
    function CamouflageCard(props) {
      const { t } = props
      const state = props.useCamouflageCard((snapshot) => snapshot)
      const [open, setOpen] = useState(false)
      const saveStarted = useRef(false)

      // 保存成功后自动收起，和宿主 PluginCard 的行为一致：失败或仍有未保存
      // 改动时留在展开态，让用户能接着改。
      useEffect(() => {
        if (state.saving) {
          saveStarted.current = true
          return
        }
        if (!saveStarted.current) return
        saveStarted.current = false
        if (!state.dirty && !state.failed) setOpen(false)
      }, [state.dirty, state.failed, state.saving])

      // 宿主没在提供这个命名空间（插件的宿主半边没挂上）就整张卡不画，
      // 而不是画一张点不动的卡——这也是宿主自己那几张卡的做法。
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
          primitives.IconChevronDownOutline14 === undefined
            ? null
            : h(primitives.IconChevronDownOutline14, {
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
          h(TextField, {
            ...fieldChrome,
            id: 'dshcam-user-agent',
            label: t('userAgentLabel'),
            hint: t('userAgentHint'),
            invalidLabel: t('userAgentInvalid'),
            ...state.userAgent,
            onEdit: (text) => { props.edit('userAgent', text) },
            onReset: () => { props.resetField('userAgent') },
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

    const zh = {
      title: '伪装头',
      description: '给上游 LLM 请求换一个客户端 User-Agent，用来过 API 中转站的客户端白名单。',
      enabledLabel: '启用伪装',
      enabledHint: '关闭后请求按原样发出，不再改写任何请求头。',
      userAgentLabel: '伪装的 User-Agent',
      userAgentHint: '中转站白名单认哪个客户端就填哪个，例如 Cline/3.0.0。',
      userAgentInvalid: '不能为空。',
      targetHostsLabel: '生效的目标主机',
      targetHostsHint: '每行一个主机名；只有 URL 命中其中之一才改写。填 * 表示所有请求。',
      targetHostsInvalid: '至少要填一个主机名。',
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
    }

    const en = {
      title: 'Camouflage header',
      description: 'Spoof the client User-Agent on upstream LLM requests to pass an API gateway client allowlist.',
      enabledLabel: 'Enable camouflage',
      enabledHint: 'When off, requests go out untouched and no header is rewritten.',
      userAgentLabel: 'Spoofed User-Agent',
      userAgentHint: 'Whichever client the gateway allowlists, for example Cline/3.0.0.',
      userAgentInvalid: 'Cannot be empty.',
      targetHostsLabel: 'Target hosts',
      targetHostsHint: 'One host per line; only a matching URL is rewritten. Use * for every request.',
      targetHostsInvalid: 'At least one host is required.',
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
    }

    /** 浏览器半边需要的服务。 */
    const inject = ['slots', 'locale']

    /**
     * 挂载插件配置卡片。
     * @param ctx - 浏览器插件上下文。
     * @returns 无。
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'camouflage: dictionaries')
      const t = ctx.locale.bind(NS)
      // settingsScope 走 ctx.inject 而不是顶层 inject：宿主没有这个服务时回调
      // 不执行，插件的请求头钩子照常工作，只是设置页少一张卡。
      ctx.inject(['settingsScope'], (scoped) => {
        const card = new CamouflageCardController(scoped.settingsScope.bind({ namespace: NS }))
        scoped.effect(() => () => { card.dispose() }, 'camouflage: card form')
        // slots.inject 等的是插槽声明本身：宿主的插件配置页声明 settings.plugin.item
        // 之后才注册，声明塌陷时自动撤下，重新声明时再来一次。
        scoped.slots.inject('settings.plugin.item', () => scoped.slots.register({
          name: 'settings.plugin.item',
          key: NS,
          locale: NS,
          inject: () => ({ t, ...card.inject() }),
        }, CamouflageCard))
      })
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
