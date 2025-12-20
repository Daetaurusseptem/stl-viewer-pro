import { Injectable, NgZone } from '@angular/core';
import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  PointLight,
  Color3,
  Color4,
  MeshBuilder,
  StandardMaterial,
  Texture,
  CubeTexture,
  PBRMaterial,
  SceneLoader,
  Mesh,
  AbstractMesh,
  Matrix,
  Nullable,
  Tools,
  Layer,
  Effect,
  PostProcess,
  ParticleSystem,
  GizmoManager,
  PointerEventTypes,
  Scalar,
  VideoRecorder,
  CustomProceduralTexture,
  VertexBuffer,
  Vector2,
  Path2,
  Curve3,
  SolidParticleSystem,
  PolygonMeshBuilder,
  CSG,
  DynamicTexture
} from '@babylonjs/core';
import '@babylonjs/loaders/stl';
import '@babylonjs/loaders/glTF'; // GLB/GLTF Support
import GIF from 'gif.js';
import { BehaviorSubject } from 'rxjs';
import { HttpClient } from '@angular/common/http';

// --- SHADER DEFINITIONS ---

const VIGNETTE_SHADER = `
precision highp float;
varying vec2 vUV;
uniform vec3 topColor;
uniform vec3 bottomColor;
uniform float offset;

void main(void) {
    float dist = distance(vUV, vec2(0.5, 0.5));
    float vignette = smoothstep(0.8, 0.2, dist * (1.0 + offset)); // offset controls openness
    vec3 color = mix(bottomColor, topColor, vUV.y);
    gl_FragColor = vec4(color * vignette, 1.0);
}
`;

const GRID_SHADER = `
precision highp float;
varying vec2 vUV;
uniform float time;
uniform vec3 gridColor;
uniform float speed;

void main(void) {
    vec2 uv = vUV * 2.0 - 1.0;

    // Perspective
    float fov = 2.0;
    float horizon = 0.2;
    float y = uv.y + horizon;
    if (y < 0.0) { gl_FragColor = vec4(0.05, 0.05, 0.1, 1.0); return; } // Sky

    float z = 1.0 / y;
    float x = uv.x * z;

    // Grid movement
    float move = time * speed;

    // Grid lines
    float size = 0.5;
    vec2 grid = fract(vec2(x, z + move) * size);
    float line = step(0.95, grid.x) + step(0.95, grid.y);

    // Fade out
    float fade = smoothstep(0.0, 1.5, y);

    vec3 color = mix(vec3(0.05, 0.0, 0.15), gridColor, line * fade);
    gl_FragColor = vec4(color, 1.0);
}
`;

const UNDERWATER_SHADER = `
precision highp float;
varying vec2 vUV;
uniform float time;

// Simplex noise function (simplified)
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

void main(void) {
    vec2 uv = vUV;

    // Caustics
    float noise1 = snoise(uv * 10.0 + time * 0.5);
    float noise2 = snoise(uv * 20.0 - time * 0.3);
    float caustics = smoothstep(0.4, 0.8, noise1 * 0.5 + noise2 * 0.5);

    // Deep blue gradient
    vec3 deepBlue = vec3(0.0, 0.05, 0.2);
    vec3 lightBlue = vec3(0.0, 0.4, 0.8);
    vec3 bg = mix(deepBlue, lightBlue, uv.y + 0.2);

    gl_FragColor = vec4(bg + vec3(caustics * 0.3), 1.0);
}
`;

const THEATER_SHADER = `
precision highp float;
varying vec2 vUV;
uniform float time;

void main(void) {
    vec2 uv = vUV;

    // Curtain folds (Sine wave)
    float folds = sin(uv.x * 20.0 + sin(uv.y * 5.0 + time));
    float foldFactor = (folds + 1.0) * 0.5;

    // Vignette / Spotlight
    float dist = distance(uv, vec2(0.5, 0.5));
    float spot = 1.0 - smoothstep(0.2, 0.8, dist);

    // Color
    vec3 darkRed = vec3(0.2, 0.0, 0.0);
    vec3 brightRed = vec3(0.8, 0.0, 0.0);

    vec3 curtain = mix(darkRed, brightRed, foldFactor);

    // Apply Spotlight
    vec3 finalColor = curtain * (0.2 + 0.8 * spot);

    gl_FragColor = vec4(finalColor, 1.0);
}
`;

const PAPARAZZI_SHADER = `
precision highp float;
varying vec2 vUV;
uniform float time;

// Pseudo-random
float rand(vec2 co){
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main(void) {
    vec2 uv = vUV;
    vec3 bg = vec3(0.05, 0.05, 0.05); // Dark Crowd

    float flashes = 0.0;

    for(float i = 0.0; i < 5.0; i++) {
        // Random position
        float t = floor(time * 5.0 + i); // Quantize time for "pop" effect
        vec2 pos = vec2(rand(vec2(i, t)), rand(vec2(t, i)));

        float dist = distance(uv, pos);
        float flash = smoothstep(0.05, 0.0, dist) * rand(vec2(t, t)); // Fade out

        // Decay
        float localTime = fract(time * 5.0 + i); // 0 to 1
        flash *= (1.0 - localTime); // Fade out quickly

        flashes += flash;
    }

    gl_FragColor = vec4(bg + vec3(flashes), 1.0);
}
`;

const SCIFI_SHADER = `
precision highp float;
varying vec2 vUV;
uniform float time;

void main(void) {
    vec2 uv = vUV * 2.0 - 1.0;
    float r = length(uv);
    float a = atan(uv.y, uv.x);

    // Tunnel effect
    float tunnel = 1.0 / r + time;

    float grid = sin(tunnel * 10.0) * sin(a * 10.0);
    float glow = smoothstep(0.0, 0.5, grid);

    vec3 color = vec3(0.1, 0.5, 1.0) * glow * r; // Blue warp

    gl_FragColor = vec4(color, 1.0);
}
`;

const JUNGLE_SHADER = `
precision highp float;
varying vec2 vUV;
uniform float time;

// Leaf/Organic noise
float hash(vec2 p) { return fract(1e4 * sin(17.0 * p.x + p.y * 0.1) * (0.1 + abs(sin(p.y * 13.0 + p.x)))); }

float noise(vec2 x) {
    vec2 i = floor(x);
    vec2 f = fract(x);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

void main(void) {
    vec2 uv = vUV;
    
    // Layers of leaves/vines
    float n1 = noise(uv * 10.0 + vec2(sin(time * 0.2), time * 0.1));
    float n2 = noise(uv * 20.0 - vec2(time * 0.1, 0.0));
    
    float leaf = smoothstep(0.4, 0.6, n1 * 0.6 + n2 * 0.4);
    
    vec3 lightGreen = vec3(0.1, 0.4, 0.1);
    vec3 darkGreen = vec3(0.0, 0.1, 0.0);
    vec3 sun = vec3(0.5, 0.6, 0.2); // Sun piercing through
    
    vec3 col = mix(darkGreen, lightGreen, n1);
    col = mix(col, sun, leaf * 0.3 * (1.0 - uv.y)); // More lights at top
    
    gl_FragColor = vec4(col, 1.0);
}
`;

const HELL_SHADER = `
precision highp float;
varying vec2 vUV;
uniform float time;

void main(void) {
    vec2 uv = vUV;
    
    // Fire/Lava flow upwards
    // Distorted UVs
    float heat = sin(uv.y * 10.0 - time * 2.0) * 0.05;
    vec2 distortedUV = uv + vec2(heat, 0.0);
    
    // Simple fire noise
    float n = sin(distortedUV.x * 20.0 + distortedUV.y * 10.0 - time * 5.0) * sin(distortedUV.x * 10.0 - distortedUV.y * 20.0);
    float intensity = smoothstep(0.2, 0.8, n * 0.5 + 0.5);
    
    vec3 red = vec3(0.8, 0.1, 0.0);
    vec3 orange = vec3(1.0, 0.5, 0.0);
    vec3 yellow = vec3(1.0, 0.8, 0.2);
    vec3 dark = vec3(0.2, 0.0, 0.0);
    
    // Gradient
    vec3 fire = mix(red, orange, intensity);
    fire = mix(fire, yellow, pow(intensity, 4.0)); // Hot spots
    
    // Ashes / Sparkles
    float spark = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
    float sparkle = step(0.98, spark * sin(time * 10.0 + uv.y * 50.0));
    
    fire += vec3(1.0, 0.8, 0.5) * sparkle;
    
    // Vignette
    fire = mix(fire, dark, uv.y * 0.4);
    
    gl_FragColor = vec4(fire, 1.0);
}
`;

const LOLLIPOP_SHADER = `
precision highp float;
varying vec2 vUV;
uniform float time;

void main(void) {
    vec2 uv = vUV * 2.0 - 1.0; // -1 to 1
    float angle = atan(uv.y, uv.x);
    float dist = length(uv);
    
    // Spiral
    float spiral = sin(angle * 5.0 + dist * 10.0 - time * 1.5);
    float stripe = smoothstep(-0.2, 0.2, spiral);
    
    // Colors
    vec3 pink = vec3(1.0, 0.4, 0.7);
    vec3 cyan = vec3(0.2, 0.9, 1.0);
    vec3 yellow = vec3(1.0, 0.9, 0.2);
    vec3 white = vec3(1.0, 1.0, 1.0);

    vec3 color = mix(pink, cyan, stripe);
    
    // Candy swirls
    float swirl2 = sin(angle * 10.0 - dist * 20.0 + time * 2.0);
    color = mix(color, white, smoothstep(0.8, 0.9, swirl2) * 0.5);
    
    // Vignette (soft pink)
    color = mix(color, pink * 0.5, dist * 0.3);
    
    gl_FragColor = vec4(color, 1.0);
}
`;

export interface OverlayLayer {
  id: string;
  type: 'image' | 'text' | 'frame' | 'rect' | 'circle' | 'triangle' | 'star' | 'custom-svg';
  visible: boolean;
  x: number; // 0-1 relative to crop area
  y: number; // 0-1 relative to crop area
  width: number; // 0-1 relative width
  height?: number; // 0-1 relative height (optional, for shapes)
  fontSize?: number;
  rotation?: number; // degrees
  src?: string;
  text?: string;
  fontFamily?: string;
  color?: string; // Fill color
  strokeColor?: string;
  strokeWidth?: number;
  shadowBlur?: number;
  shadowColor?: string;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  imageElement?: HTMLImageElement; // Cached element
  // Animations (values = speed, 0/null = off)
  animPulse?: number;
  animSpin?: number;
  animFlash?: number;
  animRainbow?: number;
  svgContent?: string;
}


