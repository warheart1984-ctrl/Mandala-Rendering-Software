/**
 * Sovereign Kernel Interface (SKI) v1.0
 * Constitutional hardware-neutral kernel layer for LLM and multimodal workloads
 */

import { EvidenceId, ModelVersion, KernelCallId, SubstrateId } from '../contracts';

// ============================================================
// SKI PRIMITIVE SIGNATURES
// ============================================================

/** SKI MatMul Configuration */
export interface SkiMatMulConfig {
  dtype: 'FP32' | 'FP16' | 'INT8' | 'Q4_K_M' | 'Q5_K_M';
  transposeA?: boolean;
  transposeB?: boolean;
  alpha?: number;
  beta?: number;
  blockSize?: number; // For quantized formats
  deterministic?: boolean;
}

/** SKI Attention Configuration */
export interface SkiAttentionConfig {
  numHeads: number;
  headDim: number;
  scaling?: number;
  causalMask?: boolean;
  customMask?: Float32Array; // [T, T]
  kvCacheHandle?: string;
  deterministic?: boolean;
}

/** SKI LayerNorm Configuration */
export interface SkiLayerNormConfig {
  epsilon: number;
  dtype: 'FP32' | 'FP16' | 'INT8' | 'Q4' | 'Q5';
  deterministic?: boolean;
}

/** SKI Embed Configuration */
export interface SkiEmbedConfig {
  positionalEncoding: 'static' | 'rope' | 'none';
  ropeBase?: number;
  maxSeqLen?: number;
  deterministic?: boolean;
}

/** SKI Conv Configuration */
export interface SkiConvConfig {
  stride: [number, number];
  padding: [number, number];
  dilation: [number, number];
  groups: number;
  dtype: 'FP32' | 'FP16' | 'INT8' | 'Q4' | 'Q5';
  deterministic?: boolean;
}

/** SKI Kernel Call Record (for evidence) */
export interface SkiKernelCall {
  callId: KernelCallId;
  primitive: 'MATMUL' | 'ATTENTION' | 'LAYER_NORM' | 'EMBED' | 'CONV';
  substrateId: SubstrateId;
  timestamp: number;
  inputs: SkiTensorInfo[];
  output: SkiTensorInfo;
  config: SkiMatMulConfig | SkiAttentionConfig | SkiLayerNormConfig | SkiEmbedConfig | SkiConvConfig;
  latencyMs: number;
  flops: number;
  deterministic: boolean;
  seed?: number;
}

/** Tensor metadata for logging */
export interface SkiTensorInfo {
  shape: number[];
  dtype: string;
  quantization?: string;
  hash?: string; // Content hash for integrity
}

// ============================================================
// SKI INTERFACE
// ============================================================

/** SKI Primitive Interface */
export interface SkiPrimitives {
  matmul(A: SkiTensor, B: SkiTensor, config: SkiMatMulConfig): Promise<SkiTensor>;
  attention(Q: SkiTensor, K: SkiTensor, V: SkiTensor, config: SkiAttentionConfig): Promise<SkiTensor>;
  layerNorm(X: SkiTensor, gamma: SkiTensor, beta: SkiTensor, config: SkiLayerNormConfig): Promise<SkiTensor>;
  embed(ids: Int32Array, table: SkiTensor, config: SkiEmbedConfig): Promise<SkiTensor>;
  conv(X: SkiTensor, W: SkiTensor, config: SkiConvConfig): Promise<SkiTensor>;
}

/** SKI Tensor wrapper */
export interface SkiTensor {
  data: Float32Array | Int8Array | Uint8Array;
  shape: number[];
  dtype: 'FP32' | 'FP16' | 'INT8' | 'Q4' | 'Q5';
  device: string;
  quantization?: QuantizationParams;
}

/** Quantization parameters */
export interface QuantizationParams {
  format: 'blockwise' | 'per-tensor' | 'per-channel';
  blockSize: number;
  scales: Float32Array;
  zeroPoints?: Int32Array;
}

/** Substrate Adapter Interface */
export interface SubstrateAdapter {
  substrateId: SubstrateId;
  capabilities: SubstrateCapabilities;
  perfProfile: PerformanceProfile;
  primitives: SkiPrimitives;
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  healthCheck(): Promise<boolean>;
}

