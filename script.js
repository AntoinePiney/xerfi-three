// Imports ES6
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RectAreaLightHelper } from 'three/addons/helpers/RectAreaLightHelper.js';
import Stats from 'three/addons/libs/stats.module.js';
import { GUI } from 'dat.gui';

// Variables globales
let scene, camera, renderer, cubeGroup, controls, stats;
let cubes = [];
let animationId;
let animationStartTime;
let animationPhase = 0; // 0: initial, 1: premier cube, 2: deuxième au-dessus, 3: 2 cubes côté, 4: 4 cubes d'une face, 5: 2 parallélépipèdes, 6: rotation étage haut, 7: rotation étage bas
let glassShaderMaterial;
let backgroundRenderTarget;
let envMapCube;
let topStageGroup, bottomStageGroup; // Groupes pour les étages
let stageRotationStartTime;
let gui, shaderParams;


// Variables pour le système de hover
let raycaster, mouseVector;
let hoveredCube = null;
let hoverStartTime = 0;
const HOVER_ANIMATION_DURATION = 200; // milliseconds
const HOVER_SCALE_FACTOR = 0.85; // scale down to 85%

// Variables pour le système de caméra fluide
let mouse = { x: 0, y: 0 };
let targetCameraPosition = { x: 0, y: 0, z: 12 }; // Sera initialisé avec CONFIG.cameraDistance
let currentCameraPosition = { x: 0, y: 0, z: 12 }; // Sera initialisé avec CONFIG.cameraDistance

// Configuration
const CONFIG = {
  cubeSize: 2.5,
  transparency: 1,
  rotationSpeed: 0.007,
  cameraDistance: 12,
  animationDuration: 1000,
  stageRotationDuration: 2000, // Durée de rotation d'un étage
  stageRotationAngle: Math.PI / 2, // 90 degrés de rotation
  enableShadows: false,
  pixelRatio: Math.min(window.devicePixelRatio, 3),
  antialias: true,
  bevelRadius: 0.1,
  bevelSegments: 3,
};

// Paramètres contrôlables par la GUI
shaderParams = {
  // Paramètres de dispersion chromatique
  iorRed: 1.48,
  iorGreen: 1.50,
  iorBlue: 1.56,
  transmission: 0.75,
  
  // Paramètres de réfraction avancés
  refractionStrength: 0.15,
  chromaticMultiplierRed: 1.3,
  chromaticMultiplierBlue: 1.4,
  
  // Paramètres d'iridescence
  verticalVariationFreq: 1.5,
  horizontalVariationFreq: 0.8,
  timeSpeed: 0.1,
  fresnelPower: 2.0,
  edgeFresnelPower: 3.0,
  
  // Couleurs iridescentes
  blueBaseR: 0.2, blueBaseG: 0.6, blueBaseB: 1.0,
  blueLighterR: 0.4, blueLighterG: 0.75, blueLighterB: 0.95,
  violetSubtleR: 0.4, violetSubtleG: 0.55, violetSubtleB: 0.85,
  
  // Intensités des couches
  baseColorIntensity: 0.4,
  iridescentIntensity: 0.8,
  reflectionIntensity: 0.25,
  edgeIntensity: 0.8,
  glassBodyIntensity: 0.3,
  
  // Couleurs spectrales
  spectralRedMult: 0.1,
  spectralGreenMult: 1.2,
  spectralBlueMult: 1.1,
  
  // Gamma et correction
  gammaCorrection: 1.1,
  finalOpacityMult: 1.1,
  
  // Paramètres d'animation et rendu
  rotationSpeed: 0.007,
  enableRotation: true,
  
  // Paramètres de géométrie
  cubeSize: 2.5,
  transparency: 1.0,
  
  // Paramètres d'éclairage et caméra
  cameraDistance: 12,
  toneMappingExposure: 1.5,
  
  // Paramètres de caméra fluide
  cameraMouseSensitivity: 3.0,
  cameraLerpSpeed: 0.05,
  cameraMaxOffset: 2.0,

  // Contrôles d'animation
  pauseAnimation: false,
  resetAnimation: function() {
    animationPhase = 1;
    animationStartTime = Date.now();
    cubes.forEach((cube, index) => {
      cube.scale.setScalar(0);
      cube.material.opacity = 0;
    });
  }
};

// Charger les shaders de manière asynchrone
async function loadShaders() {
  try {
    const [vertexResponse, fragmentResponse] = await Promise.all([
      fetch('./shaders/glassVertex.glsl'),
      fetch('./shaders/glassFragment.glsl')
    ]);
    
    const vertexShader = await vertexResponse.text();
    const fragmentShader = await fragmentResponse.text();
    
    return { vertexShader, fragmentShader };
  } catch (error) {
    console.error('Erreur lors du chargement des shaders:', error);
    return null;
  }
}

// Initialisation
async function init() {
  // Créer la scène
  scene = new THREE.Scene();

  // Créer la caméra
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = CONFIG.cameraDistance;

  // Créer le renderer avec optimisations
  renderer = new THREE.WebGLRenderer({ 
    antialias: CONFIG.antialias, 
    alpha: true,
    powerPreference: "high-performance", // Prioriser les performances
    stencil: false, // Désactiver stencil buffer
    depth: true,
  });
  
  // Adapter la taille à la fenêtre
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(CONFIG.pixelRatio); // Limiter pixel ratio
  renderer.setClearColor(0x000000, 0); // Fond transparent - pas de background color
  
  // Optimisations ombres conditionnelles
  if (CONFIG.enableShadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap; // PCF plus rapide que PCFSoft
  } else {
    renderer.shadowMap.enabled = false;
  }

  // Ajouter le canvas au conteneur approprié
  const container = document.getElementById('container') || document.getElementById('threejs-canvas');
  if (container) {
    container.appendChild(renderer.domElement);
  } else {
    document.body.appendChild(renderer.domElement);
  }
  
  // Appliquer un filtre de couleur bichromatique ultra-clair (éclairci)
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5; // Exposition modérée pour un rendu équilibré

  // Charger les shaders
  const shaders = await loadShaders();
  
  // Créer la texture d'arrière-plan pour les refractions
  setupBackgroundTexture();
  
  // Créer l'environment map
  createEnvironmentMap();

  // Créer le matériau shader de verre
  if (shaders) {
    createGlassShaderMaterial(shaders.vertexShader, shaders.fragmentShader);
  }

  // Créer le groupe de cubes
  createCubeGroup();

  // Créer le plan arrière avec vidéo
  createVideoBackground();

  // Ajouter un éclairage émissif doux
  createEmissiveLighting();

  // Initialiser les contrôles OrbitControls
  setupControls();

  // Initialiser l'animation d'apparition
  initAppearanceAnimation();

  // Initialiser Stats.js
  stats = new Stats();
  document.body.appendChild(stats.dom);

  // Initialiser la GUI
  initGUI();

  // Initialiser le système de hover
  initHoverSystem();

  // Démarrer l'animation
  animate();

  // Gérer le redimensionnement
  window.addEventListener('resize', onWindowResize);
  
  // Ajouter le tracking de la souris pour la caméra fluide
  setupMouseTracking();
}


