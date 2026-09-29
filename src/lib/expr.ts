/** Arithmetic typed into a money field, like an Excel cell: 251550.08+54791.65, 4956*2, (59.34*55). No eval. */
export function evaluate(input: string): number | null {
  const src = input.replace(/[,\s฿]/g, '')
  if (!src) return null
  let i = 0
  const fail = () => { throw new Error('bad expression') }
  const atom = (): number => {
    if (src[i] === '(') {
      i++
      const v = sum()
      if (src[i++] !== ')') fail()
      return v
    }
    if (src[i] === '-') { i++; return -atom() }
    if (src[i] === '+') { i++; return atom() }
    const m = /^\d*\.?\d+/.exec(src.slice(i))
    if (!m) fail()
    i += m![0].length
    return Number(m![0])
  }
  const product = (): number => {
    let v = atom()
    while (src[i] === '*' || src[i] === '/' || src[i] === 'x') v = src[i++] === '/' ? v / atom() : v * atom()
    return v
  }
  const sum = (): number => {
    let v = product()
    while (src[i] === '+' || src[i] === '-') v = src[i++] === '+' ? v + product() : v - product()
    return v
  }
  try {
    const v = sum()
    return i === src.length && Number.isFinite(v) ? Math.round(v * 100) / 100 : null
  } catch {
    return null
  }
}

/** True when the text is a formula rather than a plain number (worth keeping as the cell's breakdown) */
export const isFormula = (input: string) => /\d[\s)]*[+\-*/x]\s*[\d(.]/.test(input.replace(/,/g, ''))
