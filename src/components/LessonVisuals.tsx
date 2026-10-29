import React, { useMemo } from 'react'
import type { VisualId } from '../help/lessons'
import { generateSampleIconCanvas } from '../utils/sampleImages'

// Animațiile lecțiilor: SVG desenat în funcție de t (0..1 = progresul scenei),
// ca Play/Pauză/derularea să funcționeze ca la un video.

const C = {
  wood: '#c99a64', woodDark: '#8a6440', woodLight: '#f0dcb8', bit: '#e8b44a', steel: '#c9ced6',
  text: '#e7e5e4', dim: '#a8a29e', accent: '#f59e0b', ok: '#34d399', bad: '#f87171', bg: '#0f0e0d'
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a))

const Label: React.FC<{ x: number; y: number; children: React.ReactNode; size?: number; color?: string; anchor?: 'start' | 'middle' | 'end'; opacity?: number }> = ({ x, y, children, size = 15, color = C.text, anchor = 'middle', opacity = 1 }) => (
  <text x={x} y={y} fontSize={size} fill={color} textAnchor={anchor} opacity={opacity} fontFamily="system-ui, sans-serif" fontWeight={600}>{children}</text>
)

function Pipeline({ t }: { t: number }) {
  const steps = ['Imagine', 'Relief 3D', 'Trasee', 'Simulare', 'Mașina']
  return (
    <g>
      {steps.map((s, i) => {
        const on = t * steps.length >= i
        const x = 20 + i * 124
        return (
          <g key={s} opacity={on ? 1 : 0.25}>
            <rect x={x} y={140} width={104} height={80} rx={12} fill={on ? '#3a2a12' : '#1c1a17'} stroke={on ? C.accent : '#3a352c'} strokeWidth={2} />
            <Label x={x + 52} y={186}>{s}</Label>
            <Label x={x + 52} y={128} size={13} color={C.dim}>{i + 1}</Label>
            {i < steps.length - 1 && <path d={`M${x + 106} 180 l14 0 m-6 -6 l6 6 l-6 6`} stroke={on ? C.accent : '#3a352c'} strokeWidth={2.5} fill="none" />}
          </g>
        )
      })}
    </g>
  )
}

function Heightmap({ t, icon }: { t: number; icon: string }) {
  const gray = seg(t, 0.15, 0.45)
  const curve = seg(t, 0.45, 0.95)
  const pts: string[] = []
  for (let k = 0; k <= 60; k++) {
    const u = k / 60
    const h = 0.25 + 0.55 * Math.exp(-((u - 0.5) ** 2) / 0.05) + 0.12 * Math.sin(u * 25) * Math.exp(-((u - 0.5) ** 2) / 0.02)
    pts.push(`${340 + u * 270},${300 - h * 120}`)
  }
  return (
    <g>
      <image href={icon} x={30} y={40} width={200} height={280} preserveAspectRatio="xMidYMid slice" />
      <image href={icon} x={30} y={40} width={200} height={280} preserveAspectRatio="xMidYMid slice" opacity={gray} style={{ filter: 'grayscale(1) contrast(1.2)' }} />
      <Label x={130} y={340} size={13} color={C.dim}>{gray > 0.5 ? 'luminos = sus · întunecat = jos' : 'imaginea ta'}</Label>
      <rect x={340} y={300} width={270} height={30} fill={C.woodDark} opacity={curve > 0 ? 1 : 0.2} />
      <polyline points={pts.join(' ')} fill="none" stroke={C.wood} strokeWidth={4} strokeDasharray={900} strokeDashoffset={900 * (1 - curve)} />
      <Label x={475} y={80} opacity={curve}>secțiune prin relief</Label>
      <path d="M260 180 l50 0 m-10 -8 l10 8 l-10 8" stroke={C.accent} strokeWidth={3} fill="none" opacity={curve} />
    </g>
  )
}

