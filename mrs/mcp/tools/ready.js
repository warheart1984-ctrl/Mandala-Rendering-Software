// mrs/mcp/tools/ready.js

export const readyTool = {
  id: 'mrs.ready',
  description: 'Readiness check indicating whether core dependencies are initialized.',
  async execute(params = {}, context = {}) {
    const { dependencies = {} } = context;

    const allReady = Object.values(dependencies).every(v => v === 'ready');

    return {
      ready: allReady,
      dependencies,
    };
  },
};