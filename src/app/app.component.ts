import { Component, ElementRef, ViewChild, AfterViewInit, HostListener } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { VisualizerService, OverlayLayer } from './services/visualizer.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements AfterViewInit {
  @ViewChild('renderCanvas', { static: true }) renderCanvas!: ElementRef<HTMLCanvasElement>;

  constructor(private visualizerService: VisualizerService, private sanitizer: DomSanitizer) {
    this.visualizerService.transformChange$.subscribe(pos => {
      if (pos) {
        this.turntableOffsetX = pos.x;
        this.turntableOffsetY = pos.y;
        this.turntableOffsetZ = pos.z;
      }
    });
  }

  async ngAfterViewInit() {
    if (this.renderCanvas) {
      await this.visualizerService.initialize(this.renderCanvas.nativeElement);
    }
  }

  // UI State
  metallic = 0.5;
  roughness = 0.5;
  materialColor = "#ffffff";

  async onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      await this.visualizerService.loadModel(file);

      // Apply current material settings ONLY if not GLB/GLTF (preserve textures)
      const name = file.name.toLowerCase();
      if (!name.endsWith('.glb') && !name.endsWith('.gltf')) {
        setTimeout(() => this.updateMaterial(), 100);
      }
    }
  }

  onBackgroundChange(event: any) {
    this.visualizerService.setBackgroundColor(event.target.value);
  }

  isAutoRotate = false;
  autoRotateSpeed = 1;
  particlesEnabled = false;
  turntableEnabled = false;
  gizmosEnabled = false;
  showLighting = false; // Toggle state for lighting studio

  // Store state when entering paint mode
  private previousState: any = {};

  onParticlesToggle(event: any) {
    this.particlesEnabled = event.target.checked;
    this.visualizerService.toggleParticles(this.particlesEnabled);
  }

  onParticleModeChange(event: any) {
    this.visualizerService.setParticleMode(event.target.value);
  }

  onParticleDensityChange(event: any) {
    this.visualizerService.updateParticleSettings({ emitRate: parseInt(event.target.value) });
  }

  onParticleSpeedChange(event: any) {
    this.visualizerService.updateParticleSettings({ speed: parseFloat(event.target.value) });
  }

  onParticleSizeChange(event: any) {
    this.visualizerService.updateParticleSettings({ size: parseFloat(event.target.value) });
  }

  onParticleLifeChange(event: any) {
    this.visualizerService.updateParticleSettings({ life: parseFloat(event.target.value) });
  }

  onAutoRotateToggle(event: any) {
    this.isAutoRotate = event.target.checked;
    this.visualizerService.setAutoRotate(this.isAutoRotate, this.autoRotateSpeed);
  }

  onAutoRotateSpeedChange(event: any) {
    this.autoRotateSpeed = parseFloat(event.target.value);
    if (this.isAutoRotate) {
      this.visualizerService.setAutoRotate(true, this.autoRotateSpeed);
    }
  }

  onTurntableToggle(event: any): void {
    const enabled = event.target.checked;
    this.turntableEnabled = enabled; // Update UI state
    this.visualizerService.toggleTurntable(enabled);
  }

  onTurntableHeightChange(event: any): void {
    const val = parseFloat(event.target.value);
    this.visualizerService.setTurntableHeight(val);
  }

  // Turntable Offset State
  turntableOffsetX = 0;
  turntableOffsetY = 0;
  turntableOffsetZ = 0;

  onTurntableOffsetChange(axis: 'x' | 'y' | 'z', event: any): void {
    const val = parseFloat(event.target.value);
    if (axis === 'x') this.turntableOffsetX = val;
    else if (axis === 'y') this.turntableOffsetY = val;
    else this.turntableOffsetZ = val;
    this.visualizerService.setTurntableModelOffset(this.turntableOffsetX, this.turntableOffsetY, this.turntableOffsetZ);
  }

  turntablePaused = false;
  onTurntablePauseToggle(event: any) {
    this.turntablePaused = event.target.checked;
    this.visualizerService.setTurntablePaused(this.turntablePaused);
  }

  onCenterModel(): void {
    this.visualizerService.centerModel();
    // Reset sliders
    this.turntableOffsetX = 0;
    this.turntableOffsetZ = 0;
  }

  onTurntableSpeedChange(event: any) {
    this.visualizerService.setTurntableSpeed(parseFloat(event.target.value));
  }

  // Lighting Studio Methods
  onLightIntensityChange(type: 'key' | 'fill' | 'back' | 'global', event: any) {
    this.visualizerService.setLightIntensity(type, parseFloat(event.target.value));
  }

  onLightColorValChange(type: 'key' | 'fill' | 'back' | 'global', event: any) {
    this.visualizerService.setLightColor(type, event.target.value);
  }

  onTurntableMaterialChange(event: any) {
    this.visualizerService.setTurntableBaseStyle(event.target.value);
  }

  onGizmosToggle(event: any) {
    this.gizmosEnabled = event.target.checked;
    this.visualizerService.enableGizmos(this.gizmosEnabled);
  }

  onResetCamera() {
    this.visualizerService.resetCamera();
  }

  viewMode: 'view' | 'paint' = 'view';

  // Cleaned up properties (some moved to local vars in templates or kept for state)


  enterPaintMode() {
    // Save state
    this.previousState = {
      gizmos: this.gizmosEnabled,
      turntable: this.turntableEnabled,
      particles: this.particlesEnabled,
      autoRotate: this.isAutoRotate,
      showGuide: this.showGuide
    };

    // Disable features for painting
    if (this.gizmosEnabled) this.visualizerService.enableGizmos(false);
    if (this.turntableEnabled) this.visualizerService.toggleTurntable(false);
    if (this.particlesEnabled) this.visualizerService.toggleParticles(false);
    if (this.isAutoRotate) this.visualizerService.setAutoRotate(false);
    this.showGuide = false;

    this.viewMode = 'paint';
    this.visualizerService.enablePaintMode(true);
  }

  exitPaintMode() {
    this.viewMode = 'view';
    this.visualizerService.enablePaintMode(false);

    // Restore state
    if (this.previousState.gizmos) this.visualizerService.enableGizmos(true);
    if (this.previousState.turntable) {
      this.visualizerService.toggleTurntable(true);
      // Ensure checked state is back in UI (it might be bound, but good to be safe if binding is one-way)
    }
    if (this.previousState.particles) this.visualizerService.toggleParticles(true);
    if (this.previousState.autoRotate) this.visualizerService.setAutoRotate(true, this.autoRotateSpeed);
    if (this.previousState.showGuide) this.showGuide = true;
  }

  // ... kept handlers ...

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (this.viewMode !== 'paint') return;
    switch (event.key.toLowerCase()) {
      case 'b': this.onPaintToolChange('brush'); break;
      case 'f': this.onPaintToolChange('bucket'); break;
      case 'm':
      case 'v': this.onPaintToolChange('move'); break;
    }
  }

  paintTool: 'brush' | 'bucket' | 'move' = 'brush';

  onPaintToolChange(tool: any) {
    const val = (tool.target) ? tool.target.value : tool;
    this.paintTool = val;
    this.visualizerService.setPaintTool(val);
  }

  onPaintToleranceChange(event: any) {
    this.visualizerService.setPaintTolerance(parseFloat(event.target.value));
  }

  onFloodModeChange(event: any) {
    this.visualizerService.setFloodMode(event.target.checked ? 'smooth' : 'flat');
  }

  onEffectToggle(effect: 'dither', event: any) {
    if (effect === 'dither') {
      this.ditherEnabled = event.target.checked;
    }
    this.visualizerService.toggleEffect(effect, event.target.checked);
  }

  onDitherPaletteChange(event: any) {
    this.visualizerService.setDitherPalette(event.target.value);
  }

  onDitherPixelChange(event: any) {
    this.visualizerService.setDitherPixelSize(parseFloat(event.target.value));
  }

  get isRecording(): boolean {
    return this.visualizerService.isRecording;
  }

  recordFormat: 'webm' | 'gif' = 'webm';
  gifFps: number = 15;
  gifWidth: number = 500;
  showGuide: boolean = false;
  aspectRatio: '16:9' | '9:16' | '1:1' = '16:9';

  onToggleRecord() {
    if (this.isRecording) {
      this.visualizerService.stopRecording();
    } else {
      if (this.recordFormat === 'gif') {
        let crop = undefined;
        if (this.showGuide) {
          // Calculate relative position of the guide
          const guideEl = document.querySelector('.guide-overlay') as HTMLElement;
          const canvasEl = this.renderCanvas.nativeElement;
          if (guideEl && canvasEl) {
            const guideRect = guideEl.getBoundingClientRect();
            const canvasRect = canvasEl.getBoundingClientRect();

            // Calculate ratios (canvas resolution / styles size)
            // Note: Babylon canvas width/height might match clientWidth/Height or be scaled (DPI)
            // We should use the internal canvas resolution width/height vs client rect
            const scaleX = canvasEl.width / canvasRect.width;
            const scaleY = canvasEl.height / canvasRect.height;

            crop = {
              x: (guideRect.left - canvasRect.left) * scaleX,
              y: (guideRect.top - canvasRect.top) * scaleY,
              w: guideRect.width * scaleX,
              h: guideRect.height * scaleY
            };
          }
        }
        // Arguments: fps, durationSec, width, overlays, filename, globalFilter, crop, seamlessLoop
        let duration = 3;
        let seamless = false;

        if (this.visualizerService.isAutoRotating) {
          // Seamless Loop Calculation: Duration = 2 * PI / Speed (radians/sec)
          const speed = this.visualizerService.getAutoRotationSpeed();
          if (speed > 0) {
            duration = (2 * Math.PI) / speed;
            seamless = true;
            console.log(`Auto-Rotation active. Speed: ${speed}, Calculated Seamless Duration: ${duration}s, Seamless Mode: ON`);
          }
        }
        this.visualizerService.startGifRecording(this.gifFps, duration, this.gifWidth, this.activeOverlays, "stl_animation.gif", this.camFilter, crop, seamless);
      } else {
        this.visualizerService.startRecording("stl_animation.webm");
      }
    }
  }

  get guideStyle() {
    // Calculate aspect ratio
    const arMap: { [key: string]: number } = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1 };
    const ar = arMap[this.aspectRatio];

    // We want the guide to be as big as possible within the viewport but with some margin
    // This is just a visual helper. 
    // A simple approach is to set a fixed height or width percentage and derive the other.
    // But we need it centered. The simple CSS centering does the job.
    // We just need to define width/height based on AR.

    // Let's assume a base size calculation:
    // If AR > 1 (Landscape), max width is limit.
    // If AR < 1 (Portrait), max height is limit.

    const maxHeight = window.innerHeight * 0.7;
    const maxWidth = window.innerWidth * 0.7;

    let w, h;

    if (ar >= 1) { // Landscape or Square
      w = maxWidth;
      h = w / ar;
      if (h > maxHeight) { // Adjust if too tall
        h = maxHeight;
        w = h * ar;
      }
    } else { // Portrait
      h = maxHeight;
      w = h * ar;
    }

    return {
      width: `${w}px`,
      height: `${h}px`
    };
  }

  get guideDimensions() {
    const s = this.guideStyle;
    return {
      w: parseFloat(s.width),
      h: parseFloat(s.height)
    };
  }

  // STUDIOS & OVERLAYS
  activeOverlays: OverlayLayer[] = [];
  selectedLayerId: string | null = null;
  camFilter: string = ''; // CSS Filter string e.g. 'sepia(0.5)'

  // FX STUDIO
  // FX STUDIO
  // showFxModal/fxTab removed for compact UI

  presets: { name: string, style: Partial<OverlayLayer> }[] = [
    {
      name: 'Neon',
      style: {
        color: '#000000', // Fill black? Or transparent? Neon usually outlines.
        strokeColor: '#00ffcc',
        strokeWidth: 2,
        shadowBlur: 10,
        shadowColor: '#00ffcc',
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        fontFamily: 'Courier New'
      }
    },
    {
      name: 'Vintage',
      style: {
        color: '#ffccaa',
        strokeColor: '#5c3a21',
        strokeWidth: 1,
        shadowBlur: 0,
        shadowOffsetX: 2,
        shadowOffsetY: 2,
        shadowColor: '#332211',
        fontFamily: 'serif'
      }
    },
    {
      name: 'Retro 80s',
      style: {
        color: '#ff00ff',
        strokeColor: '#ffff00',
        strokeWidth: 2,
        shadowBlur: 0,
        shadowOffsetX: 4,
        shadowOffsetY: 4,
        shadowColor: '#00ffff',
        fontFamily: 'Impact'
      }
    },
    {
      name: 'Clean',
      style: {
        color: '#ffffff',
        strokeWidth: 0,
        shadowBlur: 5,
        shadowColor: 'rgba(0,0,0,0.5)',
        shadowOffsetX: 1,
        shadowOffsetY: 1,
        fontFamily: 'Arial'
      }
    }
  ];
  customPresets: { name: string, style: Partial<OverlayLayer> }[] = [];


  addShapeLayer(type: 'rect' | 'circle' | 'triangle' | 'star') {
    const id = Date.now().toString();
    this.activeOverlays.push({
      id, type, visible: true,
      x: 0.5, y: 0.5,
      width: 0.2, height: 0.2, // Default size
      color: '#ffffff',
      strokeWidth: 1, strokeColor: '#000000'
    });
    this.selectedLayerId = id;
    // this.showFxModal = true; // Removed
  }
  onBackgroundEffectChange(event: any) {
    const mode = event.target.value;
    this.visualizerService.setBackgroundEffect(mode);
  }

  // --- PAINT MODE ---
  showShapeMenu = false;
  toggleShapeMenu() { this.showShapeMenu = !this.showShapeMenu; }

  saveCurrentAsPreset(name: string) {
    if (!this.selectedLayer) return;
    const style: Partial<OverlayLayer> = {
      color: this.selectedLayer.color,
      strokeColor: this.selectedLayer.strokeColor,
      strokeWidth: this.selectedLayer.strokeWidth,
      shadowBlur: this.selectedLayer.shadowBlur,
      shadowColor: this.selectedLayer.shadowColor,
      shadowOffsetX: this.selectedLayer.shadowOffsetX,
      shadowOffsetY: this.selectedLayer.shadowOffsetY,
      fontFamily: this.selectedLayer.fontFamily
    };
    this.customPresets.push({ name, style });
  }

  applyStyle(style: Partial<OverlayLayer>) {
    if (!this.selectedLayer) return;
    Object.assign(this.selectedLayer, style);
  }

  // DRAG LOGIC
  isDragging = false;
  dragLayerId: string | null = null;
  dragStartX = 0;
  dragStartY = 0;
  initialLayerX = 0;
  initialLayerY = 0;

  startDrag(layerId: string, event: MouseEvent) {
    // Prevent default to avoid selection/simultaneous clicks
    event.preventDefault();
    event.stopPropagation();

    this.isDragging = true;
    this.dragLayerId = layerId;
    this.selectedLayerId = layerId; // Auto select on drag start

    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;

    const layer = this.activeOverlays.find(l => l.id === layerId);
    if (layer) {
      this.initialLayerX = layer.x;
      this.initialLayerY = layer.y;
    }
  }

  @HostListener('window:mousemove', ['$event'])
  onDragMove(event: MouseEvent) {
    // ROTATION
    if (this.isRotating && this.dragLayerId) {
      const layer = this.activeOverlays.find(l => l.id === this.dragLayerId);
      if (!layer) return;

      const theta = Math.atan2(event.clientY - this.layerCenterScreenY, event.clientX - this.layerCenterScreenX);
      const delta = theta - this.initialRotationAngle;

      // Convert to degrees
      layer.rotation = this.initialLayerRotation + delta * (180 / Math.PI);
      return;
    }

    // RESIZING
    if (this.isResizing && this.dragLayerId) {
      const layer = this.activeOverlays.find(l => l.id === this.dragLayerId);
      if (!layer) return;

      const curDist = Math.hypot(event.clientX - this.layerCenterScreenX, event.clientY - this.layerCenterScreenY);

      // Protect against Zero division or super small
      if (this.initialResizeDist < 1) return;

      const scale = curDist / this.initialResizeDist;

      // Apply scale
      let newW = this.initialLayerW * scale;
      let newH = this.initialLayerH * scale;

      // Min Size Restriction
      if (newW < 0.02) newW = 0.02;
      if (newH < 0.02) newH = 0.02;

      layer.width = newW;
      // For shapes that use height explicitly (rect/triangle), scale that too
      if (layer.type === 'rect' || layer.type === 'triangle') {
        layer.height = newH;
      }
      return;
    }

    // DRAGGING
    if (!this.isDragging || !this.dragLayerId) return;

    const layer = this.activeOverlays.find(l => l.id === this.dragLayerId);
    if (!layer) return;

    const guideDims = this.guideDimensions;
    if (guideDims.w === 0 || guideDims.h === 0) return;

    const deltaX = event.clientX - this.dragStartX;
    const deltaY = event.clientY - this.dragStartY;

    // Convert pixels to relative units (0-1)
    const relDeltaX = deltaX / guideDims.w; // guideDims matches dimensions?
    // Actually guideDims is calculated from CSS? 
    // Wait, in startDrag I used `guideDims`.
    // Let's verify guideDims usage.

    // Assume guideDims.w IS the canvas width roughly.
    const relDeltaY = deltaY / guideDims.h;

    layer.x = this.initialLayerX + relDeltaX;
    layer.y = this.initialLayerY + relDeltaY;
  }

  @HostListener('window:mouseup')
  onDragEnd() {
    this.isDragging = false;
    this.isResizing = false;
    this.isRotating = false;
    this.dragLayerId = null;
  }

  // RESIZE LOGIC
  isResizing = false;
  resizeHandle = '';
  initialResizeDist = 0;
  initialLayerW = 0;
  initialLayerH = 0;
  layerCenterScreenX = 0;
  layerCenterScreenY = 0;


  startResize(layerId: string, handle: string, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    // Check if dragging, if so stop it?
    this.isDragging = false;

    this.isResizing = true;
    this.dragLayerId = layerId;
    this.selectedLayerId = layerId;
    this.resizeHandle = handle;

    const layer = this.selectedLayer;
    if (!layer || !this.renderCanvas) return;

    const canvasRect = this.renderCanvas.nativeElement.getBoundingClientRect();
    this.layerCenterScreenX = canvasRect.left + layer.x * canvasRect.width;
    this.layerCenterScreenY = canvasRect.top + layer.y * canvasRect.height;

    this.initialResizeDist = Math.hypot(event.clientX - this.layerCenterScreenX, event.clientY - this.layerCenterScreenY);
    this.initialLayerW = layer.width || 0.1;
    this.initialLayerH = layer.height || layer.width || 0.1;
  }


  addTextLayer() {
    const id = Date.now().toString();
    this.activeOverlays.push({
      id,
      type: 'text',
      visible: true,
      x: 0.5, y: 0.5,
      text: 'New Text',
      fontFamily: 'Arial',
      fontSize: 0.1, // Used for scaling logic in renderer but here we might want simpler
      width: 0.1, // Scale factor
      color: '#ffffff',
      strokeWidth: 2,
      strokeColor: '#000000',
      shadowBlur: 0
    });
    this.selectedLayerId = id;
  }

  addImageLayer(event: any) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        const id = Date.now().toString();
        this.activeOverlays.push({
          id,
          type: 'image',
          visible: true,
          x: 0.5, y: 0.5,
          width: 0.3,
          src: e.target.result
        });
        this.selectedLayerId = id;
      };
      reader.readAsDataURL(file);
    }
  }

  selectLayer(id: string) {
    this.selectedLayerId = id;
  }

  deleteLayer(id: string) {
    this.activeOverlays = this.activeOverlays.filter(l => l.id !== id);
    if (this.selectedLayerId === id) this.selectedLayerId = null;
  }

  getLayerAnimation(layer: OverlayLayer): string {
    const anims: string[] = [];
    if (layer.animSpin) anims.push(`spin ${1 / layer.animSpin}s linear infinite`);
    if (layer.animPulse) anims.push(`pulse ${1 / layer.animPulse}s ease-in-out infinite`);
    if (layer.animFlash) anims.push(`flash ${1 / layer.animFlash}s steps(2, start) infinite`);
    if (layer.animRainbow) anims.push(`rainbow ${1 / layer.animRainbow}s linear infinite`);
    return anims.join(', ');
  }

  get selectedLayer(): OverlayLayer | undefined {
    return this.activeOverlays.find(l => l.id === this.selectedLayerId);
  }

  // Presets
  applyPreset(name: string) {
    this.activeOverlays = []; // Clear current
    this.camFilter = '';

    if (name === 'neon') {
      this.camFilter = 'hue-rotate(320deg) contrast(1.2)';
      // Add a frame logic if we had frame assets
      this.activeOverlays.push({
        id: 'text1', type: 'text', visible: true, x: 0.5, y: 0.9, width: 0.08,
        text: 'CYBERPUNK', fontFamily: 'Courier New', color: '#00ffcc',
        shadowBlur: 10, shadowColor: '#00ffcc'
      });
    } else if (name === 'vintage') {
      this.camFilter = 'sepia(0.6) contrast(0.9)';
      this.activeOverlays.push({
        id: 'text1', type: 'text', visible: true, x: 0.8, y: 0.9, width: 0.05,
        text: '1985', fontFamily: 'Times New Roman', color: '#ffccaa'
      });
    }
  }

  ditherEnabled = false;

  // 3D Text
  newText: string = "Hello World";
  newTextColor: string = "#ffffff";
  newTextDepth: number = 0.5;

  addText() {
    this.visualizerService.add3DText(this.newText, this.newTextColor, 1.0, this.newTextDepth);
  }

  recentColors: string[] = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ffffff', '#000000'];

  addToPalette(event: any) {
    const color = event.target.value;
    if (!this.recentColors.includes(color)) {
      this.recentColors.unshift(color);
      if (this.recentColors.length > 12) {
        this.recentColors.pop();
      }
    }
  }

  selectColor(color: string) {
    // Create a fake event or just call service
    this.visualizerService.setPaintColor(color);
    // We also need to update the input value manually?
    // In Angular, we'd use [(ngModel)] but here we might need to query the input or just rely on 
    // one-way binding if we had it. Since we use `value = "#ff0000"`, we need a property.
    this.currentPaintColor = color;
  }

  currentPaintColor = "#ff0000";

  onPaintColorChange(event: any) {
    this.currentPaintColor = event.target.value;
    this.visualizerService.setPaintColor(this.currentPaintColor);
  }

  onPaintRadiusChange(event: any) {
    this.visualizerService.setPaintRadius(parseFloat(event.target.value));
  }

  // Legacy toggle (can remove or keep for backward compat/testing)
  onPaintModeToggle(event: any) {
    if (event.target.checked) this.enterPaintMode();
    else this.exitPaintMode();
  }

  onMaterialColorChange(event: any) {
    this.materialColor = event.target.value;
    this.updateMaterial();
  }

  onMetallicChange(event: any) {
    this.metallic = parseFloat(event.target.value);
    this.updateMaterial();
  }

  onRoughnessChange(event: any) {
    this.roughness = parseFloat(event.target.value);
    this.updateMaterial();
  }

  onLightColorChange(event: any) {
    // Legacy support or global fallback
    this.visualizerService.setLightColor('global', event.target.value);
  }

  updateMaterial() {
    this.visualizerService.setMaterialProperties(this.materialColor, this.metallic, this.roughness);
  }

  onQualityChange(event: any) {
    this.visualizerService.setQuality(event.target.value);
  }

  // ROTATION & SVG LOGIC
  isRotating = false;
  initialRotationAngle = 0;
  initialLayerRotation = 0;

  startRotate(layerId: string, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isRotating = true;
    this.isDragging = false;
    this.isResizing = false;
    this.dragLayerId = layerId;
    this.selectedLayerId = layerId;

    const layer = this.selectedLayer;
    if (!layer || !this.renderCanvas) return;

    const rect = this.renderCanvas.nativeElement.getBoundingClientRect();
    this.layerCenterScreenX = rect.left + layer.x * rect.width;
    this.layerCenterScreenY = rect.top + layer.y * rect.height;

    this.initialRotationAngle = Math.atan2(event.clientY - this.layerCenterScreenY, event.clientX - this.layerCenterScreenX);
    this.initialLayerRotation = layer.rotation || 0;
  }

  getTrustedSvg(layer: OverlayLayer): SafeHtml {
    if (!layer.svgContent) return '';
    return this.sanitizer.bypassSecurityTrustHtml(layer.svgContent);
  }

  onSvgUpload(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: any) => {
      const content = e.target.result as string;
      // Basic validation
      if (content.includes('<svg')) {
        const id = Date.now().toString();
        this.activeOverlays.push({
          id, type: 'custom-svg', visible: true,
          x: 0.5, y: 0.5, width: 0.2,
          rotation: 0,
          color: '#3498db', strokeColor: 'black', strokeWidth: 0,
          svgContent: content
        });
        this.selectedLayerId = id;
      }
    };
    reader.readAsText(file);
    // Reset input
    event.target.value = '';
  }

  // PALETTE EXTRACTION LOGIC
  paletteImage: string | null = null;
  extractedColors: string[] = [];
  hoverColor: string | null = null;
  isPickingColor = false;

  @ViewChild('paletteCanvas', { static: false }) paletteCanvas!: ElementRef<HTMLCanvasElement>;

  onPaletteImageUpload(event: any) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.paletteImage = e.target.result;
        this.extractPalette(this.paletteImage as string);
      };
      reader.readAsDataURL(file);
    }
  }

  extractPalette(imageSrc: string) {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Downscale for performance and noise reduction
      const w = 64;
      const h = 64;
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);

      const imageData = ctx.getImageData(0, 0, w, h).data;
      const colorCounts: { [key: string]: number } = {};

      for (let i = 0; i < imageData.length; i += 4) {
        // Simple quantization: round to nearest 32 to group similar colors
        const r = Math.round(imageData[i] / 32) * 32;
        const g = Math.round(imageData[i + 1] / 32) * 32;
        const b = Math.round(imageData[i + 2] / 32) * 32;
        const alpha = imageData[i + 3];

        if (alpha < 128) continue; // Ignore transparent

        const hex = this.rgbToHex(r, g, b);
        colorCounts[hex] = (colorCounts[hex] || 0) + 1;
      }

      // Sort by frequency
      const sortedColors = Object.keys(colorCounts).sort((a, b) => colorCounts[b] - colorCounts[a]);

      // Take top 20 distinct
      this.extractedColors = sortedColors.slice(0, 20);

      // Also add to recent colors if not present
      // this.recentColors = [...new Set([...this.extractedColors, ...this.recentColors])].slice(0, 20);
    };
    img.src = imageSrc;
  }

  onPaletteImageHover(event: MouseEvent) {
    if (!this.paletteImage) return;
    const imgEl = event.target as HTMLImageElement;
    if (!imgEl) return;

    // Map mouse position to image natural coordinates
    const rect = imgEl.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const scaleX = imgEl.naturalWidth / rect.width;
    const scaleY = imgEl.naturalHeight / rect.height;

    const px = Math.floor(x * scaleX);
    const py = Math.floor(y * scaleY);

    // Create offscreen canvas to sample pixel
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw just that distinct pixel
    // Note: To be efficient, we might want to keep a canvas copy of the image, 
    // but for hover events 1x1 draw is usually fast enough on modern browsers.
    ctx.drawImage(imgEl, px, py, 1, 1, 0, 0, 1, 1);
    const p = ctx.getImageData(0, 0, 1, 1).data;

    this.hoverColor = this.rgbToHex(p[0], p[1], p[2]);
    this.isPickingColor = true;
  }

  onPaletteImageLeave() {
    this.isPickingColor = false;
    this.hoverColor = null;
  }

  onPaletteImageClick(event: MouseEvent) {
    if (this.hoverColor) {
      this.selectColor(this.hoverColor);
      // Flash or visual feedback?
    }
  }

  rgbToHex(r: number, g: number, b: number) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
}
