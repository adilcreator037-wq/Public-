/**
 * Edge-Native GitHub Repository Verifier & Smart Static Atomic Publisher
 * Shared across Cloudflare Pages Functions (zero Node.js dependencies).
 */

import { cleanEnvVal, EMPTY_ADMIN_CONFIG } from './auth.js';
import {
  compileEdgeStaticSiteBundle,
  generateSitemapXmlEdge,
  generateRobotsTxtEdge,
  generateRssFeedXmlEdge,
  generateWebManifestJsonEdge,
  normalizeBaseUrlEdge
} from './static-compiler.js';

export {
  generateSitemapXmlEdge,
  generateRobotsTxtEdge,
  generateRssFeedXmlEdge,
  generateWebManifestJsonEdge,
  normalizeBaseUrlEdge
};

function encodeUtf8ToBase64Edge(input) {
  const bytes = new TextEncoder().encode(String(input || ''));
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function decodeBase64ToBytesEdge(b64) {
  const bin = atob(String(b64 || ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

/**
 * Compute Git's exact blob SHA-1 hash: sha1("blob " + byteLength + "\0" + rawBytes)
 */
export async function computeGitBlobSha1Edge(content, encoding = 'utf-8') {
  const rawBytes =
    encoding === 'base64'
      ? decodeBase64ToBytesEdge(content)
      : new TextEncoder().encode(String(content || ''));
  const headerBytes = new TextEncoder().encode(`blob ${rawBytes.byteLength}\0`);
  const combined = new Uint8Array(headerBytes.byteLength + rawBytes.byteLength);
  combined.set(headerBytes, 0);
  combined.set(rawBytes, headerBytes.byteLength);
  const digest = await crypto.subtle.digest('SHA-1', combined);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function encodeGitRefBranchEdge(branch) {
  return String(branch || 'main')
    .trim()
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

function formatGitHubApiErrorEdge(status, apiMessage, context) {
  const detail = String(apiMessage || '').trim();
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

function resolveFullGitPathEdge(file, prefix) {
  const cleanRel = String(file?.path || '').replace(/^\/+/, '');
  if (file?.rootRelative) return cleanRel;
  return prefix ? `${prefix}${cleanRel}` : cleanRel;
}

export function dedupeFilesByGitPathEdge(files, targetDir = '') {
  const cleanTarget = String(targetDir || '').trim().replace(/^\/+|\/+$/g, '');
  const prefix = cleanTarget ? `${cleanTarget}/` : '';
  const seen = new Set();
  const deduped = [];
  for (const file of files || []) {
    if (!file || !file.path) continue;
    const fullPath = resolveFullGitPathEdge(file, prefix);
    if (!fullPath || seen.has(fullPath)) continue;
    seen.add(fullPath);
    deduped.push(file);
  }
  return deduped;
}

/**
 * Deterministically compare compiled CMS files against the remote Git tree.
 */
export async function diffEdgeGitTrees(files, remoteTreeEntries, targetDir = '') {
  const cleanTarget = String(targetDir || '').trim().replace(/^\/+|\/+$/g, '');
  const prefix = cleanTarget ? `${cleanTarget}/` : '';
  const uniqueFiles = dedupeFilesByGitPathEdge(files, cleanTarget);

  const remoteBlobMap = new Map();
  const remoteKnownHtmlFromJson = new Set();

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

  const desiredFullPaths = new Set();
  const added = [];
  const updated = [];
  const unchanged = [];
  let hasPublicStaticRoutesMirror = false;

  for (const file of uniqueFiles) {
    const fullPath = resolveFullGitPathEdge(file, prefix);
    desiredFullPaths.add(fullPath);
    if (fullPath.startsWith('public/static-routes/')) {
      hasPublicStaticRoutesMirror = true;
    }

    const existingSha = remoteBlobMap.get(fullPath);
    if (!existingSha) {
      added.push(file);
    } else {
      const nextSha = await computeGitBlobSha1Edge(file.content, file.encoding || 'utf-8');
      if (existingSha === nextSha) {
        unchanged.push(file);
      } else {
        updated.push(file);
      }
    }
  }

  const OPTIONAL_MANAGED_PATHS = new Set([
    'sitemap.xml',
    'feed.xml',
    'manifest.webmanifest',
    'moreinfo/index.html',
    'download/index.html'
  ]);

  const deletedPaths = [];
  for (const [remotePath] of remoteBlobMap.entries()) {
    if (desiredFullPaths.has(remotePath)) continue;

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
    const isDisabledManagedFile = OPTIONAL_MANAGED_PATHS.has(rel);

    if (isOrphanedStaticJson || isOrphanedNewsPage || isOrphanedKnownRouteHtml || isDisabledManagedFile) {
      deletedPaths.push(remotePath);
    }
  }

  const changedPaths = [
    ...added.map((f) => resolveFullGitPathEdge(f, prefix)),
    ...updated.map((f) => resolveFullGitPathEdge(f, prefix)),
    ...deletedPaths
  ];

  return { added, updated, unchanged, deletedPaths, changedPaths };
}

const EDGE_GITHUB_TIMEOUT_MS = 15000;

async function fetchWithTimeoutEdge(url, init = {}, timeoutMs = EDGE_GITHUB_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function validateGitHubTargetConfigEdge(ghConfig = {}) {
  const owner = cleanEnvVal(ghConfig.repoOwner);
  const repo = cleanEnvVal(ghConfig.repoName);
  const branch = cleanEnvVal(ghConfig.branch) || 'main';
  const targetDir = cleanEnvVal(ghConfig.targetDirectory).replace(/^\/+|\/+$/g, '');

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

export async function verifyGitHubRepoAccessEdge(ghConfig = {}) {
  const validated = validateGitHubTargetConfigEdge(ghConfig);
  const { owner, repo, branch } = validated;
  const token = cleanEnvVal(ghConfig.fineGrainedToken);

  if (!owner || !repo || !token) {
    const msg = 'Please provide Repository Owner, Repository Name, and Fine-Grained Token.';
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

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Master-CMS-Edge-Publisher/2.1'
  };
  const baseUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  try {
    const res = await fetchWithTimeoutEdge(baseUrl, { headers });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const msg = formatGitHubApiErrorEdge(res.status, errJson?.message || res.statusText, 'GitHub Verification Failed');
      return {
        success: false,
        ok: false,
        error: msg,
        message: msg
      };
    }

    const repoData = await res.json();
    const canPush = repoData?.permissions
      ? Boolean(repoData.permissions.push || repoData.permissions.admin)
      : true;
    const defaultBranch = repoData.default_branch || 'main';
    let isEmptyRepo = Number(repoData?.size) === 0;
    let branchExists = false;

    if (!isEmptyRepo) {
      const refCheck = await fetchWithTimeoutEdge(
        `${baseUrl}/git/ref/heads/${encodeGitRefBranchEdge(branch)}`,
        { headers }
      ).catch(() => null);
      if (refCheck) {
        if (refCheck.ok) {
          branchExists = true;
        } else if (refCheck.status === 409) {
          isEmptyRepo = true;
        }
      }
    }

    const fullName = repoData.full_name || `${owner}/${repo}`;
    const isPrivate = Boolean(repoData.private);
    const branchNote = isEmptyRepo
      ? 'empty repo auto-initializes on publish'
      : branchExists
        ? `target branch "${branch}" exists`
        : `target branch "${branch}" will be auto-created from "${defaultBranch}" on first publish`;
    const msg = canPush
      ? `Verified write access to ${fullName} (${branchNote}).`
      : `Read access to ${fullName} succeeded, but Contents write permission is missing.`;
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
      permissions: repoData.permissions,
      canPush,
      isEmptyRepo,
      message: msg,
      ...(canPush ? {} : { error: msg })
    };
  } catch (err) {
    const msg = `GitHub verification failed: ${err?.message || 'Network error'}`;
    return {
      success: false,
      ok: false,
      error: msg,
      message: msg
    };
  }
}

async function bootstrapEmptyRepoEdge(baseUrl, headers, branch, repo) {
  try {
    const putRes = await fetchWithTimeoutEdge(`${baseUrl}/contents/README.md`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: 'chore: initialize repository for static site deployment',
        content: encodeUtf8ToBase64Edge(`# ${repo}\n\nStatic public website bundle published via Admin Studio.\n`),
        branch
      })
    });
    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      return {
        bootstrapped: false,
        error: formatGitHubApiErrorEdge(putRes.status, err?.message || '', 'Empty repo bootstrap failed')
      };
    }
    const putData = await putRes.json().catch(() => ({}));
    return {
      bootstrapped: true,
      commitSha: putData?.commit?.sha || '',
      treeSha: putData?.commit?.tree?.sha || ''
    };
  } catch (err) {
    return { bootstrapped: false, error: err?.message || 'Failed bootstrapping repository' };
  }
}

export async function pushStaticFilesToGitHubEdge(ghConfig = {}, files = [], customMessage = '') {
  const validated = validateGitHubTargetConfigEdge(ghConfig);
  const { owner, repo, branch, targetDir } = validated;
  const token = cleanEnvVal(ghConfig.fineGrainedToken);

  if (!owner || !repo || !token) {
    return {
      ok: false,
      status: 'error',
      branch,
      filesPushed: 0,
      message: 'GitHub credentials missing. Configure Owner, Repo & Fine-Grained Token (or env).'
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

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Master-CMS-Edge-Publisher/2.1'
  };
  const baseUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const encodedBranch = encodeGitRefBranchEdge(branch);

  try {
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const refRes = await fetchWithTimeoutEdge(`${baseUrl}/git/ref/heads/${encodedBranch}`, { headers });
      let latestCommitSha = '';
      let baseTreeSha = '';

      if (refRes.ok) {
        const refData = await refRes.json();
        latestCommitSha = refData?.object?.sha || '';
      } else if (refRes.status === 409 || refRes.status === 404) {
        const repoInfoRes = await fetchWithTimeoutEdge(baseUrl, { headers });
        if (!repoInfoRes.ok) {
          const repoErr = await repoInfoRes.json().catch(() => ({}));
          return {
            ok: false,
            status: 'error',
            branch,
            filesPushed: 0,
            message: formatGitHubApiErrorEdge(
              repoInfoRes.status,
              repoErr?.message || '',
              `Cannot access repository ${owner}/${repo}`
            )
          };
        }
        const repoInfo = await repoInfoRes.json();
        const defaultBranch = repoInfo.default_branch || 'main';
        if (refRes.status === 404 && branch !== defaultBranch) {
          const defaultRefRes = await fetchWithTimeoutEdge(
            `${baseUrl}/git/ref/heads/${encodeGitRefBranchEdge(defaultBranch)}`,
            { headers }
          );
          if (defaultRefRes.ok) {
            const defData = await defaultRefRes.json();
            const defSha = defData?.object?.sha || '';
            if (defSha) {
              const createRef = await fetchWithTimeoutEdge(`${baseUrl}/git/refs`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: defSha })
              });
              if (createRef.ok) {
                latestCommitSha = defSha;
              } else {
                const createErr = await createRef.json().catch(() => ({}));
                return {
                  ok: false,
                  status: 'error',
                  branch,
                  filesPushed: 0,
                  message: formatGitHubApiErrorEdge(
                    createRef.status,
                    createErr?.message || '',
                    `Failed creating branch "${branch}" from "${defaultBranch}"`
                  )
                };
              }
            }
          }
        }
        if (!latestCommitSha) {
          const boot = await bootstrapEmptyRepoEdge(baseUrl, headers, branch, repo);
          if (!boot.bootstrapped) {
            return {
              ok: false,
              status: 'error',
              branch,
              filesPushed: 0,
              message: `Repository initialization failed: ${boot.error}`
            };
          }
          latestCommitSha = boot.commitSha || '';
          baseTreeSha = boot.treeSha || '';
          if (!latestCommitSha) {
            const afterBootRef = await fetchWithTimeoutEdge(`${baseUrl}/git/ref/heads/${encodedBranch}`, { headers });
            if (afterBootRef.ok) {
              const afterBootData = await afterBootRef.json();
              latestCommitSha = afterBootData?.object?.sha || '';
            }
          }
        }
      } else {
        const refErr = await refRes.json().catch(() => ({}));
        return {
          ok: false,
          status: 'error',
          branch,
          filesPushed: 0,
          message: formatGitHubApiErrorEdge(
            refRes.status,
            refErr?.message || '',
            `Failed reading branch "${branch}" on ${owner}/${repo}`
          )
        };
      }

      if (latestCommitSha && !baseTreeSha) {
        const commitRes = await fetchWithTimeoutEdge(`${baseUrl}/git/commits/${latestCommitSha}`, { headers });
        if (!commitRes.ok) {
          const commitErr = await commitRes.json().catch(() => ({}));
          return {
            ok: false,
            status: 'error',
            branch,
            filesPushed: 0,
            message: formatGitHubApiErrorEdge(
              commitRes.status,
              commitErr?.message || '',
              `Failed loading commit ${latestCommitSha.slice(0, 7)}`
            )
          };
        }
        const commitData = await commitRes.json();
        baseTreeSha = commitData?.tree?.sha || '';
      }

      let remoteEntries = [];
      let remoteTreeTruncated = false;
      if (baseTreeSha) {
        const remoteTreeRes = await fetchWithTimeoutEdge(`${baseUrl}/git/trees/${baseTreeSha}?recursive=1`, { headers });
        if (remoteTreeRes.ok) {
          const remoteTreeData = await remoteTreeRes.json();
          if (remoteTreeData?.truncated) {
            remoteTreeTruncated = true;
          } else if (Array.isArray(remoteTreeData?.tree)) {
            remoteEntries = remoteTreeData.tree;
          }
        }
      }

      const isViteCloudflareRepo = remoteEntries.some(
        (e) => e.path === 'vite.config.ts' || e.path === 'admin.html' || e.path.startsWith('functions/')
      );
      let effectiveFiles = [...files];
      if (isViteCloudflareRepo && targetDir && targetDir !== 'public') {
        const existingRootPaths = new Set(
          effectiveFiles.filter((f) => f.rootRelative).map((f) => String(f.path || '').replace(/^\/+/, ''))
        );
        const PUBLIC_MIRROR_FILES = new Set([
          'sitemap.xml',
          'robots.txt',
          'feed.xml',
          'manifest.webmanifest',
          '_headers'
        ]);
        for (const f of files) {
          if (f.rootRelative) continue;
          const cleanRel = String(f.path || '').replace(/^\/+/, '');
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

      effectiveFiles = dedupeFilesByGitPathEdge(effectiveFiles, targetDir);

      const diff = await diffEdgeGitTrees(effectiveFiles, remoteEntries, targetDir);
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

      const filesToUpload =
        !remoteTreeTruncated && remoteEntries.length > 0 ? [...diff.added, ...diff.updated] : effectiveFiles;
      const treeItems = [];
      const seenTreePaths = new Set();
      const prefix = targetDir ? `${targetDir}/` : '';

      for (const file of filesToUpload) {
        const finalPath = resolveFullGitPathEdge(file, prefix);
        if (!finalPath || seenTreePaths.has(finalPath)) continue;
        seenTreePaths.add(finalPath);
        if (file.encoding === 'base64') {
          const blobRes = await fetchWithTimeoutEdge(`${baseUrl}/git/blobs`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ content: file.content, encoding: 'base64' })
          });
          if (!blobRes.ok) {
            const errBlob = await blobRes.json().catch(() => ({}));
            return {
              ok: false,
              status: 'error',
              branch,
              filesPushed: 0,
              message: formatGitHubApiErrorEdge(
                blobRes.status,
                errBlob?.message || blobRes.statusText,
                `Blob upload failed for ${finalPath}`
              )
            };
          }
          const blobJson = await blobRes.json();
          treeItems.push({ path: finalPath, mode: '100644', type: 'blob', sha: blobJson.sha });
        } else {
          treeItems.push({ path: finalPath, mode: '100644', type: 'blob', content: file.content });
        }
      }

      for (const delPath of diff.deletedPaths) {
        if (!delPath || seenTreePaths.has(delPath)) continue;
        seenTreePaths.add(delPath);
        treeItems.push({ path: delPath, mode: '100644', type: 'blob', sha: null });
      }

      const treeBody = { tree: treeItems };
      if (baseTreeSha) treeBody.base_tree = baseTreeSha;
      const treeRes = await fetchWithTimeoutEdge(
        `${baseUrl}/git/trees`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(treeBody)
        },
        30000
      );
      if (!treeRes.ok) {
        const errTree = await treeRes.json().catch(() => ({}));
        return {
          ok: false,
          status: 'error',
          branch,
          filesPushed: 0,
          message: formatGitHubApiErrorEdge(
            treeRes.status,
            errTree?.message || treeRes.statusText,
            `Failed creating Git Tree on ${owner}/${repo}`
          )
        };
      }
      const treeJson = await treeRes.json();

      const commitMsg =
        (customMessage || ghConfig.commitMessageTemplate || 'chore(static-publish): sync static public site from Admin Studio').trim() +
        ` (+${diff.added.length}/~${diff.updated.length}/-${diff.deletedPaths.length})`;

      const newCommitBody = { message: commitMsg, tree: treeJson.sha };
      if (latestCommitSha) newCommitBody.parents = [latestCommitSha];
      const newCommitRes = await fetchWithTimeoutEdge(`${baseUrl}/git/commits`, {
        method: 'POST',
        headers,
        body: JSON.stringify(newCommitBody)
      });
      if (!newCommitRes.ok) {
        const errNewCommit = await newCommitRes.json().catch(() => ({}));
        return {
          ok: false,
          status: 'error',
          branch,
          filesPushed: 0,
          message: formatGitHubApiErrorEdge(
            newCommitRes.status,
            errNewCommit?.message || newCommitRes.statusText,
            'Commit creation failed'
          )
        };
      }
      const newCommitJson = await newCommitRes.json();

      const refMethod = latestCommitSha ? 'PATCH' : 'POST';
      const refEndpoint = latestCommitSha
        ? `${baseUrl}/git/refs/heads/${encodedBranch}`
        : `${baseUrl}/git/refs`;
      const refPayload = latestCommitSha
        ? { sha: newCommitJson.sha, force: false }
        : { ref: `refs/heads/${branch}`, sha: newCommitJson.sha };

      const updateRefRes = await fetchWithTimeoutEdge(refEndpoint, {
        method: refMethod,
        headers,
        body: JSON.stringify(refPayload)
      });
      if (!updateRefRes.ok) {
        const errUpd = await updateRefRes.json().catch(() => ({}));
        if (
          attempt < maxAttempts &&
          (updateRefRes.status === 422 || updateRefRes.status === 409) &&
          /fast.?forward|reference|already exists|update/i.test(String(errUpd?.message || ''))
        ) {
          continue;
        }
        return {
          ok: false,
          status: 'error',
          branch,
          filesPushed: 0,
          message: formatGitHubApiErrorEdge(
            updateRefRes.status,
            errUpd?.message || updateRefRes.statusText,
            `Branch ref update failed for heads/${branch}`
          )
        };
      }

      const commitUrl = `https://github.com/${owner}/${repo}/commit/${newCommitJson.sha}`;
      return {
        ok: true,
        status: 'success',
        skipped: false,
        commitSha: newCommitJson.sha,
        commitUrl,
        branch,
        filesPushed: filesToUpload.length + diff.deletedPaths.length,
        addedCount: diff.added.length,
        updatedCount: diff.updated.length,
        deletedCount: diff.deletedPaths.length,
        unchangedCount: diff.unchanged.length,
        changedPaths: diff.changedPaths.slice(0, 32),
        message: `Published to ${owner}/${repo}@${branch} (${newCommitJson.sha.slice(0, 7)}): +${diff.added.length} added, ~${diff.updated.length} updated, -${diff.deletedPaths.length} pruned (${diff.unchanged.length} unchanged skipped).`
      };
    }

    return {
      ok: false,
      status: 'error',
      branch,
      filesPushed: 0,
      message: `Unable to fast-forward branch "${branch}" after retrying concurrent updates. Please try again.`
    };
  } catch (err) {
    return {
      ok: false,
      status: 'error',
      branch,
      filesPushed: 0,
      message: `GitHub publish failed: ${err?.message || 'Network error'}`
    };
  }
}

export function buildEdgeStaticFiles(config, options = {}) {
  const safeCfg = config || EMPTY_ADMIN_CONFIG;
  return compileEdgeStaticSiteBundle(safeCfg, options);
}