// Configurer la texture d'arrière-plan pour les refractions
function setupBackgroundTexture() {
  // Créer un render target pour capturer l'arrière-plan
  backgroundRenderTarget = new THREE.WebGLRenderTarget(
    window.innerWidth, 
    window.innerHeight,
    {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    }
  );
}

 // Créer l'environment map pour les reflets iridescents
 function createEnvironmentMap() {
   const cubeSize = 512;  // Taille plus grande pour plus de détails
   const canvas = document.createElement('canvas');
   canvas.width = cubeSize;
   canvas.height = cubeSize;
   const context = canvas.getContext('2d');
   
   // Créer un dégradé vertical bleu ciel doux
   const gradient = context.createLinearGradient(0, 0, 0, cubeSize);
   gradient.addColorStop(0, '#60a5fa');    // Bleu ciel en haut
   gradient.addColorStop(0.3, '#93c5fd');  // Bleu très clair
   gradient.addColorStop(0.6, '#bfdbfe');  // Bleu pastel
   gradient.addColorStop(0.8, '#dbeafe');  // Bleu ultra-clair
   gradient.addColorStop(1, '#f0f9ff');    // Presque blanc bleuté en bas
   
   context.fillStyle = gradient;
   context.fillRect(0, 0, cubeSize, cubeSize);
   
   // Ajouter des reflets spectraux bleu ciel
   const colors = ['#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe', '#f0f9ff', '#fafbff'];
   for (let i = 0; i < 30; i++) {
     const x = Math.random() * cubeSize;
     const y = Math.random() * cubeSize;
     const size = Math.random() * 15 + 5;
     const color = colors[Math.floor(Math.random() * colors.length)];
     
     const spotGradient = context.createRadialGradient(x, y, 0, x, y, size);
     spotGradient.addColorStop(0, color + 'AA');  // Semi-transparent
     spotGradient.addColorStop(1, color + '00');  // Transparent
     
     context.fillStyle = spotGradient;
     context.beginPath();
     context.arc(x, y, size, 0, Math.PI * 2);
     context.fill();
   }
   
   // Ajouter des lignes iridescentes pour l'effet prismatique
   context.strokeStyle = 'rgba(255, 255, 255, 0.3)';
   context.lineWidth = 2;
   for (let i = 0; i < 10; i++) {
     context.beginPath();
     context.moveTo(Math.random() * cubeSize, 0);
     context.lineTo(Math.random() * cubeSize, cubeSize);
     context.stroke();
   }
   
   // Créer la texture
   const texture = new THREE.CanvasTexture(canvas);
   
   // Créer le cube map avec des variations pour chaque face
   const cubeTexture = new THREE.CubeTexture([
     texture.image, texture.image, texture.image, 
     texture.image, texture.image, texture.image
   ]);
   cubeTexture.needsUpdate = true;
   
   envMapCube = cubeTexture;
 }

// Créer le matériau shader de verre
function createGlassShaderMaterial(vertexShader, fragmentShader) {
  const uniforms = {
    backgroundTexture: { value: null }, // Sera mis à jour dans la boucle d'animation
    envMap: { value: envMapCube },
    iorRed: { value: shaderParams.iorRed },
    iorGreen: { value: shaderParams.iorGreen },
    iorBlue: { value: shaderParams.iorBlue },
    transmission: { value: shaderParams.transmission },
    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    time: { value: 0.0 },  // Uniform de temps pour animations
    
    // Nouveaux uniforms
    refractionStrength: { value: shaderParams.refractionStrength },
    chromaticMultiplierRed: { value: shaderParams.chromaticMultiplierRed },
    chromaticMultiplierBlue: { value: shaderParams.chromaticMultiplierBlue },
    verticalVariationFreq: { value: shaderParams.verticalVariationFreq },
    horizontalVariationFreq: { value: shaderParams.horizontalVariationFreq },
    timeSpeed: { value: shaderParams.timeSpeed },
    fresnelPower: { value: shaderParams.fresnelPower },
    edgeFresnelPower: { value: shaderParams.edgeFresnelPower },
    blueBase: { value: new THREE.Vector3(shaderParams.blueBaseR, shaderParams.blueBaseG, shaderParams.blueBaseB) },
    blueLighter: { value: new THREE.Vector3(shaderParams.blueLighterR, shaderParams.blueLighterG, shaderParams.blueLighterB) },
    violetSubtle: { value: new THREE.Vector3(shaderParams.violetSubtleR, shaderParams.violetSubtleG, shaderParams.violetSubtleB) },
    baseColorIntensity: { value: shaderParams.baseColorIntensity },
    iridescentIntensity: { value: shaderParams.iridescentIntensity },
    reflectionIntensity: { value: shaderParams.reflectionIntensity },
    edgeIntensity: { value: shaderParams.edgeIntensity },
    glassBodyIntensity: { value: shaderParams.glassBodyIntensity },
    spectralMultipliers: { value: new THREE.Vector3(shaderParams.spectralRedMult, shaderParams.spectralGreenMult, shaderParams.spectralBlueMult) },
    gammaCorrection: { value: shaderParams.gammaCorrection },
    finalOpacityMult: { value: shaderParams.finalOpacityMult }
  };

  glassShaderMaterial = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true,  // Activé pour plus de profondeur
    blending: THREE.NormalBlending,
    alphaTest: 0.1     // Seuil alpha pour meilleure opacité
  });
}


// Créer le groupe de cubes
function createCubeGroup() {
  cubeGroup = new THREE.Group();
  scene.add(cubeGroup);

  // Créer les groupes pour les étages
  topStageGroup = new THREE.Group();
  bottomStageGroup = new THREE.Group();
  cubeGroup.add(topStageGroup);
  cubeGroup.add(bottomStageGroup);

  // Positionner 10 cubes - 8 cubes de base + 2 cubes supplémentaires au premier étage à droite
  const positions = [
    // Niveau du bas (y = -1)
    [-1, -1, -1], [1, -1, -1], [-1, -1, 1], [1, -1, 1],
    // Niveau du haut (y = 1) 
    [-1, 1, -1], [1, 1, -1], [-1, 1, 1], [1, 1, 1],
    // 2 parallélépipèdes supplémentaires à droite du niveau du bas (parfaitement collés)
    [2.5, -1, -1], [2.5, -1, 1]
  ];

  positions.forEach((pos, index) => {
    const cube = createCube(index);

    // Position finale des cubes - espacement ultra-serré avec superposition massive
    const spacing = CONFIG.cubeSize * 0.5; // Ultra-serré : 2.5 × 0.5 = 1.25 - cubes complètement imbriqués
    const finalX = pos[0] * spacing;
    const finalY = pos[1] * spacing;
    const finalZ = pos[2] * spacing;

    // Position finale (les cubes grandissent sur place)
    cube.position.set(finalX, finalY, finalZ);

    // Stocker la position finale pour l'animation
    cube.userData = {
      finalPosition: { x: finalX, y: finalY, z: finalZ },
      initialOpacity: 0,
      finalOpacity: CONFIG.transparency
    };

    // Rendre invisible initialement
    cube.material.opacity = 0;
    cube.scale.setScalar(0); // Commencer avec une taille de 0

    // Ajouter le cube au bon groupe selon son étage
    if (index >= 4 && index <= 7) {
      // Étage du haut (indices 4, 5, 6, 7)
      topStageGroup.add(cube);
    } else {
      // Étage du bas (indices 0, 1, 2, 3, 8, 9)
      bottomStageGroup.add(cube);
    }
    
    cubes.push(cube);
  });
}

