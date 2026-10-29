# STARE — CNC WoodCraft Studio (actualizat 2026-10-29, seara)

## Unde suntem
Publicat pe https://almeueste777-ops.github.io/cnc-woodcraft-pwa/ (ramura gh-pages, `npm run deploy`).
- Motor CAM (`src/cam/`): drop-cutter cu rafinare adaptivă; degroșare pe niveluri cu adaos 3D;
  finisare X/Y/încrucișat; freze sferică, dreaptă, V, conică-sferică; decupare cu punți (`cutout.ts`);
  împărțire pe bucăți (`tiling.ts`); 9 post-procesoare.
- Simulator real (`gcodeParser.ts`, `simulator.ts`, `components/MachineSimulator.tsx`): rulează exact
  G-code-ul trimis; coliziuni/masă/plonjeu/în afara piesei, verificate pe fiecare mișcare întreagă.
- Învățare și ajutor: `help/lessons.ts` (10 lecții), `help/knowledge.ts` (erori/alarme GRBL + 29 probleme),
  `LessonsHub`, `HelpCenter`, `WorkflowGuide`, `PreflightChecklist`; alertă globală la erori de la mașină.
- Verificat: tests/cam-check.ts și tests/sim-check.ts trec; test cap-coadă în Edge pe icoana
  Vladimirskaya (Wikimedia): lecții, calcul, simulator, fișier extern, probleme, listă de verificare, 0 erori.
- Două audituri independente (Opus) făcute; defectele confirmate reparate.

## Ce e deschis
- Netestat pe o mașină fizică reală (doar CNC-ul virtual).
- Textele Marlin din knowledge.ts nu sunt verificate pe sursă; FluidNC fără coduri proprii.
- V-carve adevărat pentru text și buzunare pe vectori: nefăcute.
- Lecțiile sunt animații în aplicație (nu fișiere video); videoclipurile YouTube externe sunt în engleză.
- Cu Z0 pe masă, grosimea lemnului = bază + adâncime; lemn mai gros => mărește Z siguranță.

## Cum se pornește
`npm run dev` (http://localhost:5173). Teste: vezi README („Verificare motor CAM”).
Publicare: `npm run build` apoi `npm run deploy`.
