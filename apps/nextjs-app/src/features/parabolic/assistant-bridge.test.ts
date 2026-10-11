import { describe, expect, it } from 'vitest';
import {
  assistantMessage,
  assistantPanelWidth,
  assistantRecordContext,
  assistantRouteContext,
  assistantThemeTokens,
  nextAssistantRecord,
} from './assistant-bridge';

const baseId = 'bse0123456789ABCDEF';
const tableId = 'tbl0123456789ABCDEF';
const viewId = 'viw0123456789ABCDEF';
const recordId = 'rec0123456789ABCDEF';
const newerRecordId = 'recFEDCBA9876543210';
const otherTableId = 'tblFEDCBA9876543210';

describe('native assistant bridge', () => {
  it('accepts native route ids and rejects duplicate or orphaned scope parameters', () => {
    expect(assistantRouteContext({ baseId, slug: ['table', tableId, viewId] })).toEqual({
      baseId,
      tableId,
      viewId,
    });
    expect(assistantRouteContext({ baseId: [baseId, baseId], slug: ['table', tableId] })).toEqual(
      {}
    );
    expect(assistantRouteContext({ baseId, slug: ['table', 'invalid', viewId] })).toEqual({
      baseId,
    });
    expect(assistantRouteContext({ slug: ['table', tableId, viewId] })).toEqual({});
    expect(assistantRouteContext({ baseId, slug: ['dashboard', tableId] })).toEqual({ baseId });
  });

  it('validates record events before accepting their identity', () => {
    expect(assistantRecordContext({ baseId, tableId, recordId, open: true })).toEqual({
      baseId,
      tableId,
      recordId,
      open: true,
    });
    expect(
      assistantRecordContext({ baseId, tableId, recordId: 'wrong-record', open: true })
    ).toBeUndefined();
    expect(assistantRecordContext({ baseId, tableId, recordId, open: 'true' })).toBeUndefined();
  });

  it('does not let old-table events or a late close clear the current record', () => {
    const route = { baseId, tableId };
    const current = { ...route, recordId: newerRecordId, open: true };
    expect(
      nextAssistantRecord(current, { ...route, tableId: otherTableId, recordId, open: true }, route)
    ).toBe(current);
    expect(nextAssistantRecord(current, { ...route, recordId, open: false }, route)).toBe(current);
    expect(nextAssistantRecord(current, { ...current, open: false }, route)).toBeUndefined();
  });

  it('requires both exact same origin and the mounted iframe source', () => {
    const frame = window;
    const event = {
      origin: 'https://fourdx.example',
      source: frame,
      data: { type: '4dx-chat-close' },
    };
    expect(assistantMessage(event, frame, event.origin)).toEqual(event.data);
    expect(
      assistantMessage({ ...event, origin: 'https://untrusted.example' }, frame, event.origin)
    ).toBeUndefined();
    expect(assistantMessage({ ...event, source: null }, frame, event.origin)).toBeUndefined();
    expect(assistantMessage(event, null, event.origin)).toBeUndefined();
  });

  it('only forwards validated completion messages', () => {
    const event = {
      origin: 'https://fourdx.example',
      source: window,
      data: { type: '4dx-chat-action-complete', tableId },
    };
    expect(assistantMessage(event, window, event.origin)).toEqual(event.data);
    expect(
      assistantMessage(
        { ...event, data: { ...event.data, tableId: '/arbitrary/path' } },
        window,
        event.origin
      )
    ).toBeUndefined();
    expect(
      assistantMessage({ ...event, data: { type: 'execute-javascript' } }, window, event.origin)
    ).toBeUndefined();
  });

  it('copies native HSL channels and fonts while excluding unsafe CSS', () => {
    const values: Record<string, string> = {
      '--background': '220 5% 8%',
      '--foreground': '213 13% 86%',
      '--border': '0 0% 100% / 0.08',
      '--accent': 'var(--unknown)',
      '--primary': 'red; background: url(https://untrusted.example)',
      '--radius': '0.5rem',
    };
    const style = {
      getPropertyValue: (name: string) => values[name] || '',
      fontFamily: 'InterVariable, sans-serif',
    };
    const tokens = assistantThemeTokens(style, (_property, value) => value.startsWith('hsl('));
    expect(tokens).toEqual({
      background: 'hsl(220 5% 8%)',
      foreground: 'hsl(213 13% 86%)',
      border: 'hsl(0 0% 100% / 0.08)',
      radius: '0.5rem',
      'font-family': 'InterVariable, sans-serif',
    });
  });

  it('does not send unsupported color values or CSS from radius and font tokens', () => {
    const style = {
      getPropertyValue: (name: string) => (name === '--radius' ? 'url(example)' : 'not-a-color'),
      fontFamily: 'Arial; background:red',
    };
    expect(assistantThemeTokens(style, () => false)).toEqual({});
  });

  it('keeps resizing inside both native width limits and narrow content bounds', () => {
    expect(assistantPanelWidth(50)).toBe(280);
    expect(assistantPanelWidth(1000)).toBe(560);
    expect(assistantPanelWidth(400, 250)).toBe(250);
    expect(assistantPanelWidth(400, -10)).toBe(0);
  });
});
