/**
 * ============================================================================
 * MODULE 5: GITHUB FINE-GRAINED TOKEN STATIC PUBLISHER (github-publisher.ts)
 * Pushes compiled static public website files (`index.html`, `news/...`,
 * `privacy-policy/...`, `static-routes/*.json`, `sitemap.xml`, `robots.txt`)
 * directly from the Live-Firebase Admin to a GitHub repository using a
 * GitHub Fine-Grained Personal Access Token (`github_pat_...` or `ghp_...`).
 * ============================================================================
 */

import { GitHubDeployConfig } from './cms-types';
import { CompiledStaticFile } from './static-compiler';

export interface GitHubVerifyResult {
  ok: boolean;
  repoFullName?: string;
  defaultBranch?: string;
  privateRepo?: boolean;
  permissions?: Record<string, boolean>;
  message: string;
}

export interface GitHubPublishResult {
  ok: boolean;
  status: 'success' | 'local-only' | 'error';
  commitSha?: string;
  commitUrl?: string;
  branch?: string;
  filesPushed: number;
  message: string;
}

function buildGitHubHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token.trim()}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'ApexMobile-Static-CMS-Publisher'
  };
}

/**
 * Verify that the Fine-Grained Token is valid and has access to `repoOwner/repoName`.
 */
export async function verifyGitHubRepoAccess(
  config: Pick<GitHubDeployConfig, 'repoOwner' | 'repoName' | 'branch' | 'fineGrainedToken'>
): Promise<GitHubVerifyResult> {
  const owner = (config.repoOwner || '').trim();
  const repo = (config.repoName || '').trim();
  const token = (config.fineGrainedToken || '').trim();

  if (!owner || !repo || !token) {
    return {
      ok: false,
      message: 'Please provide Repository Owner, Repository Name, and your GitHub Fine-Grained Token.'
    };
  }

  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: buildGitHubHeaders(token)
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return {
        ok: false,
        message: `GitHub API returned ${res.status}: ${errJson.message || res.statusText}. Verify your Fine-Grained Token has "Contents: Read and write" permission on ${owner}/${repo}.`
      };
    }

    const data = await res.json();
    const canPush = data.permissions?.push !== false;

    return {
      ok: canPush,
      repoFullName: data.full_name || `${owner}/${repo}`,
      defaultBranch: data.default_branch || 'main',
      privateRepo: Boolean(data.private),
      permissions: data.permissions || {},
      message: canPush
        ? `Connected to ${data.full_name} (default branch: ${data.default_branch}). Fine-Grained Token verified with write access.`
        : `Connected to ${data.full_name}, but token lacks write/push permissions. Grant "Contents: Read and write" in your Fine-Grained Token settings.`
    };
  } catch (err: any) {
    return {
      ok: false,
      message: `Network error connecting to GitHub API: ${err?.message || 'Unknown error'}`
    };
  }
}

/**
 * Push all compiled static public files to GitHub in a single atomic Git commit
 * using the GitHub Git Data (Trees & Commits) REST API.
 */