/** Substrate Capabilities */
export interface SubstrateCapabilities {
  primitives: ('MATMUL' | 'ATTENTION' | 'LAYER_NORM' | 'EMBED' | 'CONV')[];
  dtypes: ('FP32' | 'FP16' | 'INT8' | 'Q4' | 'Q5')[];
  maxTensorSize: number; // elements
  maxBatchSize: number;
  maxSeqLen: number;
  quantizationSupport: {
    matmul: boolean;
    attention: boolean;
    conv: boolean;
  };
}

/** Performance Profile */
export interface PerformanceProfile {
  matmulFlopsPerSec: number;
  attentionLatencyMs: (batch: number, seqLen: number, heads: number, headDim: number) => number;
  convLatencyMs: (batch: number, channels: number, height: number, width: number, kernel: number) => number;
  memoryBandwidthGBs: number;
  determinismGuaranteed: boolean;
}

// ============================================================
// CPU SUBSTRATE IMPLEMENTATION
// ============================================================

/** CPU Substrate (AVX2/AVX-512) */
export class CpuSubstrate implements SubstrateAdapter {
  public readonly substrateId: SubstrateId = 'CPU_AVX2';
  public readonly capabilities: SubstrateCapabilities = {
    primitives: ['MATMUL', 'ATTENTION', 'LAYER_NORM', 'EMBED', 'CONV'],
    dtypes: ['FP32', 'FP16', 'INT8', 'Q4', 'Q5'],
    maxTensorSize: 100_000_000,
    maxBatchSize: 32,
    maxSeqLen: 4096,
    quantizationSupport: { matmul: true, attention: true, conv: true }
  };
  public readonly perfProfile: PerformanceProfile = {
    matmulFlopsPerSec: 500_000_000_000, // 500 GFLOPs on modern CPU
    attentionLatencyMs: (b, t, h, d) => (b * t * t * h * d) / 100_000_000_000 * 1000,
    convLatencyMs: (b, c, h, w, k) => (b * c * h * w * k * k) / 50_000_000_000 * 1000,
    memoryBandwidthGBs: 50,
    determinismGuaranteed: true
  };

  async initialize(): Promise<void> {
    console.log('[SKI-CPU] Initializing CPU substrate (AVX2)');
  }

  async shutdown(): Promise<void> {}

  async healthCheck(): Promise<boolean> {
    return true;
  }

  primitives: SkiPrimitives = {
    async matmul(A, B, config) {
      const start = Date.now();
      const result = this.matmulCpu(A, B, config);
      this.logCall('MATMUL', config, [A, B], result, Date.now() - start);
      return result;
    },

    async attention(Q, K, V, config) {
      const start = Date.now();
      const result = this.attentionCpu(Q, K, V, config);
      this.logCall('ATTENTION', config, [Q, K, V], result, Date.now() - start);
      return result;
    },

    async layerNorm(X, gamma, beta, config) {
      const start = Date.now();
      const result = this.layerNormCpu(X, gamma, beta, config);
      this.logCall('LAYER_NORM', config, [X, gamma, beta], result, Date.now() - start);
      return result;
    },

    async embed(ids, table, config) {
      const start = Date.now();
      const result = this.embedCpu(ids, table, config);
      this.logCall('EMBED', config, [table], result, Date.now() - start);
      return result;
    },

    async conv(X, W, config) {
      const start = Date.now();
      const result = this.convCpu(X, W, config);
      this.logCall('CONV', config, [X, W], result, Date.now() - start);
      return result;
    }
  };

