# STARE — CNC WoodCraft Studio (actualizat 2026-10-29, noaptea)

## Unde suntem
Publicat pe https://almeueste777-ops.github.io/cnc-woodcraft-pwa/ (ramura gh-pages, `npm run deploy`).
Hărți de adâncime: salvare/încărcare PNG gri pe 16 biți (`utils/depthMapIO.ts`, butonul „Hartă adâncime”
lângă „Export STL 3D”; un PNG de 16 biți încărcat intră direct ca hartă exactă).
- Motor CAM (`src/cam/`): drop-cutter cu rafinare adaptivă; degroșare pe niveluri cu adaos 3D;
  finisare X/Y/încrucișat; freze sferică, dreaptă, V, conică-sferică; decupare cu punți (`cutout.ts`);
  9 post-procesoare.
- Împărțire pe bucăți (`tiling.ts`, caseta „Împărțire pe bucăți” din `CamPanel.tsx`): modele de mașini,
  număr de bucăți ales de mână, schiță peste icoană; „o placă, mutată” sau „plăci separate, lipite”
  (la îmbinări freza trece o rază peste muchie). Schimbarea împărțirii nu cere recalcul.
- Vedere 3D (`utils/meshGenerator.ts`): plasă indexată, netedă, până la 800 (relief) / 1000 (simulare)
  de puncte pe latură; STL făcut doar la descărcare; adâncimea sub mouse citită din harta de înălțimi.
- Simulator real (`gcodeParser.ts`, `simulator.ts`, `components/MachineSimulator.tsx`): rulează exact
  G-code-ul trimis; ștampilare din poziția exactă a frezei (pas ≤ 0,25 mm la frezele nedrepte) +
  urma vârfului; coliziuni G0 verificate pe toate celulele de sub freză și la vârf. Pe trasee reale:
  0% alarme false, 100% prinse de la 0,3 mm (6 freze); G0 prin lemn netăiat prins și pe piese 1,2 m.
- Învățare și ajutor: `help/lessons.ts` (10 lecții), `help/knowledge.ts`, `LessonsHub`, `HelpCenter`,
  `WorkflowGuide`, `PreflightChecklist`.
- Verificat: tests/mesh-check.ts, tests/sim-check.ts trec (cam-check.ts: motorul CAM neschimbat azi);
  în Edge pe icoana Vladimirskaya: capturi mărite vechi/nou, împărțire 3018, 0 erori de consolă.

## Ce e deschis
- Netestat pe o mașină fizică reală (doar CNC-ul virtual).
- Cerute de Otilia, de făcut în ordinea asta: combinare de hărți de adâncime, retușare cu pensula,
  hartă de adâncime făcută de AI din poză, apoi uneltele din V-Carve Pro (V-carve text/vectori,
  buzunare, profil, găuri, prelucrare de rest, intrări în rampă, calculator de avans).
- Plăci separate + decupare cu punți: unele plăci rămân fără punți — doar avertisment în panou.
- Textele Marlin din knowledge.ts nu sunt verificate pe sursă; FluidNC fără coduri proprii.
- Lecțiile sunt animații în aplicație (nu fișiere video); videoclipurile YouTube externe sunt în engleză.
- Cu Z0 pe masă, grosimea lemnului = bază + adâncime; lemn mai gros => mărește Z siguranță.

## Cum se pornește
`npm run dev` (http://localhost:5173). Teste: vezi README („Verificare motor CAM”).
Publicare: `npm run build` apoi `npm run deploy`.
