// Bază de cunoștințe pentru depanare (CNC pentru icoane în lemn).
// Codurile GRBL 1.1 au fost verificate față de depozitul oficial gnea/grbl:
//   doc/csv/error_codes_en_US.csv și doc/csv/alarm_codes_en_US.csv.
// Textele sunt în română, pentru un începător.

export interface FixStep {
  text: string
}

export type LessonId =
  | 'intro'
  | 'image'
  | 'dimensions'
  | 'tools'
  | 'toolpaths'
  | 'simulate'
  | 'machine-setup'
  | 'zeroing'
  | 'run'
  | 'finish'

export interface Problem {
  id: string
  title: string
  symptoms: string[]
  causes: string[]
  fixes: string[]
  category: 'surface' | 'machine' | 'tool' | 'software' | 'safety' | 'connection'
  lessonId?: LessonId
}

export interface ControllerCode {
  code: string
  short: string
  explanation: string
  fixes: string[]
  lessonId?: LessonId
}

function cc(
  code: string,
  short: string,
  explanation: string,
  fixes: string[],
  lessonId?: LessonId,
): ControllerCode {
  return lessonId ? { code, short, explanation, fixes, lessonId } : { code, short, explanation, fixes }
}

// ---------------------------------------------------------------------------
// GRBL 1.1 – erori (error:N)
// ---------------------------------------------------------------------------
export const GRBL_ERRORS: Record<number, ControllerCode> = {
  1: cc(
    'error:1',
    'Lipsește litera comenzii',
    'Controlerul a primit o linie în care nu a găsit litera unei comenzi G-code (G, M, X, Y, Z, F etc.). De obicei linia este stricată sau conține caractere care nu sunt G-code.',
    [
      'Verifică dacă ai trimis un fișier G-code adevărat (nu o imagine, nu un fișier text oarecare).',
      'Dacă ai tastat o comandă manual în „Control CNC Direct”, verifică să înceapă cu o literă (ex. G0, $H).',
      'Regenerează fișierul din „Trasee CNC (CAM)” și retrimite-l.',
    ],
    'run',
  ),
  2: cc(
    'error:2',
    'Valoare lipsă sau număr invalid',
    'O literă din comandă nu este urmată de un număr valid (de exemplu „G1 X” fără valoare sau „X1..2”).',
    [
      'Regenerează fișierul G-code; nu îl edita de mână.',
      'Dacă erorile apar pe mai multe linii, verifică setările regionale/zecimale ale programului care a creat fișierul (trebuie punct, nu virgulă).',
    ],
    'run',
  ),
  3: cc(
    'error:3',
    'Comandă $ necunoscută',
    'Comanda care începe cu $ nu există în această versiune de GRBL.',
    [
      'Verifică dacă ai scris corect comanda ($H, $X, $$, $G).',
      'Controlerul tău poate să nu fie GRBL 1.1 – verifică în „Mașina / controlerul tău”.',
    ],
    'machine-setup',
  ),
  4: cc(
    'error:4',
    'Valoare negativă nepermisă',
    'S-a trimis o valoare negativă acolo unde se acceptă doar numere pozitive (ex. o setare $, viteza sau o durată).',
    [
      'Corectează valoarea setării (trebuie să fie pozitivă).',
      'Dacă apare într-un fișier generat, verifică în „Trasee CNC (CAM)” că viteza de avans și turația sunt pozitive.',
    ],
    'machine-setup',
  ),
  5: cc(
    'error:5',
    'Homing-ul nu este activat',
    'Ai cerut ciclul de „homing” ($H), dar mașina nu are homing activat (setarea $22=0). Majoritatea mașinilor 3018 nu au limitatoare, deci nu pot face homing.',
    [
      'Dacă mașina ta NU are limitatoare (3018 obișnuită): nu folosi $H. Deblochează cu $X și setează originea manual.',
      'Dacă are limitatoare montate și funcționale: activează homing cu $22=1.',
      'În „Mașina / controlerul tău” alege profilul fără homing.',
    ],
    'machine-setup',
  ),
  6: cc(
    'error:6',
    'Impuls de pas prea scurt',
    'Setarea duratei impulsului de pas ($0) este sub 3 microsecunde, prea puțin pentru driverele motoarelor.',
    ['Setează $0 la 10 (valoare obișnuită pentru 3018) și salvează.'],
    'machine-setup',
  ),
  7: cc(
    'error:7',
    'Citirea memoriei EEPROM a eșuat',
    'Setările salvate în controler nu au putut fi citite, deci GRBL a revenit la valorile implicite. Setările tale (pași/mm, viteze) s-au pierdut.',
    [
      'Rulează $$ și verifică setările; probabil sunt cele din fabrică.',
      'Reintrodu setările mașinii tale (pași/mm $100–$102, viteze maxime $110–$112, accelerații $120–$122).',
      'Dacă se repetă, placa poate avea o problemă de alimentare sau memorie.',
    ],
    'machine-setup',
  ),
  8: cc(
    'error:8',
    'Comanda $ cere mașina în repaus',
    'Ai trimis o comandă $ (de ex. $H sau o setare) în timp ce mașina se mișcă sau nu este în starea „Idle”.',
    [
      'Așteaptă să se oprească mașina (starea „Idle”) și retrimite.',
      'Dacă e blocată, apasă Reset, apoi $X dacă apare alarma.',
    ],
    'run',
  ),
  9: cc(
    'error:9',
    'G-code blocat în timpul alarmei',
    'Mașina este în alarmă (sau în jogging), iar GRBL refuză orice G-code până nu deblochezi. Este cea mai frecventă eroare după conectare sau după o oprire de urgență.',
    [
      'Dacă mașina are limitatoare: apasă „Homing” ($H).',
      'Dacă nu are limitatoare: apasă „Deblocare” ($X) în „Control CNC Direct”.',
      'Înainte de $X verifică de ce a apărut alarma (de ex. limită atinsă) și că nu există pericol.',
      'După deblocare, reverifică originea (X0 Y0 Z0) înainte de a porni lucrarea.',
    ],
    'machine-setup',
  ),
  10: cc(
    'error:10',
    'Limitele soft cer homing',
    'Ai activat limitele software ($20=1), dar homing-ul nu este activat ($22=0). GRBL nu poate ști unde este mașina fără homing.',
    [
      'Mașină fără limitatoare: setează $20=0.',
      'Mașină cu limitatoare: activează și $22=1 și fă homing la pornire.',
    ],
    'machine-setup',
  ),
  11: cc(
    'error:11',
    'Linie prea lungă',
    'Linia de G-code a depășit numărul maxim de caractere pe care îl acceptă GRBL (aprox. 80) și nu a fost executată.',
    [
      'Regenerează fișierul cu postprocesorul GRBL ales în „Mașina / controlerul tău”.',
      'Nu lipi comentarii lungi în fișier; elimină-le.',
    ],
    'machine-setup',
  ),
  12: cc(
    'error:12',
    'Setări care depășesc 30 kHz',
    'Combinația dintre pași/mm și viteza maximă ar cere mai mult de 30 000 de pași pe secundă; GRBL nu poate genera atâția.',
    [
      'Redu viteza maximă ($110–$112) sau verifică dacă pașii/mm ($100–$102) sunt corecți.',
      'O valoare greșită la pași/mm este cauza obișnuită.',
    ],
    'machine-setup',
  ),
  13: cc(
    'error:13',
    'Ușa de siguranță deschisă',
    'GRBL crede că ușa/protecția de siguranță este deschisă (intrarea „door” este activă).',
    [
      'Dacă mașina ta are un contact de ușă, închide ușa.',
      'Dacă nu are, verifică firele de la pinul „door” (poate fi un fir liber care captează zgomot).',
    ],
    'machine-setup',
  ),
  14: cc(
    'error:14',
    'Linie prea lungă pentru memorie',
    'Linia de pornire sau informația de build a depășit limita de lungime din memoria EEPROM.',
    ['Scurtează linia salvată ($N0, $N1) sau șterge-o.'],
    'machine-setup',
  ),
  15: cc(
    'error:15',
    'Deplasarea (jog) depășește cursa',
    'Ai cerut o mișcare manuală (jog) mai mare decât cursa mașinii, deci a fost ignorată.',
    [
      'Fă pași mai mici în „Control CNC Direct”.',
      'Verifică dacă poziția mașinii nu este deja la capăt; revino spre centru.',
      'Dacă limitele soft sunt active, verifică și $130–$132 (cursa maximă a axelor).',
    ],
    'zeroing',
  ),
  16: cc(
    'error:16',
    'Comandă de jog invalidă',
    'Comanda de jog nu are semnul „=” sau conține G-code interzis în jog.',
    ['Folosește butoanele de deplasare din „Control CNC Direct” în loc de comenzi scrise de mână.'],
    'zeroing',
  ),
  17: cc(
    'error:17',
    'Modul laser cere PWM',
    'Modul laser ($32=1) nu poate fi pornit fiindcă ieșirea PWM/turație nu este activată.',
    [
      'Pentru laser: activează PWM (variabilă la compilare) sau folosește firmware potrivit.',
      'Pentru freză (spindle): setează $32=0.',
    ],
    'machine-setup',
  ),
  20: cc(
    'error:20',
    'Comandă G-code nesuportată',
    'Fișierul conține o comandă pe care GRBL nu o cunoaște sau nu o acceptă (de ex. schimb de sculă M6, ciclu fix G81, compensare de rază). De obicei înseamnă că fișierul a fost făcut pentru alt controler.',
    [
      'În „Mașina / controlerul tău” alege postprocesorul GRBL (nu Mach3, nu Marlin, nu RichAuto) și regenerează fișierul.',
      'Notează numărul liniei unde s-a oprit și verifică ce comandă conține.',
      'Dacă mașina nu are schimbător de sculă, nu folosi M6 – dezactivează schimbul în „Trasee CNC (CAM)”.',
    ],
    'machine-setup',
  ),
  21: cc(
    'error:21',
    'Două comenzi din același grup',
    'O singură linie conține două comenzi care se exclud (de ex. G0 și G1, sau G90 și G91 pe aceeași linie).',
    ['Regenerează fișierul cu postprocesorul GRBL; evită editarea manuală a liniilor.'],
    'machine-setup',
  ),
  22: cc(
    'error:22',
    'Viteza de avans lipsește',
    'S-a cerut o mișcare de tăiere (G1, G2, G3) fără ca vreodată să fie stabilită viteza F (avans).',
    [
      'Verifică în „Trasee CNC (CAM)” că viteza de avans este setată (ex. 1500 mm/min pentru lemn cu freză sferică 3,175 mm).',
      'Regenerează fișierul; nu trimite linii izolate din mijlocul programului.',
    ],
    'toolpaths',
  ),
  23: cc(
    'error:23',
    'Comanda cere număr întreg',
    'O comandă G sau M are o valoare cu zecimale unde trebuie un număr întreg (de ex. „G1.5” sau „M3.5”). Atenție: la G4 P zecimalele sunt permise.',
    ['Regenerează fișierul cu postprocesorul GRBL și evită editarea manuală.'],
    'machine-setup',
  ),
  24: cc(
    'error:24',
    'Două comenzi cu axe pe aceeași linie',
    'Linia conține două comenzi care folosesc amândouă cuvinte de axă (X, Y, Z), de ex. G1 și G28 împreună.',
    [
      'Postprocesorul trimite un format necorespunzător: alege GRBL în „Mașina / controlerul tău”.',
      'Împarte linia în două dacă ai scris-o manual.',
    ],
    'machine-setup',
  ),
  25: cc(
    'error:25',
    'Cuvânt G-code repetat',
    'Același cuvânt (de ex. două X sau două F) apare de două ori în aceeași linie.',
    ['Regenerează fișierul; dacă l-ai editat manual, șterge dublura.'],
    'machine-setup',
  ),
  26: cc(
    'error:26',
    'Lipsesc axele cerute',
    'O comandă care are nevoie de coordonate (X, Y sau Z) a fost trimisă fără ele.',
    ['Regenerează fișierul din „Trasee CNC (CAM)”.', 'Verifică dacă fișierul nu s-a trunchiat la transfer.'],
    'run',
  ),
  27: cc(
    'error:27',
    'Număr de linie invalid',
    'Numărul de linie N este negativ sau prea mare.',
    ['Dezactivează numerotarea liniilor din postprocesor sau regenerează fișierul.'],
    'machine-setup',
  ),
  28: cc(
    'error:28',
    'Lipsește o valoare necesară',
    'O comandă a fost trimisă fără cuvântul P sau L de care are nevoie (de ex. „G10 L20” fără P, sau „G4” fără P).',
    ['Regenerează fișierul; nu trimite manual comenzi incomplete.'],
    'machine-setup',
  ),
  29: cc(
    'error:29',
    'Sisteme G59.x nesuportate',
    'GRBL 1.1 acceptă doar G54–G59; coordonatele de lucru G59.1, G59.2, G59.3 nu sunt suportate.',
    ['Folosește G54 (valoarea implicită). În postprocesor nu activa alte sisteme de coordonate.'],
    'machine-setup',
  ),
  30: cc(
    'error:30',
    'G53 doar cu G0 sau G1',
    'G53 (coordonate absolute de mașină) se poate folosi doar cu mișcări rapide G0 sau de tăiere G1.',
    ['Folosește postprocesorul GRBL; evită G53 în fișiere create manual.'],
    'machine-setup',
  ),
  31: cc(
    'error:31',
    'Axe fără comandă activă',
    'Linia are coordonate X/Y/Z, dar nicio comandă activă nu le folosește.',
    ['Regenerează fișierul; verifică să nu lipsească G0/G1 la începutul liniei.'],
    'run',
  ),
  32: cc(
    'error:32',
    'Arc fără axe în plan',
    'Un arc G2 sau G3 nu are nicio coordonată din planul curent (de ex. X sau Y în planul XY).',
    ['Regenerează fișierul. Dacă erorile persistă, dezactivează arcele în „Trasee CNC (CAM)” (folosește segmente drepte).'],
    'toolpaths',
  ),
  33: cc(
    'error:33',
    'Țintă de mișcare invalidă',
    'Mișcarea cerută nu poate fi calculată: de exemplu un arc cu rază imposibilă, sau coordonate care lipsesc ori sunt incorecte.',
    [
      'Cel mai des este o problemă a arcelor G2/G3 generate: dezactivează arcele în „Trasee CNC (CAM)” și regenerează.',
      'Verifică în „Simulare frezare” că traseul arată normal.',
      'Alege postprocesorul GRBL în „Mașina / controlerul tău”.',
    ],
    'toolpaths',
  ),
  34: cc(
    'error:34',
    'Rază de arc invalidă',
    'La un arc în format rază (R), distanța dintre punctul de start și final este mai mare decât diametrul arcului, deci arcul nu există.',
    ['Fișierele făcute de aplicație nu conțin arce (doar linii drepte), deci eroarea vine dintr-un fișier făcut în alt program: regenerează-l acolo cu arcele transformate în linii, sau cu altă toleranță de arc.'],
    'toolpaths',
  ),
  35: cc(
    'error:35',
    'Arc fără decalaje I/J/K',
    'Un arc G2/G3 în format centru (I, J, K) nu are niciun decalaj în planul curent.',
    ['Regenerează fișierul cu postprocesorul GRBL sau dezactivează arcele.'],
    'toolpaths',
  ),
  36: cc(
    'error:36',
    'Valori nefolosite pe linie',
    'Linia are cuvinte cu valori pe care nicio comandă nu le folosește (de ex. un I sau J pe o linie fără arc).',
    ['Regenerează fișierul; șterge cuvintele în plus dacă ai editat manual.'],
    'machine-setup',
  ),
  37: cc(
    'error:37',
    'Corecție de sculă G43.1 pe axă greșită',
    'Corecția dinamică de lungime a sculei (G43.1) nu este aplicată axei configurate pentru lungimea sculei (Z).',
    ['Nu folosi G43.1 decât pe axa Z; de obicei nu este nevoie de ea la un CNC de hobby.'],
    'machine-setup',
  ),
  38: cc(
    'error:38',
    'Număr de sculă prea mare',
    'Numărul sculei (T) depășește valoarea maximă suportată.',
    ['Folosește T1 sau elimină comanda T din fișier. Schimbă sculele manual, la pauza programată.'],
    'machine-setup',
  ),
}