  private matmulCpu(A: SkiTensor, B: SkiTensor, config: SkiMatMulConfig): SkiTensor {
    const M = config.transposeA ? A.shape[1] : A.shape[0];
    const K = config.transposeA ? A.shape[0] : A.shape[1];
    const N = config.transposeB ? B.shape[0] : B.shape[1];
    
    // Validate dimensions
    const AK = config.transposeA ? A.shape[0] : A.shape[1];
    const BK = config.transposeB ? B.shape[1] : B.shape[0];
    if (AK !== BK) throw new Error(`Dimension mismatch: ${AK} vs ${BK}`);

    const output = new Float32Array(M * N);
    
    // Optimized blocked matmul
    const blockSize = 64;
    const aData = A.data as Float32Array;
    const bData = B.data as Float32Array;
    
    for (let m = 0; m < M; m += blockSize) {
      const mEnd = Math.min(m + blockSize, M);
      for (let n = 0; n < N; n += blockSize) {
        const nEnd = Math.min(n + blockSize, N);
        for (let k = 0; k < K; k += blockSize) {
          const kEnd = Math.min(k + blockSize, K);
          
          for (let i = m; i < mEnd; i++) {
            for (let j = n; j < nEnd; j++) {
              let sum = output[i * N + j] || 0;
              for (let kk = k; kk < kEnd; kk++) {
                const aIdx = config.transposeA ? kk * M + i : i * K + kk;
                const bIdx = config.transposeB ? j * K + kk : kk * N + j;
                sum += aData[aIdx] * bData[bIdx];
              }
              output[i * N + j] = sum;
            }
          }
        }
      }
    }

    return {
      data: output,
      shape: [M, N],
      dtype: 'FP32',
      device: 'cpu'
    };
  }

  private attentionCpu(Q: SkiTensor, K: SkiTensor, V: SkiTensor, config: SkiAttentionConfig): SkiTensor {
    const [batch, seqLen, dim] = Q.shape;
    const headDim = dim / config.numHeads;
    const output = new Float32Array(batch * seqLen * dim);
    
    // Simplified attention implementation
    for (let b = 0; b < batch; b++) {
      for (let h = 0; h < config.numHeads; h++) {
        for (let i = 0; i < seqLen; i++) {
          // Compute attention scores
          const scores = new Float32Array(seqLen);
          for (let j = 0; j <= (config.causalMask ? i : seqLen - 1); j++) {
            let score = 0;
            for (let d = 0; d < headDim; d++) {
              const qIdx = ((b * seqLen + i) * config.numHeads + h) * headDim + d;
              const kIdx = ((b * seqLen + j) * config.numHeads + h) * headDim + d;
              score += Q.data[qIdx] * K.data[kIdx];
            }
            scores[j] = score * (config.scaling || 1 / Math.sqrt(headDim));
          }
          
          // Softmax
          const maxScore = Math.max(...scores.slice(0, config.causalMask ? i + 1 : seqLen));
          let sumExp = 0;
          for (let j = 0; j <= (config.causalMask ? i : seqLen - 1); j++) {
            scores[j] = Math.exp(scores[j] - maxScore);
            sumExp += scores[j];
          }
          for (let j = 0; j <= (config.causalMask ? i : seqLen - 1); j++) {
            scores[j] /= sumExp;
          }
          
          // Weighted sum of values
          for (let d = 0; d < headDim; d++) {
            let outVal = 0;
            for (let j = 0; j <= (config.causalMask ? i : seqLen - 1); j++) {
              const vIdx = ((b * seqLen + j) * config.numHeads + h) * headDim + d;
              outVal += scores[j] * V.data[vIdx];
            }
            const outIdx = ((b * seqLen + i) * config.numHeads + h) * headDim + d;
            output[outIdx] = outVal;
          }
        }
      }
    }
    
    return {
      data: output,
      shape: Q.shape,
      dtype: 'FP32',
      device: 'cpu'
    };
  }

  private layerNormCpu(X: SkiTensor, gamma: SkiTensor, beta: SkiTensor, config: SkiLayerNormConfig): SkiTensor {
    const output = new Float32Array(X.data.length);
    const data = X.data as Float32Array;
    const lastDim = X.shape[X.shape.length - 1];
    const outerSize = data.length / lastDim;
    
    for (let i = 0; i < outerSize; i++) {
      const offset = i * lastDim;
      let mean = 0, variance = 0;
      
      for (let j = 0; j < lastDim; j++) {
        mean += data[offset + j];
      }
      mean /= lastDim;
      
      for (let j = 0; j < lastDim; j++) {
        const diff = data[offset + j] - mean;
        variance += diff * diff;
      }
      variance /= lastDim;
      
      const invStd = 1 / Math.sqrt(variance + config.epsilon);
      
      for (let j = 0; j < lastDim; j++) {
        const normalized = (data[offset + j] - mean) * invStd;
        output[offset + j] = normalized * gamma.data[j] + beta.data[j];
      }
    }
    
    return {
      data: output,
      shape: X.shape,
      dtype: 'FP32',
      device: 'cpu'
    };
  }

