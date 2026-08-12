import { resolve } from 'node:path';
import { calibrateVault, formatCalibrationReport } from './calibrate';
import { DEFAULT_CONFIG_PATH, loadConfig } from './config';
import { formatDoctorChecks, runDoctor } from './doctor';
import { createNativeHostManifest, defaultNativeManifestPath } from './native-manifest';
import { EXTENSION_ID } from '../shared/extension-identity';
import { DEFAULT_EDGE_USER_DATA_DIR, nativeHostExecutable, projectRoot } from './runtime-paths';
import { runSyncCommand } from './sync-command';
import { installSchedule, scheduleStatus, uninstallSchedule } from './schedule';
import { spawn } from 'node:child_process';
import { repairVoteMetadata } from './repair-vote-metadata';
import { setupInstallation } from './setup';

interface ParsedArgs {
  command?: string;
  positionals: string[];
  flags: Map<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const flags = new Map<string, string | boolean>();
  const positionals: string[] = [];

  for (let index = 0; index < rest.length; index++) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const [rawName, inlineValue] = token.slice(2).split('=', 2);
    if (inlineValue !== undefined) {
      flags.set(rawName, inlineValue);
      continue;
    }
    const next = rest[index + 1];
    if (next && !next.startsWith('--')) {
      flags.set(rawName, next);
      index++;
    } else {
      flags.set(rawName, true);
    }
  }
  return { command, positionals, flags };
}

function flagString(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags.get(name);
  return typeof value === 'string' ? value : undefined;
}

function printHelp(): void {
  process.stdout.write(`zhihu-sync（知乎收藏夹增量归档）

用法:
  zhihu-sync sync --dry-run [--collection <id>] [--json] [--show-browser]
  zhihu-sync sync [--collection <id>] [--comments] [--json] [--show-browser]
  zhihu-sync votes --dry-run [--max-pages 100] [--json] [--show-browser]
  zhihu-sync votes [--max-pages 100] [--min-free-gb 10] [--comments] [--json] [--show-browser]
  zhihu-sync votes-repair-metadata
  zhihu-sync setup [--vault <path>] [--force-config]
  zhihu-sync login
  zhihu-sync schedule install [--hour 4] [--minute 30]
  zhihu-sync schedule status
  zhihu-sync schedule uninstall
  zhihu-sync calibrate --dry-run --vault <path> [--collection <id>] [--json] [--strict]
  zhihu-sync doctor [--vault <path>]
  zhihu-sync native-manifest [--extension-id <id>] [--host-path <path>] [--edge-user-data-dir <path>]

安全约束:
  sync --dry-run 与 calibrate --dry-run 不会修改资料库。
  sync 只处理配置白名单中的收藏夹；本地独有内容永不删除。
`);
}

