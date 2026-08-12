import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeSyncProgress } from './sync-command';

describe('writeSyncProgress', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps stdout clean in JSON mode', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    writeSyncProgress('progress\n', true);
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith('progress\n');
  });

  it('writes normal progress to stdout outside JSON mode', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    writeSyncProgress('progress\n', false);
    expect(stdout).toHaveBeenCalledWith('progress\n');
    expect(stderr).not.toHaveBeenCalled();
  });
});
