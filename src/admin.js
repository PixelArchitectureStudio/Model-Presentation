import '@google/model-viewer';
import QRCode from 'qrcode';
import { publishFiles, readRepositoryJson, verifyRepository } from './github.js';

const $ = (selector) => document.querySelector(selector);
const viewer = $('#adminViewer');
const viewsContainer = $('#cameraViews');
const state = { views: [], glbFile: null, skpFile: null, publishedUrl: '', existing: null };

const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
const safeText = (value) => String(value ?? '').replace(/[<>]/g, '');

function repositoryConfig() {
  return {
    owner: 'PixelArchitectureStudio',
    repo: 'Model-Presentation',
    branch: 'main',
    token: $('#repoToken').value.trim(),
  };
}

function saveRepositoryPreference() {
  const { owner, repo, branch } = repositoryConfig();
  sessionStorage.setItem('pixel-repository', JSON.stringify({ owner, repo, branch }));
}

function restoreRepositoryPreference() {
  try {
    const saved = JSON.parse(sessionStorage.getItem('pixel-repository'));
    if (!saved) return;
    $('#repoOwner').value = saved.owner || '';
    $('#repoName').value = saved.repo || '';
    $('#repoBranch').value = saved.branch || 'main';
  } catch { /* Ignore malformed browser state. */ }
}

function setStatus(message, type = '') {
  const element = $('#publishStatus');
  element.textContent = message;
  element.dataset.type = type;
}

function projectBaseUrl() {
  return new URL('./', window.location.href);
}

function clientUrl(slug) {
  const url = new URL('view.html', projectBaseUrl());
  url.searchParams.set('id', slug);
  return url.href;
}

function cameraSnapshot() {
  const orbit = viewer.getCameraOrbit();
  const target = viewer.getCameraTarget();
  return {
    orbit: `${orbit.theta}rad ${orbit.phi}rad ${orbit.radius}m`,
    target: `${target.x}m ${target.y}m ${target.z}m`,
    fieldOfView: `${viewer.getFieldOfView()}deg`,
  };
}

function applyCamera(view) {
  viewer.cameraOrbit = view.orbit;
  viewer.cameraTarget = view.target;
  viewer.fieldOfView = view.fieldOfView;
  viewer.jumpCameraToGoal();
}

function renderViews() {
  viewsContainer.innerHTML = '';
  if (!state.views.length) {
    viewsContainer.innerHTML = '<div class="empty-list"><span>No saved views</span><p>Set the camera in the preview and capture your first view.</p></div>';
    return;
  }
  state.views.forEach((view, index) => {
    const card = document.createElement('article');
    card.className = 'camera-view-card';
    card.innerHTML = `
      <div class="view-card-top"><span>${String(index + 1).padStart(2, '0')}</span><button type="button" data-action="show">Show</button></div>
      <label>View name<input data-field="name" value="${safeText(view.name)}" /></label>
      <label>View note<textarea data-field="note" rows="2">${safeText(view.note)}</textarea></label>
      <div class="view-card-actions"><button type="button" data-action="update">Update camera</button><button type="button" data-action="delete">Delete</button></div>`;
    card.addEventListener('input', (event) => {
      if (event.target.dataset.field) view[event.target.dataset.field] = event.target.value;
    });
    card.addEventListener('click', (event) => {
      const action = event.target.dataset.action;
      if (action === 'show') applyCamera(view);
      if (action === 'update') Object.assign(view, cameraSnapshot());
      if (action === 'delete') { state.views.splice(index, 1); renderViews(); }
    });
    viewsContainer.append(card);
  });
}

async function updateQr(url) {
  await QRCode.toCanvas($('#qrCanvas'), url, { width: 168, margin: 1, color: { dark: '#11110f', light: '#f0eee8' }, errorCorrectionLevel: 'H' });
  $('#shareLinkText').textContent = url;
  $('#copyLink').disabled = false;
  $('#downloadQr').disabled = false;
}

function validatePublish() {
  const config = repositoryConfig();
  if (!config.owner || !config.repo || !config.token) throw new Error('Complete the GitHub repository connection first.');
  if (!$('#projectName').value.trim()) throw new Error('Add a project name.');
  if (!$('#projectSlug').value.trim()) throw new Error('Add a project ID.');
  if (!state.glbFile && !state.existing?.modelPath) throw new Error('Upload a GLB model.');
  if (!state.views.length) throw new Error('Capture at least one camera view.');
  if (state.glbFile?.size > 95 * 1024 * 1024 || state.skpFile?.size > 95 * 1024 * 1024) throw new Error('Each GitHub file must be smaller than 95 MB.');
  return config;
}

