import { describe, expect, it } from 'vitest';
import {
  aggregateWorkspaceGpu,
  isWorkspaceGpuStale,
  parseWorkspaceGpuSample,
  topWorkspaceGpuConsumers,
  workspaceGpuConfidence,
  workspaceGpuConsumerName,
  workspaceGpuModelState,
  workspaceGpuSource,
} from './workspaceGpu';
import {
  isWorkspaceLinkActive,
  workspaceChatLink,
  workspaceRelativeLink,
  workspaceTableRoute,
} from './workspaceNavigation';

describe('native workspace telemetry', () => {
  it('does not represent missing measurements as zero or add partial device totals', () => {
    const sample = parseWorkspaceGpuSample({
      gpus: [
        { memoryUsedMiB: 2048, memoryTotalMiB: 8192, utilizationPercent: 12 },
        { memoryUsedMiB: null, memoryTotalMiB: 16384, utilizationPercent: 81 },
      ],
      consumers: [],
    });
    expect(aggregateWorkspaceGpu(sample)).toMatchObject({
      used: null,
      total: 24576,
      utilization: 81,
    });
    expect(aggregateWorkspaceGpu()).toMatchObject({ used: null, total: null, utilization: null });
  });

  it('orders only five consumers by measured memory, with unavailable values last', () => {
    const sample = parseWorkspaceGpuSample({
      gpus: [],
      consumers: [
        { name: 'Unknown', memoryMiB: null },
        ...Array.from({ length: 6 }, (_, index) => ({
          name: `App ${index}`,
          memoryMiB: index * 1024,
        })),
      ],
    });
    expect(topWorkspaceGpuConsumers(sample.consumers).map(({ name }) => name)).toEqual([
      'App 5',
      'App 4',
      'App 3',
      'App 2',
      'App 1',
    ]);
    expect(sample.consumers[0].name).toBe('Unknown');
  });

  it('limits parsed readings to the display contract and keeps states honest', () => {
    const sample = parseWorkspaceGpuSample({
      gpus: [{ commandLine: 'private launch arguments' }],
      consumers: [
        {
          name: 'python.exe',
          commandLine: 'private launch arguments',
          models: [
            {
              name: 'Model',
              state: 'recent',
              source: 'comfyui-history',
              privatePath: '/private/model',
            },
          ],
        },
      ],
      warnings: [{ message: 'private diagnostic object' }, 'GPU counters are unavailable.'],
    });
    expect(JSON.stringify(sample)).not.toContain('private');
    expect(sample.warnings).toEqual(['GPU counters are unavailable.']);
    expect(workspaceGpuConsumerName(sample.consumers[0].name)).toBe(
      'Unidentified Python GPU process'
    );
    expect(workspaceGpuModelState(sample.consumers[0].models[0].state)).toBe('Last used');
    expect(workspaceGpuSource(sample.consumers[0].models[0].source)).toBe('ComfyUI run history');
    expect(sample.consumers[0].models[0].confidence).toBeNull();
    expect(workspaceGpuConfidence(null)).toBe('Not reported');
    expect(workspaceGpuConfidence(' ')).toBe('Not reported');
  });

  it('marks failed, missing, invalid, and old readings stale', () => {
    const now = Date.now();
    const sample = parseWorkspaceGpuSample({
      sampledAt: new Date(now - 1000).toISOString(),
      gpus: [],
      consumers: [],
    });
    expect(isWorkspaceGpuStale(sample, '', now)).toBe(false);
    expect(isWorkspaceGpuStale(sample, 'Refresh failed', now)).toBe(true);
    expect(isWorkspaceGpuStale(sample, '', now + 15001)).toBe(true);
    expect(isWorkspaceGpuStale({ ...sample, sampledAt: 'invalid' }, '', now)).toBe(true);
    expect(isWorkspaceGpuStale(undefined, '', now)).toBe(true);
  });
});

describe('native workspace navigation', () => {
  const route = '/base/bse0000000000000001/table/tbl0000000000000002/viw0000000000000003';
  it('keeps the selected table active across view changes and passes complete chat context', () => {
    expect(workspaceTableRoute(`${route}?recordId=recExample`)).toEqual({
      baseId: 'bse0000000000000001',
      tableId: 'tbl0000000000000002',
      viewId: 'viw0000000000000003',
    });
    expect(
      isWorkspaceLinkActive(route, route.replace('viw0000000000000003', 'viw0000000000000004'))
    ).toBe(true);
    expect(
      isWorkspaceLinkActive(route, route.replace('tbl0000000000000002', 'tbl0000000000000004'))
    ).toBe(false);
    expect(workspaceChatLink(route)).toBe(
      '/chat/?baseId=bse0000000000000001&tableId=tbl0000000000000002&viewId=viw0000000000000003'
    );
    expect(workspaceChatLink('/space')).toBe('/chat/');
  });

  it('accepts only links within the gateway origin', () => {
    expect(workspaceRelativeLink(route)).toBe(route);
    expect(workspaceRelativeLink(`https://4dx.test${route}`, 'https://4dx.test')).toBe(route);
    expect(workspaceRelativeLink(`https://other.test${route}`, 'https://4dx.test')).toBeUndefined();
    expect(workspaceRelativeLink('//other.test/chat/', 'https://4dx.test')).toBeUndefined();
    expect(workspaceRelativeLink('javascript:alert(1)', 'https://4dx.test')).toBeUndefined();
  });
});
