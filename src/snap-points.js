import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MAX_SNAP_POINTS = 250000;
const MAX_VISIBLE_POINTS = 14;

function asArray(value, fallback = [0, 0, 0]) {
  if (Array.isArray(value)) return value.map(Number);
  if (value && ['x', 'y', 'z'].every((axis) => Number.isFinite(Number(value[axis])))) {
    return [Number(value.x), Number(value.y), Number(value.z)];
  }
  return [...fallback];
}

function vectorAttribute(value) {
  return value.map((part) => `${part}m`).join(' ');
}

function distanceSquared(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

class SnapPointIndex {
  constructor(points, diagonal) {
    this.points = points;
    this.diagonal = Math.max(diagonal, 0.001);
    this.cellSize = Math.max(this.diagonal / 180, 0.00001);
    this.cells = new Map();
    points.forEach((point) => {
      const key = this.keyFor(point);
      if (!this.cells.has(key)) this.cells.set(key, []);
      this.cells.get(key).push(point);
    });
  }

  coordinates(point) {
    return point.map((part) => Math.floor(part / this.cellSize));
  }

  keyFor(point) {
    return this.coordinates(point).join('|');
  }

  nearest(position, radius, limit = MAX_VISIBLE_POINTS) {
    const center = this.coordinates(position);
    const searchRange = Math.min(10, Math.max(1, Math.ceil(radius / this.cellSize)));
    const radiusSquared = radius * radius;
    const candidates = [];
    for (let x = -searchRange; x <= searchRange; x += 1) {
      for (let y = -searchRange; y <= searchRange; y += 1) {
        for (let z = -searchRange; z <= searchRange; z += 1) {
          const bucket = this.cells.get(`${center[0] + x}|${center[1] + y}|${center[2] + z}`);
          if (!bucket) continue;
          bucket.forEach((point) => {
            const distance = distanceSquared(point, position);
            if (distance <= radiusSquared) candidates.push({ point, distance });
          });
        }
      }
    }
    return candidates.sort((a, b) => a.distance - b.distance).slice(0, limit).map(({ point }) => point);
  }
}

async function createIndex(source) {
  const gltf = await new GLTFLoader().loadAsync(source);
  gltf.scene.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(gltf.scene);
  const diagonal = bounds.getSize(new Vector3()).length();
  let totalVertices = 0;
  gltf.scene.traverse((node) => {
    if (node.isMesh && node.geometry?.attributes?.position) totalVertices += node.geometry.attributes.position.count;
  });
  const step = Math.max(1, Math.ceil(totalVertices / MAX_SNAP_POINTS));
  const precision = Math.max(diagonal * 0.000001, 0.0000001);
  const seen = new Set();
  const points = [];
  const local = new Vector3();
  let vertexIndex = 0;

  gltf.scene.traverse((node) => {
    const positions = node.isMesh ? node.geometry?.attributes?.position : null;
    if (!positions) return;
    for (let index = 0; index < positions.count; index += 1) {
      const shouldTake = vertexIndex % step === 0;
      vertexIndex += 1;
      if (!shouldTake) continue;
      local.fromBufferAttribute(positions, index).applyMatrix4(node.matrixWorld);
      const point = [local.x, local.y, local.z];
      const key = point.map((part) => Math.round(part / precision)).join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      points.push(point);
    }
  });
  return new SnapPointIndex(points, diagonal);
}

function snapHotspot(point, normal, modelIndex, active, index) {
  const element = document.createElement('span');
  element.slot = `hotspot-snap-point-${index}`;
  element.className = `snap-hotspot${active ? ' active' : ''}`;
  element.dataset.position = vectorAttribute(point);
  element.dataset.normal = asArray(normal, [0, 1, 0]).join(' ');
  if (modelIndex) element.dataset.modelIndex = String(modelIndex);
  element.setAttribute('aria-hidden', 'true');
  return element;
}

export function createSnapPointController(viewer) {
  let pointIndex = null;
  let loadVersion = 0;

  function clear() {
    viewer.querySelectorAll('.snap-hotspot').forEach((element) => element.remove());
  }

  function render(points, hit) {
    clear();
    points.forEach((point, index) => {
      viewer.append(snapHotspot(point, hit.normal, hit.modelIndex, index === 0, index));
    });
  }

  function radiusForView() {
    if (!pointIndex) return 0;
    const orbit = viewer.getCameraOrbit();
    const radius = Math.max(Number(orbit.radius) || pointIndex.diagonal, 0.001);
    const fieldOfView = (Number(viewer.getFieldOfView()) || 45) * Math.PI / 180;
    const worldPerPixel = (2 * radius * Math.tan(fieldOfView / 2)) / Math.max(viewer.clientHeight, 1);
    return Math.min(pointIndex.diagonal * 0.06, Math.max(pointIndex.diagonal * 0.0002, worldPerPixel * 20));
  }

  function preview(clientX, clientY) {
    const hit = viewer.positionAndNormalFromPoint(clientX, clientY);
    if (!hit) {
      clear();
      return null;
    }
    const hitPosition = asArray(hit.position);
    const candidates = pointIndex?.nearest(hitPosition, radiusForView()) || [];
    render(candidates, hit);
    return {
      hit,
      active: candidates.length ? {
        position: candidates[0],
        normal: asArray(hit.normal, [0, 1, 0]),
        modelIndex: Number.isInteger(hit.modelIndex) ? hit.modelIndex : 0,
      } : null,
      count: candidates.length,
    };
  }

  async function load(source) {
    const version = ++loadVersion;
    pointIndex = null;
    clear();
    const nextIndex = await createIndex(source);
    if (version !== loadVersion) return 0;
    pointIndex = nextIndex;
    return pointIndex.points.length;
  }

  function reset() {
    loadVersion += 1;
    pointIndex = null;
    clear();
  }

  return { clear, load, preview, reset, get ready() { return Boolean(pointIndex); } };
}
