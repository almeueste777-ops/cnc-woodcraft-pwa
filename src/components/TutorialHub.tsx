import React, { useState } from 'react'
import {
  BookOpen,
  GraduationCap,
  Layers,
  HelpCircle,
  PlayCircle,
  Lightbulb,
  Wrench,
  Compass
} from 'lucide-react'

export const TutorialHub: React.FC = () => {
  const [activeSection, setActiveSection] = useState<'beginner' | 'fusion' | 'videos' | 'wood'>('beginner')
  const [selectedVideo, setSelectedVideo] = useState<string>('cK8i5W2lPqQ') // default video ID

  const videos = [
    {
      id: 'cK8i5W2lPqQ',
      title: 'Cum se sculptează un Basorelief 3D în lemn pe CNC',
      author: 'Ghid Practic Sculptură Lemn',
      duration: '14 min',
      desc: 'Procesul complet de la imagine, generare model 3D până la fixarea pe masă și finisarea cu freză sferică.'
    },
    {
      id: '2Fh3K0J9G5w',
      title: 'Autodesk Fusion 360 CAM: De la Model 3D la G-Code pas cu pas',
      author: 'Tutorial CAM Începători',
      duration: '18 min',
      desc: 'Cum configurezi un Setup în Fusion 360, trasee 3D Adaptive Clearing și 3D Parallel pentru lemn.'
    },
    {
      id: 'uR4m5X9qZ8w',
      title: 'Ghidul Frezelor CNC pentru Lemn: Ball-Nose, Endmill și V-Bit',
      author: 'Tehnologia Sculelor Aschietoare',
      duration: '11 min',
      desc: 'Ce freză alegem pentru degroșare, ce diametru folosim pentru relief fin și cum calculăm pasul lateral (stepover).'
    },
    {
      id: 'pL7k9N2bV1x',
      title: 'Cum setezi Originea Lucrării (Zero X0 Y0 Z0) cu precizie',
      author: 'Calibrare CNC Atelier',
      duration: '8 min',
      desc: 'Metoda simplă cu foaia de hârtie și utilizarea palpatorului de axă Z (Z-probe) pe suprafața lemnului.'
    }
  ]

  return (
    <div className="bg-[#1a1815] rounded-xl border border-[#2f2b26] p-4 text-stone-200 flex flex-col gap-5 shadow-2xl">
      {/* Header Ghid */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2e2a24] pb-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-amber-500" />
            Centrul de Învățare & Ghiduri Pas cu Pas
          </h2>
          <p className="text-xs text-stone-400">
            Tot ce trebuie să știți de la prima sculptură pe lemn până la utilizarea Autodesk Fusion 360 și setarea utilajului CNC.
          </p>
        </div>

        {/* Butoane Navigare Secțiuni Ghid */}
        <div className="flex items-center gap-1.5 bg-[#12110f] p-1 rounded-xl border border-[#2e2a24]">
          <button
            onClick={() => setActiveSection('beginner')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${activeSection === 'beginner' ? 'bg-amber-600 text-white shadow-md' : 'text-stone-400 hover:text-stone-200'}`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Ghid Începători CNC
          </button>
          <button
            onClick={() => setActiveSection('fusion')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${activeSection === 'fusion' ? 'bg-amber-600 text-white shadow-md' : 'text-stone-400 hover:text-stone-200'}`}
          >
            <Compass className="w-3.5 h-3.5" />
            Ce este Fusion 360?
          </button>
          <button
            onClick={() => setActiveSection('videos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${activeSection === 'videos' ? 'bg-amber-600 text-white shadow-md' : 'text-stone-400 hover:text-stone-200'}`}
          >
            <PlayCircle className="w-3.5 h-3.5" />
            Video-uri Explicative
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

      {/* SECȚIUNEA 1: GHIDUL ÎNCEPĂTORULUI LA CNC */}
      {activeSection === 'beginner' && (
        <div className="flex flex-col gap-4 text-xs leading-relaxed">
          <div className="bg-[#141312] p-4 rounded-xl border border-[#2e2a24] flex items-start gap-3">
            <Lightbulb className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-amber-300 mb-1">Principiul De Bază: Cum funcționează o mașină CNC pentru lemn?</h3>
              <p className="text-stone-300">
                O mașină CNC (Computer Numerical Control) deplasează un motor cu freză rotativă pe 3 axe în spațiu:
                <span className="text-red-400 font-bold ml-1">Axa X</span> (stânga-dreapta),
                <span className="text-emerald-400 font-bold ml-1">Axa Y</span> (înainte-înapoi) și
                <span className="text-sky-400 font-bold ml-1">Axa Z</span> (sus-jos, adâncimea de tăiere).
                Calculatorul îi trimite instrucțiuni numite <strong>G-Code</strong> (ex: "mergi la X10 Y20 și coboară Z la -5mm cu viteza 1500").
              </p>
            </div>
          </div>

          {/* Pașii de lucru pas cu pas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-[#141312] p-3.5 rounded-xl border border-[#2e2a24] flex flex-col gap-2">
              <span className="text-xs font-extrabold text-amber-400 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[11px]">1</span>
                Fixarea plăcii de lemn pe masa de lucru
              </span>
              <p className="text-stone-300">
                Lemnul <strong>nu are voie să vibreze sau să se deplaseze nici măcar 0.1 mm</strong> în timpul frezării:
              </p>
              <ul className="list-disc list-inside text-stone-400 space-y-1">
                <li>Folosiți <strong>bride de strângere mecanice</strong> pe marginea plăcii, în afara zonei de sculptură.</li>
                <li>Sau folosiți metoda atelierului: <strong>bandă de mascare din hârtie</strong> lipită pe spatele lemnului și pe masa CNC-ului, unită cu câteva picături de <strong>adeziv cianoacrilat (Superglue)</strong>. Rezistă ferm și se desprinde curat.</li>
              </ul>
            </div>

            <div className="bg-[#141312] p-3.5 rounded-xl border border-[#2e2a24] flex flex-col gap-2">
              <span className="text-xs font-extrabold text-amber-400 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[11px]">2</span>
                Alegerea corectă a frezelor (Scule)
              </span>
              <ul className="list-disc list-inside text-stone-300 space-y-1">
                <li><strong className="text-amber-300">Freză Sferică (Ball-Nose)</strong>: Cu vârful rotunjit ca o emisferă. <em>Este scula de bază pentru sculptura de icoane și basorelief 3D</em>, deoarece lasă suprafețe fine fără colțuri aspre.</li>
                <li><strong className="text-amber-300">Freză Dreaptă (Endmill)</strong>: Cu vârf plat. Se folosește pentru <em>degroșare rapidă</em> (eliminarea surplusului de lemn) sau pentru tăiat rama pe contur.</li>
                <li><strong className="text-amber-300">Gravor V-Bit</strong>: În formă de con (30°, 60°, 90°). Ideal pentru litere bisericești, inscripții și linii fine de contur.</li>
              </ul>
            </div>

            <div className="bg-[#141312] p-3.5 rounded-xl border border-[#2e2a24] flex flex-col gap-2">
              <span className="text-xs font-extrabold text-amber-400 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[11px]">3</span>
                Setarea Originii de Lucru (Zero Piesa: X0 Y0 Z0)
              </span>
              <p className="text-stone-300">
                Înainte de tăiere, trebuie să-i spuneți mașinii unde începe piesa dumneavoastră:
              </p>
              <ul className="list-disc list-inside text-stone-400 space-y-1">
                <li>Mutați vârful frezei manual (Jogging) exact în <strong>colțul din stânga-față al lemnului</strong>.</li>
                <li>Apăsați butonul <strong>„Setează Zero (X0 Y0 Z0)”</strong> în panoul de control.</li>
                <li><strong>Metoda Foii de Hârtie pentru axa Z</strong>: Puneți o foaie de hârtie pe lemn și coborâți freza cu pas de 0.1 mm până când hârtia este ușor presată și abia o puteți mișca. Acela este exact $Z=0$ (suprafața superioară a lemnului).</li>
              </ul>
            </div>

            <div className="bg-[#141312] p-3.5 rounded-xl border border-[#2e2a24] flex flex-col gap-2">
              <span className="text-xs font-extrabold text-amber-400 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[11px]">4</span>
                Pasul Lateral (Stepover) - Secretul unui lemn fin
              </span>
              <p className="text-stone-300">
                Pasul lateral reprezintă distanța cu care se mută freza lateral la fiecare trecere:
              </p>
              <ul className="list-disc list-inside text-stone-400 space-y-1">
                <li>Dacă aveți o freză sferică de diametru <strong>3.175 mm (1/8")</strong>, un pas lateral de <strong>10% (0.31 mm)</strong> va produce o suprafață fină ca mătasea, gata direct de grunduire sau lăcuire, fără a mai fi nevoie să șlefuiți cu șmirghel detaliile mici ale feței sau nimbului.</li>
              </ul>
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
                Ce este Autodesk Fusion 360 și de ce se vorbește despre el?
              </h3>
              <p className="text-stone-300">
                <strong>Autodesk Fusion 360</strong> este cel mai cunoscut program profesional combinat de:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                <div className="bg-[#1c1a17] p-2.5 rounded-lg border border-[#302c25]">
                  <strong className="text-amber-400 block mb-0.5">1. CAD (Computer Aided Design)</strong>
                  <span className="text-stone-400">Partea de proiectare și desen 3D (unde desenezi mobilă, cutii, piese tehnice, îmbinări de lemn de la zero).</span>
                </div>
                <div className="bg-[#1c1a17] p-2.5 rounded-lg border border-[#302c25]">
                  <strong className="text-sky-400 block mb-0.5">2. CAM (Computer Aided Manufacturing)</strong>
                  <span className="text-stone-400">Partea care calculează traseele frezei CNC și generează fișierul G-code (G0, G1, M3 etc.) pentru utilaj.</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#141312] p-4 rounded-xl border border-[#2e2a24] flex flex-col gap-2">
            <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1.5 uppercase">
              <HelpCircle className="w-4 h-4" />
              Aveți nevoie de Fusion 360 pentru sculptura de icoane?
            </h4>
            <p className="text-stone-300">
              <strong className="text-emerald-400">RĂSPUNS: Nu neapărat!</strong> Aplicația noastră <em>CNC WoodCraft Studio PWA</em> include deja propriul motor CAM complet automatizat. Vă transformă direct fotografia în relief 3D și generează fișierul G-code gata de tăiere cu 1 singur click, fără să fie nevoie să învățați un program uriaș și complicat.
            </p>
            <p className="text-stone-400">
              <strong>CÂND MERITĂ SĂ FOLOSIȚI FUSION 360?</strong> Când doriți să proiectați rame exterioare masive, suporturi de candelă, piese de mobilier pe care să încorporați icoana, sau când vreți strategii avansate de degroșare în 2 etape pe lemn de esență tare (stejar uscat).
            </p>
          </div>

          {/* Ghidul pas cu pas în Fusion 360 */}
          <div className="bg-[#141312] p-4 rounded-xl border border-[#2e2a24] flex flex-col gap-3">
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase">
              <Wrench className="w-4 h-4 text-amber-500" />
              Ghid Pas cu Pas: Cum prelucrezi fișierul STL generat din PWA în Fusion 360
            </h4>

            <div className="space-y-3 text-stone-300">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-sky-700 text-white font-bold flex items-center justify-center flex-shrink-0 text-[11px]">1</span>
                <div>
                  <strong className="text-white block">Descărcați fișierul .STL din aplicația noastră</strong>
                  <span>Apăsați butonul <em>„Export STL 3D”</em> din panoul 3D. Obțineți un fișier 3D solid închis (watertight).</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-sky-700 text-white font-bold flex items-center justify-center flex-shrink-0 text-[11px]">2</span>
                <div>
                  <strong className="text-white block">Importul în Fusion 360</strong>
                  <span>Deschideți Fusion 360 &gt; mergeți în bara de sus la meniul <strong>Mesh</strong> &gt; apăsați <strong>Insert Mesh</strong> &gt; alegeți fișierul STL descărcat &gt; alegeți unitățile în <strong>Millimeter</strong>.</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-sky-700 text-white font-bold flex items-center justify-center flex-shrink-0 text-[11px]">3</span>
                <div>
                  <strong className="text-white block">Trecerea în modul CAM (Manufacture)</strong>
                  <span>În stânga sus, schimbați spațiul de lucru din <strong>Design</strong> în <strong>Manufacture</strong>.</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-sky-700 text-white font-bold flex items-center justify-center flex-shrink-0 text-[11px]">4</span>
                <div>
                  <strong className="text-white block">Crearea unui Setup (Configurație Mașină)</strong>
                  <span>Apăsați pe butonul galben <strong>New Setup</strong>. Asigurați-vă că axa <strong>Z</strong> indică în sus spre tavan, iar Originea (WCS) este setată pe colțul stânga-față de sus al piesei (Box Point).</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-sky-700 text-white font-bold flex items-center justify-center flex-shrink-0 text-[11px]">5</span>
                <div>
                  <strong className="text-white block">Operația de Degroșare (3D Adaptive Clearing)</strong>
                  <span>Alegeți <strong>3D &gt; Adaptive Clearing</strong>. Selectați o freză cilindrică de 6 mm sau 4 mm. La tabul <em>Passes</em>, lăsați <em>Stock to Leave</em> = 0.5 mm (pentru a nu strica detaliile icoanei la viteze mari).</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-sky-700 text-white font-bold flex items-center justify-center flex-shrink-0 text-[11px]">6</span>
                <div>
                  <strong className="text-white block">Operația de Finisare (3D Parallel / 3D Scallop)</strong>
                  <span>Alegeți <strong>3D &gt; Parallel</strong>. Selectați o freză <strong>Ball-Nose</strong> (ex: 3.175 mm sau 2 mm). Setați <em>Stepover</em> la 0.25 mm. Aceasta va sculpta toate fețele, cutele și nimbul fin.</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-sky-700 text-white font-bold flex items-center justify-center flex-shrink-0 text-[11px]">7</span>
                <div>
                  <strong className="text-white block">Post Process (Generare G-Code)</strong>
                  <span>Apăsați <strong>Post Process</strong> (icoana NC din dreapta). Alegeți post-procesorul compatibil cu utilajul dumneavoastră (ex: <em>Grbl / grbl.cps</em> sau <em>Mach3Mill / mach3mill.cps</em>) și salvați fișierul pe stick sau trimiteți-l prin aplicația noastră!</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECȚIUNEA 3: VIDEO-URI EXPLICATIVE */}
      {activeSection === 'videos' && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Player Video Integrat */}
            <div className="lg:col-span-2 bg-[#12110f] rounded-xl overflow-hidden border border-[#2e2a24] flex flex-col">
              <div className="relative aspect-video w-full bg-black">
                <iframe
                  className="w-full h-full"
                  src={`https://www.youtube-nocookie.com/embed/${selectedVideo}?rel=0&modestbranding=1`}
                  title="Tutorial Video CNC Wood Carving"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <div className="p-3">
                <span className="text-xs font-bold text-amber-400 block mb-0.5">
                  {videos.find(v => v.id === selectedVideo)?.title}
                </span>
                <span className="text-[11px] text-stone-400">
                  {videos.find(v => v.id === selectedVideo)?.desc}
                </span>
              </div>
            </div>

            {/* Listă Video-uri */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-1">
                Alegeți Lecția Video:
              </span>
              {videos.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVideo(v.id)}
                  className={`p-2.5 rounded-xl border text-left transition flex items-start gap-2.5 ${selectedVideo === v.id ? 'bg-[#29241d] border-amber-600/70 shadow-lg' : 'bg-[#141312] border-[#2e2a24] hover:bg-[#1f1d19]'}`}
                >
                  <PlayCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${selectedVideo === v.id ? 'text-amber-500' : 'text-stone-500'}`} />
                  <div>
                    <strong className={`text-xs block leading-snug ${selectedVideo === v.id ? 'text-amber-300' : 'text-stone-200'}`}>
                      {v.title}
                    </strong>
                    <div className="flex items-center gap-2 text-[10px] text-stone-500 mt-1">
                      <span>{v.author}</span>
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

      {/* SECȚIUNEA 4: SFATURI SPECIFICE LEMN & ICOANE */}
      {activeSection === 'wood' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="bg-[#141312] p-3.5 rounded-xl border border-[#2e2a24] flex flex-col gap-2">
            <span className="font-bold text-amber-400 text-sm">🪵 Lemnul de Tei (Ideal Icoane)</span>
            <p className="text-stone-300">
              Teiul este lemnul tradițional utilizat de secole în iconografia bizantină și ortodoxă.
            </p>
            <ul className="list-disc list-inside text-stone-400 space-y-1">
              <li>Are o fibră omogenă, foarte fină și densă.</li>
              <li>Nu așchiază la frezare și permite detalii minuscule pe chipul sfinților și nimb.</li>
              <li>Viteză recomandată: avans <strong>1500–2200 mm/min</strong>, turație arbore <strong>18.000 RPM</strong>.</li>
            </ul>
          </div>

          <div className="bg-[#141312] p-3.5 rounded-xl border border-[#2e2a24] flex flex-col gap-2">
            <span className="font-bold text-amber-400 text-sm">🌳 Lemnul de Stejar & Frasin</span>
            <p className="text-stone-300">
              Esențe tari, cu fibră vizibilă și nobilă, ideale pentru cruci sculptate și rame masive.
            </p>
            <ul className="list-disc list-inside text-stone-400 space-y-1">
              <li>Necesită freze cu carbură de înaltă calitate (Solid Carbide).</li>
              <li>Adâncimea pe trecere trebuie redusă (degroșare cu pas mic de 1.5–2.5 mm).</li>
              <li>Finisajul final cu ulei de in fiert sau ceară de albine evidențiază relieful spectaculos.</li>
            </ul>
          </div>

          <div className="bg-[#141312] p-3.5 rounded-xl border border-[#2e2a24] flex flex-col gap-2">
            <span className="font-bold text-amber-400 text-sm">✨ Tehnica Finisării Icoanelor</span>
            <p className="text-stone-300">
              Cum scoateți în evidență basorelieful după frezarea pe CNC:
            </p>
            <ul className="list-disc list-inside text-stone-400 space-y-1">
              <li><strong>Șlefuire fină</strong>: Folosiți burete abraziv granulație 320–400 doar pe zonele plate.</li>
              <li><strong>Patinare / Antichizare</strong>: Aplicați baiț pe bază de apă mai închis în adâncituri, apoi ștergeți ușor vârfurile pentru a crea contrast și profunzime.</li>
              <li><strong>Poleire nimb</strong>: Puteți aplica foiță de aur sau schlagmetall pe nimbul scos în relief.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
