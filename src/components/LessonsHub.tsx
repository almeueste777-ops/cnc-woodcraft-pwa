import React, { useEffect, useMemo, useRef, useState } from 'react'
import { LESSONS, getLesson, sceneDurationSec } from '../help/lessons'
import type { LessonId } from '../help/knowledge'
import type { AppMode } from '../types/cnc'
import { LessonVisual } from './LessonVisuals'
import { MachineSimulator } from './MachineSimulator'
import { getDemoProgram } from '../help/demoProgram'
import type { SimProgram } from '../cam/simulator'
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Subtitles, CheckCircle2, GraduationCap, ExternalLink, ArrowRight } from 'lucide-react'

// Videoclipuri externe reale (titlu și autor verificate prin YouTube oEmbed, 2026-10-29)
const EXTERNAL_VIDEOS = [
  { id: 'glZhSrmFJMA', title: 'How to Do 3D Carvings on a CNC (Beginner Guide)', author: 'Cutting It Close', about: 'Tot drumul unei sculpturi 3D, de la model la piesă.' },
  { id: 'UCtGV6xfbDc', title: '3D Bas Relief in Vectric Aspire – Part 09', author: 'Ch IMRAN Elahi', about: 'Basorelief în Aspire: idei utile și aici (degroșare, finisare).' },
  { id: 'ULCAsCFdLWk', title: 'What CNC Router Bits Do Beginners Need?', author: 'IDC Woodcraft', about: 'Ce freze îți trebuie la început.' },
  { id: 'EkSaMnhbLJY', title: 'Detailed CNC Relief Carving | Custom Floral 3D Design', author: 'Decoratus Canada', about: 'Cum arată o sculptură în relief reală, de la mașină.' },
  { id: 'Do_C_NLH5sw', title: 'Fusion 360 CAM Tutorial for Beginners! FF102', author: 'NYC CNC', about: 'Pentru cine vrea să învețe și Fusion 360.' },
  { id: '61tZqai8oGk', title: 'Fusion 360 for CNC Routers: Master CAM Setup Fast', author: 'I Billd This', about: 'Setup CAM în Fusion 360 pentru router.' }
]

function loadDone(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem('cnc.lessonsDone') || '[]')) } catch { return new Set() }
}

function pickRomanianVoice(): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null
  const voices = window.speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('ro'))
  return voices.find(v => /natural|online/i.test(v.name)) ?? voices[0] ?? null
}

interface Props {
  initialLesson?: LessonId
  onNavigate: (mode: AppMode) => void
}

