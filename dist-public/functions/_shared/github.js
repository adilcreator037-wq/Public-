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

/**
 * Deterministically compare compiled CMS files against the remote Git tree.
 */
export async function diffEdgeGitTrees(files, remoteTreeEntries, targetDir = '') {
  const cleanTarget = String(targetDir || '').trim().replace(/^\/+|\/+$/g, '');
  const prefix = cleanTarget ? `${cleanTarget}/` : '';

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

  for (const file of files) {
    const cleanRel = String(file.path || '').replace(/^\/+/, '');
    const fullPath = prefix ? `${prefix}${cleanRel}` : cleanRel;
    desiredFullPaths.add(fullPath);

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
    if (prefix && !remotePath.startsWith(prefix)) continue;
    if (desiredFullPaths.has(remotePath)) continue;

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
    ...added.map((f) => (prefix ? `${prefix}${f.path.replace(/^\/+/, '')}` : f.path.replace(/^\/+/, ''))),
    ...updated.map((f) => (prefix ? `${prefix}${f.path.replace(/^\/+/, '')}` : f.path.replace(/^\/+/, ''))),
    ...deletedPaths
  ];

  return { added, updated, unchanged, deletedPaths, changedPaths };
}

export async function verifyGitHubRepoAccessEdge(ghConfig = {}) {
  const owner = cleanEnvVal(ghConfig.repoOwner);
  const repo = cleanEnvVal(ghConfig.repoName);
  const branch = cleanEnvVal(ghConfig.branch) || 'main';
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

  try {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Master-CMS-Edge-Publisher/2.0'
        }
      }
    );

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const msg = `GitHub returned ${res.status}: ${errJson?.message || res.statusText}`;
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
    const isEmptyRepo = Number(repoData?.size) === 0;
    const fullName = repoData.full_name || `${owner}/${repo}`;
    const isPrivate = Boolean(repoData.private);
    const msg = canPush
      ? `Verified write access to ${fullName} (branch: ${branch}${isEmptyRepo ? ' — empty repo auto-initializes on publish' : ''}).`
      : `Read access to ${fullName} succeeded, but Contents write permission is missing.`;
    return {
      success: canPush,
      ok: canPush,
      fullName,
      repoFullName: fullName,
      defaultBranch: repoData.default_branch || 'main',
      branchChecked: branch,
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
    const putRes = await fetch(`${baseUrl}/contents/README.md`, {
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
      return { bootstrapped: false, error: err?.message || `HTTP ${putRes.status}` };
    }
    return { bootstrapped: true };
  } catch (err) {
    return { bootstrapped: false, error: err?.message || 'Failed bootstrapping repository' };
  }
}