@Injectable({
  providedIn: 'root'
})
export class VisualizerService {
  private engine!: Engine;
  private scene!: Scene;
  private canvas!: HTMLCanvasElement;
  private particleSystem!: ParticleSystem;
  private recorder: VideoRecorder | null = null;
  private keyLight!: PointLight;
  private fillLight!: PointLight;
  private backLight!: PointLight;
  private globalLight!: HemisphericLight;
  private _isRecording: boolean = false;
  private gif: any = null; // Type 'any' because gif.js types might be tricky with import
  private gifFrameInterval: any = null;

  get isRecording(): boolean {
    return this._isRecording;
  }

  constructor() { }

  /* BACKGROUND EFFECTS */
  private backgroundLayer: Layer | null = null;
  private backgroundTexture: CustomProceduralTexture | null = null;
  private backgroundEffectTime = 0;
  private backgroundEffectObserver: any = null;

  setBackgroundEffect(mode: 'none' | 'vignette' | 'grid' | 'underwater' | 'theater' | 'paparazzi' | 'scifi' | 'jungle' | 'hell' | 'lollipop'): void {
    console.log("Setting Background Effect:", mode);
    if (!this.scene) return;

    // Cleanup existing
    if (this.backgroundLayer) {
      this.backgroundLayer.dispose();
      this.backgroundLayer = null;
    }
    if (this.backgroundTexture) {
      this.backgroundTexture.dispose();
      this.backgroundTexture = null;
    }
    if (this.backgroundEffectObserver) {
      this.scene.onBeforeRenderObservable.remove(this.backgroundEffectObserver);
      this.backgroundEffectObserver = null;
    }

    if (mode === 'none') {
      this.scene.clearColor = new Color4(0.1, 0.1, 0.1, 1); // Default dark
      return;
    }

    // Set clear color to transparent to see layer? 
    // Actually Layer renders *after* clear but *before* meshes if isBackground=true.
    // But Layer needs to fill the screen.

    let shaderCode = "";
    // Use unique texture name to avoid caching issues?
    // Actually Effect.ShadersStore is global.
    // Let's use mode-specific name.
    let textureName = "bgTexture_" + mode;
    let uniforms: string[] = ["time"];

    switch (mode) {
      case 'vignette':
        shaderCode = VIGNETTE_SHADER;
        uniforms.push("topColor", "bottomColor", "offset");
        break;
      case 'grid':
        shaderCode = GRID_SHADER;
        uniforms.push("gridColor", "speed");
        break;
      case 'underwater':
        shaderCode = UNDERWATER_SHADER;
        break;
      case 'theater':
        shaderCode = THEATER_SHADER;
        break;
      case 'paparazzi':
        shaderCode = PAPARAZZI_SHADER;
        break;
      case 'scifi':
        shaderCode = SCIFI_SHADER;
        break;
      case 'jungle':
        shaderCode = JUNGLE_SHADER;
        break;
      case 'hell':
        shaderCode = HELL_SHADER;
        break;
      case 'lollipop':
        shaderCode = LOLLIPOP_SHADER;
        break;
    }

    // Store shaders in ShaderStore
    Effect.ShadersStore[textureName + "FragmentShader"] = shaderCode;
    console.log("Registered Shader:", textureName);

    // Create Procedural Texture
    // args: name, texturePath (key in ShaderStore), size, scene
    this.backgroundTexture = new CustomProceduralTexture(textureName + "_tex", textureName, 512, this.scene);
    this.backgroundTexture.refreshRate = 1; // Ensure it updates
    this.backgroundTexture.setFloat("time", 0);

    // Set specific uniforms
    if (mode === 'vignette') {
      this.backgroundTexture.setColor3("topColor", new Color3(0.1, 0.1, 0.1));
      this.backgroundTexture.setColor3("bottomColor", new Color3(0.0, 0.0, 0.0));
      this.backgroundTexture.setFloat("offset", 0.5);
    } else if (mode === 'grid') {
      this.backgroundTexture.setColor3("gridColor", new Color3(1, 0, 1)); // Magenta grid
      this.backgroundTexture.setFloat("speed", 1.0);
    }

    // Create Layer
    this.backgroundLayer = new Layer("bgLayer", null, this.scene, true);
    this.backgroundLayer.texture = this.backgroundTexture;

    // Animation Loop
    this.backgroundEffectTime = 0;
    this.backgroundEffectObserver = this.scene.onBeforeRenderObservable.add(() => {
      this.backgroundEffectTime += this.engine.getDeltaTime() / 1000.0;
      if (this.backgroundTexture) {
        this.backgroundTexture.setFloat("time", this.backgroundEffectTime);
      }
    });
  }

