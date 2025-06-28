const canvas = new fabric.Canvas('c', {
  preserveObjectStacking: true,
  backgroundColor: '#fff'
});

// ✅ Locked border
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

// --- Upload ---
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

// --- Add Text ---
document.getElementById('addText').onclick = addText;
function addText() {
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
}

// --- Right-click: add/group/ungroup/delete ---
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
    if (confirm('Delete this object?')) {
      canvas.remove(target);
      saveState();
      canvas.renderAll();
    }
  }
});

// ✅ Undo / redo
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
  } else {
    console.log('No more undo steps.');
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

// ✅ Ctrl+Z / Shift+Z
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    if (e.shiftKey) {
      document.getElementById('redo').click();
    } else {
      document.getElementById('undo').click();
    }
    e.preventDefault();
  }
});

// ✅ Backspace/Delete: skip if editing
document.addEventListener('keydown', (e) => {
  if (e.key === 'Backspace' || e.key === 'Delete') {
    const active = canvas.getActiveObject();
    if (active && active !== border) {
      if (active.isEditing) return;

      if (active.type === 'activeSelection') {
        active.forEachObject(obj => {
          canvas.remove(obj);
        });
      } else {
        canvas.remove(active);
      }
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      saveState();
      e.preventDefault();
    }
  }
});

// ✅ Zoom in/out
document.addEventListener('wheel', (e) => {
  if (e.ctrlKey) {
    const zoom = canvas.getZoom();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    canvas.setZoom(zoom * delta);
    e.preventDefault();
  }
}, { passive: false });

// ✅ Drag-to-pan with middle button or Alt key
let isDragging = false;
let lastPosX, lastPosY;

canvas.on('mouse:down', function(opt) {
  const evt = opt.e;
  if (evt.altKey || evt.button === 1) {
    isDragging = true;
    canvas.selection = false;
    lastPosX = evt.clientX;
    lastPosY = evt.clientY;
  }
});

canvas.on('mouse:move', function(opt) {
  if (isDragging) {
    const e = opt.e;
    const vpt = canvas.viewportTransform;
    vpt[4] += e.clientX - lastPosX;
    vpt[5] += e.clientY - lastPosY;
    canvas.requestRenderAll();
    lastPosX = e.clientX;
    lastPosY = e.clientY;
  }
});

canvas.on('mouse:up', function() {
  isDragging = false;
  canvas.selection = true;
});

// ✅ Exports
function exportWithReset(exportFn) {
  const vt = canvas.viewportTransform;
  const zoom = canvas.getZoom();
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
  canvas.setZoom(1);
  exportFn();
  canvas.setViewportTransform(vt);
  canvas.setZoom(zoom);
}

document.getElementById('exportSVG').onclick = () => {
  exportWithReset(() => {
    border.visible = false;
    const svg = canvas.toSVG();
    border.visible = true;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'canvas_export.svg';
    link.click();
  });
};

document.getElementById('exportPNG').onclick = () => {
  exportWithReset(() => {
    const useWhite = confirm('Export with white background?');
    const prevBg = canvas.backgroundColor;
    if (useWhite) canvas.backgroundColor = '#fff';
    border.visible = false;
    const pngData = canvas.toDataURL({ format: 'png', multiplier: 3 });
    border.visible = true;
    canvas.backgroundColor = prevBg;
    const link = document.createElement('a');
    link.href = pngData;
    link.download = 'canvas_export.png';
    link.click();
  });
};

document.getElementById('exportPDF').onclick = () => {
  exportWithReset(() => {
    border.visible = false;
    const dataURL = canvas.toDataURL({ format: 'png', multiplier: 3 });
    border.visible = true;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: [canvas.width, canvas.height]
    });
    doc.addImage(dataURL, 'PNG', 0, 0, canvas.width, canvas.height);
    doc.save('canvas_export.pdf');
  });
};

// ✅ Color picker
const colorInput = document.getElementById('colorPicker');

colorInput.addEventListener('input', (e) => {
  const color = e.target.value;
  const active = canvas.getActiveObject();
  if (!active) return;

  if (active.type === 'activeSelection') {
    active.forEachObject(obj => {
      if ('fill' in obj) {
        obj.set('fill', color);
      }
    });
  } else if ('fill' in active) {
    active.set('fill', color);
  }
  canvas.requestRenderAll();
});

colorInput.addEventListener('change', () => {
  saveState();
});

// ✅ Save on modify
canvas.on('object:modified', saveState);
