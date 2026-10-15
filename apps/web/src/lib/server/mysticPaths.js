import path from 'node:path';

export function resolveMysticPaths(gulfchainRoot) {
  const mysticRoot = '/Volumes/OWC/Mystic';
  const storageDir = path.join(mysticRoot, 'storage');
  const outputsDir = path.join(mysticRoot, 'poolcare_scraper', 'outputs');
  const configuredSqlitePath = process.env.MYSTIC_SQLITE_PATH || '';
  const sqlitePath = configuredSqlitePath
    ? path.resolve(gulfchainRoot, configuredSqlitePath)
    : path.join(storageDir, 'mystic_poolcare_index.sqlite');

  return {
    mysticRoot,
    storageDir,
    outputsDir,
    allUsersDir: path.join(outputsDir, 'all_users'),
    sqlitePath,
    workspacePath: path.join(mysticRoot, 'Mystic.code-workspace')
  };
}