  async initialize(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;

    // In Babylon JS 5.x, WebGPU was experimental/different interface.
    // For stability with this downgrade, we will standard Engine (WebGL).
    // If WebGPU is strictly required, we would need Babylon 6+, but let's try 5 first for compat.
    console.log('Using Engine (WebGL) with preserveDrawingBuffer');
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });

    this.scene = this.createScene();

    // Start render loop
    this.engine.runRenderLoop(() => {
      this.scene.render();
    });

    // Resize event
    window.addEventListener('resize', () => {
      this.engine.resize();
    });
  }

  createScene(): Scene {
    const scene = new Scene(this.engine);

    // Transparent background for now, or dark gray
    scene.clearColor = new Color4(0.1, 0.1, 0.1, 1);

    // Camera
    const camera = new ArcRotateCamera("Camera", -Math.PI / 2, Math.PI / 2.5, 5, Vector3.Zero(), scene);
    camera.attachControl(this.canvas, true);
    camera.wheelPrecision = 120; // Balanced zoom speed (not too fast, not too slow)

    // Basic Light (will replace with Studio lighting later)
    // const light = new HemisphericLight("light1", new Vector3(1, 1, 0), scene);
    // light.intensity = 0.7;

    this.setupEnvironment(scene);

    return scene;
  }

  setupEnvironment(scene: Scene): void {
    // Environment Texture (IBL)
    const envTexture = CubeTexture.CreateFromPrefilteredData("https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = envTexture;

    // Create a skybox but make it a solid color initially or blurred
    // scene.createDefaultSkybox(envTexture, true, 1000, 0.2); 
    scene.clearColor = new Color4(0.1, 0.1, 0.1, 1);

    // Studio Lights

    // Global Ambient Light (Soft fill)
    this.globalLight = new HemisphericLight("globalLight", new Vector3(0, 1, 0), scene);
    this.globalLight.intensity = 0.5; // Start subtle
    this.globalLight.diffuse = new Color3(1, 1, 1);
    this.globalLight.groundColor = new Color3(0.1, 0.1, 0.1);

    // Key Light
    this.keyLight = new PointLight("keyLight", new Vector3(5, 5, 5), scene);
    this.keyLight.intensity = 0.8;

    // Fill Light
    this.fillLight = new PointLight("fillLight", new Vector3(-5, 5, 5), scene);
    this.fillLight.intensity = 0.4;
    this.fillLight.diffuse = new Color3(0.8, 0.8, 0.9); // Slight blue tint

    // Back Light
    this.backLight = new PointLight("backLight", new Vector3(0, 5, -5), scene);
    this.backLight.intensity = 0.6;
    this.backLight.diffuse = new Color3(0.9, 0.8, 0.8); // Slight warm tint (Rim light)
  }

  // --- LIGHTING CONTROLS ---

  setLightColor(type: 'key' | 'fill' | 'back' | 'global', hex: string): void {
    const c = Color3.FromHexString(hex);
    switch (type) {
      case 'key': this.keyLight.diffuse = c; break;
      case 'fill': this.fillLight.diffuse = c; break;
      case 'back': this.backLight.diffuse = c; break;
      case 'global':
        this.globalLight.diffuse = c;
        this.globalLight.groundColor = c.scale(0.2);
        break;
    }
  }

  setLightIntensity(type: 'key' | 'fill' | 'back' | 'global', intensity: number): void {
    switch (type) {
      case 'key': this.keyLight.intensity = intensity; break;
      case 'fill': this.fillLight.intensity = intensity; break;
      case 'back': this.backLight.intensity = intensity; break;
      case 'global': this.globalLight.intensity = intensity; break;
    }
  }

  // --- TURNTABLE OFFSET ---
  private modelOffset = new Vector3(0, 0, 0);

  setTurntableModelOffset(x: number, y: number, z: number): void {
    if (!this.turntableRoot) return;

    // Retrofitting:
    // Let's implement `ensureModelHolder`.
    this.ensureModelHolder();
    this.modelHolder.position.x = x;
    this.modelHolder.position.y = y;
    this.modelHolder.position.z = z;
  }

  private modelHolder: any;

  private ensureModelHolder(): void {
    if (!this.turntableRoot) return;
    if (!this.modelHolder) {
      this.modelHolder = new Mesh("modelHolder", this.scene);
      this.modelHolder.parent = this.turntableRoot;

      // Move all existing model meshes into this holder
      this.turntableRoot.getChildMeshes().forEach((m: any) => {
        if (m !== this.turntableVisual && m !== this.modelHolder) {
          m.setParent(this.modelHolder);
        }
      });
    }
  }

  toggleParticles(enabled: boolean): void {
    if (enabled) {
      if (!this.particleSystem) {
        this.createParticleSystem();
      }
      this.particleSystem.start();
    } else {
      if (this.particleSystem) {
        this.particleSystem.stop();
      }
    }
  }

  setAutoRotate(enabled: boolean, speed: number = 1): void {
    if (!this.scene) return;

    const camera = this.scene.activeCamera as ArcRotateCamera;
    if (enabled) {
      camera.useAutoRotationBehavior = true;
      camera.autoRotationBehavior!.idleRotationSpeed = speed;
    } else {
      camera.useAutoRotationBehavior = false;
    }
  }

  get isAutoRotating(): boolean {
    if (!this.scene || !this.scene.activeCamera) return false;
    const camera = this.scene.activeCamera as ArcRotateCamera;
    return camera.useAutoRotationBehavior;
  }

  getAutoRotationSpeed(): number {
    if (!this.scene || !this.scene.activeCamera) return 1;
    const camera = this.scene.activeCamera as ArcRotateCamera;
    return camera.autoRotationBehavior?.idleRotationSpeed || 1;
  }

  createParticleSystem(): void {
    if (!this.scene) return;

    // Dispose previous if exists
    if (this.particleSystem) {
      this.particleSystem.dispose();
    }

    // Create a particle system
    this.particleSystem = new ParticleSystem("particles", 5000, this.scene);
    this.particleSystem.particleTexture = new Texture("https://www.babylonjs-playground.com/textures/flare.png", this.scene);

    // Calculate model bounds to emit from everywhere
    let min = new Vector3(-5, -5, -5);
    let max = new Vector3(5, 5, 5);

    if (this.scene.meshes.length > 0) {
      const worldExtends = this.scene.getWorldExtends();
      // Expand slightly
      min = worldExtends.min.add(new Vector3(-1, -1, -1));
      max = worldExtends.max.add(new Vector3(1, 1, 1));
    }

    // Default to 'Stars/Dust' mode
    this.particleSystem.emitter = Vector3.Zero();
    this.particleSystem.minEmitBox = min;
    this.particleSystem.maxEmitBox = max;

    this.particleSystem.color1 = new Color4(1, 1, 1, 1.0);
    this.particleSystem.color2 = new Color4(0.8, 0.8, 1.0, 1.0);
    this.particleSystem.colorDead = new Color4(0, 0, 0, 0.0);

    this.particleSystem.minSize = 0.05;
    this.particleSystem.maxSize = 0.2;

    this.particleSystem.minLifeTime = 1;
    this.particleSystem.maxLifeTime = 5;

    this.particleSystem.emitRate = 1000;
    this.particleSystem.blendMode = ParticleSystem.BLENDMODE_ONEONE;

    // Gentle floating
    this.particleSystem.gravity = new Vector3(0, 0.1, 0);
    this.particleSystem.direction1 = new Vector3(-1, 1, -1);
    this.particleSystem.direction2 = new Vector3(1, 1, 1);

    this.particleSystem.minAngularSpeed = 0;
    this.particleSystem.maxAngularSpeed = Math.PI;

    this.particleSystem.minEmitPower = 0.5;
    this.particleSystem.maxEmitPower = 1.5;
    this.particleSystem.updateSpeed = 0.005;

    // this.particleSystem.start(); // Helper will call start
  }

  updateParticleSettings(settings: { emitRate?: number, speed?: number, size?: number, life?: number }): void {
    if (!this.particleSystem) return;

    if (settings.emitRate !== undefined) {
      this.particleSystem.emitRate = settings.emitRate;
    }
    if (settings.speed !== undefined) {
      this.particleSystem.minEmitPower = settings.speed * 0.5;
      this.particleSystem.maxEmitPower = settings.speed * 1.5;
      this.particleSystem.updateSpeed = settings.speed * 0.005;
    }
    if (settings.size !== undefined) {
      this.particleSystem.minSize = settings.size;
      this.particleSystem.maxSize = settings.size * 2; // Variation
    }
    if (settings.life !== undefined) {
      this.particleSystem.minLifeTime = settings.life;
      this.particleSystem.maxLifeTime = settings.life + 1.0;
    }
  }

  setParticleMode(mode: 'stars' | 'snow' | 'fire'): void {
    if (!this.particleSystem) this.createParticleSystem();

    this.particleSystem.stop();
    this.particleSystem.reset();

    // Recalculate bounds in case model changed
    let min = new Vector3(-5, -5, -5);
    let max = new Vector3(5, 5, 5);
    if (this.scene.meshes.length > 0) {
      const worldExtends = this.scene.getWorldExtends();
      min = worldExtends.min;
      max = worldExtends.max;
    }

    switch (mode) {
      case 'stars':
        this.particleSystem.minEmitBox = min.scale(1.5);
        this.particleSystem.maxEmitBox = max.scale(1.5);
        this.particleSystem.color1 = new Color4(1, 1, 1, 1.0);
        this.particleSystem.color2 = new Color4(0.8, 0.8, 1.0, 1.0);
        this.particleSystem.minSize = 0.05;
        this.particleSystem.maxSize = 0.2;
        this.particleSystem.gravity = new Vector3(0, 0.1, 0);
        this.particleSystem.emitRate = 500;
        break;
      case 'snow':
        // Emit from top
        const topCenter = new Vector3((min.x + max.x) / 2, max.y + 2, (min.z + max.z) / 2);
        this.particleSystem.emitter = topCenter;
        this.particleSystem.minEmitBox = new Vector3(min.x, 0, min.z);
        this.particleSystem.maxEmitBox = new Vector3(max.x, 0, max.z);

        this.particleSystem.color1 = new Color4(1, 1, 1, 1.0);
        this.particleSystem.color2 = new Color4(0.9, 0.9, 1.0, 1.0);
        this.particleSystem.minSize = 0.1;
        this.particleSystem.maxSize = 0.3;
        this.particleSystem.gravity = new Vector3(0, -9.8, 0);
        this.particleSystem.emitRate = 200;
        break;
    }
    this.particleSystem.start();
  }

  setQuality(level: 'low' | 'medium' | 'high'): void {
    if (!this.engine) return;

    switch (level) {
      case 'low':
        this.engine.setHardwareScalingLevel(2);
        break;
      case 'medium':
        this.engine.setHardwareScalingLevel(1);
        break;
      case 'high':
        this.engine.setHardwareScalingLevel(0.75); // Higher res
        break;
    }
  }

  setMaterialProperties(colorHex: string, metallic: number, roughness: number): void {
    if (!this.scene) return;

    // Apply to all meshes in the scene (assuming they are parts of the STL)
    // We should probably filter out skybox if we had one as a mesh
    this.scene.meshes.forEach(mesh => {
      // Skip skybox if we implemented it as a mesh, but we used helper.
      // Also skip generic things if any.

      if (mesh.name === "skybox") return;
      if (mesh.name === "turntableVisual" || mesh.name === "turntableRoot") return;

      let material = mesh.material as any;

      // Force PBRMaterial for everything to support PBR properties
      if (!material || material.getClassName() !== "PBRMaterial") {
        const pbr = new PBRMaterial("pbrMat_" + mesh.name, this.scene);
        pbr.albedoColor = Color3.FromHexString(colorHex);
        pbr.metallic = metallic;
        pbr.roughness = roughness;
        pbr.environmentIntensity = 1;
        mesh.material = pbr;
      } else {
        // Update existing PBR
        material.albedoColor = Color3.FromHexString(colorHex);
        material.metallic = metallic;
        material.roughness = roughness;
      }

      // Ensure vertex colors are used if present (for painting)
      if (mesh.material) {
        // for PBRMaterial, we need specific flags usually, or it uses them by default if present in vertex buffer.
        // Actually need to verify PBRMaterial support for vertex colors mixed with albedo.
        // Usually albedoColor * vertexColor.
        (mesh.material as any).useVertexColors = true;
      }
      mesh.isPickable = true; // Important for painting
    });
  }
  setBackgroundColor(color: string): void {
    if (this.scene) {
      this.scene.clearColor = Color4.FromHexString(color + "FF"); // Append Alpha
    }
  }

  async loadModel(file: File): Promise<void> {
    if (!this.scene) return;

    // Clear existing meshes except generic ones (camera/light) if needed? 
    // For now, let's just dispose all meshes that are not generic? 
    // Or simpler: dispose all meshes and recreate light? 
    // Better: keep track of loaded meshes.

    // Simple approach: Dispose all meshes except the skybox (if any). 
    // But we don't have a skybox yet. 
    // Let's dispose all meshes.
    while (this.scene.meshes.length > 0) {
      this.scene.meshes[0].dispose();
    }

    // Re-add light (since we disposed it?)
    // Actually light is a Node, invalidating meshes doesn't necessarily kill lights but SceneLoader.Append might.
    // Lights are Nodes, not Meshes. So they persist if we only clear meshes.

    try {
      await SceneLoader.AppendAsync("file:", file, this.scene);
      console.log("Model loaded");

      // Frame the model
      if (this.scene.meshes.length > 0) {
        // Calculate bounds
        const worldExtends = this.scene.getWorldExtends();

        // Position camera
        // (this.scene.activeCamera as ArcRotateCamera).framingBehavior.zoomOnMeshHierarchy(null); 
        // Manual framing for control:
        const center = worldExtends.min.add(worldExtends.max).scale(0.5);
        (this.scene.activeCamera as ArcRotateCamera).setTarget(center);

        // Adjust radius to fit
        const size = worldExtends.max.subtract(worldExtends.min);
        const maxDim = Math.max(size.x, size.y, size.z);
        (this.scene.activeCamera as ArcRotateCamera).radius = maxDim * 2;
      }

    } catch (e) {
      console.error("Error loading STL", e);
    }
  }

  getScene(): Scene {
    return this.scene;
  }

  private paintMode = false;
  private paintColor = new Color4(1, 0, 0, 1);
  private onPointerObserver: any;
  private gizmoManager!: GizmoManager;

  public transformChange$ = new BehaviorSubject<{ x: number, y: number, z: number } | null>(null);

  enableGizmos(enabled: boolean): void {
    if (!this.scene) return;

    if (!this.gizmoManager) {
      this.gizmoManager = new GizmoManager(this.scene);
      this.gizmoManager.positionGizmoEnabled = true;
      this.gizmoManager.rotationGizmoEnabled = true;
      this.gizmoManager.scaleGizmoEnabled = true;

      // Sync on Drag
      // We need to attach this listener once
      const notifyTransform = () => {
        // Cast to any to avoid TS issues if typings are outdated
        const mesh = (this.gizmoManager as any).attachedMesh || (this.gizmoManager.gizmos.positionGizmo && this.gizmoManager.gizmos.positionGizmo.attachedMesh);
        if (mesh) {
          this.transformChange$.next({
            x: mesh.position.x,
            y: mesh.position.y,
            z: mesh.position.z
          });
        }
      };

      // Safely attach to observable
      if (this.gizmoManager.gizmos.positionGizmo) {
        (this.gizmoManager.gizmos.positionGizmo as any).onDragObservable.add(notifyTransform);
      } else {
        // Retry or attach later? 
        // Gizmos might be created lazily. 
        // Let's hook into `onAttachedToMeshObservable`?
        (this.gizmoManager as any).onAttachedToMeshObservable.add(() => {
          if (this.gizmoManager.gizmos.positionGizmo) {
            (this.gizmoManager.gizmos.positionGizmo as any).onDragObservable.add(notifyTransform);
          }
        });
      }
    }

    if (enabled) {
      // Logic for Turntable Mode
      if (this.turntableRoot && this.turntableRoot.isEnabled()) {
        this.ensureModelHolder();
        this.gizmoManager.attachToMesh(this.modelHolder);
      } else {
        // Default behavior: Attach to first loaded model
        // Filter out system meshes
        const targets = this.scene.meshes.filter(m =>
          m.name !== "skybox" &&
          m.name !== "turntableRoot" &&
          m.name !== "turntableVisual" &&
          m.name !== "brushCursor" &&
          m.name !== "modelHolder" && // Don't auto-attach to holder in normal mode
          !m.name.startsWith("baseMat_") &&
          m.isVisible &&
          m.getTotalVertices() > 0
        );

        if (targets.length > 0) {
          this.gizmoManager.attachToMesh(targets[0]);
        }
      }
    } else {
      this.gizmoManager.attachToMesh(null);
    }
  }

  private paintRadius = 0.2; // Default radius

  private paintTolerance = 0.1; // 0 to 1 (dot product threshold)
  private brushCursor: any;

  setPaintRadius(radius: number): void {
    this.paintRadius = radius;
    if (this.brushCursor) {
      const scale = radius * 2; // Diameter
      this.brushCursor.scaling.set(scale, scale, scale);
    }
  }

  paintTool: 'brush' | 'bucket' | 'move' = 'brush';

  setPaintTool(tool: 'brush' | 'bucket' | 'move'): void {
    this.paintTool = tool;
    // Re-trigger mode enable/disable to update camera/cursor state
    if (this.paintMode) {
      this.enablePaintMode(true);
    }
  }

  setPaintTolerance(tolerance: number): void {
    this.paintTolerance = tolerance;
  }

  private adjacencyMap: Map<number, number[]> | null = null;
  private adjacencyMeshId: number = -1; // To track if mesh changed

  enablePaintMode(enabled: boolean): void {
    if (!this.scene) return;
    this.paintMode = enabled;
    const camera = this.scene.activeCamera as ArcRotateCamera;

    // Cleanup visual cursor
    if (!this.brushCursor) {
      this.brushCursor = MeshBuilder.CreateTorus("brushCursor", { diameter: 1, thickness: 0.05, tessellation: 32 }, this.scene);
      this.brushCursor.rotation.x = Math.PI / 2;
      const mat = new PBRMaterial("cursorMat", this.scene);
      mat.albedoColor = new Color3(1, 0, 0);
      mat.emissiveColor = new Color3(1, 0, 0);
      mat.alpha = 0.5;
      mat.unlit = true;
      this.brushCursor.material = mat;
      this.brushCursor.isPickable = false;
      this.brushCursor.setEnabled(false);
    }

    // Always clean up previous observer first
    if (this.onPointerObserver) {
      this.scene.onPointerObservable.remove(this.onPointerObserver);
      this.onPointerObserver = null;
    }

    if (enabled) {
      // 1. Handle MOVE Tool (Full Camera Control)
      if (this.paintTool === 'move') {
        camera.attachControl(this.canvas, true);
        // Restore full mouse control [0,1,2]
        if (camera.inputs && camera.inputs.attached['pointers']) {
          (camera.inputs.attached['pointers'] as any).buttons = [0, 1, 2];
        }
        this.brushCursor.setEnabled(false);
        return; // Stop here, no painting logic
      }

      // 2. Handle PAINT Tools (Brush/Bucket)
      // Detach to reset, then attach with restricted inputs
      camera.detachControl();

      // Allow Right-Click (2) to Rotate while painting
      if (camera.inputs && camera.inputs.attached['pointers']) {
        (camera.inputs.attached['pointers'] as any).buttons = [2];
      }
      // Disable Panning on Right Click (Move Pan to Left, so Right becomes Rotate)
      (camera as any).panningMouseButton = 0;
      camera.attachControl(this.canvas, true);

      // Cursor Setup
      if (this.paintTool === 'brush') {
        this.brushCursor.setEnabled(true);
        this.setPaintRadius(this.paintRadius);
      } else {
        this.brushCursor.setEnabled(false);
      }

      // Picking Observer
      this.onPointerObserver = this.scene.onPointerObservable.add((pointerInfo) => {
        const pick = pointerInfo.pickInfo;

        // Update Cursor (Brush only, if not rotating)
        const isRightClick = (pointerInfo.event.button === 2 || pointerInfo.event.buttons === 2);

        if (this.paintTool === 'brush' && pick && pick.hit && pick.pickedPoint && !isRightClick) {
          this.brushCursor.position.copyFrom(pick.pickedPoint);
        }

        const doAction = () => {
          if (pick && pick.hit && pick.pickedMesh && pick.pickedPoint) {
            // CRITICAL: Block paint if right click involved
            if (isRightClick) return;

            if (this.paintTool === 'bucket') {
              if (pick.faceId !== undefined) {
                this.paintConnectedFloodFill(pick.pickedMesh, pick.faceId);
              }
            } else {
              // Brush
              if (this.paintRadius <= 0.05) {
                if (pick.faceId !== undefined) this.paintFace(pick.pickedMesh, pick.faceId);
              } else {
                this.paintArea(pick.pickedMesh, pick.pickedPoint, this.paintRadius);
              }
            }
          }
        };

        if (pointerInfo.type === 1) { // PointerDown
          if (pointerInfo.event.button === 0) doAction(); // Left click only
        } else if (pointerInfo.type === 2) { // PointerMove
          // Paint on Left Drag
          if (pointerInfo.event.buttons === 1 && this.paintTool === 'brush') {
            doAction();
          }
        }
      });

    } else {
      // Exiting Paint Mode
      camera.detachControl();
      // Restore default inputs
      if (camera.inputs && camera.inputs.attached['pointers']) {
        (camera.inputs.attached['pointers'] as any).buttons = [0, 1, 2];
      }
      (camera as any).panningMouseButton = 2; // Restore Pan to Right Click
      camera.attachControl(this.canvas, true);

      if (this.brushCursor) this.brushCursor.setEnabled(false);
    }
  }

  paintArea(mesh: any, center: Vector3, radius: number): void {
    const worldMatrix = mesh.getWorldMatrix();
    const invertMatrix = worldMatrix.clone().invert();
    const localCenter = Vector3.TransformCoordinates(center, invertMatrix);

    const positions = mesh.getVerticesData("position");
    let colors = mesh.getVerticesData("color");

    if (!positions) return;

    if (!colors) {
      colors = new Float32Array((positions.length / 3) * 4);
      for (let i = 0; i < colors.length; i++) colors[i] = 1; // Fill white
    }

    const rSq = radius * radius;
    const r = this.paintColor.r;
    const g = this.paintColor.g;
    const b = this.paintColor.b;

    let modified = false;

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];

      const dx = x - localCenter.x;
      const dy = y - localCenter.y;
      const dz = z - localCenter.z;

      if (dx * dx + dy * dy + dz * dz < rSq) {
        colors[i / 3 * 4] = r;
        colors[i / 3 * 4 + 1] = g;
        colors[i / 3 * 4 + 2] = b;
        colors[i / 3 * 4 + 3] = 1;
        modified = true;
      }
    }

    if (modified) mesh.setVerticesData("color", colors);
  }

  // Build adjacency map for unconnected faces (triangle soup) by welding vertices
  private buildAdjacency(mesh: any) {
    if (this.adjacencyMeshId === mesh.uniqueId && this.adjacencyMap) return;

    const indices = mesh.getIndices();
    const positions = mesh.getVerticesData("position");
    if (!indices || !positions) return;

    this.adjacencyMap = new Map();
    this.adjacencyMeshId = mesh.uniqueId;

    // Map PositionHash -> [FaceIDs]
    const posMap = new Map<string, number[]>();

    const numFaces = indices.length / 3;

    // Helper to hash position
    const hashPos = (i: number) => {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      // Quantize to avoid float errors
      return `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)} `;
    };

    // 1. Fill Position Map
    for (let f = 0; f < numFaces; f++) {
      const i1 = indices[f * 3];
      const i2 = indices[f * 3 + 1];
      const i3 = indices[f * 3 + 2];

      const h1 = hashPos(i1);
      const h2 = hashPos(i2);
      const h3 = hashPos(i3);

      if (!posMap.has(h1)) posMap.set(h1, []);
      posMap.get(h1)!.push(f);

      if (!posMap.has(h2)) posMap.set(h2, []);
      posMap.get(h2)!.push(f);

      if (!posMap.has(h3)) posMap.set(h3, []);
      posMap.get(h3)!.push(f);
    }

    // 2. Build Adjacency from Shared Vertices
    // Two faces are neighbors if they share at least 2 vertices (an edge).
    // Sharing 1 vertex is "weakly connected" (corner touch).
    // For filling, edge sharing is preferred, but corner touch might be acceptable.
    // Let's ensure edge sharing (2 shared verts) to prevent leaking through diagonal check.

    for (let f = 0; f < numFaces; f++) {
      const neighbors = new Set<number>();

      const i1 = indices[f * 3];
      const i2 = indices[f * 3 + 1];
      const i3 = indices[f * 3 + 2];

      const candidates = [
        ...posMap.get(hashPos(i1))!,
        ...posMap.get(hashPos(i2))!,
        ...posMap.get(hashPos(i3))!
      ];

      // Check candidates
      for (const cand of candidates) {
        if (cand === f) continue;
        // Check how many shared verts
        let shared = 0;
        const c1 = indices[cand * 3];
        const c2 = indices[cand * 3 + 1];
        const c3 = indices[cand * 3 + 2];

        const h1 = hashPos(i1); const h2 = hashPos(i2); const h3 = hashPos(i3);
        const ch1 = hashPos(c1); const ch2 = hashPos(c2); const ch3 = hashPos(c3);

        const pHashes = [h1, h2, h3];
        if (pHashes.includes(ch1)) shared++;
        if (pHashes.includes(ch2)) shared++;
        if (pHashes.includes(ch3)) shared++;

        if (shared >= 2) {
          neighbors.add(cand);
        }
      }

      this.adjacencyMap.set(f, Array.from(neighbors));
    }
    console.log(`Adjacency built for ${numFaces} faces.`);
  }

  floodMode: 'flat' | 'smooth' = 'flat';

  setFloodMode(mode: 'flat' | 'smooth') {
    this.floodMode = mode;
  }

  paintConnectedFloodFill(mesh: any, startFaceId: number): void {
    this.buildAdjacency(mesh);
    if (!this.adjacencyMap) return;

    const indices = mesh.getIndices();
    const normals = mesh.getVerticesData("normal");
    let colors = mesh.getVerticesData("color");
    const positions = mesh.getVerticesData("position");

    if (!colors) {
      colors = new Float32Array((positions.length / 3) * 4);
      for (let i = 0; i < colors.length; i++) colors[i] = 1;
    }

    // BFS
    const queue: number[] = [startFaceId];
    const visited = new Set<number>();
    visited.add(startFaceId);

    const r = this.paintColor.r;
    const g = this.paintColor.g;
    const b = this.paintColor.b;

    // Helper to get face normal
    const getFaceNormal = (fid: number) => {
      const i1 = indices[fid * 3];
      const nx = normals[i1 * 3];
      const ny = normals[i1 * 3 + 1];
      const nz = normals[i1 * 3 + 2];
      return { x: nx, y: ny, z: nz }; // Approx using first vertex normal
    };

    // Helper to get face color (check first vertex)
    const getFaceColor = (fid: number) => {
      const i1 = indices[fid * 3];
      return {
        r: colors[i1 * 4],
        g: colors[i1 * 4 + 1],
        b: colors[i1 * 4 + 2]
      };
    };

    const startNormal = getFaceNormal(startFaceId);
    const startColor = getFaceColor(startFaceId); // Original color of start face
    const threshold = 1 - this.paintTolerance;

    // Threshold for color difference (to stop at boundaries)
    const colorDiff = (c1: any, c2: any) => {
      return Math.abs(c1.r - c2.r) + Math.abs(c1.g - c2.g) + Math.abs(c1.b - c2.b);
    };

    // Paint start face immediately
    const paintFace = (fid: number) => {
      const i1 = indices[fid * 3];
      const i2 = indices[fid * 3 + 1];
      const i3 = indices[fid * 3 + 2];
      colors[i1 * 4] = r; colors[i1 * 4 + 1] = g; colors[i1 * 4 + 2] = b; colors[i1 * 4 + 3] = 1;
      colors[i2 * 4] = r; colors[i2 * 4 + 1] = g; colors[i2 * 4 + 2] = b; colors[i2 * 4 + 3] = 1;
      colors[i3 * 4] = r; colors[i3 * 4 + 1] = g; colors[i3 * 4 + 2] = b; colors[i3 * 4 + 3] = 1;
    };

    paintFace(startFaceId);

    let processed = 0;
    const MAX_FACES = 50000; // Safety break

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      processed++;
      if (processed > MAX_FACES) break;

      const neighbors = this.adjacencyMap.get(currentId) || [];
      const currentNormal = getFaceNormal(currentId);

      for (const nid of neighbors) {
        if (visited.has(nid)) continue;

        const nColor = getFaceColor(nid);
        const nNormal = getFaceNormal(nid);

        // 1. Color Boundary Check (Stop if hitting already painted area or different color)
        // If we want to stay within same original color:
        if (colorDiff(nColor, startColor) > 0.1) {
          continue;
        }

        // 2. Geometric Check
        let dot = 0;
        if (this.floodMode === 'flat') {
          // Flat Mode: Compare with Start Normal (keeps it planar)
          dot = nNormal.x * startNormal.x + nNormal.y * startNormal.y + nNormal.z * startNormal.z;
        } else {
          // Smooth/Loop Mode: Compare with Current Normal (follows curve)
          dot = nNormal.x * currentNormal.x + nNormal.y * currentNormal.y + nNormal.z * currentNormal.z;
        }

        if (dot >= threshold) {
          visited.add(nid);
          paintFace(nid);
          queue.push(nid);
        }
      }

      for (const nid of neighbors) {
        if (visited.has(nid)) continue;

        const nNormal = getFaceNormal(nid);
        const nColor = getFaceColor(nid);

        // 1. Color Check: Must match original underlying color (stop at pre-painted lines)
        // We compare neighbor's current color with startColor. 
        // If neighbor is ALREADY painted different color (by user brush), stop.
        if (colorDiff(nColor, startColor) > 0.1) {
          continue; // Hit a boundary
        }

        // 2. Geometric Check
        let dot = 0;
        if (this.floodMode === 'flat') {
          // Compare with Start Normal
          dot = nNormal.x * startNormal.x + nNormal.y * startNormal.y + nNormal.z * startNormal.z;
        } else {
          // Smooth/Loop Mode: Compare with Neighbor (or Current) to follow curve
          // Comparing with Current is better for chaining.
          dot = nNormal.x * currentNormal.x + nNormal.y * currentNormal.y + nNormal.z * currentNormal.z;
        }

        if (dot >= threshold) {
          visited.add(nid);
          paintFace(nid);
          queue.push(nid);
        }
      }
    }

    mesh.setVerticesData("color", colors);
  }
  setPaintColor(hex: string): void {
    this.paintColor = Color4.FromHexString(hex + "FF");
  }

  private turntableRoot: any;
  private turntableVisual: any;

  private turntableSpeed = 0.01;
  private turntableHeightOffset = 0;
  private baseHeight = 0;
  private isTurntablePaused = false;

  private turntableRotationLoop = () => {
    if (this.turntableRoot && this.turntableRoot.isEnabled() && !this.isTurntablePaused) {
      this.turntableRoot.rotation.y += this.turntableSpeed;
    }
  };

  setTurntablePaused(paused: boolean): void {
    this.isTurntablePaused = paused;
  }

  setTurntableSpeed(speed: number): void {
    this.turntableSpeed = speed;
  }

  setTurntableHeight(height: number): void {
    this.turntableHeightOffset = height;
    if (this.turntableRoot && this.turntableRoot.isEnabled()) {
      this.turntableRoot.position.y = this.baseHeight - 0.2 + this.turntableHeightOffset;
    }
  }

  centerModel(): void {
    if (!this.scene) return;

    // 1. Identify Model Meshes and Ensure Holder
    this.ensureModelHolder(); // Ensures all proper meshes are children of modelHolder
    const modelMeshes = this.modelHolder.getChildMeshes();

    if (modelMeshes.length === 0) return;

    // 2. Calculate World Bounds
    let min = new Vector3(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE);
    let max = new Vector3(Number.MIN_VALUE, Number.MIN_VALUE, Number.MIN_VALUE);

    modelMeshes.forEach((m: AbstractMesh) => {
      m.computeWorldMatrix(true);
      const bounds = m.getBoundingInfo();
      min = Vector3.Minimize(min, bounds.boundingBox.minimumWorld);
      max = Vector3.Maximize(max, bounds.boundingBox.maximumWorld);
    });

    const worldCenter = min.add(max).scale(0.5);

    // 3. Convert World Center to Local Space of modelHolder
    // We want to shift meshes within modelHolder so that their apparent center aligns with modelHolder's origin (0,0,0) in X/Z
    // But wait, modelHolder might have its own transforms.
    // Ideally, we want the center of the meshes to be at (0, y, 0) relative to turntableRoot.
    // If modelHolder is child of turntableRoot.

    // Simpler math:
    // We want to apply an offset D to every mesh such that: NewCenter = OldCenter + D = (0, y, 0) (Local).
    // So D = -OldCenter (Local).

    // Let's get the Local Center relative to modelHolder.
    // LocalCenter = Matrix.Invert(HolderWorldMatrix) * WorldCenter
    const invertParentWorldMatrix = this.modelHolder.getWorldMatrix().clone().invert();
    const localCenter = Vector3.TransformCoordinates(worldCenter, invertParentWorldMatrix);

    const offset = new Vector3(-localCenter.x, 0, -localCenter.z); // We only center X and Z

    // 4. Apply Offset
    modelMeshes.forEach((m: AbstractMesh) => {
      m.position.addInPlace(offset);
    });

    // Also update base height for turntable to match bottom?
    this.baseHeight = min.y;
    this.setTurntableHeight(this.turntableHeightOffset);
  }

  // --- MINIATURE BASE GENERATOR ---
  private baseProps: Mesh[] = [];

  setTurntableBaseStyle(style: 'plastic' | 'concrete' | 'obsidian' | 'grid' | 'fabric' | 'terrain'): void {
    if (!this.turntableVisual || !this.scene) return;

    // 1. Clean up existing props
    this.baseProps.forEach(m => m.dispose());
    this.baseProps = [];

    // 2. Base Material Setup
    const mat = new PBRMaterial("baseStyleMat", this.scene);

    // Default PBR
    mat.metallic = 0.0;
    mat.roughness = 0.5;
    mat.albedoColor = Color3.FromHexString("#222222");

    if (style === 'plastic') {
      mat.metallic = 0.1;
      mat.roughness = 0.3;
      mat.albedoColor = Color3.FromHexString("#111111");
    }
    else if (style === 'obsidian') {
      mat.metallic = 0.0;
      mat.roughness = 0.05; // Very shiny
      mat.albedoColor = Color3.Black();
    }
    else if (style === 'concrete') {
      mat.metallic = 0.0;
      mat.roughness = 0.9;
      mat.albedoColor = Color3.FromHexString("#555555");

      // Procedural Noise using DynamicTexture implies dependencies
      // Let's use simple high roughness for now to ensure reliability
      // or try to use a standard noise logic if allowed.
      // I'll stick to color tuning for now to ensure it applies safely.
      mat.albedoColor = Color3.FromHexString("#444444");
    }
    else if (style === 'grid') {
      mat.metallic = 0.8;
      mat.roughness = 0.2;
      mat.albedoColor = Color3.Black();

      // Create Grid Texture
      const dt = new DynamicTexture("gridTex", 512, this.scene);
      const ctx = dt.getContext();
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, 512, 512);

      ctx.strokeStyle = "#00ffcc"; // Cyan Neon
      ctx.lineWidth = 4;
      ctx.beginPath();

      // Draw Grid
      const step = 64;
      for (let i = 0; i <= 512; i += step) {
        ctx.moveTo(i, 0); ctx.lineTo(i, 512);
        ctx.moveTo(0, i); ctx.lineTo(512, i);
      }
      // Draw Circle
      ctx.moveTo(512, 256);
      ctx.arc(256, 256, 240, 0, Math.PI * 2);
      ctx.stroke();
      dt.update();

      mat.emissiveTexture = dt;
      mat.emissiveColor = Color3.White();
    }
    else if (style === 'fabric') {
      mat.metallic = 0.0;
      mat.roughness = 1.0;
      mat.albedoColor = new Color3(0.05, 0.05, 0.2); // Deep Blue Velvet
      mat.sheen.isEnabled = true;
      mat.sheen.intensity = 1.0;
      mat.sheen.roughness = 0.5;
      mat.sheen.albedoScaling = true;
    }
    else if (style === 'terrain') {
      mat.albedoColor = new Color3(0.15, 0.1, 0.05);
      mat.roughness = 1.0;
      mat.metallic = 0.0;
      this.generateTerrainFeatures();
    }

    this.turntableVisual.material = mat;
  }



  private generateTerrainFeatures() {
    if (!this.turntableVisual) return;

    // 1. High-Fidelity Ground (Simple Noise)
    const diameter = this.turntableVisual.scaling.x;
    // Note: If using CreateGroundFromHeightMap is too complex with dependencies, we stick to VertexData update
    const ground = MeshBuilder.CreateGround("terrainGround", { width: diameter, height: diameter, subdivisions: 64 }, this.scene);
    ground.position.y = 0.25 + 0.01;
    ground.parent = this.turntableVisual;

    const positions = ground.getVerticesData(VertexBuffer.PositionKind);
    if (positions) {
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const z = positions[i + 2];
        const dist = Math.sqrt(x * x + z * z);
        if (dist > diameter / 2) {
          positions[i + 1] = -1.0; // Clip
        } else {
          // Noise
          const h = Math.sin(x * 5) * 0.02 + Math.cos(z * 4) * 0.02 + Math.sin(x * 15 + z * 10) * 0.01;
          const edgeFactor = 1.0 - Math.pow(dist / (diameter / 2), 6);
          positions[i + 1] = h * edgeFactor;
        }
      }
      ground.updateVerticesData(VertexBuffer.PositionKind, positions);
      ground.createNormals(true);
    }

    const terrainMat = new PBRMaterial("terrainMat", this.scene);
    terrainMat.albedoColor = new Color3(0.2, 0.15, 0.1);
    terrainMat.roughness = 1.0;
    ground.material = terrainMat;
    this.baseProps.push(ground);

    // 2. High Poly Rock
    const rock = MeshBuilder.CreateSphere("highPolyRock", { diameter: 0.2, segments: 16 }, this.scene);
    rock.scaling = new Vector3(1, 0.6, 1.2); // Flattened sphere = smooth rock
    rock.position = new Vector3(0.2, 0.25 + 0.05, 0.1);
    rock.parent = this.turntableVisual;

    const rockMat = new PBRMaterial("rockMat", this.scene);
    rockMat.albedoColor = new Color3(0.4, 0.4, 0.45);
    rockMat.roughness = 0.8;
    rockMat.metallic = 0.0;
    rock.material = rockMat;
    this.baseProps.push(rock);

    // 3. High Poly Log
    const log = MeshBuilder.CreateCylinder("highPolyLog", { diameter: 0.1, height: 0.5, tessellation: 24 }, this.scene);
    log.rotation = new Vector3(Math.PI / 2, 0, Math.PI / 5);
    log.position = new Vector3(-0.15, 0.25 + 0.05, -0.15);
    log.parent = this.turntableVisual;

    const logMat = new PBRMaterial("logMat", this.scene);
    logMat.albedoColor = new Color3(0.3, 0.2, 0.1);
    logMat.roughness = 0.9;
    log.material = logMat;
    this.baseProps.push(log);
  }

  toggleTurntable(enabled: boolean): void {
    if (!this.scene) return;

    // 1. Cleanup Gizmos to avoid conflicts
    if (this.gizmoManager) {
      this.gizmoManager.attachToMesh(null);
    }

    // 2. Initialize Turntable Structure
    if (!this.turntableRoot) {
      this.turntableRoot = new Mesh("turntableRoot", this.scene);
      this.turntableVisual = MeshBuilder.CreateCylinder("turntableVisual", { diameter: 1, height: 0.5, tessellation: 64 }, this.scene);
      this.turntableVisual.setParent(this.turntableRoot);

      const baseMat = new PBRMaterial("baseMat", this.scene);
      baseMat.albedoColor = new Color3(0.05, 0.05, 0.05);
      baseMat.metallic = 0.1;
      baseMat.roughness = 0.3;
      this.turntableVisual.material = baseMat;
    }

    this.turntableRoot.setEnabled(enabled);
    this.turntableRoot.rotation.y = 0;

    if (enabled) {
      this.scene.meshes.forEach(m => m.computeWorldMatrix(true));

      // Calculate Bounds
      let min = new Vector3(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE);
      let max = new Vector3(Number.MIN_VALUE, Number.MIN_VALUE, Number.MIN_VALUE);
      let hasMesh = false;

      const isModelMesh = (m: any) => {
        return m !== this.turntableRoot &&
          m !== this.turntableVisual &&
          m.name !== "skybox" &&
          m.name !== "particles" &&
          m.name !== "brushCursor" &&
          m.isVisible;
      };

      this.scene.meshes.forEach(m => {
        if (isModelMesh(m)) {
          const bounds = m.getBoundingInfo().boundingBox;
          min = Vector3.Minimize(min, bounds.minimumWorld);
          max = Vector3.Maximize(max, bounds.maximumWorld);
          hasMesh = true;
        }
      });

      if (hasMesh) {
        // Adjust Visual Size
        const width = max.x - min.x;
        const depth = max.z - min.z;
        const diameter = Math.max(width, depth) * 1.5;

        this.turntableVisual.scaling.x = diameter;
        this.turntableVisual.scaling.z = diameter;
        this.turntableVisual.scaling.y = 1;

        // Visual position local to root
        this.turntableVisual.position.y = -0.25 - 0.02;

        // Position Root with Offset
        const centerX = (min.x + max.x) / 2;
        const centerZ = (min.z + max.z) / 2;
        this.baseHeight = min.y; // Capture base height

        this.turntableRoot.position.set(centerX, this.baseHeight - 0.2 + this.turntableHeightOffset, centerZ);

        // Parent Meshes
        this.scene.meshes.forEach(m => {
          if (isModelMesh(m) && !m.parent) {
            m.setParent(this.turntableRoot);
          }
        });
      }

      this.scene.registerBeforeRender(this.turntableRotationLoop);
      this.setAutoRotate(false);

    } else {
      // Disable
      if (this.turntableRoot) {
        this.turntableRoot.getChildMeshes().forEach((m: any) => {
          if (m !== this.turntableVisual) {
            m.setParent(null);
          }
        });
      }
      this.scene.unregisterBeforeRender(this.turntableRotationLoop);
    }
  }



  /* EFFECT SYSTEM */
  private effects: Map<string, PostProcess> = new Map();
  private ditherPalette: number[] = [];
  private ditherPaletteSize: number = 2;
  private pixelScale: number = 1.0;

  toggleEffect(name: 'dither', enabled: boolean): void {
    if (!this.scene || !this.scene.activeCamera) return;

    if (enabled) {
      if (this.effects.has(name)) return; // Already active

      // Initialize default palette if empty
      if (this.ditherPalette.length === 0) this.setDitherPalette('bw');

      switch (name) {
        case 'dither':
          this.createDitherEffect();
          break;
      }
    } else {
      const effect = this.effects.get(name);
      if (effect) {
        effect.dispose();
        this.effects.delete(name);
      }
    }
  }

  setDitherPalette(palette: string): void {
    let colors: Color3[] = [];

    switch (palette) {
      case 'bw': // Classic 1-bit
        colors = [new Color3(0, 0, 0), new Color3(1, 1, 1)];
        break;
      case 'gameboy': // Gameboy (4 colors)
        colors = [
          Color3.FromHexString("#0f380f"),
          Color3.FromHexString("#306230"),
          Color3.FromHexString("#8bac0f"),
          Color3.FromHexString("#9bbc0f")
        ];
        break;
      case 'apple2': // Apple II (16 Color Composite approx)
        colors = [
          Color3.FromHexString("#000000"), Color3.FromHexString("#901740"),
          Color3.FromHexString("#402ca5"), Color3.FromHexString("#d043e5"),
          Color3.FromHexString("#006940"), Color3.FromHexString("#808080"),
          Color3.FromHexString("#2f95e5"), Color3.FromHexString("#bfabff"),
          Color3.FromHexString("#405400"), Color3.FromHexString("#d06a1a"),
          Color3.FromHexString("#808080"), Color3.FromHexString("#ff96bf"),
          Color3.FromHexString("#2fbc1a"), Color3.FromHexString("#bfd35a"),
          Color3.FromHexString("#6fe8bf"), Color3.FromHexString("#ffffff")
        ];
        break;
      case 'cga': // CGA (16 colors)
        colors = [
          Color3.FromHexString("#000000"), Color3.FromHexString("#0000AA"),
          Color3.FromHexString("#00AA00"), Color3.FromHexString("#00AAAA"),
          Color3.FromHexString("#AA0000"), Color3.FromHexString("#AA00AA"),
          Color3.FromHexString("#AA5500"), Color3.FromHexString("#AAAAAA"),
          Color3.FromHexString("#555555"), Color3.FromHexString("#5555FF"),
          Color3.FromHexString("#55FF55"), Color3.FromHexString("#55FFFF"),
          Color3.FromHexString("#FF5555"), Color3.FromHexString("#FF55FF"),
          Color3.FromHexString("#FFFF55"), Color3.FromHexString("#FFFFFF")
        ];
        break;
      case 'cyber':
        colors = [
          Color3.FromHexString("#0d0221"), Color3.FromHexString("#2a1b3d"),
          Color3.FromHexString("#44318d"), Color3.FromHexString("#8265a7"),
          Color3.FromHexString("#a4b3b6"), Color3.FromHexString("#d83f87"),
          Color3.FromHexString("#2a1b3d"), Color3.FromHexString("#f18f01")
        ];
        break;
      case 'sepia':
        colors = [
          Color3.FromHexString("#2b1b00"), Color3.FromHexString("#593a00"),
          Color3.FromHexString("#8c6b35"), Color3.FromHexString("#bf9b6b"),
          Color3.FromHexString("#e6ccb3"), Color3.FromHexString("#ffffff")
        ];
        break;
      default: // Fallback to B&W
        colors = [new Color3(0, 0, 0), new Color3(1, 1, 1)];
        break;
    }

    // Flatten to number array [r,g,b, r,g,b...]
    this.ditherPalette = [];
    colors.forEach(c => this.ditherPalette.push(c.r, c.g, c.b));

    // Pad to 16 colors (48 floats) to match shader uniform size if fixed
    // Or we can pass size. Let's pad to be safe with fixed array size in shader.
    // Shader will define uPalette[16].
    while (this.ditherPalette.length < 16 * 3) {
      this.ditherPalette.push(0, 0, 0);
    }
    this.ditherPaletteSize = colors.length;
  }

  setDitherPixelSize(size: number): void {
    this.pixelScale = Math.max(1.0, size);
  }

  private createDitherEffect(): void {
    Effect.ShadersStore["ditherFragmentShader"] = DITHER_SHADER_CODE;

    const postProcess = new PostProcess("Dither", "dither", ["screenWidth", "screenHeight", "uPalette", "uPaletteSize", "pixelScale"], null, 1.0 / this.pixelScale, this.scene.activeCamera);

    postProcess.onApply = (effect: Effect) => {
      effect.setFloat("screenWidth", this.canvas.width);
      effect.setFloat("screenHeight", this.canvas.height);
      effect.setArray3("uPalette", this.ditherPalette);
      effect.setInt("uPaletteSize", this.ditherPaletteSize);
      effect.setFloat("pixelScale", this.pixelScale);
    };

    this.effects.set('dither', postProcess);
  }

  paintFace(mesh: any, faceId: number): void {
    const indices = mesh.getIndices();
    if (!indices) return;

    let colors = mesh.getVerticesData("color");
    if (!colors) {
      const positions = mesh.getVerticesData("position");
      colors = new Float32Array((positions.length / 3) * 4);
      for (let i = 0; i < colors.length; i++) colors[i] = 1; // Fill white
    }

    const i1 = indices[faceId * 3];
    const i2 = indices[faceId * 3 + 1];
    const i3 = indices[faceId * 3 + 2];

    const r = this.paintColor.r;
    const g = this.paintColor.g;
    const b = this.paintColor.b;
    const a = 1;

    colors[i1 * 4] = r; colors[i1 * 4 + 1] = g; colors[i1 * 4 + 2] = b; colors[i1 * 4 + 3] = a;
    colors[i2 * 4] = r; colors[i2 * 4 + 1] = g; colors[i2 * 4 + 2] = b; colors[i2 * 4 + 3] = a;
    colors[i3 * 4] = r; colors[i3 * 4 + 1] = g; colors[i3 * 4 + 2] = b; colors[i3 * 4 + 3] = a;

    mesh.setVerticesData("color", colors);
  }

  setTurntableMaterial(type: string): void {
    if (!this.turntableVisual || !this.scene) return;

    const matName = "turntableMat_" + type;
    let mat = this.scene.getMaterialByName(matName) as PBRMaterial;

    if (!mat) {
      mat = new PBRMaterial(matName, this.scene);

      switch (type) {
        case 'wood':
          mat.albedoTexture = new Texture("https://playground.babylonjs.com/textures/wood.jpg", this.scene);
          mat.roughness = 0.4;
          mat.metallic = 0;
          break;
        case 'marble':
          mat.albedoColor = new Color3(0.9, 0.9, 0.95);
          mat.roughness = 0.05;
          mat.metallic = 0;
          break;
        case 'fabric':
          mat.albedoColor = new Color3(0.6, 0.1, 0.1);
          mat.roughness = 0.8;
          mat.metallic = 0;
          mat.albedoTexture = new Texture("https://playground.babylonjs.com/textures/ground.jpg", this.scene);
          (mat.albedoTexture as Texture).uScale = 5;
          (mat.albedoTexture as Texture).vScale = 5;
          break;
        case 'plastic':
        default:
          mat.albedoColor = new Color3(0.05, 0.05, 0.05);
          mat.roughness = 0.3;
          mat.metallic = 0.1;
          break;
      }
    }

    this.turntableVisual.material = mat;
  }

  resetCamera(): void {
    if (!this.scene || !this.scene.activeCamera) return;

    const camera = this.scene.activeCamera as ArcRotateCamera;
    const worldExtends = this.scene.getWorldExtends();

    // Use framing behavior if available (best for fitting model)
    if (camera.useFramingBehavior && camera.framingBehavior) {
      camera.framingBehavior.zoomOnBoundingInfo(worldExtends.min, worldExtends.max);
    } else {
      // Manual fallback
      const center = worldExtends.min.add(worldExtends.max).scale(0.5);
      camera.setTarget(center);
      camera.alpha = Math.PI / 2;
      camera.beta = Math.PI / 2.5;
      camera.radius = 10;
    }
  }

  /* RECORDING SYSTEM */
  startRecording(filename: string = "stl-visualizer.webm"): void {
    if (this._isRecording) return;
    if (!VideoRecorder.IsSupported(this.engine)) {
      console.error("VideoRecorder is not supported.");
      return;
    }

    this.recorder = new VideoRecorder(this.engine);
    this._isRecording = true;

    this.recorder.startRecording(filename, 0).then(() => {
      this._isRecording = false;
      this.recorder = null;
      console.log("Recording stopped and downloaded.");
    });
  }

  async startGifRecording(fps: number, durationSec: number, width: number, overlays: OverlayLayer[], filename: string, globalFilter?: string, crop?: { x: number, y: number, w: number, h: number }, seamlessLoop: boolean = false) {
    if (this._isRecording) return;
    this._isRecording = true;

    // Filter invisible
    const activeOverlays = overlays.filter(l => l.visible);

    // Preload Images & SVGs
    await this.preloadLayerImages(activeOverlays);

    console.log(`Starting GIF recording: FPS: ${fps}, Width: ${width}, Seamless: ${seamlessLoop}`);

    // Calculate final output dimensions
    let finalHeight: number;
    let sourceWidth = this.canvas.width;
    let sourceHeight = this.canvas.height;
    let sx = 0, sy = 0;

    if (crop) {
      sx = crop.x;
      sy = crop.y;
      sourceWidth = crop.w;
      sourceHeight = crop.h;
      finalHeight = width * (crop.h / crop.w);
    } else {
      finalHeight = width * (this.canvas.height / this.canvas.width);
    }

    // Initialize GIF encoder
    this.gif = new GIF({
      workers: 2,
      quality: 1, // High Quality
      width: width,
      height: finalHeight,
      workerScript: 'assets/gif.worker.js',
      dither: false // Dithering creates noise for 3D
    });

    const totalFrames = Math.round(fps * durationSec);
    const intervalMs = 1000 / fps;
    const resizeCanvas = document.createElement('canvas');
    resizeCanvas.width = width;
    resizeCanvas.height = finalHeight;
    const ctx = resizeCanvas.getContext('2d');

    // --- Seamless Loop Setup ---
    let initialAlpha = 0;
    let initialInertia = 0.9;
    const camera = this.scene.activeCamera as ArcRotateCamera;
    const wasAutoRotating = camera.useAutoRotationBehavior;

    if (seamlessLoop && camera) {
      initialAlpha = camera.alpha;
      initialInertia = camera.inertia;
      // Disable auto-rotation so we can drive it manually
      camera.useAutoRotationBehavior = false;
      // Disable inertia for precise frame stepping
      camera.inertia = 0;
    }
    // ---------------------------

    let frameCount = 0;

    this.gifFrameInterval = setInterval(() => {
      if (!this.gif) return;
      if (frameCount >= totalFrames) {
        clearInterval(this.gifFrameInterval);

        // --- Restore State ---
        if (seamlessLoop && camera) {
          if (wasAutoRotating) camera.useAutoRotationBehavior = true;
          camera.inertia = initialInertia;
        }
        // ---------------------

        this.gif.render();
        return;
      }

      // --- Manual Seamless Rotation ---
      if (seamlessLoop && camera) {
        // Precise rotation: 0 to 360 over the duration
        // We use frameCount / totalFrames. 
        // Note: To be perfectly seamless, frame 0 is 0deg, and the frame AFTER the last one would be 360deg (which is 0deg).
        // So we go from 0 to 2*PI * (totalFrames-1)/totalFrames ? 
        // Or 0 to 2*PI * (frameCount / totalFrames).
        // Ideally, frame 0 = 0deg. Frame [total] = 360deg. We record [0..total-1].
        const angleOffset = (frameCount / totalFrames) * 2 * Math.PI;
        camera.alpha = initialAlpha + angleOffset;
      }
      // --------------------------------


      try {
        if (ctx) {
          // 1. Draw 3D Canvas (Background)
          // Apply global filter to the context
          ctx.filter = globalFilter || 'none';
          ctx.fillStyle = this.scene.clearColor.toHexString();
          ctx.fillRect(0, 0, width, finalHeight); // Clear just in case

          // Draw the main Babylon.js canvas content
          // drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
          // Note: Canvas must have preserveDrawingBuffer: true or be called immediately after render
          ctx.drawImage(this.canvas, sx, sy, sourceWidth, sourceHeight, 0, 0, width, finalHeight);

          // 2. Draw Overlays
          // Overlays will also be affected by the global filter, which is usually desired.
          const time = frameCount * (intervalMs / 1000); // Time in seconds

          overlays.forEach(layer => {
            if (!layer.visible) return;

            ctx.save(); // Save context state before applying layer-specific transformations

            // Calculate scale factor relative to a nominal 500px preview width
            const scaleFactor = width / 500;

            // Apply Shadows (Scaled)
            if (layer.shadowBlur || layer.shadowOffsetX || layer.shadowOffsetY) {
              ctx.shadowBlur = (layer.shadowBlur || 0) * scaleFactor;
              ctx.shadowColor = layer.shadowColor || 'black';
              ctx.shadowOffsetX = (layer.shadowOffsetX || 0) * scaleFactor;
              ctx.shadowOffsetY = (layer.shadowOffsetY || 0) * scaleFactor;
            }

            // Position
            const lx = layer.x * width;
            const ly = layer.y * finalHeight;

            ctx.translate(lx, ly);

            // --- ANIMATIONS ---
            // 1. SPIN (Rotation)
            let rotation = (layer.rotation || 0) * (Math.PI / 180);
            if (layer.animSpin) {
              rotation += time * layer.animSpin * 2; // Speed factor
            }
            ctx.rotate(rotation);

            // 2. PULSE (Scale)
            if (layer.animPulse) {
              const scale = 1 + Math.sin(time * layer.animPulse * 5) * 0.1;
              ctx.scale(scale, scale);
            }

            // 3. FLASH (Opacity) - Note: GlobalAlpha affects shadow too
            if (layer.animFlash) {
              const opacity = 0.5 + 0.5 * Math.sin(time * layer.animFlash * 10);
              ctx.globalAlpha = opacity;
            }

            // 4. RAINBOW (Hue Rotate)
            if (layer.animRainbow) {
              const hue = (time * layer.animRainbow * 100) % 360;
              ctx.filter = `hue-rotate(${hue}deg)`;
            }
            // ------------------

            if (layer.type === 'text' && layer.text) {
              const fontSize = (layer.width || 0.1) * finalHeight; // Width acts as font scale
              ctx.font = `bold ${fontSize}px ${layer.fontFamily || 'Arial'}`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';

              const lines = layer.text.split('\n');
              const lineHeight = fontSize * 1.2;
              const totalTextHeight = lines.length * lineHeight;
              const startY = -(totalTextHeight / 2) + (lineHeight / 2);

              ctx.fillStyle = layer.color || 'white';
              if (layer.strokeWidth) {
                ctx.lineWidth = layer.strokeWidth * scaleFactor;
                ctx.strokeStyle = layer.strokeColor || 'black';
              }

              lines.forEach((line, index) => {
                const y = startY + (index * lineHeight);

                if (layer.strokeWidth) {
                  ctx.strokeText(line, 0, y);
                }
                ctx.fillText(line, 0, y);
              });

            } else if ((layer.type === 'image' || layer.type === 'frame' || layer.type === 'custom-svg') && layer.imageElement && layer.imageElement.complete) {
              // Draw Image
              // Width is relative to canvas width
              const imgW = (layer.width || 0.2) * width;
              // Maintain aspect ratio of image
              const ratio = layer.imageElement.width / layer.imageElement.height;
              const imgH = imgW / ratio;

              // Draw centered around the translated point
              ctx.drawImage(layer.imageElement, -imgW / 2, -imgH / 2, imgW, imgH);
            } else if (layer.type === 'rect') {
              const w = (layer.width || 0.1) * width;
              const h = (layer.height || layer.width || 0.1) * finalHeight; // fallback to square if height not specified
              ctx.fillStyle = layer.color || 'white';
              ctx.fillRect(-w / 2, -h / 2, w, h);

              if (layer.strokeWidth) {
                ctx.lineWidth = layer.strokeWidth * scaleFactor;
                ctx.strokeStyle = layer.strokeColor || 'black';
                ctx.strokeRect(-w / 2, -h / 2, w, h);
              }
            } else if (layer.type === 'circle') {
              const r = ((layer.width || 0.1) * width) / 2; // width defines diameter
              ctx.beginPath();
              ctx.arc(0, 0, r, 0, 2 * Math.PI);
              ctx.fillStyle = layer.color || 'white';
              ctx.fill();

              if (layer.strokeWidth) {
                ctx.lineWidth = layer.strokeWidth * scaleFactor;
                ctx.strokeStyle = layer.strokeColor || 'black';
                ctx.stroke();
              }
            } else if (layer.type === 'triangle') {
              const w = (layer.width || 0.1) * width;
              const h = (layer.height || layer.width || 0.1) * finalHeight;
              ctx.beginPath();
              ctx.moveTo(0, -h / 2);
              ctx.lineTo(w / 2, h / 2);
              ctx.lineTo(-w / 2, h / 2);
              ctx.closePath();
              ctx.fillStyle = layer.color || 'white';
              ctx.fill();
              if (layer.strokeWidth) {
                ctx.lineWidth = layer.strokeWidth * scaleFactor;
                ctx.strokeStyle = layer.strokeColor || 'black';
                ctx.stroke();
              }
            } else if (layer.type === 'star') {
              const outerRadius = ((layer.width || 0.1) * width) / 2;
              const innerRadius = outerRadius / 2;
              const spikes = 5;
              const step = Math.PI / spikes;
              let rot = Math.PI / 2 * 3;
              let x = 0; let y = 0;
              ctx.beginPath();
              ctx.moveTo(0, -outerRadius); // Start at top
              for (let i = 0; i < spikes; i++) {
                x = Math.cos(rot) * outerRadius;
                y = Math.sin(rot) * outerRadius;
                ctx.lineTo(x, y);
                rot += step;

                x = Math.cos(rot) * innerRadius;
                y = Math.sin(rot) * innerRadius;
                ctx.lineTo(x, y);
                rot += step;
              }
              ctx.lineTo(0, -outerRadius);
              ctx.closePath();
              ctx.fillStyle = layer.color || 'white';
              ctx.fill();
              if (layer.strokeWidth) {
                ctx.lineWidth = layer.strokeWidth * scaleFactor;
                ctx.strokeStyle = layer.strokeColor || 'black';
                ctx.stroke();
              }
            }

            ctx.restore(); // Restore context state
          });

          this.gif.addFrame(resizeCanvas, { copy: true, delay: intervalMs });
        }

        frameCount++; // Increment frame
      } catch (e) {
        console.error("Error adding GIF frame:", e);
      }
    }, intervalMs);

    this.gif.on('finished', (blob: Blob) => {
      this._isRecording = false;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      this.gif = null;
      console.log("GIF finished and downloaded.");
    });
  }


  stopRecording(): void {
    if (!this._isRecording) return;

    // Handle WebM
    if (this.recorder) {
      this.recorder.stopRecording();
      // _isRecording false set in promise
    }

    // Handle GIF
    if (this.gif) {
      clearInterval(this.gifFrameInterval);
      this.gifFrameInterval = null;
      console.log("Rendering GIF...");
      this.gif.render();
      // _isRecording stays true until render finished
    } else {
      // Fallback if not gif
      this._isRecording = false;
    }
  }

  /* 3D TEXT SYSTEM */
  private async ensureMeshWriter(): Promise<void> {
    // Polyfill BABYLON global for MeshWriter (Safest bet for older libraries)
    if (!(window as any).BABYLON) {
      (window as any).BABYLON = {};
    }
    const B = (window as any).BABYLON;
    B.Vector2 = B.Vector2 || Vector2;
    B.Vector3 = B.Vector3 || Vector3;
    B.Path2 = B.Path2 || Path2;
    B.Curve3 = B.Curve3 || Curve3;
    B.Color3 = B.Color3 || Color3;
    B.SolidParticleSystem = B.SolidParticleSystem || SolidParticleSystem;
    B.PolygonMeshBuilder = B.PolygonMeshBuilder || PolygonMeshBuilder;
    B.CSG = B.CSG || CSG;
    B.StandardMaterial = B.StandardMaterial || StandardMaterial;
    B.Mesh = B.Mesh || Mesh;

    if ((window as any).MeshWriter) return;

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "assets/meshwriter.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load MeshWriter"));
      document.head.appendChild(script);
    });
  }

  async add3DText(text: string, colorHex: string, size: number = 1.0, depth: number = 0.5): Promise<void> {
    await this.ensureMeshWriter();

    const meshWriterMethods = {
      Vector2, Vector3, Path2, Curve3, Color3,
      SolidParticleSystem, PolygonMeshBuilder, CSG,
      StandardMaterial, Mesh
    };
    console.log("MeshWriter Methods Check:", meshWriterMethods);

    if (!StandardMaterial) {
      console.error("StandardMaterial is missing!");
    }

    const Writer = (window as any).MeshWriter(this.scene, {
      scale: 1.0,
      methods: meshWriterMethods
    });

    // MeshWriter creates a text mesh
    const textMeshWriter = new Writer(text, {
      "font-family": "Arial",
      "letter-height": size * 5,
      "letter-thickness": depth * 2,
      color: colorHex,
      anchor: "center",
      colors: {
        diffuse: colorHex,
        specular: "#111111",
        ambient: "#000000",
        emissive: "#000000"
      },
      position: {
        x: 0,
        y: 1,
        z: 0
      }
    });

    const mesh = textMeshWriter.getMesh();

    // The returned object is a mesh (often a parent/root)
    if (this.gizmoManager && mesh) {
      this.gizmoManager.attachToMesh(mesh);
    }
  }

  getEngine(): Engine {
    return this.engine;
  }
  private async preloadLayerImages(layers: OverlayLayer[]): Promise<void> {
    const promises = layers.map(layer => {
      return new Promise<void>((resolve, reject) => {
        if (layer.type === 'image' || layer.type === 'frame') {
          if (layer.imageElement && layer.imageElement.complete) {
            resolve();
            return;
          }
          const img = new Image();
          img.crossOrigin = "Anonymous";
          img.src = layer.src || '';
          img.onload = () => { layer.imageElement = img; resolve(); };
          img.onerror = () => { console.error('Failed to load image', layer); resolve(); };
        } else if (layer.type === 'custom-svg' && layer.svgContent) {
          const svgString = this.createSvgBlob(layer.svgContent, layer);
          const blob = new Blob([svgString], { type: 'image/svg+xml' });
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => { layer.imageElement = img; resolve(); };
          img.onerror = () => { console.error('Failed to load SVG blob'); resolve(); };
          img.src = url;
        } else {
          resolve();
        }
      });
    });
    await Promise.all(promises);
  }

  private createSvgBlob(content: string, layer: OverlayLayer): string {
    const style = `
        <style>
          path, circle, rect, polygon, ellipse, line, polyline { 
            fill: ${layer.color || 'black'} !important; 
            stroke: ${layer.strokeColor || 'none'} !important;
            stroke-width: ${layer.strokeWidth || 0}px !important;
            vector-effect: non-scaling-stroke !important;
          }
        </style>
     `;
    if (content.includes('</svg>')) {
      return content.replace('</svg>', style + '</svg>');
    }
    return content + style;
  }
}

