export interface GPUContract {
  maxAllocations: number;
  maxMemoryMb: number;
}

export function validateGPUContract(contract: GPUContract | null): string | null {
  if (!contract) return "GPU allocation requires a contract (none provided)";
  if (contract.maxAllocations <= 0) return "GPU contract: maxAllocations must be > 0";
  if (contract.maxMemoryMb <= 0) return "GPU contract: maxMemoryMb must be > 0";
  return null;
}
