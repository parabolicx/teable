/* eslint-disable @typescript-eslint/naming-convention */
import { getLocalFileResponse } from './local-file-response';

describe('local attachment HTTP responses', () => {
  const metadata = { size: 10, lastModified: Date.parse('2026-10-01T12:00:00.456Z') };
  const modifiedDate = 'Thu, 01 Oct 2026 12:00:00 GMT';

  it.each([
    ['bytes=0-1', 0, 1],
    ['bytes=4-', 4, 9],
    ['bytes=-3', 7, 9],
    ['bytes=8-99', 8, 9],
    ['bytes=-99', 0, 9],
    ['bytes=2-999999999999999999999999999999', 2, 9],
    ['bytes=-999999999999999999999999999999', 0, 9],
  ])('selects only the requested bytes for %s', (range, start, end) => {
    expect(getLocalFileResponse(metadata, { headers: { range } })).toEqual({
      status: 206,
      stream: true,
      range: { start, end },
      headers: {
        'Accept-Ranges': 'bytes',
        'Last-Modified': modifiedDate,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/10`,
      },
    });
  });

  it.each(['bytes=10-', 'bytes=999999999999999999999999999999-', 'bytes=-0'])(
    'rejects an unsatisfiable range %s without streaming',
    (range) => {
      expect(getLocalFileResponse(metadata, { headers: { range } })).toMatchObject({
        status: 416,
        stream: false,
        headers: { 'Content-Range': 'bytes */10', 'Content-Length': '0' },
      });
    }
  );

  it.each(['bytes=3-1', 'bytes=-', 'bytes=a-b', 'bytes=0-1,3-4', 'items=0-1'])(
    'ignores an unsupported or malformed range %s',
    (range) => {
      const response = getLocalFileResponse(metadata, { headers: { range } });
      expect(response.status).toBe(200);
      expect(response.headers['Content-Length']).toBe('10');
      expect(response.headers['Content-Range']).toBeUndefined();
    }
  );

  it('describes the full file for HEAD without opening a stream', () => {
    expect(
      getLocalFileResponse(metadata, { method: 'HEAD', headers: { range: 'bytes=0-1' } })
    ).toEqual({
      status: 200,
      stream: false,
      headers: {
        'Accept-Ranges': 'bytes',
        'Last-Modified': modifiedDate,
        'Content-Length': '10',
      },
    });
  });

  it('handles an empty file and rejects its byte ranges', () => {
    expect(getLocalFileResponse({ ...metadata, size: 0 })).toMatchObject({
      status: 200,
      headers: { 'Content-Length': '0' },
    });
    expect(
      getLocalFileResponse({ ...metadata, size: 0 }, { headers: { range: 'bytes=0-' } })
    ).toMatchObject({ status: 416, stream: false, headers: { 'Content-Range': 'bytes */0' } });
  });

  it('evaluates cache preconditions before a range', () => {
    expect(
      getLocalFileResponse(metadata, {
        headers: { range: 'bytes=0-1', 'if-modified-since': modifiedDate },
      })
    ).toMatchObject({ status: 304, stream: false });
    expect(
      getLocalFileResponse(metadata, { headers: { 'if-modified-since': 'invalid-date' } }).status
    ).toBe(200);
  });

  it('does not return 304 for an unsupported ETag condition', () => {
    expect(
      getLocalFileResponse(metadata, {
        headers: { 'if-none-match': '"unknown"', 'if-modified-since': modifiedDate },
      }).status
    ).toBe(200);
  });

  it('recognizes If-None-Match:* for an existing file even without an emitted ETag', () => {
    expect(
      getLocalFileResponse(metadata, {
        headers: { 'if-none-match': '*', range: 'bytes=0-1' },
      })
    ).toMatchObject({ status: 304, stream: false });
  });

  it.each(['Wed, 30 Sep 2026 12:00:00 GMT', 'Fri, 02 Oct 2026 12:00:00 GMT', 'W/"unknown"'])(
    'returns the whole file when If-Range cannot validate %s',
    (ifRange) => {
      expect(
        getLocalFileResponse(metadata, { headers: { range: 'bytes=0-1', 'if-range': ifRange } })
          .status
      ).toBe(200);
    }
  );

  it('honors If-Range only for the exact Last-Modified date', () => {
    expect(
      getLocalFileResponse(metadata, {
        headers: { range: 'bytes=0-1', 'if-range': modifiedDate },
      }).status
    ).toBe(206);
  });
});
