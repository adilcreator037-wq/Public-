/**
 * ============================================================================
 * MODULE 5: GITHUB FINE-GRAINED TOKEN STATIC PUBLISHER (github-publisher.ts)
 * Pushes the compiled static public website (`CompiledStaticFile[]`) to any
 * GitHub repository branch (`main`, `gh-pages`, etc.) in a single atomic commit
 * using the GitHub REST Git Data API.
 * - Automatically bootstraps brand-new / empty repositories (0 commits) via the
 *   Contents API before creating the Git Data Tree.
 * - Automatically creates non-default target branches if they do not exist yet.
 * ============================================================================
 */

import crypto from 'crypto';
import { GitHubDeployConfig } from './cms-types';
import { CompiledStaticFile, collectCloudflarePagesRepoSyncFiles } from './static-compiler';

export interface GitHubVerifyResponse {
  success: boolean;
  ok: boolean;
  fullName?: string;
  repoFullName?: string;
  defaultBranch?: string;
  branchChecked?: string;
  branchExists?: boolean;
  private?: boolean;
  privateRepo?: boolean;
  canPush?: boolean;
  permissions?: {
    push?: boolean;
    admin?: boolean;
    maintain?: boolean;
  };
  isEmptyRepo?: boolean;
  error?: string;
  message: string;
}

export interface RemoteGitTreeEntry {
  path: string;
  sha: string;
  type: 'blob' | 'tree' | string;
}

export interface GitTreeDiffResult {
  added: CompiledStaticFile[];
  updated: CompiledStaticFile[];
  unchanged: CompiledStaticFile[];
  deletedPaths: string[];
  changedPaths: string[];
}

export interface GitHubPushResponse {
  ok: boolean;
  status: 'success' | 'error';
  skipped?: boolean;
  commitSha?: string;
  commitUrl?: string;
  branch: string;
  filesPushed: number;
  addedCount?: number;
  updatedCount?: number;
  deletedCount?: number;
  unchangedCount?: number;
  changedPaths?: string[];
  message: string;
}

/**
 * Encode a Git branch ref path segment-by-segment so branch names with slashes
 * (e.g., `deploy/public`) keep raw `/` separators as required by GitHub's Git Refs API.
 */
