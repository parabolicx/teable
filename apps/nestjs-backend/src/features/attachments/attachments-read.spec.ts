/* eslint-disable @typescript-eslint/naming-convention */
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';
import { Encryptor } from '../../utils/encryptor';
import { AuthGuard } from '../auth/guard/auth.guard';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { DynamicAuthGuardFactory } from './guard/auth.guard';
import { LocalStorage } from './plugins/local';

describe('native local attachment delivery', () => {
  let app: INestApplication;
  let storage: LocalStorage;
  let service: AttachmentsService;
  let temporaryDirectory: string;
  let endpoint: string;
  let token: string;
  const fileBytes = Buffer.from('0123456789');
  const relativePath = 'private/table/fixture';
  const findAttachment = vi.fn();

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'teable-range-test-'));
    await mkdir(join(temporaryDirectory, 'private/table'), { recursive: true });
    await writeFile(join(temporaryDirectory, relativePath), fileBytes);
    storage = Object.create(LocalStorage.prototype) as LocalStorage;
    storage.storageDir = temporaryDirectory;
    storage.expireTokenEncryptor = new Encryptor({
      entries: [{ algorithm: 'aes-128-cbc', key: '73b00476e456323e', iv: '8c9183e4c175f63c' }],
    });
    token = storage.expireTokenEncryptor.encrypt({
      expiresDate: Math.floor(Date.now() / 1000) + 3600,
      respHeaders: { 'Content-Type': 'video/mp4' },
    });
    findAttachment.mockReset().mockResolvedValue({ mimetype: 'video/mp4' });
    service = Object.create(AttachmentsService.prototype) as AttachmentsService;
    Object.assign(service, {
      storageAdapter: storage,
      prismaService: { txClient: () => ({ attachments: { findUnique: findAttachment } }) },
    });

    const module = await Test.createTestingModule({
      controllers: [AttachmentsController],
      providers: [{ provide: AttachmentsService, useValue: service }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(DynamicAuthGuardFactory)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    endpoint = `${await app.getUrl()}/api/attachments/read/${relativePath}`;
  });

  afterEach(async () => {
    await app?.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('streams the full file with its MIME type and size', async () => {
    const response = await fetch(`${endpoint}?token=${token}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(response.headers.get('content-length')).toBe(String(fileBytes.length));
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.has('last-modified')).toBe(true);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(fileBytes);
  });

  it.each([
    ['bytes=0-1', '01', 'bytes 0-1/10'],
    ['bytes=4-', '456789', 'bytes 4-9/10'],
    ['bytes=-3', '789', 'bytes 7-9/10'],
  ])('streams the exact selected file bytes for %s', async (range, expected, contentRange) => {
    const response = await fetch(`${endpoint}?token=${token}`, { headers: { range } });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe(contentRange);
    expect(response.headers.get('content-length')).toBe(String(expected.length));
    expect(await response.text()).toBe(expected);
  });

  it('uses Nest automatic HEAD support without opening a file stream', async () => {
    const read = vi.spyOn(storage, 'read');
    const response = await fetch(`${endpoint}?token=${token}`, {
      method: 'HEAD',
      headers: { range: 'bytes=0-1' },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe('10');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(await response.text()).toBe('');
    expect(read).not.toHaveBeenCalled();
  });

  it('returns 416 and size for an unsatisfiable range without reading the file', async () => {
    const read = vi.spyOn(storage, 'read');
    const response = await fetch(`${endpoint}?token=${token}`, { headers: { range: 'bytes=10-' } });
    expect(response.status).toBe(416);
    expect(response.headers.get('content-range')).toBe('bytes */10');
    expect(response.headers.get('content-length')).toBe('0');
    expect(await response.text()).toBe('');
    expect(read).not.toHaveBeenCalled();
  });

  it('returns 304 after validating the signed token, without reading the file', async () => {
    const metadata = storage.getReadMetadata(relativePath)!;
    const verify = vi.spyOn(storage, 'verifyReadToken');
    const read = vi.spyOn(storage, 'read');
    const response = await fetch(`${endpoint}?token=${token}`, {
      headers: { 'if-modified-since': new Date(metadata.lastModified).toUTCString() },
    });
    expect(response.status).toBe(304);
    expect(await response.text()).toBe('');
    expect(verify).toHaveBeenCalledWith(token);
    expect(read).not.toHaveBeenCalled();
  });

  it.each(['invalid', 'expired'])(
    'rejects an %s token before cache or range metadata',
    async (kind) => {
      const badToken =
        kind === 'invalid'
          ? 'invalid-token'
          : storage.expireTokenEncryptor.encrypt({
              expiresDate: Math.floor(Date.now() / 1000) - 1,
            });
      const metadata = vi.spyOn(storage, 'getReadMetadata');
      const read = vi.spyOn(storage, 'read');
      const response = await fetch(`${endpoint}?token=${badToken}`, {
        headers: { range: 'bytes=10-', 'if-modified-since': 'Thu, 01 Oct 2099 12:00:00 GMT' },
      });
      expect(response.status).toBe(400);
      expect(metadata).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
    }
  );

  it('retains the non-deleted attachment lookup for unsigned reads', async () => {
    const response = await fetch(endpoint, { headers: { range: 'bytes=0-1' } });
    expect(response.status).toBe(206);
    expect(await response.text()).toBe('01');
    expect(findAttachment).toHaveBeenCalledWith({ where: { token: 'fixture', deletedTime: null } });
  });

  it('rejects a missing/deleted attachment before revealing range metadata', async () => {
    findAttachment.mockResolvedValue(null);
    const metadata = vi.spyOn(storage, 'getReadMetadata');
    const response = await fetch(endpoint, {
      headers: { range: 'bytes=10-', 'if-modified-since': 'Thu, 01 Oct 2099 12:00:00 GMT' },
    });
    expect(response.status).toBe(400);
    expect(metadata).not.toHaveBeenCalled();
  });

  it('retains the database check for public files even when a token is supplied', async () => {
    await mkdir(join(temporaryDirectory, 'public/avatar'), { recursive: true });
    await writeFile(join(temporaryDirectory, 'public/avatar/fixture'), fileBytes);
    const verify = vi.spyOn(storage, 'verifyReadToken');
    const response = await fetch(
      `${endpoint.replace(relativePath, 'public/avatar/fixture')}?token=invalid-token`,
      { headers: { range: 'bytes=0-1' } }
    );
    expect(response.status).toBe(206);
    expect(await response.text()).toBe('01');
    expect(findAttachment).toHaveBeenCalledWith({ where: { token: 'fixture', deletedTime: null } });
    expect(verify).not.toHaveBeenCalled();
  });

  it('rejects path traversal before authorization or filesystem reads', async () => {
    const verify = vi.spyOn(storage, 'verifyReadToken');
    const metadata = vi.spyOn(storage, 'getReadMetadata');
    await expect(service.readLocalFile('../private/table/fixture', token)).rejects.toThrow();
    expect(verify).not.toHaveBeenCalled();
    expect(metadata).not.toHaveBeenCalled();
    expect(findAttachment).not.toHaveBeenCalled();
  });

  it('preserves the native download filename encoding for a ranged response', async () => {
    const disposition = encodeURIComponent("attachment; filename*=UTF-8''clip%20one.mp4");
    const response = await fetch(
      `${endpoint}?token=${token}&response-content-disposition=${disposition}`,
      {
        headers: { range: 'bytes=0-1' },
      }
    );
    expect(response.headers.get('content-disposition')).toBe(
      "attachment; filename*=UTF-8''clip%20one.mp4"
    );
    expect(await response.text()).toBe('01');
  });
});