// Géométries partagées pour optimisation avec biseautage léger
const sharedGeometry = new RoundedBoxGeometry(
  CONFIG.cubeSize, 
  CONFIG.cubeSize, 
  CONFIG.cubeSize, 
  CONFIG.bevelSegments, 
  CONFIG.bevelRadius
);
const sharedParallelepipedGeometry = new RoundedBoxGeometry(
  CONFIG.cubeSize / 2, 
  CONFIG.cubeSize, 
  CONFIG.cubeSize, 
  CONFIG.bevelSegments, 
  CONFIG.bevelRadius
);

// Créer un cube individuel avec optimisations
function createCube(index) {
  // Utiliser géométries partagées pour économiser mémoire
  const geometry = (index >= 8) ? sharedParallelepipedGeometry : sharedGeometry;

  // Utiliser le matériau shader de verre si disponible, sinon fallback
  let material;
  if (glassShaderMaterial) {
    material = glassShaderMaterial.clone();
   } else {
     // Matériau diamant avec transparence opaque et reflets subtils
     material = new THREE.MeshPhysicalMaterial({
       color: 0xF0F8FF, // Bleu très clair comme un diamant
       metalness: 0.8,  // Pas métallique pour un vrai diamant
       roughness: 0.5, // Légèrement rugueux pour disperser la lumière
       transparent: true,
       opacity: 0.6,    // Opacité visible mais transparente
       transmission: 0.9, // Transmission modérée pour garder de la substance
       thickness: 1.0,   // Épaisseur normale pour l'effet diamant
       ior: 2.4,         // Indice de réfraction du diamant (plus élevé que le verre)
       envMap: envMapCube, // Environment map pour les reflets
       envMapIntensity: 0.5, // Reflets subtils et naturels
       reflectivity: 0.6,    // Réflectivité modérée
       clearcoat: 0.4,       // Couche brillante comme un diamant poli
       clearcoatRoughness: 0.01, // Surface très lisse pour les reflets
       side: THREE.DoubleSide,
     });
   }

  const cube = new THREE.Mesh(geometry, material);
  
  // Ombres conditionnelles
  if (CONFIG.enableShadows) {
    cube.castShadow = true;
    cube.receiveShadow = true;
  }

  return cube;
}

// Créer le plan arrière avec vidéo
function createVideoBackground() {
  // Créer l'élément vidéo HTML
  const video = document.createElement('video');
  video.src = './images/corpo.mp4';
  video.loop = true;
  video.muted = true; // Nécessaire pour autoplay
  video.autoplay = true;
  video.crossOrigin = 'anonymous';
  video.playsInline = true; // Important pour mobile
  
  // Ajouter des gestionnaires d'événements pour debug
  video.addEventListener('loadeddata', () => {
    console.log('Vidéo chargée avec succès');
    console.log('Dimensions:', video.videoWidth, 'x', video.videoHeight);
  });
  
  video.addEventListener('error', (e) => {
    console.error('Erreur chargement vidéo:', e);
    console.error('Code erreur:', video.error ? video.error.code : 'inconnu');
  });
  
  // Charger et jouer la vidéo
  video.load();
  video.play().catch(e => {
    console.error('Erreur lecture vidéo:', e);
    console.log('Tentative de lecture manuelle...');
  });

  // Créer la texture vidéo Three.js avec le bon format
  const videoTexture = new THREE.VideoTexture(video);
  videoTexture.minFilter = THREE.LinearFilter;
  videoTexture.magFilter = THREE.LinearFilter;
  videoTexture.format = THREE.RGBAFormat; // Format correct pour les vidéos
  videoTexture.generateMipmaps = false;

  // Créer le matériau pour le plan vidéo sans teinte - blanc pur pour vidéo claire
  const videoMaterial = new THREE.MeshBasicMaterial({
    map: videoTexture,
    side: THREE.FrontSide,
    color: 0xFFFFFF, // Blanc pur - pas de teinte pour vidéo claire
    visible: false,
    transparent: false,
    opacity: 1.0,
  });

  // Créer le plan arrière
  const planeGeometry = new THREE.PlaneGeometry(32, 18);
  const videoPlane = new THREE.Mesh(planeGeometry, videoMaterial);
  
  // Positionner le plan derrière les cubes
  videoPlane.position.z = -8;
  
  // Stocker la référence pour le rendu de background texture
  window.videoPlane = videoPlane;
  
  scene.add(videoPlane);
  
  console.log('Plan vidéo créé en arrière-plan');
}

 // Créer un éclairage doux et diffus pour verre poli
 function createEmissiveLighting() {
   // Couleurs froides et douces
   const softBlue = 0xE6F3FF;  // Bleu très pâle
   const coolWhite = 0xF0F8FF; // Blanc froid
   
   // Lumière ambiante très douce pour éviter les ombres dures
   const ambientLight = new THREE.AmbientLight(coolWhite, 0.8);
   scene.add(ambientLight);
   
   // Lumières directionnelles douces multiples pour effet diffus
   const topLight = new THREE.DirectionalLight(softBlue, 0.6);
   topLight.position.set(0, 10, 0);
   scene.add(topLight);
   
   // Lumière douce de face
   const frontLight = new THREE.DirectionalLight(coolWhite, 0.4);
   frontLight.position.set(0, 0, 8);
   scene.add(frontLight);
   
   // Lumière douce arrière pour remplissage
   const backLight = new THREE.DirectionalLight(softBlue, 0.3);
   backLight.position.set(0, 0, -8);
   scene.add(backLight);
   
   // Lumières latérales très douces
   const leftLight = new THREE.DirectionalLight(coolWhite, 0.2);
   leftLight.position.set(-8, 0, 0);
   scene.add(leftLight);
   
   const rightLight = new THREE.DirectionalLight(softBlue, 0.2);
   rightLight.position.set(8, 0, 0);
   scene.add(rightLight);
   
   console.log('Éclairage doux et diffus créé');
 }

