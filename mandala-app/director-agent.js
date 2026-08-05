/**
 * Director Agent — LLM directs 4D scene, renders, enhances via diffusion, replicates
 * 
 * Workflow:
 * 1. User gives high-level intent: "cyberpunk tesseract city at night"
 * 2. Director LLM plans: picks surface, camera, lighting, materials, diffusion prompt
 * 3. MRS renders base 4D geometry
 * 4. Vision LLM analyzes render
 * 5. Director refines diffusion prompt
 * 6. Cloud diffusion (img2img/ControlNet) enhances
 * 7. Loop until Director approves
 * 8. Save SceneSpec (reproducible: all params, prompts, seeds, model versions)
 */

const { CloudAIClient } = require('./cloud-ai-client');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const MRS_ROOT = path.join(__dirname, '..');
const OUTPUT_DIR = path.join(MRS_ROOT, 'output');
const SCENES_DIR = path.join(MRS_ROOT, 'scenes');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(SCENES_DIR, { recursive: true });

class DirectorAgent {
  constructor(cloudAI) {
    this.cloudAI = cloudAI;
    this.sceneHistory = [];
  }

  // ---------- STEP 1: Director plans the scene ----------
  async planScene(userIntent, provider = 'openrouter', textModel = 'llama-3.1-8b-free') {
    const systemPrompt = `You are a 4D Scene Director for the Mandala Rendering System.
You output a JSON ScenePlan that the renderer can execute.

Available 4D surfaces:
- tesseract: 4D hypercube, great for geometric/architectural structures
- clifford-torus: Clifford torus, organic flowing forms
- hopf: Hopf fibration, complex fiber structures
- gyroid: Triply periodic minimal surface, organic/biological
- hypertorus: Higher-genus torus, complex topology

Render parameters:
- mode: "wireframe" | "solid"
- width/height: 512-2048 (multiples of 64)
- camera: { position: [x,y,z], target: [x,y,z], fov: 45-90 }
- lighting: "ambient" | "directional" | "volumetric"
- material: "matte" | "metallic" | "glass" | "emissive" | "subsurface"

Diffusion enhancement:
- prompt: detailed Flux/SDXL prompt for img2img
- negative_prompt: what to avoid
- strength: 0.3-0.8 (how much to change base render)
- controlnet: "canny" | "depth" | "none"

Output ONLY valid JSON:
{
  "intent": "user's original intent",
  "surface": "tesseract|clifford-torus|hopf|gyroid|hypertorus",
  "render": {
    "mode": "wireframe|solid",
    "width": 1024,
    "height": 1024,
    "camera": { "position": [0,0,5], "target": [0,0,0], "fov": 60 },
    "lighting": "volumetric",
    "material": "metallic"
  },
  "diffusion": {
    "prompt": "detailed enhancement prompt",
    "negative_prompt": "blurry, low quality, distorted geometry",
    "strength": 0.6,
    "controlnet": "depth"
  },
  "seed": 12345,
  "notes": "director's reasoning"
}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Create a ScenePlan for: "${userIntent}"` }
    ];

    const response = await this.cloudAI.chat(provider, textModel, messages, { maxTokens: 1024 });
    
    try {
      const plan = JSON.parse(response);
      plan.seed = plan.seed || Math.floor(Math.random() * 1000000);
      plan.createdAt = new Date().toISOString();
      return { ok: true, plan };
    } catch (e) {
      return { ok: false, error: `Failed to parse ScenePlan: ${e.message}`, raw: response };
    }
  }

  // ---------- STEP 2: Execute 4D render ----------
  async renderBase(plan) {
    return new Promise((resolve, reject) => {
      const output = path.join(OUTPUT_DIR, `base-${plan.surface}-${plan.seed}.png`);
      
      const child = spawn('npm', ['run', 'render', '--',
        '--surface', plan.surface,
        '--mode', plan.render.mode,
        '--width', plan.render.width,
        '--height', plan.render.height,
        '--output', output
      ], {
        cwd: path.join(MRS_ROOT, '4d-renderer'),
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stderr = '';
      child.stderr.on('data', d => stderr += d);
      child.on('close', code => {
        if (code === 0) {
          resolve({ ok: true, output, plan });
        } else {
          reject(new Error(stderr || `Render exit code ${code}`));
        }
      });
    });
  }

  // ---------- STEP 3: Vision analyzes render ----------
  async analyzeRender(imagePath, provider, visionModel) {
    const imageBase64 = fs.readFileSync(imagePath).toString('base64');
    const prompt = `Analyze this 4D geometry render in detail:
- What 4D surface is visible? (tesseract, clifford-torus, etc.)
- Composition: camera angle, framing, depth
- Lighting: type, direction, quality, shadows
- Materials: apparent surface properties (matte, metallic, glass, emissive)
- Mood/atmosphere: colors, contrast, spatial feeling
- Geometric fidelity: clean edges, proper projection, artifacts
- What would make this more compelling for a final image?

Be specific and technical. This guides the diffusion enhancement.`;

    return this.cloudAI.vision(provider, visionModel, prompt, imageBase64);
  }

  // ---------- STEP 4: Director refines diffusion prompt ----------
  async refineDiffusionPrompt(analysis, originalIntent, plan, provider, textModel) {
    const systemPrompt = `You are a 4D Scene Director refining a diffusion prompt.
Given the vision analysis of the base render and the original intent, write an optimized img2img prompt for Flux/SDXL.

The base render is 4D geometry. The diffusion should enhance it toward the artistic vision while preserving the 4D structure.

Output ONLY JSON:
{
  "prompt": "optimized Flux/SDXL prompt (under 500 chars)",
  "negative_prompt": "what to avoid",
  "strength": 0.3-0.8,
  "controlnet": "canny|depth|none",
  "reasoning": "why these choices"
}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Original intent: "${originalIntent}"

Base render analysis:
${analysis}

Current diffusion plan:
${JSON.stringify(plan.diffusion, null, 2)}

Refine the diffusion prompt for the next iteration.` }
    ];

    const response = await this.cloudAI.chat(provider, textModel, messages, { maxTokens: 512 });
    
    try {
      return { ok: true, ...JSON.parse(response) };
    } catch (e) {
      return { ok: false, error: e.message, raw: response };
    }
  }

  // ---------- STEP 5: Cloud diffusion enhances ----------
  async enhanceWithDiffusion(baseImagePath, diffusionParams, provider, imageModel) {
    // For now, use text-to-image with the refined prompt
    // TODO: Implement img2img via Hugging Face ControlNet endpoints
    const prompt = diffusionParams.prompt;
    
    const enhancedBase64 = await this.cloudAI.generateImage(provider, imageModel, prompt, {
      width: 1024,
      height: 1024,
      steps: 25,
    });

    const output = path.join(OUTPUT_DIR, `enhanced-${Date.now()}.png`);
    fs.writeFileSync(output, Buffer.from(enhancedBase64, 'base64'));
    
    return { ok: true, output, enhancedBase64 };
  }

  // ---------- STEP 6: Director approves or iterates ----------
  async evaluateResult(enhancedImagePath, originalIntent, plan, provider, visionModel) {
    const imageBase64 = fs.readFileSync(enhancedImagePath).toString('base64');
    const prompt = `Evaluate this enhanced 4D scene against the original intent.

Original intent: "${originalIntent}"
Scene plan: ${JSON.stringify(plan, null, 2)}

Rate 1-10 on:
- Intent fidelity: Does it match the user's vision?
- 4D geometry preservation: Is the 4D structure still recognizable?
- Artistic quality: Lighting, composition, materials, mood
- Technical execution: Sharpness, artifacts, coherence

Output ONLY JSON:
{
  "score": 1-10,
  "passes": true/false,
  "critique": "specific feedback",
  "suggestions": ["what to improve for next iteration"]
}`;

    const response = await this.cloudAI.vision(provider, visionModel, prompt, imageBase64);
    
    try {
      return { ok: true, ...JSON.parse(response) };
    } catch (e) {
      return { ok: false, error: e.message, raw: response };
    }
  }

  // ---------- MAIN ORCHESTRATION ----------
  async directScene(userIntent, options = {}) {
    const {
      provider = 'openrouter',
      textModel = 'llama-3.1-8b-free',
      visionModel = 'qwen-vl-free',
      imageModel = 'flux',
      maxIterations = 3,
      minScore = 7,
    } = options;

    const log = (msg, type = 'info') => {
      const entry = { timestamp: new Date().toISOString(), type, msg };
      this.sceneHistory.push(entry);
      console.log(`[Director] ${msg}`);
    };

    log(`Starting direction for: "${userIntent}"`);

    // 1. Plan
    log('Planning scene...');
    const planResult = await this.planScene(userIntent, provider, textModel);
    if (!planResult.ok) return { ok: false, error: planResult.error };
    let plan = planResult.plan;
    log(`Plan: ${plan.surface} ${plan.render.mode} ${plan.render.width}x${plan.render.height}`);

    // 2. Base render
    log('Rendering base 4D geometry...');
    const renderResult = await this.renderBase(plan);
    const baseImagePath = renderResult.output;
    log(`Base render: ${baseImagePath}`);

    // 3. Initial analysis
    log('Analyzing base render...');
    const analysisResult = await this.analyzeRender(baseImagePath, provider, visionModel);
    if (!analysisResult.ok) return { ok: false, error: analysisResult.error };
    let analysis = analysisResult;
    log(`Analysis: ${analysis.substring(0, 100)}...`);

    // 4. Iterative enhancement loop
    let currentImagePath = baseImagePath;
    let iteration = 0;
    let finalScore = 0;

    while (iteration < maxIterations) {
      iteration++;
      log(`Iteration ${iteration}/${maxIterations}`);

      // Refine diffusion prompt
      log('Refining diffusion prompt...');
      const refineResult = await this.refineDiffusionPrompt(analysis, userIntent, plan, provider, textModel);
      if (!refineResult.ok) return { ok: false, error: refineResult.error };
      plan.diffusion = { ...plan.diffusion, ...refineResult };
      log(`Refined prompt: ${plan.diffusion.prompt.substring(0, 80)}...`);

      // Enhance with diffusion
      log('Running diffusion enhancement...');
      const enhanceResult = await this.enhanceWithDiffusion(currentImagePath, plan.diffusion, provider, imageModel);
      if (!enhanceResult.ok) return { ok: false, error: enhanceResult.error };
      currentImagePath = enhanceResult.output;
      log(`Enhanced: ${currentImagePath}`);

      // Evaluate
      log('Evaluating result...');
      const evalResult = await this.evaluateResult(currentImagePath, userIntent, plan, provider, visionModel);
      if (!evalResult.ok) return { ok: false, error: evalResult.error };
      
      finalScore = evalResult.score;
      log(`Score: ${finalScore}/10 - ${evalResult.critique}`);

      if (evalResult.passes && finalScore >= minScore) {
        log('Director approves! Scene complete.');
        break;
      }

      // Re-analyze for next iteration
      analysis = await this.analyzeRender(currentImagePath, provider, visionModel);
      if (!analysis.ok) return { ok: false, error: analysis.error };
    }

    // 5. Save reproducible SceneSpec
    const sceneSpec = {
      version: '1.0',
      intent: userIntent,
      plan,
      baseRender: baseImagePath,
      finalRender: currentImagePath,
      iterations,
      finalScore,
      history: this.sceneHistory,
      models: { provider, textModel, visionModel, imageModel },
      createdAt: new Date().toISOString(),
    };

    const specPath = path.join(SCENES_DIR, `scene-${plan.seed}-${Date.now()}.json`);
    fs.writeFileSync(specPath, JSON.stringify(sceneSpec, null, 2));
    log(`SceneSpec saved: ${specPath}`);

    return {
      ok: true,
      sceneSpec,
      baseImage: baseImagePath,
      finalImage: currentImagePath,
      score: finalScore,
      iterations,
      specPath,
    };
  }

  // ---------- REPLICATE A SCENE ----------
  async replicateScene(specPath, options = {}) {
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
    const { plan, models } = spec;
    
    // Allow overriding models/params
    const mergedOptions = { ...models, ...options };
    
    log(`Replicating scene ${spec.seed}...`);
    
    // Re-render with same seed
    const renderResult = await this.renderBase(plan);
    const baseImagePath = renderResult.output;

    // Re-run diffusion with same params
    const enhanceResult = await this.enhanceWithDiffusion(baseImagePath, plan.diffusion, 
      mergedOptions.provider, mergedOptions.imageModel);
    
    return {
      ok: true,
      baseImage: baseImagePath,
      finalImage: enhanceResult.output,
      specPath,
    };
  }
}

module.exports = { DirectorAgent };

// CLI test
if (require.main === module) {
  (async () => {
    const cloudAI = new CloudAIClient();
    const director = new DirectorAgent(cloudAI);
    
    const providers = cloudAI.getAvailableProviders();
    console.log('Available:', providers.map(p => p.name).join(', '));
    
    if (providers.length > 0) {
      const result = await director.directScene('A cyberpunk tesseract city floating in neon-lit void, volumetric fog, reflective surfaces', {
        provider: providers[0].id,
        maxIterations: 2,
      });
      console.log('Result:', result.ok ? 'SUCCESS' : 'FAILED', result);
    }
  })();
}