// ---------------------------------------------------------------------------
// GRBL 1.1 – alarme (ALARM:N)
// ---------------------------------------------------------------------------
export const GRBL_ALARMS: Record<number, ControllerCode> = {
  1: cc(
    'ALARM:1',
    'Limită hard atinsă',
    'Un limitator (microîntrerupător) de capăt de cursă a fost atins. Mașina s-a oprit și probabil și-a pierdut poziția.',
    [
      'Depărtează manual axa de limitator (dacă e blocată, apasă Reset și deblochează cu $X, apoi mișcă încet).',
      'Refă homing ($H) dacă mașina are limitatoare, sau setează originea din nou, manual.',
      'Verifică în „Origine și siguranță” că lucrarea încape în cursa mașinii.',
      'Dacă alarma apare fără să atingă nimic, firele limitatorului captează zgomot: folosește cablu ecranat sau dezactivează limitele hard ($21=0).',
    ],
    'zeroing',
  ),
  2: cc(
    'ALARM:2',
    'Limită soft depășită',
    'Fișierul cere o mișcare în afara cursei mașinii ($130–$132). GRBL a refuzat-o. Poziția se păstrează, deci alarma se poate șterge fără pericol.',
    [
      'Lucrarea este mai mare decât cursa mașinii sau originea este pusă prea aproape de margine: verifică alegerea originii în „Origine și siguranță”.',
      'Redu dimensiunea piesei în „Model 3D / Adâncime” sau mută originea astfel încât tot traseul să încapă.',
      'Dacă setările de cursă $130–$132 sunt greșite, corectează-le (ex. 3018: aprox. 300 x 180 x 45 mm).',
      'Șterge alarma cu $X și reverifică originea înainte de a relua.',
    ],
    'zeroing',
  ),
  3: cc(
    'ALARM:3',
    'Oprire (reset) în timpul mișcării',
    'Ai apăsat Reset sau mașina a fost resetată în timp ce se mișca. Pozițiile s-au pierdut probabil, deoarece motoarele nu s-au putut opri controlat.',
    [
      'Deblochează cu $X sau fă homing ($H) dacă ai limitatoare.',
      'Reverifică originea (X0 Y0 Z0): ridică Z sus și reia poziționarea.',
      'Nu relua lucrarea de la jumătate fără să reverifici poziția.',
    ],
    'run',
  ),
  4: cc(
    'ALARM:4',
    'Palpator în stare greșită înainte de test',
    'Pentru măsurarea sculei (probe), palpatorul era deja activat înainte să înceapă ciclul.',
    [
      'Verifică dacă clema palpatorului nu atinge scula sau piesa înainte de ciclu.',
      'Verifică cablul palpatorului. Dacă nu ai palpator, setează Z manual.',
    ],
    'zeroing',
  ),
  5: cc(
    'ALARM:5',
    'Palpatorul nu a atins nimic',
    'În ciclul de măsurare Z, scula nu a atins piesa (sau placa palpatorului) pe distanța programată.',
    [
      'Apropie scula manual de piesă înainte de ciclu.',
      'Verifică clema/cablul palpatorului, apoi reia.',
      'Dacă nu ai palpator, setează Z0 manual cu o foaie de hârtie, ca în lecția de originea piesei.',
    ],
    'zeroing',
  ),
  6: cc(
    'ALARM:6',
    'Homing oprit prin reset',
    'Ciclul de homing a fost întrerupt (Reset) înainte să se termine.',
    ['Pornește din nou homing-ul ($H) și nu apăsa Reset cât timp rulează.'],
    'machine-setup',
  ),
  7: cc(
    'ALARM:7',
    'Homing: ușa de siguranță a fost deschisă',
    'Ușa de siguranță s-a deschis în timpul homing-ului.',
    ['Închide ușa/protecția și reia homing-ul. Dacă nu ai ușă, verifică pinul „door”.'],
    'machine-setup',
  ),
  8: cc(
    'ALARM:8',
    'Homing: nu s-a putut retrage de limitator',
    'După ce a atins limitatorul, axa nu s-a putut retrage suficient (distanța „pull-off”, $27).',
    [
      'Mărește $27 (de ex. 2 mm) sau verifică firele limitatorului.',
      'Verifică ca limitatorul să nu rămână apăsat mecanic.',
    ],
    'machine-setup',
  ),
  9: cc(
    'ALARM:9',
    'Homing: limitatorul nu a fost găsit',
    'Ciclul de homing nu a găsit limitatorul pe distanța maximă de căutare. Cauze: limitatorul nu este conectat, sau mașina merge în sens greșit.',
    [
      'Verifică cablurile și dacă limitatorul se activează (poți testa cu $ și starea pinilor, sau cu un deget pe limitator).',
      'Verifică direcția homing ($23) și cursa maximă ($130–$132).',
      'Dacă mașina nu are limitatoare, nu folosi homing; folosește $X.',
    ],
    'machine-setup',
  ),
  10: cc(
    'ALARM:10',
    'Homing: al doilea limitator (axă dublă) nu a răspuns',
    'La mașini cu două motoare pe aceeași axă, al doilea limitator nu s-a activat pe distanța permisă.',
    ['Verifică cablurile ambelor limitatoare și parametrul de distanță pentru axa dublă.'],
    'machine-setup',
  ),
}