// Créer des area lights blanches pour éclairer la mesh principale
function createAreaLights() {
  const whiteColor = 0xFFFFFF;
  const lightIntensity = 4.0; // Intensité augmentée pour éclaircir
  const lightWidth = 4; // Surface plus grande
  const lightHeight = 4;
  
  // Area light de face (devant)
  const frontAreaLight = new THREE.RectAreaLight(whiteColor, lightIntensity, lightWidth, lightHeight);
  frontAreaLight.position.set(0, 0, 6);
  frontAreaLight.lookAt(0, 0, 0);
  scene.add(frontAreaLight);
  
  // Area light arrière
  const backAreaLight = new THREE.RectAreaLight(whiteColor, lightIntensity, lightWidth, lightHeight);
  backAreaLight.position.set(0, 0, -6);
  backAreaLight.lookAt(0, 0, 0);
  scene.add(backAreaLight);
  
  // Area light de gauche
  const leftAreaLight = new THREE.RectAreaLight(whiteColor, lightIntensity, lightWidth, lightHeight);
  leftAreaLight.position.set(-6, 0, 0);
  leftAreaLight.lookAt(0, 0, 0);
  scene.add(leftAreaLight);
  
  // Area light de droite
  const rightAreaLight = new THREE.RectAreaLight(whiteColor, lightIntensity, lightWidth, lightHeight);
  rightAreaLight.position.set(6, 0, 0);
  rightAreaLight.lookAt(0, 0, 0);
  scene.add(rightAreaLight);
  
  // Area light du haut
  const topAreaLight = new THREE.RectAreaLight(whiteColor, lightIntensity, lightWidth, lightHeight);
  topAreaLight.position.set(0, 6, 0);
  topAreaLight.lookAt(0, 0, 0);
  scene.add(topAreaLight);
  
  // Area light du bas
  const bottomAreaLight = new THREE.RectAreaLight(whiteColor, lightIntensity, lightWidth, lightHeight);
  bottomAreaLight.position.set(0, -6, 0);
  bottomAreaLight.lookAt(0, 0, 0);
  scene.add(bottomAreaLight);
  
  console.log('Area lights blanches créées pour éclairer la structure principale');
}

// Configurer le système de caméra fluide
function setupControls() {
  // Initialiser la position de la caméra avec les valeurs de CONFIG
  camera.position.set(0, 0, CONFIG.cameraDistance);
  camera.lookAt(0, 0, 0);
  
  // Initialiser les positions de caméra avec les valeurs correctes
  currentCameraPosition.x = 0;
  currentCameraPosition.y = 0;
  currentCameraPosition.z = CONFIG.cameraDistance;
  
  targetCameraPosition.x = 0;
  targetCameraPosition.y = 0;
  targetCameraPosition.z = CONFIG.cameraDistance;
}

// Initialiser le système de hover
function initHoverSystem() {
  raycaster = new THREE.Raycaster();
  mouseVector = new THREE.Vector2();
  
  // Initialiser les propriétés de hover pour chaque cube
  cubes.forEach(cube => {
    cube.userData.originalScale = cube.scale.clone();
    cube.userData.targetScale = cube.scale.clone();
    cube.userData.isHovered = false;
    cube.userData.hoverProgress = 0; // 0 = normal, 1 = fully hovered
  });
}

// Configurer le tracking de la souris pour un mouvement fluide
function setupMouseTracking() {
  // Écouter le mouvement de la souris
  window.addEventListener('mousemove', (event) => {
    // Normaliser les coordonnées de la souris (-1 à 1) pour la caméra
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Mettre à jour les coordonnées pour le raycasting
    mouseVector.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouseVector.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Détecter le hover
    checkHover();
  });
  
  // Réinitialiser la position de la souris au centre quand elle quitte la fenêtre
  window.addEventListener('mouseleave', () => {
    mouse.x = 0;
    mouse.y = 0;
    
    // Réinitialiser le hover
    if (hoveredCube) {
      hoveredCube.userData.isHovered = false;
      hoveredCube = null;
    }
  });
}

// Détecter le hover avec raycasting
function checkHover() {
  if (!raycaster || !mouseVector || !camera) return;
  
  // Configurer le raycaster
  raycaster.setFromCamera(mouseVector, camera);
  
  // Calculer les intersections avec les cubes visibles
  const visibleCubes = cubes.filter(cube => cube.material.opacity > 0 && cube.scale.length() > 0);
  const intersects = raycaster.intersectObjects(visibleCubes);
  
  // Gérer le changement de hover
  const newHoveredCube = intersects.length > 0 ? intersects[0].object : null;
  
  if (newHoveredCube !== hoveredCube) {
    // Désactiver l'ancien cube hover
    if (hoveredCube) {
      hoveredCube.userData.isHovered = false;
    }
    
    // Activer le nouveau cube hover
    hoveredCube = newHoveredCube;
    if (hoveredCube) {
      hoveredCube.userData.isHovered = true;
      hoverStartTime = Date.now();
    }
  }
}

// Mettre à jour les animations de hover
function updateHoverAnimations() {
  cubes.forEach(cube => {
    const userData = cube.userData;
    if (!userData.originalScale) return;
    
    let targetProgress;
    
    if (userData.isHovered) {
      // Cube survolé - animer vers scale down
      const elapsed = Date.now() - hoverStartTime;
      targetProgress = Math.min(elapsed / HOVER_ANIMATION_DURATION, 1);
    } else {
      // Cube non survolé - animer vers scale normal
      targetProgress = 0;
    }
    
    // Interpolation fluide
    const lerpSpeed = 0.15; // Vitesse d'interpolation
    userData.hoverProgress = THREE.MathUtils.lerp(userData.hoverProgress, targetProgress, lerpSpeed);
    
    // Calculer le scale interpolé
    const currentScale = THREE.MathUtils.lerp(1, HOVER_SCALE_FACTOR, userData.hoverProgress);
    
    // Appliquer le scale en gardant les proportions de l'animation
    if (userData.originalScale) {
      cube.scale.x = userData.originalScale.x * currentScale;
      cube.scale.y = userData.originalScale.y * currentScale;
      cube.scale.z = userData.originalScale.z * currentScale;
    }
  });
}

