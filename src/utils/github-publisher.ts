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

import { GitHubDeployConfig } from './cms-types';
import { CompiledStaticFile } from './static-compiler';

export interface GitHubVerifyResponse {
  ok: boolean;
  repoFullName?: string;
  defaultBranch?: string;
  privateRepo?: boolean;
  permissions?: {
    push?: boolean;
    admin?: boolean;
    maintain?: boolean;
  };
  isEmptyRepo?: boolean;
  message: string;
}

export interface GitHubPushResponse {
  ok: boolean;
  status: 'success' | 'error';
  commitSha?: string;
  commitUrl?: string;
  branch: string;
  filesPushed: number;
  message: string;
}

function buildGitHubHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token.trim()}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'Master-CMS-Static-Publisher/2.0'
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
  const token = (ghConfig.fineGrainedToken || '').trim();

  if (!owner || !repo || !token) {
    return {
      ok: false,
      message: 'Please provide Repository Owner, Repository Name, and a GitHub Fine-Grained Token.'
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
      return {
        ok: false,
        message: `GitHub Verification Failed: ${errText}. Ensure the repository exists and the Fine-Grained Token has "Contents: Read and write" access.`
      };
    }

    const data: any = await res.json();
    const canPush = data.permissions ? Boolean(data.permissions.push || data.permissions.admin) : true;
    const isEmptyRepo = Number(data.size) === 0;

    return {
      ok: canPush,
      repoFullName: data.full_name || `${owner}/${repo}`,
      defaultBranch: data.default_branch || 'main',
      privateRepo: Boolean(data.private),
      permissions: data.permissions,
      isEmptyRepo,
      message: canPush
        ? `Connected to ${data.full_name} (Default branch: ${data.default_branch || 'main'}${isEmptyRepo ? ' — Empty repo will be auto-initialized on first push' : ''}). Ready to publish static builds.`
        : `Token has read access to ${data.full_name}, but lacks write ("Contents: Read and write") permission.`
    };
  } catch (err: any) {
    return {
      ok: false,
      message: `Network error connecting to GitHub API: ${err?.message || 'Unknown error'}`
    };
  }
}

/**
 * Bootstrap an empty GitHub repository (0 commits) by creating an initial README.md
 * via the Contents API (`PUT /repos/:owner/:repo/contents/README.md`) so the Git Data API
 * (`git/trees` & `git/commits`) can operate immediately afterwards.
 */
async function bootstrapEmptyGitHubRepoIfNeeded(
  baseUrl: string,
  headers: Record<string, string>,
  branch: string,
  repoOwner: string,
  repoName: string
): Promise<{ bootstrapped: boolean; commitSha?: string; error?: string }> {
  try {
    const readmeContent = `# ${repoName}\n\nStatic public website bundle published via Master CMS Studio.\n`;
    const base64Content = Buffer.from(readmeContent, 'utf-8').toString('base64');

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

/**
 * Push all compiled static public files to GitHub in a single atomic commit
 * using GitHub's Git Data API (Ref -> Commit -> Tree -> New Commit -> Update Ref)
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
      // Check if repository is completely empty (409) or if branch doesn't exist yet (404)
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

      // Try fetching default branch ref if target branch differed
      if (refRes.status === 404 && branch !== defaultBranch) {
        const defaultRefRes = await fetch(`${baseUrl}/git/ref/heads/${encodeURIComponent(defaultBranch)}`, {
          method: 'GET',
          headers
        });
        if (defaultRefRes.ok) {
          const defaultRefData: any = await defaultRefRes.json();
          const defaultHeadSha = defaultRefData?.object?.sha || '';
          if (defaultHeadSha) {
            // Create the new target branch ref pointing to defaultHeadSha
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

      // If still no commit SHA, repository is empty — auto-bootstrap with initial README.md
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

    // 2. Build Tree Entries for all compiled static files
    const treeEntries = files.map((file) => {
      const cleanPath = file.path.replace(/^\/+/, '');
      const fullPath = targetDir ? `${targetDir}/${cleanPath}` : cleanPath;
      return {
        path: fullPath,
        mode: '100644',
        type: 'blob',
        content: file.content
      };
    });

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

    // 3. Create Atomic Commit
    const commitMsg =
      (customCommitMessage || ghConfig.commitMessageTemplate || 'chore(cms): publish static public site update').trim() +
      ` [${new Date().toISOString()}]`;

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

    // 4. Update or Create Branch Reference to point to newCommitSha
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
      commitSha: newCommitSha,
      commitUrl,
      branch,
      filesPushed: files.length,
      message: `Published ${files.length} static public files to ${owner}/${repo}@${branch} (${newCommitSha.slice(0, 7)}).`
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
