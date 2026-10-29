# CNC WoodCraft Studio PWA 🪵✨

Aplicație profesională **Progressive Web App (PWA)** dedicată sculpturii în lemn 3D, basoreliefului, gravurii fine și procesării imaginilor (în special **icoane ortodoxe** și motive tradiționale), cu conectare universală la orice utilaj CNC prin USB Web Serial sau export de fișiere.

---

## 🌟 Funcționalități Principale

### 1. 📶 Funcționare 100% Offline (PWA)
- Aplicația este configurată ca **Progressive Web App** cu Service Worker și stocare locală.
- Funcționează complet fără conexiune la internet în atelier / hală.
- Poate fi instalată ca aplicație de sine stătătoare pe **Windows, Android, Mac, Linux** (pictogramă pe ecran/desktop, mod ecran complet fără bară de browser).

### 2. 🔌 Conectare la Orice CNC (Universal Controller)
- **Web Serial USB**: Se conectează direct din browser la controllerul CNC prin cablu USB (CH340, CP2102, FTDI).
- Compatibil cu:
  - **GRBL 0.9 / 1.1** (toate routerele și laserele populare)
  - **Marlin** (CNC-uri derivate din imprimante 3D)
  - **FluidNC / ESP32 CNC**
  - **Mach3 / LinuxCNC / RichAuto DSP** (prin descărcare de fișiere `.nc`, `.gcode`, `.tap` pe stick USB)
- Selector viteză transmisie (Baud rate: `115200`, `250000`, `57600`, `9600`).
- **Mod Simulator Virtual**: Permite testarea comenzilor, mișcărilor și execuției de G-code chiar și când utilajul nu este fizic conectat.

### 3. 🎨 Procesare Imagini Specială pentru Icoane & Sculptură Lemn
- **Încărcare orice format de imagine**: PNG, JPG, WebP, BMP, etc.
- **Preseturi Icoane Incluse Imediat**:
  - *Icoana Maicii Domnului cu Pruncul*
  - *Iisus Hristos Pantocrator*
  - *Cruce Tradițională sculptată (Motive Solare Maramureșene)*
- **Filtre dedicate sculpturii în lemn**:
  - **✨ Ridicare Nimb / Aureolă**: Crește selectiv înălțimea aureolei bizantine pentru a ieși armonios în relief.
  - **Netezire Lemn (Anti-Tool Chatter)**: Elimină zgomotul de pixeli pentru o suprafață fină la frezare, fără trepte aspre.
  - **Accentuare Cute & Detalii**: Scoate în evidență faldurile veșmintelor, barba și trăsăturile feței.
  - **Ramă & Arcadă (Boltă de Icoană)**: Adaugă automat profil clasic curbat de boltă bisericească sau ramă decorativă în relief.
  - **Ajustare Dimensiuni Fizice (mm)**: Lățime X, Înălțime Y, Adâncime sculptură Z (ex: 15-25 mm) și Grosime bază suport.

### 4. 📐 Generare & Export STL 3D Watertight
- Convertește harta de adâncime într-un **model 3D solid complet închis (Watertight Manifold STL)**:
  - Suprafață superioară sculptată în relief
  - Pereți laterali verticali
  - Bază inferioară plată (Z = 0)
- Format **Binary STL industrial** (ușor, rapid și compatibil direct cu Aspire, ArtCAM, Carveco, Fusion 360, Cura, PrusaSlicer).

### 5. ✒️ Generare & Export Vectorial (SVG & DXF)
- Algoritm **Marching Squares** cu simplificare geometrică *Ramer-Douglas-Peucker*:
  - Transformă contururile din imagini în polilinii curate.
  - **Export .SVG**: Pentru grafică vectorială, Inkscape, LightBurn, LaserGRBL.
  - **Export .DXF (AutoCAD R12)**: Standardul industrial recunoscut de toate mașinile CNC și laserele de pe piață.

### 6. ⚙️ Motor CAM (src/cam) — ca la softurile premium
- **Compensarea sculei (drop-cutter)** pentru freză sferică, dreaptă și V-bit: flancurile frezei nu taie în relief.
  Lângă pereți abrupți (nimb, ramă) traseul e rafinat adaptiv până la 0.01 mm.
- **Degroșare pe niveluri Z** cu freză dreaptă, pas Z reglabil și **adaos 3D** lăsat pentru finisare.
- **Finisare 3D**: raster pe X, pe Y sau încrucișat X+Y.
- **Bibliotecă de scule** (frezele uzuale pentru lemn, cu avansuri/turații de pornire), editabile.
- **Simulare de frezare**: vezi în 3D cum iese piesa din lemn (inclusiv urmele frezei) înainte să pornești mașina.
- **Origine XY** (stânga-jos / centru / stânga-sus) și **Z0** (fața lemnului sau masa mașinii).
- Calculul rulează în fundal (Web Worker), cu bară de progres și anulare; timp estimat pe fiecare traseu.

