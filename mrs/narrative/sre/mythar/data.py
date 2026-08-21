# sre/mythar/data.py - Mythar Natural Voice prosody rules and lexical data
# This module provides the linguistic foundation for Mythar voice synthesis
# and integrates with the Mandala render pipeline's prosody conditioning.

# Canonical Mythar roots (existing SRE data)
ROOTS = [
    {"id": " roots", "symbol": "/", "meaning": "water", "phonetic": "/a/"},
    {"id": " roots", "symbol": "la", "meaning": "leaf", "phonetic": "/la/"},
    {"id": " roots", "symbol": "ka", "meaning": "stone", "phonetic": "/ka/"},
    {"id": " roots", "symbol": "ro", "meaning": "road", "phonetic": "/ro/"},
    {"id": " roots", "symbol": "ma", "meaning": "mother", "phonetic": "/ma/"},
]

# Phonological clusters
CLUSTERS = [
    {"id": "cluster", "pattern": "CVC", "description": "consonant-vowel-consonant pattern"},
    {"id": "cluster", "pattern": "CV", "description": "simple consonant-vowel"},
    {"id": "cluster", "pattern": "V", "description": "vowel onset"},
]

# PGC Contract (Political Governance Contract) - existing
PGC_CONTRACT = [
    {"id": "contract", "rule": "no-execution-without-intent", "severity": "critical"},
    {"id": "contract", "rule": "no-state-change-without-evidence", "severity": "high"},
]

# ALLOWED POLYSEMY - existing
ALLOWED_POLYSEMY = [
    {"id": "polysemy", "rule": "root may have multiple meanings if context disambiguates"},
]

# --- NEW: Mythar Natural Voice Prosody Rules ---

# Voice configuration (corresponds to mythar-voice.json)
MYTHAR_VOICE_CONFIG = {
    "voice": "mythar-natural",
    "version": "1.0.0",
    "description": "Mythar Natural Voice — Human, Soft, Melodic. Default Mythar speaker for everyday discourse and narrative.",
    "baselineF0": 180,
    "f0StdDev": 25,
    "gender": "neutral",
    "timbre": {
        "spectralCentroid": 2800,
        "hnr": 22,
        "breathiness": 0.3,
    },
    "cadence": {
        "rate": 5.0,
        "syllablesPerSecond": 5.0,
        "melodicContour": "rising-falling",
        "newThoughtF0Rise": 5,
        "phraseEndF0Fall": 3,
    },
    "vowels": {
        "openness": "moderate",
        "durationBaseline": 1.0,
        "f1Range": {"low": 700, "high": 850},
    },
    "consonants": {
        "sharpness": 0.8,
        "releaseIntensity": 0.8,
        "voicing": "slightlyLenis",
        "votMs": 5,
    },
    "prosodyRules": {
        "P-01": {
            "name": "First-Syllable Stress",
            "appliesTo": "stress",
            "f0Peak": 200,
            "amplitudeBoost": 1.1,
            "description": "Stressed syllable receives F0 peak + amplitude increase",
        },
        "P-02": {
            "name": "Open-Vowel Terminal",
            "appliesTo": "terminalVowel",
            "lengthen": 1.1,
            "preserveFormants": True,
            "description": "Final vowel lengthened 10%, formant stability maintained",
        },
        "P-03": {
            "name": "CV Flow Continuity",
            "appliesTo": "cvTransition",
            "glideVelocity": 2000,
            "nasalityCoef": 0.1,
            "description": "Inter-vowel formant glide, smooth transitions",
        },
        "P-04": {
            "name": "Intensifier Prefix Scaling",
            "appliesTo": "intensifier",
            "amplitudeCoef": 1.2,
            "durationCoef": 1.15,
            "description": "Marked syllable: amplitude ×1.2, duration ×1.15",
        },
        "P-05": {
            "name": "Divine Suffix Intonation",
            "appliesTo": "divineSuffix",
            "pitchShift": 30,
            "tempoReduce": 0.95,
            "description": "Final suffix: +30 Hz F0 rise, 5% slower tempo",
        },
        "P-06": {
            "name": "Root-Consonant Carry",
            "appliesTo": "rootCarry",
            "intensityCoef": 1.1,
            "vowelReduce": 0.9,
            "description": "CVC roots: consonant intensity ×1.1, vowel reduction ×0.9",
        },
        "P-07": {
            "name": "Diphthong Glide",
            "appliesTo": "diphthongGlide",
            "glideDuration": 0.4,
            "lengthen": 1.1,
            "description": "Diphthong: 40% syllable duration glide, 10% lengthening",
        },
    },
}


# Export for JavaScript adapters
VOICE_CONFIG = MYTHAR_VOICE_CONFIG

# Individual rule exports for backward compatibility
P_01 = MYTHAR_VOICE_CONFIG["prosodyRules"]["P-01"]
P_02 = MYTHAR_VOICE_CONFIG["prosodyRules"]["P-02"]
P_03 = MYTHAR_VOICE_CONFIG["prosodyRules"]["P-03"]
P_04 = MYTHAR_VOICE_CONFIG["prosodyRules"]["P-04"]
P_05 = MYTHAR_VOICE_CONFIG["prosodyRules"]["P-05"]
P_06 = MYTHAR_VOICE_CONFIG["prosodyRules"]["P-06"]
P_07 = MYTHAR_VOICE_CONFIG["prosodyRules"]["P-07"]


# Convenience exports
VOICE = "mythar-natural"
BASELINE_F0 = 180
PROSODY_RULES = list(MYTHAR_VOICE_CONFIG["prosodyRules"].keys())
TIMBRE = MYTHAR_VOICE_CONFIG["timbre"]
CADENCE = MYTHAR_VOICE_CONFIG["cadence"]