// Mettre à jour la caméra de manière fluide basée sur la position de la souris
function updateSmoothCamera() {
  // Calculer la position cible de la caméra basée sur la souris
  const mouseInfluence = shaderParams.cameraMouseSensitivity;
  const maxOffset = shaderParams.cameraMaxOffset;
  
  // Calculer l'offset de la position basée sur la souris (limité par maxOffset)
  const targetOffsetX = Math.max(-maxOffset, Math.min(maxOffset, mouse.x * mouseInfluence));
  const targetOffsetY = Math.max(-maxOffset, Math.min(maxOffset, mouse.y * mouseInfluence));
  
  // Définir la position cible (position de base + offset de souris)
  targetCameraPosition.x = targetOffsetX;
  targetCameraPosition.y = targetOffsetY;
  targetCameraPosition.z = shaderParams.cameraDistance;
  
  // Interpoler doucement vers la position cible
  const lerpSpeed = shaderParams.cameraLerpSpeed;
  currentCameraPosition.x = THREE.MathUtils.lerp(currentCameraPosition.x, targetCameraPosition.x, lerpSpeed);
  currentCameraPosition.y = THREE.MathUtils.lerp(currentCameraPosition.y, targetCameraPosition.y, lerpSpeed);
  currentCameraPosition.z = THREE.MathUtils.lerp(currentCameraPosition.z, targetCameraPosition.z, lerpSpeed);
  
  // Appliquer la position interpolée à la caméra
  camera.position.set(currentCameraPosition.x, currentCameraPosition.y, currentCameraPosition.z);
  
  // Toujours regarder vers le centre (pour maintenir le focus sur les cubes)
  camera.lookAt(0, 0, 0);
}

// Initialiser l'animation d'apparition
function initAppearanceAnimation() {
  animationStartTime = Date.now();
  animationPhase = 1; // Commencer par la phase 1
}

// Fonctions d'export/import des configurations
function exportGUIConfig() {
  const config = {
    version: "1.0",
    timestamp: new Date().toISOString(),
    shaderParams: { ...shaderParams }
  };
  
  const dataStr = JSON.stringify(config, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  
  // Créer un lien de téléchargement
  const link = document.createElement('a');
  link.href = URL.createObjectURL(dataBlob);
  link.download = `gui-config-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
  
  // Déclencher le téléchargement
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  console.log('Configuration exportée:', config);
}

function showCurrentValues() {
  console.clear();
  console.log('=== VALEURS ACTUELLES DE LA GUI ===\n');
  
  // Créer un tableau formaté avec toutes les valeurs
  const categories = {
    'Dispersion chromatique': [
      'iorRed', 'iorGreen', 'iorBlue', 'transmission', 
      'refractionStrength', 'chromaticMultiplierRed', 'chromaticMultiplierBlue'
    ],
    'Iridescence': [
      'verticalVariationFreq', 'horizontalVariationFreq', 'timeSpeed', 
      'fresnelPower', 'edgeFresnelPower'
    ],
    'Couleurs': [
      'blueBaseR', 'blueBaseG', 'blueBaseB',
      'blueLighterR', 'blueLighterG', 'blueLighterB',
      'violetSubtleR', 'violetSubtleG', 'violetSubtleB'
    ],
    'Intensités': [
      'baseColorIntensity', 'iridescentIntensity', 'reflectionIntensity',
      'edgeIntensity', 'glassBodyIntensity'
    ],
    'Corrections spectrales': [
      'spectralRedMult', 'spectralGreenMult', 'spectralBlueMult',
      'gammaCorrection', 'finalOpacityMult'
    ],
    'Animation & Géométrie': [
      'enableRotation', 'rotationSpeed', 'pauseAnimation',
      'cubeSize', 'transparency'
    ],
    'Rendu': [
      'cameraDistance', 'toneMappingExposure'
    ]
  };
  
  let copyText = '// Configuration GUI - Valeurs actuelles\n';
  copyText += `// Exporté le ${new Date().toLocaleString()}\n\n`;
  
  for (const [category, params] of Object.entries(categories)) {
    console.log(`📁 ${category}:`);
    copyText += `// ${category}\n`;
    
    params.forEach(param => {
      if (param in shaderParams && typeof shaderParams[param] !== 'function') {
        const value = shaderParams[param];
        const displayValue = typeof value === 'number' ? value.toFixed(3) : value;
        console.log(`  ${param}: ${displayValue}`);
        copyText += `${param}: ${displayValue},\n`;
      }
    });
    console.log('');
    copyText += '\n';
  }
  
  // Copier dans le presse-papiers
  navigator.clipboard.writeText(copyText).then(() => {
    console.log('✅ Valeurs copiées dans le presse-papiers !');
    alert('✅ Valeurs copiées dans le presse-papiers !\nCollez-les où vous voulez pour sauvegarder votre configuration.');
  }).catch(err => {
    console.error('Erreur copie presse-papiers:', err);
  });
  
  return copyText;
}

function copyValuesAsJS() {
  // Créer un objet JavaScript prêt à utiliser
  const jsConfig = {};
  
  Object.keys(shaderParams).forEach(key => {
    if (typeof shaderParams[key] !== 'function') {
      jsConfig[key] = shaderParams[key];
    }
  });
  
  const jsString = `// Configuration GUI\nconst config = ${JSON.stringify(jsConfig, null, 2)};`;
  
  navigator.clipboard.writeText(jsString).then(() => {
    console.log('Configuration JS copiée:', jsConfig);
    alert('Configuration JavaScript copiée dans le presse-papiers !');
  }).catch(err => {
    console.error('Erreur copie:', err);
  });
}

function importGUIConfig() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.onchange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const config = JSON.parse(e.target.result);
        
        // Vérifier la structure du fichier
        if (!config.shaderParams) {
          throw new Error('Format de fichier invalide: shaderParams manquant');
        }
        
        // Appliquer les paramètres importés
        Object.keys(config.shaderParams).forEach(key => {
          if (key in shaderParams && typeof config.shaderParams[key] !== 'function') {
            shaderParams[key] = config.shaderParams[key];
          }
        });
        
        // Mettre à jour la GUI
        updateGUIDisplay();
        
        // Mettre à jour les uniforms du shader
        updateShaderUniforms();
        updateMaterialOpacity();
        updateCameraDistance();
        updateToneMapping();
        
        console.log('Configuration importée avec succès:', config);
        alert('Configuration importée avec succès!');
        
      } catch (error) {
        console.error('Erreur lors de l\'import:', error);
        alert('Erreur lors de l\'import: ' + error.message);
      }
    };
    
    reader.readAsText(file);
  };
  
  input.click();
}

function updateGUIDisplay() {
  // Détruire et recréer la GUI pour mettre à jour les valeurs affichées
  if (gui) {
    gui.destroy();
  }
  initGUI();
}

