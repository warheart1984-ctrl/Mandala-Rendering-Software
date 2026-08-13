/**
 * CPU Topology Discovery for Sovereign X Router
 * Discovers: logical processors, physical cores, SMT, NUMA, cache topology
 */

import os from "node:os";
import { execSync } from "node:child_process";

function parseLscpu() {
  try {
    const output = execSync("lscpu", { encoding: "utf-8" });
    const lines = output.trim().split("\n");
    const result = {};
    for (const line of lines) {
      const [key, ...rest] = line.split(":");
      if (key && rest.length) {
        result[key.trim()] = rest.join(":").trim();
      }
    }
    return result;
  } catch {
    return {};
  }
}

function parseCpuinfo() {
  try {
    const output = execSync("cat /proc/cpuinfo", { encoding: "utf-8" });
    const lines = output.trim().split("\n");
    const result = {};
    for (const line of lines) {
      const [key, ...rest] = line.split(":");
      if (key && rest.length) {
        result[key.trim()] = rest.join(":").trim();
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function discoverCpuTopology() {
  const lscpu = parseLscpu();
  const cpuinfo = parseCpuinfo();
  const cpus = os.cpus();

  const logicalProcessors = cpus.length;
  
  // Try lscpu first, fallback to os.cpus() for Windows
  let coresPerSocket = parseInt(lscpu["Core(s) per socket"] || "0", 10);
  let sockets = parseInt(lscpu["Socket(s)"] || "1", 10);
  let threadsPerCore = parseInt(lscpu["Thread(s) per core"] || "1", 10);
  let numaNodes = parseInt(lscpu["NUMA node(s)"] || "1", 10);
  
  // Windows fallback: assume 1 thread per core, physical = logical
  if (coresPerSocket === 0 || isNaN(coresPerSocket)) {
    coresPerSocket = logicalProcessors;
    sockets = 1;
    threadsPerCore = 1;
    numaNodes = 1;
  }
  
  const physicalCores = coresPerSocket * sockets;
  const model = lscpu["Model name"] || cpus[0]?.model || "Unknown";
  const vendor = lscpu["Vendor ID"] || "Unknown";
  const cacheHierarchy = buildCacheHierarchy(lscpu, logicalProcessors);

  return {
    logicalProcessors,
    physicalCores,
    sockets,
    threadsPerCore,
    numaNodes,
    cacheHierarchy,
    model,
    vendor,
  };
}

function buildCacheHierarchy(lscpu, logicalProcessors) {
  const caches = [];
  const cacheKeys = [
    { key: "L1d cache", level: 1, type: "data" },
    { key: "L1i cache", level: 1, type: "instruction" },
    { key: "L2 cache", level: 2, type: "unified" },
    { key: "L3 cache", level: 3, type: "unified" },
  ];

  for (const { key, level, type } of cacheKeys) {
    const val = lscpu[key];
    if (val) {
      const size = parseSize(val);
      let sharedBy = logicalProcessors;
      if (level === 1) sharedBy = 1;
      if (level === 2) sharedBy = 1;
      if (level === 3) sharedBy = logicalProcessors / (parseInt(lscpu["Socket(s)"] || "1", 10) || 1);
      
      caches.push({
        level,
        size,
        type,
        associativity: 0,
        lineSize: 64,
        sharedBy,
      });
    }
  }

  return caches;
}

function parseSize(str) {
  const match = str.match(/([\d.]+)\s*([KMGT]?i?B)/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const multipliers = {
    "B": 1, "KB": 1000, "KIB": 1024,
    "MB": 1000000, "MIB": 1048576,
    "GB": 1000000000, "GIB": 1073741824,
    "TB": 1000000000000, "TIB": 1099511627776,
  };
  return Math.round(num * (multipliers[unit] || 1));
}

export function computeWorkerTopology(topology, strategy = "core") {
  let workers, threadsPerWorker;

  switch (strategy) {
    case "none":
      workers = 1;
      threadsPerWorker = 1;
      break;
    case "core":
      workers = topology.physicalCores;
      threadsPerWorker = topology.threadsPerCore;
      break;
    case "numa":
      workers = topology.numaNodes;
      threadsPerWorker = topology.logicalProcessors / topology.numaNodes;
      break;
    case "cache":
      workers = topology.sockets;
      threadsPerWorker = topology.logicalProcessors / topology.sockets;
      break;
    default:
      workers = topology.physicalCores;
      threadsPerWorker = topology.threadsPerCore;
  }

  if (workers > topology.logicalProcessors) {
    workers = topology.logicalProcessors;
    threadsPerWorker = 1;
  }

  return { workers, threadsPerWorker, affinity: strategy };
}

export function generateScalingSeries(topology) {
  const max = topology.physicalCores;
  const series = [1];
  let current = 2;
  while (current <= max) {
    series.push(current);
    current *= 2;
  }
  if (series[series.length - 1] !== max) {
    series.push(max);
  }
  return series;
}

export function getWorkerAffinity(workerId, topology, topologyInfo) {
  const cpusPerWorker = Math.floor(topology.logicalProcessors / topologyInfo.workers);
  const start = (workerId * cpusPerWorker) % topology.logicalProcessors;
  const cores = [];
  for (let i = 0; i < cpusPerWorker; i++) {
    cores.push((start + i) % topology.logicalProcessors);
  }
  return cores;
}