/**
 * lemonade-client.mjs — Lemonade LocalAI client for ChatGPT tool calls
 * 
 * Provides simplified access to Lemonade LocalAI endpoints:
 * - Image generation (txt2img)
 * - Image editing/enhancement (img2img / diffusion)
 * - Transcriptions, speech, etc.
 */

import fetch from "node-fetch";

export function createClient(options = {}) {
  const baseUrl = options.baseUrl || "http://localhost:13305";
  const apiKey = options.apiKey || "lemonade"; // Lemonade accepts unauthenticated localhost calls

  /**
   * Image generation (txt2img)
   */
  async function generateImage(params) {
    const body = {
      model: params.model || "SD-Turbo",
      prompt: params.prompt,
      size: params.size || "512x512",
      steps: params.steps || 4,
      cfg_scale: params.cfg_scale ?? 1.0,
      response_format: "b64_json",
    };
    const response = await fetch(`${baseUrl}/v1/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Lemonade generate failed: ${response.status} ${errText}`);
    }
    return response.json();
  }

  /**
   * Image editing/enhancement (img2img / diffusion of existing image)
   * Takes an existing image file path and a prompt to guide the diffusion.
   */
  async function imagesEdit(params) {
    const imageFile = params.image;
    const prompt = params.prompt || "";
    const steps = params.steps || 4;
    const size = params.size || "512x512";
    const model = params.model || "SD-Turbo";

    // Read and base64-encode the input image
    const imgBuffer = await Bun.file(imageFile).arrayBuffer();
    const b64Image = Buffer.from(imgBuffer).toString("base64");

    const body = {
      model,
      prompt,
      image: b64Image,
      size,
      steps,
      response_format: "b64_json",
    };

    const response = await fetch(`${baseUrl}/v1/images/edits`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Lemonade edit failed: ${response.status} ${errText}`);
    }
    return response.json();
  }

  /**
   * Variants generation (img2img variations)
   */
  async function imagesVariations(params) {
    const imageFile = params.image;
    const steps = params.steps || 4;
    const size = params.size || "512x512";
    const model = params.model || "SD-Turbo";

    const imgBuffer = await Bun.file(imageFile).arrayBuffer();
    const b64Image = Buffer.from(imgBuffer).toString("base64");

    const body = {
      model,
      image: b64Image,
      size,
      steps,
      response_format: "b64_json",
    };

    const response = await fetch(`${baseUrl}/v1/images/variations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Lemonade variations failed: ${response.status} ${errText}`);
    }
    return response.json();
  }

  return {
    generateImage,
    imagesEdit,
    imagesVariations,
  };
}

export default createClient;