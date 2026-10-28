/**
 * Generează imagini procedurale de înaltă rezoluție pentru icoane și sculptură tradițională
 * pentru testare instantanee offline fără a necesita descărcare de fișiere externe.
 */
export function generateSampleIconCanvas(type: 'virginMary' | 'christ' | 'cross'): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  // Rezoluție HD 800x1120 pentru suprafețe cristaline fără pixelare
  canvas.width = 800
  canvas.height = 1120
  const ctx = canvas.getContext('2d')!

  // Scalare automată pentru rezoluție dublă
  ctx.scale(2, 2)

  // Fundal întunecat de bază (sculptură adâncă)
  ctx.fillStyle = '#111111'
  ctx.fillRect(0, 0, 400, 560)

  const w = 400
  const h = 560
  const cx = 200

  if (type === 'cross') {
    // Cruce Tradițională sculptată în lemn cu motive solare maramureșene
    // Ramă decorativă
    ctx.lineWidth = 14
    ctx.strokeStyle = '#666666'
    ctx.strokeRect(20, 20, w - 40, h - 40)

    ctx.lineWidth = 6
    ctx.strokeStyle = '#aaaaaa'
    ctx.strokeRect(30, 30, w - 60, h - 60)

    // Corpul crucii verticale
    const gradV = ctx.createLinearGradient(cx - 30, 0, cx + 30, 0)
    gradV.addColorStop(0, '#555555')
    gradV.addColorStop(0.5, '#ffffff')
    gradV.addColorStop(1, '#555555')
    ctx.fillStyle = gradV
    ctx.fillRect(cx - 26, 60, 52, h - 120)

    // Corpul crucii orizontale
    const gradH = ctx.createLinearGradient(0, 180, 0, 240)
    gradH.addColorStop(0, '#555555')
    gradH.addColorStop(0.5, '#ffffff')
    gradH.addColorStop(1, '#555555')
    ctx.fillStyle = gradH
    ctx.fillRect(50, 180, w - 100, 52)

    // Rozetă solară centrală (Rozeta de lemn din Maramureș)
    const sunGrad = ctx.createRadialGradient(cx, 206, 5, cx, 206, 65)
    sunGrad.addColorStop(0, '#ffffff')
    sunGrad.addColorStop(0.3, '#dddddd')
    sunGrad.addColorStop(0.7, '#888888')
    sunGrad.addColorStop(1, '#222222')
    ctx.fillStyle = sunGrad
    ctx.beginPath()
    ctx.arc(cx, 206, 65, 0, Math.PI * 2)
    ctx.fill()

    // Spițe rozetă
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 4
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI) / 6
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(angle) * 15, 206 + Math.sin(angle) * 15)
      ctx.lineTo(cx + Math.cos(angle) * 60, 206 + Math.sin(angle) * 60)
      ctx.stroke()
    }

    // Inscripție IC XC NI KA
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 22px serif'
    ctx.textAlign = 'center'
    ctx.fillText('IC', cx - 50, 160)
    ctx.fillText('XC', cx + 50, 160)
    ctx.fillText('NI', cx - 50, 275)
    ctx.fillText('KA', cx + 50, 275)

    return canvas
  }

  // Icoană: Maica Domnului cu Pruncul sau Iisus Hristos Pantocrator
  // Arcadă bizantină în partea de sus
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(30, h - 30)
  ctx.lineTo(30, 170)
  ctx.arc(cx, 170, cx - 30, Math.PI, 0, false)
  ctx.lineTo(w - 30, h - 30)
  ctx.closePath()
  ctx.clip()

  // Fundal interior icoană
  const bgGrad = ctx.createRadialGradient(cx, 180, 20, cx, 240, 280)
  bgGrad.addColorStop(0, '#666666')
  bgGrad.addColorStop(1, '#1a1a1a')
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, w, h)

  // Nimb / Aureolă Sfântă (Relief înalt luminos)
  const haloY = type === 'virginMary' ? 190 : 180
  const haloGrad = ctx.createRadialGradient(cx, haloY, 20, cx, haloY, 120)
  haloGrad.addColorStop(0, '#f5f5f5')
  haloGrad.addColorStop(0.7, '#dcdcdc')
  haloGrad.addColorStop(0.9, '#888888')
  haloGrad.addColorStop(1, '#333333')
  ctx.fillStyle = haloGrad
  ctx.beginPath()
  ctx.arc(cx, haloY, 115, 0, Math.PI * 2)
  ctx.fill()

  // Gravură decorativă pe nimb
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(cx, haloY, 105, 0, Math.PI * 2)
  ctx.stroke()

  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(cx, haloY, 95, 0, Math.PI * 2)
  ctx.stroke()

  if (type === 'christ') {
    // Crucea înscrisă în nimbul Mântuitorului
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(cx - 10, haloY - 95, 20, 190)
    ctx.fillRect(cx - 95, haloY - 10, 190, 20)

    // Chipul Mântuitorului (relief organic neted)
    const faceGrad = ctx.createRadialGradient(cx, 190, 10, cx, 195, 60)
    faceGrad.addColorStop(0, '#f0e0d0')
    faceGrad.addColorStop(0.6, '#b09080')
    faceGrad.addColorStop(1, '#403020')
    ctx.fillStyle = faceGrad
    ctx.beginPath()
    ctx.ellipse(cx, 195, 42, 60, 0, 0, Math.PI * 2)
    ctx.fill()

    // Barbă și plete
    ctx.fillStyle = '#3a2618'
    ctx.beginPath()
    ctx.arc(cx, 220, 48, 0.2 * Math.PI, 0.8 * Math.PI)
    ctx.lineTo(cx, 275)
    ctx.closePath()
    ctx.fill()

    // Cute veșminte (Himation)
    ctx.strokeStyle = '#e0d0c0'
    ctx.lineWidth = 8
    ctx.beginPath()
    ctx.moveTo(cx - 70, 270)
    ctx.quadraticCurveTo(cx - 20, 360, cx - 110, h - 30)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(cx + 70, 270)
    ctx.quadraticCurveTo(cx + 20, 370, cx + 110, h - 30)
    ctx.stroke()

    // Cartea Evangheliei ținută în mână
    ctx.fillStyle = '#e8d8c8'
    ctx.fillRect(cx - 100, 340, 75, 100)
    ctx.lineWidth = 4
    ctx.strokeStyle = '#ffffff'
    ctx.strokeRect(cx - 95, 345, 65, 90)

    // Mâna dreaptă de binecuvântare
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.ellipse(cx + 50, 350, 24, 34, -0.3, 0, Math.PI * 2)
    ctx.fill()

  } else {
    // Maica Domnului cu Pruncul Iisus
    // Chip Maica Domnului
    const faceMary = ctx.createRadialGradient(cx - 25, 185, 10, cx - 20, 190, 55)
    faceMary.addColorStop(0, '#f5e8da')
    faceMary.addColorStop(0.7, '#c0a090')
    faceMary.addColorStop(1, '#503830')
    ctx.fillStyle = faceMary
    ctx.beginPath()
    ctx.ellipse(cx - 25, 190, 38, 52, 0.15, 0, Math.PI * 2)
    ctx.fill()

    // Maforion (Voalul Maicii Domnului)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(cx - 70, 180)
    ctx.quadraticCurveTo(cx - 30, 130, cx + 30, 160)
    ctx.stroke()

    // Steaua de pe frunte și umăr
    ctx.fillStyle = '#ffffff'
    ctx.font = '24px serif'
    ctx.textAlign = 'center'
    ctx.fillText('✦', cx - 25, 150)
    ctx.fillText('✦', cx - 80, 260)

    // Nimbul mic al Pruncului Iisus
    const babyHaloGrad = ctx.createRadialGradient(cx + 45, 250, 10, cx + 45, 250, 55)
    babyHaloGrad.addColorStop(0, '#ffffff')
    babyHaloGrad.addColorStop(0.8, '#aaaaaa')
    babyHaloGrad.addColorStop(1, '#333333')
    ctx.fillStyle = babyHaloGrad
    ctx.beginPath()
    ctx.arc(cx + 45, 250, 50, 0, Math.PI * 2)
    ctx.fill()

    // Chipul Pruncului
    const babyFace = ctx.createRadialGradient(cx + 45, 250, 5, cx + 45, 250, 30)
    babyFace.addColorStop(0, '#ffffff')
    babyFace.addColorStop(0.7, '#caa090')
    babyFace.addColorStop(1, '#604030')
    ctx.fillStyle = babyFace
    ctx.beginPath()
    ctx.ellipse(cx + 45, 250, 24, 28, -0.1, 0, Math.PI * 2)
    ctx.fill()

    // Cute mari veșminte
    ctx.lineWidth = 8
    ctx.strokeStyle = '#c8a880'
    ctx.beginPath()
    ctx.moveTo(cx + 70, 290)
    ctx.quadraticCurveTo(cx + 20, 420, cx - 110, h - 30)
    ctx.stroke()
  }

  ctx.restore()

  // Ramă exterioară conturată
  ctx.strokeStyle = '#888888'
  ctx.lineWidth = 10
  ctx.strokeRect(10, 10, w - 20, h - 20)

  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 3
  ctx.strokeRect(18, 18, w - 36, h - 36)

  return canvas
}
