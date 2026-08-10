const UNIT_FACTORS = { m: 1, cm: 100, mm: 1000 };

function vector(value, fallback = [0, 1, 0]) {
  if (Array.isArray(value) && value.length === 3) return value.map(Number);
  if (value && ['x', 'y', 'z'].every((axis) => Number.isFinite(Number(value[axis])))) {
    return [Number(value.x), Number(value.y), Number(value.z)];
  }
  return [...fallback];
}

function add(a, b) {
  return a.map((part, index) => part + b[index]);
}

function subtract(a, b) {
  return a.map((part, index) => part - b[index]);
}

function scale(value, amount) {
  return value.map((part) => part * amount);
}

function dot(a, b) {
  return a.reduce((sum, part, index) => sum + part * b[index], 0);
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(value, fallback = [0, 1, 0]) {
  const length = Math.hypot(...value);
  return length > 0.000001 ? value.map((part) => part / length) : [...fallback];
}

function vectorAttribute(value) {
  return vector(value, [0, 0, 0]).map((part) => `${part}m`).join(' ');
}

function normalAttribute(value) {
  return vector(value).join(' ');
}

function midpoint(start, end) {
  return start.map((part, index) => (part + end[index]) / 2);
}

function midpointNormal(start, end) {
  return normalize(start.map((part, index) => part + end[index]), start);
}

export function pointFromHit(hit) {
  return {
    position: vector(hit.position, [0, 0, 0]),
    normal: vector(hit.normal),
    modelIndex: Number.isInteger(hit.modelIndex) ? hit.modelIndex : 0,
  };
}

export function distanceMeters(start, end) {
  const a = vector(start?.position, [0, 0, 0]);
  const b = vector(end?.position, [0, 0, 0]);
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

export function formatDistance(valueMeters, unit = 'm') {
  const validUnit = UNIT_FACTORS[unit] ? unit : 'm';
  const value = Number(valueMeters) * UNIT_FACTORS[validUnit];
  const maximumFractionDigits = validUnit === 'm' ? 3 : validUnit === 'cm' ? 1 : 0;
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value)} ${validUnit}`;
}

export function normalizeDimension(dimension) {
  const start = {
    position: vector(dimension.start?.position, [0, 0, 0]),
    normal: vector(dimension.start?.normal),
    modelIndex: Number.isInteger(dimension.start?.modelIndex) ? dimension.start.modelIndex : 0,
  };
  const end = dimension.end ? {
    position: vector(dimension.end.position, [0, 0, 0]),
    normal: vector(dimension.end.normal),
    modelIndex: Number.isInteger(dimension.end.modelIndex) ? dimension.end.modelIndex : 0,
  } : null;
  return {
    ...dimension,
    id: String(dimension.id),
    name: String(dimension.name || ''),
    unit: UNIT_FACTORS[dimension.unit] ? dimension.unit : 'm',
    start,
    end,
    offset: vector(dimension.offset, [0, 0, 0]),
    lengthMeters: end ? distanceMeters(start, end) : 0,
  };
}

function hotspot(name, point, className, text = '') {
  const element = document.createElement('button');
  element.type = 'button';
  element.slot = name;
  element.className = `dimension-hotspot ${className}`;
  element.dataset.position = vectorAttribute(point.position);
  element.dataset.normal = normalAttribute(point.normal);
  if (point.modelIndex) element.dataset.modelIndex = String(point.modelIndex);
  element.tabIndex = -1;
  element.setAttribute('aria-hidden', 'true');
  element.textContent = text;
  return element;
}

function setLine(line, start, end) {
  line.setAttribute('x1', start.canvasPosition.x);
  line.setAttribute('y1', start.canvasPosition.y);
  line.setAttribute('x2', end.canvasPosition.x);
  line.setAttribute('y2', end.canvasPosition.y);
}

export function createDimensionRenderer(viewer, overlay) {
  let dimensions = [];
  let visible = true;
  let frameRequested = false;

  function hotspotName(id, part) {
    return `hotspot-dimension-${id}-${part}`;
  }

  function redraw() {
    frameRequested = false;
    const width = viewer.clientWidth;
    const height = viewer.clientHeight;
    if (!width || !height) return;
    overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);

    dimensions.forEach((dimension) => {
      if (!dimension.end) return;
      const start = viewer.queryHotspot(hotspotName(dimension.id, 'start'));
      const end = viewer.queryHotspot(hotspotName(dimension.id, 'end'));
      const offsetStart = viewer.queryHotspot(hotspotName(dimension.id, 'offset-start'));
      const offsetEnd = viewer.queryHotspot(hotspotName(dimension.id, 'offset-end'));
      const group = overlay.querySelector(`[data-dimension-id="${CSS.escape(dimension.id)}"]`);
      if (!group || !start || !end || !offsetStart || !offsetEnd) return;
      const canShow = visible && start.facingCamera && end.facingCamera;
      group.toggleAttribute('hidden', !canShow);
      if (!canShow) return;
      setLine(group.querySelector('[data-line="measurement"]'), offsetStart, offsetEnd);
      setLine(group.querySelector('[data-line="start-extension"]'), start, offsetStart);
      setLine(group.querySelector('[data-line="end-extension"]'), end, offsetEnd);
    });
  }

  function requestRedraw() {
    if (frameRequested) return;
    frameRequested = true;
    requestAnimationFrame(redraw);
  }

  function render(nextDimensions) {
    dimensions = nextDimensions.map(normalizeDimension);
    viewer.querySelectorAll('.dimension-hotspot').forEach((element) => element.remove());
    overlay.innerHTML = '';

    dimensions.forEach((dimension) => {
      viewer.append(hotspot(hotspotName(dimension.id, 'start'), dimension.start, 'dimension-dot dimension-origin-dot'));
      if (!dimension.end) return;
      viewer.append(hotspot(hotspotName(dimension.id, 'end'), dimension.end, 'dimension-dot dimension-origin-dot'));

      const offsetStartPosition = add(dimension.start.position, dimension.offset);
      const offsetEndPosition = add(dimension.end.position, dimension.offset);
      const offsetNormal = midpointNormal(dimension.start.normal, dimension.end.normal);
      const offsetStart = { position: offsetStartPosition, normal: offsetNormal, modelIndex: dimension.start.modelIndex };
      const offsetEnd = { position: offsetEndPosition, normal: offsetNormal, modelIndex: dimension.end.modelIndex };
      viewer.append(hotspot(hotspotName(dimension.id, 'offset-start'), offsetStart, 'dimension-dot dimension-offset-dot'));
      viewer.append(hotspot(hotspotName(dimension.id, 'offset-end'), offsetEnd, 'dimension-dot dimension-offset-dot'));

      const labelPoint = {
        position: midpoint(offsetStartPosition, offsetEndPosition),
        normal: offsetNormal,
        modelIndex: dimension.start.modelIndex,
      };
      const value = formatDistance(dimension.lengthMeters, dimension.unit);
      const text = dimension.name ? `${dimension.name} · ${value}` : value;
      viewer.append(hotspot(hotspotName(dimension.id, 'label'), labelPoint, 'dimension-label', text));

      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.dataset.dimensionId = dimension.id;
      ['measurement', 'start-extension', 'end-extension'].forEach((part) => {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.dataset.line = part;
        line.classList.add(part === 'measurement' ? 'dimension-measurement' : 'dimension-extension');
        group.append(line);
      });
      overlay.append(group);
    });
    setVisible(visible);
    requestRedraw();
  }

  function offsetFromScreen(dimension, clientX, clientY) {
    if (!dimension?.start || !dimension?.end) return [0, 0, 0];
    const start = viewer.queryHotspot(hotspotName(dimension.id, 'start'));
    const end = viewer.queryHotspot(hotspotName(dimension.id, 'end'));
    if (!start || !end) return vector(dimension.offset, [0, 0, 0]);

    const bounds = viewer.getBoundingClientRect();
    const mouse = [clientX - bounds.left, clientY - bounds.top];
    const middle = [
      (start.canvasPosition.x + end.canvasPosition.x) / 2,
      (start.canvasPosition.y + end.canvasPosition.y) / 2,
    ];
    const line = [end.canvasPosition.x - start.canvasPosition.x, end.canvasPosition.y - start.canvasPosition.y];
    const lineLength = Math.hypot(...line);
    const perpendicular = lineLength > 0.001 ? [-line[1] / lineLength, line[0] / lineLength] : [0, -1];
    const signedPixels = (mouse[0] - middle[0]) * perpendicular[0] + (mouse[1] - middle[1]) * perpendicular[1];

    const orbit = viewer.getCameraOrbit();
    const targetValue = viewer.getCameraTarget();
    const target = vector(targetValue, [0, 0, 0]);
    const radius = Math.max(Number(orbit.radius) || 1, 0.0001);
    const theta = Number(orbit.theta) || 0;
    const phi = Number(orbit.phi) || Math.PI / 2;
    const camera = add(target, [
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.cos(theta),
    ]);
    const forward = normalize(subtract(target, camera), [0, 0, -1]);
    const right = normalize(cross(forward, [0, 1, 0]), [1, 0, 0]);
    const up = normalize(cross(right, forward), [0, 1, 0]);
    const dimensionMiddle = midpoint(dimension.start.position, dimension.end.position);
    const depth = Math.max(Math.abs(dot(subtract(dimensionMiddle, camera), forward)), radius * 0.05);
    const fieldOfView = (Number(viewer.getFieldOfView()) || 45) * Math.PI / 180;
    const worldPerPixel = (2 * depth * Math.tan(fieldOfView / 2)) / Math.max(viewer.clientHeight, 1);
    const screenDirectionInWorld = normalize(add(scale(right, perpendicular[0]), scale(up, -perpendicular[1])), up);
    return scale(screenDirectionInWorld, signedPixels * worldPerPixel);
  }

  function setVisible(nextVisible) {
    visible = nextVisible;
    overlay.hidden = !visible;
    viewer.querySelectorAll('.dimension-hotspot').forEach((element) => { element.hidden = !visible; });
    requestRedraw();
  }

  viewer.addEventListener('camera-change', requestRedraw);
  viewer.addEventListener('load', requestRedraw);
  new ResizeObserver(requestRedraw).observe(viewer);

  return { render, redraw: requestRedraw, setVisible, offsetFromScreen };
}
