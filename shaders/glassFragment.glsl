/**
 * Enhanced Glass Material Fragment Shader
 * 
 * Implements advanced chromatic dispersion with iridescent effects
 * Creates dramatic color separations and prismatic reflections
 */

// Uniforms
uniform sampler2D backgroundTexture;
uniform samplerCube envMap;
uniform float iorRed;
uniform float iorGreen;
uniform float iorBlue;
uniform float transmission;
uniform vec2 resolution;
uniform float time;

// Nouveaux uniforms pour contrôle avancé
uniform float refractionStrength;
uniform float chromaticMultiplierRed;
uniform float chromaticMultiplierBlue;
uniform float verticalVariationFreq;
uniform float horizontalVariationFreq;
uniform float timeSpeed;
uniform float fresnelPower;
uniform float edgeFresnelPower;
uniform vec3 blueBase;
uniform vec3 blueLighter;
uniform vec3 violetSubtle;
uniform float baseColorIntensity;
uniform float iridescentIntensity;
uniform float reflectionIntensity;
uniform float edgeIntensity;
uniform float glassBodyIntensity;
uniform vec3 spectralMultipliers;
uniform float gammaCorrection;
uniform float finalOpacityMult;

// Varying variables from vertex shader
varying vec3 vWorldNormal;
varying vec3 vViewDirection;
varying vec3 vWorldPosition;
varying vec4 vScreenPos;

/**
 * Enhanced chromatic dispersion with diffusion effect
 */
vec2 getRefractedUV(vec3 normal, vec3 viewDir, float ior) {
  // Calculate refraction direction using Snell's law
  vec3 refracted = refract(-viewDir, normal, 1.0 / ior);
  
  // Convert screen position to UV coordinates [0,1]
  vec2 screenUV = (vScreenPos.xy / vScreenPos.w) * 0.5 + 0.5;
  
  // Parameterized refraction strength
  vec2 offset = refracted.xy * refractionStrength * ((ior - 1.0) / 0.5);
  
  return screenUV + offset;
}

/**
 * Calculate vertical iridescent reflections like polished glass
 */
vec3 getVerticalIridescence(vec3 normal, vec3 viewDir, vec3 worldPos) {
  // Calculate fresnel term for edge enhancement
  float fresnel = 1.0 - max(dot(normal, viewDir), 0.0);
  fresnel = pow(fresnel, fresnelPower);
  
  // Create parameterized vertical variations
  float verticalVariation = sin(worldPos.y * verticalVariationFreq + time * timeSpeed) * 0.3 + 0.7;
  verticalVariation = smoothstep(0.3, 1.0, verticalVariation);
  
  // Parameterized horizontal variation
  float horizontalVariation = sin(worldPos.x * horizontalVariationFreq) * 0.1;
  
  // Combine for smooth variations without visible bands
  float bandIntensity = verticalVariation + horizontalVariation;
  bandIntensity = clamp(bandIntensity, 0.1, 1.0); // Éviter les variations trop fortes
  
  // Parameterized iridescent colors with subtle magenta
  vec3 roseSubtle = vec3(0.7, 0.5, 0.9);    // Magenta rose plus doux
  
  // Mix colors based on fresnel only (remove pattern dependency)
  float colorShift = fresnel * 0.8; // Simplifier le mélange
  vec3 iridescent = mix(blueBase, blueLighter, colorShift);
  
  // Add magenta tones subtly
  if (fresnel > 0.5) {  // Commencer plus tard pour plus de subtilité
    float warmMix = (fresnel - 0.5) / 0.5;
    iridescent = mix(iridescent, violetSubtle, warmMix * 0.2);
    if (fresnel > 0.7) {
      float roseMix = (fresnel - 0.7) / 0.3;
      iridescent = mix(iridescent, roseSubtle, roseMix * 0.3); // Magenta très subtil
    }
  }
  
  return iridescent * fresnel * 0.8; // Réduire l'intensité globale
}

