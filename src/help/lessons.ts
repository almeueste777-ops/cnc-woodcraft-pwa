import type { LessonId } from './knowledge'
import type { AppMode } from '../types/cnc'

export type VisualId =
  | 'pipeline' | 'heightmap' | 'bits' | 'stepover' | 'roughing' | 'origin'
  | 'zeroZ' | 'clamp' | 'sim' | 'checklist' | 'dimensions' | 'finish' | 'feeds'

export interface Scene {
  title: string
  text: string            // narațiune + subtitrare
  visual: VisualId
  items?: string[]        // pentru listele animate
  action?: { label: string; mode: AppMode }
}

export interface Lesson {
  id: LessonId
  title: string
  summary: string
  scenes: Scene[]
}

export const LESSONS: Lesson[] = [
  {
    id: 'intro',
    title: '1. Cum ajunge o icoană din poză în lemn',
    summary: 'Drumul complet, în 5 pași, înainte de orice buton.',
    scenes: [
      { title: 'Drumul complet', visual: 'pipeline', text: 'O sculptură pe CNC trece prin cinci pași: imaginea, relieful, traseele frezei, verificarea în simulator și, abia la final, mașina. Aplicația te duce prin toți, în ordinea asta.' },
      { title: 'Imaginea devine relief', visual: 'heightmap', text: 'Calculatorul nu vede sfinți și veșminte, vede lumină și umbră. Din ele face o hartă de înălțimi: ce e luminos iese în relief, ce e întunecat coboară în lemn.' },
      { title: 'Relieful devine trasee', visual: 'roughing', text: 'Apoi aplicația calculează pe unde trece freza: întâi o degroșare care scoate grosul de lemn în trepte, apoi o finisare fină cu o freză sferică, rând lângă rând.' },
      { title: 'Verifici, apoi tai', visual: 'sim', text: 'Înainte să pornești mașina, vezi totul în simulator: lemnul se sculptează pe ecran exact cum se va sculpta în realitate. Dacă ceva e greșit, simulatorul se oprește și îți arată linia.' },
      { title: 'Ce urmează', visual: 'checklist', items: ['Alege imaginea', 'Pune dimensiunile', 'Alege mașina și frezele', 'Calculează și simulează', 'Pregătește mașina și pornește'], text: 'În lecțiile următoare luăm fiecare pas pe rând. La fiecare pas ai un buton care te duce direct în locul potrivit din aplicație.' }
    ]
  },
  {
    id: 'image',
    title: '2. Alegerea și pregătirea imaginii',
    summary: 'Ce poză merge bine, ce mod de relief alegi și ce fac glisoarele.',
    scenes: [
      { title: 'Ce poză alegi', visual: 'heightmap', text: 'Alege o imagine clară, cât mai mare, fără reflexii de sticlă sau de lac. O icoană fotografiată drept, cu lumină egală, dă cel mai bun relief. Poți încărca și un model 3D în format STL, dacă ai cumpărat sau descărcat unul.', action: { label: 'Încarcă o imagine', mode: 'relief3d' } },
      { title: 'Modul Smart Icoană', visual: 'heightmap', text: 'Pentru icoane folosește modul Smart Icoană. El dă volum chipului și trupului și nu lasă zonele întunecate, ca barba, părul sau ochii, să devină gropi.' },
      { title: 'Protecția zonelor negre', visual: 'heightmap', text: 'Dacă barba sau ochii apar ca găuri în modelul 3D, mărește glisorul Protecție Zone Negre. Dacă chipul e prea plat, mărește Volum Convex Corp și Chip. Dacă fundalul nu coboară, mărește Separare Fundal.' },
      { title: 'Model 3D gata făcut', visual: 'pipeline', text: 'Dacă ai un fișier STL sau o hartă de adâncime în tonuri de gri, alege modul Model 3D, Adâncime. Atunci înălțimile se folosesc exact, fără nicio interpretare artistică.' }
    ]
  },
  {
    id: 'dimensions',
    title: '3. Dimensiuni, adâncime și grosimea lemnului',
    summary: 'Cât de mare, cât de adânc, și de ce contează baza.',
    scenes: [
      { title: 'Lățime și înălțime', visual: 'dimensions', text: 'Lățimea și înălțimea sunt dimensiunile reale ale sculpturii, în milimetri. Când schimbi lățimea, înălțimea se potrivește singură după proporțiile imaginii.' },
      { title: 'Adâncimea reliefului', visual: 'dimensions', text: 'Adâncimea reliefului e diferența dintre punctul cel mai înalt și cel mai jos. Pentru o icoană de 20 pe 30 de centimetri, între 8 și 16 milimetri arată bine. Mai adânc înseamnă mai mult timp și freze mai lungi.' },
      { title: 'Baza', visual: 'dimensions', text: 'Sub relief rămâne o bază de lemn plin. Grosimea plăcii tale trebuie să fie cel puțin adâncimea plus baza. Aplicația îți arată grosimea necesară în panoul Trasee CNC.', action: { label: 'Mergi la dimensiuni', mode: 'relief3d' } }
    ]
  },
  {
    id: 'tools',
    title: '4. Frezele: care la ce folosește',
    summary: 'Dreaptă, sferică, V — și cum alegi avansul și turația.',
    scenes: [
      { title: 'Trei forme de freză', visual: 'bits', text: 'Freza dreaptă are vârful plat și scoate repede mult material: e pentru degroșare. Freza sferică are vârful rotund și lasă o suprafață lină: e pentru finisarea reliefului. Freza în V face linii fine și litere.' },
      { title: 'Freza conică-sferică', visual: 'bits', text: 'Pentru chipuri, mâini și litere mici se folosește freza conică cu vârf sferic, de exemplu cu vârful de jumătate de milimetru. Vârful fin intră în detalii, iar conul gros o face mult mai rezistentă decât o freză subțire dreaptă. Aplicația îi calculează exact forma, ca flancul conului să nu atingă relieful.' },
      { title: 'Pasul lateral', visual: 'stepover', text: 'Pasul lateral e distanța dintre două treceri vecine ale frezei. La freza sferică, între 8 și 12 la sută din diametru lasă suprafața aproape fără urme. Pas mai mare înseamnă timp mai scurt, dar dungi mai vizibile.' },
      { title: 'Avans și turație', visual: 'feeds', text: 'Avansul e cât de repede merge freza prin lemn, turația e cât de repede se învârte. Dacă freza merge prea încet la turație mare, freacă și arde lemnul. Dacă merge prea repede, se poate rupe. Pentru o freză de 3 milimetri în tei, cam 2000 de milimetri pe minut la 18000 de rotații e un început bun.' },
      { title: 'Montarea frezei', visual: 'zeroZ', text: 'Bagă freza în bucșă cât mai adânc, dar fără să atingă partea tăietoare, și strânge bine. O freză care iese prea mult vibrează și se rupe mai ușor.' }
    ]
  },
  {
    id: 'toolpaths',
    title: '5. Calculul traseelor: degroșare și finisare',
    summary: 'De ce două trasee, ce înseamnă adaosul și cum alegi mașina.',
    scenes: [
      { title: 'De ce degroșare', visual: 'roughing', text: 'O freză fină nu are voie să intre dintr-odată 15 milimetri în lemn: s-ar rupe. De aceea întâi o freză dreaptă și groasă coboară în trepte, câțiva milimetri odată, și scoate grosul.' },
      { title: 'Adaosul', visual: 'roughing', text: 'Degroșarea lasă peste tot o pojghiță de lemn, de o jumătate de milimetru. Asta e adaosul. Finisarea o ia apoi cu freza sferică, într-o singură trecere curată.' },
      { title: 'Finisarea', visual: 'stepover', text: 'La finisare freza sferică merge rând lângă rând peste tot relieful. Aplicația calculează fiecare punct ținând cont de forma frezei, ca marginile ei să nu taie în sculptură.' },
      { title: 'Decuparea cu punți', visual: 'clamp', text: 'La final poți scoate icoana din placă, de exemplu după forma bolții. Freza taie prin toată grosimea, dar lasă câteva punți mici care țin piesa pe loc. Pune o placă de sacrificiu sub lemn: freza intră trei zecimi de milimetru în ea, ca tăietura să fie completă.' },
      { title: 'Piese mai mari decât mașina', visual: 'origin', text: 'Dacă icoana e mai mare decât cursa mașinii, scrie cursa în panou. Aplicația o împarte în bucăți și face câte un fișier pentru fiecare. La fiecare bucată nouă muți placa sub mașină, astfel încât colțul din stânga jos al bucății să ajungă în cursa ei, apoi refaci X0 Y0 pe acel colț și Z0.' },
      { title: 'Alege-ți mașina', visual: 'checklist', items: ['GRBL — routere hobby 3018, 6040', 'Mach3 / Mach4 — PC cu port paralel sau UC100', 'RichAuto — telecomanda DSP', 'Weihong / NK — routere industriale', 'Marlin — CNC făcut din imprimantă 3D'], text: 'În panoul Mașina, controlerul tău, alege tipul de controler. Fiecare înțelege un dialect puțin diferit de G-code, iar aplicația scrie fișierul exact pe limba mașinii tale.', action: { label: 'Deschide panoul Trasee CNC', mode: 'relief3d' } }
    ]
  },
  {
    id: 'simulate',
    title: '6. Simulatorul: vezi piesa înainte să tai',
    summary: 'Cum citești simularea și ce faci când găsește o problemă.',
    scenes: [
      { title: 'Lemnul se sculptează pe ecran', visual: 'sim', text: 'Simulatorul citește exact fișierul care va ajunge la mașină și îl execută: freza coboară, merge, scoate lemnul. Poți grăbi timpul, poți derula și poți urmări freza de aproape.', action: { label: 'Deschide simulatorul', mode: 'simulator' } },
      { title: 'Când găsește o problemă', visual: 'checklist', items: ['Deplasare rapidă prin lemn = coliziune', 'Tăiere sub grosimea plăcii = intră în masa mașinii', 'Plonjeu adânc în lemn plin = freza se arde sau se rupe', 'Tăiere în afara plăcii = originea e greșită'], text: 'Dacă apare o problemă, simularea se oprește singură, cu un mesaj roșu și linia din fișier. Apasă pe mesaj ca să vezi exact momentul.' },
      { title: 'Verificarea completă', visual: 'sim', text: 'Butonul Verifică tot programul acum trece prin tot fișierul în câteva secunde, fără să aștepți animația. Pornește mașina doar când îți spune că nu sunt probleme.' },
      { title: 'Fișiere din alte programe', visual: 'pipeline', text: 'Poți verifica și fișiere făcute în Aspire, ArtCAM sau Fusion: alege Fișier G-code din alt program, spune unde e originea și ce freză folosești.' }
    ]
  },
  {
    id: 'machine-setup',
    title: '7. Pregătirea mașinii și prinderea lemnului',
    summary: 'Masa, prinderea plăcii, conectarea și siguranța.',
    scenes: [
      { title: 'Prinde lemnul bine', visual: 'clamp', text: 'Placa nu are voie să se miște nici un milimetru. Prinde-o cu cleme pe toate laturile sau cu șuruburi în colțuri, în afara zonei sculptate. Clemele trebuie să fie mai joase decât înălțimea de siguranță a frezei.' },
      { title: 'Conectarea', visual: 'pipeline', text: 'Conectează cablul USB și apasă Conectare CNC. Merge în Chrome sau Edge. Dacă mașina are alarmă la pornire, apasă Homing, sau Deblocare Alarmă dacă nu are senzori de capăt.', action: { label: 'Deschide Control CNC', mode: 'controller' } },
      { title: 'Siguranța', visual: 'checklist', items: ['Ochelari de protecție', 'Antifoane: un spindle la 18000 rpm e foarte zgomotos', 'Aspirație pentru praf', 'Nu pleca de lângă mașină cât lucrează', 'Știi unde e butonul de oprire'], text: 'Poartă ochelari și antifoane, pornește aspirația și nu lăsa mașina singură. Butonul roșu STOP DE URGENȚĂ din Control CNC trimite comanda de oprire către controler; e o oprire prin program, nu una electrică, așa că ține la îndemână și butonul de oprire al mașinii sau priza.' }
    ]
  },
  {
    id: 'zeroing',
    title: '8. Originea: X0, Y0 și Z0',
    summary: 'Pasul cel mai important: de unde pornește mașina.',
    scenes: [
      { title: 'Originea XY', visual: 'origin', text: 'Originea e punctul de unde mașina își măsoară toate mișcările. În aplicație ai ales unde e: colțul din stânga jos, centrul sau colțul din stânga sus. Pe mașină trebuie să duci freza exact în același punct al plăcii.' },
      { title: 'Setarea X0 Y0', visual: 'origin', text: 'Mută freza cu săgețile până deasupra colțului ales, apoi apasă Setează X0 Y0. Nu mai muta originea între degroșare și finisare.' },
      { title: 'Z0 cu foaia de hârtie', visual: 'zeroZ', text: 'Pune o foaie de hârtie pe lemn. Coboară freza cu pas de zero virgulă unu milimetri până când hârtia abia se mai poate trage de sub ea. Atunci apasă Setează Doar Zero Z. Refă Z0 de fiecare dată când schimbi freza, dar nu și X0 Y0.', action: { label: 'Deschide Control CNC', mode: 'controller' } }
    ]
  },
  {
    id: 'run',
    title: '9. Pornirea lucrării și ce faci dacă apare ceva',
    summary: 'Primul minut, pauza, oprirea și mesajele mașinii.',
    scenes: [
      { title: 'Lista dinainte de pornire', visual: 'checklist', items: ['Lemnul prins bine', 'Freza potrivită, strânsă', 'X0 Y0 și Z0 setate', 'Simularea fără probleme', 'Aspirația pornită'], text: 'Când apeși Trimite la CNC, aplicația îți arată o listă scurtă. Bifează fiecare punct. Nu e birocrație: fiecare rând corespunde unei greșeli care strică piese.' },
      { title: 'Primul minut', visual: 'sim', text: 'Stai cu mâna aproape de pauză în primul minut. Freza trebuie să coboare unde te aștepți, la adâncimea la care te aștepți. Dacă nu, apasă Pauză sau Stop.' },
      { title: 'Mesajele mașinii', visual: 'checklist', items: ['ALARM — mașina s-a oprit singură', 'error — nu a înțeles o linie', 'Explicația apare automat, în română', 'Cu pașii de rezolvare'], text: 'Dacă mașina trimite o eroare sau o alarmă, aplicația îți arată imediat ce înseamnă și ce ai de făcut. Toate le găsești și în Probleme și Soluții.', action: { label: 'Deschide Probleme & Soluții', mode: 'help' } }
    ]
  },
  {
    id: 'finish',
    title: '10. Finisarea piesei după frezare',
    summary: 'Curățare, șlefuire ușoară, ulei sau ceară.',
    scenes: [
      { title: 'Curățarea', visual: 'finish', text: 'Scoate praful cu o perie moale și aer. Fibrele ridicate se iau cu o perie de alamă sau cu un burete abraziv fin, în sensul fibrei.' },
      { title: 'Șlefuirea', visual: 'finish', text: 'Pe suprafețele mari folosește hârtie de 240, apoi 320, ușor, fără să rotunjești detaliile. În zonele fine, ca ochii și degetele, nu șlefui deloc.' },
      { title: 'Protecția', visual: 'finish', text: 'Pentru icoane, uleiul de in fiert sau ceara de albine scot în evidență relieful. Aplică subțire, lasă să intre, apoi șterge excesul. Dacă urmează aurire sau pictură, pregătește suprafața după tehnica respectivă.' }
    ]
  }
]

export function getLesson(id: LessonId): Lesson {
  return LESSONS.find(l => l.id === id) ?? LESSONS[0]
}

/** Durata unei scene: cât ar dura citită cu voce tare, minim 5 secunde */
export function sceneDurationSec(s: Scene): number {
  const words = s.text.split(/\s+/).length
  return Math.max(5, words / 2.4 + 1)
}
