export interface IWorkspaceGpu {
  index: number | null;
  name: string;
  memoryUsedMiB: number | null;
  memoryTotalMiB: number | null;
  utilizationPercent: number | null;
  temperatureC: number | null;
}

export interface IWorkspaceGpuModel {
  name: string;
  state: string;
  source: string;
  confidence: string | number | null;
  memoryMiB: number | null;
}

export interface IWorkspaceGpuConsumer {
  pid: number | null;
  gpuIndex: number | null;
  name: string;
  memoryMiB: number | null;
  utilizationPercent: number | null;
  models: IWorkspaceGpuModel[];
}

export interface IWorkspaceGpuSample {
  sampledAt: string;
  gpus: IWorkspaceGpu[];
  consumers: IWorkspaceGpuConsumer[];
  warnings: string[];
}

const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const label = (value: unknown) => (typeof value === 'string' ? value : '');
const measurement = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

// Keep the browser contract limited to displayable telemetry. Do not copy raw
// process arguments, paths, or diagnostic objects into the native interface.
export const parseWorkspaceGpuSample = (value: unknown): IWorkspaceGpuSample => {
  const sample = object(value);
  if (!sample || !Array.isArray(sample.gpus) || !Array.isArray(sample.consumers)) {
    throw new Error('Invalid GPU reading.');
  }
  return {
    sampledAt: label(sample.sampledAt),
    gpus: sample.gpus.flatMap((value) => {
      const gpu = object(value);
      return gpu
        ? [
            {
              index: measurement(gpu.index),
              name: label(gpu.name),
              memoryUsedMiB: measurement(gpu.memoryUsedMiB),
              memoryTotalMiB: measurement(gpu.memoryTotalMiB),
              utilizationPercent: measurement(gpu.utilizationPercent),
              temperatureC: measurement(gpu.temperatureC),
            },
          ]
        : [];
    }),
    consumers: sample.consumers.flatMap((value) => {
      const consumer = object(value);
      return consumer
        ? [
            {
              pid: measurement(consumer.pid),
              gpuIndex: measurement(consumer.gpuIndex),
              name: label(consumer.name),
              memoryMiB: measurement(consumer.memoryMiB),
              utilizationPercent: measurement(consumer.utilizationPercent),
              models: (Array.isArray(consumer.models) ? consumer.models : []).flatMap((value) => {
                const model = object(value);
                return model
                  ? [
                      {
                        name: label(model.name),
                        state: label(model.state),
                        source: label(model.source),
                        confidence:
                          typeof model.confidence === 'string'
                            ? model.confidence
                            : measurement(model.confidence),
                        memoryMiB: measurement(model.memoryMiB),
                      },
                    ]
                  : [];
              }),
            },
          ]
        : [];
    }),
    warnings: (Array.isArray(sample.warnings) ? sample.warnings : []).filter(
      (value): value is string => typeof value === 'string'
    ),
  };
};

export const workspaceGpuPercent = (value: number | null) =>
  value === null ? '—' : `${Math.round(value)}%`;
export const workspaceGpuMemory = (value: number | null) =>
  value === null ? '—' : `${(value / 1024).toFixed(1)} GiB`;
export const workspaceGpuModelState = (value: string) =>
  /^(?:recent|history|recent\/history)$/i.test(value)
    ? 'Last used'
    : (value || 'Unknown').replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase());
export const workspaceGpuConsumerName = (value: string) =>
  /^python(?:w|3(?:\.\d+)?)?(?:\.exe)?$/i.test(value.trim())
    ? 'Unidentified Python GPU process'
    : value || 'Unidentified GPU process';

const sourceNames: Record<string, string> = {
  'ollama-api': 'Ollama loaded-model list',
  ollama_ps: 'Ollama loaded-model list',
  'comfyui-history': 'ComfyUI run history',
  comfy_history: 'ComfyUI run history',
  comfyhistory: 'ComfyUI run history',
  comfyui_history: 'ComfyUI run history',
  'comfyui-queue': 'ComfyUI queue',
  comfy_queue: 'ComfyUI queue',
  comfyui_queue: 'ComfyUI queue',
  nvidia_smi: 'NVIDIA GPU metrics',
  process_command_line: 'Process command line',
  gpu_process_command_line: 'Process command line',
  'prismml-health+props': 'PrismML readiness and model state',
  'prismml-props': 'PrismML model state',
  'prismml-process': 'PrismML launch configuration',
};
export const workspaceGpuSource = (value: string) =>
  value.trim() ? sourceNames[value.toLowerCase()] || value.replace(/_/g, ' ') : 'Not reported';
export const workspaceGpuConfidence = (value: string | number | null) =>
  typeof value === 'string'
    ? value.trim()
      ? workspaceGpuModelState(value)
      : 'Not reported'
    : value === null
      ? 'Not reported'
      : String(value);

export const aggregateWorkspaceGpu = (sample?: IWorkspaceGpuSample) => {
  const gpus = sample?.gpus || [];
  const complete = (
    metric: keyof Pick<IWorkspaceGpu, 'utilizationPercent' | 'memoryUsedMiB' | 'memoryTotalMiB'>
  ) => gpus.length > 0 && gpus.every((gpu) => gpu[metric] !== null);
  return {
    gpus,
    utilization: complete('utilizationPercent')
      ? Math.max(...gpus.map((gpu) => gpu.utilizationPercent!))
      : null,
    used: complete('memoryUsedMiB') ? gpus.reduce((sum, gpu) => sum + gpu.memoryUsedMiB!, 0) : null,
    total: complete('memoryTotalMiB')
      ? gpus.reduce((sum, gpu) => sum + gpu.memoryTotalMiB!, 0)
      : null,
  };
};

export const topWorkspaceGpuConsumers = (consumers: IWorkspaceGpuConsumer[]) =>
  [...consumers]
    .sort(
      (a, b) =>
        (b.memoryMiB ?? -1) - (a.memoryMiB ?? -1) ||
        (b.utilizationPercent ?? -1) - (a.utilizationPercent ?? -1)
    )
    .slice(0, 5);

export const isWorkspaceGpuStale = (
  sample: IWorkspaceGpuSample | undefined,
  error: string,
  now: number
) => {
  const timestamp = sample ? Date.parse(sample.sampledAt) : NaN;
  return Boolean(error) || !Number.isFinite(timestamp) || now - timestamp > 15000;
};
