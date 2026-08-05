const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  lemonade: {
    chat: (model, messages, maxTokens) => ipcRenderer.invoke('lemonade:chat', { model, messages, maxTokens }),
    tts: (model, input, voice) => ipcRenderer.invoke('lemonade:tts', { model, input, voice }),
    models: () => ipcRenderer.invoke('lemonade:models')
  },
  mrs: {
    render: (args) => ipcRenderer.invoke('mrs:render', args)
  },
  app: {
    openOutput: () => ipcRenderer.invoke('app:open-output')
  },
  cloud: {
    providers: () => ipcRenderer.invoke('cloud:providers'),
    setToken: (provider, token) => ipcRenderer.invoke('cloud:set-token', { provider, token }),
    chat: (provider, model, messages, maxTokens) => ipcRenderer.invoke('cloud:chat', { provider, model, messages, maxTokens }),
    generateImage: (provider, model, prompt, options) => ipcRenderer.invoke('cloud:generate-image', { provider, model, prompt, options }),
    vision: (provider, model, prompt, imageBase64, options) => ipcRenderer.invoke('cloud:vision', { provider, model, prompt, imageBase64, options }),
    enhanceRender: (imagePath, options) => ipcRenderer.invoke('cloud:enhance-render', { imagePath, options }),
  },
  director: {
    direct: (intent, options) => ipcRenderer.invoke('director:direct', { intent, options }),
    replicate: (specPath, options) => ipcRenderer.invoke('director:replicate', { specPath, options }),
    listScenes: () => ipcRenderer.invoke('director:list-scenes'),
  },
  dep: {
    compile: (intent, options) => ipcRenderer.invoke('dep:compile', { intent, options }),
    execute: (dep) => ipcRenderer.invoke('dep:execute', { dep }),
    compileAndExecute: (intent, options) => ipcRenderer.invoke('dep:compile-and-execute', { intent, options }),
    status: (executionId) => ipcRenderer.invoke('dep:status', { executionId }),
    templates: () => ipcRenderer.invoke('dep:templates'),
  },
  sme: {
    // Capability Planner
    plan: (userRequest) => ipcRenderer.invoke('sme:plan', { userRequest }),
    capabilityPlan: (userRequest) => ipcRenderer.invoke('sme:capability-plan', { userRequest }),
    
    // Hardware Profile
    hardwareProfile: () => ipcRenderer.invoke('sme:hardware-profile'),
    hardwareProfiles: () => ipcRenderer.invoke('sme:hardware-profiles'),
    setHardwareProfile: (profileId) => ipcRenderer.invoke('sme:set-hardware-profile', { profileId }),
    
    // Core Execution
    execute: (input) => ipcRenderer.invoke('sme:execute', { input }),
    health: () => ipcRenderer.invoke('sme:health'),
    
    // Module Direct Invocation (native-backed)
    txtGenerate: (params) => ipcRenderer.invoke('sme:txt-generate', params),
    visEncode: (params) => ipcRenderer.invoke('sme:vis-encode', params),
    audTranscribe: (params) => ipcRenderer.invoke('sme:aud-transcribe', params),
    vidProcess: (params) => ipcRenderer.invoke('sme:vid-process', params),
    genImage: (params) => ipcRenderer.invoke('sme:gen-image', params),
    
    // Log (Evidence, Replay, Audit)
    evidence: (evidenceId) => ipcRenderer.invoke('sme:evidence', { evidenceId }),
    decision: (decisionId) => ipcRenderer.invoke('sme:decision', { decisionId }),
    trace: (chainId) => ipcRenderer.invoke('sme:trace', { chainId }),
    replay: (chainId, options) => ipcRenderer.invoke('sme:replay', { chainId, options }),
    audit: (query) => ipcRenderer.invoke('sme:audit', { query }),
    auditReport: (chainId) => ipcRenderer.invoke('sme:audit-report', { chainId }),
    
    // Hardware Profile Matching
    matchPlan: (plan) => ipcRenderer.invoke('sme:match-plan', { plan }),
    profileRecommendations: (plan) => ipcRenderer.invoke('sme:profile-recommendations', { plan }),
    
    // Lattice (LRC constitutional routing over the 5 SME substrates)
    latticeRoute: (request) => ipcRenderer.invoke('sme:lattice-route', { request }),
    latticeReplay: (requestId) => ipcRenderer.invoke('sme:lattice-replay', { requestId })
  }
});