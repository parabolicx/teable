export interface IAssistantContext {
  baseId?: string;
  tableId?: string;
  viewId?: string;
  recordIds?: string[];
}

export interface IAssistantRecordContext {
  baseId: string;
  tableId: string;
  recordId: string;
  open: boolean;
}

type RouteValue = string | string[] | undefined;
type AssistantInboundMessage =
  | { type: '4dx-chat-ready' | '4dx-chat-close' }
  | { type: '4dx-chat-action-complete'; tableId: string };

const idPatterns = {
  baseId: /^bse[A-Za-z0-9]{16}$/,
  tableId: /^tbl[A-Za-z0-9]{16}$/,
  viewId: /^viw[A-Za-z0-9]{16}$/,
  recordId: /^rec[A-Za-z0-9]{16}$/,
};

export function isAssistantId(value: unknown, key: keyof typeof idPatterns): value is string {
  return typeof value === 'string' && idPatterns[key].test(value);
}

/** Router parameters are the source of scope; duplicate query parameters are never accepted. */
export function assistantRouteContext(query: {
  baseId?: RouteValue;
  slug?: RouteValue;
}): IAssistantContext {
  if (!isAssistantId(query.baseId, 'baseId')) return {};
  const context: IAssistantContext = { baseId: query.baseId };
  // Teable's native base page owns a catch-all slug, also used by dashboard/app routes.
  if (!Array.isArray(query.slug) || query.slug[0] !== 'table' || query.slug.length > 3) {
    return context;
  }
  const [, tableId, viewId] = query.slug;
  if (!isAssistantId(tableId, 'tableId')) return context;
  context.tableId = tableId;
  if (isAssistantId(viewId, 'viewId')) context.viewId = viewId;
  return context;
}

export function assistantRecordContext(value: unknown): IAssistantRecordContext | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const record = value as Record<string, unknown>;
  if (
    !isAssistantId(record.baseId, 'baseId') ||
    !isAssistantId(record.tableId, 'tableId') ||
    !isAssistantId(record.recordId, 'recordId') ||
    typeof record.open !== 'boolean'
  ) {
    return;
  }
  return {
    baseId: record.baseId,
    tableId: record.tableId,
    recordId: record.recordId,
    open: record.open,
  };
}

export function sameAssistantTable(route: IAssistantContext, record: IAssistantRecordContext) {
  return route.baseId === record.baseId && route.tableId === record.tableId;
}

/** A late cleanup from an older editor must not clear the newly selected record. */
export function nextAssistantRecord(
  current: IAssistantRecordContext | undefined,
  incoming: IAssistantRecordContext,
  route: IAssistantContext
): IAssistantRecordContext | undefined {
  if (!sameAssistantTable(route, incoming)) return current;
  if (incoming.open) return incoming;
  return current &&
    current.baseId === incoming.baseId &&
    current.tableId === incoming.tableId &&
    current.recordId === incoming.recordId
    ? undefined
    : current;
}

export function assistantMessage(
  event: Pick<MessageEvent, 'origin' | 'source' | 'data'>,
  source: Window | null | undefined,
  origin: string
): AssistantInboundMessage | undefined {
  if (!source || event.origin !== origin || event.source !== source) return;
  if (!event.data || typeof event.data !== 'object' || Array.isArray(event.data)) return;
  const message = event.data as Record<string, unknown>;
  if (message.type === '4dx-chat-ready' || message.type === '4dx-chat-close') {
    return { type: message.type };
  }
  if (message.type === '4dx-chat-action-complete' && isAssistantId(message.tableId, 'tableId')) {
    return { type: message.type, tableId: message.tableId };
  }
}

const colorTokens = [
  'background',
  'foreground',
  'muted',
  'muted-foreground',
  'border',
  'primary',
  'primary-foreground',
  'accent',
  'destructive',
] as const;

export type AssistantThemeTokens = Partial<
  Record<(typeof colorTokens)[number] | 'radius' | 'font-family', string>
>;

/** Only resolved presentation values cross the bridge, never selectors or arbitrary CSS. */
export function assistantThemeTokens(
  style: Pick<CSSStyleDeclaration, 'getPropertyValue' | 'fontFamily'>,
  supports: (property: string, value: string) => boolean
): AssistantThemeTokens {
  const tokens: AssistantThemeTokens = {};
  for (const name of colorTokens) {
    const raw = style.getPropertyValue(`--${name}`).trim();
    if (!raw || raw.length > 128 || /[;{}<>]|url\(|var\(|env\(|\/\*/i.test(raw)) continue;
    const value = /^[\d.%+\-\s/]+$/.test(raw) ? `hsl(${raw})` : raw;
    if (supports('color', value)) tokens[name] = value;
  }
  const radius = style.getPropertyValue('--radius').trim();
  if (/^(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%)$/i.test(radius)) tokens.radius = radius;
  const font = style.fontFamily.trim();
  if (font && font.length <= 512 && /^[\w\s,'"-]+$/.test(font)) tokens['font-family'] = font;
  return tokens;
}

export const ASSISTANT_MIN_WIDTH = 280;
export const ASSISTANT_MAX_WIDTH = 560;
export const ASSISTANT_DEFAULT_WIDTH = 400;

export function assistantPanelWidth(width: number, availableWidth = ASSISTANT_MAX_WIDTH) {
  const maximum = Math.min(ASSISTANT_MAX_WIDTH, Math.max(0, availableWidth));
  return Math.round(Math.min(maximum, Math.max(Math.min(ASSISTANT_MIN_WIDTH, maximum), width)));
}