// Initialiser la GUI DAT
function initGUI() {
  gui = new GUI();
  gui.domElement.style.position = 'absolute';
  gui.domElement.style.top = '10px';
  gui.domElement.style.right = '10px';
  gui.domElement.style.zIndex = '1000';

  // Dossier Shader - Dispersion chromatique
  const shaderFolder = gui.addFolder('Shader - Dispersion');
  shaderFolder.add(shaderParams, 'iorRed', 1.0, 2.0, 0.01)
    .name('IOR Rouge')
    .onChange(updateShaderUniforms);
  shaderFolder.add(shaderParams, 'iorGreen', 1.0, 2.0, 0.01)
    .name('IOR Vert')
    .onChange(updateShaderUniforms);
  shaderFolder.add(shaderParams, 'iorBlue', 1.0, 2.0, 0.01)
    .name('IOR Bleu')
    .onChange(updateShaderUniforms);
  shaderFolder.add(shaderParams, 'transmission', 0.0, 1.0, 0.01)
    .name('Transmission')
    .onChange(updateShaderUniforms);
  shaderFolder.add(shaderParams, 'refractionStrength', 0.0, 0.3, 0.01)
    .name('Force réfraction')
    .onChange(updateShaderUniforms);
  shaderFolder.add(shaderParams, 'chromaticMultiplierRed', 0.5, 2.0, 0.01)
    .name('Mult. Chrome Rouge')
    .onChange(updateShaderUniforms);
  shaderFolder.add(shaderParams, 'chromaticMultiplierBlue', 0.5, 2.0, 0.01)
    .name('Mult. Chrome Bleu')
    .onChange(updateShaderUniforms);

  // Dossier Iridescence
  const iridescenceFolder = gui.addFolder('Iridescence');
  iridescenceFolder.add(shaderParams, 'verticalVariationFreq', 0.1, 5.0, 0.1)
    .name('Fréq. verticale')
    .onChange(updateShaderUniforms);
  iridescenceFolder.add(shaderParams, 'horizontalVariationFreq', 0.1, 3.0, 0.1)
    .name('Fréq. horizontale')
    .onChange(updateShaderUniforms);
  iridescenceFolder.add(shaderParams, 'timeSpeed', 0.0, 1.0, 0.01)
    .name('Vitesse temps')
    .onChange(updateShaderUniforms);
  iridescenceFolder.add(shaderParams, 'fresnelPower', 0.5, 5.0, 0.1)
    .name('Puissance Fresnel')
    .onChange(updateShaderUniforms);
  iridescenceFolder.add(shaderParams, 'edgeFresnelPower', 1.0, 10.0, 0.1)
    .name('Fresnel bords')
    .onChange(updateShaderUniforms);

  // Dossier Couleurs
  const colorsFolder = gui.addFolder('Couleurs');
  const blueBaseFolder = colorsFolder.addFolder('Bleu de base');
  blueBaseFolder.add(shaderParams, 'blueBaseR', 0.0, 1.0, 0.01).name('Rouge').onChange(updateShaderUniforms);
  blueBaseFolder.add(shaderParams, 'blueBaseG', 0.0, 1.0, 0.01).name('Vert').onChange(updateShaderUniforms);
  blueBaseFolder.add(shaderParams, 'blueBaseB', 0.0, 1.0, 0.01).name('Bleu').onChange(updateShaderUniforms);
  
  const blueLighterFolder = colorsFolder.addFolder('Bleu clair');
  blueLighterFolder.add(shaderParams, 'blueLighterR', 0.0, 1.0, 0.01).name('Rouge').onChange(updateShaderUniforms);
  blueLighterFolder.add(shaderParams, 'blueLighterG', 0.0, 1.0, 0.01).name('Vert').onChange(updateShaderUniforms);
  blueLighterFolder.add(shaderParams, 'blueLighterB', 0.0, 1.0, 0.01).name('Bleu').onChange(updateShaderUniforms);
  
  const violetFolder = colorsFolder.addFolder('Violet');
  violetFolder.add(shaderParams, 'violetSubtleR', 0.0, 1.0, 0.01).name('Rouge').onChange(updateShaderUniforms);
  violetFolder.add(shaderParams, 'violetSubtleG', 0.0, 1.0, 0.01).name('Vert').onChange(updateShaderUniforms);
  violetFolder.add(shaderParams, 'violetSubtleB', 0.0, 1.0, 0.01).name('Bleu').onChange(updateShaderUniforms);

  // Dossier Intensités
  const intensityFolder = gui.addFolder('Intensités');
  intensityFolder.add(shaderParams, 'baseColorIntensity', 0.0, 2.0, 0.01)
    .name('Couleur de base')
    .onChange(updateShaderUniforms);
  intensityFolder.add(shaderParams, 'iridescentIntensity', 0.0, 2.0, 0.01)
    .name('Iridescence')
    .onChange(updateShaderUniforms);
  intensityFolder.add(shaderParams, 'reflectionIntensity', 0.0, 1.0, 0.01)
    .name('Réflexions')
    .onChange(updateShaderUniforms);
  intensityFolder.add(shaderParams, 'edgeIntensity', 0.0, 2.0, 0.01)
    .name('Bords')
    .onChange(updateShaderUniforms);
  intensityFolder.add(shaderParams, 'glassBodyIntensity', 0.0, 1.0, 0.01)
    .name('Corps du verre')
    .onChange(updateShaderUniforms);

  // Dossier Spectral
  const spectralFolder = gui.addFolder('Corrections spectrales');
  spectralFolder.add(shaderParams, 'spectralRedMult', 0.0, 2.0, 0.01)
    .name('Mult. Rouge')
    .onChange(updateShaderUniforms);
  spectralFolder.add(shaderParams, 'spectralGreenMult', 0.0, 2.0, 0.01)
    .name('Mult. Vert')
    .onChange(updateShaderUniforms);
  spectralFolder.add(shaderParams, 'spectralBlueMult', 0.0, 2.0, 0.01)
    .name('Mult. Bleu')
    .onChange(updateShaderUniforms);
  spectralFolder.add(shaderParams, 'gammaCorrection', 0.5, 3.0, 0.01)
    .name('Gamma')
    .onChange(updateShaderUniforms);
  spectralFolder.add(shaderParams, 'finalOpacityMult', 0.5, 2.0, 0.01)
    .name('Opacité finale')
    .onChange(updateShaderUniforms);

  // Dossier Animation
  const animationFolder = gui.addFolder('Animation');
  animationFolder.add(shaderParams, 'enableRotation')
    .name('Rotation activée');
  animationFolder.add(shaderParams, 'rotationSpeed', -0.05, 0.05, 0.001)
    .name('Vitesse rotation');
  animationFolder.add(shaderParams, 'pauseAnimation')
    .name('Pause animation');
  animationFolder.add(shaderParams, 'resetAnimation')
    .name('Reset animation');
  animationFolder.open();

  // Dossier Configuration
  const configFolder = gui.addFolder('Configuration');
  configFolder.add({ showValues: showCurrentValues }, 'showValues')
    .name('📋 Voir valeurs actuelles');
  configFolder.add({ copyJS: copyValuesAsJS }, 'copyJS')
    .name('📝 Copier comme JS');
  configFolder.add({ exportConfig: exportGUIConfig }, 'exportConfig')
    .name('📄 Exporter fichier JSON');
  configFolder.add({ importConfig: importGUIConfig }, 'importConfig')
    .name('📁 Importer fichier JSON');
  configFolder.open();

  // Dossier Géométrie
  const geometryFolder = gui.addFolder('Géométrie');
  geometryFolder.add(shaderParams, 'transparency', 0.0, 1.0, 0.01)
    .name('Transparence')
    .onChange(updateMaterialOpacity);
  geometryFolder.open();

  // Dossier Caméra
  const cameraFolder = gui.addFolder('Caméra Fluide');
  cameraFolder.add(shaderParams, 'cameraDistance', 5, 30, 0.5)
    .name('Distance caméra')
    .onChange(updateCameraDistance);
  cameraFolder.add(shaderParams, 'cameraMouseSensitivity', 0.1, 10.0, 0.1)
    .name('Sensibilité souris');
  cameraFolder.add(shaderParams, 'cameraLerpSpeed', 0.01, 0.2, 0.005)
    .name('Vitesse interpolation');
  cameraFolder.add(shaderParams, 'cameraMaxOffset', 0.5, 5.0, 0.1)
    .name('Offset maximum');
  cameraFolder.open();

  // Dossier Rendu
  const renderFolder = gui.addFolder('Rendu');
  renderFolder.add(shaderParams, 'toneMappingExposure', 0.5, 10.0, 0.1)
    .name('Exposition')
    .onChange(updateToneMapping);
  renderFolder.open();

  console.log('GUI DAT initialisée avec succès');
}