async function resolveVault(args: ParsedArgs): Promise<string> {
  const explicit = flagString(args, 'vault');
  if (explicit) return resolve(explicit);
  const configPath = flagString(args, 'config') || DEFAULT_CONFIG_PATH;
  const config = await loadConfig(configPath);
  if (config) return config.vaultRoot;
  throw new Error('请使用 --vault <path>，或先提供 ~/.config/zhihu-sync/config.json');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.command
      || args.command === 'help'
      || args.command === '--help'
      || args.command === '-h'
      || args.flags.has('help')) {
    printHelp();
    return;
  }

  if (args.command === 'calibrate') {
    if (!args.flags.has('dry-run')) {
      throw new Error('calibrate 当前必须显式传入 --dry-run；写入模式尚未实现');
    }
    const vault = await resolveVault(args);
    const collectionIds = args.positionals.length
      ? args.positionals
      : [flagString(args, 'collection')].filter((id): id is string => Boolean(id));
    const report = await calibrateVault(vault, collectionIds);
    process.stdout.write(args.flags.has('json')
      ? `${JSON.stringify(report, null, 2)}\n`
      : `${formatCalibrationReport(report)}\n`);
    if (args.flags.has('strict') && report.hasDrift) process.exitCode = 2;
    return;
  }

  if (args.command === 'sync' || args.command === 'votes') {
    const configPath = flagString(args, 'config') || DEFAULT_CONFIG_PATH;
    const isVotes = args.command === 'votes';
    const collectionIds = isVotes ? [] : args.positionals.length
      ? args.positionals
      : [flagString(args, 'collection')].filter((id): id is string => Boolean(id));
    const maxPages = Number(flagString(args, 'max-pages') || 100);
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1000) {
      throw new Error('--max-pages 必须是 1-1000 的整数');
    }
    const timeoutMinutes = Number(flagString(args, 'timeout-minutes') || (isVotes ? 180 : 30));
    if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0 || timeoutMinutes > 1440) {
      throw new Error('--timeout-minutes 必须大于 0 且不超过 1440');
    }
    const minFreeGb = Number(flagString(args, 'min-free-gb') || 10);
    if (!Number.isFinite(minFreeGb) || minFreeGb < 1) {
      throw new Error('--min-free-gb 必须是不小于 1 的数字');
    }
    await runSyncCommand({
      configPath,
      dryRun: args.flags.has('dry-run'),
      comments: args.flags.has('comments'),
      collectionIds,
      json: args.flags.has('json'),
      showBrowser: args.flags.has('show-browser'),
      mode: isVotes ? 'votes' : 'collections',
      maxPages,
      timeoutMinutes,
      minFreeGb,
    });
    return;
  }

  if (args.command === 'login') {
    const edge = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
    const child = spawn(edge, [
      `--user-data-dir=${DEFAULT_EDGE_USER_DATA_DIR}`,
      '--no-first-run',
      '--disable-default-apps',
      `--disable-extensions-except=${resolve(projectRoot(), 'dist')}`,
      `--load-extension=${resolve(projectRoot(), 'dist')}`,
      'https://www.zhihu.com/signin',
    ], { detached: true, stdio: 'ignore' });
    child.unref();
    process.stdout.write('已打开 Zhihu Sync 专用登录窗口。\n');
    return;
  }

  if (args.command === 'setup') {
    const report = await setupInstallation({
      vaultRoot: flagString(args, 'vault'),
      configPath: flagString(args, 'config'),
      forceConfig: args.flags.has('force-config'),
    });
    process.stdout.write([
      'Zhihu Sync 开发者预览版初始化完成。',
      `Native host: ${report.nativeHostPath}`,
      `Native manifest: ${report.nativeManifestPath}`,
      report.configCreated
        ? `已创建配置: ${report.configPath}（请补充收藏夹白名单）`
        : `配置未改写: ${report.configPath}`,
      '',
    ].join('\n'));
    return;
  }

  if (args.command === 'votes-repair-metadata') {
    const vault = await resolveVault(args);
    const report = await repairVoteMetadata(vault);
    process.stdout.write(`已校正赞同回答元数据：扫描 ${report.scanned}，修改 ${report.changed}，移除错误 collected ${report.removedCollected}，规范来源 ${report.normalizedSources}。\n`);
    return;
  }

  if (args.command === 'schedule') {
    const action = args.positionals[0] || 'status';
    if (action === 'install') {
      const hour = Number(flagString(args, 'hour') || 4);
      const minute = Number(flagString(args, 'minute') || 30);
      await installSchedule(hour, minute);
      process.stdout.write(`已安装每日同步：${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}（不含评论）。\n`);
      return;
    }
    if (action === 'status') {
      process.stdout.write(`${await scheduleStatus()}\n`);
      return;
    }
    if (action === 'uninstall') {
      await uninstallSchedule();
      process.stdout.write('已移除每日同步任务。\n');
      return;
    }
    throw new Error(`未知 schedule 操作: ${action}`);
  }

  if (args.command === 'doctor') {
    const explicitVault = flagString(args, 'vault');
    const configPath = flagString(args, 'config') || DEFAULT_CONFIG_PATH;
    let vault = explicitVault ? resolve(explicitVault) : undefined;
    if (!vault) {
      const config = await loadConfig(configPath);
      vault = config?.vaultRoot;
    }
    const checks = await runDoctor(vault, configPath);
    process.stdout.write(`${formatDoctorChecks(checks)}\n`);
    if (checks.some((check) => !check.ok)) process.exitCode = 1;
    return;
  }

  if (args.command === 'native-manifest') {
    const extensionId = flagString(args, 'extension-id') || EXTENSION_ID;
    const hostPath = flagString(args, 'host-path')
      || nativeHostExecutable();
    const edgeUserDataDir = flagString(args, 'edge-user-data-dir');
    const manifest = createNativeHostManifest(extensionId, hostPath);
    process.stdout.write(`${JSON.stringify({
      targetPath: defaultNativeManifestPath(edgeUserDataDir),
      manifest,
      readOnly: true,
    }, null, 2)}\n`);
    return;
  }

  throw new Error(`未知命令: ${args.command}`);
}

main().catch((error) => {
  process.stderr.write(`zhihu-sync: ${(error as Error).message}\n`);
  process.exitCode = 1;
});