// ---------------------------------------------------------------------------
// Alte mesaje de controler (nu GRBL numerotat)
// ---------------------------------------------------------------------------
const MARLIN_UNKNOWN = cc(
  'echo:Unknown command',
  'Comandă necunoscută (Marlin)',
  'Marlin a primit o comandă pe care firmware-ul lui nu o cunoaște. De obicei înseamnă că fișierul a fost făcut pentru alt tip de controler.',
  [
    'În „Mașina / controlerul tău” alege Marlin (MPCNC) și regenerează fișierul.',
    'Marlin nu cunoaște $H sau $X: folosește G28 pentru homing și M999 pentru deblocare după o oprire.',
    'Dacă mesajul apare doar la o linie de comentariu, îl poți ignora.',
  ],
  'machine-setup',
)

const MARLIN_HALTED = cc(
  'Error:Printer halted. kill() called!',
  'Marlin s-a oprit (kill)',
  'Marlin a oprit complet mașina din motive de siguranță (buton de urgență, limită atinsă, eroare gravă sau sensor). Nu mai răspunde la comenzi până nu este repornit.',
  [
    'Oprește mașina, repornește alimentarea și reconectează-te.',
    'Verifică ce a declanșat oprirea: butonul de urgență, un limitator atins sau o temperatură/alimentare greșită.',
    'Reverifică originea înainte de a relua: pozițiile s-au pierdut.',
  ],
  'machine-setup',
)

