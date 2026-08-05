const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const fs = require('fs');

const IS_PACKAGED = app.isPackaged;
// SME runtime ships inside the packaged resources dir (see package.json
// extraResources); in dev it resolves to the repo's sme/dist.
const SME_DIST = IS_PACKAGED
  ? path.join(process.resourcesPath, 'sme-dist')
  : path.join(__dirname, '..', 'sme', 'dist');
// Packaged builds write to the per-user app data dir; dev uses the repo root.
const MRS_ROOT = IS_PACKAGED
  ? path.join(app.getPath('userData'))
  : path.join(__dirname, '..'); // repo root

const smeRequire = (modPath) => require(path.join(SME_DIST, modPath));

const { CloudAIClient } = require('./cloud-ai-client');
const { DirectorAgent } = require('./director-agent');
const { DEPCompiler } = require('./dep-compiler');
const { DEPScheduler } = require('./dep-scheduler');
const { CapabilityPlanner } = smeRequire('core/capability-planner.js');
const { HardwareProfileManager, CANONICAL_PROFILES } = smeRequire('core/hardware-profiles.js');
const { SmeCoreModule } = smeRequire('core/index.js');
const { SmeTxtModule } = smeRequire('txt/index.js');
const { SmeVisModule } = smeRequire('vis/index.js');
const { SmeAudModule } = smeRequire('aud/index.js');
const { SmeVidModule } = smeRequire('vid/index.js');
const { SmeGenModule } = smeRequire('gen/index.js');
const { SmeLogModule } = smeRequire('log/index.js');
const { SmeLatticeModule } = smeRequire('lattice/index.js');

const LEMONADE_BASE = 'http://localhost:13305/api/v1';

const cloudAI = new CloudAIClient();
const director = new DirectorAgent(cloudAI);
const depCompiler = new DEPCompiler(cloudAI);
const depScheduler = new DEPScheduler(cloudAI, null, {
  evidenceDir: path.join(MRS_ROOT, 'evidence'),
  scenesDir: path.join(MRS_ROOT, 'scenes'),
  auditDir: path.join(MRS_ROOT, 'audit'),
});

// SME Modules
const smeCore = new SmeCoreModule();
const smeTxt = new SmeTxtModule();
const smeVis = new SmeVisModule();
const smeAud = new SmeAudModule();
const smeVid = new SmeVidModule();
const smeGen = new SmeGenModule();
const smeLog = new SmeLogModule();
const smeLattice = new SmeLatticeModule();
const hardwareProfileManager = new HardwareProfileManager();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile('index.html');
}

