/**
 * main.js
 * PDF Bestie - 100% Client-Side PDF Utility Suite
 * * Dependencies:
 * - pdf-lib: For all PDF manipulation (merging, splitting, etc.)
 * - pdf.js: For rendering PDF page previews/thumbnails
 */

const { PDFDocument, rgb, degrees } = PDFLib;

// --- DOM ELEMENTS & STATE ---
const D = {
    // Nav/Layout
    navbar: document.getElementById('navbar'),
    menuToggle: document.querySelector('.menu-toggle'),
    navMenu: document.querySelector('nav'),
    
    // Workspace sections
    toolWorkspace: document.getElementById('tool-workspace'),
    toolsOverview: document.getElementById('tools-overview'),
    uploadArea: document.getElementById('upload-area'),
    editorArea: document.getElementById('editor-area'),
    downloadArea: document.getElementById('download-area'),

    // Workspace elements
    workspaceTitle: document.getElementById('workspace-title'),
    closeWorkspaceBtn: document.getElementById('close-workspace'),
    fileInputTrigger: document.getElementById('file-input-trigger'),
    fileInput: document.getElementById('file-input'),
    uploadNote: document.getElementById('upload-note'),
    thumbnailsContainer: document.getElementById('thumbnails-container'),
    fileCountLabel: document.getElementById('file-count-label'),
    processPdfBtn: document.getElementById('process-pdf-btn'),
    downloadPdfBtn: document.getElementById('download-pdf-btn'),
    newTaskBtn: document.getElementById('new-task-btn'),

    // Control groups
    toolControls: document.getElementById('tool-controls'),
    splitControls: document.getElementById('split-controls'),
    rotateControls: document.getElementById('rotate-controls'),
    watermarkControls: document.getElementById('watermark-controls'),
    pageNumControls: document.getElementById('page-num-controls'),
    utilityButtons: document.getElementById('utility-buttons'),

    // Specific inputs
    splitRangeInput: document.getElementById('split-range'),
    rotateDegreeSelect: document.getElementById('rotate-degree'),
    deleteSelectedBtn: document.getElementById('delete-selected'),
    extractSelectedBtn: document.getElementById('extract-selected'),
    watermarkText: document.getElementById('watermark-text'),
    watermarkOpacity: document.getElementById('watermark-opacity'),
    opacityValue: document.getElementById('opacity-value'),
    watermarkSize: document.getElementById('watermark-size'),
    sizeValue: document.getElementById('size-value'),
    pageNumPosSelect: document.getElementById('page-num-pos'),
};

const state = {
    currentTool: null,
    files: [], // Array of { file: File, arrayBuffer: ArrayBuffer, pdfDoc: PDFDocument, filename: string }
    thumbnails: [], // Array of { index: number, element: HTMLElement, canvas: HTMLCanvasElement, pdf: PDFDocument }
    activePdfDoc: null, // The main PDFDocument object being manipulated
    isDragActive: false, // For drag & drop reorder
    draggedEl: null,
    dragStartIdx: -1,
    isProcessing: false,
    outputBuffer: null, // Holds the final ArrayBuffer for download
};

// --- UTILITY FUNCTIONS ---

/**
 * Shows the required control panel for the active tool and hides others.
 * @param {string} tool - The current tool name (e.g., 'split', 'rotate').
 */
function showToolControls(tool) {
    const allControls = [
        D.splitControls, D.rotateControls, D.watermarkControls, 
        D.pageNumControls, D.utilityButtons
    ];
    
    allControls.forEach(el => el.classList.add('hidden'));

    // Reset file input accept for images->PDF
    if (tool === 'img-to-pdf') {
        D.fileInput.accept = '.jpg, .jpeg, .png, .heic';
        D.uploadNote.textContent = 'Supports .jpg, .png, .heic image files.';
    } else {
        D.fileInput.accept = '.pdf';
        D.uploadNote.textContent = 'Supports .pdf files.';
    }

    switch (tool) {
        case 'split':
            D.splitControls.classList.remove('hidden');
            break;
        case 'rotate':
            D.rotateControls.classList.remove('hidden');
            break;
        case 'delete':
        case 'extract':
        case 'reorder':
            D.utilityButtons.classList.remove('hidden');
            D.deleteSelectedBtn.classList.toggle('hidden', tool !== 'delete');
            D.extractSelectedBtn.classList.toggle('hidden', tool !== 'extract');
            // Reorder doesn't need explicit button, it uses drag/drop
            break;
        case 'watermark':
            D.watermarkControls.classList.remove('hidden');
            break;
        case 'page-numbers':
            D.pageNumControls.classList.remove('hidden');
            break;
    }
}

