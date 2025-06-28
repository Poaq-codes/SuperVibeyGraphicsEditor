const canvas = new fabric.Canvas('c', {
  preserveObjectStacking: true,
  backgroundColor: '#fff'
});

const border = new fabric.Rect({
  left: 0, top: 0,
  width: canvas.width,
  height: canvas.height,
  fill: '',
  stroke: 'black',
  strokeWidth: 2,
  selectable: false,
  evented: false
});
border.absolutePositioned = true;
border.excludeFromExport = true;

canvas.add(border);
canvas.sendToBack(border);

let undoStack = [];
let redoStack = [];

function saveState() {
  const json = JSON.stringify(canvas.toJSON(['excludeFromExport']));
  if (undoStack.length === 0 || undoStack[undoStack.length - 1] !== json) {
    redoStack = [];
    undoStack.push(json);
    if (undoStack.length > 50) undoStack.shift();
  }
}

document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});

document.getElementById('upload').onclick = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.svg,.png';
  input.onchange = (e) => handleFile(e.target.files[0]);
  input.click();
};

function handleFile(file) {
  if (!file) return;
  const reader = new FileReader();
  if (file.name.endsWith('.svg')) {
    reader.onload = (event) => {
      fabric.loadSVGFromString(event.target.result, (objects) => {
        const allObjects = [];
        objects.forEach(obj => {
          if (obj.type === 'text' && obj.text) {
            const iText = new fabric.IText(obj.text, {
              left: obj.left,
              top: obj.top,
              fontSize: obj.fontSize || 20,
              fill: obj.fill || '#000'
            });
            allObjects.push(iText);
          } else {
            allObjects.push(obj);
          }
        });
        if (allObjects.length > 0) {
          const group = new fabric.Group(allObjects);
          canvas.add(group);
          canvas.setActiveObject(group);
        }
        canvas.renderAll();
        saveState();
      });
    };
    reader.readAsText(file);
  } else if (file.name.endsWith('.png')) {
    reader.onload = (event) => {
      fabric.Image.fromURL(event.target.result, (img) => {
        img.originX = 'center';
        img.originY = 'center';
        img.left = canvas.width / 2;
        img.top = canvas.height / 2;
        canvas.add(img).setActiveObject(img);
        img.setCoords();
        canvas.renderAll();
        saveState();
      });
    };
    reader.readAsDataURL(file);
  } else {
    alert('Unsupported file type.');
  }
}

document.getElementById('addText').onclick = () => {
  const text = new fabric.IText('New Text', {
    left: canvas.width / 2,
    top: canvas.height / 2,
    originX: 'center',
    originY: 'center',
    fontSize: 24
  });
  canvas.add(text).setActiveObject(text);
  canvas.renderAll();
  saveState();
};

// --- Grid (visual only) ---
const gridSize = 40;
let gridGroup = null;

const gridToggle = document.getElementById('gridToggle');
gridToggle.addEventListener('change', toggleGrid);

function toggleGrid() {
  if (gridToggle.checked) drawGrid();
  else removeGrid();
}

function drawGrid() {
  const lines = [];
  for (let i = 0; i < (canvas.width / gridSize); i++) {
    lines.push(new fabric.Line([i * gridSize, 0, i * gridSize, canvas.height], {
      stroke: '#eee',
      selectable: false,
      excludeFromExport: true,
      evented: false
    }));
  }
  for (let i = 0; i < (canvas.height / gridSize); i++) {
    lines.push(new fabric.Line([0, i * gridSize, canvas.width, i * gridSize], {
      stroke: '#eee',
      selectable: false,
      excludeFromExport: true,
      evented: false
    }));
  }
  gridGroup = new fabric.Group(lines, { selectable: false, excludeFromExport: true, evented: false });
  canvas.add(gridGroup);
  canvas.sendToBack(gridGroup);
  canvas.sendToBack(border);
}

function removeGrid() {
  if (gridGroup) {
    canvas.remove(gridGroup);
    gridGroup = null;
  }
}

// --- Rotation: no snapping ---
canvas.on('object:rotating', snapRotation);

function snapRotation(opt) {
  const obj = opt.target;
  angleInput.value = Math.round(obj.angle || 0);
}

// --- Angle input with origin fix ---
const angleInput = document.getElementById('angleInput');
angleInput.addEventListener('change', () => {
  const angle = parseFloat(angleInput.value) || 0;
  const active = canvas.getActiveObject();
  if (active) {
    if (active.type === 'activeSelection') {
      active.forEachObject(obj => {
        obj.originX = 'center';
        obj.originY = 'center';
        obj.set('angle', angle);
        obj.setCoords();
      });
    } else {
      active.originX = 'center';
      active.originY = 'center';
      active.set('angle', angle);
      active.setCoords();
    }
    canvas.requestRenderAll();
    saveState();
  }
});