// Fonction pour mettre à jour les uniforms du shader
function updateShaderUniforms() {
  if (!glassShaderMaterial) return;
  
  const updateMaterial = (material) => {
    if (!material.uniforms) return;
    
    // Uniforms de base
    material.uniforms.iorRed.value = shaderParams.iorRed;
    material.uniforms.iorGreen.value = shaderParams.iorGreen;
    material.uniforms.iorBlue.value = shaderParams.iorBlue;
    material.uniforms.transmission.value = shaderParams.transmission;
    
    // Nouveaux uniforms
    material.uniforms.refractionStrength.value = shaderParams.refractionStrength;
    material.uniforms.chromaticMultiplierRed.value = shaderParams.chromaticMultiplierRed;
    material.uniforms.chromaticMultiplierBlue.value = shaderParams.chromaticMultiplierBlue;
    material.uniforms.verticalVariationFreq.value = shaderParams.verticalVariationFreq;
    material.uniforms.horizontalVariationFreq.value = shaderParams.horizontalVariationFreq;
    material.uniforms.timeSpeed.value = shaderParams.timeSpeed;
    material.uniforms.fresnelPower.value = shaderParams.fresnelPower;
    material.uniforms.edgeFresnelPower.value = shaderParams.edgeFresnelPower;
    material.uniforms.baseColorIntensity.value = shaderParams.baseColorIntensity;
    material.uniforms.iridescentIntensity.value = shaderParams.iridescentIntensity;
    material.uniforms.reflectionIntensity.value = shaderParams.reflectionIntensity;
    material.uniforms.edgeIntensity.value = shaderParams.edgeIntensity;
    material.uniforms.glassBodyIntensity.value = shaderParams.glassBodyIntensity;
    material.uniforms.gammaCorrection.value = shaderParams.gammaCorrection;
    material.uniforms.finalOpacityMult.value = shaderParams.finalOpacityMult;
    
    // Couleurs (Vector3)
    material.uniforms.blueBase.value.set(shaderParams.blueBaseR, shaderParams.blueBaseG, shaderParams.blueBaseB);
    material.uniforms.blueLighter.value.set(shaderParams.blueLighterR, shaderParams.blueLighterG, shaderParams.blueLighterB);
    material.uniforms.violetSubtle.value.set(shaderParams.violetSubtleR, shaderParams.violetSubtleG, shaderParams.violetSubtleB);
    material.uniforms.spectralMultipliers.value.set(shaderParams.spectralRedMult, shaderParams.spectralGreenMult, shaderParams.spectralBlueMult);
  };
  
  // Mettre à jour le matériau principal
  updateMaterial(glassShaderMaterial);

  // Mettre à jour tous les matériaux clonés des cubes
  cubes.forEach(cube => {
    updateMaterial(cube.material);
  });
}

// Fonction pour mettre à jour l'opacité des matériaux
function updateMaterialOpacity() {
  cubes.forEach(cube => {
    cube.material.opacity = shaderParams.transparency;
  });
}

// Fonction pour mettre à jour la distance de la caméra
function updateCameraDistance() {
  // Mettre à jour la position cible Z au lieu de changer directement la position
  targetCameraPosition.z = shaderParams.cameraDistance;
  // Ne pas appliquer directement pour maintenir la fluidité
}

// Fonction pour mettre à jour le tone mapping
function updateToneMapping() {
  renderer.toneMappingExposure = shaderParams.toneMappingExposure;
}

// Animation optimisée avec éclairage dynamique
function animate(currentTime = 0) {
  animationId = requestAnimationFrame(animate);

  // Mettre à jour la caméra fluide basée sur la souris
  updateSmoothCamera();

  // Mettre à jour les animations de hover
  updateHoverAnimations();

  // Gérer l'animation d'apparition des cubes
  if (!shaderParams.pauseAnimation) {
    handleAppearanceAnimation();
  }

  // Rotation optimisée - calculs regroupés
  if (shaderParams.enableRotation) {
    cubeGroup.rotation.y += shaderParams.rotationSpeed;
  }

  // Mettre à jour l'uniform de temps pour les effets iridescents
  if (glassShaderMaterial && glassShaderMaterial.uniforms.time) {
    glassShaderMaterial.uniforms.time.value = currentTime * 0.001; // Convertir en secondes
  }
  
  // Mettre à jour tous les matériaux clonés
  cubes.forEach(cube => {
    if (cube.material.uniforms && cube.material.uniforms.time) {
      cube.material.uniforms.time.value = currentTime * 0.001;
    }
  });

  // Mettre à jour la texture d'arrière-plan pour les shaders
  updateBackgroundTexture();

  // Rendu direct optimisé
  renderer.render(scene, camera);

  // Mettre à jour Stats.js si elle existe
  if (stats) {
    stats.update();
  }
}

// Mettre à jour la texture d'arrière-plan pour les refractions
function updateBackgroundTexture() {
  if (!backgroundRenderTarget || !glassShaderMaterial) return;

  // Sauvegarder l'état actuel
  const currentRenderTarget = renderer.getRenderTarget();
  
  // Rendre uniquement la vidéo vers le render target
  cubeGroup.visible = false; // Cacher les cubes
  
  // Temporairement rendre la vidéo visible pour la capture
  if (window.videoPlane) {
    window.videoPlane.material.visible = true;
  }
  
  renderer.setRenderTarget(backgroundRenderTarget);
  renderer.render(scene, camera);
  
  // Cacher à nouveau la vidéo
  if (window.videoPlane) {
    window.videoPlane.material.visible = false;
  }
  
  // Restaurer l'état
  cubeGroup.visible = true;
  renderer.setRenderTarget(currentRenderTarget);
  
  // Mettre à jour l'uniform de texture d'arrière-plan pour tous les cubes
  cubes.forEach(cube => {
    if (cube.material.uniforms && cube.material.uniforms.backgroundTexture) {
      cube.material.uniforms.backgroundTexture.value = backgroundRenderTarget.texture;
    }
  });
}

