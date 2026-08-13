/**
 * Axiom Vision — L3 Object Detection Bridge.
 *
 * L3 wraps object detection results in constitutional evidence.
 * Supports multiple backends:
 *   - ONNX local (onnxruntime-node)
 *   - External Python microservice
 *   - Pre-computed / static (testing, replay)
 *
 * All paths produce identical L3 evidence objects with model_evidence,
 * bounding boxes, class labels, and confidence scores.
 *
 * Constitutional status: Level 3 = inference (learned model, not measurement).
 */

import { buildEvidence } from "../evidence/evidenceBuilder.js";

/**
 * Detection result from any backend.
 * @typedef {Object} DetectionRaw
 * @property {string} label - Object class name
 * @property {number} label_id - Object class index
 * @property {number} confidence - Detection confidence [0,1]
 * @property {number} x - Bounding box left
 * @property {number} y - Bounding box top
 * @property {number} w - Bounding box width
 * @property {number} h - Bounding box height
 * @property {number[]} [mask] - Optional segmentation mask (RLE or polygon)
 */

/**
 * Model evidence for L3 detections.
 * @typedef {Object} DetectionModelEvidence
 * @property {string} model_name
 * @property {string} model_version
 * @property {string} checksum_sha256
 * @property {string} quantization
 * @property {number} parameter_count
 * @property {number[]} input_shape
 * @property {string} [training_method] - "lora", "full", "pretrained"
 * @property {string} [training_dataset] - Dataset used for fine-tuning
 * @property {number} [training_epochs] - Training epochs if fine-tuned
 * @property {string} [lora_rank] - LoRA rank if LoRA was used
 * @property {string} [base_model] - Base model if fine-tuned
 */

/**
 * Process raw detections into L3 evidence objects.
 *
 * @param {DetectionRaw[]} detections - Raw detection results
 * @param {DetectionModelEvidence} modelEvidence - Model provenance
 * @param {Object} imageRef - { width, height, image_hash }
 * @param {string[]} parentHashes - Hashes of L1/L2 features this derives from
 * @returns {Object[]} Array of L3 evidence objects
 */