// --- Context menu ---
canvas.upperCanvasEl.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const target = canvas.findTarget(e, false);
  const active = canvas.getActiveObject();

  if (!target) {
    addText();
    return;
  }

  if (active && active.type === 'activeSelection') {
    const group = active.toGroup();
    canvas.setActiveObject(group);
    saveState();
    canvas.renderAll();
    return;
  }

  if (target.type === 'group') {
    target.toActiveSelection();
    canvas.remove(target);
    saveState();
    canvas.renderAll();
    return;
  }

  if (target !== border) {
    const action = prompt('Right-click: Type "copy", "paste", "cut", or "delete"');
    if (action === 'copy') copySelection();
    else if (action === 'paste') pasteClipboard();
    else if (action === 'cut') cutSelection();
    else if (action === 'delete') {
      if (confirm('Delete this object?')) {
        canvas.remove(target);
        saveState();
        canvas.renderAll();
      }
    }
  }
});

// --- Undo/Redo ---
document.getElementById('undo').onclick = () => {
  if (undoStack.length > 1) {
    redoStack.push(undoStack.pop());
    const prevState = undoStack[undoStack.length - 1];
    if (prevState) {
      canvas.loadFromJSON(prevState, () => {
        if (!canvas.getObjects().includes(border)) {
          canvas.add(border);
          canvas.sendToBack(border);
        }
        canvas.renderAll();
      });
    }
  }
};

document.getElementById('redo').onclick = () => {
  if (redoStack.length > 0) {
    undoStack.push(redoStack.pop());
    const state = undoStack[undoStack.length - 1];
    if (state) {
      canvas.loadFromJSON(state, () => {
        if (!canvas.getObjects().includes(border)) {
          canvas.add(border);
          canvas.sendToBack(border);
        }
        canvas.renderAll();
      });
    }
  }
};

