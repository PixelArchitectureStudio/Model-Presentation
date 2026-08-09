const API_ROOT = 'https://api.github.com';

function headers(token, json = true) {
  const result = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (json) result['Content-Type'] = 'application/json';
  if (token) result.Authorization = `Bearer ${token}`;
  return result;
}

async function githubRequest(path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: { ...headers(options.token), ...(options.headers || {}) },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `GitHub request failed (${response.status})`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function bytesToBase64(bytes) {
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function fileToBase64(file) {
  return bytesToBase64(new Uint8Array(await file.arrayBuffer()));
}

async function createBlob(config, content, isBase64 = false) {
  return githubRequest(`/repos/${config.owner}/${config.repo}/git/blobs`, {
    method: 'POST',
    token: config.token,
    body: JSON.stringify({ content, encoding: isBase64 ? 'base64' : 'utf-8' }),
  });
}

export async function publishFiles(config, files, message) {
  const ref = await githubRequest(`/repos/${config.owner}/${config.repo}/git/ref/heads/${encodeURIComponent(config.branch)}`, { token: config.token });
  const commit = await githubRequest(`/repos/${config.owner}/${config.repo}/git/commits/${ref.object.sha}`, { token: config.token });

  const treeItems = [];
  for (const file of files) {
    const content = file.file ? await fileToBase64(file.file) : file.content;
    const blob = await createBlob(config, content, Boolean(file.file));
    treeItems.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  const tree = await githubRequest(`/repos/${config.owner}/${config.repo}/git/trees`, {
    method: 'POST',
    token: config.token,
    body: JSON.stringify({ base_tree: commit.tree.sha, tree: treeItems }),
  });
  const nextCommit = await githubRequest(`/repos/${config.owner}/${config.repo}/git/commits`, {
    method: 'POST',
    token: config.token,
    body: JSON.stringify({ message, tree: tree.sha, parents: [ref.object.sha] }),
  });
  await githubRequest(`/repos/${config.owner}/${config.repo}/git/refs/heads/${encodeURIComponent(config.branch)}`, {
    method: 'PATCH',
    token: config.token,
    body: JSON.stringify({ sha: nextCommit.sha, force: false }),
  });
  return nextCommit;
}

export async function verifyRepository(config) {
  try {
    const repository = await githubRequest(`/repos/${config.owner}/${config.repo}`, { token: config.token });
    await githubRequest(`/repos/${config.owner}/${config.repo}/git/ref/heads/${encodeURIComponent(config.branch)}`, { token: config.token });
    return repository;
  } catch (error) {
    if (/not found/i.test(error.message)) {
      throw new Error('The token cannot access Model-Presentation. Edit the token and select this repository under Repository access.');
    }
    throw error;
  }
}

export async function fetchIssueComments(owner, repo, issueNumber) {
  return githubRequest(`/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`);
}

export async function findViewIssue(owner, repo, projectSlug, viewId) {
  const marker = `[${projectSlug}:${viewId}]`;
  const query = encodeURIComponent(`repo:${owner}/${repo} "${marker}" in:title type:issue`);
  const result = await githubRequest(`/search/issues?q=${query}&per_page=10`);
  return (result.items || []).find((issue) => issue.title.includes(marker)) || null;
}

export async function readRepositoryJson(config, path) {
  const data = await githubRequest(`/repos/${config.owner}/${config.repo}/contents/${path}?ref=${encodeURIComponent(config.branch)}`, { token: config.token });
  const decoded = atob((data.content || '').replace(/\n/g, ''));
  const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}
