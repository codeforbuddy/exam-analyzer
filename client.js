window.__ModuleLoader__.load({
  id: '@local/exam-analyzer',
  factory(require) {
    const React = require('react')
    const e = React.createElement
    const { useEffect, useRef, useState } = React

    const T = {
      bg: 'var(--dsw-alias-bg-layer-1)',
      bg2: 'var(--dsw-alias-bg-layer-2)',
      overlay: 'var(--dsw-alias-bg-overlay)',
      border: 'var(--dsw-alias-border-l1)',
      border2: 'var(--dsw-alias-border-l2)',
      text: 'var(--dsw-alias-label-primary)',
      sub: 'var(--dsw-alias-label-secondary)',
      brand: 'var(--dsw-alias-brand-primary)',
      error: 'var(--dsw-alias-state-error-primary)',
      warn: 'var(--dsw-alias-state-warn-primary)',
      success: 'var(--dsw-alias-state-success-primary)',
    }

    const S = {
      panel: {
        position: 'fixed',
        top: 46,
        right: 12,
        bottom: 12,
        width: 'min(1040px, 94vw)',
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        background: T.bg,
        color: T.text,
        border: `1px solid ${T.border2}`,
        borderRadius: 12,
        boxShadow: '0 18px 48px rgba(0,0,0,0.28)',
        overflow: 'hidden',
        pointerEvents: 'auto',
        fontFamily: 'inherit',
        fontSize: 13,
      },
      header: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 14px',
        borderBottom: `1px solid ${T.border}`,
        flex: '0 0 auto',
      },
      viewer: {
        flex: '1 1 58%',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        background: T.bg2,
        borderRight: `1px solid ${T.border}`,
      },
      toolbar: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 12px',
        borderBottom: `1px solid ${T.border}`,
        background: T.bg,
        flex: '0 0 auto',
      },
      scroll: { flex: 1, minHeight: 0, overflow: 'auto', padding: 14 },
      rail: {
        flex: '1 1 42%',
        minWidth: 320,
        maxWidth: 560,
        overflow: 'auto',
        padding: '12px 16px 48px',
        background: T.bg,
      },
      btn: {
        border: `1px solid ${T.border2}`,
        background: T.bg,
        color: T.text,
        borderRadius: 7,
        padding: '4px 9px',
        fontSize: 12,
        cursor: 'pointer',
        lineHeight: 1.5,
      },
      btnPrimary: {
        border: '1px solid transparent',
        background: T.brand,
        color: '#fff',
        borderRadius: 7,
        padding: '6px 12px',
        fontSize: 12.5,
        fontWeight: 600,
        cursor: 'pointer',
      },
      caption: { fontSize: 11, color: T.sub, letterSpacing: 0.3, marginBottom: 5 },
      card: {
        border: `1px solid ${T.border}`,
        borderRadius: 9,
        background: T.bg2,
        padding: '10px 12px',
        marginBottom: 10,
      },
      chip: {
        display: 'inline-flex',
        alignItems: 'center',
        border: `1px solid ${T.border2}`,
        borderRadius: 999,
        padding: '2px 9px',
        margin: '0 6px 6px 0',
        fontSize: 11.5,
        background: T.bg,
      },
      pre: { whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.7, margin: 0 },
    }

    let pdfjsPromise = null

    function loadPdfjs() {
      if (!pdfjsPromise) {
        pdfjsPromise = import('/api/exam-analyzer/vendor/pdf.mjs').then((mod) => {
          try {
            mod.GlobalWorkerOptions.workerSrc = '/api/exam-analyzer/vendor/pdf.worker.mjs'
          } catch {
            /* ignore */
          }
          return mod
        })
      }
      return pdfjsPromise
    }

    function toBase64(bytes) {
      let out = ''
      const step = 0x8000
      for (let i = 0; i < bytes.length; i += step) {
        out += String.fromCharCode.apply(null, bytes.subarray(i, i + step))
      }
      return btoa(out)
    }

    async function postJson(url, payload) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      let data = null
      try {
        data = await res.json()
      } catch {
        throw new Error(`服务返回了非 JSON 响应（HTTP ${res.status}）`)
      }
      if (!res.ok || !data || data.ok === false) {
        throw new Error((data && data.error) || `请求失败（HTTP ${res.status}）`)
      }
      return data
    }

    const BANK_SUBJECTS = ['数学', '物理', '化学', '生物', '语文', '英语', '道法', '历史', '地理', '其他']

    function cropFromImage(page, box) {
      return new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          const W = img.naturalWidth
          const H = img.naturalHeight
          const pad = 10
          const sx = Math.max(0, box.x * W - pad)
          const sy = Math.max(0, box.y * H - pad)
          const sw = Math.min(W - sx, box.w * W + pad * 2)
          const sh = Math.min(H - sy, box.h * H + pad * 2)
          const ratio = Math.min(1, 1200 / sw)
          const canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round(sw * ratio))
          canvas.height = Math.max(1, Math.round(sh * ratio))
          const ctx = canvas.getContext('2d')
          ctx.fillStyle = '#fff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL('image/png'))
        }
        img.onerror = () => reject(new Error('无法读取该页图片'))
        img.src = page.url
      })
    }

    function Chip({ label, tone }) {
      return e(
        'span',
        { style: { ...S.chip, borderColor: tone === 'brand' ? T.brand : T.border2 } },
        label,
      )
    }

    const MATH_CHAR = /[0-9A-Za-z²³¹⁰⁴⁵⁶⁷⁸⁹₀-₉.′]/

    /** 读一个根号：√13、√(3+√13)，返回被开方数与结束位置。 */
    function readRadical(source, index) {
      let j = index + 1
      while (source[j] === ' ') j += 1
      if (j >= source.length) return null
      let inner = ''
      let end = j
      if (source[j] === '(') {
        let depth = 0
        for (let k = j; k < source.length; k += 1) {
          if (source[k] === '(') depth += 1
          else if (source[k] === ')') {
            depth -= 1
            if (depth === 0) {
              end = k + 1
              break
            }
          }
        }
        inner = source.slice(j + 1, end - 1)
      } else {
        while (end < source.length && MATH_CHAR.test(source[end])) end += 1
        inner = source.slice(j, end)
      }
      if (!inner) return null
      return { inner, end }
    }

    /** 读一个“数学原子”：括号组 / 根号 / 数字字母串。 */
    function readAtom(source, index) {
      let j = index
      while (source[j] === ' ') j += 1
      if (j >= source.length) return null
      const ch = source[j]
      if (ch === '(') {
        let depth = 0
        let end = -1
        for (let k = j; k < source.length; k += 1) {
          if (source[k] === '(') depth += 1
          else if (source[k] === ')') {
            depth -= 1
            if (depth === 0) {
              end = k + 1
              break
            }
          }
        }
        if (end < 0) return null
        return { text: source.slice(j + 1, end - 1), end }
      }
      if (ch === '√') {
        const rad = readRadical(source, j)
        if (!rad) return null
        return { text: source.slice(j, rad.end), end: rad.end }
      }
      if (MATH_CHAR.test(ch)) {
        let end = j
        while (end < source.length && MATH_CHAR.test(source[end])) end += 1
        return { text: source.slice(j, end), end }
      }
      return null
    }

    /** 识别 “分子/分母”，分子分母各自可以是括号组、根号或字母数字串。 */
    function readFraction(source, index) {
      const num = readAtom(source, index)
      if (!num) return null
      let j = num.end
      while (source[j] === ' ') j += 1
      if (source[j] !== '/') return null
      const den = readAtom(source, j + 1)
      if (!den) return null
      if (/^\d{4}$/.test(num.text) && /^\d{1,2}$/.test(den.text)) return null
      return { num: num.text, den: den.text, end: den.end }
    }

    /**
     * 把纯文本里的数学写成“看得懂”的形状：
     *  - √13 / √(3+√13) → 带横线的根号
     *  - 1/2、(3+√13)/2、(m²+n²)/(3m−1) → 上下堆叠的真分数
     */
    function renderMathNodes(text, keyPrefix) {
      const source = String(text == null ? '' : text)
      const nodes = []
      let buffer = ''
      let i = 0
      let seq = 0

      const flush = () => {
        if (buffer) {
          nodes.push(buffer)
          buffer = ''
        }
      }

      while (i < source.length) {
        const ch = source[i]

        if (ch === '(' || ch === '√' || MATH_CHAR.test(ch)) {
          const frac = readFraction(source, i)
          if (frac) {
            flush()
            seq += 1
            nodes.push(
              e(
                'span',
                {
                  key: `${keyPrefix}-frac-${seq}`,
                  style: {
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    verticalAlign: 'middle',
                    margin: '0 3px',
                    lineHeight: 1.1,
                  },
                },
                e(
                  'span',
                  { style: { padding: '0 4px', textAlign: 'center' } },
                  renderMathNodes(frac.num, `${keyPrefix}-n${seq}`),
                ),
                e(
                  'span',
                  {
                    style: {
                      borderTop: '1px solid currentColor',
                      padding: '0 4px',
                      textAlign: 'center',
                    },
                  },
                  renderMathNodes(frac.den, `${keyPrefix}-d${seq}`),
                ),
              ),
            )
            i = frac.end
            continue
          }
        }

        if (ch === '√') {
          const rad = readRadical(source, i)
          if (rad) {
            flush()
            seq += 1
            nodes.push(
              e(
                'span',
                { key: `${keyPrefix}-rad-${seq}`, style: { whiteSpace: 'nowrap' } },
                '√',
                e(
                  'span',
                  {
                    style: {
                      display: 'inline-block',
                      borderTop: '1px solid currentColor',
                      lineHeight: 1.2,
                      paddingLeft: 1,
                      paddingRight: 1,
                      marginLeft: -1,
                    },
                  },
                  renderMathNodes(rad.inner, `${keyPrefix}-r${seq}`),
                ),
              ),
            )
            i = rad.end
            continue
          }
        }

        buffer += ch
        i += 1
      }
      flush()
      return nodes
    }

    function MText({ text }) {
      return e(React.Fragment, null, renderMathNodes(text, 'm'))
    }

    function Rich({ text, style }) {
      return e('div', { style: { ...S.pre, ...style } }, renderMathNodes(text, 'rich'))
    }

    /** 服务端已做一次过滤，这里再按 DOM 白名单过滤一遍，只允许基本图元。 */
    function sanitizeSvgClient(raw) {
      if (typeof raw !== 'string' || raw.indexOf('<svg') < 0) return ''
      try {
        const doc = new DOMParser().parseFromString(raw, 'image/svg+xml')
        const svg = doc.documentElement
        if (!svg || String(svg.nodeName).toLowerCase() !== 'svg') return ''
        const allowed = new Set([
          'svg', 'g', 'path', 'line', 'circle', 'ellipse', 'rect',
          'polygon', 'polyline', 'text', 'tspan', 'defs', 'marker',
        ])
        const walk = (node) => {
          for (const child of Array.from(node.children)) {
            const tag = String(child.nodeName).toLowerCase()
            if (!allowed.has(tag)) {
              child.remove()
              continue
            }
            for (const attr of Array.from(child.attributes)) {
              const name = attr.name.toLowerCase()
              if (name.startsWith('on')) child.removeAttribute(attr.name)
              else if ((name === 'href' || name === 'xlink:href') && /^\s*(javascript:|https?:|data:)/i.test(attr.value)) {
                child.removeAttribute(attr.name)
              }
            }
            walk(child)
          }
        }
        walk(svg)
        const viewBox = svg.getAttribute('viewBox')
        if (!viewBox) svg.setAttribute('viewBox', '0 0 320 200')
        svg.removeAttribute('width')
        svg.removeAttribute('height')
        svg.setAttribute('width', '100%')
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
        return new XMLSerializer().serializeToString(svg)
      } catch (error) {
        return ''
      }
    }

    function Figure({ svg, caption }) {
      const safe = sanitizeSvgClient(svg)
      if (!safe) return null
      return e(
        'div',
        { style: { marginTop: 8 } },
        e('div', {
          style: {
            background: '#fff',
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            padding: 6,
            maxHeight: 260,
            overflow: 'hidden',
          },
          dangerouslySetInnerHTML: { __html: safe },
        }),
        caption
          ? e('div', { style: { fontSize: 10.5, color: T.sub, marginTop: 3 } }, caption)
          : null,
      )
    }

    function ConceptList({ items, brand }) {
      if (!items || !items.length) return null
      return e(
        'div',
        null,
        e(
          'div',
          { style: { display: 'flex', flexWrap: 'wrap', marginBottom: 6 } },
          items.map((item, i) => e(Chip, { key: i, label: item.name || String(item), tone: brand ? 'brand' : undefined })),
        ),
        items.map((item, i) =>
          e(
            'div',
            { key: `d-${i}`, style: { fontSize: 12, color: T.sub, lineHeight: 1.6, marginBottom: 5 } },
            e('span', { style: { color: T.text, fontWeight: 600 } }, `${item.name}：`),
            e(MText, { text: item.detail || '' }),
          ),
        ),
      )
    }

    function Page({ page, zoom, selected, onPick, onVisible }) {
      const imgRef = useRef(null)
      const dragRef = useRef(null)
      const [drag, setDrag] = useState(null)

      const point = (event) => {
        const img = imgRef.current
        if (!img) return null
        const rect = img.getBoundingClientRect()
        return {
          x: Math.min(Math.max(event.clientX - rect.left, 0), rect.width),
          y: Math.min(Math.max(event.clientY - rect.top, 0), rect.height),
        }
      }

      const down = (event) => {
        if (event.button !== 0) return
        const p = point(event)
        if (!p) return
        event.currentTarget.setPointerCapture?.(event.pointerId)
        dragRef.current = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }
        setDrag({ ...dragRef.current })
      }

      const move = (event) => {
        const start = dragRef.current
        if (!start) return
        const p = point(event)
        if (!p) return
        dragRef.current = { ...start, x1: p.x, y1: p.y }
        setDrag({ ...dragRef.current })
      }

      const up = (event) => {
        const start = dragRef.current
        if (!start) return
        dragRef.current = null
        const p = point(event) || { x: start.x1, y: start.y1 }
        const box = { x0: start.x0, y0: start.y0, x1: p.x, y1: p.y }
        setDrag(null)
        const img = imgRef.current
        if (!img) return
        const rect = img.getBoundingClientRect()
        if (rect.width < 1 || rect.height < 1) return
        const w = Math.abs(box.x1 - box.x0) / rect.width
        const h = Math.abs(box.y1 - box.y0) / rect.height
        if (w * rect.width < 10 || h * rect.height < 10) return
        onPick(page, {
          x: Math.min(box.x0, box.x1) / rect.width,
          y: Math.min(box.y0, box.y1) / rect.height,
          w,
          h,
        })
      }

      const live = drag
        ? {
            left: Math.min(drag.x0, drag.x1),
            top: Math.min(drag.y0, drag.y1),
            width: Math.abs(drag.x1 - drag.x0),
            height: Math.abs(drag.y1 - drag.y0),
          }
        : null

      const marks = []
      if (selected) {
        marks.push(
          e('div', {
            key: 'sel',
            style: {
              position: 'absolute',
              left: `${selected.x * 100}%`,
              top: `${selected.y * 100}%`,
              width: `${selected.w * 100}%`,
              height: `${selected.h * 100}%`,
              border: `2px solid ${T.brand}`,
              background: 'rgba(47,111,178,0.10)',
              pointerEvents: 'none',
            },
          }),
        )
      }
      if (live) {
        marks.push(
          e('div', {
            key: 'live',
            style: {
              position: 'absolute',
              ...live,
              border: `1.5px dashed ${T.brand}`,
              background: 'rgba(47,111,178,0.16)',
              pointerEvents: 'none',
            },
          }),
        )
      }

      return e(
        'div',
        {
          ref: (node) => {
            if (node) onVisible(page, node)
          },
          style: {
            position: 'relative',
            width: `${zoom * 100}%`,
            margin: '0 auto 18px',
            background: '#fff',
            border: `1px solid ${T.border2}`,
            borderRadius: 6,
            boxShadow: '0 3px 14px rgba(0,0,0,0.10)',
            userSelect: 'none',
            touchAction: 'none',
          },
        },
        e('img', {
          ref: imgRef,
          src: page.url,
          alt: `第 ${page.index + 1} 页`,
          draggable: false,
          style: { display: 'block', width: '100%', height: 'auto' },
        }),
        e('div', {
          onPointerDown: down,
          onPointerMove: move,
          onPointerUp: up,
          onPointerCancel: () => setDrag(null),
          style: { position: 'absolute', inset: 0, cursor: 'crosshair' },
        }),
        marks,
        e(
          'div',
          {
            style: {
              position: 'absolute',
              left: 8,
              top: 8,
              fontSize: 11,
              color: '#2f6fb2',
              background: 'rgba(255,255,255,0.88)',
              borderRadius: 5,
              padding: '1px 6px',
              pointerEvents: 'none',
            },
          },
          `第 ${page.index + 1} 页`,
        ),
      )
    }

    function Rail({
      status,
      error,
      result,
      picked,
      pageCount,
      onRetry,
      onClear,
      mode,
      allPages,
      detailItems,
      solving,
      onBack,
      onSolveAll,
      onSolveDetailed,
      subject,
      onSubjectChange,
      onSave,
      flash,
      bankItems,
      bankCounts,
      bankTotal,
      bankPath,
      bankQuery,
      bankSubject,
      bankLoading,
      onBankQuery,
      onBankSubject,
      onBankDelete,
      onBankReload,
    }) {
      const [copied, setCopied] = useState(-1)
      const [zoom, setZoom] = useState('')

      const copy = async (text, key) => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(key)
          setTimeout(() => setCopied(-1), 1400)
        } catch {
          /* ignore */
        }
      }

      if (mode === 'bank') {
        const activeSubject = bankSubject || '全部'
        const chips = ['全部', ...BANK_SUBJECTS].filter((name) => name === '全部' || bankCounts[name])
        return e(
          'div',
          null,
          e(
            'div',
            { style: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 } },
            e('div', { style: { fontSize: 14, fontWeight: 700 } }, '我的题库'),
            e(
              'div',
              { style: { fontSize: 11, color: T.sub, marginLeft: 'auto' } },
              `共 ${bankTotal} 题`,
            ),
          ),
          e(
            'div',
            { style: { display: 'flex', gap: 8, marginBottom: 10 } },
            e('input', {
              value: bankQuery,
              placeholder: '搜索题目 / 知识点…',
              onChange: (event) => {
                const value = event.target.value
                onBankQuery(value)
                onBankReload({ query: value })
              },
              style: {
                flex: 1,
                minWidth: 0,
                padding: '5px 8px',
                fontSize: 12.5,
                color: T.text,
                background: T.bg,
                border: `1px solid ${T.border2}`,
                borderRadius: 7,
                outline: 'none',
              },
            }),
            e('button', { style: S.btn, onClick: () => onBankReload() }, bankLoading ? '刷新中…' : '刷新'),
            e('button', { style: S.btn, onClick: onBack }, '返回单题'),
          ),
          e(
            'div',
            { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 } },
            chips.map((name) =>
              e(
                'button',
                {
                  key: name,
                  onClick: () => {
                    const value = name === '全部' ? '' : name
                    onBankSubject(value)
                    onBankReload({ subject: value })
                  },
                  style: {
                    ...S.chip,
                    cursor: 'pointer',
                    background: activeSubject === name ? T.brand : 'transparent',
                    color: activeSubject === name ? '#fff' : T.sub,
                    borderColor: activeSubject === name ? T.brand : T.border,
                  },
                },
                name === '全部' ? `全部 ${bankTotal}` : `${name} ${bankCounts[name]}`,
              ),
            ),
          ),
          bankItems.map((item) =>
            e(
              'div',
              { key: item.id, style: { ...S.card, marginBottom: 8 } },
              e(
                'div',
                { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 } },
                e(
                  'span',
                  {
                    style: {
                      fontSize: 10.5,
                      color: '#fff',
                      background: T.brand,
                      borderRadius: 4,
                      padding: '1px 6px',
                    },
                  },
                  item.subject,
                ),
                e(
                  'span',
                  { style: { fontSize: 10.5, color: T.sub } },
                  `${item.source && item.source.page ? `第 ${item.source.page} 页` : '手动'} · ${String(item.savedAt || '').slice(0, 10)}`,
                ),
                e(
                  'button',
                  {
                    style: { ...S.btn, marginLeft: 'auto', padding: '2px 8px', fontSize: 11 },
                    onClick: () => onBankDelete(item.id),
                  },
                  '删除',
                ),
              ),
              e('div', { style: { ...S.pre, marginBottom: 6 } }, e(MText, { text: item.question })),
              (Array.isArray(item.images) && item.images.length
                ? item.images
                : item.image
                  ? [{ file: item.image }]
                  : []
              ).map((entry, index) =>
                e('img', {
                  key: index,
                  src: `/api/exam-analyzer/bank/image?id=${encodeURIComponent(item.id)}&i=${index + 1}`,
                  alt: '题目图形',
                  onClick: () =>
                    setZoom(`/api/exam-analyzer/bank/image?id=${encodeURIComponent(item.id)}&i=${index + 1}`),
                  style: {
                    width: '100%',
                    maxHeight: 170,
                    objectFit: 'contain',
                    background: '#fff',
                    borderRadius: 6,
                    border: `1px solid ${T.border}`,
                    marginBottom: 6,
                    cursor: 'zoom-in',
                  },
                }),
              ),
              item.answer
                ? e(
                    'div',
                    { style: { fontSize: 12.5, color: T.brand, whiteSpace: 'pre-wrap', lineHeight: 1.6 } },
                    item.answer,
                  )
                : null,
              item.concepts && item.concepts.length
                ? e(
                    'div',
                    { style: { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 } },
                    item.concepts.slice(0, 4).map((concept, index) =>
                      e('span', { key: index, style: S.chip }, concept.name || String(concept)),
                    ),
                  )
                : null,
            ),
          ),
          !bankItems.length
            ? e(
                'div',
                { style: { color: T.sub, fontSize: 12.5, lineHeight: 1.8 } },
                bankLoading ? '加载中…' : '题库还是空的：解析完一道题后，点「存入题库」并选好学科即可。',
              )
            : null,
          bankPath
            ? e(
                'div',
                { style: { fontSize: 10.5, color: T.sub, marginTop: 10, wordBreak: 'break-all' } },
                `存储位置：${bankPath}`,
              )
            : null,
        )
      }

      if (mode === 'detail') {
        const items = detailItems || []
        const copyAll = () =>
          copy(
            items.map((item) => `${item.page}-${item.no}  ${item.answer}`).join('\n'),
            'detail',
          )
        return e(
          'div',
          null,
          e(
            'div',
            { style: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 } },
            e('div', { style: { fontSize: 14, fontWeight: 700 } }, '分段精解'),
            e(
              'div',
              { style: { fontSize: 11, color: T.sub, marginLeft: 'auto' } },
              `已精解 ${items.length} 题`,
            ),
          ),
          status ? e('div', { style: { ...S.card, borderColor: T.brand, color: T.brand } }, status) : null,
          e(
            'div',
            { style: { display: 'flex', gap: 8, marginBottom: 12 } },
            e('button', { style: S.btnPrimary, onClick: copyAll }, copied === 'detail' ? '已复制' : '复制全部'),
            e('button', { style: S.btn, onClick: onBack }, '返回单题解析'),
            e('button', { style: S.btn, onClick: onSolveDetailed, disabled: solving }, '重新精解'),
          ),
          items.map((item, index) =>
            e(
              'div',
              { key: index, style: { ...S.card, padding: '8px 10px', marginBottom: 6 } },
              e(
                'div',
                { style: { display: 'flex', gap: 8, alignItems: 'flex-start' } },
                e(
                  'span',
                  { style: { fontWeight: 700, color: T.brand, minWidth: 44, flex: '0 0 auto' } },
                  `${item.no}`,
                ),
                e('span', { style: { ...S.pre, flex: 1 } }, item.answer || ''),
                item.page
                  ? e('span', { style: { fontSize: 10.5, color: T.sub, flex: '0 0 auto' } }, `P${item.page}`)
                  : null,
              ),
            ),
          ),
          !items.length && !status
            ? e('div', { style: { color: T.sub, fontSize: 12.5 } }, '正在准备…')
            : null,
        )
      }

      if (mode === 'all') {
        const pages = allPages || []
        const count = pages.reduce((sum, block) => sum + (block.questions ? block.questions.length : 0), 0)
        const copyAll = () =>
          copy(
            pages
              .map(
                (block) =>
                  `【第 ${block.page} 页】\n` +
                  (block.questions || []).map((q) => `${q.no}  ${q.answer}`).join('\n'),
              )
              .join('\n\n'),
            'all-pages',
          )
        return e(
          'div',
          null,
          e(
            'div',
            { style: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 } },
            e('div', { style: { fontSize: 14, fontWeight: 700 } }, '全卷答案'),
            e(
              'div',
              { style: { fontSize: 11, color: T.sub, marginLeft: 'auto' } },
              `已识别 ${pages.length} 页 · ${count} 题`,
            ),
          ),
          status ? e('div', { style: { ...S.card, borderColor: T.brand, color: T.brand } }, status) : null,
          pages.length
            ? e(
                'div',
                { style: { display: 'flex', gap: 8, marginBottom: 12 } },
                e('button', { style: S.btnPrimary, onClick: copyAll }, copied === 'all-pages' ? '已复制' : '复制全卷答案'),
                e('button', { style: S.btn, onClick: onBack }, '返回单题解析'),
                e('button', { style: S.btn, onClick: onSolveAll, disabled: solving }, '重新识别'),
              )
            : null,
          pages.map((block) =>
            e(
              'div',
              { key: block.page, style: { marginBottom: 14 } },
              e('div', { style: S.caption }, `第 ${block.page} 页`),
              block.error
                ? e('div', { style: { ...S.card, borderColor: T.error, color: T.error, ...S.pre } }, block.error)
                : null,
              (block.questions || []).map((item, index) =>
                e(
                  'div',
                  { key: index, style: { ...S.card, padding: '8px 10px', marginBottom: 6 } },
                  e(
                    'div',
                    { style: { display: 'flex', gap: 8, alignItems: 'flex-start' } },
                    e(
                      'span',
                      { style: { fontWeight: 700, color: T.brand, minWidth: 36, flex: '0 0 auto' } },
                      item.no || '·',
                    ),
                    e('span', { style: { ...S.pre, flex: 1 } }, e(MText, { text: item.answer || '' })),
                  ),
                  item.stem
                    ? e('div', { style: { fontSize: 11, color: T.sub, marginTop: 3, paddingLeft: 44 } }, item.stem)
                    : null,
                ),
              ),
            ),
          ),
          !pages.length && !status
            ? e('div', { style: { color: T.sub, fontSize: 12.5 } }, '正在准备…')
            : null,
        )
      }

      const head = e(
        'div',
        { style: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 } },
        e('div', { style: { fontSize: 14, fontWeight: 700 } }, '题目解析'),
        result && result.subject
          ? e(
              'span',
              {
                style: {
                  fontSize: 11,
                  color: '#fff',
                  background: T.brand,
                  borderRadius: 4,
                  padding: '1px 6px',
                },
              },
              result.subject,
            )
          : null,
        e('div', { style: { fontSize: 11, color: T.sub, marginLeft: 'auto' } },
          pageCount ? `共 ${pageCount} 页` : ''),
      )

      if (status) {
        return e(
          'div',
          null,
          head,
          e('div', { style: { ...S.card, borderColor: T.brand, color: T.brand } }, status),
          picked
            ? e('img', {
                src: picked.dataUrl,
                alt: '选区',
                style: { width: '100%', borderRadius: 8, border: `1px solid ${T.border}`, opacity: 0.7 },
              })
            : null,
        )
      }

      if (error) {
        return e(
          'div',
          null,
          head,
          e('div', { style: { ...S.card, borderColor: T.error, color: T.error, ...S.pre } }, error),
          e(
            'div',
            { style: { display: 'flex', gap: 8 } },
            picked ? e('button', { style: S.btnPrimary, onClick: onRetry }, '重试') : null,
            e('button', { style: S.btn, onClick: onClear }, '清除'),
          ),
        )
      }

      if (!result) {
        return e(
          'div',
          null,
          head,
          e(
            'div',
            { style: { color: T.sub, lineHeight: 1.9, fontSize: 12.5 } },
            e('div', { style: { fontWeight: 600, color: T.text, marginBottom: 6 } }, '三步拿到解析'),
            e('div', null, '① 左侧就是试卷原图，滚动到要做的题；'),
            e('div', null, '② 在题目上按住鼠标，拖出一个框（把题干和选项都框进去）；'),
            e('div', null, '③ 这里立刻给出答案、知识点和相似题。'),
            e('div', { style: { marginTop: 10 } }, '框选一次后，选中的区域会留在卷面上，方便对照。'),
          ),
        )
      }

      const sections = []

      if (picked) {
        sections.push(
          e(
            'div',
            { key: 'picked', style: { marginBottom: 12 } },
            e('div', { style: S.caption }, `原题（已选区域 · 第 ${picked.pageIndex + 1} 页，点击放大）`),
            e('img', {
              src: picked.dataUrl,
              alt: '选区',
              onClick: () => setZoom(picked.dataUrl),
              style: {
                width: '100%',
                maxHeight: 170,
                objectFit: 'contain',
                background: '#fff',
                borderRadius: 8,
                border: `1px solid ${T.border}`,
                cursor: 'zoom-in',
              },
            }),
          ),
        )
      }

      if (result.question) {
        sections.push(
          e(
            'div',
            { key: 'q', style: { marginBottom: 12 } },
            e('div', { style: S.caption }, '识别到的题目'),
            e(Rich, { text: result.question, style: { ...S.card } }),
          ),
        )
        sections.push(
          e(
            'div',
            { key: 'save', style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' } },
            e(
              'select',
              {
                value: subject || (BANK_SUBJECTS.includes(result.subject) ? result.subject : '其他'),
                onChange: (event) => onSubjectChange(event.target.value),
                title: '选择要存入的学科',
                style: {
                  padding: '4px 6px',
                  fontSize: 12.5,
                  color: T.text,
                  background: T.bg,
                  border: `1px solid ${T.border2}`,
                  borderRadius: 7,
                },
              },
              BANK_SUBJECTS.map((name) => e('option', { key: name, value: name }, name)),
            ),
            e('button', { style: S.btnPrimary, onClick: onSave }, '存入题库'),
            flash ? e('span', { style: { fontSize: 11, color: T.brand } }, flash) : null,
          ),
        )
      }

      if (result.answer) {
        sections.push(
          e(
            'div',
            { key: 'a', style: { marginBottom: 12 } },
            e('div', { style: S.caption }, '答案'),
            e(Rich, {
              text: result.answer,
              style: {
                ...S.card,
                borderColor: T.success,
                color: T.success,
                fontWeight: 600,
                fontSize: 13.5,
              },
            }),
          ),
        )
      }

      if (result.concepts && result.concepts.length) {
        sections.push(
          e(
            'div',
            { key: 'c', style: { marginBottom: 12 } },
            e('div', { style: S.caption }, '涉及的知识点'),
            e(ConceptList, { items: result.concepts, brand: true }),
          ),
        )
      }

      if (result.related && result.related.length) {
        sections.push(
          e(
            'div',
            { key: 'r', style: { marginBottom: 12 } },
            e('div', { style: S.caption }, '可迁移 / 易混知识点'),
            e(ConceptList, { items: result.related }),
          ),
        )
      }

      if (result.explanation) {
        sections.push(
          e(
            'div',
            { key: 'e', style: { marginBottom: 12 } },
            e('div', { style: S.caption }, '解析'),
            e(Rich, { text: result.explanation, style: { ...S.card } }),
          ),
        )
      }

      if (result.similar && result.similar.length) {
        sections.push(
          e(
            'div',
            { key: 's', style: { marginBottom: 12 } },
            e('div', { style: S.caption }, `相似题 · ${result.similar.length} 道`),
            result.similar.map((item, i) =>
              e(
                'div',
                { key: i, style: S.card },
                e(
                  'div',
                  { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 } },
                  e(
                    'span',
                    {
                      style: {
                        fontSize: 11,
                        color: '#fff',
                        background: T.brand,
                        borderRadius: 4,
                        padding: '1px 6px',
                      },
                    },
                    `变式 ${i + 1}`,
                  ),
                  e('span', { style: { marginLeft: 'auto', fontSize: 11, color: T.sub } },
                    (item.concepts || []).join(' · ')),
                  e(
                    'button',
                    {
                      style: { ...S.btn, padding: '1px 7px', fontSize: 11 },
                      onClick: () => copy(`${item.question}\n\n答案：${item.answer}`, `s${i}`),
                    },
                    copied === `s${i}` ? '已复制' : '复制',
                  ),
                ),
                e('div', { style: { ...S.pre, marginBottom: 6 } }, e(MText, { text: item.question })),
                item.figure
                  ? e(Figure, { svg: item.figure, caption: '示意图（模型按题意绘制，仅供理解；精确图形以原题为准）' })
                  : null,
                e('div', { style: { ...S.pre, color: T.success, fontSize: 12 } }, '答案：', e(MText, { text: item.answer })),
              ),
            ),
          ),
        )
      }

      sections.push(
        e(
          'div',
          { key: 'actions', style: { display: 'flex', gap: 8, marginTop: 2 } },
          e(
            'button',
            {
              style: S.btnPrimary,
              onClick: () =>
                copy(
                  [
                    result.question,
                    '',
                    `答案：${result.answer || ''}`,
                    '',
                    `知识点：${(result.concepts || []).map((c) => c.name).join('、')}`,
                    '',
                    result.explanation || '',
                  ].join('\n'),
                  'all',
                ),
            },
            copied === 'all' ? '已复制' : '复制解析',
          ),
          e('button', { style: S.btn, onClick: onRetry }, '重新识别'),
          e('button', { style: S.btn, onClick: onClear }, '清除选区'),
        ),
      )

      return e(
        'div',
        null,
        head,
        result.truncated
          ? e(
              'div',
              { style: { fontSize: 11, color: T.warn, marginBottom: 8 } },
              '模型输出较长，已自动截取可用部分；框小一点结果会更完整。',
            )
          : null,
        sections,
        zoom
          ? e(
              'div',
              {
                onClick: () => setZoom(''),
                style: {
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(0,0,0,.72)',
                  zIndex: 2147483000,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 24,
                  cursor: 'zoom-out',
                },
              },
              e('img', {
                src: zoom,
                alt: '原题放大',
                style: { maxWidth: '92vw', maxHeight: '90vh', background: '#fff', borderRadius: 8 },
              }),
            )
          : null,
      )
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max)
    }

    function readPanelSize() {
      try {
        const raw = localStorage.getItem('exam-analyzer-size')
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed && parsed.w) return { w: parsed.w, h: parsed.h || 0 }
        }
      } catch {
        /* ignore */
      }
      return { w: 1040, h: 0 }
    }

    function Root() {
      const [open, setOpen] = useState(false)
      const [doc, setDoc] = useState(null)
      const [status, setStatus] = useState('')
      const [error, setError] = useState('')
      const [result, setResult] = useState(null)
      const [picked, setPicked] = useState(null)
      const [zoom, setZoom] = useState(1)
      const [current, setCurrent] = useState(0)
      const fileRef = useRef(null)
      const pageNodes = useRef({})
      const panelRef = useRef(null)
      const pdfRef = useRef(null)
      const [size, setSize] = useState(readPanelSize)
      const [maxed, setMaxed] = useState(false)
      const [mode, setMode] = useState('single')
      const [allPages, setAllPages] = useState([])
      const [detailItems, setDetailItems] = useState([])
      const [solving, setSolving] = useState(false)
      const [bankItems, setBankItems] = useState([])
      const [bankCounts, setBankCounts] = useState({})
      const [bankTotal, setBankTotal] = useState(0)
      const [bankPath, setBankPath] = useState('')
      const [bankQuery, setBankQuery] = useState('')
      const [bankSubject, setBankSubject] = useState('')
      const [bankLoading, setBankLoading] = useState(false)
      const [subjectPick, setSubjectPick] = useState('')
      const [flash, setFlash] = useState('')

      useEffect(() => {
        // 启动时读一次题库，顶部按钮才能显示题量
        loadBank()
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      useEffect(() => {
        try {
          localStorage.setItem('exam-analyzer-size', JSON.stringify(size))
        } catch {
          /* ignore */
        }
      }, [size])

      const startResize = (axis) => (event) => {
        event.preventDefault()
        event.stopPropagation()
        const startX = event.clientX
        const startY = event.clientY
        const rect = panelRef.current
          ? panelRef.current.getBoundingClientRect()
          : { width: size.w, height: window.innerHeight - 60 }
        const startW = rect.width
        const startH = rect.height
        setMaxed(false)
        const move = (moveEvent) => {
          if (axis === 'x') {
            const next = clamp(startW + (startX - moveEvent.clientX), 560, window.innerWidth - 40)
            setSize((prev) => ({ ...prev, w: Math.round(next) }))
          } else {
            const next = clamp(startH + (moveEvent.clientY - startY), 320, window.innerHeight - 70)
            setSize((prev) => ({ ...prev, h: Math.round(next) }))
          }
        }
        const stop = () => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', stop)
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', stop)
      }

      const importPdf = async (file) => {
        if (!file) return
        setOpen(true)
        setError('')
        setResult(null)
        setPicked(null)
        // 换卷时把上一轮的整卷/分段结果一并清掉，否则右栏会残留旧 PDF 的答案
        setMode('single')
        setAllPages([])
        setDetailItems([])
        setStatus('正在解析 PDF…')
        try {
          const bytes = new Uint8Array(await file.arrayBuffer())
          const pdfjs = await loadPdfjs()
          const pdf = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise
          pdfRef.current = pdf
          const total = Math.min(pdf.numPages, 40)
          const pages = []
          for (let i = 1; i <= total; i += 1) {
            setStatus(`正在渲染第 ${i} / ${total} 页…`)
            const page = await pdf.getPage(i)
            const base = page.getViewport({ scale: 1 })
            const scale = Math.min(2, 1400 / base.width)
            const viewport = page.getViewport({ scale })
            const canvas = document.createElement('canvas')
            canvas.width = Math.round(viewport.width)
            canvas.height = Math.round(viewport.height)
            const context = canvas.getContext('2d')
            context.fillStyle = '#fff'
            context.fillRect(0, 0, canvas.width, canvas.height)
            await page.render({ canvasContext: context, viewport }).promise
            pages.push({
              index: pages.length,
              url: canvas.toDataURL('image/png'),
              width: canvas.width,
              height: canvas.height,
            })
          }
          setDoc({ name: file.name, pages })
          setCurrent(0)
        } catch (err) {
          setError(err.message || String(err))
        } finally {
          setStatus('')
        }
      }

      const analyze = async (page, box) => {
        setError('')
        setResult(null)
        setStatus('正在裁剪选区…')
        try {
          const dataUrl = await cropFromImage(page, box)
          setPicked({ pageIndex: page.index, dataUrl, box })
          setStatus('正在识别题目并整理知识点…')
          const res = await postJson('/api/exam-analyzer/analyze', {
            image: dataUrl,
            hint: `来自第 ${page.index + 1} 页`,
          })
          setResult(res.data)
        } catch (err) {
          setError(err.message || String(err))
        } finally {
          setStatus('')
        }
      }

      const retry = () => {
        if (!picked) return
        setStatus('正在重新识别…')
        setError('')
        postJson('/api/exam-analyzer/analyze', { image: picked.dataUrl })
          .then((res) => setResult(res.data))
          .catch((err) => setError(err.message || String(err)))
          .finally(() => setStatus(''))
      }

      /**
       * 在页面空白带处把一页切成 2-3 段（按墨迹投影找空白行），
       * 每段单独送模型 → 段内题目由模型逐条列出。比整页清楚，也不依赖模型给坐标。
       */
      const splitPageStrips = async (pageIndex, targetStrips) => {
        const pageUrl = await renderPageDataUrl(pageIndex, 2200)
        if (!pageUrl) return []
        const img = await new Promise((resolve, reject) => {
          const image = new Image()
          image.onload = () => resolve(image)
          image.onerror = () => reject(new Error('页面加载失败'))
          image.src = pageUrl
        })
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0)
        const { width, height } = canvas
        const gaps = []
        try {
          const data = ctx.getImageData(0, 0, width, height).data
          const inked = new Uint8Array(height)
          for (let y = 0; y < height; y += 2) {
            const base = y * width * 4
            let count = 0
            for (let x = 0; x < width; x += 4) {
              const i = base + x * 4
              if ((data[i] + data[i + 1] + data[i + 2]) / 3 < 150) count += 1
            }
            inked[y] = count >= 2 ? 1 : 0
          }
          let start = -1
          for (let y = 0; y < height; y += 1) {
            const ink = inked[y] === 1
            if (!ink && start < 0) start = y
            if (ink && start >= 0) {
              if (y - start >= 10) gaps.push({ y0: start, y1: y })
              start = -1
            }
          }
        } catch (error) {
          /* 读不到像素就退回整页 */
        }
        const cuts = [0]
        for (let k = 1; k < targetStrips; k += 1) {
          const targetY = (height * k) / targetStrips
          let best = null
          for (const gap of gaps) {
            const mid = (gap.y0 + gap.y1) / 2
            if (Math.abs(mid - targetY) > height * 0.08) continue
            if (best === null || Math.abs(mid - targetY) < Math.abs(best - targetY)) best = mid
          }
          if (best !== null) cuts.push(Math.round(best))
        }
        cuts.push(height)
        const strips = []
        for (let k = 0; k < cuts.length - 1; k += 1) {
          const top = Math.max(0, cuts[k] - 8)
          const bottom = Math.min(height, cuts[k + 1] + 8)
          if (bottom - top < height * 0.06) continue
          const strip = document.createElement('canvas')
          strip.width = width
          strip.height = bottom - top
          strip.getContext('2d').drawImage(canvas, 0, top, width, bottom - top, 0, 0, width, bottom - top)
          strips.push(strip.toDataURL('image/jpeg', 0.92))
        }
        return strips.length ? strips : [pageUrl]
      }

      const solveDetailed = async () => {
        if (!doc || solving) return
        setMode('detail')
        setSolving(true)
        setError('')
        setDetailItems([])
        const items = []
        const seen = new Set()
        try {
          for (const page of doc.pages) {
            setStatus(`第 ${page.index + 1} / ${doc.pages.length} 页：正在按空白带分段…`)
            let strips = []
            try {
              strips = await splitPageStrips(page.index, 3)
            } catch (err) {
              items.push({
                page: page.index + 1,
                no: '整页',
                answer: `（分段失败：${err.message || err}）`,
                subject: '',
              })
              setDetailItems([...items])
              continue
            }
            for (let k = 0; k < strips.length; k += 1) {
              setStatus(`第 ${page.index + 1} / ${doc.pages.length} 页 · 第 ${k + 1} / ${strips.length} 段…`)
              try {
                const res = await postJson('/api/exam-analyzer/solve-page', {
                  image: strips[k],
                  page: page.index + 1,
                })
                for (const q of res.data.questions || []) {
                  const key = `${page.index + 1}-${q.no}`
                  if (seen.has(key)) continue
                  seen.add(key)
                  items.push({
                    page: page.index + 1,
                    no: q.no || '',
                    answer: q.answer || '',
                    subject: '',
                  })
                }
              } catch (err) {
                items.push({
                  page: page.index + 1,
                  no: `第${k + 1}段`,
                  answer: `（失败：${err.message || err}）`,
                  subject: '',
                })
              }
              setDetailItems([...items])
            }
          }
        } finally {
          setStatus('')
          setSolving(false)
        }
      }

      const loadBank = async (opts = {}) => {
        const subject = opts.subject !== undefined ? opts.subject : bankSubject
        const keyword = opts.query !== undefined ? opts.query : bankQuery
        setBankLoading(true)
        try {
          const params = new URLSearchParams()
          if (subject) params.set('subject', subject)
          if (keyword) params.set('q', keyword)
          const res = await fetch(`/api/exam-analyzer/bank/list?${params.toString()}`)
          const json = await res.json()
          if (!json.ok) throw new Error(json.error || '读取题库失败')
          setBankItems(json.data.items || [])
          setBankCounts(json.data.counts || {})
          setBankTotal(json.data.total || 0)
          setBankPath(json.data.path || '')
        } catch (err) {
          setError(err.message || String(err))
        } finally {
          setBankLoading(false)
        }
      }

      const openBank = () => {
        setMode('bank')
        setError('')
        loadBank({ subject: bankSubject, query: bankQuery })
      }

      const saveToBank = async () => {
        if (!result || !result.question) return
        const subject = subjectPick || (BANK_SUBJECTS.includes(result.subject) ? result.subject : '其他')
        try {
          setFlash('正在提取题目中的图形…')
          const figures = picked?.dataUrl ? await extractFigures(picked.dataUrl) : []
          const json = await postJson('/api/exam-analyzer/bank/add', {
            subject,
            question: result.question,
            answer: result.answer || '',
            explanation: result.explanation || '',
            concepts: result.concepts || [],
            similar: result.similar || [],
            figure: result.figure || null,
            images: figures,
            source: { file: doc?.name || '', page: picked ? picked.pageIndex + 1 : 0 },
          })
          if (!json.ok) throw new Error(json.error || '存入失败')
          setFlash(
            json.data.duplicated
              ? '题库里已有这道题'
              : figures.length
                ? `已存入「${subject}」题库（含 ${figures.length} 张图）`
                : `已存入「${subject}」题库（此题无图形）`,
          )
          setTimeout(() => setFlash(''), 2400)
          loadBank()
        } catch (err) {
          setFlash(err.message || String(err))
          setTimeout(() => setFlash(''), 2600)
        }
      }

      const deleteBankItem = async (id) => {
        try {
          await postJson('/api/exam-analyzer/bank/delete', { id })
          loadBank()
        } catch (err) {
          setError(err.message || String(err))
        }
      }

      const loadImage = (src) =>
        new Promise((resolve, reject) => {
          const image = new Image()
          image.onload = () => resolve(image)
          image.onerror = () => reject(new Error('图片加载失败'))
          image.src = src
        })

      /** 让模型指出图形的方位，再按比例把那一块裁出来（只存图，不存整页）。 */
      const extractFigures = async (dataUrl) => {
        if (!dataUrl) return []
        try {
          const img = await loadImage(dataUrl)
          const res = await postJson('/api/exam-analyzer/locate-figure', { image: dataUrl })
          const rects = res?.data?.rects || []
          const out = []
          for (const rect of rects.slice(0, 3)) {
            const padX = img.naturalWidth * 0.01
            const padY = img.naturalHeight * 0.02
            const x0 = Math.max(0, (rect.x0 / 100) * img.naturalWidth - padX)
            const x1 = Math.min(img.naturalWidth, (rect.x1 / 100) * img.naturalWidth + padX)
            const y0 = Math.max(0, (rect.y0 / 100) * img.naturalHeight - padY)
            const y1 = Math.min(img.naturalHeight, (rect.y1 / 100) * img.naturalHeight + padY)
            if (x1 - x0 < 30 || y1 - y0 < 30) continue
            const canvas = document.createElement('canvas')
            canvas.width = Math.round(x1 - x0)
            canvas.height = Math.round(y1 - y0)
            const ctx = canvas.getContext('2d')
            ctx.fillStyle = '#fff'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(img, x0, y0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height)
            out.push(canvas.toDataURL('image/png'))
          }
          return out
        } catch {
          return []
        }
      }

      const solveAll = async () => {
        if (!doc || solving) return
        setMode('all')
        setSolving(true)
        setError('')
        setAllPages([])
        const collected = []
        try {
          for (const page of doc.pages) {
            setStatus(`正在识别第 ${page.index + 1} / ${doc.pages.length} 页（高清）…`)
            try {
              // 整页识别用更高分辨率重渲染，装置图/表格才看得清
              const hiRes = await renderPageDataUrl(page.index, 2200)
              const res = await postJson('/api/exam-analyzer/solve-page', {
                image: hiRes || page.url,
                page: page.index + 1,
              })
              collected.push({ page: page.index + 1, questions: res.data.questions || [] })
            } catch (err) {
              collected.push({ page: page.index + 1, questions: [], error: err.message || String(err) })
            }
            setAllPages([...collected])
          }
        } finally {
          setStatus('')
          setSolving(false)
        }
      }

      /** 按需用更高分辨率重渲染某一页，返回 JPEG data URL（比 PNG 小很多）。 */
      const renderPageDataUrl = async (pageIndex, targetWidth) => {
        const pdf = pdfRef.current
        if (!pdf) return null
        try {
          const page = await pdf.getPage(pageIndex + 1)
          const base = page.getViewport({ scale: 1 })
          const scale = Math.max(1, targetWidth / base.width)
          const viewport = page.getViewport({ scale })
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(viewport.width)
          canvas.height = Math.round(viewport.height)
          const context = canvas.getContext('2d')
          context.fillStyle = '#fff'
          context.fillRect(0, 0, canvas.width, canvas.height)
          await page.render({ canvasContext: context, viewport }).promise
          return canvas.toDataURL('image/jpeg', 0.92)
        } catch (error) {
          return null
        }
      }

      const goto = (index) => {
        const clamp = Math.max(0, Math.min((doc?.pages.length || 1) - 1, index))
        setCurrent(clamp)
        const node = pageNodes.current[clamp]
        if (node && node.scrollIntoView) node.scrollIntoView({ block: 'start', behavior: 'smooth' })
      }

      useEffect(() => {
        if (!open) return undefined
        const onKey = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [open])

      const launcher = e(
        'button',
        {
          type: 'button',
          onClick: () => {
            const next = !open
            setOpen(next)
            if (next && !doc) setTimeout(() => fileRef.current?.click(), 60)
          },
          style: {
            position: 'fixed',
            right: 20,
            bottom: 92,
            zIndex: 55,
            pointerEvents: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '9px 15px',
            borderRadius: 999,
            border: `1px solid ${T.border2}`,
            background: open ? T.brand : T.overlay,
            color: open ? '#fff' : T.text,
            boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
          },
          title: '打开试卷解析',
        },
        e('span', { style: { fontSize: 15 } }, '📄'),
        open ? '收起试卷' : '试卷解析',
      )

      const dropzone = e(
        'div',
        {
          onDragOver: (event) => event.preventDefault(),
          onDrop: (event) => {
            event.preventDefault()
            const file = event.dataTransfer?.files?.[0]
            if (file) importPdf(file)
          },
          onClick: () => fileRef.current?.click(),
          style: {
            margin: '6vh auto 0',
            maxWidth: 420,
            border: `2px dashed ${T.border2}`,
            borderRadius: 14,
            padding: '38px 20px',
            textAlign: 'center',
            color: T.sub,
            cursor: 'pointer',
            background: T.bg,
          },
        },
        e('div', { style: { fontSize: 34, marginBottom: 10 } }, '📄'),
        e('div', { style: { fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 6 } },
          '选择或拖入一份 PDF 试卷'),
        e('div', { style: { fontSize: 12, lineHeight: 1.8 } },
          '导入后左侧显示试卷原图，在题目上拖框即可得到答案与知识点。'),
      )

      const pages = doc
        ? doc.pages.map((page) =>
            e(Page, {
              key: page.index,
              page,
              zoom,
              selected:
                picked && picked.pageIndex === page.index && picked.box ? picked.box : null,
              onPick: (p, box) => {
                analyze(p, box)
              },
              onVisible: (p, node) => {
                pageNodes.current[p.index] = node
              },
            }),
          )
        : null

      const body = e(
        'div',
        { style: { display: 'flex', flex: 1, minHeight: 0 } },
        e(
          'div',
          { style: S.viewer },
          e(
            'div',
            { style: S.toolbar },
            e('span', { style: { fontSize: 12, color: T.sub } },
              doc ? `第 ${current + 1} / ${doc.pages.length} 页` : '未导入'),
            e('button', { style: S.btn, onClick: () => goto(current - 1), disabled: !doc }, '上一页'),
            e('button', { style: S.btn, onClick: () => goto(current + 1), disabled: !doc }, '下一页'),
            e('span', { style: { width: 1, height: 18, background: T.border, margin: '0 2px' } }),
            e('button', { style: S.btn, onClick: () => setZoom(1) }, '适应宽度'),
            e('button', { style: S.btn, onClick: () => setZoom(1.5) }, '放大'),
            e('span', { style: { fontSize: 11.5, color: T.sub, marginLeft: 'auto' } },
              doc ? '按住鼠标在题目上拖出方框' : ''),
          ),
          e('div', { style: S.scroll }, doc ? pages : dropzone),
        ),
        e(
          'aside',
          { style: S.rail },
          e(Rail, {
            status: mode === 'all' && solving ? status : mode === 'all' ? '' : status,
            error,
            result,
            picked,
            pageCount: doc ? doc.pages.length : 0,
            mode,
            allPages,
            detailItems,
            solving,
            onBack: () => setMode('single'),
            onSolveAll: solveAll,
            onSolveDetailed: solveDetailed,
            subject: subjectPick,
            onSubjectChange: setSubjectPick,
            onSave: saveToBank,
            flash,
            bankItems,
            bankCounts,
            bankTotal,
            bankPath,
            bankQuery,
            bankSubject,
            bankLoading,
            onBankQuery: setBankQuery,
            onBankSubject: setBankSubject,
            onBankDelete: deleteBankItem,
            onBankReload: loadBank,
            onRetry: retry,
            onClear: () => {
              setResult(null)
              setPicked(null)
              setError('')
              setMode('single')
              setAllPages([])
              setDetailItems([])
            },
          }),
        ),
      )

      return e(
        React.Fragment,
        null,
        e('input', {
          ref: fileRef,
          type: 'file',
          accept: 'application/pdf,.pdf',
          'data-exam-pdf': '1',
          style: { display: 'none' },
          onChange: (event) => {
            const file = event.target.files && event.target.files[0]
            event.target.value = ''
            if (file) importPdf(file)
          },
        }),
        launcher,
        open
          ? e(
              'div',
              {
                ref: panelRef,
                style: maxed
                  ? { ...S.panel, top: 46, left: 12, right: 12, bottom: 12, width: 'auto', height: 'auto' }
                  : {
                      ...S.panel,
                      top: 46,
                      right: 12,
                      width: size.w,
                      ...(size.h ? { height: size.h, bottom: 'auto' } : { bottom: 12 }),
                    },
              },
              e('div', {
                onPointerDown: startResize('x'),
                style: {
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 6,
                  cursor: 'col-resize',
                  zIndex: 3,
                },
                title: '拖动改变宽度',
              }),
              e('div', {
                onPointerDown: startResize('y'),
                style: {
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 6,
                  cursor: 'row-resize',
                  zIndex: 3,
                },
                title: '拖动改变高度',
              }),
              e(
                'div',
                { style: { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0 } },
                e(
                  'div',
                  { style: S.header },
                  e('span', { style: { fontSize: 16 } }, '📄'),
                  e('span', { style: { fontWeight: 700, fontSize: 13.5 } }, doc ? doc.name : '试卷解析'),
                  doc
                    ? e('span', { style: { fontSize: 11.5, color: T.sub } }, `${doc.pages.length} 页`)
                    : null,
                  e('span', { style: { marginLeft: 'auto' } }),
                  e(
                    'button',
                    {
                      style: { ...S.btnPrimary, opacity: doc ? 1 : 0.45, cursor: doc ? 'pointer' : 'default' },
                      onClick: solveAll,
                      disabled: !doc || solving,
                      title: '逐页识别并列出全卷答案',
                    },
                    solving && mode === 'all' ? '识别中…' : '全部答案',
                  ),
                  e(
                    'button',
                    {
                      style: { ...S.btn, borderColor: T.brand, color: T.brand },
                      onClick: openBank,
                      title: '查看已存入的题目（按学科分类）',
                    },
                    `题库${bankTotal ? ` ${bankTotal}` : ''}`,
                  ),
                  e('button', { style: S.btn, onClick: () => fileRef.current?.click() }, '换一份 PDF'),
                  e(
                    'button',
                    { style: S.btn, onClick: () => setMaxed((v) => !v), title: '最大化 / 还原' },
                    maxed ? '还原' : '最大化',
                  ),
                  e('button', { style: S.btn, onClick: () => setOpen(false) }, '关闭'),
                ),
                body,
              ),
            )
          : null,
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'exam-analyzer', order: 80, label: '试卷解析' },
            Root,
          ),
        )
      },
    }
  },
})
