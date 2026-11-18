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

/**
 * Deterministically compare compiled CMS files against the remote Git tree:
 * - Classifies Added, Updated, and Unchanged files using Git SHA-1 hashes.
 * - Safely detects orphaned CMS-generated routes (deleted articles, legal pages,
 *   stale static-routes/*.json, or disabled SEO files) within `targetDir`, while
 *   strictly preserving non-CMS repository files (`README.md`, `package.json`, `.github/`, `src/`, etc.).
 */
export function diffGitTrees(
  files: CompiledStaticFile[],
  remoteTreeEntries: RemoteGitTreeEntry[],
  targetDir = ''
): GitTreeDiffResult {
  const cleanTarget = (targetDir || '').trim().replace(/^\/+|\/+$/g, '');
  const prefix = cleanTarget ? `${cleanTarget}/` : '';

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

  const resolveFullGitPath = (file: CompiledStaticFile): string => {
    const cleanRel = file.path.replace(/^\/+/, '');
    if (file.rootRelative) return cleanRel;
    return prefix ? `${prefix}${cleanRel}` : cleanRel;
  };

  for (const file of files) {
    const fullPath = resolveFullGitPath(file);
    desiredFullPaths.add(fullPath);

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
    if (prefix && !remotePath.startsWith(prefix)) continue;
    if (desiredFullPaths.has(remotePath)) continue;

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
    ...added.map((f) => resolveFullGitPath(f)),
    ...updated.map((f) => resolveFullGitPath(f)),
    ...deletedPaths
  ];

  return { added, updated, unchanged, deletedPaths, changedPaths };
}

function buildGitHubHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token.trim()}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'Master-CMS-Static-Publisher/3.0'
  };
}

/**
 * Verify Fine-Grained Personal Access Token & Repository Write Access
 */
