import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FilePreviewContent } from '../../../../ui-lib/src/base/file/preview/FilePreviewContent';
import { FilePreviewContext } from '../../../../ui-lib/src/base/file/preview/FilePreviewContext';
import {
  VideoPreview,
  formatVideoTime,
} from '../../../../ui-lib/src/base/file/preview/video/VideoPreview';

const file = {
  fileId: 'video1',
  src: '/api/attachments/video1',
  name: 'Review.mp4',
  mimetype: 'video/mp4',
};

describe('native video preview', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_PARABOLIC_ENABLED', 'true');
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('uses the attachment MIME type and reports load/decode errors', () => {
    const { container, getByRole, queryByRole, rerender } = render(<VideoPreview {...file} />);
    expect(container.querySelectorAll('source')).toHaveLength(1);
    expect(container.querySelector('source')?.type).toBe('video/mp4');
    const video = container.querySelector('video')!;
    fireEvent.error(video);
    expect(getByRole('alert').textContent).toContain('could not load or decode');
    rerender(<VideoPreview {...file} src="/api/attachments/video2" mimetype="video/webm" />);
    expect(queryByRole('alert')).toBeNull();
    expect(getByRole('status').textContent).toContain('Loading video');
    expect(container.querySelector('source')?.type).toBe('video/webm');
    fireEvent.error(container.querySelector('source')!);
    expect(getByRole('alert').textContent).toContain('could not load or decode');
  });

  it('seeks only from the focused player without navigating to another attachment', () => {
    const parentKeys = vi.fn();
    const { container, getByRole } = render(<VideoPreview {...file} />);
    document.body.addEventListener('keydown', parentKeys);
    const video = container.querySelector('video')!;
    Object.defineProperty(video, 'duration', { configurable: true, value: 30 });
    fireEvent.loadedMetadata(video);
    video.currentTime = 10;
    fireEvent.timeUpdate(video);
    video.focus();
    fireEvent.keyDown(video, { key: 'ArrowRight' });
    expect(video.currentTime).toBe(15);
    expect(parentKeys).not.toHaveBeenCalled();
    const seekSlider = getByRole('slider', { name: 'Video position' });
    fireEvent.keyDown(seekSlider, { key: 'ArrowLeft' });
    expect(video.currentTime).toBe(15);
    expect(parentKeys).not.toHaveBeenCalled();
    fireEvent.keyDown(video, { key: 'Escape' });
    expect(parentKeys).toHaveBeenCalledTimes(1);
    document.body.removeEventListener('keydown', parentKeys);
  });

  it('formats loaded and unknown video times safely', () => {
    expect(formatVideoTime(125.8)).toBe('2:05');
    expect(formatVideoTime(Infinity)).toBe('0:00');
    expect(formatVideoTime(-1)).toBe('0:00');
  });

  it('dismisses only the speed popup on Escape and then lets Escape close the viewer', () => {
    const closePreview = vi.fn();
    const { getByRole, queryByRole } = render(
      <FilePreviewContext.Provider
        value={{
          currentFile: file,
          files: [file],
          mergeFiles: vi.fn(),
          resetFiles: vi.fn(),
          openPreview: vi.fn(),
          closePreview,
          onPrev: vi.fn(),
          onNext: vi.fn(),
          onDelete: vi.fn(),
        }}
      >
        <FilePreviewContent />
      </FilePreviewContext.Provider>
    );
    fireEvent.click(getByRole('button', { name: 'Playback speed: 1×' }));
    fireEvent.keyDown(getByRole('button', { name: '1.5×' }), { key: 'Escape' });
    expect(queryByRole('button', { name: '1.5×' })).toBeNull();
    expect(closePreview).not.toHaveBeenCalled();
    expect(getByRole('dialog')).toBeDefined();
    fireEvent.keyDown(getByRole('button', { name: 'Playback speed: 1×' }), { key: 'Escape' });
    expect(closePreview).toHaveBeenCalledTimes(1);
  });

  it('preserves the upstream browser player when extensions are disabled', () => {
    vi.stubEnv('NEXT_PUBLIC_PARABOLIC_ENABLED', 'false');
    const { container, queryByRole } = render(<VideoPreview {...file} />);
    expect(container.querySelector('video')?.controls).toBe(true);
    expect(queryByRole('group')).toBeNull();
  });
});
