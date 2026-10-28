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

### 6. ⚙️ Generator G-Code & Monitorizare Execuție
- **Sculptură 3D de Relief**:
  - Traseu raster X/Y (zig-zag) optimizat cu freză sferică (*Ball-nose*), cilindrică (*Endmill*) sau gravor (*V-bit*).
  - Reglaj pas lateral (*Stepover* 8-15%), viteză de avans lucru (mm/min), viteză coborâre Z (*plunge*), Z de siguranță și turație (*RPM*).
  - Estimare precisă a timpului de lucru (ore și minute) și distanței totale parcurse.
- **Gravură Vectorială 2D/2.5D & Laser**:
  - Urmărire traseu vectori la adâncime reglabilă sau mod Laser PWM (`M3/M4 S1000`).
- **Panou de Comandă Jogging & Terminal**:
  - Butoane deplasare X, Y, Z (pas reglabil: 0.1mm, 1mm, 10mm, 50mm).
  - Setare Origine Lucru `X0 Y0 Z0` (`G10 L20 P1`).
  - Homing (`$H`) și Deblocare Alarmă (`$X`).
  - **Buton Roșu STOP DE URGENȚĂ (E-STOP)** cu oprire instantanee.
  - Streaming linie cu linie cu bară de progres, pauză și reluare.

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