void main() {
  // Normalize interpolated vectors
  vec3 normal = normalize(vWorldNormal);
  vec3 viewDir = normalize(vViewDirection);
  
  // === ENHANCED CHROMATIC DISPERSION ===
  // Calculate refracted UV coordinates with parameterized separation
  vec2 uvRed = getRefractedUV(normal, viewDir, iorRed * chromaticMultiplierRed);
  vec2 uvGreen = getRefractedUV(normal, viewDir, iorGreen);  
  vec2 uvBlue = getRefractedUV(normal, viewDir, iorBlue * chromaticMultiplierBlue);
  
  // Sample background with chromatic dispersion
  vec3 redSample = texture2D(backgroundTexture, uvRed).rgb;
  vec3 greenSample = texture2D(backgroundTexture, uvGreen).rgb;
  vec3 blueSample = texture2D(backgroundTexture, uvBlue).rgb;
  
  // Enhanced color separation with amplified chromatic aberration
  vec3 chromaticColor = vec3(
    (redSample.r * 0.8 + blueSample.b * 0.4), // Rouge amplifié pour aberration
    (greenSample.g * 0.03 + blueSample.b * 0.9), // Vert réduit, bleu dominant
    blueSample.b * 1.2    // Bleu amplifié pour contraste chromatique
  );
  
  // === VERTICAL IRIDESCENT REFLECTIONS ===
  vec3 iridescent = getVerticalIridescence(normal, viewDir, vWorldPosition);
  
  // === ENHANCED REFLECTION ===
  vec3 reflected = reflect(-viewDir, normal);
  vec3 reflectedColor = textureCube(envMap, reflected).rgb;
  
  // Add parameterized spectral reflections
  vec3 spectralReflection = reflectedColor;
  spectralReflection.r *= spectralMultipliers.r;
  spectralReflection.g *= spectralMultipliers.g;
  spectralReflection.b *= spectralMultipliers.b;
  
  // === ADVANCED FRESNEL ===
  float fresnel = 1.0 - max(dot(viewDir, normal), 0.0);
  fresnel = pow(fresnel, 2.2);  // More gradual fresnel falloff
  
  // === EDGE HIGHLIGHTS FOR VOLUME ===
  // Parameterized edge enhancement
  float edgeDetection = pow(fresnel, edgeFresnelPower);
  vec3 edgeHighlight = vec3(0.2, 0.8, 1.0) * edgeDetection * 0.8; // Cyan pur et lumineux
  
  // === FINAL COLOR COMPOSITION ===
  // Parameterized layer effects
  vec3 baseColor = chromaticColor * baseColorIntensity;
  vec3 iridescentLayer = iridescent * iridescentIntensity;
  vec3 reflectionLayer = spectralReflection * fresnel * reflectionIntensity;
  vec3 edgeLayer = edgeHighlight * edgeIntensity;
  
  // Parameterized glass body color matching reference image
  vec3 glassBodyColor = vec3(0.3, 0.75, 0.95) * glassBodyIntensity;
  
  // Combine all layers with diffuse blending
  vec3 finalColor = baseColor + iridescentLayer + reflectionLayer + edgeLayer + glassBodyColor;
  
  // Parameterized gamma correction
  finalColor = pow(finalColor, vec3(gammaCorrection));
  finalColor *= 1.0;  // Brightness réduit pour élégance
  
  // Enhance spectrum with subtle magenta hints
  finalColor.r = pow(finalColor.r, 1.05);  // Rouge légèrement amplifié pour magenta
  finalColor.g = pow(finalColor.g, 0.95);  // Vert légèrement réduit pour plus de magenta
  finalColor.b = pow(finalColor.b, 0.7);  // Bleu cyan dominant avec nuance magenta
  
  // Output final color with parameterized opacity
  gl_FragColor = vec4(finalColor, transmission * finalOpacityMult);
}