/**
 * Toggles the visibility of the main workspace components.
 * @param {'upload'|'editor'|'download'} mode 
 */
function setWorkspaceMode(mode) {
    D.uploadArea.classList.toggle('hidden', mode !== 'upload');
    D.editorArea.classList.toggle('hidden', mode !== 'editor');
    D.downloadArea.classList.toggle('hidden', mode !== 'download');
    
    // Clear previous state for new task
    if (mode === 'upload') {
        state.files = [];
        state.thumbnails = [];
        state.activePdfDoc = null;
        state.outputBuffer = null;
        D.thumbnailsContainer.innerHTML = '';
        D.processPdfBtn.disabled = true;
        D.fileCountLabel.textContent = '';
        D.fileInput.value = ''; // Clear file input
    }

    if (mode === 'download') {
        // Set download button action based on output buffer
        D.downloadPdfBtn.onclick = () => {
            downloadFile(state.outputBuffer, 'pdf-bestie-output.pdf', 'application/pdf');
        };
    }
}

/**
 * Downloads the given buffer as a file.
 * @param {ArrayBuffer} buffer 
 * @param {string} filename 
 * @param {string} mimeType 
 */
function downloadFile(buffer, filename, mimeType) {
    if (!buffer) return;
    const blob = new Blob([buffer], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Renders a single PDF page thumbnail using pdf.js.
 * @param {object} pdfDoc - The PDFDocumentProxy object from pdf.js.
 * @param {number} pageNum - The 1-based page number to render.
 * @param {string} filename - The original file name.
 * @param {string} dataId - Unique ID for the thumbnail element (e.g., fileIndex-pageNum).
 */
async function renderThumbnail(pdfDoc, pageNum, filename, dataId) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 0.8 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    // Set canvas dimensions to render size
    const THUMB_WIDTH = 150;
    const scale = THUMB_WIDTH / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    canvas.height = scaledViewport.height;
    canvas.width = scaledViewport.width;
    canvas.className = 'thumbnail-canvas';

    // Render the PDF page into the canvas context
    await page.render({
        canvasContext: context,
        viewport: scaledViewport
    }).promise;

    // Create the wrapper element
    const item = document.createElement('div');
    item.className = 'thumbnail-item';
    item.dataset.pageIndex = pageNum - 1; // 0-based index
    item.dataset.dataId = dataId;
    
    if (state.currentTool === 'reorder') {
        item.draggable = true;
        item.setAttribute('title', `Page ${pageNum} of ${filename}. Drag to reorder.`);
    } else {
        item.setAttribute('title', `Page ${pageNum} of ${filename}. Click to select.`);
    }

    item.innerHTML = `
        <span class="page-number">Page ${pageNum}</span>
        <span class="file-name">${filename}</span>
    `;
    item.prepend(canvas);

    D.thumbnailsContainer.appendChild(item);

    // Add click handler for selection
    if (['split', 'rotate', 'delete', 'extract'].includes(state.currentTool)) {
        item.addEventListener('click', () => {
            item.classList.toggle('selected');
            updateProcessingButtonState();
        });
    }

    return { element: item, canvas: canvas };
}

/**
 * Clears existing thumbnails and renders new ones from the activePdfDoc.
 */
async function refreshThumbnails() {
    D.thumbnailsContainer.innerHTML = '';
    state.thumbnails = [];

    if (!state.activePdfDoc) return;
    
    // Use pdf.js to generate thumbnails for all pages of the activePdfDoc
    const pdfBytes = await state.activePdfDoc.save();
    const pdfDocProxy = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
    
    const numPages = state.activePdfDoc.getPageCount();
    D.fileCountLabel.textContent = `Pages in document: ${numPages}`;

    for (let i = 1; i <= numPages; i++) {
        const thumbnail = await renderThumbnail(pdfDocProxy, i, 'Active Document', `0-${i}`);
        state.thumbnails.push(thumbnail);
    }
    
    if (state.currentTool === 'reorder') {
        setupDragAndDrop();
    }
    updateProcessingButtonState();
}

/**
 * Reads the uploaded file(s) and processes them into ArrayBuffers and pdfDoc objects.
 * @param {FileList} files 
 */
async function handleFileLoad(files) {
    // If files are already loaded, this is a multi-file tool like merge/img-to-pdf
    const isMultiFileTool = ['merge', 'img-to-pdf'].includes(state.currentTool);
    
    if (!isMultiFileTool && state.files.length > 0) {
        // For single-file tools, clear previous file
        state.files = [];
    }

    for (let file of files) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            let pdfDoc = null;
            let finalBuffer = arrayBuffer;
            let filename = file.name;

            if (state.currentTool === 'img-to-pdf') {
                // Convert image to a single-page PDF document
                const imageDoc = await PDFDocument.create();
                const imagePage = imageDoc.addPage();
                
                const { width, height } = imagePage.getSize();
                let image;

                if (file.type.includes('png')) {
                    image = await imageDoc.embedPng(arrayBuffer);
                } else {
                    image = await imageDoc.embedJpg(arrayBuffer);
                }

                // Calculate scale to fit image on page
                const imageRatio = image.width / image.height;
                const pageRatio = width / height;
                
                let imgWidth, imgHeight;

                if (imageRatio > pageRatio) {
                    imgWidth = width;
                    imgHeight = width / imageRatio;
                } else {
                    imgHeight = height;
                    imgWidth = height * imageRatio;
                }

                // Center the image
                const x = (width - imgWidth) / 2;
                const y = (height - imgHeight) / 2;
                
                imagePage.drawImage(image, {
                    x,
                    y,
                    width: imgWidth,
                    height: imgHeight,
                });
                
                finalBuffer = await imageDoc.save();
                pdfDoc = imageDoc;
                filename = filename.replace(/\.(jpg|jpeg|png|heic)$/i, '.pdf'); // Rename output
            } else {
                // Regular PDF loading
                pdfDoc = await PDFDocument.load(arrayBuffer);
            }

            state.files.push({
                file: file,
                arrayBuffer: finalBuffer,
                pdfDoc: pdfDoc,
                filename: filename,
            });

        } catch (error) {
            console.error('Error loading or processing file:', file.name, error);
            alert(`Could not process file: ${file.name}. Ensure it is a valid PDF or supported image type.`);
        }
    }
    
    if (state.files.length > 0) {
        await activateEditorMode();
    }
}

