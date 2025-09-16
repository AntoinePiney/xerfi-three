/**
 * Glass Material Vertex Shader
 * 
 * Handles world space transformations and passes data to fragment shader
 * for chromatic dispersion calculations
 */

// Varying variables passed to fragment shader
varying vec3 vWorldNormal;
varying vec3 vViewDirection;  
varying vec3 vWorldPosition;
varying vec4 vScreenPos;

void main() {
  // Transform position to world space
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  
  // Transform normal to world space
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  
  // Calculate view direction from world position to camera
  vViewDirection = normalize(cameraPosition - worldPosition.xyz);
  
  // Calculate screen space position for UV mapping
  vec4 screenPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vScreenPos = screenPos;
  
  // Output final position
  gl_Position = screenPos;
}