export function encodeGitRefBranch(branch: string): string {
  return String(branch || 'main')
    .trim()
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

function formatGitHubApiError(status: number, apiMessage: string, context: string): string {
  const detail = (apiMessage || '').trim();
  if (status === 401) {
    return `${context}: GitHub rejected the token (HTTP 401 ${detail || 'Bad credentials'}). Generate a valid Fine-Grained Personal Access Token and save it again.`;
  }
  if (status === 403) {
    if (/rate limit/i.test(detail)) {
      return `${context}: GitHub API rate limit exceeded (HTTP 403). Wait a moment and retry.`;
    }
    return `${context}: GitHub denied write permission (HTTP 403 ${detail || 'Forbidden'}). Ensure your Fine-Grained Token has "Contents: Read and write" access for this repository and that the target branch is not locked by branch protection rules.`;
  }
  if (status === 404) {
    return `${context}: Repository or branch not found (HTTP 404 ${detail || 'Not Found'}). Verify Owner/Repo spelling and ensure your Fine-Grained Token is authorized for this repository.`;
  }
  if (status === 422) {
    return `${context}: GitHub validation error (HTTP 422 ${detail || 'Unprocessable Entity'}).`;
  }
  return `${context}: ${detail || `HTTP ${status}`}`;
}

/**
 * Compute Git's exact blob SHA-1 hash: sha1("blob " + byteLength + "\0" + rawBytes)
 * matching `git hash-object` and GitHub's Git Tree API.
 */
export function computeGitBlobSha1(
  content: string,
  encoding: 'utf-8' | 'base64' = 'utf-8'
): string {
  const buf = encoding === 'base64' ? Buffer.from(content || '', 'base64') : Buffer.from(content || '', 'utf-8');
  const header = Buffer.from(`blob ${buf.byteLength}\0`, 'utf-8');
  return crypto.createHash('sha1').update(header).update(buf).digest('hex');
}

function resolveFullGitPathForFile(file: CompiledStaticFile, prefix: string): string {
  const cleanRel = String(file.path || '').replace(/^\/+/, '');
  if (file.rootRelative) return cleanRel;
  return prefix ? `${prefix}${cleanRel}` : cleanRel;
}

/**
 * Deduplicate files by their final resolved Git repository path (first entry wins)
 * so GitHub `POST /git/trees` never fails with HTTP 422 "Tree entry path is duplicated".
 */
export function dedupeFilesByGitPath(
  files: CompiledStaticFile[],
  targetDir = ''
): CompiledStaticFile[] {
  const cleanTarget = (targetDir || '').trim().replace(/^\/+|\/+$/g, '');
  const prefix = cleanTarget ? `${cleanTarget}/` : '';
  const seen = new Set<string>();
  const deduped: CompiledStaticFile[] = [];
  for (const file of files || []) {
    if (!file || !file.path) continue;
    const fullPath = resolveFullGitPathForFile(file, prefix);
    if (!fullPath || seen.has(fullPath)) continue;
    seen.add(fullPath);
    deduped.push(file);
  }
  return deduped;
}

/**
 * Deterministically compare compiled CMS files against the remote Git tree:
 * - Classifies Added, Updated, and Unchanged files using Git SHA-1 hashes.
 * - Safely detects orphaned CMS-generated routes (deleted articles, legal pages,
 *   stale static-routes/*.json, mirrored public/static-routes/*.json, or disabled SEO files)
 *   within `targetDir`, while strictly preserving non-CMS repository files (`README.md`, `package.json`, `.github/`, `src/`, etc.).
 */
export function diffGitTrees(
  files: CompiledStaticFile[],
  remoteTreeEntries: RemoteGitTreeEntry[],
  targetDir = ''
): GitTreeDiffResult {
  const cleanTarget = (targetDir || '').trim().replace(/^\/+|\/+$/g, '');
  const prefix = cleanTarget ? `${cleanTarget}/` : '';
  const uniqueFiles = dedupeFilesByGitPath(files, cleanTarget);

  const remoteBlobMap = new Map<string, string>();
  const remoteKnownHtmlFromJson = new Set<string>();

  for (const entry of remoteTreeEntries || []) {
    if (entry.type !== 'blob' || !entry.path) continue;
    remoteBlobMap.set(entry.path, entry.sha);

    if (!prefix || entry.path.startsWith(prefix)) {
      const rel = prefix ? entry.path.slice(prefix.length) : entry.path;
      const matchJson = rel.match(/^static-routes\/(.+)\.json$/);
      if (matchJson && matchJson[1] && matchJson[1] !== 'index') {
        const pageRoute = matchJson[1].replace(/--/g, '/');
        remoteKnownHtmlFromJson.add(`${pageRoute}/index.html`);
      }
    }
  }

  const desiredFullPaths = new Set<string>();
  const added: CompiledStaticFile[] = [];
  const updated: CompiledStaticFile[] = [];
  const unchanged: CompiledStaticFile[] = [];
  let hasPublicStaticRoutesMirror = false;

  for (const file of uniqueFiles) {
    const fullPath = resolveFullGitPathForFile(file, prefix);
    desiredFullPaths.add(fullPath);
    if (fullPath.startsWith('public/static-routes/')) {
      hasPublicStaticRoutesMirror = true;
    }

    const existingSha = remoteBlobMap.get(fullPath);
    if (!existingSha) {
      added.push(file);
    } else {
      const nextSha = computeGitBlobSha1(file.content, file.encoding || 'utf-8');
      if (existingSha === nextSha) {
        unchanged.push(file);
      } else {
        updated.push(file);
      }
    }
  }

  const OPTIONAL_SEO_OR_GATE_PATHS = new Set([
    'sitemap.xml',
    'feed.xml',
    'manifest.webmanifest',
    'moreinfo/index.html',
    'download/index.html'
  ]);

  const deletedPaths: string[] = [];
  for (const [remotePath] of remoteBlobMap.entries()) {
    if (desiredFullPaths.has(remotePath)) continue;

    // Also prune stale mirrored `public/static-routes/*.json` files on full Cloudflare/Vite repos
    if (
      hasPublicStaticRoutesMirror &&
      cleanTarget !== 'public' &&
      /^public\/static-routes\/[^/]+\.json$/.test(remotePath)
    ) {
      deletedPaths.push(remotePath);
      continue;
    }

    if (prefix && !remotePath.startsWith(prefix)) continue;

    const rel = prefix ? remotePath.slice(prefix.length) : remotePath;
    const isOrphanedStaticJson = /^static-routes\/[^/]+\.json$/.test(rel);
    const isOrphanedNewsPage = /^news\/[^/]+\/index\.html$/.test(rel);
    const isOrphanedKnownRouteHtml = remoteKnownHtmlFromJson.has(rel);
    const isDisabledManagedFile = OPTIONAL_SEO_OR_GATE_PATHS.has(rel);

    if (isOrphanedStaticJson || isOrphanedNewsPage || isOrphanedKnownRouteHtml || isDisabledManagedFile) {
      deletedPaths.push(remotePath);
    }
  }

  const changedPaths = [
    ...added.map((f) => resolveFullGitPathForFile(f, prefix)),
    ...updated.map((f) => resolveFullGitPathForFile(f, prefix)),
    ...deletedPaths
  ];

  return { added, updated, unchanged, deletedPaths, changedPaths };
}

const GITHUB_FETCH_TIMEOUT_MS = 15000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = GITHUB_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function validateGitHubTargetConfig(ghConfig: Partial<GitHubDeployConfig>): {
  valid: boolean;
  owner: string;
  repo: string;
  branch: string;
  targetDir: string;
  error?: string;
} {
  const owner = (ghConfig.repoOwner || '').trim();
  const repo = (ghConfig.repoName || '').trim();
  const branch = (ghConfig.branch || 'main').trim() || 'main';
  const targetDir = (ghConfig.targetDirectory || '').trim().replace(/^\/+|\/+$/g, '');

  if (owner && !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(owner)) {
    return {
      valid: false,
      owner,
      repo,
      branch,
      targetDir,
      error: 'Invalid GitHub Repository Owner format. Use alphanumeric characters or hyphens only.'
    };
  }
  if (repo && (!/^[a-zA-Z0-9._-]{1,100}$/.test(repo) || repo === '.' || repo === '..')) {
    return {
      valid: false,
      owner,
      repo,
      branch,
      targetDir,
      error: 'Invalid GitHub Repository Name format.'
    };
  }
  if (
    branch.length > 250 ||
    /\.\.|[\u0000-\u001F\u007F\s~^:?*[\]\\]|^\/|\/$|\.$/.test(branch)
  ) {
    return {
      valid: false,
      owner,
      repo,
      branch,
      targetDir,
      error: 'Invalid Git branch name.'
    };
  }
  if (
    targetDir &&
    (targetDir.length > 200 ||
      targetDir.includes('..') ||
      targetDir.includes('\\') ||
      /[\u0000-\u001F\u007F]/.test(targetDir) ||
      targetDir.split('/').some((seg) => !seg || seg === '.' || seg === '..'))
  ) {
    return {
      valid: false,
      owner,
      repo,
      branch,
      targetDir,
      error: 'Invalid target directory path. Path traversal segments ("..") are not allowed.'
    };
  }

  return { valid: true, owner, repo, branch, targetDir };
}

function buildGitHubHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token.trim()}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'Master-CMS-Static-Publisher/3.1'
  };
}

