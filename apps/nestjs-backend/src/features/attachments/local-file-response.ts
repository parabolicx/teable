/* eslint-disable @typescript-eslint/naming-convention */
import type { IncomingHttpHeaders } from 'http';

export interface ILocalFileRequest {
  method?: string;
  headers?: IncomingHttpHeaders;
}

export interface ILocalFileMetadata {
  size: number;
  lastModified: number;
}

export interface ILocalFileRange {
  start: number;
  end: number;
}

// Unsupported or malformed ranges fall back to a full response. A valid range
// that cannot select any bytes is represented by null instead.
function parseByteRange(value: string, size: number): ILocalFileRange | null | undefined {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return;

  const length = BigInt(size);
  if (!match[1]) {
    const suffix = BigInt(match[2]);
    if (!suffix || !length) return null;
    return { start: Number(suffix >= length ? 0n : length - suffix), end: size - 1 };
  }

  const start = BigInt(match[1]);
  const requestedEnd = match[2] ? BigInt(match[2]) : undefined;
  if (requestedEnd !== undefined && requestedEnd < start) return;
  if (start >= length) return null;
  const end = requestedEnd === undefined || requestedEnd >= length ? length - 1n : requestedEnd;
  return { start: Number(start), end: Number(end) };
}

function isNotModified(lastModified: number, headers: IncomingHttpHeaders) {
  const ifNoneMatch = headers['if-none-match'];
  // No ETag is emitted by this endpoint, but * matches any existing file.
  // Other entity tags cannot match and take precedence over date validation.
  if (ifNoneMatch) return ifNoneMatch.trim() === '*';
  const ifModifiedSince = headers['if-modified-since'];
  return Boolean(
    ifModifiedSince && Date.parse(ifModifiedSince) >= Math.floor(lastModified / 1000) * 1000
  );
}

export function getLocalFileResponse(
  metadata: ILocalFileMetadata,
  request: ILocalFileRequest = {}
) {
  const { size, lastModified } = metadata;
  const requestHeaders = request.headers ?? {};
  const method = request.method ?? 'GET';
  const modifiedDate = new Date(lastModified).toUTCString();
  const headers: Record<string, string> = {
    'Accept-Ranges': 'bytes',
    'Last-Modified': modifiedDate,
    'Content-Length': String(size),
  };

  // Evaluate normal cache preconditions before ranges, but only after the
  // service has validated the path and existing read authorization.
  if (isNotModified(lastModified, requestHeaders)) {
    return { status: 304, headers, stream: false };
  }

  // Range is defined for GET. HEAD describes the complete representation and
  // must not open a file stream, even when the client sends Range.
  const rangeHeader = requestHeaders.range;
  const ifRange = requestHeaders['if-range'];
  // This local endpoint has no ETag. Only an exactly matching Last-Modified
  // date can validate If-Range; unknown/weak ETags require a full response.
  const range =
    method === 'GET' && rangeHeader && (!ifRange || ifRange === modifiedDate)
      ? parseByteRange(rangeHeader, size)
      : undefined;

  if (range === null) {
    headers['Content-Range'] = `bytes */${size}`;
    headers['Content-Length'] = '0';
    return { status: 416, headers, stream: false };
  }
  if (range) {
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`;
    headers['Content-Length'] = String(range.end - range.start + 1);
    return { status: 206, headers, range, stream: true };
  }
  return { status: 200, headers, stream: method === 'GET' };
}
