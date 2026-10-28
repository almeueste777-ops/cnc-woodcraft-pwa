import React, { useState } from 'react'
import {
  BookOpen,
  GraduationCap,
  Layers,
  HelpCircle,
  PlayCircle,
  Lightbulb,
  Wrench,
  Compass,
  ExternalLink
} from 'lucide-react'

export const TutorialHub: React.FC = () => {
  const [activeSection, setActiveSection] = useState<'beginner' | 'fusion' | 'videos' | 'wood'>('videos')
  const [selectedVideo, setSelectedVideo] = useState<string>('glZhSrmFJMA')

  const videos = [
    {
      id: 'glZhSrmFJMA',
      title: 'Cum se face Sculptură 3D pe CNC (Ghid Complet Începători)',
      channel: 'Clackamas Woodworking',
      duration: '14 min',
      desc: 'Tot procesul de la imagine, generare model 3D până la fixarea pe masă și sculptarea pe lemn cu freză sferică.'
    },
    {
      id: 'UCtGV6xfbDc',
      title: '3D Bas Relief CNC Wood Carving Tutorial',
      channel: 'Design & Carve Tutorials',
      duration: '16 min',
      desc: 'Tehnici de sculptat basorelief în lemn, pas lateral (stepover) și trucuri pentru suprafețe fără urme de freză.'
    },
    {
      id: 'Do_C_NLH5sw',
      title: 'Fusion 360 CAM Tutorial pentru Începători (Setup & G-Code)',
      channel: 'NYC CNC',
      duration: '19 min',
      desc: 'Ghidul practic pas cu pas: configurare spațiu Manufacture, setare axa Z și generare fișier G-code.'
    },
    {
      id: '61tZqai8oGk',
      title: 'Fusion 360 pentru CNC Router: Master CAM Setup Rapid',
      channel: 'Desktop CNC Guide',
      duration: '12 min',
      desc: 'Cum configurezi un Setup curat pentru lemn, viteze de avans și adâncimi de degroșare fără vibrații.'
    },
    {
      id: 'ULCAsCFdLWk',
      title: 'Ghidul Frezelor CNC pentru Lemn: Ball-Nose, Dreaptă și V-Bit',
      channel: 'Tools & Machining',
      duration: '11 min',
      desc: 'Ce scule alegem pentru sculptură de icoane, de ce freza sferică este obligatorie pentru relief și cum evităm ruperea sculei.'
    },
    {
      id: 'EkSaMnhbLJY',
      title: 'Sculptură Lemn Masiv Detaliată (Demonstrație Practică Atelier)',
      channel: 'Decoratus Woodcraft',
      duration: '10 min',
      desc: 'Demonstrație cu frezare de relief în lemn masiv, curățarea așchiilor și finisarea cu ulei și ceară.'
    }
  ]

  return (
    <div className="bg-[#1a1815] rounded-xl border border-[#2f2b26] p-4 text-stone-200 flex flex-col gap-5 shadow-2xl">
      {/* Header Ghid */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2e2a24] pb-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-amber-500" />
            Centrul de Învățare & Tutoriale Video CNC
          </h2>
          <p className="text-xs text-stone-400">
            Tutoriale video verificate, ghidul complet pentru Autodesk Fusion 360 și sfaturi de atelier pentru sculptura icoanelor în lemn.
          </p>
        </div>

        {/* Butoane Navigare Secțiuni */}
        <div className="flex flex-wrap items-center gap-1.5 bg-[#12110f] p-1 rounded-xl border border-[#2e2a24]">
          <button
            onClick={() => setActiveSection('videos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${activeSection === 'videos' ? 'bg-amber-600 text-white shadow-md' : 'text-stone-400 hover:text-stone-200'}`}
          >
            <PlayCircle className="w-3.5 h-3.5" />
            Video-uri Explicative (6)
          </button>
          <button
            onClick={() => setActiveSection('fusion')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${activeSection === 'fusion' ? 'bg-amber-600 text-white shadow-md' : 'text-stone-400 hover:text-stone-200'}`}
          >
            <Compass className="w-3.5 h-3.5" />
            Ce este Fusion 360?
          </button>
          <button
            onClick={() => setActiveSection('beginner')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${activeSection === 'beginner' ? 'bg-amber-600 text-white shadow-md' : 'text-stone-400 hover:text-stone-200'}`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Ghid Începători CNC
          </button>
          <button
            onClick={() => setActiveSection('wood')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${activeSection === 'wood' ? 'bg-amber-600 text-white shadow-md' : 'text-stone-400 hover:text-stone-200'}`}
          >
            <Layers className="w-3.5 h-3.5" />
            Lemn & Icoane (Tei, Stejar)
          </button>
        </div>
      </div>

      {/* SECȚIUNEA 1: VIDEO-URI EXPLICATIVE (VERIFICATE) */}
      {activeSection === 'videos' && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Player Video Integrat */}
            <div className="lg:col-span-8 bg-[#12110f] rounded-xl overflow-hidden border border-[#2e2a24] flex flex-col shadow-2xl">
              <div className="relative aspect-video w-full bg-black">
                <iframe
                  className="w-full h-full"
                  src={`https://www.youtube.com/embed/${selectedVideo}?autoplay=0&rel=0&modestbranding=1`}
                  title="Tutorial Video CNC Wood Carving"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>

              {/* Informații Video Selectat & Link Direct */}
              <div className="p-3.5 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-amber-300 mb-1">
                    {videos.find(v => v.id === selectedVideo)?.title}
                  </h3>
                  <p className="text-xs text-stone-400">
                    {videos.find(v => v.id === selectedVideo)?.desc}
                  </p>
                  <span className="text-[11px] text-stone-500 mt-1.5 inline-block">
                    Canal: <strong>{videos.find(v => v.id === selectedVideo)?.channel}</strong> • Durată: {videos.find(v => v.id === selectedVideo)?.duration}
                  </span>
                </div>

                <a
                  href={`https://www.youtube.com/watch?v=${selectedVideo}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 bg-[#25211a] hover:bg-[#332c22] border border-amber-600/40 text-amber-300 px-3 py-1.5 rounded-lg text-xs font-bold transition flex-shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Deschide pe YouTube
                </a>
              </div>
            </div>

            {/* Listă Video-uri */}
            <div className="lg:col-span-4 flex flex-col gap-2 overflow-y-auto max-h-[520px] pr-1">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-500 mb-1">
                Lecții Video Selectate (Click pentru redare):
              </span>
              {videos.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVideo(v.id)}
                  className={`p-3 rounded-xl border text-left transition flex items-start gap-2.5 ${selectedVideo === v.id ? 'bg-[#29241d] border-amber-600/70 shadow-lg' : 'bg-[#141312] border-[#2e2a24] hover:bg-[#1f1d19]'}`}
                >
                  <PlayCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${selectedVideo === v.id ? 'text-amber-500' : 'text-stone-500'}`} />
                  <div>
                    <strong className={`text-xs block leading-snug ${selectedVideo === v.id ? 'text-amber-300' : 'text-stone-200'}`}>
                      {v.title}
                    </strong>
                    <div className="flex items-center gap-2 text-[10px] text-stone-400 mt-1">
                      <span>{v.channel}</span>
                      <span>•</span>
                      <span className="font-mono text-amber-400">{v.duration}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECȚIUNEA 2: TOTUL DESPRE FUSION 360 */}
      {activeSection === 'fusion' && (
        <div className="flex flex-col gap-4 text-xs leading-relaxed">
          <div className="bg-[#141312] p-4 rounded-xl border border-sky-900/40 flex items-start gap-3">
            <Compass className="w-6 h-6 text-sky-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-sky-300 mb-1">
                Ce este Autodesk Fusion 360 și cum funcționează?
              </h3>
              <p className="text-stone-300">
                <strong>Fusion 360</strong> este cel mai cunoscut pachet software complet de la compania Autodesk. El cuprinde:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                <div className="bg-[#1c1a17] p-2.5 rounded-lg border border-[#302c25]">
                  <strong className="text-amber-400 block mb-0.5">1. CAD (Computer Aided Design)</strong>
                  <span className="text-stone-400">Proiectare 3D tehnică de la zero: unde desenezi mobilier, rame cu caneluri bizantine, îmbinări în coadă de rândunică sau cutii de lemn.</span>
                </div>
                <div className="bg-[#1c1a17] p-2.5 rounded-lg border border-[#302c25]">
                  <strong className="text-sky-400 block mb-0.5">2. CAM (Computer Aided Manufacturing)</strong>
                  <span className="text-stone-400">Modulul care preia un model 3D (cum este STL-ul generat din aplicația noastră) și calculează traiectoria fiecărui milimetru parcurs de freză.</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#141312] p-4 rounded-xl border border-[#2e2a24] flex flex-col gap-2">
            <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1.5 uppercase">
              <HelpCircle className="w-4 h-4" />
              Trebuie neapărat să știți Fusion 360 pentru a sculpta icoane?
            </h4>
            <p className="text-stone-300">
              <strong className="text-emerald-400">NU!</strong> Aplicația noastră <em>CNC WoodCraft Studio</em> face deja ambele roluri pentru icoane:
              convertește fotografia în relief 3D anatomic și calculează direct fișierul G-Code optimizat pentru lemn de tei/stejar, fără să fie nevoie să cumpărați abonament Autodesk sau să studiați luni de zile.
            </p>
            <p className="text-stone-400">
              Totuși, dacă doriți să proiectați mobilier complex sau rame masive de catapeteasmă, iată pașii de lucru:
            </p>
          </div>

          {/* Ghid Pas cu Pas Fusion 360 */}
          <div className="bg-[#141312] p-4 rounded-xl border border-[#2e2a24] flex flex-col gap-3">
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase">
              <Wrench className="w-4 h-4 text-amber-500" />
              Cum lucrezi în Fusion 360 cu fișierul STL de icoană:
            </h4>

            <div className="space-y-3 text-stone-300">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-sky-700 text-white font-bold flex items-center justify-center flex-shrink-0 text-[11px]">1</span>
                <div>
                  <strong className="text-white block">Exportați STL-ul din aplicația noastră:</strong>
                  <span>Apăsați butonul <em>„Export STL 3D”</em>. Fișierul obținut este un corp solid închis (*watertight*).</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-sky-700 text-white font-bold flex items-center justify-center flex-shrink-0 text-[11px]">2</span>
                <div>
                  <strong className="text-white block">Importul în Fusion 360:</strong>
                  <span>Deschideți Fusion 360 &gt; mergeți în bara de sus la <strong>Mesh</strong> &gt; apăsați <strong>Insert Mesh</strong> &gt; alegeți fișierul STL și bifați unitățile în <strong>Millimeter</strong>.</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-sky-700 text-white font-bold flex items-center justify-center flex-shrink-0 text-[11px]">3</span>
                <div>
                  <strong className="text-white block">Comutarea în modul CAM (Manufacture):</strong>
                  <span>În stânga sus, schimbați spațiul de lucru din <strong>Design</strong> în <strong>Manufacture</strong>.</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-sky-700 text-white font-bold flex items-center justify-center flex-shrink-0 text-[11px]">4</span>
                <div>
                  <strong className="text-white block">Crearea unui Setup (Configurație Mașină):</strong>
                  <span>Apăsați butonul <strong>New Setup</strong>. Asigurați-vă că axa <strong>Z</strong> indică în sus spre tavan, iar Originea (WCS) este setată pe colțul stânga-față de sus al piesei.</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-sky-700 text-white font-bold flex items-center justify-center flex-shrink-0 text-[11px]">5</span>
                <div>
                  <strong className="text-white block">Operația de Degroșare (3D Adaptive Clearing):</strong>
                  <span>Alegeți <strong>3D &gt; Adaptive Clearing</strong> cu o freză plată de 4 mm sau 6 mm. Lăsați <em>Stock to Leave</em> = 0.5 mm pentru a nu afecta detaliile fine.</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-sky-700 text-white font-bold flex items-center justify-center flex-shrink-0 text-[11px]">6</span>
                <div>
                  <strong className="text-white block">Operația de Finisare (3D Parallel / 3D Scallop):</strong>
                  <span>Alegeți <strong>3D &gt; Parallel</strong> cu o freză <strong>Ball-Nose</strong> (sferică) de 2 sau 3.175 mm, pas lateral 0.25 mm. Aceasta sculptează fața, barba și nimbul.</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-sky-700 text-white font-bold flex items-center justify-center flex-shrink-0 text-[11px]">7</span>
                <div>
                  <strong className="text-white block">Post Process (Salvare G-Code):</strong>
                  <span>Apăsați <strong>Post Process</strong> (icoana NC), alegeți <em>Grbl / grbl.cps</em> sau <em>Mach3</em> și salvați fișierul `.nc` pentru mașina dumneavoastră!</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECȚIUNEA 3: GHIDUL ÎNCEPĂTORULUI LA CNC */}
      {activeSection === 'beginner' && (
        <div className="flex flex-col gap-4 text-xs leading-relaxed">
          <div className="bg-[#141312] p-4 rounded-xl border border-[#2e2a24] flex items-start gap-3">
            <Lightbulb className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-amber-300 mb-1">Principiul De Bază: Cum funcționează o mașină CNC pentru lemn?</h3>
              <p className="text-stone-300">
                O mașină CNC deplasează o freză rotativă pe 3 axe:
                <span className="text-red-400 font-bold ml-1">Axa X</span> (stânga-dreapta),
                <span className="text-emerald-400 font-bold ml-1">Axa Y</span> (față-spate) și
                <span className="text-sky-400 font-bold ml-1">Axa Z</span> (adâncimea de tăiere în lemn).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-[#141312] p-3.5 rounded-xl border border-[#2e2a24] flex flex-col gap-2">
              <span className="text-xs font-extrabold text-amber-400 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[11px]">1</span>
                Fixarea plăcii de lemn pe masa de lucru
              </span>
              <ul className="list-disc list-inside text-stone-400 space-y-1">
                <li>Lemnul nu are voie să vibreze deloc în timpul frezării.</li>
                <li>Folosiți metoda atelierului: <strong>bandă de hârtie mascare + superglue</strong> pe spatele lemnului și pe masa CNC-ului. Este rapidă, curată și nu necesită bride care să lovească freza.</li>
              </ul>
            </div>

            <div className="bg-[#141312] p-3.5 rounded-xl border border-[#2e2a24] flex flex-col gap-2">
              <span className="text-xs font-extrabold text-amber-400 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[11px]">2</span>
                Alegerea corectă a frezelor (Scule)
              </span>
              <ul className="list-disc list-inside text-stone-300 space-y-1">
                <li><strong className="text-amber-300">Freză Sferică (Ball-Nose)</strong>: Vârf rotunjit ca o emisferă. <em>Obligatorie pentru sculptură 3D și icoane</em>.</li>
                <li><strong className="text-amber-300">Freză Dreaptă (Endmill)</strong>: Pentru degroșat rapid sau tăierea ramei exterioare.</li>
                <li><strong className="text-amber-300">Gravor V-Bit</strong>: Pentru litere bisericești, inscripții și decorațiuni fine.</li>
              </ul>
            </div>

            <div className="bg-[#141312] p-3.5 rounded-xl border border-[#2e2a24] flex flex-col gap-2">
              <span className="text-xs font-extrabold text-amber-400 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[11px]">3</span>
                Setarea Originii de Lucru (Zero Piesa: X0 Y0 Z0)
              </span>
              <ul className="list-disc list-inside text-stone-400 space-y-1">
                <li>Mutați vârful frezei în <strong>colțul stânga-față al lemnului</strong>.</li>
                <li><strong>Metoda Foii de Hârtie pentru Z</strong>: Coborâți freza cu pas de 0.1 mm pe o foaie de hârtie până când hârtia este strânsă ușor. Acolo este Z0.</li>
                <li>Apăsați butonul <strong>„Setează Zero (X0 Y0 Z0)”</strong> în aplicație.</li>
              </ul>
            </div>

            <div className="bg-[#141312] p-3.5 rounded-xl border border-[#2e2a24] flex flex-col gap-2">
              <span className="text-xs font-extrabold text-amber-400 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[11px]">4</span>
                Pasul Lateral (Stepover)
              </span>
              <p className="text-stone-300">
                Pentru o freză sferică de <strong>3.175 mm (1/8")</strong>, un pas lateral de <strong>10% (0.31 mm)</strong> lasă lemnul lustruit, gata direct de grunduire sau lăcuire fără șlefuire manuală.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SECȚIUNEA 4: SFATURI SPECIFICE LEMN & ICOANE */}
      {activeSection === 'wood' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="bg-[#141312] p-3.5 rounded-xl border border-[#2e2a24] flex flex-col gap-2">
            <span className="font-bold text-amber-400 text-sm">🪵 Lemnul de Tei (Ideal Icoane)</span>
            <p className="text-stone-300">
              Teiul este lemnul tradițional utilizat de secole în iconografia bizantină și ortodoxă.
            </p>
            <ul className="list-disc list-inside text-stone-400 space-y-1">
              <li>Are fibră omogenă, foarte fină și densă, fără noduri.</li>
              <li>Nu așchiază la frezare și permite detalii minuscule pe chipul sfinților și nimb.</li>
              <li>Avans recomandat: <strong>1500–2200 mm/min</strong>, turație <strong>18.000 RPM</strong>.</li>
            </ul>
          </div>

          <div className="bg-[#141312] p-3.5 rounded-xl border border-[#2e2a24] flex flex-col gap-2">
            <span className="font-bold text-amber-400 text-sm">🌳 Lemnul de Stejar & Frasin</span>
            <p className="text-stone-300">
              Esențe tari, cu fibră vizibilă și nobilă, ideale pentru cruci sculptate și rame masive.
            </p>
            <ul className="list-disc list-inside text-stone-400 space-y-1">
              <li>Necesită freze cu carbură de înaltă calitate (Solid Carbide).</li>
              <li>Adâncimea pe trecere trebuie redusă (pas de 1.5–2.5 mm).</li>
              <li>Finisajul final cu ulei de in fiert sau ceară de albine evidențiază relieful spectaculos.</li>
            </ul>
          </div>

          <div className="bg-[#141312] p-3.5 rounded-xl border border-[#2e2a24] flex flex-col gap-2">
            <span className="font-bold text-amber-400 text-sm">✨ Tehnica Finisării Icoanelor</span>
            <p className="text-stone-300">
              Cum scoateți în evidență basorelieful după frezarea pe CNC:
            </p>
            <ul className="list-disc list-inside text-stone-400 space-y-1">
              <li><strong>Patinare / Antichizare</strong>: Aplicați baiț pe bază de apă mai închis în adâncituri, apoi ștergeți ușor vârfurile pentru a crea contrast și profunzime.</li>
              <li><strong>Poleire nimb</strong>: Puteți aplica foiță de aur sau schlagmetall pe nimbul scos în relief.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