/**
 * Verify Fine-Grained Personal Access Token, Repository Write Access & Target Branch Status
 */
export async function verifyGitHubRepoAccess(
  ghConfig: Partial<GitHubDeployConfig>
): Promise<GitHubVerifyResponse> {
  const validated = validateGitHubTargetConfig(ghConfig);
  const { owner, repo, branch } = validated;
  const token = (ghConfig.fineGrainedToken || '').trim();

  if (!owner || !repo || !token) {
    const msg = 'Please provide Repository Owner, Repository Name, and a GitHub Fine-Grained Token.';
    return {
      success: false,
      ok: false,
      error: msg,
      message: msg
    };
  }

  if (!validated.valid) {
    const msg = validated.error || 'Invalid GitHub repository settings.';
    return {
      success: false,
      ok: false,
      error: msg,
      message: msg
    };
  }

  const headers = buildGitHubHeaders(token);
  const baseUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  try {
    const res = await fetchWithTimeout(baseUrl, { method: 'GET', headers });

    if (!res.ok) {
      let apiMsg = '';
      try {
        const errJson: any = await res.json();
        apiMsg = errJson?.message || '';
      } catch {
        // ignore
      }
      const msg = formatGitHubApiError(res.status, apiMsg, 'GitHub Verification Failed');
      return {
        success: false,
        ok: false,
        error: msg,
        message: msg
      };
    }

    const data: any = await res.json();
    const canPush = data.permissions ? Boolean(data.permissions.push || data.permissions.admin) : true;
    const defaultBranch = data.default_branch || 'main';
    let isEmptyRepo = Number(data.size) === 0;
    let branchExists = false;

    if (!isEmptyRepo) {
      const refCheck = await fetchWithTimeout(
        `${baseUrl}/git/ref/heads/${encodeGitRefBranch(branch)}`,
        { method: 'GET', headers }
      ).catch(() => null);
      if (refCheck) {
        if (refCheck.ok) {
          branchExists = true;
        } else if (refCheck.status === 409) {
          isEmptyRepo = true;
        }
      }
    }

    const fullName = data.full_name || `${owner}/${repo}`;
    const isPrivate = Boolean(data.private);
    const branchNote = isEmptyRepo
      ? 'Empty repo will be auto-initialized on first push'
      : branchExists
        ? `Target branch "${branch}" exists`
        : `Target branch "${branch}" will be auto-created from "${defaultBranch}" on first push`;
    const msg = canPush
      ? `Connected to ${fullName} (${branchNote}). Ready to publish static builds.`
      : `Token has read access to ${fullName}, but lacks write ("Contents: Read and write") permission.`;

    return {
      success: canPush,
      ok: canPush,
      fullName,
      repoFullName: fullName,
      defaultBranch,
      branchChecked: branch,
      branchExists,
      private: isPrivate,
      privateRepo: isPrivate,
      canPush,
      permissions: data.permissions,
      isEmptyRepo,
      message: msg,
      ...(canPush ? {} : { error: msg })
    };
  } catch (err: any) {
    const msg = `Network error connecting to GitHub API: ${err?.message || 'Unknown error'}`;
    return {
      success: false,
      ok: false,
      error: msg,
      message: msg
    };
  }
}

