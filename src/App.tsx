import { ChangeEvent, useRef, useState, useEffect } from 'react';
import { Menu, Upload, SlidersHorizontal, Image as ImageIcon, Download, Settings, Github, Check, Plus, ChevronLeft, ChevronRight, Play, Pause, RotateCcw, Lock, Unlock, Library, Trash2, X } from 'lucide-react';
import AsciiCanvas, { AsciiConfig, Asset } from './components/AsciiCanvas';
import { motion, AnimatePresence, animate } from 'motion/react';

// Pre-defined charsets to play with
const CHARSETS = {
  standard: " .:-=+*#%@",
  dense: " .',;:clodxkO0KXNWM",
  binary: " 01",
  matrix: " ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ",
  blocks: " ░▒▓█"
};

interface Milestone {
  assets: (Asset | null)[]; // Max 3 assets limit
  phrase: string;
  audioUrl?: string;
}

interface LibraryAsset {
  id: string;
  url: string;
  type: 'image' | 'video' | 'gif';
}

const DEFAULT_MILESTONES: Record<string, Milestone> = {
  '10': { assets: [{ url: 'https://images.unsplash.com/photo-1542831371-29b0f74f9713?q=80&w=1920&auto=format&fit=crop', type: 'image' }], phrase: 'The final countdown sequence begins.' },
  '9': { assets: [{ url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=1920&auto=format&fit=crop', type: 'image' }], phrase: 'Energies aligning in the void.' },
  '8': { assets: [{ url: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?q=80&w=1920&auto=format&fit=crop', type: 'image' }], phrase: 'Systems are synchronizing.' },
  '7': { assets: [{ url: 'https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?q=80&w=1920&auto=format&fit=crop', type: 'image' }], phrase: 'Gravity anchors engaged.' },
  '6': { assets: [{ url: 'https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?q=80&w=1920&auto=format&fit=crop', type: 'image' }], phrase: 'T-minus six into the unknown.' },
  '5': { assets: [{ url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=1920&auto=format&fit=crop', type: 'image' }], phrase: 'Halfway to terminal velocity.' },
  '4': { assets: [{ url: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?q=80&w=1920&auto=format&fit=crop', type: 'image' }], phrase: 'Sensors detecting anomalies.' },
  '3': { assets: [{ url: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?q=80&w=1920&auto=format&fit=crop', type: 'image' }], phrase: 'Core temperature rising.' },
  '2': { assets: [{ url: 'https://images.unsplash.com/photo-1484504110495-939e9baca603?q=80&w=1920&auto=format&fit=crop', type: 'image' }], phrase: 'Visuals blurring on impact.' },
  '1': { assets: [{ url: 'https://images.unsplash.com/photo-1502481851512-e9e2529bfbf9?q=80&w=1920&auto=format&fit=crop', type: 'image' }], phrase: 'Ignition imminent.' }
};

const DEFAULT_LIBRARY: LibraryAsset[] = (() => {
  const assets: LibraryAsset[] = [];
  const urls = new Set<string>();
  let idx = 0;
  Object.values(DEFAULT_MILESTONES).forEach(m => {
    m.assets.forEach(a => {
      if (a && !urls.has(a.url)) {
        urls.add(a.url);
        assets.push({ id: `default-${idx++}`, url: a.url, type: a.type as any });
      }
    });
  });
  return assets;
})();

function getSafeUrl(url: string) {
  if (!url) return url;
  let safeUrl = url;
  if (safeUrl.includes('github.com') && (safeUrl.includes('/blob/') || safeUrl.includes('/raw/'))) {
    safeUrl = safeUrl.replace('github.com', 'raw.githubusercontent.com').replace(/\/(blob|raw)\//, '/');
  }
  if (safeUrl.includes('raw.githubusercontent.com') && safeUrl.includes('/refs/heads/')) {
    safeUrl = safeUrl.replace('/refs/heads/', '/');
  }
  if (safeUrl.includes('dropbox.com') && safeUrl.includes('dl=0')) {
    safeUrl = safeUrl.replace('dl=0', 'raw=1');
  }
  return safeUrl;
}

export default function App() {
  const [milestones, setMilestones] = useState<Record<string, Milestone>>(() => {
    try {
      const saved = localStorage.getItem('ascii-milestones');
      if (saved) {
        let parsed = JSON.parse(saved) as Record<string, Milestone>;
        // Strip out corrupted data:video strings from localStorage
        for (const key of Object.keys(parsed)) {
            parsed[key].assets = parsed[key].assets.map(a => 
                (a.type === 'video' && a.url.startsWith('data:')) ? { ...a, url: '' } : a
            );
        }
        return parsed;
      }
    } catch (e) {}
    return DEFAULT_MILESTONES;
  });
  
  const [libraryAssets, setLibraryAssets] = useState<LibraryAsset[]>(() => {
    try {
      const saved = localStorage.getItem('ascii-library');
      if (saved) {
         let parsed = JSON.parse(saved) as LibraryAsset[];
         parsed = parsed.filter(a => !(a.type === 'video' && a.url.startsWith('data:')));
         return parsed;
      }
    } catch (e) {}
    return DEFAULT_LIBRARY;
  });

  const [activeNumber, setActiveNumber] = useState<string>('10');
  const [activeSlot, setActiveSlot] = useState<number>(0);
  const [currentAssetIndex, setCurrentAssetIndex] = useState<number>(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  
  const [sidebarTab, setSidebarTab] = useState<'sequence' | 'library'>('sequence');
  const [pickingSlot, setPickingSlot] = useState<number | null>(null);

  const [transitionState, setTransitionState] = useState<'none' | 'zoom_in' | 'zoom_out' | 'finished'>('none');
  const [charSizeOverride, setCharSizeOverride] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [hasInteracted, setHasInteracted] = useState<boolean>(false);
  
  const [isConfigLocked, setIsConfigLocked] = useState<boolean>(() => {
      return localStorage.getItem('ascii-locked') === 'true';
  });

  const saveAssets = () => {
      try {
          localStorage.setItem('ascii-milestones', JSON.stringify(milestones));
          localStorage.setItem('ascii-library', JSON.stringify(libraryAssets));
          localStorage.setItem('ascii-config', JSON.stringify(config));
          localStorage.setItem('ascii-locked', isConfigLocked.toString());
          
          const hasLocalFiles = libraryAssets.some(a => a.url.startsWith('data:') || a.url.startsWith('blob:')) || 
                                Object.values(milestones).some(m => m.assets.some(a => a.url.startsWith('data:') || a.url.startsWith('blob:')));
          
          if (hasLocalFiles) {
              alert("Assets & Config Saved.\n\nNote: You have local laptop files (like videos or images) saved. These will NOT be visible to others if you share the app, and local videos may not survive a page refresh. Consider using public web URLs for permanence.");
          } else {
              alert("Assets & Config Saved successfully!");
          }
      } catch (e) {
          alert("Error saving assets: Your uploaded files might be too large for browser storage. Please use public Image URLs instead.");
      }
  };

  const [config, setConfig] = useState<AsciiConfig>(() => {
    const defaults: AsciiConfig = {
      charSet: CHARSETS.standard,
      charSize: 10,
      colorize: false,
      invert: false,
      bgColor: '#000000',
      textColor: '#00ff00',
      overlayNumber: '10',
      phraseSize: 24,
      brightness: 1.0,
      contrast: 1.0,
      backgroundAudioUrl: 'https://github.com/pallavikiragi/AsCount_Milestones/raw/refs/heads/main/fullvoiceover.mp3'
    };
    try {
      const saved = localStorage.getItem('ascii-config');
      if (saved) {
         return { ...defaults, ...JSON.parse(saved) };
      }
    } catch(e) {}
    return defaults;
  });

  useEffect(() => {
    setConfig(c => ({ ...c, overlayNumber: transitionState === 'finished' ? '' : activeNumber }));
  }, [activeNumber, transitionState]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backgroundAudioRef = useRef<HTMLAudioElement | null>(null);

  // Background Audio Player
  useEffect(() => {
    const safeAudioUrl = getSafeUrl(config.backgroundAudioUrl || '');
    if (safeAudioUrl && !backgroundAudioRef.current) {
      backgroundAudioRef.current = new Audio(safeAudioUrl);
      backgroundAudioRef.current.loop = false;
    } else if (backgroundAudioRef.current && safeAudioUrl !== backgroundAudioRef.current.src) {
      backgroundAudioRef.current.src = safeAudioUrl;
    }

    if (backgroundAudioRef.current) {
      if (isPlaying && transitionState !== 'finished') {
        backgroundAudioRef.current.play().catch(e => console.error("Audio play failed:", e));
      } else {
        backgroundAudioRef.current.pause();
      }
    }
  }, [config.backgroundAudioUrl, isPlaying, transitionState]);

  const addAssetToLibrary = (url: string, type: 'image' | 'video' | 'gif') => {
    const newAsset: LibraryAsset = { id: Date.now().toString() + Math.random().toString(36).slice(2, 5), url, type };
    setLibraryAssets(prev => [newAsset, ...prev]);
    
    if (pickingSlot !== null) {
       setMilestones(prev => {
           const prevMil = prev[activeNumber] || { assets: [], phrase: '' };
           const newAssets = [...prevMil.assets];
           newAssets[pickingSlot] = { url, type };
           return { ...prev, [activeNumber]: { ...prevMil, assets: newAssets } };
       });
       setPickingSlot(null);
       setSidebarTab('sequence');
    }
  };

  const assignLibraryAssetToSlot = (asset: LibraryAsset) => {
    if (pickingSlot !== null) {
       setMilestones(prev => {
           const prevMil = prev[activeNumber] || { assets: [], phrase: '' };
           const newAssets = [...prevMil.assets];
           newAssets[pickingSlot] = { url: asset.url, type: asset.type };
           return { ...prev, [activeNumber]: { ...prevMil, assets: newAssets } };
       });
       setPickingSlot(null);
       setSidebarTab('sequence');
    }
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith('video/')) {
        const objectUrl = URL.createObjectURL(file);
        addAssetToLibrary(objectUrl, 'video');
    } else {
        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUrl = event.target?.result as string;
            const type = file.type === 'image/gif' ? 'gif' : 'image';
            
            addAssetToLibrary(dataUrl, type);
        };
        reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  // Playback timer for multiple assets
  const activeMilestone = milestones[activeNumber];
  const activeAssets = (activeMilestone?.assets || []).filter(a => a !== null && a !== undefined) as Asset[];
  
  useEffect(() => {
    setCurrentAssetIndex(0);
  }, [activeNumber]);

  useEffect(() => {
    if (transitionState !== 'none' || !isPlaying) return; // Don't advance assets during zoom transition or if paused
    
    // Safety check, if no assets, wait and transition anyway
    if (activeAssets.length === 0) {
      if (activeNumber === '1') {
        const t = setTimeout(() => setTransitionState('finished'), 3000);
        return () => clearTimeout(t);
      } else {
        const t = setTimeout(() => setTransitionState('zoom_in'), 3000);
        return () => clearTimeout(t);
      }
    }
    
    const currentAsset = activeAssets[currentAssetIndex];
    if (!currentAsset) return;

    const advance = () => {
       if (currentAssetIndex >= activeAssets.length - 1) {
           if (activeNumber === '1') {
              setTransitionState('finished');
           } else {
              setTransitionState('zoom_in');
           }
       } else {
           setCurrentAssetIndex(prev => prev + 1);
       }
    };

    // Every asset plays exactly for 3 seconds
    const timeoutId = window.setTimeout(advance, 3000);

    return () => clearTimeout(timeoutId);
  }, [activeAssets.length, currentAssetIndex, activeNumber, activeAssets[currentAssetIndex]?.url, transitionState, isPlaying]);

  // Transition Animation Loop
  useEffect(() => {
    if (transitionState === 'zoom_in') {
      const controls = animate(config.charSize, 32, {
         duration: 2,
         ease: 'easeInOut',
         onUpdate: (latest) => setCharSizeOverride(latest),
         onComplete: () => {
            const currentNum = parseInt(activeNumber);
            const nextNum = currentNum - 1;
            setActiveNumber(nextNum.toString()); 
            setCurrentAssetIndex(0);
            setTransitionState('zoom_out');
         }
      });
      return () => controls.stop();
    } else if (transitionState === 'zoom_out') {
      const controls = animate(32, config.charSize, {
         duration: 2,
         ease: 'easeInOut',
         onUpdate: (latest) => setCharSizeOverride(latest),
         onComplete: () => {
            setCharSizeOverride(null);
            setTransitionState('none');
         }
      });
      return () => controls.stop();
    } else if (transitionState === 'finished') {
      const controls = animate(config.charSize, 4096, {
         duration: 4,
         ease: 'easeInOut',
         onUpdate: (latest) => setCharSizeOverride(latest),
      });
      return () => controls.stop();
    }
  }, [transitionState, config.charSize, activeNumber]);

  const currentAsset = activeAssets.length > 0 ? activeAssets[currentAssetIndex] : null;

  const effectiveConfig = { ...config, charSize: charSizeOverride !== null ? Math.round(charSizeOverride) : config.charSize };

  const restartFrom10 = () => {
    setActiveNumber('10');
    setCurrentAssetIndex(0);
    setTransitionState('none');
    setCharSizeOverride(null);
    setIsPlaying(true);
    if (backgroundAudioRef.current) {
       backgroundAudioRef.current.currentTime = 0;
       backgroundAudioRef.current.play().catch(e => console.error(e));
    }
  };

  const loadDefaultAssets = () => {
    setMilestones(DEFAULT_MILESTONES);
    restartFrom10();
  };

  return (
    <div className="h-screen w-screen bg-[#F4F4F4] text-[#1A1A1A] font-sans flex overflow-hidden">
      <input 
        type="file" 
        accept="image/*,video/*,.gif" 
        ref={fileInputRef} 
        style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
        onChange={handleFileUpload} 
      />
      
      {/* Sidebar Controls */}
      <div className="shrink-0 relative transition-[width] duration-300 overflow-hidden z-40 bg-white" style={{ width: isSidebarOpen ? '320px' : '0px' }}>
        <aside className="absolute top-0 left-0 w-80 h-full border-r border-[#E0E0E0] bg-white flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.05)] transition-transform duration-300" style={{ transform: isSidebarOpen ? 'translateX(0)' : 'translateX(-100%)' }}>
            <div className="flex border-b border-[#F0F0F0] shrink-0">
               <button 
                  onClick={() => setSidebarTab('sequence')} 
                  className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider transition-colors ${sidebarTab === 'sequence' ? 'text-black border-b-2 border-black' : 'text-[#A0A0A0] border-b-2 border-transparent hover:text-[#707070]'}`}
               >
                  Sequence Editor
               </button>
               <button 
                  onClick={() => setSidebarTab('library')} 
                  className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 ${sidebarTab === 'library' ? 'text-black border-b-2 border-black' : 'text-[#A0A0A0] border-b-2 border-transparent hover:text-[#707070]'}`}
               >
                  <Library className="w-3.5 h-3.5" />
                  Asset Library
               </button>
               <button 
                  onClick={() => setIsSidebarOpen(false)} 
                  className="px-4 border-l border-[#F0F0F0] hover:bg-[#F0F0F0] text-[#707070] transition-colors"
               >
                  <ChevronLeft className="w-4 h-4" />
               </button>
            </div>
            
            <div className="flex-1 overflow-y-auto hidden-scrollbar flex flex-col relative w-full overflow-x-hidden">
               {sidebarTab === 'sequence' && (
                 <div className="flex flex-col flex-1 h-full">
                   <div className="p-6 border-b border-[#F0F0F0] shrink-0">
                     <h3 className="text-[11px] uppercase tracking-widest text-[#909090] font-bold mb-4">Number Series</h3>
                     {/* Number Series Grid */}
                     <div className="space-y-4">
                       <div className="grid grid-cols-5 gap-1.5">
                {Array.from({length: 10}, (_, i) => 10 - i).map(num => {
                  const nStr = num.toString();
                  const isActive = activeNumber === nStr;
                  const hasAsset = (milestones[nStr]?.assets || []).some(a => a != null);
                  return (
                    <button
                      key={nStr}
                      onClick={() => {
                        if (transitionState === 'zoom_in' || transitionState === 'zoom_out') return;
                        setActiveNumber(nStr);
                        setCurrentAssetIndex(0);
                      }}
                      className={`aspect-square flex items-center justify-center text-[11px] font-mono border rounded transition-all ${
                        isActive 
                        ? 'border-black bg-black text-white' 
                        : hasAsset 
                          ? 'border-[#E0E0E0] bg-[#F9F9F9] hover:border-black' 
                          : 'border-dashed border-[#E0E0E0] text-[#A0A0A0] hover:border-black'
                      }`}
                    >
                      {nStr}
                    </button>
                  );
                })}
              </div>
            </div>
           </div>

           {!isConfigLocked && (
              <div className="p-6 pb-2 border-b border-[#F0F0F0]">
                <h4 className="text-[10px] font-medium text-[#707070] uppercase tracking-wider mb-4">Assets Configuration</h4>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[0, 1, 2].map((idx) => {
                    const asset = milestones[activeNumber]?.assets[idx];
                    return (
                      <div 
                        key={idx}
                        onClick={() => {
                          setPickingSlot(idx);
                          setSidebarTab('library');
                        }}
                        className="aspect-square bg-[#F9F9F9] border-2 border-dashed border-[#E0E0E0] rounded-md flex items-center justify-center cursor-pointer hover:border-black hover:bg-[#F0F0F0] overflow-hidden relative group transition-all"
                      >
                        {asset ? (
                          <>
                            {asset.type === 'video' ? (
                              <video src={getSafeUrl(asset.url) || undefined} className="w-full h-full object-cover opacity-80 group-hover:opacity-100" />
                            ) : (
                              <img src={getSafeUrl(asset.url) || undefined} className="w-full h-full object-cover opacity-80 group-hover:opacity-100" />
                            )}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="text-[9px] text-white font-medium px-2 py-0.5 border border-white/50 rounded">Change</span>
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-1 opacity-60 group-hover:opacity-100">
                            <Plus className="w-4 h-4 text-[#707070] group-hover:text-black" />
                            <span className="text-[8px] uppercase tracking-wider font-medium text-[#707070] group-hover:text-black">Add asset</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <h4 className="text-[10px] font-medium text-[#707070]">Milestone Phrase</h4>
                    <textarea 
                      value={milestones[activeNumber]?.phrase || ''}
                      placeholder="Enter animated text..."
                      onChange={(e) => {
                        setMilestones(prev => {
                          const prevMil = prev[activeNumber] || { assets: [], phrase: '' };
                          return {
                            ...prev,
                            [activeNumber]: { ...prevMil, phrase: e.target.value }
                          };
                        });
                      }}
                      className="w-full h-20 bg-[#F9F9F9] border border-[#E0E0E0] rounded text-[11px] p-2 outline-none resize-none focus:border-black transition-colors"
                    />
                  </div>
                </div>
              </div>
            )}
            
            <div className="p-6 space-y-8">
            
            {/* Configuration */}
            <section>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-[11px] uppercase tracking-widest text-[#909090] font-bold">Shader Params</h3>
                <span className="text-[10px] font-mono bg-[#F0F0F0] px-1 rounded">v1.0.4</span>
              </div>
              
              <div className="space-y-6">
                {/* Grid Size Slider */}
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px] font-medium">
                    <label>Resolution Size</label>
                    <span className="font-mono">{config.charSize}px</span>
                  </div>
                  <input 
                    type="range" 
                    min="4" 
                    max="32" 
                    step="1"
                    value={config.charSize}
                    onChange={e => setConfig(c => ({ ...c, charSize: parseInt(e.target.value) }))}
                    className="w-full accent-black"
                  />
                </div>

                {/* Phrase Size Slider */}
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px] font-medium">
                    <label>Phrase Font Size</label>
                    <span className="font-mono">{config.phraseSize}px</span>
                  </div>
                  <input 
                    type="range" 
                    min="12" 
                    max="72" 
                    step="1"
                    value={config.phraseSize}
                    onChange={e => setConfig(c => ({ ...c, phraseSize: parseInt(e.target.value) }))}
                    className="w-full accent-black"
                  />
                </div>

                {/* Brightness Slider */}
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px] font-medium">
                    <label>Brightness</label>
                    <span className="font-mono">{config.brightness.toFixed(2)}</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="2" 
                    step="0.05"
                    value={config.brightness}
                    onChange={e => setConfig(c => ({ ...c, brightness: parseFloat(e.target.value) }))}
                    className="w-full accent-black"
                  />
                </div>

                {/* Contrast Slider */}
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px] font-medium">
                    <label>Contrast</label>
                    <span className="font-mono">{config.contrast.toFixed(2)}</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="3" 
                    step="0.1"
                    value={config.contrast}
                    onChange={e => setConfig(c => ({ ...c, contrast: parseFloat(e.target.value) }))}
                    className="w-full accent-black"
                  />
                </div>

                {/* Charset Selector */}
                <div className="space-y-3">
                  <label className="text-[11px] font-medium block">Character Set</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(CHARSETS).map(([name, chars]) => (
                      <button
                        key={name}
                        onClick={() => setConfig(c => ({ ...c, charSet: chars }))}
                        className={`text-[10px] py-2 border rounded capitalize transition-colors ${
                          config.charSet === chars 
                          ? 'border-black bg-black text-white' 
                          : 'border-[#E0E0E0] text-[#707070] hover:border-black hover:text-black'
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Toggles */}
                <div className="flex justify-between items-center text-[11px] font-medium pt-2">
                  <label className="cursor-pointer" onClick={() => setConfig(c => ({ ...c, colorize: !c.colorize }))}>Colorize</label>
                  <div 
                    className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${config.colorize ? 'bg-black' : 'bg-[#E0E0E0]'}`}
                    onClick={() => setConfig(c => ({ ...c, colorize: !c.colorize }))}
                  >
                    <div className={`w-3 h-3 bg-white rounded-full transition-transform ${config.colorize ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                </div>
                
                <div className="flex justify-between items-center text-[11px] font-medium">
                  <label className="cursor-pointer" onClick={() => setConfig(c => ({ ...c, invert: !c.invert }))}>Invert brightness</label>
                  <div 
                    className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${config.invert ? 'bg-black' : 'bg-[#E0E0E0]'}`}
                    onClick={() => setConfig(c => ({ ...c, invert: !c.invert }))}
                  >
                    <div className={`w-3 h-3 bg-white rounded-full transition-transform ${config.invert ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                </div>

              </div>
            </section>

            {/* Global Audio */}
            <section>
              <h3 className="text-[11px] uppercase tracking-widest text-[#909090] font-bold mb-4">Background Audio</h3>
              <div className="space-y-3">
                <label className="text-[11px] font-medium block">Audio URL (mp3)</label>
                <input 
                  type="text" 
                  value={config.backgroundAudioUrl || ''}
                  onChange={e => setConfig(c => ({ ...c, backgroundAudioUrl: e.target.value }))}
                  placeholder="https://example.com/audio.mp3"
                  className="w-full bg-[#F9F9F9] border border-[#E0E0E0] rounded text-[11px] px-3 py-2 outline-none focus:border-black transition-colors"
                />
              </div>
            </section>

            {/* Colors */}
            {!config.colorize && (
              <section>
                <h3 className="text-[11px] uppercase tracking-widest text-[#909090] font-bold mb-4">Color Mapping</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-medium text-[#707070]">Background</label>
                    <input 
                      type="color" 
                      value={config.bgColor}
                      onChange={e => setConfig(c => ({ ...c, bgColor: e.target.value }))}
                      className="w-full h-8 px-1 py-1 bg-white border border-[#E0E0E0] rounded cursor-pointer"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-medium text-[#707070]">Text Color</label>
                    <input 
                      type="color" 
                      value={config.textColor}
                      onChange={e => setConfig(c => ({ ...c, textColor: e.target.value }))}
                      className="w-full h-8 px-1 py-1 bg-white border border-[#E0E0E0] rounded cursor-pointer"
                    />
                  </div>
                </div>
              </section>
            )}
           </div>
          </div>
          )}

          {sidebarTab === 'library' && (
             <div className="flex flex-col h-full bg-[#FAFAFA]">
                {pickingSlot !== null && (
                   <div className="bg-black text-white text-[10px] uppercase tracking-wider font-bold p-3 flex justify-between items-center shrink-0">
                      <span>Assign to Slot {pickingSlot + 1}</span>
                      <button onClick={() => { setPickingSlot(null); setSidebarTab('sequence'); }} className="opacity-70 hover:opacity-100 flex items-center">
                         <X className="w-3.5 h-3.5" />
                      </button>
                   </div>
                )}
                
                <div className="p-4 space-y-3 shrink-0 bg-white border-b border-[#F0F0F0]">
                   <div className="space-y-1">
                     <input
                       type="text"
                       placeholder="Paste Image/Video URL & Enter"
                       className="w-full px-2 py-2 border border-[#E0E0E0] rounded text-[11px] focus:outline-none focus:border-black"
                       onKeyDown={(e) => {
                         if (e.key === 'Enter' && e.currentTarget.value) {
                             let url = e.currentTarget.value.trim();
                             
                             // Auto-convert github links to raw
                             if (url.includes('github.com') && (url.includes('/blob/') || url.includes('/raw/'))) {
                                url = url.replace('github.com', 'raw.githubusercontent.com').replace(/\/(blob|raw)\//, '/');
                             }
                             // Auto-convert dropbox links
                             if (url.includes('dropbox.com') && url.includes('dl=0')) {
                                url = url.replace('dl=0', 'raw=1');
                             }
                             
                             let type = 'image';
                             if (url.match(/\.(mp4|webm|mov|ogg)(?:\?.*)?$/i)) type = 'video';
                             else if (url.match(/\.gif(?:\?.*)?$/i)) type = 'gif';
                             
                             addAssetToLibrary(url, type as any);
                             e.currentTarget.value = '';
                         }
                       }}
                     />
                     <p className="text-[9px] text-[#A0A0A0] leading-tight px-1 mt-1">
                       Use direct raw links. For Dropbox, change <b>dl=0</b> to <b>raw=1</b>. Supported video formats: MP4, WebM. (MOV may not play in all browsers).
                     </p>
                   </div>
                   <div className="flex items-center gap-2">
                       <hr className="flex-1 border-[#E0E0E0]" />
                       <span className="text-[9px] uppercase tracking-wider text-[#A0A0A0] font-bold">OR</span>
                       <hr className="flex-1 border-[#E0E0E0]" />
                   </div>
                   <button 
                     onClick={() => fileInputRef.current?.click()} 
                     className="w-full py-2 bg-[#F0F0F0] hover:bg-[#E0E0E0] transition-colors rounded text-xs font-medium flex items-center justify-center gap-2"
                   >
                     <Plus className="w-3.5 h-3.5" />
                     Upload to Library
                   </button>
                </div>
                
                <div className="p-4 grid grid-cols-3 gap-2 overflow-y-auto">
                   {libraryAssets.map(asset => (
                       <div 
                         key={asset.id} 
                         className="relative aspect-square border border-[#E0E0E0] bg-white group cursor-pointer hover:border-black transition-all rounded overflow-hidden flex items-center justify-center" 
                         onClick={() => {
                             if (pickingSlot !== null) {
                                 assignLibraryAssetToSlot(asset);
                             }
                         }}
                       >
                          {asset.type === 'video' ? (
                             <video src={getSafeUrl(asset.url)} autoPlay muted loop playsInline className="w-full h-full object-cover" />
                          ) : (
                             <img src={getSafeUrl(asset.url)} className="w-full h-full object-cover" />
                          )}
                          
                          {pickingSlot !== null && (
                             <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="text-[8px] bg-white text-black px-1.5 py-0.5 rounded font-bold uppercase">Assign</span>
                             </div>
                          )}

                          <button 
                             onClick={(e) => {
                                 e.stopPropagation();
                                 setLibraryAssets(prev => prev.filter(a => a.id !== asset.id));
                             }}
                             className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                          >
                             <Trash2 className="w-3 h-3" />
                          </button>
                       </div>
                   ))}
                   {libraryAssets.length === 0 && (
                       <div className="col-span-3 text-center py-6 text-[10px] uppercase tracking-wider text-[#A0A0A0] font-bold">
                           Library is empty
                       </div>
                   )}
                </div>
             </div>
          )}
          </div>
          
          {/* Sidebar Footer Actions */}
          <div className="p-6 border-t border-[#F0F0F0] shrink-0 bg-white space-y-3">
             <div className="bg-[#F9F9F9] p-2 rounded text-[9px] font-mono leading-relaxed mb-3">
                 <span className="text-[#909090]">// Shader Status</span><br/>
                 [WebGL] Context initialized.
             </div>
             
             {!isConfigLocked && (
               <button 
                  onClick={saveAssets}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-black text-white rounded text-xs font-medium hover:bg-black/80 transition-colors shadow-sm"
                >
                  <Check className="w-3.5 h-3.5" />
                  Save Assets & Library
              </button>
             )}
             
             <button 
                 onClick={() => {
                     const next = !isConfigLocked;
                     setIsConfigLocked(next);
                     localStorage.setItem('ascii-locked', next.toString());
                     if (next) {
                        localStorage.setItem('ascii-config', JSON.stringify(config));
                        localStorage.setItem('ascii-milestones', JSON.stringify(milestones));
                        localStorage.setItem('ascii-library', JSON.stringify(libraryAssets));
                     }
                 }}
                 className={`w-full flex items-center justify-center gap-2 px-3 py-2 border rounded text-xs font-medium transition-colors ${
                    isConfigLocked ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' : 'border-[#E0E0E0] bg-[#F9F9F9] hover:bg-gray-100 hover:border-[#D0D0D0] text-[#707070] hover:text-black'
                 }`}
               >
                 {isConfigLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                 {isConfigLocked ? 'Config Locked / Edit' : 'Lock Config'}
             </button>
          </div>
          </aside>
        </div>

        {/* Main Canvas Area */}
        <div className="flex-1 bg-[#121212] flex flex-col relative overflow-hidden">
          
          <div className="absolute top-6 left-6 flex gap-4 z-30 pointer-events-none">
            {!isSidebarOpen && (
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded border border-white/20 text-white pointer-events-auto transition-colors drop-shadow-md"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="flex-1 relative flex items-center justify-center bg-black">
            {transitionState === 'finished' ? (
               <div className="w-full h-full bg-black z-50"></div>
            ) : currentAsset ? (
              <AsciiCanvas asset={currentAsset} config={effectiveConfig} />
            ) : (
              <div className="flex flex-col items-center text-[#707070]">
                <ImageIcon className="w-10 h-10 mb-4 opacity-50" />
                <p className="text-sm">Select an asset for number {activeNumber}.</p>
                <div className="flex gap-2">
                  {!isConfigLocked && (
                    <button 
                      onClick={() => {
                        setPickingSlot(0);
                        setSidebarTab('library');
                        setIsSidebarOpen(true);
                      }}
                      className="mt-4 px-4 py-1.5 border border-[#E0E0E0] text-xs font-medium rounded hover:bg-white transition-colors pointer-events-auto"
                    >
                      Update Asset
                    </button>
                  )}
                  <button 
                    onClick={loadDefaultAssets}
                    className="mt-4 px-4 py-1.5 bg-[#1A1A1A] text-white text-xs font-medium rounded hover:bg-black transition-colors pointer-events-auto"
                  >
                    Load Defaults
                  </button>
                </div>
              </div>
            )}

            {/* Phrase Display (Typewriter DOM Overlay) */}
            <div className="absolute bottom-16 left-10 z-20 pointer-events-none w-[70%] max-w-2xl px-6 py-4">
               <AnimatePresence mode="wait">
                  {activeMilestone?.phrase && transitionState === 'none' && (
                    <motion.div
                      key={activeNumber + activeMilestone.phrase}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: { duration: 0.5 } }}
                      className="font-mono font-bold text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)]"
                      style={{ fontSize: `${config.phraseSize}px`, lineHeight: 1.2 }}
                    >
                      {activeMilestone.phrase.split('').map((char, i) => (
                        <motion.span
                          key={`${i}-${char}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.05, duration: 0.1 }}
                          className="inline-block whitespace-pre-wrap"
                        >
                          {char}
                        </motion.span>
                      ))}
                    </motion.div>
                  )}
               </AnimatePresence>
            </div>
          </div>

          {/* Viewport Tools */}
          <div className="h-12 border-t border-white/10 flex items-center justify-center gap-6 shrink-0 relative z-10 bg-[#121212]">
            <button 
              className="text-white/40 hover:text-white transition-colors" 
              title="Restart from 10"
              onClick={restartFrom10}
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            
            <button 
              className="w-8 h-8 flex items-center justify-center bg-white text-black rounded-full hover:bg-white/90 transition-colors"
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
            
            <button className="text-white/40 hover:text-white transition-colors" title="Download Screenshot">
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
    </div>
  );
}