// --- Keyboard shortcuts ---
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    if (e.shiftKey) document.getElementById('redo').click();
    else document.getElementById('undo').click();
    e.preventDefault();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { copySelection(); e.preventDefault(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { pasteClipboard(); e.preventDefault(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') { cutSelection(); e.preventDefault(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
    gridToggle.checked = !gridToggle.checked;
    toggleGrid();
    e.preventDefault();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Backspace' || e.key === 'Delete') {
    const active = canvas.getActiveObject();
    if (active && active !== border) {
      if (active.isEditing) return;
      if (active.type === 'activeSelection') active.forEachObject(obj => canvas.remove(obj));
      else canvas.remove(active);
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      saveState();
      e.preventDefault();
    }
  }
});

// --- Zoom/Pan ---
document.addEventListener('wheel', (e) => {
  if (e.ctrlKey) {
    const zoom = canvas.getZoom();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    canvas.setZoom(zoom * delta);
    e.preventDefault();
  }
}, { passive: false });

let isDragging = false, lastPosX, lastPosY;
canvas.on('mouse:down', opt => {
  const evt = opt.e;
  if (evt.altKey || evt.button === 1) {
    isDragging = true;
    canvas.selection = false;
    lastPosX = evt.clientX;
    lastPosY = evt.clientY;
  }
});
canvas.on('mouse:move', opt => {
  if (isDragging) {
    const e = opt.e, vpt = canvas.viewportTransform;
    vpt[4] += e.clientX - lastPosX;
    vpt[5] += e.clientY - lastPosY;
    canvas.requestRenderAll();
    lastPosX = e.clientX; lastPosY = e.clientY;
  }
});
canvas.on('mouse:up', () => { isDragging = false; canvas.selection = true; });

// --- Color ---
const colorInput = document.getElementById('colorPicker');
colorInput.addEventListener('input', (e) => {
  const color = e.target.value, active = canvas.getActiveObject();
  if (!active) return;
  if (active.type === 'activeSelection') active.forEachObject(obj => { if ('fill' in obj) obj.set('fill', color); });
  else if ('fill' in active) active.set('fill', color);
  canvas.requestRenderAll();
});
colorInput.addEventListener('change', saveState);

// --- Font ---
const fontFamilyInput = document.getElementById('fontFamily');
const fontSizeInput = document.getElementById('fontSize');
const boldBtn = document.getElementById('boldBtn');
const italicBtn = document.getElementById('italicBtn');

function updateTextStyle(fn) {
  const obj = canvas.getActiveObject();
  if (obj) {
    if (obj.type === 'activeSelection') obj.forEachObject(o => isText(o) && fn(o));
    else if (isText(obj)) fn(obj);
    canvas.requestRenderAll();
    saveState();
  }
}
function isText(o) { return o.type === 'i-text' || o.type === 'textbox' || o.type === 'text'; }

fontFamilyInput.addEventListener('change', e => updateTextStyle(obj => obj.set('fontFamily', e.target.value)));
fontSizeInput.addEventListener('change', e => updateTextStyle(obj => obj.set('fontSize', parseInt(e.target.value, 10) || 24)));
boldBtn.addEventListener('click', () => updateTextStyle(obj => obj.set('fontWeight', obj.fontWeight === 'bold' ? 'normal' : 'bold')));
italicBtn.addEventListener('click', () => updateTextStyle(obj => obj.set('fontStyle', obj.fontStyle === 'italic' ? 'normal' : 'italic')));

canvas.on('selection:created', syncTextControls);
canvas.on('selection:updated', syncTextControls);
canvas.on('selection:cleared', () => {
  fontFamilyInput.value = "Arial";
  fontSizeInput.value = 24;
  boldBtn.classList.remove('active');
  italicBtn.classList.remove('active');
  angleInput.value = 0;
});
function syncTextControls() {
  const obj = canvas.getActiveObject();
  if (!obj) return;
  let sample = obj;
  if (obj.type === 'activeSelection') sample = obj._objects.find(isText) || obj._objects[0];
  if (!sample) return;

  angleInput.value = Math.round(sample.angle || 0);

  if (isText(sample)) {
    fontFamilyInput.value = sample.fontFamily || "Arial";
    fontSizeInput.value = sample.fontSize || 24;
    if (sample.fontWeight === 'bold') boldBtn.classList.add('active'); else boldBtn.classList.remove('active');
    if (sample.fontStyle === 'italic') italicBtn.classList.add('active'); else italicBtn.classList.remove('active');
  }
}

canvas.on('object:modified', saveState);

// --- Clipboard ---
let clipboard = null;
document.getElementById('copyBtn').onclick = copySelection;
document.getElementById('pasteBtn').onclick = pasteClipboard;
document.getElementById('cutBtn').onclick = cutSelection;

function copySelection() {
  const active = canvas.getActiveObject();
  if (active) active.clone(clone => clipboard = clone);
}

function pasteClipboard() {
  if (clipboard) {
    clipboard.clone(clone => {
      canvas.discardActiveObject();
      clone.set({ left: clone.left + 20, top: clone.top + 20, evented: true });
      if (clone.type === 'activeSelection') {
        clone.canvas = canvas; clone.forEachObject(obj => canvas.add(obj));
        clone.setCoords();
      } else canvas.add(clone);
      clipboard.left += 20; clipboard.top += 20;
      canvas.setActiveObject(clone); canvas.requestRenderAll(); saveState();
    });
  }
}

function cutSelection() {
  copySelection();
  const active = canvas.getActiveObject();
  if (active && active !== border) {
    canvas.remove(active);
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    saveState();
  }
}

// --- Export ---
function exportWithReset(fn) {
  const vt = canvas.viewportTransform, zoom = canvas.getZoom();
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0]); canvas.setZoom(1);
  fn(); canvas.setViewportTransform(vt); canvas.setZoom(zoom);
}

document.getElementById('exportSVG').onclick = () => exportWithReset(() => {
  border.visible = false; if (gridGroup) gridGroup.visible = false;
  const svg = canvas.toSVG();
  border.visible = true; if (gridGroup) gridGroup.visible = true;
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = 'canvas_export.svg'; link.click();
});
document.getElementById('exportPNG').onclick = () => exportWithReset(() => {
  const white = confirm('Export with white background?'), prevBg = canvas.backgroundColor;
  if (white) canvas.backgroundColor = '#fff';
  border.visible = false; if (gridGroup) gridGroup.visible = false;
  const pngData = canvas.toDataURL({ format: 'png', multiplier: 3 });
  border.visible = true; if (gridGroup) gridGroup.visible = true;
  canvas.backgroundColor = prevBg;
  const link = document.createElement('a'); link.href = pngData;
  link.download = 'canvas_export.png'; link.click();
});
document.getElementById('exportPDF').onclick = () => exportWithReset(() => {
  border.visible = false; if (gridGroup) gridGroup.visible = false;
  const dataURL = canvas.toDataURL({ format: 'png', multiplier: 3 });
  border.visible = true; if (gridGroup) gridGroup.visible = true;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: [canvas.width, canvas.height] });
  doc.addImage(dataURL, 'PNG', 0, 0, canvas.width, canvas.height); doc.save('canvas_export.pdf');
});