function buildProject() {
  const config = repositoryConfig();
  const slug = slugify($('#projectSlug').value);
  return {
    schemaVersion: 1,
    slug,
    name: $('#projectName').value.trim(),
    note: $('#projectNote').value.trim(),
    modelPath: `projects/${slug}/model.glb`,
    sourcePath: state.skpFile || state.existing?.sourcePath ? `projects/${slug}/source.skp` : null,
    repository: { owner: config.owner, name: config.repo },
    updatedAt: new Date().toISOString(),
    views: state.views,
  };
}

async function publish() {
  try {
    const config = validatePublish();
    saveRepositoryPreference();
    const project = buildProject();
    setStatus('Checking secure repository access…', 'working');
    await verifyRepository(config);
    const files = [{ path: `public/projects/${project.slug}/project.json`, content: JSON.stringify(project, null, 2) }];
    if (state.glbFile) files.push({ path: `public/projects/${project.slug}/model.glb`, file: state.glbFile });
    if (state.skpFile) files.push({ path: `public/projects/${project.slug}/source.skp`, file: state.skpFile });
    setStatus('Publishing model and presentation data…', 'working');
    await publishFiles(config, files, `Publish model presentation: ${project.name}`);
    state.existing = project;
    state.publishedUrl = clientUrl(project.slug);
    await updateQr(state.publishedUrl);
    setStatus('Published. GitHub Pages will update after the deployment finishes.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function loadExisting() {
  try {
    const config = repositoryConfig();
    const slug = slugify($('#projectSlug').value);
    if (!config.owner || !config.repo || !slug) throw new Error('Enter repository details and a project ID.');
    setStatus('Loading existing presentation…', 'working');
    const project = await readRepositoryJson(config, `public/projects/${slug}/project.json`);
    state.existing = project;
    state.views = project.views || [];
    $('#projectName').value = project.name || '';
    $('#projectNote').value = project.note || '';
    $('#projectSlug').value = project.slug || slug;
    $('#previewTitle').textContent = project.name || 'Untitled presentation';
    viewer.src = new URL(project.modelPath, projectBaseUrl()).href;
    renderViews();
    await updateQr(clientUrl(project.slug));
    setStatus('Existing presentation loaded.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

$('#projectName').addEventListener('input', (event) => {
  $('#previewTitle').textContent = event.target.value || 'Untitled presentation';
  if (!$('#projectSlug').dataset.edited) $('#projectSlug').value = slugify(event.target.value);
});
$('#projectSlug').addEventListener('input', (event) => { event.target.dataset.edited = 'true'; });
$('#glbFile').addEventListener('change', (event) => {
  state.glbFile = event.target.files[0] || null;
  if (state.glbFile) viewer.src = URL.createObjectURL(state.glbFile);
});
$('#skpFile').addEventListener('change', (event) => { state.skpFile = event.target.files[0] || null; });
$('#captureView').addEventListener('click', () => {
  if (!viewer.src) return setStatus('Upload a GLB model before capturing a camera.', 'error');
  state.views.push({ id: crypto.randomUUID(), name: `View ${state.views.length + 1}`, note: '', ...cameraSnapshot(), issueNumber: null });
  renderViews();
});
$('#publishProject').addEventListener('click', publish);
$('#loadExisting').addEventListener('click', loadExisting);
$('#resetCamera').addEventListener('click', () => { viewer.cameraOrbit = 'auto auto auto'; viewer.cameraTarget = 'auto auto auto'; viewer.fieldOfView = 'auto'; });
$('#toggleFullscreen').addEventListener('click', () => $('.preview-stage').requestFullscreen?.());
$('#copyLink').addEventListener('click', async () => { await navigator.clipboard.writeText(state.publishedUrl); setStatus('Client link copied.', 'success'); });
$('#downloadQr').addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = `${slugify($('#projectSlug').value) || 'model'}-qr.png`;
  link.href = $('#qrCanvas').toDataURL('image/png');
  link.click();
});

restoreRepositoryPreference();
renderViews();
