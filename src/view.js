import '@google/model-viewer';
import { fetchIssueComments, findViewIssue } from './github.js';

const $ = (selector) => document.querySelector(selector);
const viewer = $('#clientViewer');
const state = { project: null, activeView: null };

function projectId() {
  return new URLSearchParams(window.location.search).get('id');
}

function projectAsset(path) {
  return new URL(path, new URL('./', window.location.href)).href;
}

function setError(message) {
  $('#viewerState').textContent = message;
  $('#clientProjectName').textContent = 'Presentation unavailable';
  $('#clientProjectNote').textContent = 'Check the shared link or ask the architect for an updated presentation.';
}

function applyCamera(view) {
  viewer.cameraOrbit = view.orbit;
  viewer.cameraTarget = view.target;
  viewer.fieldOfView = view.fieldOfView;
  viewer.jumpCameraToGoal();
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));
}

async function showComments(view) {
  const list = $('#commentsList');
  list.innerHTML = '<div class="comments-empty">Loading comments…</div>';
  const { owner, name } = state.project.repository;
  try {
    const issue = view.issueNumber
      ? { number: view.issueNumber, html_url: `https://github.com/${owner}/${name}/issues/${view.issueNumber}`, body: '' }
      : await findViewIssue(owner, name, state.project.slug, view.id);
    $('#addComment').hidden = false;
    if (!issue) {
      const title = `[${state.project.slug}:${view.id}] ${view.name}`;
      const body = `Client discussion for ${state.project.name} — camera view ${view.name}.`;
      $('#addComment').href = `https://github.com/${owner}/${name}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
      $('#addComment').textContent = 'Start discussion on GitHub';
      $('#commentCount').textContent = '0';
      list.innerHTML = '<div class="comments-empty">No client discussion yet.</div>';
      return;
    }
    $('#addComment').href = issue.html_url;
    $('#addComment').textContent = 'Add comment on GitHub';
    const comments = await fetchIssueComments(owner, name, issue.number);
    $('#commentCount').textContent = comments.length;
    if (!comments.length) {
      list.innerHTML = issue.body
        ? `<article class="comment-card"><div class="comment-meta">Discussion started</div><p></p></article>`
        : '<div class="comments-empty">No client comments yet.</div>';
      const body = list.querySelector('.comment-card p');
      if (body) body.textContent = issue.body;
      return;
    }
    list.innerHTML = '';
    comments.forEach((comment) => {
      const article = document.createElement('article');
      article.className = 'comment-card';
      const header = document.createElement('div');
      header.className = 'comment-meta';
      header.textContent = `${comment.user.login} · ${formatDate(comment.created_at)}`;
      const body = document.createElement('p');
      body.textContent = comment.body;
      article.append(header, body);
      list.append(article);
    });
  } catch {
    list.innerHTML = '<div class="comments-empty">Comments could not be loaded right now.</div>';
  }
}

function selectView(view, index) {
  state.activeView = view;
  applyCamera(view);
  document.querySelectorAll('.client-view-button').forEach((button, buttonIndex) => button.classList.toggle('active', index === buttonIndex));
  $('#viewDetail').hidden = false;
  $('#activeViewNumber').textContent = String(index + 1).padStart(2, '0');
  $('#activeViewName').textContent = view.name;
  $('#activeViewNote').textContent = view.note || 'No architect note for this view.';
  showComments(view);
}

function renderViews() {
  const container = $('#clientViews');
  container.innerHTML = '';
  state.project.views.forEach((view, index) => {
    const button = document.createElement('button');
    button.className = 'client-view-button';
    button.type = 'button';
    button.innerHTML = `<span>${String(index + 1).padStart(2, '0')}</span><strong></strong><i></i>`;
    button.querySelector('strong').textContent = view.name;
    button.setAttribute('aria-label', `Open saved camera view ${view.name}`);
    button.addEventListener('click', () => selectView(view, index));
    container.append(button);
  });
}

async function loadPresentation() {
  const id = projectId();
  if (!id || !/^[a-z0-9-]+$/.test(id)) return setError('The model ID is missing from this link.');
  try {
    const response = await fetch(projectAsset(`projects/${id}/project.json`), { cache: 'no-store' });
    if (!response.ok) throw new Error();
    state.project = await response.json();
    document.title = `${state.project.name} · Pixel Architecture Studio`;
    $('#clientProjectName').textContent = state.project.name;
    $('#clientProjectNote').textContent = state.project.note || '';
    viewer.src = projectAsset(state.project.modelPath);
    viewer.setAttribute('ar', '');
    viewer.setAttribute('ar-modes', 'webxr scene-viewer quick-look');
    renderViews();
    if (state.project.views.length) selectView(state.project.views[0], 0);
  } catch {
    setError('This presentation could not be loaded.');
  }
}

$('#clientFullscreen').addEventListener('click', () => $('.client-model-stage').requestFullscreen?.());
loadPresentation();
