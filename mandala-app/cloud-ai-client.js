/**
 * Unified Cloud AI Client for Mandala Renderer
 * Supports: Hugging Face Inference API, GitHub Models, OpenRouter
 * All free tiers, OpenAI-compatible where possible
 */

const axios = require('axios');

class CloudAIClient {
  constructor() {
    this.providers = {
      huggingface: {
        name: 'Hugging Face Inference API',
        baseURL: 'https://api-inference.huggingface.co/models',
        envKey: 'HF_TOKEN',
        models: {
          // Text-to-Image
          'sdxl': 'stabilityai/stable-diffusion-xl-base-1.0',
          'sdxl-turbo': 'stabilityai/sdxl-turbo',
          'flux-schnell': 'black-forest-labs/FLUX.1-schnell',
          'flux-dev': 'black-forest-labs/FLUX.1-dev',
          // Image-to-Image / ControlNet
          'sdxl-img2img': 'stabilityai/stable-diffusion-xl-refiner-1.0',
          'controlnet-canny': 'lllyasviel/controlnet-canny-sdxl-1.0',
          'controlnet-depth': 'lllyasviel/controlnet-depth-sdxl-1.0',
          // Vision LLMs
          'qwen-vl': 'Qwen/Qwen2.5-VL-7B-Instruct',
          'llava': 'llava-hf/llava-1.5-7b-hf',
          'llama-vision': 'meta-llama/Llama-3.2-11B-Vision-Instruct',
        },
        headers: (token) => ({
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        }),
        free: true,
        rateLimit: '~30 req/min',
      },
      github: {
        name: 'GitHub Models',
        baseURL: 'https://models.inference.ai.azure.com',
        envKey: 'GITHUB_TOKEN',
        models: {
          // Text-to-Image (limited)
          'flux': 'flux-1-1-pro',
          'dalle3': 'dall-e-3',
          // LLMs with vision
          'gpt-4o': 'gpt-4o',
          'gpt-4o-mini': 'gpt-4o-mini',
          'llama-3.2-90b-vision': 'Llama-3.2-90B-Vision-Instruct',
          'llama-3.2-11b-vision': 'Llama-3.2-11B-Vision-Instruct',
          'phi-3.5-vision': 'Phi-3.5-vision-instruct',
        },
        headers: (token) => ({
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        }),
        free: true,
        rateLimit: 'Personal use',
        openaiCompatible: true,
      },
      openrouter: {
        name: 'OpenRouter',
        baseURL: 'https://openrouter.ai/api/v1',
        envKey: 'OPENROUTER_KEY',
        models: {
          // Free vision models
          'qwen-vl-free': 'qwen/qwen2.5-vl-7b-instruct:free',
          'llava-free': 'liquid/llava-1.5-7b-hf:free',
          'nemotron-vision-free': 'nvidia/nemotron-3-ultra:free',
          // Free text models
          'llama-3.1-8b-free': 'meta-llama/llama-3.1-8b-instruct:free',
          'mistral-7b-free': 'mistralai/mistral-7b-instruct:free',
          'qwen-2.5-7b-free': 'qwen/qwen-2.5-7b-instruct:free',
          'phi-3-mini-free': 'microsoft/phi-3-mini-128k-instruct:free',
          // Paid but cheap vision
          'gpt-4o-mini': 'openai/gpt-4o-mini',
          'claude-3.5-haiku': 'anthropic/claude-3.5-haiku',
        },
        headers: (token) => ({
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://mandala-renderer.local',
          'X-Title': 'Mandala Renderer',
        }),
        free: true,
        rateLimit: 'Generous',
        openaiCompatible: true,
      },
      pollinations: {
        name: 'Pollinations.ai',
        baseURL: 'https://image.pollinations.ai',
        envKey: null,
        noKey: true,
        models: {
          'flux': 'flux',
          'gpt4o': 'gpt-4o',
          'sdxl': 'sdxl',
          'midjourney': 'midjourney',
        },
        free: true,
        rateLimit: 'Unlimited',
        noKey: true,
      },
      nvidia: {
        name: 'NVIDIA API Catalog',
        baseURL: 'https://integrate.api.nvidia.com/v1',
        envKey: 'NVIDIA_API_KEY',
        models: {
          // NVIDIA Nemotron models
          'nemotron-3-ultra': 'nvidia/nemotron-3-ultra',
          'nemotron-4-340b': 'nvidia/nemotron-4-340b-instruct',
          'nemotron-4-ultra': 'nvidia/nemotron-4-ultra',
          // Cosmos world models
          'cosmos-1.0': 'nvidia/cosmos-1.0',
          // Vision models
          'vila': 'nvidia/vila',
          'neva-22b': 'nvidia/neva-22b',
          // Audio/Video
          'nemo-tts': 'nvidia/nemo-tts',
          'nemo-asr': 'nvidia/nemo-asr',
          // Embeddings
          'nemo-embedding': 'nvidia/nemo-embedding-3b',
        },
        headers: (token) => ({
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        }),
        free: true,
        rateLimit: 'Generous (NVIDIA API Catalog)',
        openaiCompatible: true,
      },
      replicate: {
        name: 'Replicate',
        baseURL: 'https://api.replicate.com/v1',
        envKey: 'REPLICATE_TOKEN',
        models: {
          'flux': 'black-forest-labs/flux-schnell',
          'flux-pro': 'black-forest-labs/flux-pro',
          'sdxl': 'stability-ai/sdxl',
          'sdxl-turbo': 'stability-ai/sdxl-turbo',
          'stable-video': 'stability-ai/stable-video-diffusion',
          'controlnet-canny': 'rossjillian/controlnet-canny',
          'controlnet-depth': 'rossjillian/controlnet-depth',
          'esrgan': 'caoyue/esrgan',
          'gfpgan': 'tencentarc/gfpgan',
        },
        headers: (token) => ({
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json',
        }),
        free: true,
        rateLimit: '$10 free credits (~500 images)',
        replicate: true,
      },
      fal: {
        name: 'Fal.ai',
        baseURL: 'https://fal.run',
        envKey: 'FAL_KEY',
        models: {
          'flux-pro': 'fal-ai/flux-pro',
          'flux-schnell': 'fal-ai/flux-schnell',
          'flux-lora': 'fal-ai/flux-lora',
          'sdxl': 'fal-ai/sdxl',
          'sdxl-lightning': 'fal-ai/sdxl-lightning',
          'controlnet-canny': 'fal-ai/controlnet-canny',
          'controlnet-depth': 'fal-ai/controlnet-depth',
          'stable-video': 'fal-ai/stable-video-diffusion',
          'esrgan': 'fal-ai/esrgan',
        },
        headers: (token) => ({
          'Authorization': `Key ${token}`,
          'Content-Type': 'application/json',
        }),
        free: true,
        rateLimit: 'Generous daily limit',
        fal: true,
      },
    };

    this.tokens = {};
    this.loadTokens();
  }

