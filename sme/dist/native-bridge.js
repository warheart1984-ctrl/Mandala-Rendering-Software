/**
 * SME Native Bridge
 * Locates the verified sme-suite native CLIs (sme_txt, sme_vis, sme_aud, sme_gen, sme_vid)
 * and spawns them under the JSON bundle contract:
 *   - success JSON  -> stdout  ({"ok": true, ...})
 *   - contract block -> stderr ({"ok": false, "violation": "...", ...}), exit 1
 *
 * The JS SME modules use this bridge as their primary backend, falling back to
 * cloud providers (via CloudAIClient) when the native binary or model is absent.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// sme-suite lives one level above sme/dist (repo root/sme-suite).
const SUITE_DIR = path.join(__dirname, '..', '..', 'sme-suite');
const BUILD_DIR = path.join(SUITE_DIR, 'build', 'modules');

const VID_DLL_DIR = path.join(SUITE_DIR, 'modules', 'sme-vid', 'bin', 'Release', 'net10.0');
const VID_DLL = path.join(VID_DLL_DIR, 'sme_vid.dll');
const VID_EXE = path.join(VID_DLL_DIR, 'sme_vid.exe');

/**
 * Resolve the native exe for a module ('sme-txt' -> build/modules/sme-txt/sme_txt.exe).
 * Returns the path if it exists, else null.
 */
function moduleExePath(moduleId) {
  const name = moduleId.replace('sme-', '');
  const p = path.join(BUILD_DIR, moduleId, `sme_${name}.exe`);
  return fs.existsSync(p) ? p : null;
}

/**
 * Resolve the vid launcher: prefer the .NET apphost exe if present, else `dotnet <dll>`.
 * Returns { cmd, argsPrefix } or null.
 */
function vidLauncher() {
  if (fs.existsSync(VID_EXE)) return { cmd: VID_EXE, argsPrefix: [] };
  if (fs.existsSync(VID_DLL)) return { cmd: 'dotnet', argsPrefix: [VID_DLL] };
  return null;
}

/**
 * Extract a JSON object from CLI output that may be polluted by engine logs
 * (e.g. llama.cpp prints loader logs to stdout). Tries whole-string parse,
 * then scans back-to-front for the trailing line-starting '{' JSON block.
 */
function extractJson(s) {
  if (!s) return null;
  s = s.trim();
  try { return JSON.parse(s); } catch { /* fall through */ }
  const lines = s.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\{/.test(lines[i].trim())) {
      try { return JSON.parse(lines.slice(i).join('\n')); } catch { /* keep scanning */ }
    }
  }
  return null;
}

/**
 * Spawn a native CLI and parse its JSON contract output.
 * Resolves with the parsed success bundle; rejects with an Error carrying
 * the contract violation message on non-zero exit.
 */
function spawnJson(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const timeout = options.timeout || 180000;
    const useStdin = Boolean(options.input);
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      stdio: useStdin ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    if (useStdin) {
      child.stdin.on('error', () => {});
      child.stdin.write(options.input);
      child.stdin.end();
    }

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${cmd} timed out after ${timeout}ms`));
    }, timeout);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const out = extractJson(stdout);
      const err = extractJson(stderr);

      if (code === 0 && out && out.ok) {
        resolve({ ...out, stdout, stderr, exitCode: code });
        return;
      }

      const message =
        (err && err.error) ||
        (err && err.violation && `violation:${err.violation}`) ||
        (out && out.error) ||
        stderr.trim() ||
        stdout.trim() ||
        `${cmd} exited ${code}`;
      reject(new Error(message));
    });
  });
}

/** Run sme_txt <model> <prompt> [--max_tokens N] [--threads N]. */
async function runTxt(modelPath, prompt, options = {}) {
  const exe = moduleExePath('sme-txt');
  if (!exe) throw new Error('sme_txt.exe not found in sme-suite/build');
  const args = [modelPath, prompt];
  if (options.maxTokens) args.push('--max_tokens', String(options.maxTokens));
  if (options.threads) args.push('--threads', String(options.threads));
  return spawnJson(exe, args, { timeout: options.timeout || 180000 });
}

/** Run sme_vis <image_path> [--config ...] [--topk N]. */
async function runVis(imagePath, options = {}) {
  const exe = moduleExePath('sme-vis');
  if (!exe) throw new Error('sme_vis.exe not found in sme-suite/build');
  const args = [imagePath];
  if (options.topK) args.push('--topk', String(options.topK));
  return spawnJson(exe, args, { timeout: options.timeout || 120000 });
}

/** Run sme_aud <wav_path> [--model ...] [--threads N]. */
async function runAud(wavPath, options = {}) {
  const exe = moduleExePath('sme-aud');
  if (!exe) throw new Error('sme_aud.exe not found in sme-suite/build');
  const args = [wavPath];
  if (options.modelPath) args.push('--model', options.modelPath);
  if (options.threads) args.push('--threads', String(options.threads));
  return spawnJson(exe, args, { timeout: options.timeout || 120000 });
}

/** Run sme_gen <prompt> [--output ...]. */
async function runGen(prompt, outputPath, options = {}) {
  const exe = moduleExePath('sme-gen');
  if (!exe) throw new Error('sme_gen.exe not found in sme-suite/build');
  const args = [prompt, '--output', outputPath];
  if (options.configPath) args.push('--config', options.configPath);
  return spawnJson(exe, args, { timeout: options.timeout || 300000 });
}

/** Run sme_vid <preset> <input> <output> [--ffmpeg ...]. */
async function runVid(preset, inputPath, outputPath, options = {}) {
  const launcher = vidLauncher();
  if (!launcher) throw new Error('sme_vid not found (net10.0 build missing)');
  const args = [...launcher.argsPrefix, preset, inputPath, outputPath];
  if (options.ffmpeg) args.push('--ffmpeg', options.ffmpeg);
  return spawnJson(launcher.cmd, args, { timeout: options.timeout || 300000 });
}

module.exports = {
  SUITE_DIR,
  BUILD_DIR,
  moduleExePath,
  vidLauncher,
  spawnJson,
  runTxt,
  runVis,
  runAud,
  runGen,
  runVid,
};
