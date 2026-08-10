const UNIT_FACTORS = { m: 1, cm: 100, mm: 1000 };

function vector(value, fallback = [0, 1, 0]) {
  if (Array.isArray(value) && value.length === 3) return value.map(Number);
  if (value && ['x', 'y', 'z'].every((axis) => Number.isFinite(Number(value[axis])))) {
    return [Number(value.x), Number(value.y), Number(value.z)];
  }
  return fallback;
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
  const combined = start.map((part, index) => part + end[index]);
  const length = Math.hypot(...combined);
  return length > 0.00001 ? combined.map((part) => part / length) : start;
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
      const line = overlay.querySelector(`[data-dimension-id="${CSS.escape(dimension.id)}"]`);
      if (!line || !start || !end) return;
      const canShow = visible && start.facingCamera && end.facingCamera;
      line.toggleAttribute('hidden', !canShow);
      if (!canShow) return;
      line.setAttribute('x1', start.canvasPosition.x);
      line.setAttribute('y1', start.canvasPosition.y);
      line.setAttribute('x2', end.canvasPosition.x);
      line.setAttribute('y2', end.canvasPosition.y);
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
      viewer.append(hotspot(hotspotName(dimension.id, 'start'), dimension.start, 'dimension-dot'));
      if (!dimension.end) return;
      viewer.append(hotspot(hotspotName(dimension.id, 'end'), dimension.end, 'dimension-dot'));

      const startPosition = dimension.start.position;
      const endPosition = dimension.end.position;
      const labelPoint = {
        position: midpoint(startPosition, endPosition),
        normal: midpointNormal(dimension.start.normal, dimension.end.normal),
        modelIndex: dimension.start.modelIndex,
      };
      const value = formatDistance(dimension.lengthMeters, dimension.unit);
      const text = dimension.name ? `${dimension.name} · ${value}` : value;
      viewer.append(hotspot(hotspotName(dimension.id, 'label'), labelPoint, 'dimension-label', text));

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.dataset.dimensionId = dimension.id;
      overlay.append(line);
    });
    setVisible(visible);
    requestRedraw();
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

  return { render, redraw: requestRedraw, setVisible };
}