app.whenReady().then(async () => {
  // Initialize Hardware Profile Manager
  await hardwareProfileManager.detectProfile();
  console.log('[MAIN] Hardware profile:', hardwareProfileManager.getActiveProfile()?.profileId);
  
  // Initialize Capability Planner
  const capabilityPlanner = new CapabilityPlanner(
    hardwareProfileManager.getActiveProfile() || CANONICAL_PROFILES.LAPTOP,
    {
      txt: { modelName: 'sovereign-300M', modelVersion: 'v0.2.0', parameters: 300_000_000, quantization: 'Q4_K_M', contextWindow: 4096, estimatedFLOPsPerToken: 600_000_000, estimatedRAMGB: 1.5, supportedModalities: ['text'] },
      vis: { modelName: 'mobilevit-xs', modelVersion: 'v1.0.0', parameters: 2_300_000, quantization: 'INT8', contextWindow: 224 * 224 * 3, estimatedFLOPsPerToken: 500_000_000, estimatedRAMGB: 0.1, supportedModalities: ['image'] },
      aud: { modelName: 'whisper-base', modelVersion: 'v1.0.0', parameters: 74_000_000, quantization: 'INT8', contextWindow: 30 * 16000, estimatedFLOPsPerToken: 1_000_000_000, estimatedRAMGB: 0.3, supportedModalities: ['audio'] },
      vid: { modelName: 'uniform-16frame', modelVersion: 'v1.0.0', parameters: 5_000_000, quantization: 'INT8', contextWindow: 16 * 224 * 224 * 3, estimatedFLOPsPerToken: 2_000_000_000, estimatedRAMGB: 0.2, supportedModalities: ['video'] },
      gen: { modelName: 'flux-schnell', modelVersion: 'v1.0.0', parameters: 12_000_000_000, quantization: 'FP16', contextWindow: 1024 * 1024 * 3, estimatedFLOPsPerToken: 10_000_000_000, estimatedRAMGB: 8, supportedModalities: ['image', 'audio', 'video'] }
    },
    {
      ciemRules: [],
      offloadRules: [{ ruleId: 'default-offload', dataTypes: ['public', 'internal'], allowedEndpoints: [], requireEncryption: true, maxFLOPs: 1e13 }],
      safetyConstraints: [],
      privacyConstraints: []
    }
  );
  
  // Initialize SME Modules
  console.log('[MAIN] Initializing SME modules...');
  
  await smeLog.initialize({ storagePath: path.join(MRS_ROOT, 'logs'), retentionDays: 90, compressionEnabled: true, encryptionEnabled: false, maxBundleSizeMb: 100 }).catch(e => console.warn('[SME-LOG] Init failed:', e.message));
  
  // Use available model files (native sme-suite models verified on this host)
  const txtModelPath = path.join(MRS_ROOT, 'models', 'tinyllama-1.1b', 'ggml-model-q4_k_m.bin');
  const visModelPath = path.join(MRS_ROOT, 'sme-suite', 'models', 'mobilenetv2-12.onnx');
  const audModelPath = path.join(MRS_ROOT, 'sme-suite', 'models', 'ggml-base.bin');
  const vidModelPath = path.join(MRS_ROOT, 'models', 'video-uniform.onnx');
  
  // Check if model files exist, use fallbacks if not
  const fs = require('fs');
  const txtModelExists = fs.existsSync(txtModelPath);
  const visModelExists = fs.existsSync(visModelPath);
  const audModelExists = fs.existsSync(audModelPath);
  const vidModelExists = fs.existsSync(vidModelPath);
  
  console.log('[MAIN] Model availability:', { txt: txtModelExists, vis: visModelExists, aud: audModelExists, vid: vidModelExists });
  
  await smeLog.initialize({ storagePath: path.join(MRS_ROOT, 'logs'), retentionDays: 90, compressionEnabled: true, encryptionEnabled: false, maxBundleSizeMb: 100 }).catch(e => console.warn('[SME-LOG] Init failed:', e.message));
  
  await smeTxt.initialize({ 
    modelPath: txtModelExists ? txtModelPath : path.join(MRS_ROOT, 'models', 'sovereign-300M-q4.gguf'), 
    contextLength: 4096, 
    quantization: 'Q4_K_M', 
    threads: 4, 
    gpuLayers: 0, 
    seed: 42,
    cloudClient: cloudAI,
    cloudProvider: process.env.SME_CLOUD_PROVIDER || null,
    cloudModel: process.env.SME_CLOUD_MODEL || null
  }).catch(e => console.warn('[SME-TXT] Init failed (native/llama/cloud unavailable):', e.message));
  
  await smeVis.initialize({ 
    modelPath: visModelExists ? visModelPath : path.join(MRS_ROOT, 'models', 'mobilevit-xs.onnx'), 
    modelType: 'efficientnet', 
    inputSize: { width: 224, height: 224 }, 
    quantization: 'INT8', 
    device: 'cpu',
    cloudClient: cloudAI,
    cloudProvider: process.env.SME_CLOUD_PROVIDER || null,
    cloudModel: process.env.SME_CLOUD_VISION_MODEL || null
  }).catch(e => console.warn('[SME-VIS] Init failed:', e.message));
  
  await smeAud.initialize({ 
    modelPath: audModelExists ? audModelPath : path.join(MRS_ROOT, 'models', 'whisper-base.bin'), 
    modelType: 'whisper-base', 
    quantization: 'INT8', 
    device: 'cpu' 
  }).catch(e => console.warn('[SME-AUD] Init failed:', e.message));
  
  await smeVid.initialize({ 
    modelPath: vidModelExists ? vidModelPath : path.join(MRS_ROOT, 'models', 'video-uniform.onnx'), 
    frameSampler: 'uniform', 
    maxFrames: 16, 
    frameEmbedder: smeVis, 
    temporalAggregator: 'attention', 
    quantization: 'INT8', 
    device: 'cpu' 
  }).catch(e => console.warn('[SME-VID] Init failed:', e.message));
  
  await smeGen.initialize({ 
    offloadEndpoint: 'http://localhost:8000', 
    maxResolution: { width: 1024, height: 1024 }, 
    maxDurationSec: 30, 
    safetyFilters: [],
    cloudClient: cloudAI,
    cloudProvider: process.env.SME_CLOUD_PROVIDER || null,
    cloudModel: process.env.SME_CLOUD_IMAGE_MODEL || null
  }).catch(e => console.warn('[SME-GEN] Init failed:', e.message));
  
  await smeCore.initialize({
    constitutionalRules: [],
    modules: new Map([
      ['sme-txt', smeTxt],
      ['sme-vis', smeVis],
      ['sme-aud', smeAud],
      ['sme-vid', smeVid],
      ['sme-gen', smeGen],
      ['sme-log', smeLog]
    ])
  }).catch(e => console.warn('[SME-CORE] Init failed:', e.message));
  
  await smeLattice.initialize({
    modules: new Map([
      ['sme-txt', smeTxt],
      ['sme-vis', smeVis],
      ['sme-aud', smeAud],
      ['sme-gen', smeGen],
      ['sme-vid', smeVid]
    ]),
    continuityFloor: 0,
    lrcVersion: '1.0'
  }).catch(e => console.warn('[SME-LATTICE] Init failed:', e.message));
  
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'win32') app.quit();
});

