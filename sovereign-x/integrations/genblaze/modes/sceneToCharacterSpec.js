/**
 * SceneSpecification → draft CharacterSpec (assist-only).
 *
 * STATUS: **declared** / **skeleton** — heuristic draft; not print SoT.
 * No geometric reconstruction claim. Human curation required before print.
 */

const DEFAULT_BLENDSHAPES = [
  "Smile",
  "Frown",
  "BlinkLeft",
  "BlinkRight",
  "Squint",
  "WideEyes",
  "MouthOpen",
  "MouthNarrow",
];

const DEFAULT_BONES = [
  "Head",
  "Jaw",
  "LeftEye",
  "RightEye",
  "LeftBrow",
  "RightBrow",
  "UpperLip",
  "LowerLip",
];

/**
 * @param {object} [sceneSpec]
 * @param {object} [opts]
 * @returns {object} CharacterSpec draft
 */
export function sceneToCharacterSpec(sceneSpec = {}, opts = {}) {
  const id =
    opts.characterId ||
    sceneSpec.id ||
    opts.intentId ||
    `character-${String(opts.seed ?? "0")}`;

  return {
    schemaVersion: "1.0.0",
    kind: "CharacterSpec",
    id,
    status: "declared",
    assistOnly: true,
    nonAuthoritative: true,
    source: "scene-to-character-spec",
    notes:
      "Draft CharacterSpec from SceneSpec / face-creation assist — not print SoT; not StoryForge narrative SoT",
    prompt: opts.prompt || sceneSpec.prompt || null,
    face: {
      blendshapes: [...DEFAULT_BLENDSHAPES],
      bones: [...DEFAULT_BONES],
      armatureName: "Armature",
      meshHint: opts.meshHint || "HumanFaceRigged.glb",
      status: "declared",
    },
    fromScene: {
      id: sceneSpec.id ?? null,
      kind: sceneSpec.kind ?? null,
      objectCount: Array.isArray(sceneSpec.objects)
        ? sceneSpec.objects.length
        : 0,
    },
    bans: ["printSoT", "digitalPrinterEvidence", "storyForgeImport"],
  };
}

export { DEFAULT_BLENDSHAPES, DEFAULT_BONES };
export default { sceneToCharacterSpec };