  private embedCpu(ids: Int32Array, table: SkiTensor, config: SkiEmbedConfig): SkiTensor {
    const [vocabSize, embedDim] = table.shape;
    const output = new Float32Array(ids.length * embedDim);
    const tableData = table.data as Float32Array;
    
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (id < 0 || id >= vocabSize) throw new Error(`Token ID out of range: ${id}`);
      const srcOffset = id * embedDim;
      const dstOffset = i * embedDim;
      output.set(tableData.subarray(srcOffset, srcOffset + embedDim), dstOffset);
    }
    
    // Apply positional encoding if configured
    if (config.positionalEncoding !== 'none') {
      this.applyPositionalEncoding(output, ids.length, embedDim, config);
    }
    
    return {
      data: output,
      shape: [ids.length, embedDim],
      dtype: 'FP32',
      device: 'cpu'
    };
  }

  private applyPositionalEncoding(output: Float32Array, seqLen: number, embedDim: number, config: SkiEmbedConfig): void {
    if (config.positionalEncoding === 'rope') {
      const base = config.ropeBase || 10000;
      for (let pos = 0; pos < seqLen; pos++) {
        for (let i = 0; i < embedDim / 2; i++) {
          const theta = pos / Math.pow(base, 2 * i / embedDim);
          const cos = Math.cos(theta);
          const sin = Math.sin(theta);
          
          const idx1 = pos * embedDim + 2 * i;
          const idx2 = pos * embedDim + 2 * i + 1;
          
          const x1 = output[idx1];
          const x2 = output[idx2];
          
          output[idx1] = x1 * cos - x2 * sin;
          output[idx2] = x1 * sin + x2 * cos;
        }
      }
    } else if (config.positionalEncoding === 'static') {
      // Add learned positional embeddings (would be part of table in practice)
    }
  }

  private convCpu(X: SkiTensor, W: SkiTensor, config: SkiConvConfig): SkiTensor {
    const [B, C, H, W_in] = X.shape;
    const [C_out, C_in, kH, kW] = W.shape;
    
    if (C !== C_in) throw new Error(`Channel mismatch: ${C} vs ${C_in}`);
    
    const strideH = config.stride[0];
    const strideW = config.stride[1];
    const padH = config.padding[0];
    const padW = config.padding[1];
    const dilationH = config.dilation[0];
    const dilationW = config.dilation[1];
    
    const H_out = Math.floor((H_in + 2 * padH - dilationH * (kH - 1) - 1) / strideH + 1);
    const W_out = Math.floor((W_in + 2 * padW - dilationW * (kW - 1) - 1) / strideW + 1);
    
    const output = new Float32Array(B * C_out * H_out * W_out);
    const xData = X.data as Float32Array;
    const wData = W.data as Float32Array;
    
    for (let b = 0; b < B; b++) {
      for (let c_out = 0; c_out < C_out; c_out++) {
        for (let h_out = 0; h_out < H_out; h_out++) {
          for (let w_out = 0; w_out < W_out; w_out++) {
            let sum = 0;
            const h_start = h_out * strideH - padH;
            const w_start = w_out * strideW - padW;
            
            for (let c_in = 0; c_in < C_in; c_in++) {
              for (let kh = 0; kh < kH; kh++) {
                for (let kw = 0; kw < kW; kw++) {
                  const h_in = h_start + kh * dilationH;
                  const w_in = w_start + kw * dilationW;
                  
                  if (h_in >= 0 && h_in < H_in && w_in >= 0 && w_in < W_in) {
                    const xIdx = ((b * C_in + c_in) * H_in + h_in) * W_in + w_in;
                    const wIdx = ((c_out * C_in + c_in) * kH + kh) * kW + kw;
                    sum += xData[xIdx] * wData[wIdx];
                  }
                }
              }
            }
            
            const outIdx = ((b * C_out + c_out) * H_out + h_out) * W_out + w_out;
            output[outIdx] = sum;
          }
        }
      }
    }
    
    return {
      data: output,
      shape: [B, C_out, H_out, W_out],
      dtype: 'FP32',
      device: 'cpu'
    };
  }

  private logCall(
    primitive: string, 
    config: any, 
    inputs: SkiTensor[], 
    output: SkiTensor, 
    latencyMs: number
  ): void {
    const call: SkiKernelCall = {
      callId: `ski-${Date.now()}-${Math.random().toString(36).slice(2, 11)}` as KernelCallId,
      primitive: primitive as any,
      substrateId: this.substrateId,
      timestamp: Date.now(),
      inputs: inputs.map(t => ({
        shape: t.shape,
        dtype: t.dtype,
        quantization: t.quantization?.format
      })),
      output: {
        shape: output.shape,
        dtype: output.dtype,
        quantization: output.quantization?.format
      },
      config,
      latencyMs,
      flops: 0, // Would compute actual FLOPs
      deterministic: config.deterministic ?? true
    };
    
    // In production, send to SME-LOG
    console.log(`[SKI-CPU] ${primitive}: ${latencyMs}ms`, call.callId);
  }
}