export const LessonsHub: React.FC<Props> = ({ initialLesson = 'intro', onNavigate }) => {
  const [lessonId, setLessonId] = useState<LessonId>(initialLesson)
  const [scene, setScene] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [voiceOn, setVoiceOn] = useState(true)
  const [subs, setSubs] = useState(true)
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null)
  const [done, setDone] = useState<Set<string>>(loadDone)
  const [demo, setDemo] = useState<SimProgram | null>(null)
  const speechEnded = useRef(true)

  useEffect(() => { setLessonId(initialLesson); setScene(0); setElapsed(0) }, [initialLesson])

  const lesson = getLesson(lessonId)
  const sc = lesson.scenes[scene]
  const dur = sceneDurationSec(sc)
  const lessonTotal = useMemo(() => lesson.scenes.reduce((s, x) => s + sceneDurationSec(x), 0), [lesson])
  const before = lesson.scenes.slice(0, scene).reduce((s, x) => s + sceneDurationSec(x), 0)

  // vocile se încarcă asincron în Chrome/Edge
  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    // aceeași voce reîncărcată nu trebuie să repornească narațiunea
    const update = () => {
      const v = pickRomanianVoice()
      setVoice(prev => (prev && v && prev.name === v.name ? prev : v))
    }
    update()
    window.speechSynthesis.addEventListener('voiceschanged', update)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update)
  }, [])

  // programul demonstrativ se calculează doar când o scenă îl cere
  useEffect(() => {
    if (sc.visual === 'sim' && !demo) {
      const id = setTimeout(() => setDemo(getDemoProgram()), 50)
      return () => clearTimeout(id)
    }
  }, [sc.visual, demo])

  // narațiunea scenei
  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    speechEnded.current = true
    if (!playing || !voiceOn || !voice) return
    const u = new SpeechSynthesisUtterance(sc.text)
    u.voice = voice
    u.lang = voice.lang
    u.rate = 1
    speechEnded.current = false
    u.onend = () => { speechEnded.current = true }
    u.onerror = () => { speechEnded.current = true }
    window.speechSynthesis.speak(u)
    return () => window.speechSynthesis.cancel()
  }, [playing, scene, lessonId, voiceOn, voice, sc.text])

  // ceasul lecției
  useEffect(() => {
    if (!playing) return
    // 10 actualizări pe secundă ajung pentru animații line și nu încarcă procesorul
    let last = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      const dt = (now - last) / 1000
      last = now
      setElapsed(e => e + dt)
    }, 100)
    return () => clearInterval(id)
  }, [playing])

  // trecerea la scena următoare: după voce (dacă vorbește) sau după durata estimată
  useEffect(() => {
    if (!playing) return
    const speaking = voiceOn && voice && !speechEnded.current
    const sceneOver = speaking ? elapsed > dur * 2.5 : elapsed >= dur
    if (!sceneOver) return
    if (scene < lesson.scenes.length - 1) {
      setScene(s => s + 1)
      setElapsed(0)
    } else {
      setPlaying(false)
      const next = new Set(done)
      next.add(lessonId)
      setDone(next)
      try { localStorage.setItem('cnc.lessonsDone', JSON.stringify([...next])) } catch { /* fără stocare */ }
    }
  }, [elapsed, playing, dur, scene, lesson.scenes.length, voiceOn, voice, done, lessonId])

  useEffect(() => () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel() }, [])

  const openLesson = (id: LessonId) => { setLessonId(id); setScene(0); setElapsed(0); setPlaying(true) }
  const goScene = (i: number) => { setScene(Math.max(0, Math.min(lesson.scenes.length - 1, i))); setElapsed(0) }
  const seekLesson = (sec: number) => {
    let acc = 0
    for (let i = 0; i < lesson.scenes.length; i++) {
      const d = sceneDurationSec(lesson.scenes[i])
      if (sec < acc + d || i === lesson.scenes.length - 1) { setScene(i); setElapsed(Math.max(0, sec - acc)); return }
      acc += d
    }
  }
  const nextLesson = LESSONS[LESSONS.findIndex(l => l.id === lessonId) + 1]
  const t = Math.min(1, elapsed / dur)
  const progress = Math.min(lessonTotal, before + Math.min(elapsed, dur))

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* lista lecțiilor */}
        <div className="lg:col-span-4 bg-[#1a1815] rounded-xl border border-[#2f2b26] p-3 flex flex-col gap-1.5">
          <h2 className="text-base font-bold text-white flex items-center gap-2 mb-1"><GraduationCap className="w-5 h-5 text-amber-500" /> Lecții video animate</h2>
          <p className="text-[11px] text-stone-400 mb-2">De la zero la prima piesă. Fiecare lecție are voce în română (dacă browserul o are) și subtitrare.</p>
          {LESSONS.map(l => (
            <button key={l.id} onClick={() => openLesson(l.id)} className={`text-left rounded-lg px-3 py-2 border ${l.id === lessonId ? 'bg-amber-600/20 border-amber-600' : 'bg-[#141312] border-[#2e2a24] hover:border-[#4a4237]'}`}>
              <div className="flex items-center gap-2 text-sm font-bold text-stone-100">
                {done.has(l.id) && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                {l.title}
              </div>
              <div className="text-[11px] text-stone-400">{l.summary} · {Math.round(l.scenes.reduce((s, x) => s + sceneDurationSec(x), 0) / 60 * 10) / 10} min</div>
            </button>
          ))}
        </div>

        {/* playerul */}
        <div className="lg:col-span-8 bg-[#1a1815] rounded-xl border border-[#2f2b26] p-3 flex flex-col gap-2">
          <div className="text-sm font-bold text-white">{lesson.title} <span className="text-stone-500 font-normal">— {scene + 1}/{lesson.scenes.length}: {sc.title}</span></div>
          <div className="relative rounded-lg overflow-hidden bg-[#0f0e0d] aspect-[16/9]">
            <LessonVisual
              id={sc.visual}
              t={t}
              items={sc.items}
              simSlot={demo ? <MachineSimulator program={demo} compact autoPlaySpeed={40} /> : <div className="h-full flex items-center justify-center text-stone-400 text-sm">Se pregătește simularea...</div>}
            />
            {subs && sc.visual !== 'sim' && (
              <div className="absolute bottom-0 inset-x-0 bg-black/75 text-white text-sm md:text-base px-4 py-2.5 leading-snug">{sc.text}</div>
            )}
            {!playing && elapsed === 0 && scene === 0 && (
              <button onClick={() => setPlaying(true)} className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/30" aria-label="Pornește lecția">
                <span className="w-20 h-20 rounded-full bg-amber-600 flex items-center justify-center shadow-2xl"><Play className="w-10 h-10 text-white fill-current ml-1" /></span>
              </button>
            )}
          </div>
          {subs && sc.visual === 'sim' && <div className="bg-black/60 text-white text-sm px-3 py-2 rounded-lg">{sc.text}</div>}

          {/* bara de progres cu capitole */}
          <div className="relative h-2 bg-[#2a2620] rounded-full cursor-pointer" onClick={e => {
            const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
            seekLesson(((e.clientX - r.left) / r.width) * lessonTotal)
          }}>
            <div className="absolute inset-y-0 left-0 bg-amber-500 rounded-full" style={{ width: `${(progress / lessonTotal) * 100}%` }} />
            {lesson.scenes.slice(1).map((_, i) => {
              const at = lesson.scenes.slice(0, i + 1).reduce((s, x) => s + sceneDurationSec(x), 0)
              return <div key={i} className="absolute top-0 bottom-0 w-0.5 bg-[#1a1815]" style={{ left: `${(at / lessonTotal) * 100}%` }} />
            })}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => goScene(scene - 1)} className="bg-[#221f1b] border border-[#3d362c] rounded-lg p-1.5" title="Scena anterioară"><SkipBack className="w-4 h-4" /></button>
            <button onClick={() => setPlaying(p => !p)} className="bg-amber-600 hover:bg-amber-500 text-white rounded-lg px-3 py-1.5 text-xs font-bold flex items-center gap-1.5">
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}{playing ? 'Pauză' : 'Pornește'}
            </button>
            <button onClick={() => goScene(scene + 1)} className="bg-[#221f1b] border border-[#3d362c] rounded-lg p-1.5" title="Scena următoare"><SkipForward className="w-4 h-4" /></button>
            <button onClick={() => setVoiceOn(v => !v)} className={`rounded-lg p-1.5 border ${voiceOn && voice ? 'bg-[#221f1b] border-[#3d362c]' : 'bg-[#221f1b] border-red-900 text-stone-500'}`} title="Voce">
              {voiceOn && voice ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button onClick={() => setSubs(s => !s)} className={`rounded-lg p-1.5 border ${subs ? 'bg-[#221f1b] border-[#3d362c]' : 'bg-[#221f1b] border-[#2e2a24] text-stone-500'}`} title="Subtitrare"><Subtitles className="w-4 h-4" /></button>
            <span className="text-[11px] text-stone-500">
              {voice ? `Voce: ${voice.name}` : 'Browserul nu are voce în română — ai subtitrarea. (În Microsoft Edge există vocile Alina și Emil.)'}
            </span>
            <div className="ml-auto flex gap-2">
              {sc.action && (
                <button onClick={() => { setPlaying(false); onNavigate(sc.action!.mode) }} className="bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg px-3 py-1.5 text-xs font-bold flex items-center gap-1.5">
                  {sc.action.label} <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
              {scene === lesson.scenes.length - 1 && nextLesson && (
                <button onClick={() => openLesson(nextLesson.id)} className="bg-[#221f1b] border border-amber-700 text-amber-300 rounded-lg px-3 py-1.5 text-xs font-bold">Lecția următoare →</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* videoclipuri externe */}
      <div className="bg-[#1a1815] rounded-xl border border-[#2f2b26] p-4">
        <h3 className="text-sm font-bold text-white mb-1">Videoclipuri de pe YouTube (în engleză)</h3>
        <p className="text-[11px] text-stone-400 mb-3">Filmări reale din ateliere. Arată alte programe (Aspire, Fusion 360), dar principiile sunt aceleași. Se deschid pe YouTube; au nevoie de internet.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {EXTERNAL_VIDEOS.map(v => (
            <a key={v.id} href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer" className="bg-[#141312] border border-[#2e2a24] hover:border-amber-700 rounded-lg overflow-hidden flex flex-col">
              <img src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="" loading="lazy" className="w-full aspect-video object-cover bg-black" />
              <div className="p-2">
                <div className="text-xs font-bold text-stone-100 flex gap-1">{v.title} <ExternalLink className="w-3 h-3 shrink-0 text-stone-500" /></div>
                <div className="text-[11px] text-stone-500">{v.author}</div>
                <div className="text-[11px] text-stone-400 mt-1">{v.about}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
