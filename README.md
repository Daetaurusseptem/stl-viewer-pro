# STL Visualizer Studio

A high-performance, browser-based 3D visualization studio built with **Angular** and **Babylon.js**. This application allows users to view, paint, and record 3D models (STL, OBJ, GLB) with studio-quality lighting, background effects, and a seamlessly looping turntable.

## 🌟 Key Features

### 🎨 Paint Mode
- **Texture Painting**: Draw directly on 3D models using a brush tool.
- **Palette Extraction**: Upload a reference image to automatically extract a color palette.
- **Eyedropper**: Pick colors directly from your reference image.
- **Overlays**: Add text, shapes (Rectangle, Circle, Star), and upload custom SVGs as stickers.
- **Overlay Manipulation**: Resize, rotate, and position layers with intuitive handles.

### 🎥 Turntable Studio
- **Auto-Rotation**: Seamless looping 360° rotation for perfect showcase GIFs.
- **Base Options**: Choose from premium bases including **Obsidian**, **Concrete**, **Grid (Neon)**, **Fabric (Velvet)**, and a **High-Fidelity Miniature Terrain** with procedural earth and props.
- **Positioning**: Precisely center your model or adjust X/Y/Z/Height offsets.

### 💡 Lighting Studio
- **3-Point Lighting**: Fully adjustable Key, Fill, and Back lights (Intensity, Color).
- **Global Illumination**: Control ambient light and ground color.
- **Presets**: Quickly switch between Dramatic, Soft, Neon, and Grim lighting setups.

### 🌌 Background Effects
- **Shader Effects**: Choose from dynamic WebGL backgrounds:
  - **Vignette**, **Neon Grid**, **Underwater**, **Theater**, **Paparazzi**, **Sci-Fi Tunnel**, **Jungle**, **Hell**, **Lollipop**.
- **Transparent Mode**: Export with a clean background.

### 📹 Recording & Export
- **GIF Recording**: High-quality client-side GIF generation using `gif.js`.
- **WebM Support**: Native video recording.
- **Seamless Loops**: "Seamless Loop" mode ensures the GIF perfectly matches one full rotation.

## 🚀 Installation

1.  **Clone the repository**:
    ```bash
    git clone <repository-url>
    cd stl-visualizer-studio
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```
    *Note: This project uses Angular 16 and Babylon.js 5.57.1.*

3.  **Run the application**:
    ```bash
    npm start
    ```
    or
    ```bash
    ng serve
    ```

4.  **Open in Browser**:
    Navigate to `http://localhost:4200/`.

## 📖 Usage Guide

### Loading a Model
- Drag and drop an **STL**, **OBJ**, or **GLB** file into the viewport, or use the **"Load Model"** button.
- The model will automatically center on the turntable.

### Painting & Decals
1.  Switch to **Paint Mode** using the toggle at the top left.
2.  **Brush**: Click and drag on the model to paint.
3.  **Decals**: Use the "Text", "Shape", or "SVG" buttons in the sidebar to add layers.
    - Drag the **center** to move.
    - Drag the **corners** to resize.
    - Drag the **top knob** to rotate.

### Creating a Turntable GIF
1.  Open the **Turntable** panel.
2.  Enable **"Turntable Active"**.
3.  Adjust **Speed** (RPM).
4.  Open the **Recording** panel.
5.  Check **"Seamless Loop"** (Recommended).
6.  Click **"Start Recording"**. The app will capture one full rotation and automatically download the GIF.

### Customizing the Scene
- Use the **Lighting** panel to change the mood.
- Use the **Environment** panel to change the background shader.
- Use the **Base Style** dropdown to change the turntable platform (e.g., to "Miniature Base").

## 🛠️ Technology Stack

- **Framework**: [Angular 16](https://angular.io/)
- **3D Engine**: [Babylon.js 5.x](https://www.babylonjs.com/)
- **Media Encoding**: [gif.js](https://github.com/jnordberg/gif.js)
- **Styling**: SCSS / CSS3

## 📝 License
This project is for educational and personal use.