function Bits({ t }: { t: number }) {
  const bits = [
    { name: 'Dreaptă', use: 'degroșare', tip: (x: number) => `M${x - 18} 140 L${x - 18} 220 L${x + 18} 220 L${x + 18} 140 Z`, groove: (x: number) => `M${x - 18} 280 L${x - 18} 300 L${x + 18} 300 L${x + 18} 280` },
    { name: 'Sferică', use: 'finisare relief', tip: (x: number) => `M${x - 18} 140 L${x - 18} 202 A18 18 0 0 0 ${x + 18} 202 L${x + 18} 140 Z`, groove: (x: number) => `M${x - 18} 280 A18 18 0 0 0 ${x + 18} 280` },
    { name: 'V', use: 'linii, litere', tip: (x: number) => `M${x - 18} 140 L${x - 18} 180 L${x} 220 L${x + 18} 180 L${x + 18} 140 Z`, groove: (x: number) => `M${x - 18} 280 L${x} 300 L${x + 18} 280` }
  ]
  return (
    <g>
      {bits.map((b, i) => {
        const x = 130 + i * 190
        const a = seg(t, i * 0.28, i * 0.28 + 0.3)
        return (
          <g key={b.name} opacity={0.25 + 0.75 * a}>
            <rect x={x - 8} y={70} width={16} height={70} fill={C.steel} />
            <path d={b.tip(x)} fill={C.bit} transform={`translate(0 ${40 * (1 - a)})`} />
            <rect x={x - 70} y={280} width={140} height={40} fill={C.wood} />
            <path d={b.groove(x)} fill={C.bg} stroke={C.woodDark} strokeWidth={2} opacity={a} />
            <Label x={x} y={50}>{b.name}</Label>
            <Label x={x} y={345} size={13} color={C.dim}>{b.use}</Label>
          </g>
        )
      })}
    </g>
  )
}

function Stepover({ t }: { t: number }) {
  const R = 40, step = 28, n = Math.floor(t * 12)
  const passes = Array.from({ length: n }, (_, i) => 90 + i * step)
  const cx = 90 + Math.min(11, Math.floor(t * 12)) * step
  return (
    <g>
      <rect x={40} y={230} width={560} height={90} fill={C.wood} />
      {passes.map(x => <path key={x} d={`M${x - R} 230 A${R} ${R} 0 0 0 ${x + R} 230 Z`} fill={C.bg} />)}
      <rect x={cx - R} y={60} width={R * 2} height={130} fill={C.bit} opacity={0.9} />
      <circle cx={cx} cy={190} r={R} fill={C.bit} opacity={0.9} />
      {n > 2 && (
        <g>
          <path d={`M${90 + step} 245 l0 -50 M${90 + 2 * step} 245 l0 -50`} stroke={C.accent} strokeWidth={1.5} strokeDasharray="4 3" />
          <Label x={90 + 1.5 * step} y={185} size={13} color={C.accent}>pas lateral</Label>
        </g>
      )}
      <Label x={320} y={350} size={13} color={C.dim}>pas mic = creste mici între treceri = suprafață netedă</Label>
    </g>
  )
}

function Roughing({ t }: { t: number }) {
  const prof = (u: number) => 290 - 150 * Math.exp(-((u - 0.5) ** 2) / 0.06) - 25 * Math.sin(u * 9) ** 2
  const levels = [110, 160, 210, 255]
  const done = seg(t, 0, 0.6) * levels.length
  const fin = seg(t, 0.62, 1)
  const curve: string[] = []
  for (let k = 0; k <= 80; k++) curve.push(`${40 + (k / 80) * 560},${prof(k / 80)}`)
  return (
    <g>
      <rect x={40} y={90} width={560} height={240} fill={C.wood} />
      {levels.map((L, li) => {
        if (li >= done) return null
        // scoatem materialul de deasupra nivelului, cu adaos față de relief
        const parts: string[] = []
        for (let k = 0; k <= 80; k++) {
          const x = 40 + (k / 80) * 560
          const top = Math.max(90, Math.min(L, prof(k / 80) - 14))
          parts.push(`${x},${top}`)
        }
        return <polygon key={L} points={`40,90 ${parts.join(' ')} 600,90`} fill={C.bg} />
      })}
      {fin > 0 && <polygon points={`40,90 ${curve.slice(0, Math.max(2, Math.round(fin * 81))).join(' ')} ${40 + fin * 560},90`} fill={C.bg} />}
      <polyline points={curve.join(' ')} fill="none" stroke={C.woodLight} strokeWidth={2} strokeDasharray="6 4" opacity={0.7} />
      <Label x={320} y={60}>{fin > 0 ? 'finisare cu freza sferică' : 'degroșare în trepte cu freza dreaptă'}</Label>
      <Label x={320} y={355} size={13} color={C.dim}>linia punctată = relieful final · rămâne un adaos subțire pentru finisare</Label>
    </g>
  )
}

