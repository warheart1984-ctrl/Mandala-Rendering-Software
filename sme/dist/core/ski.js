/**
 * SKI v1.0 - JavaScript Version
 * Sovereign Kernel Interface for CPU/GPU substrate abstraction
 */

const crypto = require('crypto');

class CpuSubstrate {
  constructor() {
    this.substrateId = 'CPU_AVX2';
    this.capabilities = {
      primitives: ['MATMUL', 'ATTENTION', 'LAYER_NORM', 'EMBED', 'CONV'],
      dtypes: ['FP32', 'FP16', 'INT8', 'Q4', 'Q5'],
      maxTensorSize: 100000000,
      maxBatchSize: 32,
      maxSeqLen: 4096,
      quantizationSupport: { matmul: true, attention: true, conv: true }
    };
    this.perfProfile = {
      matmulFlopsPerSec: 500000000000,
      attentionLatencyMs: (b, t, h, d) => (b * t * t * h * d) / 100000000000 * 1000,
      convLatencyMs: (b, c, h, w, k) => (b * c * h * w * k * k) / 50000000000 * 1000,
      memoryBandwidthGBs: 50,
      determinismGuaranteed: true
    };
  }

  async initialize() {
    console.log('[SKI-CPU] Initializing CPU substrate (AVX2)');
  }

  async shutdown() {}

  async healthCheck() {
    return true;
  }

  primitives = {
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

  matmulCpu(A, B, config) {
    const M = config.transposeA ? A.shape[1] : A.shape[0];
    const K = config.transposeA ? A.shape[0] : A.shape[1];
    const N = config.transposeB ? B.shape[0] : B.shape[1];
    
    const AK = config.transposeA ? A.shape[0] : A.shape[1];
    const BK = config.transposeB ? B.shape[1] : B.shape[0];
    if (AK !== BK) throw new Error(`Dimension mismatch: ${AK} vs ${BK}`);

    const output = new Float32Array(M * N);
    const blockSize = 64;
    const aData = A.data;
    const bData = B.data;
    
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

    return { data: output, shape: [M, N], dtype: 'FP32', device: 'cpu' };
  }

  attentionCpu(Q, K, V, config) {
    const [batch, seqLen, dim] = Q.shape;
    const headDim = dim / config.numHeads;
    const output = new Float32Array(batch * seqLen * dim);
    
    for (let b = 0; b < batch; b++) {
      for (let h = 0; h < config.numHeads; h++) {
        for (let i = 0; i < seqLen; i++) {
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
          
          const maxScore = Math.max(...scores.slice(0, config.causalMask ? i + 1 : seqLen));
          let sumExp = 0;
          for (let j = 0; j <= (config.causalMask ? i : seqLen - 1); j++) {
            scores[j] = Math.exp(scores[j] - maxScore);
            sumExp += scores[j];
          }
          for (let j = 0; j <= (config.causalMask ? i : seqLen - 1); j++) {
            scores[j] /= sumExp;
          }
          
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
    
    return { data: output, shape: Q.shape, dtype: 'FP32', device: 'cpu' };
  }

  layerNormCpu(X, gamma, beta, config) {
    const output = new Float32Array(X.data.length);
    const data = X.data;
    const lastDim = X.shape[X.shape.length - 1];
    const outerSize = data.length / lastDim;
    
    for (let i = 0; i < outerSize; i++) {
      const offset = i * lastDim;
      let mean = 0, variance = 0;
      for (let j = 0; j < lastDim; j++) mean += data[offset + j];
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
    return { data: output, shape: X.shape, dtype: 'FP32', device: 'cpu' };
  }

  embedCpu(ids, table, config) {
    const [vocabSize, embedDim] = table.shape;
    const output = new Float32Array(ids.length * embedDim);
    const tableData = table.data;
    
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (id < 0 || id >= vocabSize) throw new Error(`Token ID out of range: ${id}`);
      const srcOffset = id * embedDim;
      const dstOffset = i * embedDim;
      output.set(tableData.subarray(srcOffset, srcOffset + embedDim), dstOffset);
    }
    
    if (config.positionalEncoding !== 'none') {
      this.applyPositionalEncoding(output, ids.length, embedDim, config);
    }
    
    return { data: output, shape: [ids.length, embedDim], dtype: 'FP32', device: 'cpu' };
  }

  applyPositionalEncoding(output, seqLen, embedDim, config) {
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
    }
  }

  convCpu(X, W, config) {
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
    const xData = X.data;
    const wData = W.data;
    
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
    return { data: output, shape: [B, C_out, H_out, W_out], dtype: 'FP32', device: 'cpu' };
  }

  logCall(primitive, config, inputs, output, latencyMs) {
    console.log(`[SKI-CPU] ${primitive}: ${latencyMs}ms`);
  }
}

class SkiRuntime {
  constructor() {
    this.substrates = new Map();
    this.defaultSubstrate = 'CPU_AVX2';
    this.callLog = [];
  }

  registerSubstrate(adapter) {
    this.substrates.set(adapter.substrateId, adapter);
    console.log(`[SKI] Registered substrate: ${adapter.substrateId}`);
  }

  setDefaultSubstrate(id) {
    if (!this.substrates.has(id)) throw new Error(`Substrate not registered: ${id}`);
    this.defaultSubstrate = id;
  }

  getPrimitives(substrateId) {
    const id = substrateId || this.defaultSubstrate;
    const adapter = this.substrates.get(id);
    if (!adapter) throw new Error(`Substrate not found: ${id}`);
    return adapter.primitives;
  }

  selectSubstrate(primitive, shapes, governance) {
    if (governance.deterministic) return 'CPU_AVX2';
    
    const estimatedFlops = this.estimateFlops(primitive, shapes);
    if (estimatedFlops > governance.flopBudget) {
      const gpuSubstrate = this.findGpuSubstrate();
      if (gpuSubstrate) return gpuSubstrate;
    }

    const maxElements = Math.max(...shapes.map(s => s.reduce((a, b) => a * b, 1)));
    if (maxElements > governance.maxCpuTensorSize) {
      const gpuSubstrate = this.findGpuSubstrate();
      if (gpuSubstrate) return gpuSubstrate;
    }

    return this.defaultSubstrate;
  }

  estimateFlops(primitive, shapes) {
    switch (primitive) {
      case 'MATMUL':
        const [M, K] = shapes[0];
        const [, N] = shapes[1];
        return 2 * M * K * N;
      case 'ATTENTION':
        const [B, T, D] = shapes[0];
        return 4 * B * T * T * D;
      case 'CONV':
        const [Bc, C, H, W] = shapes[0];
        const [, , kH, kW] = shapes[1];
        const H_out = Math.floor((H + 2 * 1 - kH) / 1 + 1);
        const W_out = Math.floor((W + 2 * 1 - kW) / 1 + 1);
        return 2 * Bc * C * H_out * W_out * kH * kW;
      default:
        return 0;
    }
  }

  findGpuSubstrate() {
    for (const [id, adapter] of this.substrates) {
      if (id.startsWith('GPU_') || id.startsWith('CPU_AVX512')) return id;
    }
    return null;
  }

  getCallLog() { return this.callLog; }
  clearLog() { this.callLog = []; }
}

module.exports = { SkiRuntime, CpuSubstrate };