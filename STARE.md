# STARE — CNC WoodCraft Studio (actualizat 2026-10-29, târziu)

## Unde suntem
Publicat pe https://almeueste777-ops.github.io/cnc-woodcraft-pwa/ versiunea 861e843 (ramura gh-pages), verificat live 2026-10-29:
atelier hartă, AI, V-Carve, rest, calculator — toate salvate în git și publicate.

- Motor CAM relief (`src/cam/engine.ts`): drop-cutter cu rafinare adaptivă; degroșare pe niveluri;
  finisare X/Y/încrucișat; **finisare de rest** (freză fină doar unde n-a ajuns cea mare, pe niveluri Z,
  pas lateral limitat de creasta admisă); decupare cu punți (`cutout.ts`); 9 post-procesoare.
- Lucrări vectoriale ca în V-Carve Pro (`vectorCam.ts` motorul, `vectorJob.ts` ordinea, panoul
  `components/VectorPanel.tsx`, forma în `utils/shapeMask.ts` din imagine și/sau text cu font):
  V-carve (cu fund plat golit de freză dreaptă), buzunar, profil cu punți, intrări în rampă, găurire
  cu retrageri; gravura pe contur veche rămâne. Calculul în worker (`cam.worker.ts`), simulare 3D.
- Atelier hartă de adâncime (`components/DepthEditor.tsx`, `utils/depthEdit.ts`): straturi (adună, scade,
  cel mai înalt/jos, înlocuiește; poziție, mărime) din PNG 16 biți / STL / imagine / cupolă / hartă AI;
  pensulă (ridică, coboară, netezește, accentuează, nivelează, șterge) în `components/DepthBrush.tsx`: zoom până la
  48 px de ecran pe pixel, ecran mare, duritate, mână liniștită, presiune creion, limite de înălțime, pipetă (Alt+clic),
  linie cu Shift, anulare/refacere 50 de pași, scurtături pe `e.code` (merg și pe tastatura românească). Salvate în .json.
- Hartă AI din poză (`utils/aiDepth.ts` + `aiDepth.worker.ts`): Depth Anything V2 small (q8, ~27 MB,
  @huggingface/transformers 4.3.1), descărcată la prima folosire, apoi din memoria browserului.
- Detalii din poză peste harta AI (`utils/aiDetail.ts`, glisorul „Detalii din poză”, 0–2, implicit 1): AI-ul dă volumul,
  luminozitatea pozei dă fața, faldurile, penele, literele (benzi 1,2–6 și 6–24 px la 1024, limitate moale, fără întindere).
  Probat 2026-10-29 în Node cu modelul real pe Gavriil, David, Ilie, un portret: arată ca harta de adâncime model a Otiliei.
  NU merge pe logouri/desene plate (AI-ul sapă o groapă) → acolo modul obișnuit „din imagine”. Modelele base/large: mai încețoșate.
- Calculator de avans (`components/FeedCalculator.tsx`): așchie pe dinte după diametru, material, mașină;
  subțierea așchiei la pas lateral mic (nu la profil/decupare/găuri); „Aplică” pe freză.
- Hărți PNG 16 biți, împărțire pe bucăți, simulator real din G-code, lecții, ajutor: ca înainte.

## Verificat (2026-10-29)
Teste: aidetail, depthedit, vectorjob, vcarve, rest, sim, mesh, depth, cam-check — toate trec. În Edge pe icoana
Vladimirskaya: pensulă + anulare, strat cupolă, hartă AI (27,3 MB, 18 s), text „IC XC / NIKA” cu V-carve +
fund plat + profil + găuri → simulatorul real: fără probleme; 0 erori de consolă. Audit Opus: 15 constatări,
toate reparate sau trecute mai jos.

## Ce e deschis
- Netestat pe o mașină fizică reală.
- V-carve: precizia depinde de pixelul formei (~0,08 mm la 200×280); la V-bit îngust în forme foarte mici
  rămâne ~0,1 mm în vârf (½ pixel / tan). Marginea piesei e tratată ca perete (formă care atinge marginea
  primește pantă în V până la margine). Buzunar + V-carve pe aceeași formă nu se coordonează (startDepth).
- Finisarea de rest merge doar pe rânduri X (nu urmează strategia finisării).
- Plăci separate + decupare cu punți: doar avertisment.
- Pensula și zoomul: probate în Edge ascuns (mausul simulat), neprobate cu creion real și cu două degete pe telefon.
- Detaliile din poză: neprobate în browser cu mausul (extensia Chrome neconectată 29.10); calculul ~0,5–1 s pe firul principal.
- Harta AI cere internet la prima folosire (model de pe Hugging Face, motor de pe jsDelivr).
- Marlin din knowledge.ts neverificat; lecțiile sunt animații, nu filme.

## Ce urmează (cercetare 31.10: model AI gratuit pentru icoane)
Niciun model gratuit nu face singur harta ca la modelul ei (download (2).jpg); toate „văd” icoana ca un tablou plat.
Probate pe Gavriil, David, Ilie (ieșirile în scratchpad-ul sesiunii, nu în repo):
- Utile: **BiRefNet_lite** (MIT, ~170 MB, rulează în browser) separă sfântul de fundal, inclusiv mantia închisă a lui Ilie;
  **DeepBump** (GPL-3, 27 MB ONNX) scoate din poză un relief sculptat (față, pene, falduri); Depth Anything V2 small rămâne
  cel mai bun pentru volum.
- Inutile pe icoane (verificat): Depth Anything V2 base/large, Distill-Any-Depth, Depth Anything 3 small, Depth Pro, Metric3D,
  MoGe-2 (normale), RMBG-1.4 (taie mantia; și licență necomercială).
- Neprobate (cer GPU): Marigold (spațiu gratuit HF prs-eth/marigold), Pixel-Perfect Depth, MonoRelief V2 (greutăți negăsite).
- Calea propusă: mască BiRefNet → volum DA-V2 doar în figură, fundal plat → detaliu DeepBump (sau luminozitate) → chenar ridicat.
  De hotărât de Otilia: licența GPL-3 a DeepBump (ar obliga codul aplicației la GPL) și ~200 MB descărcați în plus.

## Cum se pornește
`npm run dev` (http://localhost:5173). Teste: vezi README („Verificare motor CAM”).
Publicare: `npm run build` apoi `npm run deploy`.