### 7. 🖥️ Post-procesoare (G-code pentru orice controler)
GRBL, FluidNC/grblHAL, Mach3/Mach4 (.tap), LinuxCNC (.ngc), UCCNC, Marlin, RichAuto DSP A11/A18,
Weihong NcStudio / NK105 / Syntec, ISO generic cu numere de linie. Fiecare cu stilul lui de comentarii,
pauză, schimbare de sculă (M6) sau **câte un fișier pe freză** (GRBL, Marlin, DSP-uri), fără diacritice în fișier.

### 8. 📂 Intrări și proiecte
- Orice imagine (JPG, PNG, WebP, BMP, SVG), **model 3D STL** (binar/ASCII, convertit la precizie float) sau
  hartă de adâncime gata făcută (modul „Model 3D / Adâncime”). Fișierele se pot trage direct peste aplicație.
- Oglindire, inversare (matrițe), netezire reglabilă.
- **Salvare / deschidere proiect** (.json cu imaginea, parametrii piesei și ai mașinii).

### 9. 🔌 Control CNC Direct
- Streaming rapid cu **numărare de caractere** pe GRBL (ca UGS/Candle), linie cu linie pe Marlin.
- **La eroare trimiterea se oprește** (nu continuă orbește); la ALARM lucrarea se anulează.
- **Stop real**: feed hold + reset (GRBL) / M410 (Marlin) — mașina se oprește, nu doar lista din aplicație.
- Poziție de lucru corectă pe GRBL 1.1 (MPos − WCO), jog, origine, homing, deblocare, E-STOP.
- Gravură laser GRBL (M4 cu putere dinamică).

### 10. 🎬 Simulator real de frezare
- Citește **exact fișierul G-code trimis la mașină** (sau orice fișier .nc/.gcode/.tap din Aspire, ArtCAM, Fusion…) și îl execută în timp: lemnul 3D se sculptează cu forma reală a frezei.
- Play/Pauză, viteze 1×–500×, derulare, „urmărește freza”, linia G-code curentă, poziția X/Y/Z.
- Se oprește singur la probleme: rapid prin lemn (coliziune), tăiere în masa mașinii, plonjeu adânc în lemn plin, tăiere în afara piesei — cu linia din fișier.
- Verificare completă în câteva secunde, pornită automat.

### 11. 🎓 Lecții, ghid și rezolvarea problemelor
- **10 lecții video animate în română** (voce românească a sistemului/browserului + subtitrare), cu animații și simulatorul real; fiecare are butoane care te duc în locul potrivit din aplicație.
- **Ghid pas cu pas** sus: Învață → Imaginea → Trasee → Simulare → Mașina → Origine → Pornește.
- **Probleme & Soluții**: 29 de probleme căutabile după simptom, toate erorile și alarmele GRBL explicate în română; când mașina trimite o eroare, explicația apare singură.
- **Listă de verificare înainte de pornire** (lemn prins, freza, X0Y0, Z0, protecție) — butonul de start se activează doar după bifare.

### 12. ✂️ Freză conică, decupare, piese mari
- Freză conică cu vârf sferic (ex. R0,25 / 15°) modelată exact — pentru chipuri și mâini.
- Decupare din placă cu punți: arcada icoanei sau dreptunghi rotunjit, prin toată grosimea, frezare convențională.
- Împărțire pe bucăți când piesa e mai mare decât cursa mașinii, câte un fișier pe bucată.

### Verificare motor CAM
```
npx tsx tests/cam-check.ts      # fără gouging (sferică, conică, V), degroșare, G-code pe fiecare post (lent: ~10 min)
npx tsx tests/sim-check.ts      # simulator, decupare, bucăți, fișier greșit prins, arce G2/G3
npx tsx tests/sim-file.ts f.nc  # verifică orice fișier G-code din linia de comandă
```
Verifică exact (pe segmente, la 0.05 mm) că nicio poziție a frezei nu intră în relieful final, că degroșarea
nu plonjează mai mult de un pas Z și că G-code-ul e valid pentru fiecare post-procesor.

---

## 🚀 Cum se Pornește Aplicația

### Varianta Rapidă (Windows):
Faceți dublu click pe fișierul:
```
start-cnc-studio.bat
```
Aplicația se va deschide automat în browser la adresa: `http://localhost:5173`.

### Varianta Manuală (Terminal):
```bash
cd C:\Users\Otilia\cnc-woodcraft-pwa
npm run dev
```

### Cum o instalați pe calculator/telefon ca aplicație nativă (PWA):
1. Deschideți adresa în **Google Chrome** sau **Microsoft Edge**.
2. Faceți click pe pictograma de instalare din bara de adrese (lângă steaua de bookmark) sau din meniul cu trei puncte: **„Instalează CNC WoodCraft Studio”**.
3. O veți avea ca aplicație dedicată în meniul Start / pe Desktop, funcțională chiar și când scoateți cablul de internet!
