import { describe, expect, it } from 'vitest';

import { AndroidEmulatorService } from '../../src/main/services/android-emulator-service';

describe('android emulator service', () => {
  it('rejects non-APK installs and malformed Android package names before adb work', async () => {
    const service = new AndroidEmulatorService();

    await expect(service.installApk('C:\\Downloads\\claim.zip')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      options: { field: 'apkPath' },
    });
    await expect(service.launchPackage('not a package')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      options: { field: 'packageName' },
    });
  });

  it('starts the configured emulator and waits for boot before launching a package', async () => {
    const commands: Array<readonly string[]> = [];
    const starts: Array<{ file: string; args: readonly string[] }> = [];
    const service = new AndroidEmulatorService({
      adbExecutable: 'adb-test',
      emulatorExecutable: 'C:\\Android\\Sdk\\emulator\\emulator.exe',
      runCommand: async (_file, args) => {
        commands.push(args);
        if (args[0] === 'devices') {
          return { stdout: 'List of devices attached\r\n', stderr: '' };
        }
        if (args[0] === 'wait-for-device') {
          return { stdout: '', stderr: '' };
        }
        if (args[0] === 'shell' && args[1] === 'getprop') {
          return { stdout: '1\r\n', stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
      startProcess: (file, args) => {
        starts.push({ file, args });
      },
      sleep: async () => undefined,
    });

    await service.launchPackage('com.alpha.claim', 'Pixel_8_API_35');

    expect(starts).toEqual([
      {
        file: 'C:\\Android\\Sdk\\emulator\\emulator.exe',
        args: ['-avd', 'Pixel_8_API_35'],
      },
    ]);
    expect(commands).toEqual([
      ['devices'],
      ['wait-for-device'],
      ['shell', 'getprop', 'sys.boot_completed'],
      ['shell', 'monkey', '-p', 'com.alpha.claim', '-c', 'android.intent.category.LAUNCHER', '1'],
    ]);
  });
});