/**
 * Transitions from upload view to editor view and sets up the active PDF document.
 */
async function activateEditorMode() {
    if (state.files.length === 0) return;

    setWorkspaceMode('editor');
    
    // For single-file tools, use the first file as the active document
    if (['split', 'reorder', 'rotate', 'delete', 'extract', 'watermark', 'page-numbers'].includes(state.currentTool)) {
        state.activePdfDoc = state.files[0].pdfDoc;
    } 
    // For multi-file tools (Merge, Image->PDF), we need to merge them first conceptually
    else if (state.currentTool === 'merge' || state.currentTool === 'img-to-pdf') {
        await executeMergeOperation(); // Pre-merge for visual editing
        // The executeMergeOperation sets state.activePdfDoc
    }
    
    await refreshThumbnails();
}


/**
 * Updates the disabled state of the main processing button.
 */
function updateProcessingButtonState() {
    let canProcess = false;

    if (!state.activePdfDoc) {
        D.processPdfBtn.disabled = true;
        return;
    }
    
    const numPages = state.activePdfDoc.getPageCount();

    switch (state.currentTool) {
        case 'merge':
        case 'img-to-pdf':
            // Already "pre-merged" into activePdfDoc, always ready for download
            canProcess = true;
            D.processPdfBtn.textContent = 'Download Merged PDF';
            break;

        case 'split':
            // Check if split range input is valid and not empty
            canProcess = D.splitRangeInput.value.trim().length > 0;
            D.processPdfBtn.textContent = 'Split PDF';
            break;

        case 'reorder':
            // Reordering is done dynamically by drag/drop, always ready for download
            canProcess = true;
            D.processPdfBtn.textContent = 'Download Reordered PDF';
            break;
            
        case 'rotate':
        case 'delete':
        case 'extract':
            // Check if any pages are selected (utility tools)
            const selectedPages = D.thumbnailsContainer.querySelectorAll('.selected').length;
            canProcess = selectedPages > 0;
            D.processPdfBtn.textContent = `${state.currentTool.charAt(0).toUpperCase() + state.currentTool.slice(1)} Pages`;
            break;

        case 'watermark':
        case 'page-numbers':
            // These operations can always be applied to the loaded document
            canProcess = true;
            D.processPdfBtn.textContent = `Apply ${state.currentTool.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}`;
            break;

        default:
            canProcess = false;
    }
    
    D.processPdfBtn.disabled = !canProcess;
}