export async function pushStaticFilesToGitHub(
  githubConfig: GitHubDeployConfig,
  files: CompiledStaticFile[],
  customCommitMessage?: string
): Promise<GitHubPublishResult> {
  const owner = (githubConfig.repoOwner || '').trim();
  const repo = (githubConfig.repoName || '').trim();
  const branch = (githubConfig.branch || 'main').trim() || 'main';
  const targetDir = (githubConfig.targetDirectory || '').trim().replace(/^\/+|\/+$/g, '');
  const token = (githubConfig.fineGrainedToken || '').trim();

  if (!owner || !repo || !token) {
    return {
      ok: true,
      status: 'local-only',
      filesPushed: files.length,
      message: `Compiled ${files.length} static public files locally (GitHub Fine-Grained Token or repo not configured yet).`
    };
  }

  const headers = {
    ...buildGitHubHeaders(token),
    'Content-Type': 'application/json'
  };
  const baseApi = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  try {
    // 1. Get the current branch reference (`heads/{branch}`)
    const refRes = await fetch(`${baseApi}/git/ref/heads/${encodeURIComponent(branch)}`, {
      method: 'GET',
      headers
    });

    if (!refRes.ok) {
      const errBody = await refRes.json().catch(() => ({}));
      return {
        ok: false,
        status: 'error',
        filesPushed: 0,
        message: `Could not read branch "${branch}" on ${owner}/${repo} (HTTP ${refRes.status}: ${errBody.message || refRes.statusText}). Make sure the repository is initialized with at least one commit on branch "${branch}".`
      };
    }

    const refData = await refRes.json();
    const latestCommitSha: string = refData?.object?.sha;

    // 2. Get the commit object to find the base tree SHA
    const commitRes = await fetch(`${baseApi}/git/commits/${latestCommitSha}`, {
      method: 'GET',
      headers
    });
    if (!commitRes.ok) {
      return {
        ok: false,
        status: 'error',
        filesPushed: 0,
        message: `Failed to retrieve base commit ${latestCommitSha} from GitHub.`
      };
    }
    const commitData = await commitRes.json();
    const baseTreeSha: string = commitData?.tree?.sha;

    // 3. Build the new Git Tree with all compiled static files
    const treeEntries = files.map((file) => {
      const normalizedRelPath = file.path.replace(/^\/+/, '');
      const fullRepoPath = targetDir ? `${targetDir}/${normalizedRelPath}` : normalizedRelPath;
      return {
        path: fullRepoPath,
        mode: '100644',
        type: 'blob',
        content: file.content
      };
    });

    const treeRes = await fetch(`${baseApi}/git/trees`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeEntries
      })
    });

    if (!treeRes.ok) {
      const errBody = await treeRes.json().catch(() => ({}));
      return {
        ok: false,
        status: 'error',
        filesPushed: 0,
        message: `Failed to create Git tree on ${owner}/${repo}: ${errBody.message || treeRes.statusText}`
      };
    }

    const treeData = await treeRes.json();
    const newTreeSha: string = treeData.sha;

    // 4. Create the atomic Git Commit
    const commitMsg =
      (customCommitMessage || '').trim() ||
      (githubConfig.commitMessageTemplate || '').trim() ||
      `chore(static-publish): update ${files.length} compiled static public files from Admin Studio`;

    const newCommitRes = await fetch(`${baseApi}/git/commits`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: commitMsg,
        tree: newTreeSha,
        parents: [latestCommitSha]
      })
    });

    if (!newCommitRes.ok) {
      const errBody = await newCommitRes.json().catch(() => ({}));
      return {
        ok: false,
        status: 'error',
        filesPushed: 0,
        message: `Failed to create Git commit: ${errBody.message || newCommitRes.statusText}`
      };
    }

    const newCommitData = await newCommitRes.json();
    const newCommitSha: string = newCommitData.sha;

    // 5. Update the branch reference to point to the new commit
    const updateRefRes = await fetch(`${baseApi}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        sha: newCommitSha,
        force: false
      })
    });

    if (!updateRefRes.ok) {
      const errBody = await updateRefRes.json().catch(() => ({}));
      return {
        ok: false,
        status: 'error',
        filesPushed: 0,
        message: `Failed to update branch ref heads/${branch}: ${errBody.message || updateRefRes.statusText}`
      };
    }

    const commitUrl = `https://github.com/${owner}/${repo}/commit/${newCommitSha}`;
    return {
      ok: true,
      status: 'success',
      commitSha: newCommitSha,
      commitUrl,
      branch,
      filesPushed: files.length,
      message: `Successfully compiled & pushed ${files.length} static files to ${owner}/${repo}@${branch} (${newCommitSha.slice(0, 7)}).`
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 'error',
      filesPushed: 0,
      message: `GitHub API error during static push: ${err?.message || 'Unknown error'}`
    };
  }
}