// ============================================================
// SKI RUNTIME (Constitutional Kernel Selector)
// ============================================================

/** SKI Runtime - selects substrate per call */
export class SkiRuntime {
  private substrates: Map<SubstrateId, SubstrateAdapter> = new Map();
  private defaultSubstrate: SubstrateId = 'CPU_AVX2';
  private callLog: SkiKernelCall[] = [];

  registerSubstrate(adapter: SubstrateAdapter): void {
    this.substrates.set(adapter.substrateId, adapter);
    console.log(`[SKI] Registered substrate: ${adapter.substrateId}`);
  }

  setDefaultSubstrate(id: SubstrateId): void {
    if (!this.substrates.has(id)) throw new Error(`Substrate not registered: ${id}`);
    this.defaultSubstrate = id;
  }

  /** Get primitives for a substrate */
  getPrimitives(substrateId?: SubstrateId): SkiPrimitives {
    const id = substrateId || this.defaultSubstrate;
    const adapter = this.substrates.get(id);
    if (!adapter) throw new Error(`Substrate not found: ${id}`);
    return adapter.primitives;
  }

  /** Auto-select substrate based on operation and governance */
  selectSubstrate(
    primitive: string,
    shapes: number[][],
    governance: GovernanceConstraints
  ): SubstrateId {
    // Check determinism requirement
    if (governance.deterministic) {
      // CPU guarantees determinism
      return 'CPU_AVX2';
    }

    // Check FLOP budget
    const estimatedFlops = this.estimateFlops(primitive, shapes);
    if (estimatedFlops > governance.flopBudget) {
      // Prefer GPU for high-FLOP ops
      const gpuSubstrate = this.findGpuSubstrate();
      if (gpuSubstrate) return gpuSubstrate;
    }

    // Check tensor size
    const maxElements = Math.max(...shapes.map(s => s.reduce((a, b) => a * b, 1)));
    if (maxElements > governance.maxCpuTensorSize) {
      const gpuSubstrate = this.findGpuSubstrate();
      if (gpuSubstrate) return gpuSubstrate;
    }

    // Default to CPU
    return this.defaultSubstrate;
  }

  private estimateFlops(primitive: string, shapes: number[][]): number {
    switch (primitive) {
      case 'MATMUL':
        const [M, K] = shapes[0];
        const [, N] = shapes[1];
        return 2 * M * K * N;
      case 'ATTENTION':
        const [B, T, D] = shapes[0];
        return 4 * B * T * T * D; // QK + AV + projections
      case 'CONV':
        const [B, C, H, W] = shapes[0];
        const [, , kH, kW] = shapes[1];
        const H_out = Math.floor((H + 2 * 1 - kH) / 1 + 1);
        const W_out = Math.floor((W + 2 * 1 - kW) / 1 + 1);
        return 2 * B * C * H_out * W_out * kH * kW;
      default:
        return 0;
    }
  }

  private findGpuSubstrate(): SubstrateId | null {
    for (const [id, adapter] of this.substrates) {
      if (id.startsWith('GPU_') || id.startsWith('CPU_AVX512')) return id;
    }
    return null;
  }

  getCallLog(): SkiKernelCall[] {
    return this.callLog;
  }

  clearLog(): void {
    this.callLog = [];
  }
}

/** Governance constraints for substrate selection */
export interface GovernanceConstraints {
  deterministic: boolean;
  flopBudget: number; // FLOPs
  maxCpuTensorSize: number; // elements
  requireReplayability: boolean;
  energyBudgetJoules?: number;
}

export default {
  SkiRuntime,
  CpuSubstrate,
  // Types exported for reference
};