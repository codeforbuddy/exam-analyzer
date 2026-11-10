/**
 * Exam lens — Host half.
 *
 * The browser renders the PDF itself (pdf.js, served from this package), so this
 * half only has to:
 *  1. hand the browser the pdf.js module + worker, and
 *  2. turn one cropped selection into question text, concepts, a worked solution
 *     and a set of similar questions.
 */
import { readFileSync } from 'node:fs'
import { readFile, mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const inject = ['webServer']

/* ---------- 本地题库 ---------- */

const BANK_DIR = join(homedir(), '.dsh', 'exam-analyzer')
const BANK_FILE = join(BANK_DIR, 'question-bank.json')
const BANK_IMAGE_DIR = join(BANK_DIR, 'images')
const BANK_SUBJECTS = ['数学', '物理', '化学', '生物', '语文', '英语', '道法', '历史', '地理', '其他']

/** 把 data URL 形式的截图存成文件，返回文件名；失败返回 null。 */
async function saveBankImage(id, dataUrl) {
  const match = /^data:(image\/[a-z+]+);base64,([\s\S]+)$/i.exec(String(dataUrl || ''))
  if (!match) return null
  const ext = match[1].toLowerCase() === 'image/jpeg' ? 'jpg' : match[1].toLowerCase() === 'image/webp' ? 'webp' : 'png'
  const file = `${id}.${ext}`
  try {
    await mkdir(BANK_IMAGE_DIR, { recursive: true })
    await writeFile(join(BANK_IMAGE_DIR, file), Buffer.from(match[2], 'base64'))
    return file
  } catch {
    return null
  }
}

async function readBank() {
  try {
    const raw = await readFile(BANK_FILE, 'utf8')
    const data = JSON.parse(raw)
    if (data && Array.isArray(data.items)) return data
  } catch {
    /* 首次运行为空题库 */
  }
  return { version: 1, items: [] }
}

async function writeBank(bank) {
  await mkdir(BANK_DIR, { recursive: true })
  // 先写临时文件再原子替换，避免写一半崩溃把题库写坏
  const tmp = `${BANK_FILE}.tmp`
  await writeFile(tmp, `${JSON.stringify(bank, null, 2)}\n`, 'utf8')
  await rename(tmp, BANK_FILE)
}

let bankQueue = Promise.resolve()
/** 题库的读-改-写串行化，避免并发请求互相覆盖。 */
function withBank(task) {
  const run = bankQueue.then(task, task)
  bankQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function bankId(subject, question) {
  let hash = 5381
  const text = `${subject}::${question}`
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0
  return `${Date.now().toString(36)}-${hash.toString(36)}`
}


const ROUTE = '/api/exam-analyzer'
const here = dirname(fileURLToPath(import.meta.url))

const VENDOR = {
  '/vendor/pdf.mjs': {
    file: join(here, 'vendor/pdf.min.mjs'),
    type: 'text/javascript; charset=utf-8',
  },
  '/vendor/pdf.worker.mjs': {
    file: join(here, 'vendor/pdf.worker.min.mjs'),
    type: 'text/javascript; charset=utf-8',
  },
}

const SYSTEM_PROMPT = [
  '你是一位资深的初中理科教研员（数学、物理、化学都教），擅长把题目拆解为知识点、并据此命题。',
  '所有公式使用纯文本 + Unicode 符号（如 x²、√、≤、＝、→、↑、↓、Δ、MnO₂ 的下标）。',
].join('\n')

const JSON_RULE = '只输出一个严格合法的 JSON 对象：不要 Markdown 代码块、不要注释、不要任何解释文字。'

const OCR_PROMPT = [
  '把图片里被框选的这一道题**原样转录**成纯文本，供后续分析使用。',
  '',
  '要求：',
  '1. 保留题干、全部选项、已知条件、图形上的标注；',
  '2. 数学符号用 Unicode 纯文本（x²、√3、±、≤、∠ABC、△ABC、⊥、∥）；',
  '3. **遇到图形、表格、标志、装置图、电路图等，用一句话描述它在选项/题中的位置和作用**',
  '   （例如：“A/B/C/D 四个选项各是一个汽车标志图形”），不要直接跳过；',
  '4. 只输出转录的文字本身，不要分析、不要解答、不要加代码块或引号；',
  '5. 如果框里有多道题，只转录最完整的那一道。',
].join('\n')

function userPrompt(extra, compact, transcript) {
  return [
    '请分析下面这道**初中理科**题目（数学 / 物理 / 化学，先判断学科），并按指定 JSON 结构输出。',
    '',
    '输出 JSON 结构：',
    '{',
    '  "subject": "数学 | 物理 | 化学",',
    '  "question": "题干（直接使用给出的题目原文，可精简排版，保留选项与图表条件）",',
    '  "answer": "最终答案（选择题写选项与结论，填空题写结果，计算题写关键结果）",',
    compact
      ? '  "explanation": "分步解析，2-3 步，每步一句话"'
      : '  "explanation": "分步解析，3-5 步，写清关键方法与易错点"',
    '  "concepts": [{"name": "知识点名称", "detail": "该知识点在本题中的具体作用（一句话）"}],',
    '  "related": [{"name": "可迁移的相关知识点", "detail": "为什么相关、如何联系"}],',
    '  "figure": "原题不需要重画（界面已显示原图截图），这里写 null",',
    '  "similar": [{"question": "完整的相似题题干（含全部选项）", "answer": "该题答案", "concepts": ["涉及知识点"], "figure": "该相似题的内联 SVG 示意图；确实不需要图形时写 null"}]',
    '}',
    '',
    '要求：',
    '1. **按学科作答**：化学题用化学用语（化学式、化学方程式要配平并标注条件，如 2KClO₃ —MnO₂/Δ→ 2KCl + 3O₂↑），',
    '   物理题注意单位与公式，数学题注意推理步骤；不要因为不是数学题就拒绝作答；',
    '2. concepts 列 3-5 个本题直接涉及的知识点，按主次排序；',
    '3. related 列 2-3 个相邻/可迁移知识点（同一知识块内、易混或可延伸的）；',
    compact
      ? '4. similar 生成 2 道相似题，每题都要给出答案；'
      : '4. similar 生成 3 道相似题，难度递进（同型巩固 → 变式），每题都要给出答案；',
    '5. **相似题必须是完整题目**：写全题干 + 全部选项（A/B/C/D 逐条列出）+ 已知条件，不能只给一句话或省略选项；',
    '6. **图形必须能被文字读出来**：如果原题或相似题依赖图形（几何图、车标/图标、装置图、电路图、函数图象），',
    '   题干里要用文字把图形描述清楚（每个选项画的是什么形状、怎么摆放、有哪些标注），',
    '   或者干脆改用同知识点但不依赖图形的题目；**绝对不允许出现只有 "A. B. C. D." 却没有任何描述的选项**；',
    '7. **相似题需要图形时给 SVG**：原题不重画（界面直接显示原图），只有 similar 里的题在依赖图形时才给 figure：',
    '   根元素写成 <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">，只用 line/circle/ellipse/rect/polygon/polyline/path/text 等基本图元，',
    '   黑色描边（stroke="#111" fill="none" 或 fill="#111"）、白色背景、文字 12px；不要 <image>、<script>、外部链接或 CSS 类；',
    '   **画图必须忠实于题干给出的几何关系**：AB=AC 就要画成等腰、∠BAC=120° 就要画成钝角、15° 角不能画成 45°、',
    '   点 D 在 BC 上就不能画到 BC 外；标注字母的位置要与题干描述一致；宁可少画细节，也不要画错关系；',
    '   实在画不准的复杂图形（多重旋转、辅助线密集），改用更简单的等价图形，或把该题换成不依赖图形的同知识点题；',
    '   **相似题只要依赖图形，figure 必须给出 SVG**（例如抛物线题给出坐标系与抛物线、对称题给出四个小图形），',
    '   只写文字描述不算完成；若某道相似题确实不需要图形，就换一道不需要图形的同知识点题，不要留空的 figure；',
    '8. **符号规范**：根号写作 √、分数写作 (3+√13)/2、平方写作 x²、下标写作 H₂O/Fe₂O₃，不要用 ✓ 代替 √；',
    '9. 语言精炼，整段 JSON 不超过 3600 字。',
    JSON_RULE,
    transcript ? `\n【题目文字（转录，仅用于核对措辞；图形、表格、标志一律以图片为准）】\n${transcript}` : '',
    extra ? `\n补充信息：${extra}` : '',
  ].join('\n')
}

const SOLVE_PAGE_PROMPT = [
  '这是初中理科试卷（数学 / 物理 / 化学）的一页。请把这一页上的**每一道题**都列出来，只给答案，不要解析。',
  '',
  '输出 JSON：',
  '{"questions":[{"no":"题号（如 3 或 14(2)）","stem":"题干前 30 字摘要","answer":"答案"}]}',
  '',
  '要求：',
  '1. 按页面从上到下、从左到右的顺序；',
  '2. 答案要具体：选择题写“选项 + 结论”，填空题写结果，计算题写关键结果（化学要写配平后的方程式或数值）；',
  '3. 看不清或页面没有答案依据的题，仍列出题号并写“（未能识别）”，不要跳过；',
  '4. 根号写作 √，平方写作 x²，化学式用下标（H₂O），不要用 ✓；',
  '5. 只输出 JSON，不要任何解释文字。',
].join('\n')

const LOCATE_FIGURE_PROMPT = [
  '这是一道初中理科题（数学/物理/化学）的截图。任务：找出**图形**（几何图、函数图象、装置图、电路图、',
  '统计图、表格、标志、照片等）在图中的大致方位。',
  '',
  '只输出一行 JSON：{"areas":["lower"]}',
  'areas 里可以放 1–3 个词，取值只能是：',
  '"top"（上部）、"bottom"（下部）、"left"（左半）、"right"（右半）、',
  '"top-left"、"top-right"、"bottom-left"、"bottom-right"、"whole"（整张图都是图形）。',
  '',
  '判断规则：',
  '1. 图形在哪就选哪，不要因为题干文字多就选 whole；',
  '2. 纯文字题、只有文字选项的题，输出 {"areas":[]}；',
  '3. 宁可框大一点，也不要把图形切掉；',
  '4. 只输出 JSON。',
].join('\n')

const AREA_RECTS = {
  top: { x0: 0, x1: 100, y0: 0, y1: 55 },
  bottom: { x0: 0, x1: 100, y0: 45, y1: 100 },
  left: { x0: 0, x1: 60, y0: 0, y1: 100 },
  right: { x0: 40, x1: 100, y0: 0, y1: 100 },
  'top-left': { x0: 0, x1: 60, y0: 0, y1: 55 },
  'top-right': { x0: 40, x1: 100, y0: 0, y1: 55 },
  'bottom-left': { x0: 0, x1: 60, y0: 45, y1: 100 },
  'bottom-right': { x0: 40, x1: 100, y0: 45, y1: 100 },
  whole: { x0: 0, x1: 100, y0: 0, y1: 100 },
}

/** 修掉模型把 “√” 写成 “✓” 的情况，并压掉 √ 后多余空格。 */
function sanitizeMath(text) {
  if (typeof text !== 'string') return text
  return text
    .replace(/✓(?=\s*[\d(√a-zA-Z])/g, '√')
    .replace(/√\s+(?=\d)/g, '√')
}

/** 只保留最基本的、安全的 SVG 子集，防止模型输出里混进脚本/外链。 */
function sanitizeSvg(value) {
  if (typeof value !== 'string') return null
  let svg = value.trim()
  if (!/^<svg[\s>]/i.test(svg)) return null
  if (svg.length > 6000) svg = svg.slice(0, 6000)
  svg = svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<image[\s\S]*?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/(href|xlink:href)\s*=\s*("|')\s*(javascript:|https?:)[^"']*\2/gi, '')
  if (!/<\/svg>/i.test(svg)) return null
  return svg
}

function sanitizeResult(data) {
  const fix = (value) => sanitizeMath(value)
  return {
    ...data,
    question: fix(data.question),
    answer: fix(data.answer),
    explanation: fix(data.explanation),
    figure: sanitizeSvg(data.figure),
    concepts: (data.concepts || []).map((item) => ({ ...item, name: fix(item.name), detail: fix(item.detail) })),
    related: (data.related || []).map((item) => ({ ...item, name: fix(item.name), detail: fix(item.detail) })),
    similar: (data.similar || []).map((item) => ({
      ...item,
      question: fix(item.question),
      answer: fix(item.answer),
      figure: sanitizeSvg(item.figure),
    })),
  }
}

/* ------------------------------------------------------------------ */
/* Tolerant JSON parsing                                                */
/* ------------------------------------------------------------------ */

/** Append the quote/brackets a truncated JSON body is missing. */
function closeJson(text) {
  let out = ''
  const stack = []
  let inString = false
  let escaped = false
  for (const ch of text) {
    out += ch
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{' || ch === '[') stack.push(ch)
    else if (ch === '}' || ch === ']') stack.pop()
  }
  if (inString) out += '"'
  while (stack.length) out += stack.pop() === '{' ? '}' : ']'
  return out
}

/** Index of the last comma that is not inside a JSON string. */
function lastCommaOutsideString(text) {
  let inString = false
  let escaped = false
  let last = -1
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === ',') last = i
  }
  return last
}

function parseJsonLoose(text) {
  if (!text) return null
  const cleaned = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim()
  const start = cleaned.indexOf('{')
  if (start < 0) return null
  let body = cleaned.slice(start).replace(/```[\s\S]*$/, '')
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const parsed = JSON.parse(closeJson(body))
      const usable =
        parsed &&
        typeof parsed === 'object' &&
        (parsed.question ||
          parsed.answer ||
          parsed.concepts ||
          Array.isArray(parsed.questions) ||
          Array.isArray(parsed.areas) ||
          Array.isArray(parsed.figures))
      if (usable) return parsed
      return null
    } catch {
      /* keep trimming */
    }
    const cut = lastCommaOutsideString(body)
    if (cut < 0) return null
    body = body.slice(0, cut)
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Plugin                                                               */
/* ------------------------------------------------------------------ */

const IMAGE_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

/** 从 data URL 里取媒体类型，默认 png。 */
function mediaTypeOf(dataUrl) {
  const match = /^data:(image\/[a-z+]+);base64,/i.exec(typeof dataUrl === 'string' ? dataUrl : '')
  const type = match ? match[1].toLowerCase() : 'image/png'
  return IMAGE_MEDIA_TYPES.has(type) ? type : 'image/png'
}

export function apply(ctx, config) {
  const assetCache = new Map()

  function pickRoute() {
    try {
      const selection = ctx.get('agentDefaultModel')?.currentSelection?.()
      if (selection && selection.provider && selection.model) {
        return { provider: selection.provider, model: selection.model }
      }
    } catch {
      /* ignore */
    }
    if (config && config.provider && config.model) {
      return { provider: config.provider, model: config.model }
    }
    return null
  }

  function makeCollector(route, llm) {
    return async (content, maxTokens, temperature, reasoningEffort) => {
      let text = ''
      let finish
      const stream = llm.stream({
        provider: route.provider,
        model: route.model,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content }],
        temperature,
        maxTokens,
        reasoningEffort,
      })
      for await (const chunk of stream) {
        if (chunk.type === 'text-delta') text += chunk.text
        else if (chunk.type === 'finish') finish = chunk.reason
      }
      if (finish && (finish.kind === 'error' || finish.kind === 'aborted')) {
        const failure = new Error(finish.failure?.message || '模型调用失败')
        failure.code = finish.failure?.code
        throw failure
      }
      return { text, finishKind: finish ? finish.kind : 'unknown' }
    }
  }

  async function solvePage(imageBytes, pageNo, mediaType = 'image/png') {
    const attachments = ctx.get('attachments')
    const llm = ctx.get('llm')
    if (!attachments || !llm) throw new Error('模型或附件服务不可用')
    const route = pickRoute()
    if (!route) throw new Error('没有可用的模型，请先在设置里选择模型')
    const ref = await attachments.saveImage({
      data: imageBytes,
      mediaType,
      name: `exam-page-${pageNo}.png`,
    })
    const collect = makeCollector(route, llm)
    let best = null
    for (const plan of [
      { maxTokens: 4000, effort: 'low' },
      { maxTokens: 2000, effort: 'off' },
    ]) {
      try {
        const result = await collect(
          [
            { type: 'image', attachment: ref },
            { type: 'text', text: SOLVE_PAGE_PROMPT },
          ],
          plan.maxTokens,
          0.1,
          plan.effort,
        )
        const parsed = parseJsonLoose(result.text)
        if (parsed && Array.isArray(parsed.questions) && parsed.questions.length) {
          best = parsed.questions
          if (result.finishKind !== 'max-tokens') break
        }
      } catch (error) {
        if (/不可用|调用失败|没有可用/.test(error?.message || '')) throw error
      }
    }
    if (!best) throw new Error('这一页没有识别出题目')
    return best.map((item) => ({
      no: sanitizeMath(String(item?.no ?? '')),
      stem: sanitizeMath(String(item?.stem ?? '')),
      answer: sanitizeMath(String(item?.answer ?? '')),
    }))
  }

  async function locateFigure(imageBytes, pageNo, mediaType = 'image/png') {
    const attachments = ctx.get('attachments')
    const llm = ctx.get('llm')
    if (!attachments || !llm) throw new Error('模型或附件服务不可用')
    const route = pickRoute()
    if (!route) throw new Error('没有可用的模型，请先在设置里选择模型')
    const ref = await attachments.saveImage({
      data: imageBytes,
      mediaType,
      name: `exam-locate-${pageNo}.jpg`,
    })
    const collect = makeCollector(route, llm)
    const result = await collect(
      [
        { type: 'image', attachment: ref },
        { type: 'text', text: LOCATE_FIGURE_PROMPT },
      ],
      900,
      0.1,
      'low',
    )
    let parsed = null
    try {
      parsed = JSON.parse(String(result.text || '').trim())
    } catch {
      parsed = parseJsonLoose(result.text)
    }
    const areas = Array.isArray(parsed?.areas) ? parsed.areas : []
    const rects = []
    for (const raw of areas.slice(0, 3)) {
      const key = String(raw || '').toLowerCase().trim()
      const rect = AREA_RECTS[key]
      if (rect && !rects.some((r) => r.x0 === rect.x0 && r.y0 === rect.y0 && r.x1 === rect.x1 && r.y1 === rect.y1)) {
        rects.push(rect)
      }
    }
    return { rects, raw: String(result.text || '').slice(0, 300) }
  }

  async function analyze(imageBytes, hint, mediaType = 'image/png') {
    const attachments = ctx.get('attachments')
    const llm = ctx.get('llm')
    if (!attachments) throw new Error('附件服务不可用，无法把截图交给模型')
    if (!llm) throw new Error('模型服务不可用')
    const route = pickRoute()
    if (!route) throw new Error('没有可用的模型，请先在设置里选择模型')

    const ref = await attachments.saveImage({
      data: imageBytes,
      mediaType,
      name: 'exam-selection.png',
    })

    const collect = makeCollector(route, llm)

    // 1) 先把框选区域转录成文字：输出很短，几乎不会被截断。
    //    推理档位必须关掉——思考 token 也计入 maxTokens，开着会把答案挤没。
    let transcript = ''
    let ocrNote = ''
    for (const budget of [1200, 3000]) {
      try {
        const shot = await collect(
          [
            { type: 'image', attachment: ref },
            { type: 'text', text: OCR_PROMPT },
          ],
          budget,
          0.1,
          'off',
        )
        transcript = shot.text.replace(/^```[\s\S]*?\n/, '').replace(/```/g, '').trim()
        ocrNote = shot.finishKind === 'max-tokens' ? '转录被截断' : ''
        if (transcript.length > 2200) transcript = transcript.slice(0, 2200)
        if (transcript.length >= 15) break
      } catch (error) {
        ocrNote = error?.message || '转录失败'
      }
    }
    if (transcript.length < 15) {
      transcript = ''
      ocrNote = ocrNote || '转录内容过短'
    }

    // 2) 基于文字做分析（不再带图）。
    const asks = [
      { compact: false, maxTokens: 6000, effort: 'low' },
      { compact: true, maxTokens: 3200, effort: 'off' },
    ]

    let best = null
    let lastError = null
    for (const plan of asks) {
      try {
        // 关键：原图必须一起给模型——转录会丢图形（车标、装置图、几何图），
        // 文字只用来核对措辞，图形判断以图片为准。
        const content = [
          { type: 'image', attachment: ref },
          { type: 'text', text: userPrompt(hint, plan.compact, transcript) },
        ]
        const result = await collect(content, plan.maxTokens, plan.compact ? 0.1 : 0.3, plan.effort)
        const parsed = parseJsonLoose(result.text)
        if (parsed) {
          const score =
            (parsed.concepts ? parsed.concepts.length : 0) +
            (parsed.similar ? parsed.similar.length : 0) +
            (parsed.answer ? 3 : 0)
          if (!best || score > best.score) {
            best = { data: parsed, score, truncated: result.finishKind === 'max-tokens' }
          }
          if (result.finishKind !== 'max-tokens') break
        }
      } catch (error) {
        lastError = error
      }
    }

    if (!best) {
      if (lastError && /不可用|调用失败|没有可用|余额|quota|rate/i.test(lastError.message)) throw lastError
      throw new Error(
        `模型这次没给出可用的结果${ocrNote ? `（转录：${ocrNote}）` : ''}。请把框选范围缩小到一道题后再试。`,
      )
    }
    return { ...sanitizeResult(best.data), route, model: route.model, truncated: best.truncated, transcript }
  }

  ctx.effect(() => {
    const dispose = ctx.webServer.register({
      kind: 'prefix',
      path: ROUTE,
      handler: async (req, res) => {
        const url = new URL(req.url || ROUTE, 'http://localhost')
        const suffix = url.pathname.slice(ROUTE.length) || '/'
        const query = url.searchParams

        const sendJson = (payload, status = 200) => {
          const body = Buffer.from(JSON.stringify(payload), 'utf8')
          res.statusCode = status
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.setHeader('cache-control', 'no-store')
          res.setHeader('content-length', String(body.length))
          res.end(body)
        }

        try {
          const asset = VENDOR[suffix]
          if (asset) {
            if (req.method !== 'GET' && req.method !== 'HEAD') {
              return sendJson({ ok: false, error: 'GET only' }, 405)
            }
            let bytes = assetCache.get(suffix)
            if (!bytes) {
              bytes = readFileSync(asset.file)
              assetCache.set(suffix, bytes)
            }
            res.statusCode = 200
            res.setHeader('content-type', asset.type)
            res.setHeader('cache-control', 'private, max-age=3600')
            res.setHeader('content-length', String(bytes.length))
            return res.end(req.method === 'HEAD' ? undefined : bytes)
          }

          if (suffix === '/solve-page' && req.method === 'POST') {
            const body = JSON.parse((await readBody(req)).toString('utf8') || '{}')
            const dataUrl = typeof body?.image === 'string' ? body.image : ''
            const base64 = dataUrl.startsWith('data:') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl
            if (!base64) return sendJson({ ok: false, error: '缺少页面图片' }, 400)
            const questions = await solvePage(Buffer.from(base64, 'base64'), body?.page, mediaTypeOf(dataUrl))
            return sendJson({ ok: true, data: { questions } })
          }

          if (suffix === '/analyze' && req.method === 'POST') {
            const body = JSON.parse((await readBody(req)).toString('utf8') || '{}')
            const dataUrl = typeof body?.image === 'string' ? body.image : ''
            const base64 = dataUrl.startsWith('data:') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl
            if (!base64) return sendJson({ ok: false, error: '缺少框选图片' }, 400)
            const bytes = Buffer.from(base64, 'base64')
            if (!bytes.length) return sendJson({ ok: false, error: '框选图片为空' }, 400)
            const result = await analyze(bytes, body?.hint, mediaTypeOf(dataUrl))
            return sendJson({ ok: true, data: result })
          }

          if (suffix === '/health' && req.method === 'GET') {
            return sendJson({ ok: true, route: pickRoute() })
          }

          if (suffix === '/model' && req.method === 'GET') {
            const route = pickRoute()
            const llm = ctx.get('llm')
            if (!route || !llm) return sendJson({ ok: false, error: '没有可用模型' }, 400)
            try {
              const info = await llm.resolveModelInfo(route.provider, route.model)
              return sendJson({
                ok: true,
                route,
                inputModalities: info?.inputModalities,
                context: info?.context,
                reasoning: info?.reasoning,
              })
            } catch (error) {
              return sendJson({ ok: false, error: error?.message || String(error) }, 500)
            }
          }

          if (suffix === '/locate-figure' && req.method === 'POST') {
            const body = JSON.parse((await readBody(req)).toString('utf8') || '{}')
            const dataUrl = typeof body?.image === 'string' ? body.image : ''
            const base64 = dataUrl.startsWith('data:') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl
            if (!base64) return sendJson({ ok: false, error: '缺少图片' }, 400)
            const located = await locateFigure(Buffer.from(base64, 'base64'), body?.page, mediaTypeOf(dataUrl))
            return sendJson({
              ok: true,
              data: { rects: located.rects, ...(query.get('debug') ? { raw: located.raw } : {}) },
            })
          }

          if (suffix === '/bank/list' && req.method === 'GET') {
            const bank = await readBank()
            const subject = String(query.get('subject') || '').trim()
            const keyword = String(query.get('q') || '').trim().toLowerCase()
            const counts = {}
            for (const item of bank.items) {
              counts[item.subject] = (counts[item.subject] || 0) + 1
            }
            const items = bank.items
              .filter((item) => (!subject || item.subject === subject))
              .filter((item) => {
                if (!keyword) return true
                const hay = [item.question, item.answer, item.explanation, ...(item.concepts || []).map((c) => c.name)]
                  .join(' ')
                  .toLowerCase()
                return hay.includes(keyword)
              })
              .slice()
              .reverse()
            return sendJson({ ok: true, data: { items, counts, total: bank.items.length, subjects: BANK_SUBJECTS, path: BANK_FILE } })
          }

          if (suffix === '/bank/add' && req.method === 'POST') {
            const body = JSON.parse((await readBody(req)).toString('utf8') || '{}')
            const question = String(body?.question || '').trim()
            if (!question) return sendJson({ ok: false, error: '题目为空，无法存入题库' }, 400)
            const subject = BANK_SUBJECTS.includes(body?.subject) ? body.subject : '其他'
            const outcome = await withBank(async () => {
              const bank = await readBank()
              const existing = bank.items.find((item) => item.subject === subject && item.question === question)
              if (existing) {
                return { item: existing, duplicated: true, total: bank.items.length }
              }
              const item = {
                id: bankId(subject, question),
                subject,
                question,
                answer: String(body?.answer || ''),
                explanation: String(body?.explanation || ''),
                concepts: Array.isArray(body?.concepts) ? body.concepts.slice(0, 8) : [],
                similar: Array.isArray(body?.similar) ? body.similar.slice(0, 4) : [],
                figure: sanitizeSvg(body?.figure) || null,
                source: {
                  file: String(body?.source?.file || ''),
                  page: Number(body?.source?.page) || 0,
                },
                savedAt: new Date().toISOString(),
              }
              // 只存题目里的图形，不存整块截图
              const imageList = []
              const incoming = Array.isArray(body?.images) ? body.images.slice(0, 3) : []
              for (let i = 0; i < incoming.length; i += 1) {
                const file = await saveBankImage(`${item.id}-${i + 1}`, incoming[i])
                if (file) imageList.push({ file })
              }
              if (!imageList.length && body?.image) {
                const file = await saveBankImage(item.id, body.image)
                if (file) imageList.push({ file })
              }
              if (imageList.length) {
                item.images = imageList
                item.image = imageList[0].file
              }
              bank.items.push(item)
              await writeBank(bank)
              return { item, duplicated: false, total: bank.items.length }
            })
            return sendJson({ ok: true, data: outcome })
          }

          if (suffix === '/bank/image' && req.method === 'GET') {
            const id = String(query.get('id') || '')
            if (!/^[\w-]+$/.test(id)) return sendJson({ ok: false, error: 'bad id' }, 400)
            const bank = await readBank()
            const item = bank.items.find((entry) => entry.id === id)
            if (!item) return sendJson({ ok: false, error: 'not found' }, 404)
            const list = Array.isArray(item.images) && item.images.length
              ? item.images
              : item.image
                ? [{ file: item.image }]
                : []
            const index = Math.max(1, Number(query.get('i')) || 1)
            const entry = list[index - 1]
            if (!entry) return sendJson({ ok: false, error: 'not found' }, 404)
            try {
              const bytes = await readFile(join(BANK_IMAGE_DIR, entry.file))
              const ext = String(entry.file).split('.').pop().toLowerCase()
              res.statusCode = 200
              res.setHeader('content-type', ext === 'jpg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png')
              res.setHeader('cache-control', 'private, max-age=86400')
              res.end(bytes)
              return
            } catch {
              return sendJson({ ok: false, error: '图片文件已丢失' }, 404)
            }
          }

          if (suffix === '/bank/delete' && req.method === 'POST') {
            const body = JSON.parse((await readBody(req)).toString('utf8') || '{}')
            const outcome = await withBank(async () => {
              const bank = await readBank()
              const before = bank.items.length
              const removed = bank.items.filter((item) => item.id === body?.id)
              bank.items = bank.items.filter((item) => item.id !== body?.id)
              if (bank.items.length !== before) {
                await writeBank(bank)
                for (const item of removed) {
                  const files = Array.isArray(item.images) && item.images.length
                    ? item.images.map((entry) => entry.file)
                    : item.image
                      ? [item.image]
                      : []
                  for (const file of files) {
                    try {
                      await unlink(join(BANK_IMAGE_DIR, file))
                    } catch {
                      /* 图片可能已不存在 */
                    }
                  }
                }
              }
              return { removed: before - bank.items.length, total: bank.items.length }
            })
            return sendJson({ ok: true, data: outcome })
          }

          if (suffix === '/bank/update' && req.method === 'POST') {
            const body = JSON.parse((await readBody(req)).toString('utf8') || '{}')
            const bank = await readBank()
            const item = bank.items.find((entry) => entry.id === body?.id)
            if (!item) return sendJson({ ok: false, error: '题不存在' }, 404)
            if (BANK_SUBJECTS.includes(body?.subject)) item.subject = body.subject
            if (typeof body?.note === 'string') item.note = body.note.slice(0, 200)
            await writeBank(bank)
            return sendJson({ ok: true, data: { item } })
          }

          return sendJson({ ok: false, error: 'unknown endpoint' }, 404)
        } catch (error) {
          if (!res.headersSent) {
            sendJson({ ok: false, error: error?.message || String(error) }, 500)
          } else {
            try {
              res.end()
            } catch {
              /* ignore */
            }
          }
        }
      },
    })
    return () => {
      dispose()
      assetCache.clear()
    }
  })
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}