  loadTokens() {
    for (const [id, provider] of Object.entries(this.providers)) {
      const token = process.env[provider.envKey];
      if (token) {
        this.tokens[id] = token;
        console.log(`[CloudAI] ${provider.name}: token loaded`);
      } else {
        console.log(`[CloudAI] ${provider.name}: no token (set ${provider.envKey})`);
      }
    }
  }

  setToken(providerId, token) {
    if (this.providers[providerId]) {
      this.tokens[providerId] = token;
      process.env[this.providers[providerId].envKey] = token;
    }
  }

  getAvailableProviders() {
    return Object.entries(this.providers)
      .filter(([id]) => this.tokens[id])
      .map(([id, p]) => ({ id, name: p.name, models: Object.keys(p.models), free: p.free }));
  }

  // ---------- TEXT GENERATION (OpenAI-compatible) ----------
  async chat(providerId, modelKey, messages, options = {}) {
    const provider = this.providers[providerId];
    const token = this.tokens[providerId];
    if (!token) throw new Error(`No token for ${providerId}. Set ${provider.envKey}`);

    const model = provider.models[modelKey] || modelKey;
    const isOpenAICompat = provider.openaiCompatible;

    const url = isOpenAICompat
      ? `${provider.baseURL}/chat/completions`
      : `${provider.baseURL}/${model}`;

    const payload = isOpenAICompat
      ? { model, messages, max_tokens: options.maxTokens || 512, temperature: options.temperature || 0.7, stream: false }
      : { inputs: messages.map(m => m.content).join('\n'), parameters: { max_new_tokens: options.maxTokens || 512 } };

    const res = await axios.post(url, payload, {
      headers: provider.headers(token),
      timeout: options.timeout || 120000,
    });

    if (isOpenAICompat) {
      return res.data.choices[0].message.content;
    } else {
      // HF returns array of {generated_text}
      return res.data[0]?.generated_text || res.data.generated_text || JSON.stringify(res.data);
    }
  }

