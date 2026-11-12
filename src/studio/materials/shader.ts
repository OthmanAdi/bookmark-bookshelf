/**
 * What three.js's physical material cannot do from its own maps, added to its shader in three places.
 *
 * A stamp is one mask per face. Reading it once in the fragment shader gives everything a stamp changes:
 * colour, roughness, metalness, sheen, clearcoat, thin film and the pressed edge. The alternative, a
 * derived roughness, normal and film texture for each face of each volume, costs several megabytes per
 * book and a pass over every pixel on the CPU. The binding's own relief stays in the ordinary normal
 * map, tiled; the pressed edge, the turn of the covering over the board edge, the joint and the round
 * of the spine are leaned onto that normal afterwards.
 *
 * The additions hang on three anchors in the stock shader. If a later three.js renames one, the patch
 * is skipped as a whole and the material falls back to the stock look.
 */
import type * as THREE from 'three';

export interface BindingUniforms {
  /** x: how strongly the tile's shade is printed in, y: exponent on the print's brightness, z: film shift in nm, w: how far the print is paled toward silver. */
  bbDetail: { value: THREE.Vector4 };
}

export interface FaceUniforms extends BindingUniforms {
  bbStamp: { value: THREE.Texture | null };
  /** Step between the mask samples that find the pressed edge, in UV. */
  bbStampTexel: { value: THREE.Vector2 };
  bbStampColor: { value: THREE.Color };
  /** x tint, y shade, z flatten, w deboss. */
  bbStampMix: { value: THREE.Vector4 };
  /** Roughness a + b * binding (x, y), metalness a + b * binding (z, w). */
  bbStampPbr: { value: THREE.Vector4 };
  /** x sheen kept, y clearcoat kept, z film outside the mask, w film inside it. */
  bbStampFx: { value: THREE.Vector4 };
  /** Face size in CSS px. */
  bbFaceSize: { value: THREE.Vector2 };
  /** x wear width px, y wear darkening, z bevel width px, w bevel lean. */
  bbEdge: { value: THREE.Vector4 };
  /** x joint centre px from the left edge, y joint half width px, z joint depth, w round of the spine. */
  bbJoint: { value: THREE.Vector4 };
}

const ANCHOR_MAIN = 'void main() {';
const ANCHOR_SURFACE = '#include <normal_fragment_maps>';
const ANCHOR_LAYERS = '#include <lights_physical_fragment>';

const PARS = /* glsl */ `
uniform vec4 bbDetail;
#ifdef BB_FACE
	uniform sampler2D bbStamp;
	uniform vec2 bbStampTexel;
	uniform vec3 bbStampColor;
	uniform vec4 bbStampMix;
	uniform vec4 bbStampPbr;
	uniform vec4 bbStampFx;
	uniform vec2 bbFaceSize;
	uniform vec4 bbEdge;
	uniform vec4 bbJoint;
#endif
float bbMask = 0.0;
`;

