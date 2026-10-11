import { ChevronDown, X } from '@teable/icons';
import { Button, Popover, PopoverContent, PopoverTrigger, badgeVariants, cn } from '@teable/ui-lib';
import { Cpu } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useId, useRef, useState } from 'react';
import { useWorkspaceGpu } from './useWorkspaceGpu';
import type {
  IWorkspaceGpu,
  IWorkspaceGpuConsumer,
  IWorkspaceGpuModel,
  IWorkspaceGpuSample,
} from './workspaceGpu';
import {
  aggregateWorkspaceGpu,
  topWorkspaceGpuConsumers,
  workspaceGpuConfidence,
  workspaceGpuConsumerName,
  workspaceGpuMemory,
  workspaceGpuModelState,
  workspaceGpuPercent,
  workspaceGpuSource,
} from './workspaceGpu';
import type { IWorkspaceLink } from './workspaceNavigation';
import {
  isWorkspaceLinkActive,
  workspaceChatLink,
  workspaceRelativeLink,
  workspaceTableRoute,
} from './workspaceNavigation';

export interface IWorkspaceHeaderProps {
  links: IWorkspaceLink[];
  assistantOpen: boolean;
  onToggleAssistant: () => void;
}

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0 space-y-1">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="text-xs font-medium tabular-nums">{value}</dd>
  </div>
);

const ModelState = ({ model }: { model: IWorkspaceGpuModel }) => (
  <span
    className={cn(
      badgeVariants({ variant: model.state.toLowerCase() === 'active' ? 'secondary' : 'outline' }),
      'shrink-0 px-1.5 py-0 text-[10px] font-normal'
    )}
  >
    {workspaceGpuModelState(model.state)}
  </span>
);

const GpuConsumer = ({ consumer }: { consumer: IWorkspaceGpuConsumer }) => (
  <details className="group rounded-md border border-border bg-background">
    <summary className="cursor-pointer rounded-md p-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
      <span className="inline-flex w-[calc(100%-1rem)] items-start justify-between gap-3 align-top">
        <span className="min-w-0 text-xs font-medium">
          {workspaceGpuConsumerName(consumer.name)}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {workspaceGpuMemory(consumer.memoryMiB)} ·{' '}
          {workspaceGpuPercent(consumer.utilizationPercent)}
        </span>
      </span>
      <span className="mt-2 flex flex-wrap gap-1.5">
        {consumer.models.slice(0, 2).map((model, index) => (
          <span
            key={`${model.name}-${index}`}
            className="inline-flex max-w-full items-center gap-1 rounded bg-muted px-1.5 py-1 text-xs"
          >
            <span className="truncate">{model.name || 'Unidentified model'}</span>
            <ModelState model={model} />
            {model.memoryMiB !== null && (
              <span className="text-muted-foreground">{workspaceGpuMemory(model.memoryMiB)}</span>
            )}
          </span>
        ))}
        {!consumer.models.length && (
          <span className="text-xs text-muted-foreground">Model not identified</span>
        )}
        {consumer.models.length > 2 && (
          <span className="text-xs text-muted-foreground">+{consumer.models.length - 2} more</span>
        )}
      </span>
    </summary>
    <div className="space-y-3 border-t border-border p-3">
      <dl className="grid grid-cols-3 gap-3">
        <Metric label="PID" value={consumer.pid === null ? '—' : String(consumer.pid)} />
        <Metric label="VRAM" value={workspaceGpuMemory(consumer.memoryMiB)} />
        <Metric label="Busy" value={workspaceGpuPercent(consumer.utilizationPercent)} />
      </dl>
      {consumer.models.map((model, index) => (
        <div
          key={`${model.name}-${index}`}
          className="space-y-1 border-t border-border pt-3 text-xs"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="break-words font-medium">{model.name || 'Unidentified model'}</span>
            <ModelState model={model} />
          </div>
          {model.memoryMiB !== null && <p>Model VRAM: {workspaceGpuMemory(model.memoryMiB)}</p>}
          <p className="text-muted-foreground">
            Source: {workspaceGpuSource(model.source)} · Confidence:{' '}
            {workspaceGpuConfidence(model.confidence)}
          </p>
        </div>
      ))}
      {!consumer.models.length && (
        <p className="text-xs text-muted-foreground">
          This sample does not identify a model for this app.
        </p>
      )}
    </div>
  </details>
);

const GpuDevice = ({ gpu, index }: { gpu: IWorkspaceGpu; index: number }) => (
  <div className="space-y-2 rounded-md border border-border p-3">
    <h3 className="text-xs font-medium">{gpu.name || `GPU ${gpu.index ?? index}`}</h3>
    <dl className="grid grid-cols-[1fr_2fr_1fr] gap-2">
      <Metric label="Busy" value={workspaceGpuPercent(gpu.utilizationPercent)} />
      <Metric
        label="VRAM"
        value={
          gpu.memoryUsedMiB !== null && gpu.memoryTotalMiB !== null
            ? `${workspaceGpuMemory(gpu.memoryUsedMiB)} / ${workspaceGpuMemory(gpu.memoryTotalMiB)}`
            : '—'
        }
      />
      <Metric
        label="Temperature"
        value={gpu.temperatureC === null ? '—' : `${Math.round(gpu.temperatureC)} °C`}
      />
    </dl>
  </div>
);