const DITHER_SHADER_CODE =
  "#ifdef GL_ES\n" +
  "precision highp float;\n" +
  "#endif\n" +
  "\n" +
  "varying vec2 vUV;\n" +
  "uniform sampler2D textureSampler;\n" +
  "uniform float screenWidth;\n" +
  "uniform float screenHeight;\n" +
  "uniform vec3 uPalette[16];\n" +
  "uniform int uPaletteSize;\n" +
  "uniform float pixelScale;\n" +
  "\n" +
  "void main(void) {\n" +
  "    vec2 uv = vUV;\n" +
  "    if (pixelScale > 1.0) {\n" +
  "        float dx = pixelScale * (1.0 / screenWidth);\n" +
  "        float dy = pixelScale * (1.0 / screenHeight);\n" +
  "        uv = vec2(dx * floor(uv.x / dx), dy * floor(uv.y / dy));\n" +
  "    }\n" +
  "\n" +
  "    vec3 color = texture2D(textureSampler, uv).rgb;\n" +
  "\n" +
  "    int x = int(mod(gl_FragCoord.x, 4.0));\n" +
  "    int y = int(mod(gl_FragCoord.y, 4.0));\n" +
  "\n" +
  "    int dither[16];\n" +
  "    dither[0] = 0; dither[1] = 8; dither[2] = 2; dither[3] = 10;\n" +
  "    dither[4] = 12; dither[5] = 4; dither[6] = 14; dither[7] = 6;\n" +
  "    dither[8] = 3; dither[9] = 11; dither[10] = 1; dither[11] = 9;\n" +
  "    dither[12] = 15; dither[13] = 7; dither[14] = 13; dither[15] = 5;\n" +
  "\n" +
  "    float ditherValue = float(dither[y * 4 + x]) / 16.0;\n" +
  "\n" +
  "    float spread = 0.5;\n" +
  "    vec3 ditheredColor = color + vec3((ditherValue - 0.5) * spread);\n" +
  "\n" +
  "    float minDist = 1000.0;\n" +
  "    vec3 nearestColor = ditheredColor;\n" +
  "\n" +
  "    for (int i = 0; i < 16; i++) {\n" +
  "        if (i >= uPaletteSize) break;\n" +
  "        \n" +
  "        vec3 pColor = uPalette[i];\n" +
  "        float dist = distance(ditheredColor, pColor);\n" +
  "\n" +
  "        if (dist < minDist) {\n" +
  "            minDist = dist;\n" +
  "            nearestColor = pColor;\n" +
  "        }\n" +
  "    }\n" +
  "\n" +
  "    gl_FragColor = vec4(nearestColor, 1.0);\n" +
  "}\n";
