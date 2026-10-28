import React, { useRef } from 'react'
import type { ImageProcessingOptions } from '../types/cnc'
import {
  Upload,
  Sliders,
  Maximize2,
  Shield,
  Wand2
} from 'lucide-react'

interface ImageControlsProps {
  options: ImageProcessingOptions
  onOptionsChange: (newOptions: ImageProcessingOptions) => void
  onLoadPresetIcon: (type: 'virginMary' | 'christ' | 'cross') => void
  onImageUploaded: (image: HTMLImageElement) => void
}

export const ImageControls: React.FC<ImageControlsProps> = ({
  options,
  onOptionsChange,
  onLoadPresetIcon,
  onImageUploaded
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        onImageUploaded(img)
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  const applyPreset = (presetName: string) => {
    switch (presetName) {
      case 'icon_deep':
        onOptionsChange({
          ...options,
          reliefMode: 'smartIcon',
          maxDepthMm: 18,
          baseThicknessMm: 6,
          macroDomeVolume: 75,
          microDetailStrength: 65,
          antiHoleProtection: 85,
          bgSeparationLevel: 70,
          facialSmoothing: 60,
          blurRadius: 2,
          edgeSharpen: 45,
          haloBoost: 60,
          contrast: 125,
          brightness: 5,
          gamma: 1.15,
          invert: false,
          frameStyle: 'arch',
          frameWidthMm: 16
        })
        break
      case 'wood_standard':
        onOptionsChange({
          ...options,
          reliefMode: 'standard',
          maxDepthMm: 12,
          baseThicknessMm: 5,
          macroDomeVolume: 40,
          microDetailStrength: 40,
          antiHoleProtection: 50,
          bgSeparationLevel: 40,
          facialSmoothing: 40,
          blurRadius: 3,
          edgeSharpen: 25,
          haloBoost: 0,
          contrast: 110,
          brightness: 0,
          gamma: 1.0,
          invert: false,
          frameStyle: 'simple',
          frameWidthMm: 12
        })
        break
      case 'photo_carve':
        onOptionsChange({
          ...options,
          reliefMode: 'photo',
          maxDepthMm: 6,
          baseThicknessMm: 4,
          macroDomeVolume: 20,
          microDetailStrength: 80,
          antiHoleProtection: 30,
          bgSeparationLevel: 0,
          facialSmoothing: 20,
          blurRadius: 1,
          edgeSharpen: 60,
          haloBoost: 0,
          contrast: 135,
          brightness: 5,
          gamma: 1.25,
          invert: false,
          frameStyle: 'none',
          frameWidthMm: 0
        })
        break
    }
  }

  return (
    <div className="bg-[#1a1815] rounded-xl border border-[#2f2b26] p-4 text-stone-200 flex flex-col gap-4 shadow-2xl">
      {/* Upload și Presete Icoane */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
            <Upload className="w-4 h-4" />
            Imagine Sursă (Icoane / Orice Poză)
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs bg-amber-600 hover:bg-amber-500 text-white font-bold px-3 py-1.5 rounded-lg transition shadow-md flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            Încarcă Poză
          </button>
        </div>

        {/* Mostre Icoane Imediate */}
        <div className="bg-[#141312] p-2.5 rounded-xl border border-[#2e2a24] flex flex-col gap-1.5">
          <span className="text-[11px] text-stone-400 font-medium">Modele Icoane Imediate (Fără Internet):</span>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => onLoadPresetIcon('virginMary')}
              className="px-2 py-1.5 bg-[#221f1b] hover:bg-[#2e2a24] border border-[#3b352b] rounded-lg text-[11px] font-bold text-amber-200 transition text-center"
            >
              Maica Domnului
            </button>
            <button
              onClick={() => onLoadPresetIcon('christ')}
              className="px-2 py-1.5 bg-[#221f1b] hover:bg-[#2e2a24] border border-[#3b352b] rounded-lg text-[11px] font-bold text-amber-200 transition text-center"
            >
              Iisus Hristos
            </button>
            <button
              onClick={() => onLoadPresetIcon('cross')}
              className="px-2 py-1.5 bg-[#221f1b] hover:bg-[#2e2a24] border border-[#3b352b] rounded-lg text-[11px] font-bold text-amber-200 transition text-center"
            >
              Cruce Tradițională
            </button>
          </div>
        </div>
      </div>

      {/* Selector Mod Relief: Smart Icon Sculptor vs Standard */}
      <div className="bg-[#141312] p-3 rounded-xl border border-amber-900/40 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
            <Wand2 className="w-4 h-4 text-amber-500" />
            Motor Sculptură 3D (Relief Engine)
          </span>
          <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30 font-bold uppercase">
            {options.reliefMode === 'smartIcon' ? 'Multi-Scară Icoane' : 'Standard'}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5 text-xs">
          <button
            onClick={() => applyPreset('icon_deep')}
            className={`p-2 rounded-lg border text-left transition ${
              options.reliefMode === 'smartIcon'
                ? 'bg-amber-600 text-white font-bold border-amber-500 shadow-md'
                : 'bg-[#201d19] text-stone-300 border-[#383228] hover:bg-[#2a2620]'
            }`}
          >
            <div className="text-[11px]">✨ Smart Icoană</div>
            <div className="text-[9px] opacity-80">Fără gropi la barbă/ochi</div>
          </button>

          <button
            onClick={() => applyPreset('wood_standard')}
            className={`p-2 rounded-lg border text-left transition ${
              options.reliefMode === 'standard'
                ? 'bg-amber-600 text-white font-bold border-amber-500 shadow-md'
                : 'bg-[#201d19] text-stone-300 border-[#383228] hover:bg-[#2a2620]'
            }`}
          >
            <div className="text-[11px]">Lemn Clasic</div>
            <div className="text-[9px] opacity-80">Netezire uniformă</div>
          </button>

          <button
            onClick={() => applyPreset('photo_carve')}
            className={`p-2 rounded-lg border text-left transition ${
              options.reliefMode === 'photo'
                ? 'bg-amber-600 text-white font-bold border-amber-500 shadow-md'
                : 'bg-[#201d19] text-stone-300 border-[#383228] hover:bg-[#2a2620]'
            }`}
          >
            <div className="text-[11px]">Fotogravură</div>
            <div className="text-[9px] opacity-80">Detalii de suprafață</div>
          </button>
        </div>
      </div>

      {/* Dimensiuni fizice piesă de lemn */}
      <div className="bg-[#141312] p-3 rounded-xl border border-[#2e2a24]">
        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 mb-2.5">
          <Maximize2 className="w-4 h-4" />
          Dimensiuni Fizice Lemn Masiv (mm)
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <label className="text-stone-400 block mb-1">Lățime X (mm):</label>
            <input
              type="number"
              min="10"
              max="2500"
              value={options.widthMm}
              onChange={(e) => onOptionsChange({ ...options, widthMm: Number(e.target.value) })}
              className="w-full bg-[#201d19] border border-[#3a352c] rounded px-2.5 py-1 text-white font-mono"
            />
          </div>
          <div>
            <label className="text-stone-400 block mb-1">Înălțime Y (mm):</label>
            <input
              type="number"
              min="10"
              max="2500"
              value={options.heightMm}
              onChange={(e) => onOptionsChange({ ...options, heightMm: Number(e.target.value) })}
              className="w-full bg-[#201d19] border border-[#3a352c] rounded px-2.5 py-1 text-white font-mono"
            />
          </div>
          <div>
            <label className="text-stone-400 block mb-1 font-semibold text-amber-300">Adâncime Relief Z (mm):</label>
            <input
              type="number"
              min="0.5"
              max="150"
              step="0.5"
              value={options.maxDepthMm}
              onChange={(e) => onOptionsChange({ ...options, maxDepthMm: Number(e.target.value) })}
              className="w-full bg-[#201d19] border border-[#3a352c] rounded px-2.5 py-1 text-amber-300 font-bold font-mono"
            />
          </div>
          <div>
            <label className="text-stone-400 block mb-1">Grosime Bază (mm):</label>
            <input
              type="number"
              min="1"
              max="100"
              value={options.baseThicknessMm}
              onChange={(e) => onOptionsChange({ ...options, baseThicknessMm: Number(e.target.value) })}
              className="w-full bg-[#201d19] border border-[#3a352c] rounded px-2.5 py-1 text-white font-mono"
            />
          </div>
        </div>
      </div>

      {/* Reglaje Avansate pentru Icoane (Elimină gropile și conturează trăsăturile) */}
      <div className="flex flex-col gap-3">
        <span className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
          <Sliders className="w-4 h-4" />
          Filtre Avansate de Sculptură & Relief
        </span>

        {/* 1. Protecție Trăsături Întunecate (Anti-Hole) */}
        <div className="flex flex-col gap-1 bg-[#201c17] p-2.5 rounded-xl border border-[#3c3427]">
          <div className="flex justify-between text-xs">
            <span className="text-amber-200 font-bold flex items-center gap-1">
              🛡️ Protecție Zone Negre (Anti-Gropi):
            </span>
            <span className="text-amber-400 font-mono font-bold">{options.antiHoleProtection}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={options.antiHoleProtection}
            onChange={(e) => onOptionsChange({ ...options, antiHoleProtection: Number(e.target.value) })}
            className="accent-amber-500 cursor-pointer"
          />
          <span className="text-[10px] text-stone-400">
            * Vital pentru icoane: împiedică barba neagră, pletele și ochii să se transforme în găuri adânci!
          </span>
        </div>

        {/* 2. Volum Convex Corp & Chip (Macro Dome) */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs">
            <span className="text-stone-300">Volum Convex Corp & Chip (Bombare):</span>
            <span className="text-amber-400 font-mono">{options.macroDomeVolume}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={options.macroDomeVolume}
            onChange={(e) => onOptionsChange({ ...options, macroDomeVolume: Number(e.target.value) })}
            className="accent-amber-500 cursor-pointer"
          />
        </div>

        {/* 3. Detaliu Gravură Linii Fine */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs">
            <span className="text-stone-300">Detaliu Linii & Cute Veșminte:</span>
            <span className="text-amber-400 font-mono">{options.microDetailStrength}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={options.microDetailStrength}
            onChange={(e) => onOptionsChange({ ...options, microDetailStrength: Number(e.target.value) })}
            className="accent-amber-500 cursor-pointer"
          />
        </div>

        {/* 4. Ridicare Nimb / Aureolă Sfântă */}
        <div className="flex flex-col gap-1 bg-[#1e1a14] p-2 rounded-lg border border-[#3a3225]">
          <div className="flex justify-between text-xs">
            <span className="text-amber-200 font-medium">✨ Ridicare Nimb / Aureolă Bizantină:</span>
            <span className="text-amber-400 font-bold font-mono">+{options.haloBoost}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={options.haloBoost}
            onChange={(e) => onOptionsChange({ ...options, haloBoost: Number(e.target.value) })}
            className="accent-amber-500 cursor-pointer"
          />
        </div>

        {/* 5. Curățare Fundal */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs">
            <span className="text-stone-300">Separare & Curățare Fundal Lemn:</span>
            <span className="text-amber-400 font-mono">{options.bgSeparationLevel}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={options.bgSeparationLevel}
            onChange={(e) => onOptionsChange({ ...options, bgSeparationLevel: Number(e.target.value) })}
            className="accent-amber-500 cursor-pointer"
          />
        </div>

        {/* Contrast & Gamma */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
              <span className="text-stone-300">Contrast:</span>
              <span className="text-amber-400 font-mono">{options.contrast}%</span>
            </div>
            <input
              type="range"
              min="50"
              max="200"
              step="5"
              value={options.contrast}
              onChange={(e) => onOptionsChange({ ...options, contrast: Number(e.target.value) })}
              className="accent-amber-500 cursor-pointer"
            />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
              <span className="text-stone-300">Curbă Gamma:</span>
              <span className="text-amber-400 font-mono">{options.gamma.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.05"
              value={options.gamma}
              onChange={(e) => onOptionsChange({ ...options, gamma: Number(e.target.value) })}
              className="accent-amber-500 cursor-pointer"
            />
          </div>
        </div>

        {/* Inversare Relief */}
        <label className="flex items-center gap-2 cursor-pointer text-xs text-stone-300 select-none">
          <input
            type="checkbox"
            checked={options.invert}
            onChange={(e) => onOptionsChange({ ...options, invert: e.target.checked })}
            className="w-4 h-4 rounded accent-amber-500"
          />
          <span>Inversează Adâncimea (Luminos = Adâncit)</span>
        </label>
      </div>

      {/* Profil Ramă & Arcadă Bizantină (Boltă de Icoană) */}
      <div className="bg-[#141312] p-3 rounded-xl border border-[#2e2a24] flex flex-col gap-2">
        <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
          <Shield className="w-4 h-4" />
          Ramă & Arcadă Icoană (Profil Lemn 3D)
        </span>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="text-stone-400 block mb-1">Stil Ramă:</label>
            <select
              value={options.frameStyle}
              onChange={(e) => onOptionsChange({ ...options, frameStyle: e.target.value as any })}
              className="w-full bg-[#201d19] border border-[#3a352c] rounded px-2 py-1 text-white text-xs font-medium"
            >
              <option value="none">Fără Ramă</option>
              <option value="simple">Ramă Clasic Rotunjită</option>
              <option value="arch">Arcadă Icoană (Boltă Bizantină)</option>
              <option value="ornate">Ramă Triplă Sculptată</option>
            </select>
          </div>
          <div>
            <label className="text-stone-400 block mb-1">Lățime Ramă (mm):</label>
            <input
              type="number"
              min="0"
              max="60"
              value={options.frameWidthMm}
              onChange={(e) => onOptionsChange({ ...options, frameWidthMm: Number(e.target.value) })}
              className="w-full bg-[#201d19] border border-[#3a352c] rounded px-2 py-1 text-white font-mono"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