  // ---------- IMAGE GENERATION ----------
  async generateImage(providerId, modelKey, prompt, options = {}) {
    const provider = this.providers[providerId];
    const token = this.tokens[providerId];
    if (!token) throw new Error(`No token for ${providerId}. Set ${provider.envKey}`);

    const model = provider.models[modelKey] || modelKey;
    const isOpenAICompat = provider.openaiCompatible;
    const isReplicate = provider.replicate;
    const isFal = provider.fal;

    if (isOpenAICompat && !isReplicate && !isFal) {
      // GitHub Models / OpenRouter - use DALL-E or Flux via chat/completions with image generation
      // Note: OpenRouter image gen varies by model; GitHub uses dall-e-3
      const url = `${provider.baseURL}/images/generations`;
      const payload = {
        model,
        prompt,
        n: 1,
        size: options.size || '1024x1024',
        response_format: 'b64_json',
        quality: options.quality || 'standard',
      };
      const res = await axios.post(url, payload, {
        headers: provider.headers(token),
        timeout: options.timeout || 180000,
      });
      return res.data.data[0].b64_json;
    } else if (isReplicate) {
      // Replicate API
      const url = `${provider.baseURL}/predictions`;
      const payload = {
        version: model,
        input: {
          prompt,
          width: options.width || 1024,
          height: options.height || 1024,
          num_inference_steps: options.steps || 20,
          guidance_scale: options.guidance || 7.5,
        },
      };
      const res = await axios.post(url, payload, {
        headers: provider.headers(token),
        timeout: options.timeout || 180000,
      });
      
      // Poll for completion
      let prediction = res.data;
      const pollUrl = `${provider.baseURL}/predictions/${prediction.id}`;
      
      while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
        await new Promise(r => setTimeout(r, 2000));
        const pollRes = await axios.get(pollUrl, { headers: provider.headers(token) });
        prediction = pollRes.data;
      }
      
      if (prediction.status === 'failed') {
        throw new Error(`Replicate prediction failed: ${prediction.error}`);
      }
      
      // Output is array of URLs
      const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
      const imgRes = await axios.get(outputUrl, { responseType: 'arraybuffer', timeout: 30000 });
      return Buffer.from(imgRes.data).toString('base64');
    } else if (isFal) {
      // Fal.ai API
      const url = `${provider.baseURL}/${model}`;
      const payload = {
        prompt,
        image_size: options.size || '1024x1024',
        num_inference_steps: options.steps || 20,
        guidance_scale: options.guidance || 7.5,
      };
      const res = await axios.post(url, payload, {
        headers: provider.headers(token),
        timeout: options.timeout || 180000,
      });
      
      // Fal returns { images: [{ url: "..." }] }
      const outputUrl = res.data.images?.[0]?.url || res.data.url;
      if (!outputUrl) throw new Error('No image URL in Fal response');
      
      const imgRes = await axios.get(outputUrl, { responseType: 'arraybuffer', timeout: 30000 });
      return Buffer.from(imgRes.data).toString('base64');
    } else {
      // Hugging Face - direct model inference
      const url = `${provider.baseURL}/${model}`;
      const payload = {
        inputs: prompt,
        parameters: {
          num_inference_steps: options.steps || 20,
          guidance_scale: options.guidance || 7.5,
          width: options.width || 1024,
          height: options.height || 1024,
        },
      };
      const res = await axios.post(url, payload, {
        headers: provider.headers(token),
        responseType: 'arraybuffer',
        timeout: options.timeout || 180000,
      });
      return Buffer.from(res.data).toString('base64');
    }
  }

  // ---------- IMAGE-TO-IMAGE / CONTROLNET ----------
  async imageToImage(providerId, modelKey, prompt, imageBase64, options = {}) {
    const provider = this.providers[providerId];
    const token = this.tokens[providerId];
    if (!token) throw new Error(`No token for ${providerId}`);

    const model = provider.models[modelKey] || modelKey;
    const isOpenAICompat = provider.openaiCompatible;

    if (isOpenAICompat) {
      // OpenRouter supports some img2img via specific models
      // GitHub Models doesn't support img2img directly
      throw new Error('img2img not supported on this provider via OpenAI compat');
    } else {
      // Hugging Face - ControlNet / img2img
      const url = `${provider.baseURL}/${model}`;
      const payload = {
        inputs: prompt,
        parameters: {
          num_inference_steps: options.steps || 20,
          guidance_scale: options.guidance || 7.5,
          width: options.width || 1024,
          height: options.height || 1024,
        },
        // HF img2img expects image in inputs as base64 or URL
        // For ControlNet, use specific model endpoints
      };
      // This varies by model - simplified
      const res = await axios.post(url, payload, {
        headers: provider.headers(token),
        responseType: 'arraybuffer',
        timeout: options.timeout || 180000,
      });
      return Buffer.from(res.data).toString('base64');
    }
  }

  // ---------- VISION (Image + Text) ----------
  async vision(providerId, modelKey, prompt, imageBase64, options = {}) {
    const provider = this.providers[providerId];
    const token = this.tokens[providerId];
    if (!token) throw new Error(`No token for ${providerId}`);

    const model = provider.models[modelKey] || modelKey;
    const isOpenAICompat = provider.openaiCompatible;

    if (!isOpenAICompat) {
      // Hugging Face vision models
      const url = `${provider.baseURL}/${model}`;
      const payload = {
        inputs: {
          text: prompt,
          image: imageBase64,
        },
      };
      const res = await axios.post(url, payload, {
        headers: provider.headers(token),
        timeout: options.timeout || 60000,
      });
      return res.data[0]?.generated_text || res.data.generated_text || JSON.stringify(res.data);
    } else {
      // OpenRouter / GitHub Models - OpenAI vision format
      const url = `${provider.baseURL}/chat/completions`;
      const payload = {
        model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } }
          ]
        }],
        max_tokens: options.maxTokens || 512,
        temperature: options.temperature || 0.7,
      };
      const res = await axios.post(url, payload, {
        headers: provider.headers(token),
        timeout: options.timeout || 60000,
      });
      return res.data.choices[0].message.content;
    }
  }

  // ---------- HIGH-LEVEL PIPELINE ----------
  /**
   * Full pipeline: 4D render -> LLM prompt enhance -> Cloud image gen -> enhanced image
   */
  async enhance4DRender(baseImagePath, options = {}) {
    const {
      provider = 'openrouter',
      visionModel = 'qwen-vl-free',
      textModel = 'llama-3.1-8b-free',
      imageModel = 'flux',
      prompt = 'Enhance this 4D geometry render into a photorealistic sci-fi structure with volumetric lighting, detailed materials, and atmospheric environment',
    } = options;

    const fs = require('fs');
    const imageBase64 = fs.readFileSync(baseImagePath).toString('base64');

    // Step 1: Vision model analyzes the 4D render
    console.log('[Pipeline] Analyzing 4D render with vision model...');
    const analysis = await this.vision(provider, visionModel, 
      'Describe this 4D geometry render in detail: shapes, composition, lighting, mood. Be specific.',
      imageBase64
    );

    // Step 2: Text LLM creates enhanced prompt
    console.log('[Pipeline] Generating enhanced prompt...');
    const enhancedPrompt = await this.chat(provider, textModel, [
      { role: 'system', content: 'You are a prompt engineer for Stable Diffusion/Flux. Create detailed, high-quality prompts.' },
      { role: 'user', content: `Base analysis: ${analysis}\n\nUser direction: ${prompt}\n\nWrite a detailed Flux/SDXL prompt (under 500 chars) for img2img enhancement.` }
    ]);

    // Step 3: Generate enhanced image
    console.log('[Pipeline] Generating enhanced image...');
    const enhancedBase64 = await this.generateImage(provider, imageModel, enhancedPrompt, {
      width: 1024,
      height: 1024,
      steps: 20,
    });

    return {
      analysis,
      enhancedPrompt,
      enhancedImageBase64: enhancedBase64,
      provider,
    };
  }
}

module.exports = { CloudAIClient };

// CLI test
if (require.main === module) {
  (async () => {
    const client = new CloudAIClient();
    console.log('Available:', client.getAvailableProviders());
    
    // Test with first available provider
    const providers = client.getAvailableProviders();
    if (providers.length > 0) {
      const p = providers[0];
      console.log(`Testing ${p.name}...`);
      try {
        const resp = await client.chat(p.id, Object.keys(client.providers[p.id].models)[0], 
          [{ role: 'user', content: 'Say hello in one sentence.' }]);
        console.log('Chat response:', resp);
      } catch (e) {
        console.error('Error:', e.message);
      }
    }
  })();
}