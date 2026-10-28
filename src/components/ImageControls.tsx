import React, { useRef } from 'react'
import type { ImageProcessingOptions } from '../types/cnc'
import { Upload, Sparkles, Sliders, Maximize2, Shield } from 'lucide-react'

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
          maxDepthMm: 18,
          baseThicknessMm: 6,
          blurRadius: 2,
          edgeSharpen: 45,
          haloBoost: 60,
          contrast: 130,
          brightness: 10,
          gamma: 1.15,
          invert: false,
          frameStyle: 'arch',
          frameWidthMm: 18
        })
        break
      case 'wood_standard':
        onOptionsChange({
          ...options,
          maxDepthMm: 12,
          baseThicknessMm: 5,
          blurRadius: 3,
          edgeSharpen: 20,
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
          maxDepthMm: 6,
          baseThicknessMm: 4,
          blurRadius: 1,
          edgeSharpen: 60,
          haloBoost: 0,
          contrast: 140,
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
    <div className="bg-[#1a1815] rounded-xl border border-[#2f2b26] p-4 text-stone-200 flex flex-col gap-4 shadow-xl">
      {/* Upload și Presete Icoane */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
            <Upload className="w-4 h-4" />
            Imagine Sursă (Orice Fișier / Icoane)
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
            className="text-xs bg-amber-600 hover:bg-amber-500 text-white font-semibold px-3 py-1.5 rounded-lg transition shadow-md flex items-center gap-1"
          >
            <Upload className="w-3.5 h-3.5" />
            Încarcă Imagine
          </button>
        </div>

        {/* Butoane Mostre Icoane Instant */}
        <div className="bg-[#141312] p-2.5 rounded-lg border border-[#2e2a24] flex flex-col gap-1.5">
          <span className="text-[11px] text-stone-400 font-medium">Modele Icoane Imediate (Fără Internet):</span>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => onLoadPresetIcon('virginMary')}
              className="px-2 py-1.5 bg-[#221f1b] hover:bg-[#2e2a24] border border-[#3b352b] rounded-md text-[11px] font-medium text-amber-200 transition text-center"
            >
              Maica Domnului
            </button>
            <button
              onClick={() => onLoadPresetIcon('christ')}
              className="px-2 py-1.5 bg-[#221f1b] hover:bg-[#2e2a24] border border-[#3b352b] rounded-md text-[11px] font-medium text-amber-200 transition text-center"
            >
              Iisus Hristos
            </button>
            <button
              onClick={() => onLoadPresetIcon('cross')}
              className="px-2 py-1.5 bg-[#221f1b] hover:bg-[#2e2a24] border border-[#3b352b] rounded-md text-[11px] font-medium text-amber-200 transition text-center"
            >
              Cruce Tradițională
            </button>
          </div>
        </div>
      </div>

      {/* Profiluri de Lucru Rapide */}
      <div>
        <span className="text-xs font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1.5 mb-2">
          <Sparkles className="w-4 h-4 text-amber-500" />
          Configurări Predefinite
        </span>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => applyPreset('icon_deep')}
            className="p-2 bg-[#221f1b] hover:bg-[#2f2a24] border border-[#3d362c] rounded-lg text-left transition flex flex-col"
          >
            <span className="text-xs font-bold text-amber-300">Icoană Relief</span>
            <span className="text-[10px] text-stone-400">Nimb + Arcadă + Netezire</span>
          </button>
          <button
            onClick={() => applyPreset('wood_standard')}
            className="p-2 bg-[#221f1b] hover:bg-[#2f2a24] border border-[#3d362c] rounded-lg text-left transition flex flex-col"
          >
            <span className="text-xs font-bold text-amber-300">Lemn Masiv</span>
            <span className="text-[10px] text-stone-400">Relief clasic 12mm</span>
          </button>
          <button
            onClick={() => applyPreset('photo_carve')}
            className="p-2 bg-[#221f1b] hover:bg-[#2f2a24] border border-[#3d362c] rounded-lg text-left transition flex flex-col"
          >
            <span className="text-xs font-bold text-amber-300">Fotogravură</span>
            <span className="text-[10px] text-stone-400">Detalii fine de suprafață</span>
          </button>
        </div>
      </div>

      {/* Dimensiuni fizice piesă de lemn */}
      <div className="bg-[#141312] p-3 rounded-xl border border-[#2e2a24]">
        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 mb-2.5">
          <Maximize2 className="w-4 h-4" />
          Dimensiuni Fizice Piesă de Lemn (mm)
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

      {/* Ajustări Specifice Icoane & Sculptură Lemn */}
      <div className="flex flex-col gap-3">
        <span className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
          <Sliders className="w-4 h-4" />
          Filtre de Prelucrare Imagine
        </span>

        {/* Netezire lemn (Blur) */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs">
            <span className="text-stone-300">Netezire Lemn (Elimină zgomotul de pixeli):</span>
            <span className="text-amber-400 font-mono">{options.blurRadius} px</span>
          </div>
          <input
            type="range"
            min="0"
            max="12"
            step="1"
            value={options.blurRadius}
            onChange={(e) => onOptionsChange({ ...options, blurRadius: Number(e.target.value) })}
            className="accent-amber-500 cursor-pointer"
          />
        </div>

        {/* Ridicare Nimb / Aureolă Icoană */}
        <div className="flex flex-col gap-1 bg-[#201c17] p-2 rounded-lg border border-[#3c3427]">
          <div className="flex justify-between text-xs">
            <span className="text-amber-200 font-medium">✨ Ridicare Nimb / Aureolă Sfântă:</span>
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
          <span className="text-[10px] text-stone-400">
            Accentuează rotunjimea aureolei bizantine pentru a ieși în relief față de fundal.
          </span>
        </div>

        {/* Accentuare Contururi Fine */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs">
            <span className="text-stone-300">Accentuare Muchii & Cute Veșminte:</span>
            <span className="text-amber-400 font-mono">{options.edgeSharpen}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={options.edgeSharpen}
            onChange={(e) => onOptionsChange({ ...options, edgeSharpen: Number(e.target.value) })}
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
          <span>Inversează Adâncimea (Zonele albe devin adâncite în loc de înalte)</span>
        </label>
      </div>

      {/* Profil Ramă / Arcadă de Icoană */}
      <div className="bg-[#141312] p-3 rounded-xl border border-[#2e2a24] flex flex-col gap-2">
        <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
          <Shield className="w-4 h-4" />
          Ramă & Arcadă Icoană (Profil Lemn)
        </span>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="text-stone-400 block mb-1">Stil Ramă:</label>
            <select
              value={options.frameStyle}
              onChange={(e) => onOptionsChange({ ...options, frameStyle: e.target.value as any })}
              className="w-full bg-[#201d19] border border-[#3a352c] rounded px-2 py-1 text-white text-xs"
            >
              <option value="none">Fără Ramă</option>
              <option value="simple">Ramă Clasic Rotunjită</option>
              <option value="arch">Arcadă Icoană (Boltă Bizantină)</option>
              <option value="ornate">Ramă Triplă Ornată</option>
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