// --- PDFLIB MANIPULATION FUNCTIONS ---

/**
 * CORE: Merges all files in state.files into a single PDFDocument and sets it as state.activePdfDoc.
 * This is used both as the final step for 'merge' and as the setup step for 'img-to-pdf'.
 */
async function executeMergeOperation() {
    if (state.files.length < 1) return;
    
    const mergedDoc = await PDFDocument.create();
    
    for (const file of state.files) {
        const copiedPages = await mergedDoc.copyPages(file.pdfDoc, file.pdfDoc.getPageIndices());
        copiedPages.forEach(page => mergedDoc.addPage(page));
    }
    
    state.activePdfDoc = mergedDoc;
    return mergedDoc;
}

/**
 * CORE: Splits the activePdfDoc based on the provided range string.
 * @param {string} rangeStr - e.g., "1-5, 8, 10-END"
 */
async function executeSplitOperation(rangeStr) {
    if (!state.activePdfDoc) return;

    // A more complex split: splits into separate files based on ranges
    const numPages = state.activePdfDoc.getPageCount();
    const rangeArray = rangeStr.split(',').map(r => r.trim()).filter(r => r.length > 0);
    const outputZip = new JSZip(); // Assumes JSZip is loaded, but for simple delivery, we'll output a single combined ZIP download

    const results = [];

    for (let i = 0; i < rangeArray.length; i++) {
        const range = rangeArray[i];
        const doc = await PDFDocument.create();
        
        let startPage, endPage;
        
        if (range.includes('-')) {
            let [start, end] = range.split('-').map(s => s.trim());
            startPage = parseInt(start);
            endPage = end.toUpperCase() === 'END' ? numPages : parseInt(end);
        } else {
            startPage = parseInt(range);
            endPage = startPage;
        }

        // Validate range
        if (isNaN(startPage) || isNaN(endPage) || startPage < 1 || endPage > numPages || startPage > endPage) {
            console.error(`Invalid range: ${range}`);
            continue;
        }

        // Copy pages (0-based indices)
        const pagesToCopy = Array.from({ length: endPage - startPage + 1 }, (_, k) => startPage + k - 1);
        const copiedPages = await doc.copyPages(state.activePdfDoc, pagesToCopy);
        copiedPages.forEach(page => doc.addPage(page));

        const outputBytes = await doc.save();
        
        // Add to results array for ZIP download
        results.push({
            name: `split-part-${i + 1}_pages_${range}.pdf`,
            buffer: outputBytes
        });
    }

    if (results.length === 0) {
        alert("No valid pages selected for splitting.");
        return;
    }
    
    // Create ZIP file
    const zip = new JSZip();
    results.forEach(res => {
        zip.file(res.name, res.buffer);
    });

    const zipBlob = await zip.generateAsync({ type: 'arraybuffer' });
    state.outputBuffer = zipBlob;
    setWorkspaceMode('download');
    document.getElementById('result-message').textContent = `Split into ${results.length} files. Downloading as ZIP.`;
    D.downloadPdfBtn.onclick = () => {
        downloadFile(state.outputBuffer, 'pdf-bestie-split.zip', 'application/zip');
    };
}

/**
 * CORE: Rotates selected pages in activePdfDoc.
 * @param {number} rotationDegrees - 90, 180, or 270.
 */
async function executeRotateOperation(rotationDegrees) {
    if (!state.activePdfDoc) return;
    
    const rotation = degrees(rotationDegrees);
    const selectedIndices = getSelectedPageIndices();
    
    selectedIndices.forEach(index => {
        const page = state.activePdfDoc.getPage(index);
        const currentRotation = page.getRotation().angle;
        // Calculate new rotation by adding
        page.setRotation(degrees(currentRotation + rotationDegrees));
    });

    // Save the new document, update state, and refresh UI
    const outputBytes = await state.activePdfDoc.save();
    state.outputBuffer = outputBytes;
    setWorkspaceMode('download');
    document.getElementById('result-message').textContent = `Pages rotated by ${rotationDegrees}°.`;
}