export async function verifyGitHubRepoAccess(
  ghConfig: Partial<GitHubDeployConfig>
): Promise<GitHubVerifyResponse> {
  const owner = (ghConfig.repoOwner || '').trim();
  const repo = (ghConfig.repoName || '').trim();
  const branch = (ghConfig.branch || 'main').trim() || 'main';
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

  try {
    const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
      method: 'GET',
      headers: buildGitHubHeaders(token)
    });

    if (!res.ok) {
      let errText = `HTTP ${res.status}`;
      try {
        const errJson: any = await res.json();
        if (errJson?.message) errText = `${errJson.message} (HTTP ${res.status})`;
      } catch {
        // ignore
      }
      const msg = `GitHub Verification Failed: ${errText}. Ensure the repository exists and the Fine-Grained Token has "Contents: Read and write" access.`;
      return {
        success: false,
        ok: false,
        error: msg,
        message: msg
      };
    }

    const data: any = await res.json();
    const canPush = data.permissions ? Boolean(data.permissions.push || data.permissions.admin) : true;
    const isEmptyRepo = Number(data.size) === 0;
    const fullName = data.full_name || `${owner}/${repo}`;
    const isPrivate = Boolean(data.private);
    const msg = canPush
      ? `Connected to ${fullName} (Default branch: ${data.default_branch || 'main'}${isEmptyRepo ? ' — Empty repo will be auto-initialized on first push' : ''}). Ready to publish static builds.`
      : `Token has read access to ${fullName}, but lacks write ("Contents: Read and write") permission.`;

    return {
      success: canPush,
      ok: canPush,
      fullName,
      repoFullName: fullName,
      defaultBranch: data.default_branch || 'main',
      branchChecked: branch,
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
): Promise<{ bootstrapped: boolean; commitSha?: string; error?: string }> {
  try {
    const readmeContent = `# ${repoName}\n\nStatic public website bundle published via Admin Studio.\n`;
    const base64Content = encodeUtf8ToBase64(readmeContent);

    const putRes = await fetch(`${baseUrl}/contents/README.md`, {
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
        error: errJson?.message || `HTTP ${putRes.status}`
      };
    }

    const putData: any = await putRes.json();
    return {
      bootstrapped: true,
      commitSha: putData?.commit?.sha
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
  const blobRes = await fetch(`${baseUrl}/git/blobs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      content: base64Content,
      encoding: 'base64'
    })
  });
  if (!blobRes.ok) {
    const err: any = await blobRes.json().catch(() => ({}));
    throw new Error(`Failed uploading binary blob: ${err?.message || `HTTP ${blobRes.status}`}`);
  }
  const blobData: any = await blobRes.json();
  return blobData.sha;
}

/**
 * Push only changed/added static files (+ remove orphaned CMS routes) to GitHub
 * in a single atomic commit using GitHub's Git Data API.
 */
export async function pushStaticFilesToGitHub(
  ghConfig: GitHubDeployConfig,
  files: CompiledStaticFile[],
  customCommitMessage?: string
): Promise<GitHubPushResponse> {
  const owner = (ghConfig.repoOwner || '').trim();
  const repo = (ghConfig.repoName || '').trim();
  const branch = (ghConfig.branch || 'main').trim() || 'main';
  const token = (ghConfig.fineGrainedToken || '').trim();
  const targetDir = (ghConfig.targetDirectory || '').trim().replace(/^\/+|\/+$/g, '');

  if (!owner || !repo || !token) {
    return {
      ok: false,
      status: 'error',
      branch,
      filesPushed: 0,
      message: 'Missing GitHub configuration (Owner, Repository Name, or Fine-Grained Token).'
    };
  }

  const headers = buildGitHubHeaders(token);
  const baseUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  try {
    // 1. Get current branch reference (`heads/{branch}`)
    let refRes = await fetch(`${baseUrl}/git/ref/heads/${encodeURIComponent(branch)}`, {
      method: 'GET',
      headers
    });

    let latestCommitSha = '';
    let baseTreeSha = '';

    if (refRes.status === 409 || refRes.status === 404) {
      const repoInfoRes = await fetch(baseUrl, { method: 'GET', headers });
      if (!repoInfoRes.ok) {
        const repoErr: any = await repoInfoRes.json().catch(() => ({}));
        return {
          ok: false,
          status: 'error',
          branch,
          filesPushed: 0,
          message: `Cannot access repository ${owner}/${repo}: ${repoErr?.message || `HTTP ${repoInfoRes.status}`}`
        };
      }
      const repoInfo: any = await repoInfoRes.json();
      const defaultBranch = repoInfo.default_branch || 'main';

      if (refRes.status === 404 && branch !== defaultBranch) {
        const defaultRefRes = await fetch(`${baseUrl}/git/ref/heads/${encodeURIComponent(defaultBranch)}`, {
          method: 'GET',
          headers
        });
        if (defaultRefRes.ok) {
          const defaultRefData: any = await defaultRefRes.json();
          const defaultHeadSha = defaultRefData?.object?.sha || '';
          if (defaultHeadSha) {
            const createRefRes = await fetch(`${baseUrl}/git/refs`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                ref: `refs/heads/${branch}`,
                sha: defaultHeadSha
              })
            });
            if (createRefRes.ok) {
              latestCommitSha = defaultHeadSha;
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
        refRes = await fetch(`${baseUrl}/git/ref/heads/${encodeURIComponent(branch)}`, {
          method: 'GET',
          headers
        });
      }
    }

    if (!latestCommitSha && refRes.ok) {
      const refData: any = await refRes.json();
      latestCommitSha = refData?.object?.sha || '';
    }

    if (latestCommitSha) {
      const commitRes = await fetch(`${baseUrl}/git/commits/${latestCommitSha}`, {
        method: 'GET',
        headers
      });
      if (commitRes.ok) {
        const commitData: any = await commitRes.json();
        baseTreeSha = commitData?.tree?.sha || '';
      }
    }

    // 2. Fetch Remote Tree Recursively & Compute Smart SHA-1 Diff
    let remoteEntries: RemoteGitTreeEntry[] = [];
    if (baseTreeSha) {
      const remoteTreeRes = await fetch(`${baseUrl}/git/trees/${baseTreeSha}?recursive=1`, {
        method: 'GET',
        headers
      });
      if (remoteTreeRes.ok) {
        const remoteTreeData: any = await remoteTreeRes.json();
        if (Array.isArray(remoteTreeData?.tree) && !remoteTreeData.truncated) {
          remoteEntries = remoteTreeData.tree;
        }
      }
    }

    // If the remote repository is a full Cloudflare Pages deployment repository (contains functions/ or vite.config.ts),
    // automatically synchronize root-level Cloudflare Pages runtime files and public/ static-routes so Vite builds on Cloudflare Pages stay 100% in sync.
    const isFullCloudflareRepo = remoteEntries.some(
      (e) => e.path === 'vite.config.ts' || e.path === 'admin.html' || e.path.startsWith('functions/')
    );
    let effectiveFiles = [...files];
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
      if (targetDir) {
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

    const diff = diffGitTrees(effectiveFiles, remoteEntries, targetDir);
    const totalChanged = diff.added.length + diff.updated.length + diff.deletedPaths.length;

    if (baseTreeSha && remoteEntries.length > 0 && totalChanged === 0) {
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
    const filesToUpload = remoteEntries.length > 0 ? [...diff.added, ...diff.updated] : effectiveFiles;
    const treeEntries: Array<Record<string, any>> = [];

    for (const file of filesToUpload) {
      const cleanPath = file.path.replace(/^\/+/, '');
      const fullPath = file.rootRelative ? cleanPath : targetDir ? `${targetDir}/${cleanPath}` : cleanPath;
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

    const treeRes = await fetch(`${baseUrl}/git/trees`, {
      method: 'POST',
      headers,
      body: JSON.stringify(createTreeBody)
    });

    if (!treeRes.ok) {
      const errJson: any = await treeRes.json().catch(() => ({}));
      return {
        ok: false,
        status: 'error',
        branch,
        filesPushed: 0,
        message: `Failed creating Git Tree on ${owner}/${repo}: ${errJson?.message || `HTTP ${treeRes.status}`}`
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

    const newCommitRes = await fetch(`${baseUrl}/git/commits`, {
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
        message: `Failed creating Git Commit: ${errJson?.message || `HTTP ${newCommitRes.status}`}`
      };
    }

    const newCommitData: any = await newCommitRes.json();
    const newCommitSha = newCommitData.sha;

    // 5. Update or Create Branch Reference to point to newCommitSha
    if (latestCommitSha) {
      const updateRefRes = await fetch(`${baseUrl}/git/refs/heads/${encodeURIComponent(branch)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          sha: newCommitSha,
          force: false
        })
      });
      if (!updateRefRes.ok) {
        const errJson: any = await updateRefRes.json().catch(() => ({}));
        return {
          ok: false,
          status: 'error',
          branch,
          filesPushed: 0,
          message: `Failed updating branch ref heads/${branch}: ${errJson?.message || `HTTP ${updateRefRes.status}`}`
        };
      }
    } else {
      const createRefRes = await fetch(`${baseUrl}/git/refs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ref: `refs/heads/${branch}`,
          sha: newCommitSha
        })
      });
      if (!createRefRes.ok) {
        const errJson: any = await createRefRes.json().catch(() => ({}));
        return {
          ok: false,
          status: 'error',
          branch,
          filesPushed: 0,
          message: `Failed creating branch ref refs/heads/${branch}: ${errJson?.message || `HTTP ${createRefRes.status}`}`
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