const MARLIN_LINE_NUMBER = cc(
  'Error:Line Number is not Last Line Number+1',
  'Număr de linie nepotrivit (Marlin)',
  'Marlin a primit o linie cu număr de linie care nu urmează precedentului: s-a pierdut o linie la transfer (cablu, interferențe).',
  [
    'Schimbă cablul USB cu unul scurt și bun, cu ferită.',
    'Reia lucrarea; verifică ca alimentarea să nu aibă zgomot de la freză.',
  ],
  'run',
)

const MARLIN_CHECKSUM = cc(
  'Error:checksum mismatch',
  'Sumă de control greșită (Marlin)',
  'O linie a ajuns stricată prin cablu, deci suma de control nu se potrivește. Marlin cere retrimiterea.',
  ['Verifică cablul USB (scurt, ecranat, cu ferită) și evită să-l treci pe lângă cablurile motorului/frezei.'],
  'run',
)

const GRBL_MSG_RESET = cc(
  '[MSG:Reset to continue]',
  'Reset necesar',
  'GRBL a intrat într-o stare gravă (de ex. limită hard sau oprire în mișcare) și cere resetare.',
  ['Apasă Reset în „Control CNC Direct”, apoi $X sau $H. Reverifică originea.'],
  'machine-setup',
)

const GRBL_MSG_UNLOCK = cc(
  "[MSG:'$H'|'$X' to unlock]",
  'Mașina este blocată',
  'După pornire sau alarmă, GRBL este blocat până faci homing sau deblochezi.',
  ['Dacă ai limitatoare: $H. Dacă nu: $X („Deblocare” în „Control CNC Direct”).'],
  'machine-setup',
)

/**
 * Interpretează o linie primită de la controler și întoarce explicația,
 * sau null dacă linia nu este o eroare/alarmă cunoscută.
 */
export function explainControllerLine(line: string): ControllerCode | null {
  if (!line) return null
  const s = line.trim()
  if (!s) return null

  const err = /^error\s*:\s*(\d+)/i.exec(s)
  if (err) {
    const n = Number(err[1])
    const hit = GRBL_ERRORS[n]
    if (hit) return hit
    return null
  }
  const alarm = /^alarm\s*:\s*(\d+)/i.exec(s)
  if (alarm) {
    const n = Number(alarm[1])
    const hit = GRBL_ALARMS[n]
    if (hit) return hit
    return null
  }
  if (/echo\s*:\s*unknown command/i.test(s)) return MARLIN_UNKNOWN
  if (/printer halted/i.test(s) || /kill\(\)\s*called/i.test(s)) return MARLIN_HALTED
  if (/line number is not last line number/i.test(s)) return MARLIN_LINE_NUMBER
  if (/checksum mismatch/i.test(s)) return MARLIN_CHECKSUM
  if (/reset to continue/i.test(s)) return GRBL_MSG_RESET
  if (/to unlock/i.test(s) && /\$H/.test(s)) return GRBL_MSG_UNLOCK
  return null
}