/**
 * CORE: Deletes selected pages from activePdfDoc.
 */
async function executeDeleteOperation() {
    if (!state.activePdfDoc) return;
    
    // Indices must be deleted in reverse order to avoid changing subsequent indices
    const selectedIndices = getSelectedPageIndices().sort((a, b) => b - a);
    
    selectedIndices.forEach(index => {
        state.activePdfDoc.removePage(index);
    });

    // Save the new document, update state, and refresh UI
    const outputBytes = await state.activePdfDoc.save();
    state.outputBuffer = outputBytes;
    setWorkspaceMode('download');
    document.getElementById('result-message').textContent = `${selectedIndices.length} pages deleted.`;
}

/**
 * CORE: Extracts selected pages into a new PDF document.
 */
async function executeExtractOperation() {
    if (!state.activePdfDoc) return;

    const selectedIndices = getSelectedPageIndices();
    if (selectedIndices.length === 0) return;

    const newDoc = await PDFDocument.create();
    
    // Copy selected pages from activeDoc to newDoc
    const copiedPages = await newDoc.copyPages(state.activePdfDoc, selectedIndices);
    copiedPages.forEach(page => newDoc.addPage(page));

    const outputBytes = await newDoc.save();
    state.outputBuffer = outputBytes;
    setWorkspaceMode('download');
    document.getElementById('result-message').textContent = `${selectedIndices.length} pages extracted to a new PDF.`;
}

/**
 * CORE: Handles the 'reorder' operation by simply saving the document based on the current thumbnail order.
 * The reordering itself is handled dynamically by Drag & Drop on the thumbnail elements.
 */
async function executeReorderOperation() {
    if (!state.activePdfDoc || state.thumbnails.length === 0) return;

    const reorderedIndices = Array.from(D.thumbnailsContainer.children)
        .map(el => parseInt(el.dataset.pageIndex)); // These are the original 0-based indices

    const newDoc = await PDFDocument.create();
    
    // Copy pages in the new order
    const copiedPages = await newDoc.copyPages(state.activePdfDoc, reorderedIndices);
    copiedPages.forEach(page => newDoc.addPage(page));

    const outputBytes = await newDoc.save();
    state.outputBuffer = outputBytes;
    setWorkspaceMode('download');
    document.getElementById('result-message').textContent = `Pages reordered successfully.`;
}

/**
 * CORE: Adds a text watermark to every page of the activePdfDoc.
 */
async function executeWatermarkOperation(text, opacity, size) {
    if (!state.activePdfDoc) return;
    
    const pages = state.activePdfDoc.getPages();
    const doc = state.activePdfDoc;
    const font = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    
    const color = rgb(0.5, 0.5, 0.5); // Grayish color for subtle effect
    const finalOpacity = parseFloat(opacity);
    const finalSize = parseInt(size);

    pages.forEach((page) => {
        const { width, height } = page.getSize();
        
        // Calculate text dimensions
        const textWidth = font.widthOfTextAtSize(text, finalSize);
        const textHeight = font.heightAtSize(finalSize); // ✅ correct API

        // Center position
        const x = (width / 2) - (textWidth / 2);
        const y = (height / 2) - (textHeight / 2);

        // Draw the text
        page.drawText(text, {
            x: x,
            y: y,
            size: finalSize,
            font: font,
            color: color,
            opacity: finalOpacity,
            rotate: degrees(315), // Diagonal rotation for better effect
        });
    });

    const outputBytes = await doc.save();
    state.outputBuffer = outputBytes;
    setWorkspaceMode('download');
    document.getElementById('result-message').textContent = `Watermark applied to ${pages.length} pages.`;
}


/**
 * CORE: Adds page numbers to every page of the activePdfDoc.
 */