export function processDetections(detections, modelEvidence, imageRef, parentHashes = []) {
  const results = [];

  for (const det of detections) {
    // Validate bounding box is within image bounds
    const bbox = clampBoundingBox(
      { x: det.x, y: det.y, w: det.w, h: det.h },
      imageRef.width,
      imageRef.height
    );

    const evidence = buildEvidence({
      level: 3,
      type: "detection",
      label: det.label,
      label_id: det.label_id,
      confidence: clamp(det.confidence, 0, 1),
      method: modelEvidence.model_name,
      method_version: modelEvidence.model_version,
      model_evidence: {
        model_name: modelEvidence.model_name,
        model_version: modelEvidence.model_version,
        checksum_sha256: modelEvidence.checksum_sha256,
        quantization: modelEvidence.quantization || "INT8",
        parameter_count: modelEvidence.parameter_count,
        input_shape: modelEvidence.input_shape,
        training_method: modelEvidence.training_method || "pretrained",
        training_dataset: modelEvidence.training_dataset,
        training_epochs: modelEvidence.training_epochs,
        lora_rank: modelEvidence.lora_rank,
        base_model: modelEvidence.base_model,
        deterministic_inference: true,
      },
      parent_hashes: parentHashes,
      geometry: {
        bounding_box: {
          x: Math.round(bbox.x),
          y: Math.round(bbox.y),
          w: Math.round(bbox.w),
          h: Math.round(bbox.h),
        },
      },
      extra: {
        mask: det.mask || null,
        image_hash: imageRef.image_hash,
      },
    });

    results.push(evidence);
  }

  // Sort by confidence descending for deterministic output
  return results.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Detection provider interface.
 * Implementations: ONNXLocalProvider, ExternalServiceProvider, StaticProvider
 */
export class DetectionProvider {
  /**
   * @returns {DetectionModelEvidence} Model evidence for provenance
   */
  getModelEvidence() {
    throw new Error("DetectionProvider.getModelEvidence() must be implemented");
  }

  /**
   * @param {Uint8Array} rgba - RGBA pixel buffer
   * @param {number} width
   * @param {number} height
   * @returns {Promise<DetectionRaw[]>} Raw detections
   */
  async detect(rgba, width, height) {
    throw new Error("DetectionProvider.detect() must be implemented");
  }
}

/**
 * Static detection provider — returns pre-computed detections.
 * Used for testing, replay, and when detections come from an external source.
 */
export class StaticDetectionProvider extends DetectionProvider {
  constructor(detections, modelEvidence) {
    super();
    this.detections = detections;
    this._modelEvidence = modelEvidence;
  }

  getModelEvidence() {
    return this._modelEvidence;
  }

  async detect() {
    return this.detections;
  }
}

/**
 * External service provider — calls a Python microservice or cloud API.
 * The service receives the image and returns detections.
 */
export class ExternalDetectionProvider extends DetectionProvider {
  /**
   * @param {Object} config
   * @param {string} config.endpoint - HTTP endpoint URL
   * @param {DetectionModelEvidence} config.modelEvidence
   * @param {string} [config.apiKey] - Optional API key
   */
  constructor(config) {
    super();
    this.endpoint = config.endpoint.replace(/\/$/, "");
    this._modelEvidence = config.modelEvidence;
    this.apiKey = config.apiKey || "";
  }

  getModelEvidence() {
    return this._modelEvidence;
  }

  async detect(rgba, width, height) {
    // Send image as base64 to detection service
    const base64 = Buffer.from(rgba).toString("base64");

    const headers = { "Content-Type": "application/json" };
    if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;

    const response = await fetch(`${this.endpoint}/detect`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        image: base64,
        width,
        height,
        format: "rgba",
      }),
    });

    if (!response.ok) {
      throw new Error(`Detection service error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    return data.detections || [];
  }
}

/**
 * ONNX local provider — runs ONNX models directly via onnxruntime-node.
 * Requires onnxruntime-node to be installed.
 */
export class ONNXDetectionProvider extends DetectionProvider {
  /**
   * @param {Object} config
   * @param {string} config.modelPath - Path to .onnx model file
   * @param {DetectionModelEvidence} config.modelEvidence
   * @param {string[]} [config.classNames] - Class name list
   */
  constructor(config) {
    super();
    this.modelPath = config.modelPath;
    this._modelEvidence = config.modelEvidence;
    this.classNames = config.classNames || [];
    this._session = null;
  }

  getModelEvidence() {
    return this._modelEvidence;
  }

  async load() {
    if (this._session) return;

    try {
      const ort = require("onnxruntime-node");
      this._session = await ort.InferenceSession.create(this.modelPath);
    } catch (e) {
      throw new Error(`ONNX load failed: ${e.message}. Install onnxruntime-node: npm i onnxruntime-node`);
    }
  }

  async detect(rgba, width, height) {
    if (!this._session) await this.load();

    // Preprocess: RGBA → RGB, resize to model input, normalize
    const inputTensor = this._preprocess(rgba, width, height);

    // Run inference
    const results = await this._session.run({ input: inputTensor });

    // Post-process: extract boxes, classes, scores
    return this._postprocess(results, width, height);
  }

  _preprocess(rgba, width, height) {
    const ort = require("onnxruntime-node");
    const inputShape = this._modelEvidence.input_shape;
    const modelH = inputShape[2] || 640;
    const modelW = inputShape[3] || 640;

    // Convert RGBA to RGB and resize
    const rgb = new Float32Array(modelH * modelW * 3);
    const scaleX = width / modelW;
    const scaleY = height / modelH;

    for (let y = 0; y < modelH; y++) {
      for (let x = 0; x < modelW; x++) {
        const srcX = Math.min(Math.floor(x * scaleX), width - 1);
        const srcY = Math.min(Math.floor(y * scaleY), height - 1);
        const srcIdx = (srcY * width + srcX) * 4;
        const dstIdx = (y * modelW + x) * 3;

        rgb[dstIdx] = rgba[srcIdx] / 255;
        rgb[dstIdx + 1] = rgba[srcIdx + 1] / 255;
        rgb[dstIdx + 2] = rgba[srcIdx + 2] / 255;
      }
    }

    // NCHW format
    const tensor = new Float32Array(1 * 3 * modelH * modelW);
    for (let c = 0; c < 3; c++) {
      for (let i = 0; i < modelH * modelW; i++) {
        tensor[c * modelH * modelW + i] = rgb[i * 3 + c];
      }
    }

    return new ort.Tensor("float32", tensor, [1, 3, modelH, modelW]);
  }

  _postprocess(results, origWidth, origHeight) {
    // Generic YOLO-style post-processing
    // Assumes output shape: [1, num_detections, 4 + num_classes]
    const output = results[Object.keys(results)[0]];
    const data = output.data;
    const shape = output.dims;

    const numDetections = shape[1];
    const numValues = shape[2];
    const numClasses = numValues - 4;

    const detections = [];
    const confidenceThreshold = 0.25;
    const iouThreshold = 0.45;

    for (let i = 0; i < numDetections; i++) {
      const baseIdx = i * numValues;

      // Find max class score
      let maxScore = 0;
      let maxClass = 0;
      for (let c = 0; c < numClasses; c++) {
        const score = data[baseIdx + 4 + c];
        if (score > maxScore) {
          maxScore = score;
          maxClass = c;
        }
      }

      if (maxScore < confidenceThreshold) continue;

      // Extract box (center x, center y, w, h) → (x, y, w, h)
      const cx = data[baseIdx];
      const cy = data[baseIdx + 1];
      const w = data[baseIdx + 2];
      const h = data[baseIdx + 3];

      detections.push({
        label: this.classNames[maxClass] || `class_${maxClass}`,
        label_id: maxClass,
        confidence: maxScore,
        x: (cx - w / 2) / origWidth,
        y: (cy - h / 2) / origHeight,
        w: w / origWidth,
        h: h / origHeight,
      });
    }

    // Apply NMS
    return nms(detections, iouThreshold);
  }
}

/**
 * Run L3 detection and produce evidence objects.
 *
 * @param {DetectionProvider} provider
 * @param {Uint8Array} rgba
 * @param {number} width
 * @param {number} height
 * @param {Object} [options]
 * @param {string[]} [options.parentHashes] - Parent feature hashes
 * @param {string} [options.imageHash] - Pre-computed image hash
 * @returns {Promise<Object[]>} L3 evidence objects
 */
export async function detectObjects(provider, rgba, width, height, options = {}) {
  const modelEvidence = provider.getModelEvidence();
  const rawDetections = await provider.detect(rgba, width, height);

  return processDetections(
    rawDetections,
    modelEvidence,
    { width, height, image_hash: options.imageHash || "" },
    options.parentHashes || []
  );
}

// ===== Utility Functions =====

function clampBoundingBox(bbox, imgW, imgH) {
  return {
    x: Math.max(0, Math.min(bbox.x, imgW - 1)),
    y: Math.max(0, Math.min(bbox.y, imgH - 1)),
    w: Math.max(1, Math.min(bbox.w, imgW - bbox.x)),
    h: Math.max(1, Math.min(bbox.h, imgH - bbox.y)),
  };
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

function nms(detections, iouThreshold) {
  // Simple greedy NMS
  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
  const kept = [];

  while (sorted.length > 0) {
    const current = sorted.shift();
    kept.push(current);

    for (let i = sorted.length - 1; i >= 0; i--) {
      if (computeIoU(current, sorted[i]) > iouThreshold) {
        sorted.splice(i, 1);
      }
    }
  }

  return kept;
}

function computeIoU(a, b) {
  const ax1 = a.x, ay1 = a.y, ax2 = a.x + a.w, ay2 = a.y + a.h;
  const bx1 = b.x, by1 = b.y, bx2 = b.x + b.w, by2 = b.y + b.h;

  const interX1 = Math.max(ax1, bx1);
  const interY1 = Math.max(ay1, by1);
  const interX2 = Math.min(ax2, bx2);
  const interY2 = Math.min(ay2, by2);

  if (interX2 <= interX1 || interY2 <= interY1) return 0;

  const interArea = (interX2 - interX1) * (interY2 - interY1);
  const aArea = (ax2 - ax1) * (ay2 - ay1);
  const bArea = (bx2 - bx1) * (by2 - by1);

  return interArea / (aArea + bArea - interArea);
}
