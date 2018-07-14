const cmds = {
  ADD: [0b0000, 'RS', 'RD'],
  AND: [0b0001, 'RS', 'RD'],
  IN: [0b0010, '**', 'RD', 'P'],
  OUT: [0b0011, 'RS', '**', 'P'],
  MOV: [0b0100, 'RS', 'RD'],
  HLT: [0b0101, '**', '**'],
  LDI: [0b0110, '**', 'RD', 'D'],
  // INC: [0b0111, '**', 'RD'],
  SHR: [0b1000, '**', 'RD'],
  CMPE: [0b1001, 'RS', 'RD'],
  MODU: [0b1010, 'RS', 'RD'],
  MUL: [0b1011, 'RS', 'RD'],
  LDA: [0b1100, 'M', 'RD', 'D'],
  JS: [0b1101, 'M', '**', 'D'],
  JMP: [0b1110, 'M', '**', 'D'],
  STA: [0b1111, 'M', 'RD', 'D'],
}

const parseHex = hex => {
  if (/\d+H/.test(hex)) return parseInt(hex.slice(0, -1), 16)
  return Number(hex)
}
const parseR = t => {
  if (t[0] === 'R' && t.length === 2) return Number(t[1])
}

const defaultInstructionSet = cmds
const defaultInstructionSetMircoPrograms = {
}
const defaultAddressingMode = [/([^\[].*[^\]])/]
class TextComplier {
  constructor(opt = {}) {
    this.binary = ('binary' in opt) ? opt.binary : true
    this.raw = ('raw' in opt) ? opt.raw : true
    this.instructionSet = opt.instructionSet || defaultInstructionSet
    this.addressingMode = opt.addressingMode || defaultAddressingMode
  }

  execute(text) {
    return this.complie(text)
  }

  err(lineNumber, msg, probableReason = '', line = 2) {
    if (!this.complingCode) return
    let nearLines = []
    const startIndex = lineNumber - 2 > -1 ? lineNumber - 3 : 0
    const endIndex = lineNumber + 2 < this.complingCode.length ? lineNumber + 2 : this.complingCode.length - 1
    for (let i = startIndex; i < endIndex; i += 1) {
      nearLines.push(this.complingCode[i])
    }
    this.complingCode = null
    const code = nearLines.map(line => {
      return (lineNumber === line.line ? '>' : ' ') + `${line.line.toString().padStart(4)} | ${line.content}`
    }).join('\n')
    if (probableReason) msg = code + '\nprobable reason: ' + probableReason
    else msg = code + '\n' + msg
    throw new Error('\n' + msg)
  }

  complie(text) {
    const code = text.toUpperCase().split('\n')
    const lines = this.complingCode = code.map((content, line) => ({content, line: line + 1}))
    const filtered = lines.filter(i => i.content.replace(/;.*/ig, '').trim())
    const handled = filtered.map(line => this.handleLine(line))
    const solved = this.solve(handled)
    let data = solved.map((i, j) => {
      let tmp = `$P ${j.toString(16).padStart(2, '0')} ${i.v.toString(16).padStart(2, '0')}`
      if (this.binary || this.raw) tmp += ' ; '
      if (this.binary) tmp += ` ${j.toString(2).padStart(8, '0')} ${i.v.toString(2).padStart(8, '0')}`
      if (this.raw) tmp += ` ${i.raw}`
      return tmp
    }).join('\n')
    return data
  }

  handleLine(line) {
    const words = line.content.split(/[ ,]/).filter(i => i.trim())
    if (words[0].endsWith(':')) line.tag = words.shift().slice(0, -1)
    if (words.length === 0) return line
    const cmd = words.shift()
    line.cmd = cmd
    if (!(cmd in this.instructionSet)) this.err(line.line, `wrong instructio: ${cmd}`)
    const cmdFmt = this.instructionSet[cmd]
    const params = cmdFmt.slice(1).filter(i => i !== '**' && i !== 'M')
    if (params.length !== words.length) this.err(line.line, `couldn\'t understand instruction format: ${cmd}: ${cmdFmt.join(',')}`)
    if (cmdFmt.length === 4) {
      const address = words.pop()
      if (cmdFmt[3] === 'D' || cmdFmt[3] === 'P') {
        if (Number.isNaN(parseHex(address))) {
          line.d = {type: 'tag', value: address}
        } else {
          line.d = {type: 'value', value: parseHex(address)}
        }
      } else this.err(line.line, `couldn\'t understand instruction format: ${cmd}: ${cmdFmt.join(',')}`)
    }
    if (cmdFmt[1] === 'RS') {
      const RS = words.pop()
      if (RS[0] === 'R' && RS.length === 2) line.src = Number(RS[1])
      else this.err(line.line, 'RS part format wrong')
      if (line.src < 0 || line.src > 3) this.err(line.line, 'RS number wrong')
    }
    if (cmdFmt[2] === 'RD') {
      const RD = words.pop()
      if (RD[0] === 'R' && RD.length === 2) line.dst = Number(RD[1])
      else this.err(line.line, 'RD part format wrong')
      if (line.dst < 0 || line.dst > 3) this.err(line.line, 'RD number wrong')
    }
    if (words.length !== 0) this.err(line.line, 'unknown error')
    return line
  }

  solve(d) {
    const bin = []
    let executeLine = 0
    d.map(line => {
      if (line.cmd) {
        line.e = executeLine
        executeLine += line.d ? 2 : 1
      }
      return line
    }).map(line => {
      if ('e' in line) return line
      if (line.tag) line.e = d.reduce((r, i) => {
        if (r == undefined && ('e' in i)) return i.e
      })
    }).filter(line => {
      return 'e' in line
    }).map(line => {
      if (line.cmd) {
        const t = {raw: line.content}
        const v = this.instructionSet[line.cmd].map((i, j) => {
          if (j === 0) return i.toString(2).padStart(4, '0')
          if (i === '**') return '00'
          if (i === 'M') return '00'
          if (i === 'RS') return line.src.toString(2).padStart(2, '0')
          if (i === 'RD') return line.dst.toString(2).padStart(2, '0')
          return ''
        })
        t.v = parseInt(v.join(''), 2)
        bin.push(t)
      }
      if (line.d) {
        const t = {raw: ''}
        if (line.d.type === 'value') t.v = line.d.value
        for (const i of d) {
          if (i.tag === line.d.value) {
            t.v = i.e
            break
          }
        }
        if (!('v' in t)) this.err(line.line, `undefined tag: ${line.d.value}`)
        bin.push(t)
      }
    })
    return bin
  }
}