// Gérer l'animation d'apparition des cubes
function handleAppearanceAnimation() {
  const currentTime = Date.now();
  const elapsed = currentTime - animationStartTime;

  // Phase 1: Premier cube (index 0) - arrière gauche bas
  if (animationPhase === 1) {
    animateCubes([0], elapsed);
    if (elapsed > CONFIG.animationDuration) {
      animationStartTime = currentTime;
      animationPhase = 2;
    }
  }
  // Phase 2: Deuxième cube au-dessus (index 4) - arrière gauche haut
  else if (animationPhase === 2) {
    animateCubes([4], elapsed);
    if (elapsed > CONFIG.animationDuration) {
      animationStartTime = currentTime;
      animationPhase = 3;
    }
  }
  // Phase 3: 2 cubes sur le côté (index 2, 6) - avant gauche bas et haut
  else if (animationPhase === 3) {
    animateCubes([2, 6], elapsed);
    if (elapsed > CONFIG.animationDuration) {
      animationStartTime = currentTime;
      animationPhase = 4;
    }
  }
  // Phase 4: 4 cubes d'une face (index 1, 3, 5, 7) - face droite complète
  else if (animationPhase === 4) {
    animateCubes([1, 3, 5, 7], elapsed);
    if (elapsed > CONFIG.animationDuration) {
      animationStartTime = currentTime;
      animationPhase = 5;
    }
  }
  // Phase 5: 2 parallélépipèdes (index 8, 9) - à droite du groupe
  else if (animationPhase === 5) {
    animateCubes([8, 9], elapsed);
    if (elapsed > CONFIG.animationDuration) {
      animationStartTime = currentTime;
      stageRotationStartTime = currentTime;
      animationPhase = 6; // Transition vers rotation étage haut
    }
  }
  // Phase 6: Rotation de l'étage du haut
  else if (animationPhase === 6) {
    animateStageRotation(topStageGroup, elapsed);
    if (elapsed > CONFIG.stageRotationDuration) {
      animationStartTime = currentTime;
      stageRotationStartTime = currentTime;
      animationPhase = 7; // Transition vers rotation étage bas
    }
  }
  // Phase 7: Rotation de l'étage du bas
  else if (animationPhase === 7) {
    animateStageRotation(bottomStageGroup, elapsed);
    if (elapsed > CONFIG.stageRotationDuration) {
      animationPhase = 8; // Animation complètement terminée
    }
  }
}

// Animer un groupe de cubes
function animateCubes(cubeIndices, elapsed) {
  const progress = Math.min(elapsed / CONFIG.animationDuration, 1);
  const easedProgress = easeInOutCubic(progress);

  cubeIndices.forEach(index => {
    const cube = cubes[index];
    const userData = cube.userData;

    // Déterminer l'axe de croissance selon la phase
    let animationScale = new THREE.Vector3(1, 1, 1);
    
    if (animationPhase === 1) {
      // Phase 1: Premier cube - croissance depuis le sol
      animationScale.set(1, easedProgress, 1);
      const halfHeight = (CONFIG.cubeSize * (1 - easedProgress)) / 2;
      cube.position.y = userData.finalPosition.y - halfHeight;
    } else if (animationPhase === 2) {
      // Phase 2: Deuxième cube au-dessus - croissance depuis le bas
      animationScale.set(1, easedProgress, 1);
      const halfHeight = (CONFIG.cubeSize * (1 - easedProgress)) / 2;
      cube.position.y = userData.finalPosition.y - halfHeight;
    } else if (animationPhase === 3) {
      // Phase 3: 2 cubes sur le côté - croissance depuis l'arrière
      animationScale.set(1, 1, easedProgress);
      const halfDepth = (CONFIG.cubeSize * (1 - easedProgress)) / 2;
      cube.position.z = userData.finalPosition.z - halfDepth;
    } else if (animationPhase === 4) {
      // Phase 4: 4 cubes d'une face - croissance depuis la gauche
      animationScale.set(easedProgress, 1, 1);
      const halfWidth = (CONFIG.cubeSize * (1 - easedProgress)) / 2;
      cube.position.x = userData.finalPosition.x - halfWidth;
    } else if (animationPhase === 5) {
      // Phase 5: 2 parallélépipèdes - croissance depuis la gauche
      animationScale.set(easedProgress, 1, 1);
      // Calculer le décalage basé sur la largeur réelle du parallélépipède (moitié de cubeSize)
      const parallelepipedWidth = CONFIG.cubeSize / 2;
      const halfWidth = (parallelepipedWidth * (1 - easedProgress)) / 2;
      cube.position.x = userData.finalPosition.x - halfWidth;
    }

    // Mettre à jour l'échelle originale pour le système de hover
    if (userData.originalScale) {
      userData.originalScale.copy(animationScale);
    }

    // Appliquer l'échelle d'animation (sera modifiée par le système de hover si nécessaire)
    cube.scale.copy(animationScale);

    // Animation d'opacité
    cube.material.opacity = userData.initialOpacity + (userData.finalOpacity - userData.initialOpacity) * easedProgress;
  });
}

// Animer la rotation d'un étage
function animateStageRotation(stageGroup, elapsed) {
  const progress = Math.min(elapsed / CONFIG.stageRotationDuration, 1);
  const easedProgress = easeInOutCubic(progress);
  
  // Rotation autour de l'axe Y (rotation horizontale)
  const targetRotation = CONFIG.stageRotationAngle; // 90 degrés
  stageGroup.rotation.y = targetRotation * easedProgress;
}

// Fonction d'easing pour un mouvement fluide
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}


// Gérer le redimensionnement de la fenêtre avec throttling
let resizeTimeout;
function onWindowResize() {
  // Throttling pour éviter trop de redimensionnements
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    // Adapter la taille à la fenêtre
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(CONFIG.pixelRatio); // Maintenir pixel ratio optimisé
    
    // Redimensionner le render target de l'arrière-plan
    if (backgroundRenderTarget) {
      backgroundRenderTarget.setSize(window.innerWidth, window.innerHeight);
    }
    
    // Mettre à jour la résolution dans les shaders
    if (glassShaderMaterial && glassShaderMaterial.uniforms.resolution) {
      glassShaderMaterial.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
    }
  }, 100);
}

// Nettoyage
function cleanup() {
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  if (gui) {
    gui.destroy();
  }
  window.removeEventListener('resize', onWindowResize);
  window.removeEventListener('mousemove', null);
  window.removeEventListener('mouseleave', null);
}

// Démarrer l'application
init();

// Nettoyage à la fermeture
window.addEventListener('beforeunload', cleanup);