function encodeUtf8ToBase64(text: string): string {
  return Buffer.from(text || '', 'utf-8').toString('base64');
}

async function bootstrapEmptyGitHubRepoIfNeeded(
  baseUrl: string,
  headers: Record<string, string>,
  branch: string,
  _repoOwner: string,
  repoName: string
): Promise<{ bootstrapped: boolean; commitSha?: string; treeSha?: string; error?: string }> {
  try {
    const readmeContent = `# ${repoName}\n\nStatic public website bundle published via Admin Studio.\n`;
    const base64Content = encodeUtf8ToBase64(readmeContent);

    const putRes = await fetchWithTimeout(`${baseUrl}/contents/README.md`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: 'chore: initialize repository for static site deployment',
        content: base64Content,
        branch
      })
    });

    if (!putRes.ok) {
      const errJson: any = await putRes.json().catch(() => ({}));
      return {
        bootstrapped: false,
        error: formatGitHubApiError(putRes.status, errJson?.message || '', 'Empty repo bootstrap failed')
      };
    }

    const putData: any = await putRes.json();
    return {
      bootstrapped: true,
      commitSha: putData?.commit?.sha || '',
      treeSha: putData?.commit?.tree?.sha || ''
    };
  } catch (err: any) {
    return {
      bootstrapped: false,
      error: err?.message || 'Failed bootstrapping empty repository'
    };
  }
}