// ===== Lemonade API =====
async function lemonadeChat(model, messages, maxTokens = 512) {
  const res = await axios.post(`${LEMONADE_BASE}/chat/completions`, {
    model, messages, max_tokens: maxTokens, stream: false
  }, { timeout: 120000 });
  return res.data.choices[0].message.content;
}

async function lemonadeTTS(model, input, voice = 'shimmer') {
  const res = await axios.post(`${LEMONADE_BASE}/audio/speech`, {
    model, input, voice, response_format: 'mp3'
  }, { responseType: 'arraybuffer', timeout: 60000 });
  return Buffer.from(res.data);
}

async function lemonadeModels() {
  const res = await axios.get(`${LEMONADE_BASE}/models`, { timeout: 10000 });
  return res.data.data || [];
}

// ===== MRS 4D Render =====
function render4d(args = {}) {
  return new Promise((resolve, reject) => {
    if (IS_PACKAGED) {
      reject(new Error('The 4D CLI renderer is not bundled in the packaged build. Use the source workspace instead.'));
      return;
    }
    const surface = args.surface || 'tesseract';
    const width = args.width || 512;
    const height = args.height || 512;
    const frames = args.frames || 1;
    const mode = args.mode || 'wireframe';
    const output = args.output || path.join(MRS_ROOT, 'output', `render-${Date.now()}.png`);

    const child = spawn('npm', ['run', 'render', '--', 
      '--surface', surface,
      '--width', width,
      '--height', height,
      '--frames', frames,
      '--mode', mode,
      '--output', output
    ], { 
      cwd: path.join(MRS_ROOT, '4d-renderer'),
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('error', err => reject(err));
    child.on('close', code => {
      if (code === 0) {
        // CLI creates subdirectory, find actual PNG
        let actualOutput = output;
        if (fs.existsSync(output)) {
          const files = fs.readdirSync(output).filter(f => f.endsWith('.png'));
          if (files.length > 0) {
            actualOutput = path.join(output, files[0]);
          }
        }
        resolve({ output: actualOutput, stdout });
      } else {
        reject(new Error(stderr || `Exit code ${code}`));
      }
    });
  });
}

// ===== IPC Handlers =====
ipcMain.handle('lemonade:chat', async (_, { model, messages, maxTokens }) => {
  try {
    const content = await lemonadeChat(model, messages, maxTokens);
    return { ok: true, content };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('lemonade:tts', async (_, { model, input, voice }) => {
  try {
    const audio = await lemonadeTTS(model, input, voice);
    const b64 = audio.toString('base64');
    return { ok: true, audioBase64: b64 };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('lemonade:models', async () => {
  try {
    const models = await lemonadeModels();
    return { ok: true, models };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('mrs:render', async (_, args) => {
  try {
    const result = await render4d(args);
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('app:open-output', async () => {
  const outputDir = path.join(MRS_ROOT, 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  require('child_process').exec(`start "" "${outputDir}"`);
});

// ===== Cloud AI IPC Handlers =====
ipcMain.handle('cloud:providers', async () => {
  try {
    return { ok: true, providers: cloudAI.getAvailableProviders() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('cloud:set-token', async (_, { provider, token }) => {
  try {
    cloudAI.setToken(provider, token);
    return { ok: true, providers: cloudAI.getAvailableProviders() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('cloud:chat', async (_, { provider, model, messages, maxTokens }) => {
  try {
    const content = await cloudAI.chat(provider, model, messages, { maxTokens });
    return { ok: true, content };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('cloud:generate-image', async (_, { provider, model, prompt, options }) => {
  try {
    const b64 = await cloudAI.generateImage(provider, model, prompt, options);
    return { ok: true, imageBase64: b64 };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('cloud:vision', async (_, { provider, model, prompt, imageBase64, options }) => {
  try {
    const content = await cloudAI.vision(provider, model, prompt, imageBase64, options);
    return { ok: true, content };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('cloud:enhance-render', async (_, { imagePath, options }) => {
  try {
    const result = await cloudAI.enhance4DRender(imagePath, options);
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ===== Director Agent IPC Handlers =====
ipcMain.handle('director:direct', async (_, { intent, options }) => {
  try {
    const result = await director.directScene(intent, options);
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('director:replicate', async (_, { specPath, options }) => {
  try {
    const result = await director.replicateScene(specPath, options);
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('director:list-scenes', async () => {
  try {
    const SCENES_DIR = path.join(MRS_ROOT, 'scenes');
    if (!fs.existsSync(SCENES_DIR)) return { ok: true, scenes: [] };
    const files = fs.readdirSync(SCENES_DIR).filter(f => f.endsWith('.json'));
    const scenes = [];
    for (const f of files) {
      try {
        const spec = JSON.parse(fs.readFileSync(path.join(SCENES_DIR, f), 'utf8'));
        scenes.push({
          file: f,
          intent: spec.intent,
          seed: spec.plan?.seed,
          score: spec.finalScore,
          iterations: spec.iterations,
          createdAt: spec.createdAt,
          finalImage: spec.finalRender,
        });
      } catch (e) {}
    }
    scenes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return { ok: true, scenes };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ===== SME (Sovereign Multimodal Engine) IPC Handlers =====

// Capability Planner
ipcMain.handle('sme:plan', async (_, { intent, media, constraints, privacyLevel }) => {
  try {
    const userRequest = {
      requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      intent,
      modalities: [],
      media,
      constraints,
      privacyLevel: privacyLevel || 'internal',
      timestamp: Date.now()
    };
    // Auto-detect modalities from media
    const modalities = [];
    if (media.text) userRequest.modalities.push('text');
    if (media.images?.length) userRequest.modalities.push('image');
    if (media.audio?.length) userRequest.modalities.push('audio');
    if (media.video?.length) userRequest.modalities.push('video');
    userRequest.modalities = userRequest.modalities.length > 0 ? userRequest.modalities : ['text'];
    
    const plan = await capabilityPlanner.plan(userRequest);
    return { ok: true, plan };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Hardware Profile
ipcMain.handle('sme:hardware-profile', async () => {
  try {
    const profile = hardwareProfileManager.getActiveProfile();
    return { ok: true, profile };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('sme:hardware-profiles', async () => {
  try {
    const profiles = hardwareProfileManager.getAllProfiles();
    return { ok: true, profiles };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('sme:set-hardware-profile', async (_, { profileId }) => {
  try {
    const success = hardwareProfileManager.setActiveProfile(profileId);
    if (success) {
      // Recreate capability planner with new profile
      return { ok: true, profile: hardwareProfileManager.getActiveProfile() };
    }
    return { ok: false, error: 'Profile not found' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// SME Core Execution
ipcMain.handle('sme:execute', async (_, { input }) => {
  try {
    const result = await smeCore.execute(input);
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// SME Module Health
ipcMain.handle('sme:health', async () => {
  try {
    const coreHealth = await smeCore.healthCheck();
    const txtHealth = await smeTxt.healthCheckDetailed();
    const visHealth = await smeVis.healthCheckDetailed();
    const audHealth = await smeAud.healthCheckDetailed();
    const vidHealth = await smeVid.healthCheckDetailed();
    const genHealth = await smeGen.healthCheckDetailed();
    const logHealth = await smeLog.healthCheckDetailed();
    const latticeHealth = await smeLattice.healthCheckDetailed();
    
    return { 
      ok: true, 
      core: coreHealth,
      modules: {
        txt: txtHealth,
        vis: visHealth,
        aud: audHealth,
        vid: vidHealth,
        gen: genHealth,
        log: logHealth
      },
      lattice: latticeHealth
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// SME Module Direct Invocation (native-backed)
ipcMain.handle('sme:txt-generate', async (_, { prompt, maxTokens, temperature, topP, stopSequences }) => {
  try {
    const result = await smeTxt.generate({ prompt, maxTokens, temperature, topP, stopSequences });
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('sme:vis-encode', async (_, { imageBase64, mimeType, extractFeatures }) => {
  try {
    const result = await smeVis.encode({
      imageData: Buffer.from(imageBase64, 'base64'),
      mimeType: mimeType || 'image/png',
      authorityGrant: { permittedModalities: ['image'], constraints: {} },
      extractFeatures
    });
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('sme:aud-transcribe', async (_, { audioBase64, mimeType, options }) => {
  try {
    const result = await smeAud.transcribe({
      audioData: Buffer.from(audioBase64, 'base64'),
      authorityGrant: { permittedModalities: ['audio'], constraints: {} },
      options
    });
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('sme:vid-process', async (_, { preset, inputPath, outputPath, ffmpeg }) => {
  try {
    const result = await smeVid.process({ preset, inputPath, outputPath, ffmpeg });
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('sme:gen-image', async (_, { prompt, width, height, steps, guidanceScale, seed }) => {
  try {
    const result = await smeGen.generateImage({
      prompt,
      width: width || 512,
      height: height || 512,
      steps: steps || 20,
      guidanceScale: guidanceScale || 7.5,
      seed,
      authorityGrant: { permittedModalities: ['image'], constraints: {} }
    });
    return { ok: true, imageBase64: result.imageData.toString('base64'), mimeType: result.mimeType, parameters: result.parameters };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// SME Log (Evidence, Replay, Audit)
ipcMain.handle('sme:evidence', async (_, { evidenceId }) => {
  try {
    const evidence = await smeLog.getEvidence(evidenceId);
    return { ok: true, evidence };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('sme:decision', async (_, { decisionId }) => {
  try {
    const decision = await smeLog.getDecision(decisionId);
    return { ok: true, decision };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('sme:trace', async (_, { chainId }) => {
  try {
    const trace = await smeLog.getTrace(chainId);
    return { ok: true, trace };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('sme:replay', async (_, { chainId, options }) => {
  try {
    const result = await smeLog.replay(chainId, options);
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('sme:audit', async (_, { query }) => {
  try {
    const results = await smeLog.queryAudit(query || {});
    return { ok: true, results };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('sme:audit-report', async (_, { chainId }) => {
  try {
    const report = await smeLog.generateReport(chainId);
    return { ok: true, report };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// SME Capability Planner
ipcMain.handle('sme:capability-plan', async (_, { userRequest }) => {
  try {
    const plan = await capabilityPlanner.plan(userRequest);
    return { ok: true, plan };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// SME Hardware Profile Matching
ipcMain.handle('sme:match-plan', async (_, { plan }) => {
  try {
    const result = hardwareProfileManager.matchCapabilityPlan(plan);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('sme:profile-recommendations', async (_, { plan }) => {
  try {
    const recs = hardwareProfileManager.getRecommendations(plan);
    return { ok: true, recommendations: recs };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// SME Lattice (LRC constitutional routing over the 5 SME substrates)
ipcMain.handle('sme:lattice-route', async (_, { request }) => {
  try {
    if (!smeLattice.initialized) return { ok: false, error: 'SME-LATTICE not initialized' };
    const response = await smeLattice.call({
      originNodeId: request?.originNodeId || 'sme-core',
      targetNodeId: request?.targetNodeId,
      actorId: request?.actorId || 'operator',
      action: request?.action,
      context: request?.context || {},
      payload: request?.payload || {}
    });
    return { ok: true, response };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('sme:lattice-replay', async (_, { requestId }) => {
  try {
    const record = smeLattice.getReplayRecord(requestId);
    return record ? { ok: true, record: record.toJSON ? record.toJSON() : record } : { ok: false, error: `no replay record for '${requestId}'` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ===== DEP (DirectorExecutionPlan) IPC Handlers =====
ipcMain.handle('dep:compile', async (_, { intent, options }) => {
  try {
    const dep = await depCompiler.compile(intent, options);
    return { ok: true, dep };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('dep:execute', async (_, { dep }) => {
  try {
    const result = await depScheduler.execute(dep);
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('dep:compile-and-execute', async (_, { intent, options }) => {
  try {
    const dep = await depCompiler.compile(intent, options);
    const result = await depScheduler.execute(dep);
    return { ok: true, dep, ...result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('dep:status', async (_, { executionId }) => {
  try {
    const status = depScheduler.getExecutionStatus(executionId);
    return { ok: true, status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('dep:templates', async () => {
  try {
    return { ok: true, templates: depCompiler.listTemplates() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});