function Origin({ t }: { t: number }) {
  const corners = [[120, 300], [320, 180], [120, 60]]
  const names = ['stânga-jos', 'centru', 'stânga-sus']
  const k = Math.min(2, Math.floor(t * 3))
  const [x, y] = corners[k]
  return (
    <g>
      <rect x={120} y={60} width={400} height={240} fill={C.wood} stroke={C.woodDark} strokeWidth={3} />
      {corners.map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r={7} fill={i === k ? C.accent : '#57534e'} />)}
      <path d={`M${x} ${y} l70 0 m-10 -7 l10 7 l-10 7`} stroke={C.ok} strokeWidth={3} fill="none" />
      <path d={`M${x} ${y} l0 -70 m-7 10 l7 -10 l7 10`} stroke={C.bad} strokeWidth={3} fill="none" />
      <Label x={x + 85} y={y + 5} size={14} color={C.ok} anchor="start">X</Label>
      <Label x={x - 12} y={y - 75} size={14} color={C.bad}>Y</Label>
      <circle cx={x} cy={y} r={18} fill="none" stroke={C.accent} strokeWidth={2} />
      <Label x={320} y={345}>{`X0 Y0 = ${names[k]}`}</Label>
    </g>
  )
}

function ZeroZ({ t }: { t: number }) {
  const down = seg(t, 0, 0.7)
  const tipY = 80 + 135 * down
  const touched = t > 0.7
  return (
    <g>
      <rect x={120} y={225} width={400} height={95} fill={C.wood} />
      <rect x={250} y={219} width={180} height={6} fill="#f5f5f4" />
      <rect x={302} y={tipY - 140} width={36} height={110} fill={C.steel} />
      <path d={`M302 ${tipY - 30} L302 ${tipY - 18} A18 18 0 0 0 338 ${tipY - 18} L338 ${tipY - 30} Z`} fill={C.bit} transform="translate(0 18)" />
      <Label x={540} y={225} size={13} color={C.dim} anchor="start">hârtie</Label>
      {touched && <Label x={320} y={60} color={C.ok}>hârtia abia se mai trage → Setează Doar Zero Z</Label>}
      {!touched && <Label x={320} y={60} color={C.dim}>coboară cu pas de 0,1 mm</Label>}
      {touched && <path d="M140 219 L500 219" stroke={C.ok} strokeWidth={2} strokeDasharray="6 4" />}
      {touched && <Label x={135} y={214} size={13} color={C.ok} anchor="end">Z = 0</Label>}
    </g>
  )
}

function Clamp({ t }: { t: number }) {
  const spots = [[150, 90], [490, 90], [150, 270], [490, 270]]
  return (
    <g>
      <rect x={60} y={40} width={520} height={290} fill="#2a2d33" />
      <rect x={150} y={90} width={340} height={180} fill={C.wood} />
      <rect x={185} y={115} width={270} height={130} fill="none" stroke={C.accent} strokeDasharray="6 5" strokeWidth={2} />
      <Label x={320} y={185} size={13} color={C.accent}>zona sculptată</Label>
      {spots.map(([x, y], i) => (
        <g key={i} opacity={seg(t, i * 0.2, i * 0.2 + 0.15)}>
          <rect x={x - 22} y={y - 12} width={44} height={24} rx={4} fill="#475569" stroke="#94a3b8" />
          <circle cx={x} cy={y} r={5} fill="#cbd5e1" />
        </g>
      ))}
      <Label x={320} y={360} size={13} color={C.dim}>prinderi în afara zonei sculptate, mai jos decât Z de siguranță</Label>
    </g>
  )
}

function Checklist({ t, items }: { t: number; items: string[] }) {
  return (
    <g>
      {items.map((it, i) => {
        const a = seg(t, i / (items.length + 1), (i + 0.7) / (items.length + 1))
        const y = 70 + i * 52
        return (
          <g key={it} opacity={0.2 + 0.8 * a}>
            <rect x={70} y={y - 22} width={30} height={30} rx={6} fill="none" stroke={a >= 1 ? C.ok : '#57534e'} strokeWidth={2.5} />
            {a >= 1 && <path d={`M77 ${y - 7} l7 7 l12 -14`} stroke={C.ok} strokeWidth={3.5} fill="none" />}
            <Label x={118} y={y} anchor="start" size={17}>{it}</Label>
          </g>
        )
      })}
    </g>
  )
}