async function executePageNumbersOperation(position) {
    if (!state.activePdfDoc) return;
    
    const pages = state.activePdfDoc.getPages();
    const doc = state.activePdfDoc;
    const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);

    const fontSize = 12;
    const margin = 30; // Distance from edge

    pages.forEach((page, index) => {
        const { width } = page.getSize();
        const pageNumText = `${index + 1}`;
        const textWidth = font.widthOfTextAtSize(pageNumText, fontSize);

        let x;
        const y = margin; // bottom offset

        switch (position) {
            case 'bottom-center':
                x = (width / 2) - (textWidth / 2);
                break;
            case 'bottom-left':
                x = margin;
                break;
            case 'bottom-right':
                x = width - textWidth - margin;
                break;
            default:
                x = margin;
        }

        page.drawText(pageNumText, {
            x: x,
            y: y,
            size: fontSize,
            font: font,
            color: rgb(0.2, 0.2, 0.2), // Dark gray
        });
    });

    const outputBytes = await doc.save();
    state.outputBuffer = outputBytes;
    setWorkspaceMode('download');
    document.getElementById('result-message').textContent = `Page numbers added to ${pages.length} pages.`;
}

/**
 * Retrieves the 0-based page indices of all selected (clicked) thumbnails.
 * @returns {number[]} Array of 0-based indices.
 */
function getSelectedPageIndices() {
    const selected = D.thumbnailsContainer.querySelectorAll('.selected');
    return Array.from(selected).map(el => parseInt(el.dataset.pageIndex));
}

// --- DRAG AND DROP (REORDER) LOGIC ---

function setupDragAndDrop() {
    // Only apply for the reorder tool
    if (state.currentTool !== 'reorder') return;
    
    const items = D.thumbnailsContainer.children;
    
    for (let item of items) {
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragenter', handleDragEnter);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('dragleave', handleDragLeave);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragend', handleDragEnd);
    }
}

function handleDragStart(e) {
    state.draggedEl = e.target.closest('.thumbnail-item');
    state.draggedEl.classList.add('dragging');
    state.dragStartIdx = Array.from(D.thumbnailsContainer.children).indexOf(state.draggedEl);
    
    // Set data for transfer (optional, but good practice)
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', state.dragStartIdx);
}

function handleDragEnter(e) {
    if (e.target.closest('.thumbnail-item') !== state.draggedEl) {
        e.target.closest('.thumbnail-item').classList.add('dragover');
    }
}

function handleDragOver(e) {
    e.preventDefault(); // Crucial for allowing drop
    e.dataTransfer.dropEffect = 'move';
}

function handleDragLeave(e) {
    e.target.closest('.thumbnail-item').classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    const dropTarget = e.target.closest('.thumbnail-item');
    dropTarget.classList.remove('dragover');

    if (dropTarget && state.draggedEl && dropTarget !== state.draggedEl) {
        const dropIdx = Array.from(D.thumbnailsContainer.children).indexOf(dropTarget);
        
        // Insert the dragged element before or after the drop target
        if (state.dragStartIdx < dropIdx) {
            D.thumbnailsContainer.insertBefore(state.draggedEl, dropTarget.nextSibling);
        } else {
            D.thumbnailsContainer.insertBefore(state.draggedEl, dropTarget);
        }
        
        // The thumbnails container is now visually reordered.
        // The actual PDF data will be reordered during the 'executeReorderOperation' final step.
    }
}

function handleDragEnd(e) {
    state.draggedEl.classList.remove('dragging');
    state.draggedEl = null;
    state.dragStartIdx = -1;
    
    // Ensure all dragover classes are removed
    Array.from(D.thumbnailsContainer.children).forEach(el => el.classList.remove('dragover'));
}


// --- EVENT LISTENERS ---

// Tool Card Click Handler
document.querySelectorAll('.tool-card').forEach(card => {
    card.addEventListener('click', (e) => {
        state.currentTool = e.currentTarget.dataset.tool;
        D.workspaceTitle.textContent = e.currentTarget.querySelector('h3').textContent;
        D.toolWorkspace.classList.remove('hidden');
        D.toolsOverview.scrollIntoView({ behavior: 'smooth' }); // Smooth scroll back up to make workspace visible
        
        // Reset and set up for the new tool
        setWorkspaceMode('upload');
        showToolControls(state.currentTool);
    });
});

// Close Workspace
D.closeWorkspaceBtn.addEventListener('click', () => {
    D.toolWorkspace.classList.add('hidden');
    state.currentTool = null;
    D.fileInput.value = ''; // Clear file input
});

