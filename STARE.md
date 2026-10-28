# STARE — CNC WoodCraft Studio (actualizat 2026-10-29)

## Unde suntem
- Ramura `profesional` (necomisă, nepublicată): motor CAM nou în `src/cam/` —
  compensare sculă (drop-cutter) cu rafinare adaptivă lângă pereți, degroșare pe niveluri cu
  adaos 3D (grilă max-pool, nu pierde crestele înguste), finisare X/Y/încrucișat, simulare de
  frezare în 3D, 9 post-procesoare, calcul în Web Worker.
- Comunicare CNC (`src/utils/serialConnection.ts`) refăcută: numărare de caractere pe GRBL,
  oprire la eroare, Stop real, WCO, GRBL 0.9, Marlin fără „?”, comenzi manuale blocate în lucrare.
- Import STL (`src/utils/modelImport.ts`), mod „Model 3D / Adâncime”, oglindire, proiecte .json,
  tragere fișiere peste aplicație. Bug vechi reparat: gravura vectorială ieșea răsturnată pe Y.
- Verificat: `npx tsx tests/cam-check.ts` trece; test cap-coadă în Edge pe o icoană reală
  (Vladimirskaya, Wikimedia): calcul 8.5 s, fișiere descărcate, CNC virtual, import STL, 0 erori.
- Audit independent (Opus) făcut; defectele confirmate reparate.

## Ce e deschis
- Nepublicat pe GitHub Pages — așteaptă acordul Otiliei (commit + `npm run build` + `npm run deploy`).
- Netestat pe o mașină fizică reală (doar simulator).
- Freza conică (tapered ball) nu e modelată; în bibliotecă e o sferică de 0.5 mm.
- Cu Z0 pe masă, grosimea lemnului = bază + adâncime; dacă lemnul real e mai gros, Z siguranță trebuie mărit.
- `G4 P` pe Mach4/UCCNC poate fi în ms, după configurare.

## Ce urmează (val 2 „premium”)
V-carve adevărat și buzunărire/profil cu punți pe vectori; împărțire în plăci (tiling) pentru piese mai
mari decât masa; freză conică; rampă la intrare în degroșare; editor de vectori.

## Cum se pornește
`start-cnc-studio.bat` sau `npm run dev` (http://localhost:5173). Test motor: `npx tsx tests/cam-check.ts`.
Publicare: `npm run build` apoi `npm run deploy` (ramura gh-pages).