export async function pushStaticFilesToGitHubEdge(ghConfig = {}, files = [], customMessage = '') {
  const owner = cleanEnvVal(ghConfig.repoOwner);
  const repo = cleanEnvVal(ghConfig.repoName);
  const branch = cleanEnvVal(ghConfig.branch) || 'main';
  const token = cleanEnvVal(ghConfig.fineGrainedToken);
  const targetDir = cleanEnvVal(ghConfig.targetDirectory).replace(/^\/+|\/+$/g, '');

  if (!owner || !repo || !token) {
    return {
      ok: false,
      status: 'error',
      branch,
      filesPushed: 0,
      message: 'GitHub credentials missing. Configure Owner, Repo & Fine-Grained Token (or env).'
    };
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Master-CMS-Edge-Publisher/2.0'
  };
  const baseUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  try {
    let refRes = await fetch(`${baseUrl}/git/ref/heads/${encodeURIComponent(branch)}`, { headers });
    let latestCommitSha = '';
    let baseTreeSha = '';

    if (refRes.status === 409 || refRes.status === 404) {
      const repoInfoRes = await fetch(baseUrl, { headers });
      if (!repoInfoRes.ok) {
        const repoErr = await repoInfoRes.json().catch(() => ({}));
        return {
          ok: false,
          status: 'error',
          branch,
          filesPushed: 0,
          message: `Cannot access repository ${owner}/${repo}: ${repoErr?.message || `HTTP ${repoInfoRes.status}`}`
        };
      }
      const repoInfo = await repoInfoRes.json();
      const defaultBranch = repoInfo.default_branch || 'main';
      if (refRes.status === 404 && branch !== defaultBranch) {
        const defaultRefRes = await fetch(`${baseUrl}/git/ref/heads/${encodeURIComponent(defaultBranch)}`, { headers });
        if (defaultRefRes.ok) {
          const defData = await defaultRefRes.json();
          const defSha = defData?.object?.sha || '';
          if (defSha) {
            const createRef = await fetch(`${baseUrl}/git/refs`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: defSha })
            });
            if (createRef.ok) latestCommitSha = defSha;
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
        refRes = await fetch(`${baseUrl}/git/ref/heads/${encodeURIComponent(branch)}`, { headers });
      }
    }

    if (!latestCommitSha && refRes.ok) {
      const refData = await refRes.json();
      latestCommitSha = refData?.object?.sha || '';
    }

    if (latestCommitSha) {
      const commitRes = await fetch(`${baseUrl}/git/commits/${latestCommitSha}`, { headers });
      if (commitRes.ok) {
        const commitData = await commitRes.json();
        baseTreeSha = commitData?.tree?.sha || '';
      }
    }

    let remoteEntries = [];
    if (baseTreeSha) {
      const remoteTreeRes = await fetch(`${baseUrl}/git/trees/${baseTreeSha}?recursive=1`, { headers });
      if (remoteTreeRes.ok) {
        const remoteTreeData = await remoteTreeRes.json();
        if (Array.isArray(remoteTreeData?.tree) && !remoteTreeData.truncated) {
          remoteEntries = remoteTreeData.tree;
        }
      }
    }

    const diff = await diffEdgeGitTrees(files, remoteEntries, targetDir);
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

    const filesToUpload = remoteEntries.length > 0 ? [...diff.added, ...diff.updated] : files;
    const treeItems = [];
    for (const file of filesToUpload) {
      const cleanRel = String(file.path || '').replace(/^\/+/, '');
      const finalPath = targetDir ? `${targetDir}/${cleanRel}` : cleanRel;
      if (file.encoding === 'base64') {
        const blobRes = await fetch(`${baseUrl}/git/blobs`, {
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
            message: `Blob upload failed for ${finalPath}: ${errBlob?.message || blobRes.statusText}`
          };
        }
        const blobJson = await blobRes.json();
        treeItems.push({ path: finalPath, mode: '100644', type: 'blob', sha: blobJson.sha });
      } else {
        treeItems.push({ path: finalPath, mode: '100644', type: 'blob', content: file.content });
      }
    }

    for (const delPath of diff.deletedPaths) {
      treeItems.push({ path: delPath, mode: '100644', type: 'blob', sha: null });
    }

    const treeBody = { tree: treeItems };
    if (baseTreeSha) treeBody.base_tree = baseTreeSha;
    const treeRes = await fetch(`${baseUrl}/git/trees`, {
      method: 'POST',
      headers,
      body: JSON.stringify(treeBody)
    });
    if (!treeRes.ok) {
      const errTree = await treeRes.json().catch(() => ({}));
      return { ok: false, status: 'error', branch, filesPushed: 0, message: `Tree failed: ${errTree?.message || treeRes.statusText}` };
    }
    const treeJson = await treeRes.json();

    const commitMsg =
      (customMessage || ghConfig.commitMessageTemplate || 'chore(static-publish): sync static public site from Admin Studio').trim() +
      ` (+${diff.added.length}/~${diff.updated.length}/-${diff.deletedPaths.length})`;

    const newCommitBody = { message: commitMsg, tree: treeJson.sha };
    if (latestCommitSha) newCommitBody.parents = [latestCommitSha];
    const newCommitRes = await fetch(`${baseUrl}/git/commits`, {
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
        message: `Commit creation failed: ${errNewCommit?.message || newCommitRes.statusText}`
      };
    }
    const newCommitJson = await newCommitRes.json();

    const refMethod = latestCommitSha ? 'PATCH' : 'POST';
    const refEndpoint = latestCommitSha ? `${baseUrl}/git/refs/heads/${encodeURIComponent(branch)}` : `${baseUrl}/git/refs`;
    const refPayload = latestCommitSha
      ? { sha: newCommitJson.sha, force: false }
      : { ref: `refs/heads/${branch}`, sha: newCommitJson.sha };

    const updateRefRes = await fetch(refEndpoint, {
      method: refMethod,
      headers,
      body: JSON.stringify(refPayload)
    });
    if (!updateRefRes.ok) {
      const errUpd = await updateRefRes.json().catch(() => ({}));
      return {
        ok: false,
        status: 'error',
        branch,
        filesPushed: 0,
        message: `Branch ref update failed: ${errUpd?.message || updateRefRes.statusText}`
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