async function createGitHubBinaryBlob(
  baseUrl: string,
  headers: Record<string, string>,
  base64Content: string
): Promise<string> {
  const blobRes = await fetchWithTimeout(`${baseUrl}/git/blobs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      content: base64Content,
      encoding: 'base64'
    })
  });
  if (!blobRes.ok) {
    const err: any = await blobRes.json().catch(() => ({}));
    throw new Error(formatGitHubApiError(blobRes.status, err?.message || '', 'Binary blob upload failed'));
  }
  const blobData: any = await blobRes.json();
  return blobData.sha;
}

/**
 * Push only changed/added static files (+ remove orphaned CMS routes) to GitHub
 * in a single atomic commit using GitHub's Git Data API.
 * Automatically retries once if another commit lands concurrently (HTTP 422/409).
 */
export async function pushStaticFilesToGitHub(
  ghConfig: GitHubDeployConfig,
  files: CompiledStaticFile[],
  customCommitMessage?: string
): Promise<GitHubPushResponse> {
  const validated = validateGitHubTargetConfig(ghConfig);
  const { owner, repo, branch, targetDir } = validated;
  const token = (ghConfig.fineGrainedToken || '').trim();

  if (!owner || !repo || !token) {
    return {
      ok: false,
      status: 'error',
      branch,
      filesPushed: 0,
      message: 'Missing GitHub configuration (Owner, Repository Name, or Fine-Grained Token).'
    };
  }

  if (!validated.valid) {
    return {
      ok: false,
      status: 'error',
      branch,
      filesPushed: 0,
      message: validated.error || 'Invalid GitHub repository settings.'
    };
  }

  const headers = buildGitHubHeaders(token);
  const baseUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const encodedBranch = encodeGitRefBranch(branch);

  try {
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // 1. Get current branch reference (`heads/{branch}`)
      const refRes = await fetchWithTimeout(`${baseUrl}/git/ref/heads/${encodedBranch}`, {
        method: 'GET',
        headers
      });

      let latestCommitSha = '';
      let baseTreeSha = '';

      if (refRes.ok) {
        const refData: any = await refRes.json();
        latestCommitSha = refData?.object?.sha || '';
      } else if (refRes.status === 409 || refRes.status === 404) {
        const repoInfoRes = await fetchWithTimeout(baseUrl, { method: 'GET', headers });
        if (!repoInfoRes.ok) {
          const repoErr: any = await repoInfoRes.json().catch(() => ({}));
          return {
            ok: false,
            status: 'error',
            branch,
            filesPushed: 0,
            message: formatGitHubApiError(
              repoInfoRes.status,
              repoErr?.message || '',
              `Cannot access repository ${owner}/${repo}`
            )
          };
        }
        const repoInfo: any = await repoInfoRes.json();
        const defaultBranch = repoInfo.default_branch || 'main';

        if (refRes.status === 404 && branch !== defaultBranch) {
          const defaultRefRes = await fetchWithTimeout(
            `${baseUrl}/git/ref/heads/${encodeGitRefBranch(defaultBranch)}`,
            { method: 'GET', headers }
          );
          if (defaultRefRes.ok) {
            const defaultRefData: any = await defaultRefRes.json();
            const defaultHeadSha = defaultRefData?.object?.sha || '';
            if (defaultHeadSha) {
              const createRefRes = await fetchWithTimeout(`${baseUrl}/git/refs`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  ref: `refs/heads/${branch}`,
                  sha: defaultHeadSha
                })
              });
              if (createRefRes.ok) {
                latestCommitSha = defaultHeadSha;
              } else {
                const createErr: any = await createRefRes.json().catch(() => ({}));
                return {
                  ok: false,
                  status: 'error',
                  branch,
                  filesPushed: 0,
                  message: formatGitHubApiError(
                    createRefRes.status,
                    createErr?.message || '',
                    `Failed creating branch "${branch}" from "${defaultBranch}"`
                  )
                };
              }
            }
          }
        }

        if (!latestCommitSha) {
          const boot = await bootstrapEmptyGitHubRepoIfNeeded(baseUrl, headers, branch, owner, repo);
          if (!boot.bootstrapped) {
            return {
              ok: false,
              status: 'error',
              branch,
              filesPushed: 0,
              message: `Repository ${owner}/${repo} is empty and auto-initialization failed: ${boot.error}`
            };
          }
          // Reuse commitSha & treeSha returned directly by PUT /contents/README.md to avoid eventual-consistency 404 races
          latestCommitSha = boot.commitSha || '';
          baseTreeSha = boot.treeSha || '';
          if (!latestCommitSha) {
            const afterBootRef = await fetchWithTimeout(`${baseUrl}/git/ref/heads/${encodedBranch}`, {
              method: 'GET',
              headers
            });
            if (afterBootRef.ok) {
              const afterBootData: any = await afterBootRef.json();
              latestCommitSha = afterBootData?.object?.sha || '';
            }
          }
        }
      } else {
        const refErr: any = await refRes.json().catch(() => ({}));
        return {
          ok: false,
          status: 'error',
          branch,
          filesPushed: 0,
          message: formatGitHubApiError(
            refRes.status,
            refErr?.message || '',
            `Failed reading branch "${branch}" on ${owner}/${repo}`
          )
        };
      }

      if (latestCommitSha && !baseTreeSha) {
        const commitRes = await fetchWithTimeout(`${baseUrl}/git/commits/${latestCommitSha}`, {
          method: 'GET',
          headers
        });
        if (!commitRes.ok) {
          const commitErr: any = await commitRes.json().catch(() => ({}));
          return {
            ok: false,
            status: 'error',
            branch,
            filesPushed: 0,
            message: formatGitHubApiError(
              commitRes.status,
              commitErr?.message || '',
              `Failed loading commit ${latestCommitSha.slice(0, 7)}`
            )
          };
        }
        const commitData: any = await commitRes.json();
        baseTreeSha = commitData?.tree?.sha || '';
      }

      // 2. Fetch Remote Tree Recursively & Compute Smart SHA-1 Diff
      let remoteEntries: RemoteGitTreeEntry[] = [];
      let remoteTreeTruncated = false;
      if (baseTreeSha) {
        const remoteTreeRes = await fetchWithTimeout(`${baseUrl}/git/trees/${baseTreeSha}?recursive=1`, {
          method: 'GET',
          headers
        });
        if (remoteTreeRes.ok) {
          const remoteTreeData: any = await remoteTreeRes.json();
          if (remoteTreeData?.truncated) {
            remoteTreeTruncated = true;
          } else if (Array.isArray(remoteTreeData?.tree)) {
            remoteEntries = remoteTreeData.tree;
          }
        }
      }

      // If the remote repository is a full Cloudflare Pages deployment repository (contains functions/ or vite.config.ts),
      // automatically synchronize root-level Cloudflare Pages runtime files and public/ static-routes so Vite builds on Cloudflare Pages stay 100% in sync.
      const isFullCloudflareRepo = remoteEntries.some(
        (e) => e.path === 'vite.config.ts' || e.path === 'admin.html' || e.path.startsWith('functions/')
      );
      let effectiveFiles: CompiledStaticFile[] = [...files];
      if (isFullCloudflareRepo) {
        const runtimeFiles = collectCloudflarePagesRepoSyncFiles();
        const existingRootPaths = new Set(
          effectiveFiles.filter((f) => f.rootRelative).map((f) => f.path.replace(/^\/+/, ''))
        );
        for (const rf of runtimeFiles) {
          const cleanRf = rf.path.replace(/^\/+/, '');
          if (!existingRootPaths.has(cleanRf)) {
            effectiveFiles.push(rf);
            existingRootPaths.add(cleanRf);
          }
        }
        // Only mirror into `public/` when targetDir is set AND not already `public` (prevents HTTP 422 duplicate paths!)
        if (targetDir && targetDir !== 'public') {
          const PUBLIC_MIRROR_FILES = new Set([
            'sitemap.xml',
            'robots.txt',
            'feed.xml',
            'manifest.webmanifest',
            '_headers'
          ]);
          for (const f of files) {
            if (f.rootRelative) continue;
            const cleanRel = f.path.replace(/^\/+/, '');
            if (cleanRel.startsWith('static-routes/') || PUBLIC_MIRROR_FILES.has(cleanRel)) {
              const pubPath = `public/${cleanRel}`;
              if (!existingRootPaths.has(pubPath)) {
                effectiveFiles.push({
                  ...f,
                  path: pubPath,
                  rootRelative: true
                });
                existingRootPaths.add(pubPath);
              }
            }
          }
        }
      }

      effectiveFiles = dedupeFilesByGitPath(effectiveFiles, targetDir);

      const diff = diffGitTrees(effectiveFiles, remoteEntries, targetDir);
      const totalChanged = diff.added.length + diff.updated.length + diff.deletedPaths.length;

      if (baseTreeSha && !remoteTreeTruncated && remoteEntries.length > 0 && totalChanged === 0) {
        return {
          ok: true,
          status: 'success',
          skipped: true,
          commitSha: latestCommitSha,
          commitUrl: latestCommitSha ? `https://github.com/${owner}/${repo}/commit/${latestCommitSha}` : undefined,
          branch,
          filesPushed: 0,
          addedCount: 0,
          updatedCount: 0,
          deletedCount: 0,
          unchangedCount: diff.unchanged.length,
          changedPaths: [],
          message: `Repository ${owner}/${repo}@${branch} is already up to date (${diff.unchanged.length} static files unchanged — skipped empty commit).`
        };
      }

      // 3. Build Delta Tree Entries (Only Added/Updated Files + Orphan Deletions)
      const filesToUpload =
        !remoteTreeTruncated && remoteEntries.length > 0 ? [...diff.added, ...diff.updated] : effectiveFiles;
      const treeEntries: Array<Record<string, any>> = [];
      const seenTreePaths = new Set<string>();
      const prefix = targetDir ? `${targetDir}/` : '';

      for (const file of filesToUpload) {
        const fullPath = resolveFullGitPathForFile(file, prefix);
        if (!fullPath || seenTreePaths.has(fullPath)) continue;
        seenTreePaths.add(fullPath);
        if (file.encoding === 'base64') {
          const blobSha = await createGitHubBinaryBlob(baseUrl, headers, file.content);
          treeEntries.push({
            path: fullPath,
            mode: '100644',
            type: 'blob',
            sha: blobSha
          });
        } else {
          treeEntries.push({
            path: fullPath,
            mode: '100644',
            type: 'blob',
            content: file.content
          });
        }
      }

      for (const delPath of diff.deletedPaths) {
        if (!delPath || seenTreePaths.has(delPath)) continue;
        seenTreePaths.add(delPath);
        treeEntries.push({
          path: delPath,
          mode: '100644',
          type: 'blob',
          sha: null
        });
      }

      const createTreeBody: Record<string, any> = {
        tree: treeEntries
      };
      if (baseTreeSha) {
        createTreeBody.base_tree = baseTreeSha;
      }

      const treeRes = await fetchWithTimeout(`${baseUrl}/git/trees`, {
        method: 'POST',
        headers,
        body: JSON.stringify(createTreeBody)
      }, 30000);

      if (!treeRes.ok) {
        const errJson: any = await treeRes.json().catch(() => ({}));
        return {
          ok: false,
          status: 'error',
          branch,
          filesPushed: 0,
          message: formatGitHubApiError(
            treeRes.status,
            errJson?.message || '',
            `Failed creating Git Tree on ${owner}/${repo}`
          )
        };
      }

      const treeData: any = await treeRes.json();
      const newTreeSha = treeData.sha;

      // 4. Create Atomic Commit
      const commitMsg =
        (customCommitMessage || ghConfig.commitMessageTemplate || 'chore(cms): publish static public site update').trim() +
        ` (+${diff.added.length}/~${diff.updated.length}/-${diff.deletedPaths.length})`;

      const createCommitBody: Record<string, any> = {
        message: commitMsg,
        tree: newTreeSha
      };
      if (latestCommitSha) {
        createCommitBody.parents = [latestCommitSha];
      }

      const newCommitRes = await fetchWithTimeout(`${baseUrl}/git/commits`, {
        method: 'POST',
        headers,
        body: JSON.stringify(createCommitBody)
      });

      if (!newCommitRes.ok) {
        const errJson: any = await newCommitRes.json().catch(() => ({}));
        return {
          ok: false,
          status: 'error',
          branch,
          filesPushed: 0,
          message: formatGitHubApiError(newCommitRes.status, errJson?.message || '', 'Failed creating Git Commit')
        };
      }

      const newCommitData: any = await newCommitRes.json();
      const newCommitSha = newCommitData.sha;

      // 5. Update or Create Branch Reference to point to newCommitSha
      if (latestCommitSha) {
        const updateRefRes = await fetchWithTimeout(`${baseUrl}/git/refs/heads/${encodedBranch}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            sha: newCommitSha,
            force: false
          })
        });
        if (!updateRefRes.ok) {
          const errJson: any = await updateRefRes.json().catch(() => ({}));
          // Retry cleanly once on concurrent fast-forward conflict (HTTP 422 / 409)
          if (
            attempt < maxAttempts &&
            (updateRefRes.status === 422 || updateRefRes.status === 409) &&
            /fast.?forward|reference|already exists|update/i.test(String(errJson?.message || ''))
          ) {
            continue;
          }
          return {
            ok: false,
            status: 'error',
            branch,
            filesPushed: 0,
            message: formatGitHubApiError(
              updateRefRes.status,
              errJson?.message || '',
              `Failed updating branch ref heads/${branch}`
            )
          };
        }
      } else {
        const createRefRes = await fetchWithTimeout(`${baseUrl}/git/refs`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ref: `refs/heads/${branch}`,
            sha: newCommitSha
          })
        });
        if (!createRefRes.ok) {
          const errJson: any = await createRefRes.json().catch(() => ({}));
          if (attempt < maxAttempts && (createRefRes.status === 422 || createRefRes.status === 409)) {
            continue;
          }
          return {
            ok: false,
            status: 'error',
            branch,
            filesPushed: 0,
            message: formatGitHubApiError(
              createRefRes.status,
              errJson?.message || '',
              `Failed creating branch ref refs/heads/${branch}`
            )
          };
        }
      }

      const commitUrl = `https://github.com/${owner}/${repo}/commit/${newCommitSha}`;
      return {
        ok: true,
        status: 'success',
        skipped: false,
        commitSha: newCommitSha,
        commitUrl,
        branch,
        filesPushed: filesToUpload.length + diff.deletedPaths.length,
        addedCount: diff.added.length,
        updatedCount: diff.updated.length,
        deletedCount: diff.deletedPaths.length,
        unchangedCount: diff.unchanged.length,
        changedPaths: diff.changedPaths.slice(0, 32),
        message: `Published to ${owner}/${repo}@${branch} (${newCommitSha.slice(0, 7)}): +${diff.added.length} added, ~${diff.updated.length} updated, -${diff.deletedPaths.length} pruned (${diff.unchanged.length} unchanged skipped).`
      };
    }

    return {
      ok: false,
      status: 'error',
      branch,
      filesPushed: 0,
      message: `Unable to fast-forward branch "${branch}" after retrying concurrent updates. Please try again.`
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 'error',
      branch,
      filesPushed: 0,
      message: `Unexpected error pushing to GitHub: ${err?.message || 'Unknown error'}`
    };
  }
}