function Dimensions({ t }: { t: number }) {
  const a = seg(t, 0, 0.35), b = seg(t, 0.35, 0.7), c = seg(t, 0.7, 1)
  const prof: string[] = []
  for (let k = 0; k <= 60; k++) { const u = k / 60; prof.push(`${100 + u * 440},${170 - 70 * Math.exp(-((u - 0.5) ** 2) / 0.05)}`) }
  return (
    <g>
      <polygon points={`100,300 ${prof.join(' ')} 540,300`} fill={C.wood} />
      <path d="M100 330 L540 330" stroke={C.accent} strokeWidth={2} opacity={a} />
      <Label x={320} y={352} color={C.accent} opacity={a}>lățime (mm)</Label>
      <path d="M570 100 L570 170" stroke={C.ok} strokeWidth={3} opacity={b} />
      <Label x={580} y={140} color={C.ok} anchor="start" opacity={b}>adâncime</Label>
      <path d="M570 170 L570 300" stroke={C.bad} strokeWidth={3} opacity={c} />
      <Label x={580} y={240} color={C.bad} anchor="start" opacity={c}>bază</Label>
      <Label x={320} y={60} opacity={c}>grosimea plăcii ≥ adâncime + bază</Label>
    </g>
  )
}

function Feeds({ t }: { t: number }) {
  const rows = [
    { label: 'prea încet', result: 'freacă și arde lemnul', color: C.bad },
    { label: 'potrivit', result: 'așchii curate, suprafață bună', color: C.ok },
    { label: 'prea repede', result: 'vibrează, se poate rupe', color: C.bad }
  ]
  const k = Math.min(2, Math.floor(t * 3))
  return (
    <g>
      {rows.map((r, i) => (
        <g key={r.label} opacity={i === k ? 1 : 0.3}>
          <rect x={60} y={70 + i * 95} width={520} height={75} rx={12} fill="#1c1a17" stroke={r.color} strokeWidth={i === k ? 2.5 : 1} />
          <Label x={90} y={115 + i * 95} anchor="start" color={r.color} size={18}>{r.label}</Label>
          <Label x={560} y={115 + i * 95} anchor="end" size={15}>{r.result}</Label>
        </g>
      ))}
    </g>
  )
}

function Finish({ t }: { t: number }) {
  const steps = ['perie moale', 'hârtie 240 → 320', 'ulei sau ceară']
  return (
    <g>
      {steps.map((s, i) => {
        const a = seg(t, i / 3, (i + 0.8) / 3)
        const x = 110 + i * 210
        return (
          <g key={s} opacity={0.25 + 0.75 * a}>
            <circle cx={x} cy={170} r={60} fill="#1c1a17" stroke={C.accent} strokeWidth={2} />
            <Label x={x} y={178} size={30}>{i + 1}</Label>
            <Label x={x} y={270} size={15}>{s}</Label>
          </g>
        )
      })}
    </g>
  )
}

export const LessonVisual: React.FC<{ id: VisualId; t: number; items?: string[]; simSlot?: React.ReactNode }> = ({ id, t, items = [], simSlot }) => {
  const icon = useMemo(() => {
    try { return generateSampleIconCanvas('virginMary').toDataURL('image/jpeg', 0.8) } catch { return '' }
  }, [])
  if (id === 'sim' && simSlot) return <>{simSlot}</>
  return (
    <svg viewBox="0 0 640 380" className="w-full h-full" role="img">
      <rect width="640" height="380" fill={C.bg} />
      {id === 'pipeline' && <Pipeline t={t} />}
      {id === 'heightmap' && <Heightmap t={t} icon={icon} />}
      {id === 'bits' && <Bits t={t} />}
      {id === 'stepover' && <Stepover t={t} />}
      {id === 'roughing' && <Roughing t={t} />}
      {id === 'origin' && <Origin t={t} />}
      {id === 'zeroZ' && <ZeroZ t={t} />}
      {id === 'clamp' && <Clamp t={t} />}
      {id === 'checklist' && <Checklist t={t} items={items} />}
      {id === 'dimensions' && <Dimensions t={t} />}
      {id === 'feeds' && <Feeds t={t} />}
      {id === 'finish' && <Finish t={t} />}
      {id === 'sim' && <Pipeline t={t} />}
    </svg>
  )
}
