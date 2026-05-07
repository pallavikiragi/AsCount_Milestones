import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { parseGIF, decompressFrames } from 'gifuct-js';
import { fragmentShader, generateCharAtlas, generateNumberMask, vertexShader } from './AsciiMaterial';

export interface Asset {
  url: string;
  type: 'image' | 'video' | 'gif';
}

export interface AsciiConfig {
  charSet: string;
  charSize: number;
  colorize: boolean;
  invert: boolean;
  bgColor: string;
  textColor: string;
  overlayNumber: string;
  phraseSize?: number;
  brightness: number;
  contrast: number;
}

interface AsciiCanvasProps {
  asset: Asset | null;
  config: AsciiConfig;
}

interface AsciiSceneProps extends AsciiCanvasProps {}

function AsciiScene({ asset, config }: AsciiSceneProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { viewport, size } = useThree();
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [imageAspect, setImageAspect] = useState(1);
  const [gifFrames, setGifFrames] = useState<any[]>([]);

  // For GIF playback
  const fullGifCanvas = useMemo(() => document.createElement('canvas'), []);
  const fullGifCtx = useMemo(() => fullGifCanvas.getContext('2d', { willReadFrequently: true }), [fullGifCanvas]);
  const patchCanvas = useMemo(() => document.createElement('canvas'), []);
  const patchCtx = useMemo(() => patchCanvas.getContext('2d', { willReadFrequently: true }), [patchCanvas]);
  const gifTexture = useMemo(() => {
    const tex = new THREE.CanvasTexture(fullGifCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [fullGifCanvas]);

  // Load image or video texture when asset changes
  useEffect(() => {
    if (!asset) {
      setTexture(null);
      setGifFrames([]);
      return;
    }
    
    let isMounted = true;
    let videoElement: HTMLVideoElement | null = null;
    
    if (asset.type === 'video') {
      setGifFrames([]);
      videoElement = document.createElement('video');
      videoElement.src = asset.url;
      videoElement.crossOrigin = 'anonymous';
      videoElement.loop = false;
      videoElement.muted = true;
      videoElement.playsInline = true;
      
      const tex = new THREE.VideoTexture(videoElement);
      tex.colorSpace = THREE.SRGBColorSpace;
      
      videoElement.onloadeddata = () => {
        if (!isMounted) return;
        setTexture((prevTexture) => {
          if (prevTexture && prevTexture !== gifTexture) prevTexture.dispose();
          return tex;
        });
        setImageAspect(videoElement!.videoWidth / videoElement!.videoHeight);
      };
      
      videoElement.play().catch(e => console.error("Video play failed:", e));
    } else if (asset.type === 'gif') {
      // Decode GIF frames
      fetch(asset.url)
        .then(res => res.arrayBuffer())
        .then(buff => {
          if (!isMounted) return;
          const gif = parseGIF(buff);
          const frames = decompressFrames(gif, true);
          setGifFrames(frames);
          if (frames.length > 0) {
            fullGifCanvas.width = frames[0].dims.width;
            fullGifCanvas.height = frames[0].dims.height;
            setImageAspect(frames[0].dims.width / frames[0].dims.height);
          }
          if (gifTexture) setTexture(gifTexture);
        })
        .catch(err => console.error("GIF Load Error:", err));
    } else {
      setGifFrames([]);
      const loader = new THREE.TextureLoader();
      loader.load(
        asset.url,
        (tex) => {
          if (!isMounted) return;
          tex.colorSpace = THREE.SRGBColorSpace;
          setTexture((prevTexture) => {
            if (prevTexture && prevTexture !== gifTexture) prevTexture.dispose();
            return tex;
          });
          setImageAspect(tex.image.width / tex.image.height);
        },
        undefined,
        (err) => console.error("Error loading image texture", err)
      );
    }

    return () => {
      isMounted = false;
      if (videoElement) {
        videoElement.pause();
        videoElement.src = '';
      }
    };
  }, [asset?.url, asset?.type, gifTexture, fullGifCanvas]);

  // Generate character atlas texture whenever charset changes
  const charMapTexture = useMemo(() => {
    return generateCharAtlas(config.charSet);
  }, [config.charSet]);

  const numberMaskTexture = useMemo(() => {
    return generateNumberMask(config.overlayNumber);
  }, [config.overlayNumber]);

  // Handle shader uniforms initialization
  const uniforms = useMemo(() => ({
    uImage: { value: null },
    uCharMap: { value: null },
    uNumberMask: { value: null },
    uPlaneAspect: { value: 1.0 },
    uCharCount: { value: 0 },
    uResolution: { value: new THREE.Vector2() },
    uCharSize: { value: 10 },
    uColorize: { value: false },
    uInvert: { value: false },
    uIsAnimatedBase: { value: false },
    uBgColor: { value: new THREE.Color() },
    uTextColor: { value: new THREE.Color() },
    uBrightness: { value: 1.0 },
    uContrast: { value: 1.0 },
    uTime: { value: 0 }
  }), []);

  // For playback of gif
  const playingData = useRef({
    frameIndex: 0,
    lastFrameTime: 0,
  });

  // Sync uniforms on every frame
  useFrame((state) => {
    if (!materialRef.current || !texture || !charMapTexture || !numberMaskTexture) return;
    const m = materialRef.current;
    
    m.uniforms.uImage.value = texture;
    m.uniforms.uCharMap.value = charMapTexture;
    m.uniforms.uNumberMask.value = numberMaskTexture;
    m.uniforms.uCharCount.value = config.charSet.length;
    m.uniforms.uTime.value = state.clock.elapsedTime;
    
    // Scale plane to fit into viewport (object-fit: contain behavior)
    const planeAspect = imageAspect;
    const targetAspect = viewport.width / viewport.height;
    
    let scaleX = 1;
    let scaleY = 1;
    
    if (planeAspect > targetAspect) {
      // Image is wider than viewport
      scaleX = viewport.width;
      scaleY = viewport.width / planeAspect;
    } else {
      // Image is taller than viewport
      scaleY = viewport.height;
      scaleX = viewport.height * planeAspect;
    }
    
    m.uniforms.uPlaneAspect.value = planeAspect;
    
    // Physical pixel resolution corresponding to the scaled plane on screen
    const screenPlaneWidth = (scaleX / viewport.width) * size.width;
    const screenPlaneHeight = (scaleY / viewport.height) * size.height;
    
    m.uniforms.uResolution.value.set(screenPlaneWidth, screenPlaneHeight);
    m.uniforms.uCharSize.value = config.charSize;
    m.uniforms.uColorize.value = config.colorize;
    m.uniforms.uInvert.value = config.invert;
    m.uniforms.uIsAnimatedBase.value = asset?.type === 'video' || asset?.type === 'gif';
    m.uniforms.uBgColor.value.set(config.bgColor);
    m.uniforms.uTextColor.value.set(config.textColor);
    m.uniforms.uBrightness.value = config.brightness;
    m.uniforms.uContrast.value = config.contrast;

    // Render GIF frames if available
    if (asset?.type === 'gif' && gifFrames.length > 0 && fullGifCtx && patchCtx) {
      const now = performance.now();
      const currentFrame = gifFrames[playingData.current.frameIndex];
      const delay = Math.max(currentFrame.delay || 100, 20); // fallback 20ms if 0

      if (now - playingData.current.lastFrameTime >= delay) {
        playingData.current.lastFrameTime = now;
        
        // Disposal 2: background (clear the area of current frame before drawing next)
        if (currentFrame.disposalType === 2) {
          fullGifCtx.clearRect(0, 0, fullGifCanvas.width, fullGifCanvas.height);
        }

        playingData.current.frameIndex = (playingData.current.frameIndex + 1) % gifFrames.length;
        const nextFrame = gifFrames[playingData.current.frameIndex];

        if (patchCanvas.width !== nextFrame.dims.width || patchCanvas.height !== nextFrame.dims.height) {
           patchCanvas.width = Math.max(1, nextFrame.dims.width);
           patchCanvas.height = Math.max(1, nextFrame.dims.height);
        }
        
        const imageData = new ImageData(nextFrame.patch, nextFrame.dims.width, nextFrame.dims.height);
        patchCtx.putImageData(imageData, 0, 0);
        fullGifCtx.drawImage(patchCanvas, nextFrame.dims.left, nextFrame.dims.top);
        
        gifTexture.needsUpdate = true;
      }
    }
  });

  // Calculate object-fit contain scaling for the geometry
  const targetAspect = viewport.width / viewport.height;
  let scaleX, scaleY;
  
  if (imageAspect > targetAspect) {
    scaleX = viewport.width;
    scaleY = viewport.width / imageAspect;
  } else {
    scaleY = viewport.height;
    scaleX = viewport.height * imageAspect;
  }

  if (!texture) return null;

  return (
    <mesh scale={[scaleX, scaleY, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent={true} // ensure any weirdness isn't blocked by opaque bounds
      />
    </mesh>
  );
}

export default function AsciiCanvas(props: AsciiCanvasProps) {
  return (
    <div className="w-full h-full inset-0 absolute">
      <Canvas orthographic camera={{ position: [0, 0, 1], zoom: 1 }}>
        <color attach="background" args={[props.config.bgColor]} />
        <AsciiScene {...props} />
      </Canvas>
    </div>
  );
}
