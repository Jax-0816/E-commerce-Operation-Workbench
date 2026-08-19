import { relative, win32 } from 'node:path';

export function isPathContained(
  root: string,
  candidate: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const pathApi = platform === 'win32' ? win32 : { relative };
  const pathFromRoot = pathApi.relative(root, candidate);
  return (
    pathFromRoot === '' ||
    (!pathFromRoot.startsWith('..\\') &&
      !pathFromRoot.startsWith('../') &&
      pathFromRoot !== '..' &&
      !isAbsoluteForPlatform(pathFromRoot, platform))
  );
}

function isAbsoluteForPlatform(path: string, platform: NodeJS.Platform): boolean {
  return platform === 'win32' ? win32.isAbsolute(path) : path.startsWith('/');
}