const SURFACE = /* glsl */ `
#ifdef USE_ROUGHNESSMAP
	// The tile's red channel: hollows and single threads printed into the colour.
	diffuseColor.rgb *= 1.0 + ( texelRoughness.r * 2.0 - 1.0 ) * bbDetail.x;
#endif
{
	// Lift a dark print so it can work as a metal, keeping its hue.
	float bbLuma = max( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.0001 );
	diffuseColor.rgb = min( diffuseColor.rgb * ( pow( bbLuma, bbDetail.y ) / bbLuma ), vec3( 1.0 ) );
	// A holographic foil is a pale silver that the film colours, whatever is printed on it.
	diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.93, 0.94, 0.96 ), bbDetail.w );
}
#if defined( BB_FACE ) && defined( USE_MAP ) && defined( USE_NORMALMAP_TANGENTSPACE )
{
	vec2 bbUv = vMapUv;
	bbMask = texture2D( bbStamp, bbUv ).r;
	vec2 bbSlope = vec2(
		texture2D( bbStamp, bbUv + vec2( bbStampTexel.x, 0.0 ) ).r - texture2D( bbStamp, bbUv - vec2( bbStampTexel.x, 0.0 ) ).r,
		texture2D( bbStamp, bbUv + vec2( 0.0, bbStampTexel.y ) ).r - texture2D( bbStamp, bbUv - vec2( 0.0, bbStampTexel.y ) ).r
	);

	diffuseColor.rgb = mix( diffuseColor.rgb, bbStampColor, bbMask * bbStampMix.x );
	diffuseColor.rgb *= mix( 1.0, bbStampMix.y, bbMask );
	roughnessFactor = mix( roughnessFactor, bbStampPbr.x + bbStampPbr.y * roughnessFactor, bbMask );
	metalnessFactor = mix( metalnessFactor, bbStampPbr.z + bbStampPbr.w * metalnessFactor, bbMask );

	// Pressed flat inside the stamp, with a wall at its edge that leans toward the inside.
	normal = normalize( mix( normal, nonPerturbedNormal, bbMask * bbStampMix.z ) );
	vec2 bbLean = bbSlope * bbStampMix.w;

	vec2 bbPx = bbUv * bbFaceSize;
	vec2 bbFromEdge = min( bbPx, bbFaceSize - bbPx );
	float bbWear = 1.0 - smoothstep( 0.0, max( bbEdge.x, 0.001 ), min( bbFromEdge.x, bbFromEdge.y ) );
	diffuseColor.rgb *= 1.0 - bbEdge.y * bbWear;
	// The covering turns over the edge of the board.
	bbLean += ( 1.0 - smoothstep( vec2( 0.0 ), vec2( max( bbEdge.z, 0.001 ) ), bbFromEdge ) ) * sign( bbUv - 0.5 ) * bbEdge.w;
	// A spine is rounded across its width.
	bbLean.x += ( bbUv.x * 2.0 - 1.0 ) * bbJoint.w;
	// The joint: a groove along the spine side of a board.
	float bbAcross = ( bbPx.x - bbJoint.x ) / max( bbJoint.y, 0.001 );
	float bbGroove = exp( - bbAcross * bbAcross ) * bbJoint.z;
	bbLean.x -= 2.0 * bbAcross * bbGroove;
	diffuseColor.rgb *= 1.0 - 0.28 * min( bbGroove, 1.0 );

	normal = normalize( normal + normalize( tbn[ 0 ] ) * bbLean.x + normalize( tbn[ 1 ] ) * bbLean.y );
}
#endif
`;

const LAYERS = /* glsl */ `
#ifdef BB_FACE
	#ifdef USE_SHEEN
		material.sheenColor *= mix( 1.0, bbStampFx.x, bbMask );
	#endif
	#ifdef USE_CLEARCOAT
		material.clearcoat *= mix( 1.0, bbStampFx.y, bbMask );
	#endif
	#ifdef USE_IRIDESCENCE
		material.iridescence *= mix( bbStampFx.z, bbStampFx.w, bbMask );
	#endif
#endif
#ifdef USE_IRIDESCENCE
{
	// A thin film changes colour with the angle of view only. A holographic foil runs through its
	// colours as the light moves, so the film is made thicker or thinner by where the surface looks
	// in the room, which also follows the room when it is turned.
	vec3 bbBounce = inverseTransformDirection( reflect( - normalize( vViewPosition ), nonPerturbedNormal ), viewMatrix );
	#ifdef USE_ENVMAP
		bbBounce = envMapRotation * bbBounce;
	#endif
	material.iridescenceThickness = max( material.iridescenceThickness + bbDetail.z * ( bbBounce.x + 0.6 * bbBounce.y ), 90.0 );
}
#endif
`;

/** The stock fragment shader with the binding code added, or unchanged when an anchor is missing. */
export function patchFragmentShader(source: string): string {
  if (!source.includes(ANCHOR_MAIN) || !source.includes(ANCHOR_SURFACE) || !source.includes(ANCHOR_LAYERS)) return source;
  return source
    .replace(ANCHOR_MAIN, `${PARS}\n${ANCHOR_MAIN}`)
    .replace(ANCHOR_SURFACE, `${ANCHOR_SURFACE}\n${SURFACE}`)
    .replace(ANCHOR_LAYERS, `${ANCHOR_LAYERS}\n${LAYERS}`);
}

/** Every patched material compiles to the same program as the others with the same features. */
export const PROGRAM_KEY = 'bb-binding-1';

/**
 * Adds the binding code to a physical material. `face` materials carry a stamp mask and read the
 * face uniforms; the others only use the tile's shade and the lift of the colour.
 */
export function applyBindingShader(material: THREE.MeshPhysicalMaterial, uniforms: BindingUniforms | FaceUniforms, face: boolean): void {
  if (face) material.defines = { ...material.defines, BB_FACE: '' };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = patchFragmentShader(shader.fragmentShader);
  };
  material.customProgramCacheKey = () => PROGRAM_KEY;
}
