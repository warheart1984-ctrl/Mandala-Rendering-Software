/**
 * @mrs/renderer-core — Canonical Perceptual Field (CPF) layer, image component.
 *
 * Experimental FIRST component of the broader Canonical Perceptual Field idea
 * (CPF-Image today; CPF-Video and CPF-4D are future work). Everything here is
 * byte-deterministic, hashable "visual truth": a measurement layer (CPO) that a
 * separate perception overlay (SPO) references by hash.
 *
 * Status per piece:
 *   - CPO codec + mandala-link/1 packet ........ implemented (lossless round-trip)
 *   - Multiresolution token pyramid + queries .. implemented
 *   - Optional lossy quantizer (bit-depth) ..... implemented (uniform); median-cut declared
 *   - SPO schema + hash-linked validation ...... implemented (perception model: skeleton)
 */
export {
  CPO_ENCODER_VERSION,
  MANDALA_LINK_PROTOCOL,
  CPO_SUBTYPE,
  CPO_ENCODING,
  encodeCPO,
  decodeCPO,
  validateCPO,
  encodeRleV1,
  decodeRleV1,
  encodeCPOFromPng,
  decodeCPOToPng,
} from "./cpo.mjs";

export { encodeRgbaPng, decodePngToRgba } from "./png.mjs";

export { quantizeRgbaBitDepth } from "./quantize.mjs";

export {
  FULL_FRAME_LEVELS,
  REGION_LEVELS,
  buildPyramid,
  inspectGrid,
  inspectRegion,
  CPOStore,
} from "./pyramid.mjs";

export {
  SPO_TYPE,
  SPO_SCHEMA_VERSION,
  skeletonProvider,
  makeSPO,
  validateSPO,
  spoMatchesCPO,
} from "./spo.mjs";