const GpuApps = ({ sample }: { sample?: IWorkspaceGpuSample }) => {
  const consumers = topWorkspaceGpuConsumers(sample?.consumers || []);
  const count =
    (sample?.consumers.length || 0) > 5
      ? `Top 5 of ${sample?.consumers.length}`
      : `${consumers.length} ${consumers.length === 1 ? 'app' : 'apps'}`;
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Apps &amp; models</h3>
        <span className="text-xs text-muted-foreground">{count}</span>
      </div>
      {consumers.map((consumer) => (
        <GpuConsumer
          key={`${consumer.pid}-${consumer.gpuIndex}-${consumer.name}`}
          consumer={consumer}
        />
      ))}
      {!consumers.length && (
        <p className="text-xs text-muted-foreground">
          {sample ? 'No GPU consumers were reported in this sample.' : 'Waiting for GPU readings.'}
        </p>
      )}
    </>
  );
};

const WorkspaceGpu = () => {
  const { sample, error, stale } = useWorkspaceGpu();
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const data = aggregateWorkspaceGpu(sample);
  const status = stale ? 'Last sample' : 'Updated';
  const timestamp = sample ? new Date(sample.sampledAt) : undefined;
  const stamp =
    timestamp && Number.isFinite(timestamp.getTime())
      ? timestamp.toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
        })
      : 'No sample yet';
  const memory =
    data.used !== null && data.total !== null
      ? `${(data.used / 1024).toFixed(1)}/${(data.total / 1024).toFixed(1)} GiB`
      : 'VRAM —';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 gap-1.5 tabular-nums"
          aria-label={`${data.gpus.length > 1 ? 'Highest GPU utilization' : 'GPU utilization'} ${workspaceGpuPercent(data.utilization)}, VRAM ${workspaceGpuMemory(data.used)} used of ${workspaceGpuMemory(data.total)}${stale ? ', sample stale or unavailable' : ''}. Open usage details.`}
          title={`${status} ${stamp}${error ? ` · ${error}` : ''}`}
        >
          <Cpu
            aria-hidden="true"
            className={cn('size-3.5', stale ? 'text-muted-foreground' : 'text-primary')}
          />
          <span>GPU {workspaceGpuPercent(data.utilization)}</span>
          <span className="hidden text-muted-foreground sm:inline">{memory}</span>
          <ChevronDown aria-hidden="true" className="size-3 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(28rem,calc(100vw-1rem))] p-0"
        aria-labelledby={headingId}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          heading.current?.focus();
        }}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <h2
            ref={heading}
            id={headingId}
            tabIndex={-1}
            className="text-sm font-medium outline-none"
          >
            GPU usage
          </h2>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setOpen(false)}
            aria-label="Close GPU details"
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>
        <div className="max-h-[min(36rem,calc(100dvh-7rem))] space-y-3 overflow-y-auto p-4">
          <p className="text-xs text-muted-foreground">
            {status} {stamp}
          </p>
          {error && (
            <p role="status" className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
              {error} Previous readings are shown when available.
            </p>
          )}
          {data.gpus.map((gpu, index) => (
            <GpuDevice key={gpu.index ?? index} gpu={gpu} index={index} />
          ))}
          <GpuApps sample={sample} />
          <p className="text-xs text-muted-foreground">
            Apps are ordered by measured VRAM. — means the measurement is unavailable. Windows app
            allocations may not add up to the device total. Model states distinguish active work,
            loaded models, and last use.
            {data.gpus.length > 1 &&
              ' The bar shows the busiest GPU and total VRAM across the listed GPUs.'}
          </p>
          {sample?.warnings.map((warning, index) => (
            <p key={index} className="text-xs text-muted-foreground">
              {warning}
            </p>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export const WorkspaceHeader = ({
  links,
  assistantOpen,
  onToggleAssistant,
}: IWorkspaceHeaderProps) => {
  const router = useRouter();
  const pathname = router.asPath.split(/[?#]/, 1)[0];
  const current = workspaceTableRoute(pathname);
  const origin = typeof window === 'undefined' ? undefined : window.location.origin;
  return (
    <header
      aria-label="Parabolic workspace"
      className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3 text-foreground"
    >
      <Link href="/" className="shrink-0 text-sm font-semibold" aria-label="Parabolic home">
        Parabolic
      </Link>
      <nav
        aria-label="Parabolic navigation"
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
      >
        {links.map((item) => {
          const href = workspaceRelativeLink(item.href, origin);
          if (!href) return null;
          const target = workspaceTableRoute(href);
          const chat = href.split(/[?#]/, 1)[0] === '/chat/';
          const active = isWorkspaceLinkActive(pathname, href);
          if (chat && current)
            return (
              <Button
                key={href}
                type="button"
                size="sm"
                variant={assistantOpen ? 'secondary' : 'ghost'}
                aria-expanded={assistantOpen}
                onClick={onToggleAssistant}
              >
                {item.name}
              </Button>
            );
          return (
            <Button key={href} asChild size="sm" variant={active ? 'secondary' : 'ghost'}>
              {current && target ? (
                <Link
                  href={href}
                  shallow={current.baseId === target.baseId}
                  aria-current={active ? 'page' : undefined}
                >
                  {item.name}
                </Link>
              ) : (
                <a
                  href={chat ? workspaceChatLink(pathname) : href}
                  aria-current={active ? 'page' : undefined}
                >
                  {item.name}
                </a>
              )}
            </Button>
          );
        })}
      </nav>
      <WorkspaceGpu />
    </header>
  );
};
