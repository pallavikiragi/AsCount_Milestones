import * as THREE from 'three';

export const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fragmentShader = `
  uniform sampler2D uImage;
  uniform sampler2D uCharMap;
  uniform sampler2D uNumberMask;
  uniform float uPlaneAspect;
  uniform float uCharCount;
  uniform vec2 uResolution;
  uniform float uCharSize;
  uniform bool uColorize;
  uniform bool uInvert;
  uniform bool uIsAnimatedBase;
  uniform vec3 uBgColor;
  uniform vec3 uTextColor;
  uniform float uBrightness;
  uniform float uContrast;
  uniform float uTime;

  varying vec2 vUv;
  
  float random (vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
  }

  void main() {
      // Calculate how many character blocks fit in the screen plane
      vec2 gridCount = floor(uResolution / uCharSize);
      
      // Determine the coordinate of the current block
      vec2 blockUv = floor(vUv * gridCount) / gridCount;
      // Get the center of current block to sample image color consistently per block
      vec2 centerUv = blockUv + (0.5 / gridCount);

      // Animate the image UV slightly based on time ONLY if it is not a video/gif
      if (!uIsAnimatedBase) {
          centerUv.x += sin(centerUv.y * 10.0 + uTime * 2.0) * 0.005;
          centerUv.y += cos(centerUv.x * 10.0 + uTime * 1.5) * 0.005;
      }
      centerUv = clamp(centerUv, 0.0, 1.0);

      vec4 imgColor = texture2D(uImage, centerUv);
      
      // Calculate perceived luminance
      float luminance = dot(imgColor.rgb, vec3(0.2126, 0.7152, 0.0722));

      // Add a dynamic wave to the luminance for character shifting effect to animate the ASCII characters
      float timeOffset = sin(uTime * 4.0 + centerUv.x * 30.0 + centerUv.y * 20.0) * 0.05;
      timeOffset += cos(uTime * 6.0 + centerUv.x * 15.0 - centerUv.y * 25.0) * 0.05;
      
      if (!uIsAnimatedBase) {
          timeOffset += sin(uTime * 10.0 + centerUv.x * 50.0 + vec2(1.0).x) * 0.1;
      }
      
      if (uInvert) {
          luminance = 1.0 - luminance;
      }

      luminance = clamp(luminance + timeOffset, 0.0, 1.0);
      
      // Apply Brightness & Contrast
      luminance = (luminance - 0.5) * uContrast + 0.5 + (uBrightness - 1.0);
      luminance = clamp(luminance, 0.0, 1.0);

      // Evaluate Number Mask
      vec2 maskUv = centerUv;
      maskUv.x = (maskUv.x - 0.5) * uPlaneAspect + 0.5;
      float maskVal = 0.0;
      if(maskUv.x >= 0.0 && maskUv.x <= 1.0 && maskUv.y >= 0.0 && maskUv.y <= 1.0) {
          maskVal = texture2D(uNumberMask, maskUv).r;
      }
      
      float numberMaskBlend = step(0.5, maskVal);

      // Force high luminance for the mask area so it uses the densest character
      // Randomize to make characters dynamic and varied within the mask
      float timeStep = floor(uTime * 15.0); // Animate glitch 15 times a sec
      float noiseVal = random(centerUv + timeStep);
      float dynamicMaskLum = mix(0.4, 0.999, noiseVal);
      luminance = mix(luminance, dynamicMaskLum, numberMaskBlend);

      // Choose character index based on luminance
      float charIndex = floor(luminance * uCharCount);
      charIndex = clamp(charIndex, 0.0, uCharCount - 1.0);

      // UV coordinates relative to the current block (0.0 to 1.0)
      vec2 localUv = fract(vUv * gridCount);

      // Map local block UV to the character map atlas UV
      float atlasUvX = (localUv.x + charIndex) / uCharCount;
      vec2 atlasUv = vec2(atlasUvX, localUv.y);
      vec4 charTexColor = texture2D(uCharMap, atlasUv);

      // Determine text and background colors
      vec3 baseText = uColorize ? imgColor.rgb : uTextColor;
      vec3 baseBg = uColorize ? vec3(0.0) : uBgColor; // When colorized, usually keep background dark

      // Boost the image color for the mask to make it stand out
      vec3 highlightedColor = imgColor.rgb + vec3(0.4); // Brighten towards white
      highlightedColor = clamp(highlightedColor, 0.0, 1.0);
      // To ensure high contrast even on light patches, we mix the highlighted color
      // with a pure white based on the image's luminance
      highlightedColor = mix(highlightedColor, vec3(1.0), 0.3);

      vec3 finalHighlightColor = highlightedColor;
      if (!uColorize) {
          finalHighlightColor = vec3(1.0);
      }

      // Force bright colorized text and dark background where the mask is
      vec3 fText = mix(baseText, finalHighlightColor, numberMaskBlend);
      vec3 fBg = mix(baseBg, vec3(0.0), numberMaskBlend);

      // Use char texture's red channel as a mask (white text on black background in atlas)
      vec3 finalColor = mix(fBg, fText, charTexColor.r);
      
      gl_FragColor = vec4(finalColor, 1.0);
  }
`;

export function generateNumberMask(numStr: string): THREE.Texture | null {
  if (!numStr) return null;
  const canvas = document.createElement('canvas');
  const size = 1024;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontSize = numStr.length > 1 ? Math.floor(1024 / numStr.length) : 800;
  ctx.font = `bold ${fontSize}px sans-serif`; 
  ctx.fillText(numStr, size / 2, size / 2 + size * 0.05);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function generateCharAtlas(chars: string): THREE.Texture | null {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Use a power of 2 size if possible, or large enough for high quality
  const size = 64; 
  canvas.width = size * chars.length;
  canvas.height = size;

  // Fill background black
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw text white
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Use a bold monospace font for better ASCII weight
  ctx.font = `bold ${size * 0.8}px monospace`;

  for (let i = 0; i < chars.length; i++) {
    // Add slightly vertical shift to align properly in canvas
    ctx.fillText(chars[i], i * size + size / 2, size / 2 + size * 0.05);
  }

  const texture = new THREE.CanvasTexture(canvas);
  // Linear filter helps with visual smoothness if scaled
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
