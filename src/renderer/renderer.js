'use strict';

// ── DOM References ─────────────────────────────────────────────────────
const browseBtn          = document.getElementById('browseBtn');
const folderPathEl       = document.getElementById('folderPath');
const subfolderWarning   = document.getElementById('subfolderWarning');
const modeSection        = document.getElementById('modeSection');
const startBtn           = document.getElementById('startBtn');
const progressSection    = document.getElementById('progressSection');
const progressPhase      = document.getElementById('progressPhase');
const progressCount      = document.getElementById('progressCount');
const progressFill       = document.getElementById('progressFill');
const progressFile       = document.getElementById('progressFile');
const resultsSection     = document.getElementById('resultsSection');
const resultsTitle       = document.getElementById('resultsTitle');
const exactCountStat     = document.getElementById('exactCountStat');
const perceptualCountStat = document.getElementById('perceptualCountStat');
const outputFolderInfo   = document.getElementById('outputFolderInfo');
const noDuplicatesInfo   = document.getElementById('noDuplicatesInfo');
const openFolderBtn      = document.getElementById('openFolderBtn');
const resetBtn           = document.getElementById('resetBtn');
const advancedBtn        = document.getElementById('advancedBtn');
const advancedChevron    = document.getElementById('advancedChevron');
const advancedSettings   = document.getElementById('advancedSettings');
const thresholdSlider    = document.getElementById('thresholdSlider');
const thresholdValue     = document.getElementById('thresholdValue');
const errorsInfo         = document.getElementById('errorsInfo');
const errorsList         = document.getElementById('errorsList');

let selectedFolder = null;
let outputFolder   = null;

// ── Folder Selection ───────────────────────────────────────────────────
browseBtn.addEventListener('click', async () => {
  const result = await window.api.selectFolder();

  if (result.folderPath) {
    selectedFolder = result.folderPath;
    folderPathEl.textContent = result.folderPath;
    folderPathEl.classList.add('has-path');

    subfolderWarning.style.display = result.hasSubfolders ? 'flex' : 'none';

    // Reveal step 2 with animation
    modeSection.style.display = 'block';
    modeSection.classList.remove('animate-in');
    void modeSection.offsetWidth; // force reflow for re-animation
    modeSection.classList.add('animate-in');

    // Reset downstream sections
    resultsSection.style.display  = 'none';
    progressSection.style.display = 'none';
  }
});

// ── Radio Card Selection ───────────────────────────────────────────────
document.querySelectorAll('input[name="scanMode"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    document.querySelectorAll('.radio-card').forEach((c) => c.classList.remove('selected'));
    radio.closest('.radio-card').classList.add('selected');

    // Disable threshold slider when "Exact Only" is selected (irrelevant)
    const isExact = radio.value === 'exact';
    thresholdSlider.disabled = isExact;
    document.querySelector('.setting-group').style.opacity = isExact ? '0.4' : '1';
  });
});

// ── Advanced Settings Toggle ───────────────────────────────────────────
advancedBtn.addEventListener('click', () => {
  const visible = advancedSettings.style.display !== 'none';
  advancedSettings.style.display = visible ? 'none' : 'block';
  advancedChevron.classList.toggle('open', !visible);
});

// ── Threshold Slider ───────────────────────────────────────────────────
thresholdSlider.addEventListener('input', () => {
  thresholdValue.textContent = thresholdSlider.value;
});

// ── Start Scan ─────────────────────────────────────────────────────────
startBtn.addEventListener('click', async () => {
  if (!selectedFolder) return;

  const mode      = document.querySelector('input[name="scanMode"]:checked').value;
  const threshold = parseInt(thresholdSlider.value, 10);

  // Tear down old listeners
  window.api.removeAllListeners();

  // Show progress, hide other sections
  modeSection.style.display     = 'none';
  resultsSection.style.display  = 'none';
  progressSection.style.display = 'block';
  progressFill.style.width      = '0%';
  progressCount.textContent     = 'Preparing…';
  progressFile.textContent      = '';

  // ── Progress listener ──────────────────────────────────────────────
  window.api.onProgress((data) => {
    const pct = Math.round((data.current / data.total) * 100);
    progressFill.style.width  = pct + '%';
    progressCount.textContent = `${data.current} / ${data.total}`;
    progressFile.textContent  = data.currentFile;

    if (data.phase === 'exact') {
      progressPhase.textContent = 'Exact Pass';
      progressPhase.className   = 'phase-badge phase-exact';
    } else {
      progressPhase.textContent = 'Perceptual Pass';
      progressPhase.className   = 'phase-badge phase-perceptual';
    }
  });

  // ── Completion listener ────────────────────────────────────────────
  window.api.onComplete((data) => {
    progressSection.style.display = 'none';
    resultsSection.style.display  = 'block';
    resultsTitle.textContent      = '✅ Scan Complete';

    exactCountStat.textContent      = data.exactCount;
    perceptualCountStat.textContent = data.perceptualCount;

    if (data.outputFolder) {
      outputFolder = data.outputFolder;
      outputFolderInfo.style.display = 'block';
      noDuplicatesInfo.style.display = 'none';
    } else {
      outputFolderInfo.style.display = 'none';
      noDuplicatesInfo.style.display = 'block';
    }

    // Show errors if any
    if (data.errors && data.errors.length > 0) {
      errorsInfo.style.display = 'block';
      errorsList.innerHTML     = '';
      data.errors.forEach((err) => {
        const li = document.createElement('li');
        li.textContent = err;
        errorsList.appendChild(li);
      });
    } else {
      errorsInfo.style.display = 'none';
    }
  });

  // ── Error listener ─────────────────────────────────────────────────
  window.api.onError((data) => {
    progressSection.style.display = 'none';
    resultsSection.style.display  = 'block';
    resultsTitle.textContent      = '❌ Error';
    outputFolderInfo.style.display = 'none';
    noDuplicatesInfo.style.display = 'block';
    noDuplicatesInfo.querySelector('p').textContent = data.message;
  });

  // Fire the scan
  await window.api.startScan({ folderPath: selectedFolder, mode, threshold });
});

// ── Open Output Folder ─────────────────────────────────────────────────
openFolderBtn.addEventListener('click', () => {
  if (outputFolder) {
    window.api.openFolder(outputFolder);
  }
});

// ── Reset ──────────────────────────────────────────────────────────────
resetBtn.addEventListener('click', () => {
  selectedFolder = null;
  outputFolder   = null;

  folderPathEl.textContent = 'No folder selected';
  folderPathEl.classList.remove('has-path');
  subfolderWarning.style.display  = 'none';
  modeSection.style.display       = 'none';
  progressSection.style.display   = 'none';
  resultsSection.style.display    = 'none';

  window.api.removeAllListeners();
});