// Start New Task Button
D.newTaskBtn.addEventListener('click', () => {
    // Go back to the upload screen for the *same* tool
    setWorkspaceMode('upload');
});

// File Input Trigger
D.fileInputTrigger.addEventListener('click', () => D.fileInput.click());
D.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFileLoad(e.target.files);
    }
});

// Drag & Drop File Upload
D.uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    D.uploadArea.classList.add('dragover');
});
D.uploadArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    D.uploadArea.classList.remove('dragover');
});
D.uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    D.uploadArea.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
        handleFileLoad(e.dataTransfer.files);
    }
});

// Watermark Control Updates
D.watermarkOpacity.addEventListener('input', () => {
    D.opacityValue.textContent = `${Math.round(D.watermarkOpacity.value * 100)}%`;
});
D.watermarkSize.addEventListener('input', () => {
    D.sizeValue.textContent = D.watermarkSize.value;
});

// Split Range Input Live Update
D.splitRangeInput.addEventListener('input', updateProcessingButtonState);

// Utility Buttons (Delete/Extract)
D.deleteSelectedBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to delete the selected pages? This operation cannot be undone in the editor.')) {
        await executeDeleteOperation();
    }
});
D.extractSelectedBtn.addEventListener('click', async () => {
    await executeExtractOperation();
});
D.deleteSelectedBtn.setAttribute('title', 'Removes all selected pages from the document.');
D.extractSelectedBtn.setAttribute('title', 'Creates a new PDF containing only the selected pages.');

// Main Processing Button
D.processPdfBtn.addEventListener('click', async () => {
    if (D.processPdfBtn.disabled) return;
    
    D.processPdfBtn.disabled = true;
    D.processPdfBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

    try {
        switch (state.currentTool) {
            case 'merge':
                // Already merged in activateEditorMode. Just save and set output buffer.
                const mergedDoc = state.activePdfDoc;
                const outputBytes = await mergedDoc.save();
                state.outputBuffer = outputBytes;
                setWorkspaceMode('download');
                document.getElementById('result-message').textContent = `Merged ${state.files.length} documents.`;
                break;
            case 'img-to-pdf':
                // Same as merge, for image conversion workflow.
                const imgDoc = state.activePdfDoc;
                const imgOutputBytes = await imgDoc.save();
                state.outputBuffer = imgOutputBytes;
                setWorkspaceMode('download');
                document.getElementById('result-message').textContent = `Converted ${state.files.length} images to PDF.`;
                break;
            case 'split':
                await executeSplitOperation(D.splitRangeInput.value);
                break;
            case 'reorder':
                await executeReorderOperation();
                break;
            case 'rotate':
                await executeRotateOperation(parseInt(D.rotateDegreeSelect.value));
                break;
            case 'delete':
                await executeDeleteOperation();
                break;
            case 'extract':
                await executeExtractOperation();
                break;
            case 'watermark':
                await executeWatermarkOperation(D.watermarkText.value, D.watermarkOpacity.value, D.watermarkSize.value);
                break;
            case 'page-numbers':
                await executePageNumbersOperation(D.pageNumPosSelect.value);
                break;
        }
    } catch (error) {
        console.error('Error during PDF processing:', error);
        alert('An error occurred during processing. Please check the console for details.');
        // Re-enable button on error
        updateProcessingButtonState();
    }
    
    // The setWorkspaceMode('download') will handle re-enabling/changing the final button
});

// Mobile Nav Toggle
D.menuToggle.addEventListener('click', () => {
    D.navMenu.classList.toggle('active');
});

// Smooth Scroll for CTA button
document.querySelectorAll('.smooth-scroll').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        document.querySelector(this.getAttribute('href')).scrollIntoView({
            behavior: 'smooth'
        });
        D.navMenu.classList.remove('active'); // Close menu after click on mobile
    });
});

// Initialize Tooltips for utility elements on load
document.addEventListener('DOMContentLoaded', () => {
    // Set initial opacity/size display
    D.opacityValue.textContent = `${Math.round(D.watermarkOpacity.value * 100)}%`;
    D.sizeValue.textContent = D.watermarkSize.value;
    
    D.rotateDegreeSelect.setAttribute('title', 'Select the degree of rotation to apply to selected pages.');
    
    // Add tooltip to process button on load
    D.processPdfBtn.setAttribute('title', 'Click to execute the PDF operation.');
});