// ---------------------------------------------------------------------------
// Probleme frecvente
// ---------------------------------------------------------------------------
export const PROBLEMS: Problem[] = [
  {
    id: 'freza-arde-lemnul',
    title: 'Freza arde lemnul (urme negre)',
    symptoms: ['Urme maronii sau negre pe lemn', 'Miros de ars', 'Fum', 'Freza fierbinte, cu rășină lipită'],
    causes: [
      'Avans prea mic față de turație: freza freacă în loc să taie',
      'Turație prea mare',
      'Freză tocită sau cu rășină lipită',
      'Pas lateral prea mic, trece de mai multe ori peste același loc',
      'Lemn rășinos sau esență dură (cireș, stejar)',
    ],
    fixes: [
      'Mărește avansul: pentru freză sferică 3,175 mm în lemn de tei/paltin încearcă 1500–2500 mm/min la 18000 RPM (încărcare aprox. 0,05–0,1 mm/dinte).',
      'Dacă poți, scade turația la 12000–15000 RPM.',
      'Curăță freza de rășină (alcool izopropilic) sau înlocuiește-o dacă este tocită.',
      'Folosește „Pas lateral” de 8–12 % din diametrul sculei, nu mai mic.',
      'Pentru lemnuri rășinoase, folosește freze cu canal în spirală pentru evacuarea așchiilor.',
      'Verifică în „Simulare frezare” că nu trece de două ori prin același loc.',
    ],
    category: 'tool',
    lessonId: 'toolpaths',
  },
  {
    id: 'trepte-terase-relief',
    title: 'Se văd trepte (terase) în relief',
    symptoms: ['Fețele și umerii arată ca niște trepte', 'Linii vizibile ca la curbele de nivel', 'Suprafață în trepte'],
    causes: [
      'S-a făcut doar degroșarea pe niveluri, fără finisare',
      'Finisarea 3D este oprită sau pasul este prea mare',
      'Adaosul lăsat pentru finisare este prea mare',
    ],
    fixes: [
      'Activează „Finisare 3D” cu freză sferică în „Trasee CNC (CAM)”.',
      'Folosește un „Pas lateral” de 8–12 % din diametrul frezei (aprox. 0,3 mm la 3,175 mm).',
      'Pune „Adaos lăsat pentru finisare” de 0,2–0,5 mm la degroșare, ca finisarea să șteargă treptele.',
      'Verifică în „Simulare frezare” înainte de a tăia.',
    ],
    category: 'surface',
    lessonId: 'toolpaths',
  },
  {
    id: 'fibre-zdrentuite',
    title: 'Fibre zdrențuite, lemn smuls',
    symptoms: ['Margini zdrențuite', 'Lemn „păros”', 'Așchii smulse din fibră', 'Margini rupte la lemn moale'],
    causes: [
      'Freză tocită',
      'Avans prea mare pentru lemn moale',
      'Tăiere împotriva fibrei',
      'Lemn umed sau cu fibră răsucită',
    ],
    fixes: [
      'Înlocuiește freza; o freză tocită zdrențuiește chiar la setări bune.',
      'Fă o trecere de finisare cu adaos mic (0,1–0,2 mm) și avans moderat (1200–1800 mm/min).',
      'Orientează fibra lemnului pe axa lungă X, astfel încât tăierea să fie mai curată.',
      'Folosește lemn uscat, bine tratat (tei, paltin, nuc).',
      'Șlefuiește ușor la sfârșit cu șmirghel fin (240–400).',
    ],
    category: 'surface',
    lessonId: 'finish',
  },
  {
    id: 'urme-freza-vizibile',
    title: 'Urmele frezei (valuri) sunt prea vizibile',
    symptoms: ['Valuri paralele', 'Suprafață „solzoasă”', 'Creste fine între treceri'],
    causes: [
      'Pas lateral prea mare',
      'Freză sferică prea mare pentru detaliu',
      'Finisare cu trasee într-o singură direcție',
    ],
    fixes: [
      'Scade „Pas lateral” la 8 % (aprox. 0,25 mm la freză 3,175 mm).',
      'Folosește o freză sferică mai mică (de ex. 1,5 mm) pentru detalii fine.',
      'Pentru fețe, fă finisarea în două direcții (X apoi Y), dacă aplicația permite.',
      'Șlefuiește apoi manual, cu șmirghel 240–400.',
    ],
    category: 'surface',
    lessonId: 'toolpaths',
  },
  {
    id: 'freza-rupta',
    title: 'S-a rupt freza',
    symptoms: ['Pocnet puternic', 'Freză ruptă în lemn', 'Mașina continuă fără să mai taie'],
    causes: [
      'Adâncime de trecere prea mare (stepdown)',
      'Avans prea mare',
      'Freză subțire care se îndoaie',
      'Lemnul s-a mișcat',
      'Z a coborât sub piesă (origine Z greșită)',
    ],
    fixes: [
      'Oprește imediat mașina și scoate freza ruptă din lemn.',
      'Degroșare cu freză de 6 mm: adâncime de trecere cel mult jumătate din diametru (3 mm) în „Degroșare pe niveluri”.',
      'Pentru freze mici (1–3 mm) scade adâncimea la 0,3–1 mm și avansul.',
      'Verifică ca Z0 să fie corect setat pe suprafața piesei.',
      'Fixează bine piesa înainte de reluare.',
    ],
    category: 'tool',
    lessonId: 'tools',
  },
  {
    id: 'pasi-pierduti',
    title: 'Pași pierduți – desenul s-a deplasat',
    symptoms: ['Straturile nu se aliniază', 'Desenul este decalat', 'Cercul nu se închide', 'Revenirea la origine nu este exactă'],
    causes: [
      'Viteză sau accelerație prea mare',
      'Curent insuficient la driverele motoarelor',
      'Curele sau șuruburi slăbite',
      'Frezare prea agresivă (motoare blocate)',
      'Surplus de frecare sau murdărie pe ghidaje',
    ],
    fixes: [
      'Scade avansul și accelerația ($120–$122) cu 20–30 %.',
      'Crește ușor curentul la drivere (Vref) dacă motoarele se încălzesc puțin.',
      'Strânge curelele și cuplajele; lubrifiază ghidajele.',
      'Redu adâncimea de trecere.',
      'Fă un test: mută axa 100 mm și măsoară; ajustează pașii/mm ($100–$102).',
    ],
    category: 'machine',
    lessonId: 'machine-setup',
  },
  {
    id: 'relief-prea-plat',
    title: 'Reliefului îi lipsește adâncimea',
    symptoms: ['Icoana arată plată', 'Detaliile sunt abia vizibile', 'Contrast mic'],
    causes: [
      'Adâncimea totală setată prea mică',
      'Imaginea are contrast slab',
      'Netezirea a șters detaliile',
    ],
    fixes: [
      'Mărește adâncimea în „Model 3D / Adâncime” (de ex. 3–6 mm pentru o icoană în bas-relief).',
      'Folosește „Smart Icoană” sau mărește contrastul imaginii.',
      'Redu „Netezire suprafață” dacă a șters detaliile.',
      'Verifică în „Simulare frezare” înainte de tăiere.',
    ],
    category: 'surface',
    lessonId: 'dimensions',
  },
  {
    id: 'relief-prea-adanc',
    title: 'Relieful este prea adânc',
    symptoms: ['Zone prea adânci', 'Linii subțiri fragile', 'Sculă prea lungă pentru adâncime'],
    causes: ['Adâncime totală prea mare', 'Imaginea are contrast foarte mare', 'Grosime insuficientă a lemnului'],
    fixes: [
      'Redu adâncimea în „Model 3D / Adâncime”.',
      'Verifică că lemnul este mai gros decât adâncimea cerută cu cel puțin 5–10 mm.',
      'Redu contrastul imaginii.',
      'Folosește „Protecție Zone Negre (Anti-Gropi)” pentru a nu săpa prea adânc zonele întunecate.',
    ],
    category: 'surface',
    lessonId: 'dimensions',
  },
  {
    id: 'taiat-prin-piesa',
    title: 'A tăiat prin piesă sau în placa de sacrificiu',
    symptoms: ['Găuri prin lemn', 'Urme pe masa mașinii', 'Freza a atins placa de dedesubt'],
    causes: [
      'Z0 setat pe masă în loc de pe suprafața piesei',
      'Adâncimea totală mai mare decât grosimea piesei',
      '„Z siguranță” prea mică',
    ],
    fixes: [
      'Setează Z0 pe suprafața piesei în „Origine și siguranță”.',
      'Verifică adâncimea totală în „Model 3D / Adâncime” – lasă cel puțin 2 mm sub fund.',
      'Pune o placă de sacrificiu (MDF/placaj) sub piesă.',
      'Pentru siguranță, folosește „Z siguranță” (înălțime la care scula se ridică la deplasări).',
    ],
    category: 'surface',
    lessonId: 'zeroing',
  },
  {
    id: 'pozitie-gresita',
    title: 'Lucrarea este în locul greșit (origine)',
    symptoms: ['Tăierea pornește în afara piesei', 'Desenul este decalat pe lemn', 'Desenul ajunge la marginea piesei'],
    causes: [
      'Origine X/Y setată greșit',
      'Alegerea colțului de origine nu corespunde cu cea din program',
      'Mașina a fost repornită după setare',
    ],
    fixes: [
      'Verifică alegerea originii în „Origine și siguranță” (centru sau colț stânga-jos).',
      'Mută scula la punctul ales și setează X0 Y0 în „Control CNC Direct”.',
      'Nu reseta mașina după setarea originii; dacă o resetezi, setează originea din nou.',
      'Rulează un traseu de contur în aer (cu Z ridicat) ca să vezi zona acoperită.',
    ],
    category: 'machine',
    lessonId: 'zeroing',
  },
  {
    id: 'rezultat-oglindit',
    title: 'Rezultatul este oglindit sau răsturnat',
    symptoms: ['Textul apare invers', 'Icoana este cu fața în oglindă', 'Sus și jos sunt inversate'],
    causes: [
      'Axa Y a mașinii merge invers',
      'Imaginea a fost oglindită în program',
      'Originea e pe colț diferit de cel presupus',
    ],
    fixes: [
      'Verifică în „Simulare frezare” orientarea înainte de tăiere.',
      'Verifică în „Mașina / controlerul tău” dacă axa Y trebuie inversată.',
      'Verifică originea: colț stânga-jos vs. colț stânga-sus.',
      'Dacă mașina are direcția motorului inversă, inversează-o din setările GRBL ($3, masca direcției).',
    ],
    category: 'software',
    lessonId: 'simulate',
  },
  {
    id: 'z-coboara-pe-parcurs',
    title: 'Z coboară tot mai jos în timpul lucrării',
    symptoms: ['Tăierea devine tot mai adâncă', 'Freza nu mai ajunge la lemn la finalul lucrării', 'Axa Z alunecă'],
    causes: [
      'Axa Z pierde pași',
      'Șurubul Z sau suportul frezei se desface din vibrații',
      'Suportul frezei alunecă în clemă',
      'Curent insuficient la driverul Z',
    ],
    fixes: [
      'Strânge bine suportul frezei și blocarea Z.',
      'Verifică cuplajul motorului Z și șurubul.',
      'Redu viteza Z și accelerația ($122).',
      'Crește curentul pe driverul Z, dacă motorul e rece.',
    ],
    category: 'machine',
    lessonId: 'machine-setup',
  },
  {
    id: 'vibratii-zgomot',
    title: 'Vibrații, zgomot puternic (chatter)',
    symptoms: ['Șuier sau scârțâit', 'Suprafață cu valuri mici', 'Mașina tremură'],
    causes: [
      'Avans sau adâncime prea mari',
      'Freză prea lungă ieșită din mandrină',
      'Piesa nu e fixată rigid',
      'Turație la o frecvență de rezonanță',
    ],
    fixes: [
      'Scade adâncimea de trecere; la freză de 6 mm cel mult 3 mm.',
      'Scoate freza cât mai puțin din mandrină.',
      'Schimbă turația cu ±2000 RPM și testează.',
      'Fixează piesa mai bine și strânge toate șuruburile mașinii.',
    ],
    category: 'machine',
    lessonId: 'toolpaths',
  },
  {
    id: 'freza-se-blocheaza',
    title: 'Freza se blochează sau motorul se oprește',
    symptoms: ['Motorul scade turația', 'Se oprește în lemn', 'Miros de ars din motor'],
    causes: [
      'Adâncime prea mare',
      'Avans prea mare',
      'Alimentare sau regulator de turație insuficient',
      'Așchii care înfundă canalele frezei',
    ],
    fixes: [
      'Scade adâncimea de trecere și avansul cu 30 %.',
      'Folosește aspirator sau suflă așchiile din canal.',
      'Verifică alimentatorul frezei (curent suficient).',
      'Lasă motorul să se răcească dacă e fierbinte.',
    ],
    category: 'tool',
    lessonId: 'toolpaths',
  },
  {
    id: 'lemn-miscat',
    title: 'Piesa s-a mișcat în timpul lucrării',
    symptoms: ['Desenul este deformat', 'Piesa a alunecat', 'Margini duble'],
    causes: ['Prindere insuficientă', 'Cleme prea slabe', 'Forțe mari la degroșare'],
    fixes: [
      'Fixează piesa cu cleme pe cel puțin 2 laturi sau cu șuruburi prin placa de sacrificiu.',
      'Pune bandă dublu adezivă sau lipici termic ca ajutor pentru piese mici.',
      'Verifică ca nicio clemă să nu fie în traseul sculei: vezi „Simulare frezare”.',
      'Scade forțele: adâncime și avans mai mici.',
    ],
    category: 'machine',
    lessonId: 'run',
  },
  {
    id: 'lucrare-prea-lunga',
    title: 'Lucrarea durează mult prea mult',
    symptoms: ['Durata estimată de ore', 'Mașina merge foarte încet', 'Prea multe treceri'],
    causes: ['Pas lateral foarte mic', 'Avans mic', 'Freză mică pentru tot relieful', 'Rezoluție prea mare'],
    fixes: [
      'Folosește o freză mare (6 mm) pentru „Degroșare pe niveluri” și una sferică mică doar la „Finisare 3D”.',
      'Crește „Pas lateral” spre 12 %.',
      'Crește avansul în limitele mașinii (1500–2500 mm/min).',
      'Redu dimensiunea piesei sau rezoluția modelului.',
    ],
    category: 'software',
    lessonId: 'toolpaths',
  },
  {
    id: 'zone-negre-gropi',
    title: 'Zonele negre ale icoanei au devenit găuri',
    symptoms: ['Barba și ochii sunt gropi adânci', 'Păr sau haine negre – cavități', 'Detaliile s-au pierdut'],
    causes: [
      'Negrul din imagine este tradus în adâncime maximă',
      'Imaginea nu are o tonalitate potrivită pentru relief',
    ],
    fixes: [
      'Mărește „Protecție Zone Negre (Anti-Gropi)” în pasul de model.',
      'Activează modul „Smart Icoană”.',
      'Mărește luminozitatea imaginii sau ridică nivelul de negru.',
      'Verifică în „Simulare frezare” înainte de a tăia.',
    ],
    category: 'surface',
    lessonId: 'image',
  },
  {
    id: 'fata-plata',
    title: 'Fața este prea plată, fără volum',
    symptoms: ['Chipul pare turtit', 'Lipsește rotunjimea', 'Nasul și obrajii nu ies în relief'],
    causes: ['Imaginea nu conține informație de volum', 'Volumul convex nu este activat'],
    fixes: [
      'Activează „Volum Convex Corp & Chip” și crește treptat intensitatea.',
      'Folosește „Netezire suprafață” cu valoare moderată pentru tranziții line.',
      'Mărește adâncimea totală în „Model 3D / Adâncime”.',
    ],
    category: 'surface',
    lessonId: 'image',
  },
  {
    id: 'fundal-nu-coboara',
    title: 'Fundalul nu a coborât',
    symptoms: ['Fundalul este la același nivel cu figura', 'Fundalul zgrunțuros sau neuniform', 'Lipsește separarea figurii'],
    causes: ['Funcția de separare fundal este oprită', 'Prag prea strict'],
    fixes: [
      'Activează „Separare & Curățare Fundal Lemn” și reglează pragul.',
      'Mărește diferența dintre fundal și figură în „Model 3D / Adâncime”.',
      'Verifică în previzualizare că fundalul apare ca zonă plată coborâtă.',
    ],
    category: 'surface',
    lessonId: 'image',
  },
  {
    id: 'usb-se-deconecteaza',
    title: 'USB-ul se deconectează în timpul lucrării',
    symptoms: ['Conexiunea cade la mijlocul lucrării', 'Mașina se oprește brusc', 'Dispare portul COM'],
    causes: [
      'Interferențe electromagnetice de la freză',
      'Cablu USB lung sau prost',
      'Economisirea energiei din Windows pentru porturile USB',
      'Hub USB fără alimentare proprie',
    ],
    fixes: [
      'Folosește un cablu scurt, ecranat, cu ferită, și conectează direct la laptop (nu prin hub).',
      'În Windows: Manager dispozitive > Controlere USB > dezactivează „Permite computerului să oprească acest dispozitiv”.',
      'Pornește laptopul pe baterie sau cu alimentator bun; oprește suspendarea.',
      'Ține cablul USB departe de cablul frezei și de motoare.',
      'Dacă se repetă, rulează lucrarea de pe un card SD/offline controller, dacă ai.',
    ],
    category: 'connection',
    lessonId: 'run',
  },
  {
    id: 'browser-nu-vede-cnc',
    title: 'Browserul nu vede CNC-ul',
    symptoms: ['Nu apare niciun port', 'Butonul de conectare nu face nimic', 'Fereastra de alegere a portului este goală'],
    causes: [
      'Browser fără Web Serial (Firefox, Safari)',
      'Driver CH340 lipsă',
      'Cablu doar de încărcare, fără date',
      'Alt program ține portul ocupat',
    ],
    fixes: [
      'Folosește Chrome sau Edge pe calculator (Web Serial nu există în Firefox/Safari).',
      'Instalează driverul CH340/CH341 dacă Windows nu recunoaște placa.',
      'Folosește un cablu USB cu date, nu unul doar de încărcare.',
      'Închide alte programe (Candle, UGS etc.) care pot ține portul.',
      'Conectează în „Control CNC Direct”, rata 115200 baud pentru GRBL.',
    ],
    category: 'connection',
    lessonId: 'machine-setup',
  },
  {
    id: 'nu-se-misca-dupa-conectare',
    title: 'Mașina nu se mișcă după conectare',
    symptoms: ['Apare error:9', 'Starea este Alarm', 'Butoanele de mișcare nu fac nimic'],
    causes: ['GRBL pornește în alarmă dacă homing-ul e activ', 'Alarmă anterioară neștearsă'],
    fixes: [
      'Apasă „Deblocare” ($X) sau, dacă ai limitatoare, „Homing” ($H).',
      'Verifică dacă butonul de urgență nu este apăsat.',
      'Dacă tot nu merge, verifică alimentarea motoarelor (12/24 V) și cablurile.',
    ],
    category: 'connection',
    lessonId: 'machine-setup',
  },
  {
    id: 'axa-nu-merge',
    title: 'O axă nu se mișcă sau merge în sens greșit',
    symptoms: ['Un motor tremură fără să se rotească', 'Mașina merge invers', 'Un motor nu face nimic'],
    causes: ['Cablu motor desfăcut', 'Direcție inversată în setări', 'Driver defect', 'Alimentare slabă'],
    fixes: [
      'Verifică conectorul motorului și firele.',
      'Inversează direcția axei în setările GRBL ($3, masca de direcție).',
      'Schimbă între ele două drivere ca să vezi dacă defectul urmează driverul.',
    ],
    category: 'machine',
    lessonId: 'machine-setup',
  },
  {
    id: 'spindle-nu-porneste',
    title: 'Motorul frezei (spindle) nu pornește',
    symptoms: ['Freza nu se rotește la M3', 'Pornește doar manual', 'Releul nu clic-ează'],
    causes: [
      'Comanda M3 nu este suportată de controler',
      'Releul sau ieșirea spindle nu este conectată',
      'Frezele se pornesc de la un comutator separat',
      'Postprocesor greșit',
    ],
    fixes: [
      'Dacă freza ta se pornește doar manual (de la buton), pornește-o tu înainte de Start și așteaptă să ajungă la turație.',
      'Verifică în „Mașina / controlerul tău” dacă postprocesorul trimite M3/S.',
      'Verifică conexiunea releului/PWM-ului pe placa de control.',
      'La RichAuto, comanda spindle e în meniul mașinii, nu în fișier.',
    ],
    category: 'machine',
    lessonId: 'machine-setup',
  },
  {
    id: 'laser-arde-prea-mult',
    title: 'Laserul arde prea mult',
    symptoms: ['Lemn carbonizat', 'Linii prea late și negre', 'Flacără pe suprafață'],
    causes: ['Putere prea mare', 'Viteză prea mică', 'Focalizare greșită', 'Lipsa suflării de aer'],
    fixes: [
      'Scade puterea (S) sau crește viteza.',
      'Reglează focalizarea la distanța corectă.',
      'Folosește suflare de aer (air assist).',
      'Fă un test pe un colț de lemn înainte de lucrarea reală.',
      'Poartă ochelari de protecție pentru laser și nu pleca de lângă mașină.',
    ],
    category: 'safety',
    lessonId: 'run',
  },
  {
    id: 'fisier-respins-richauto',
    title: 'Fișierul este respins de RichAuto / DSP',
    symptoms: ['Controlerul nu citește fișierul', 'Eroare de format', 'Fișierul nu apare în listă'],
    causes: ['Extensie sau format greșit', 'Postprocesor greșit', 'Nume de fișier prea lung', 'Card USB formatat greșit'],
    fixes: [
      'În „Mașina / controlerul tău” alege postprocesorul RichAuto/DSP.',
      'Folosește extensia cerută de controler (de ex. .nc sau .u00) și un nume scurt, cu litere latine.',
      'Formatează unitatea USB FAT32.',
      'Încearcă un fișier mic de test înainte de unul mare.',
    ],
    category: 'software',
    lessonId: 'machine-setup',
  },
  {
    id: 'praf-aschii',
    title: 'Praf și așchii se adună',
    symptoms: ['Așchii în canalele frezei', 'Praf pe șuruburi', 'Suprafață murdară'],
    causes: ['Lipsa aspirației', 'Adâncime mare fără evacuare'],
    fixes: [
      'Folosește un aspirator la sculă sau pune un bol cu aspirator în apropiere.',
      'Curăță șuruburile și ghidajele după fiecare lucrare.',
      'Oprește din când în când pentru a sufla așchiile din detaliile adânci.',
      'Poartă mască de praf (FFP2): praful de lemn este dăunător.',
    ],
    category: 'safety',
    lessonId: 'run',
  },
  {
    id: 'siguranta-generala',
    title: 'Reguli de siguranță la frezare',
    symptoms: ['Zgomot puternic', 'Așchii zburătoare', 'Pericol de incendiu'],
    causes: ['Lipsa echipamentului de protecție', 'Lucrare lăsată nesupravegheată'],
    fixes: [
      'Poartă mereu ochelari de protecție și căști antifonice.',
      'Nu pleca niciodată de lângă mașină cât timp lucrează; ține la îndemână un buton de oprire.',
      'Nu purta mănuși, mâneci largi sau bijuterii lângă sculă.',
      'Ține un stingător aproape; praful și așchiile pot lua foc.',
      'Verifică originea și simularea înainte de pornire.',
    ],
    category: 'safety',
    lessonId: 'run',
  },
  {
    id: 'freza-sare-mai-sus',
    title: 'Freza nu taie la adâncimea corectă',
    symptoms: ['Reliefului îi lipsesc zonele joase', 'Freza trece pe deasupra lemnului', 'Taie prea puțin'],
    causes: ['Z0 setat prea sus', 'Freza a alunecat în mandrină', '„Z siguranță” confundată cu Z0'],
    fixes: [
      'Resetează Z0 pe suprafața piesei, cu foaie de hârtie sau palpator.',
      'Strânge bine freza în mandrină (pune-o adânc, cel puțin 15 mm).',
      'Verifică în „Origine și siguranță” valorile Z0 și „Z siguranță”.',
    ],
    category: 'machine',
    lessonId: 'zeroing',
  },
  {
    id: 'erori-gcode-la-trimitere',
    title: 'Apar erori la trimiterea G-code',
    symptoms: ['error:20', 'error:33', 'Lucrarea se oprește la prima linie'],
    causes: ['Postprocesor greșit', 'Arcele nu sunt acceptate de controler', 'Fișier trunchiat'],
    fixes: [
      'Alege controlerul corect în „Mașina / controlerul tău” și regenerează.',
      'Error:33/34/35 apar doar la fișiere din alte programe (cu arce G2/G3): regenerează-le acolo cu arcele transformate în linii.',
      'Caută în lista de erori codul exact și urmează pașii.',
    ],
    category: 'software',
    lessonId: 'machine-setup',
  },
  {
    id: 'limitatoare-alarma-fals',
    title: 'Alarma de limită apare singură',
    symptoms: ['ALARM:1 fără să atingă nimic', 'Mașina se oprește aleatoriu', 'Alarmă când pornește freza'],
    causes: ['Zgomot electric pe firele limitatoarelor', 'Cabluri neecranate', 'Împământare slabă'],
    fixes: [
      'Folosește cablu ecranat la limitatoare și îndepărtează-l de cablul motorului.',
      'Adaugă un condensator mic (100 nF) la limitator.',
      'Dacă nu ai nevoie de ele, dezactivează limitele hard ($21=0).',
    ],
    category: 'machine',
    lessonId: 'machine-setup',
  },
]

// ---------------------------------------------------------------------------
// Căutare
// ---------------------------------------------------------------------------
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/** Căutare după cuvinte-cheie, fără diacritice, ordonată după relevanță. */
export function searchProblems(query: string): Problem[] {
  const tokens = normalize(query)
    .split(/[^a-z0-9$:]+/)
    .filter((t) => t.length >= 2)
  if (tokens.length === 0) return []

  const scored: { p: Problem; score: number; idx: number }[] = []
  PROBLEMS.forEach((p, idx) => {
    const title = normalize(p.title)
    const symptoms = normalize(p.symptoms.join(' | '))
    const causes = normalize(p.causes.join(' | '))
    const fixes = normalize(p.fixes.join(' | '))
    let score = 0
    for (const t of tokens) {
      if (title.includes(t)) score += 5
      if (symptoms.includes(t)) score += 3
      if (causes.includes(t)) score += 2
      if (fixes.includes(t)) score += 1
      if (p.id.includes(t)) score += 2
    }
    if (score > 0) scored.push({ p, score, idx })
  })
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx)
  return scored.map((x) => x.p)
}
