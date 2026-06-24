import {jd, mu, Il, Wl, zu, gu, pu, wd, xd, bd, Bu, td, ad, ed, id, Sd, Cd, Td, Ul, Hl, Vl, Bl, Yl, _u} from './clean_logic.js';
import { initXR, attachXRSessionListeners } from './xr.js';

var Hd = `再生`, Ud = `一時停止`, Wd = `読み込み中...`, Gd = `VMD は未選択です。`, Kd = `なし`, qd = `PMX 本体とテクスチャ画像を全て選択、またはzipファイルを１つ選択してください。`, Jd = `全画面表示`, Yd = `全画面を解除`, Xd = `リセット`, Zd = `視点リセット`, Qd = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8 3H3v5h2V5h3V3Zm8 0v2h3v3h2V3h-5ZM5 16H3v5h5v-2H5v-3Zm14 3h-3v2h5v-5h-2v3Z" />
  </svg>
`, $d = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 3H7v4H3v2h6V3Zm8 0h-2v6h6V7h-4V3ZM3 17h4v4h2v-6H3v2Zm12 4h2v-4h4v-2h-6v6Z" />
  </svg>
`, ef = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8 5v14l11-7L8 5Z" />
  </svg>
`, tf = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 5h4v14H7V5Zm6 0h4v14h-4V5Z" />
  </svg>
`, nf = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 5a7 7 0 1 1-6.32 4H3l4-4 4 4H8.05A5 5 0 1 0 12 7V5Z" />
  </svg>
`, rf = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 4a8 8 0 0 1 7.45 5.05l-1.86.74A6 6 0 1 0 12 18v-3l5 4-5 4v-3A8 8 0 1 1 12 4Z" />
    <path d="M11 11h2v2h-2v-2Z" />
  </svg>
`, af = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 11H7L6 9Zm4 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z" />
  </svg>
`, of = class {
    handlers;
    root;
    fileInput;
    loadedModelName;
    pendingModelLoadName;
    modelFileError;
    motionInput;
    pendingMotionLoadNames;
    motionFileError;
    cameraMotionInput;
    pendingCameraMotionLoadNames;
    cameraMotionFileError;
    cameraControlsPanel;
    gyroInput;
    gyroModeInputs;
    gyroViewpointSensitivityInput;
    gyroModelCenterSensitivityInput;
    gyroRecalibrateButton;
    trackingBoneField;
    trackingEnabledInput;
    trackingBoneSelect;
    playPauseButton;
    resetButton;
    loopInput;
    motionList;
    cameraMotionList;
    colorInput;
    backgroundModeSelect;
    autoRestoreInput;
    screenAwakeInput;
    debugModeInput;
    physicsSensorInput;
    gravityMagnitudeInput;
    gravityMagnitudeValue;
    physicsSensorImpulseSensitivityInput;
    physicsSensorRecalibrateButton;
    gravityVectorField;
    gravityVectorInput;
    storageUsageElement;
    rotationCenterMarkerInput;
    materialOverridePanel;
    materialSelectAllButton;
    materialClearAllButton;
    materialOverrideList;
    clearCacheButton;
    shadowInput;
    viewerOverlay;
    fullscreenToggleButton;
    overlayPlaybackButton;
    overlayResetButton;
    overlayGyroRecalibrateButton;
    statusText;
    viewerContainer;
    viewerLoading;
    deployedModelsList;
    savedScenesList;
    sceneInput;
    sceneSaveButton;
    sceneLoadButton;
    lastRenderedMotionListKey = null;
    lastRenderedCameraMotionListKey = null;
    lastRenderedTrackingBoneSelectKey = null;
    lastRenderedMaterialOverrideListKey = null;
    constructor(e, t) {
        this.handlers = t, this.root = e.querySelector(`.app-shell`) || document.querySelector(`.app-shell`), this.fileInput = document.querySelector(`.file-input`), this.loadedModelName = document.querySelector(`.loaded-model-name`), this.pendingModelLoadName = document.querySelector(`.pending-model-load`), this.modelFileError = document.querySelector(`.file-error--model`), this.motionInput = document.querySelector(`.motion-input`), this.pendingMotionLoadNames = document.querySelector(`.pending-motion-load`), this.motionFileError = document.querySelector(`.file-error--motion`), this.cameraMotionInput = document.querySelector(`.camera-motion-input`), this.pendingCameraMotionLoadNames = document.querySelector(`.pending-camera-motion-load`), this.cameraMotionFileError = document.querySelector(`.file-error--camera`), this.cameraControlsPanel = document.querySelector(`.camera-controls-panel`), this.gyroInput = document.querySelector(`.gyro-input`), this.gyroModeInputs = Array.from(document.querySelectorAll(`.gyro-mode-input`)), this.gyroViewpointSensitivityInput = document.querySelector(`.gyro-sensitivity-input--viewpoint`), this.gyroModelCenterSensitivityInput = document.querySelector(`.gyro-sensitivity-input--model-center`), this.gyroRecalibrateButton = document.querySelector(`.gyro-recalibrate-button`), this.trackingBoneField = document.querySelector(`.tracking-bone-field`), this.trackingEnabledInput = document.querySelector(`.tracking-enabled-input`), this.trackingBoneSelect = document.querySelector(`.tracking-bone-select`), this.playPauseButton = document.querySelector(`.play-pause-button`), this.resetButton = document.querySelector(`.reset-button`), this.poseResetButton = document.querySelector(`.pose-reset-button`), this.loopInput = document.querySelector(`.loop-input`), this.motionList = document.createElement(`div`), this.cameraMotionList = document.querySelector(`.camera-motion-list`), this.colorInput = document.querySelector(`.color-input`), this.backgroundModeSelect = document.querySelector(`.mode-select`), this.autoRestoreInput = document.querySelector(`.auto-restore-input`), this.screenAwakeInput = document.querySelector(`.screen-awake-toggle`), this.debugModeInput = document.querySelector(`.debug-mode-toggle`), this.physicsSensorInput = document.querySelector(`.physics-sensor-toggle`), this.gravityMagnitudeInput = document.querySelector(`.gravity-magnitude-input`), this.gravityMagnitudeValue = document.querySelector(`.gravity-magnitude-value`), this.physicsSensorImpulseSensitivityInput = document.querySelector(`.physics-sensor-impulse-sensitivity-input`), this.physicsSensorRecalibrateButton = document.querySelector(`.physics-sensor-recalibrate-button`), this.gravityVectorField = document.querySelector(`.gravity-vector-field`), this.gravityVectorInput = document.querySelector(`.gravity-vector-toggle`), this.storageUsageElement = document.querySelector(`.storage-usage`), this.rotationCenterMarkerInput = document.querySelector(`.rotation-center-marker-toggle`), this.materialOverridePanel = document.querySelector(`.material-override-panel`), this.materialSelectAllButton = document.querySelector(`.material-select-all-button`), this.materialClearAllButton = document.querySelector(`.material-clear-all-button`), this.materialOverrideList = document.querySelector(`.material-override-list`), this.clearCacheButton = document.querySelector(`.clear-cache-button`), this.shadowInput = document.querySelector(`.shadow-toggle`), this.viewerOverlay = document.querySelector(`.viewer-overlay`), this.fullscreenToggleButton = document.querySelector(`.fullscreen-toggle`), this.overlayPlaybackButton = document.querySelector(`.overlay-playback-toggle`), this.overlayResetButton = document.querySelector(`.overlay-reset-button`), this.overlayGyroRecalibrateButton = document.querySelector(`.overlay-gyro-recalibrate-button`), this.statusText = document.querySelector(`.status`), this.viewerContainer = document.querySelector(`.viewer`), this.viewerLoading = document.querySelector(`.viewer-loading`), this.viewerCanvas = this.viewerContainer ?.querySelector(`.viewer-canvas`),
        this.deployedModelsList = document.querySelector(`#deployed-models-list`),
        this.savedScenesList = document.querySelector(`#saved-scenes-list`),
        this.sceneInput = document.querySelector(`.scene-input`),
        this.sceneSaveButton = document.querySelector(`#scene-save-button`),
        this.sceneLoadButton = document.querySelector(`#scene-load-button`),
        this.fileInput ?.addEventListener(`change`, () => {
            this.fileInput.files !== null && this.fileInput.files.length > 0 && this.handlers.onFilesSelected(this.fileInput.files)
        }), this.motionInput ?.addEventListener(`change`, () => {
            if (this.motionInput.files !== null) {
                if (this.motionInput.files.length > 0) {
                    this.handlers.onMotionFilesSelected(Array.from(this.motionInput.files)), this.motionInput.value = ``
                } else {
                    this.handlers.onClearMotionFiles ?.()
                }
            }
        }), this.cameraMotionInput ?.addEventListener(`change`, () => {
            this.cameraMotionInput.files !== null && this.cameraMotionInput.files.length > 0 && (this.handlers.onCameraFilesSelected(Array.from(this.cameraMotionInput.files)), this.cameraMotionInput.value = ``)
        }), this.gyroInput ?.addEventListener(`change`, () => {
            this.handlers.onGyroEnabledChanged(this.gyroInput.checked)
        }), this.sceneInput ?.addEventListener(`change`, () => {
            this.sceneInput.files !== null && this.sceneInput.files.length > 0 && (this.handlers.onSceneLoad?.(this.sceneInput.files[0]), this.sceneInput.value = ``)
        }), this.sceneSaveButton ?.addEventListener(`click`, () => {
            this.handlers.onSceneSave?.()
        }), this.sceneLoadButton ?.addEventListener(`click`, () => {
            this.sceneInput ?.click()
        });
        for (let e of this.gyroModeInputs) e.addEventListener(`change`, () => {
            e.checked && this.handlers.onGyroModeChanged(e.value)
        });
        this.gyroViewpointSensitivityInput ?.addEventListener(`input`, () => {
            this.handlers.onGyroViewpointSensitivityChanged(Number(this.gyroViewpointSensitivityInput.value))
        }), this.gyroModelCenterSensitivityInput ?.addEventListener(`input`, () => {
            this.handlers.onGyroModelCenterSensitivityChanged(Number(this.gyroModelCenterSensitivityInput.value))
        }), this.gyroRecalibrateButton ?.addEventListener(`click`, () => {
            this.handlers.onGyroRecalibrate()
        }), this.trackingEnabledInput ?.addEventListener(`change`, () => {
            this.handlers.onTrackingEnabledChanged(this.trackingEnabledInput.checked)
        }), this.trackingBoneSelect ?.addEventListener(`change`, () => {
            this.handlers.onTrackingBoneChanged(this.trackingBoneSelect.value)
        }), this.playPauseButton ?.addEventListener(`click`, () => {
            this.handlers.onPlayPauseToggled()
        }), this.resetButton ?.addEventListener(`click`, () => {
            this.handlers.onResetRequested()
        }), this.poseResetButton ?.addEventListener(`click`, () => {
            this.handlers.onPoseResetRequested()
        }), this.loopInput ?.addEventListener(`change`, () => {
            this.handlers.onLoopChanged(this.loopInput.checked)
        }), this.colorInput ?.addEventListener(`input`, () => {
            this.handlers.onBackgroundColorChanged(this.colorInput.value)
        }), this.backgroundModeSelect ?.addEventListener(`change`, () => {
            this.handlers.onBackgroundModeChanged(this.backgroundModeSelect.value)
        }), this.autoRestoreInput ?.addEventListener(`change`, () => {
            this.handlers.onAutoRestoreChanged(this.autoRestoreInput.checked)
        }), this.screenAwakeInput ?.addEventListener(`change`, () => {
            this.handlers.onScreenAwakeEnabledChanged(this.screenAwakeInput.checked)
        }), this.debugModeInput ?.addEventListener(`change`, () => {
            this.handlers.onDebugModeChanged(this.debugModeInput.checked)
        }), this.shadowInput ?.addEventListener(`change`, () => {
            this.handlers.onShadowEnabledChanged(this.shadowInput.checked)
        }), this.physicsSensorInput ?.addEventListener(`change`, () => {
            this.handlers.onPhysicsSensorEnabledChanged(this.physicsSensorInput.checked)
        }), this.gravityMagnitudeInput ?.addEventListener(`input`, () => {
            this.handlers.onGravityMagnitudeChanged(Number(this.gravityMagnitudeInput.value))
        }), this.physicsSensorImpulseSensitivityInput ?.addEventListener(`input`, () => {
            this.handlers.onPhysicsSensorImpulseSensitivityChanged(Number(this.physicsSensorImpulseSensitivityInput.value))
        }), this.physicsSensorRecalibrateButton ?.addEventListener(`click`, () => {
            this.handlers.onPhysicsSensorRecalibrate()
        }), this.gravityVectorInput ?.addEventListener(`change`, () => {
            this.handlers.onGravityVectorVisibilityChanged(this.gravityVectorInput.checked)
        }), this.rotationCenterMarkerInput ?.addEventListener(`change`, () => {
            this.handlers.onRotationCenterMarkerVisibilityChanged(this.rotationCenterMarkerInput.checked)
        }), this.materialSelectAllButton ?.addEventListener(`click`, () => {
            this.handlers.onAllMaterialOverridesChanged(!0)
        }), this.materialClearAllButton ?.addEventListener(`click`, () => {
            this.handlers.onAllMaterialOverridesChanged(!1)
        }), this.clearCacheButton ?.addEventListener(`click`, () => {
            this.handlers.onClearCache()
        }), this.fullscreenToggleButton ?.addEventListener(`click`, () => {
            this.handlers.onFullscreenToggled()
        }), this.overlayPlaybackButton ?.addEventListener(`click`, () => {
            this.handlers.onPlayPauseToggled()
        }), this.overlayResetButton ?.addEventListener(`click`, () => {
            this.handlers.onResetRequested()
        }), this.overlayGyroRecalibrateButton ?.addEventListener(`click`, () => {
            this.handlers.onGyroRecalibrate()
        })
    } getViewerContainer() {
        return this.viewerContainer
    } setStorageUsageText(e) {
        this.storageUsageElement.textContent = e
    } render(e) {
        let t = e.isLoading || e.isMotionLoading || e.isCameraMotionLoading;
        sf(this.colorInput, e.settings.backgroundColor), this.loadedModelName.textContent = e.loadedModel ?.fileName ?? ``, this.loadedModelName.hidden = e.loadedModel === null, lf(this.pendingModelLoadName, e.pendingModelLoadName), uf(this.pendingMotionLoadNames, e.pendingMotionLoadNames), uf(this.pendingCameraMotionLoadNames, e.pendingCameraMotionLoadNames), cf(this.modelFileError, e.modelLoadError), cf(this.motionFileError, e.motionLoadError), cf(this.cameraMotionFileError, e.cameraMotionLoadError), this.backgroundModeSelect.value = e.settings.backgroundMode, this.autoRestoreInput.checked = e.settings.isAutoRestoreEnabled, this.screenAwakeInput.checked = e.settings.isScreenAwakeEnabled, this.debugModeInput.checked = e.settings.isDebugModeEnabled, this.shadowInput && (this.shadowInput.checked = e.settings.isShadowEnabled === true), this.physicsSensorInput.checked = e.settings.isPhysicsSensorEnabled, sf(this.gravityMagnitudeInput, String(e.settings.gravityMagnitude)), this.gravityMagnitudeValue.textContent = e.settings.gravityMagnitude.toFixed(1), sf(this.physicsSensorImpulseSensitivityInput, String(e.settings.physicsSensorImpulseSensitivity)), this.physicsSensorImpulseSensitivityInput.disabled = !e.settings.isPhysicsSensorEnabled, this.physicsSensorRecalibrateButton.disabled = !e.settings.isPhysicsSensorEnabled, this.gravityVectorField.hidden = !e.settings.isDebugModeEnabled, this.gravityVectorInput.checked = e.settings.isGravityVectorVisible, this.rotationCenterMarkerInput.checked = e.settings.isRotationCenterMarkerVisible, this.renderMaterialOverrideList(e), this.viewerOverlay.classList.toggle(`viewer-overlay--fullscreen`, e.isFullscreen), this.fullscreenToggleButton.innerHTML = e.isFullscreen ? $d: Qd, this.fullscreenToggleButton.setAttribute(`aria-label`, e.isFullscreen ? Yd: Jd), this.overlayPlaybackButton.innerHTML = e.isPlaying ? tf: ef, this.overlayPlaybackButton.setAttribute(`aria-label`, e.isPlaying ? Ud: Hd), this.fileInput.disabled = e.isLoading, this.motionInput.disabled = e.isLoading || e.loadedModel === null, this.cameraMotionInput.disabled = e.isLoading || e.isCameraMotionLoading, this.cameraControlsPanel.hidden = e.loadedModel === null, this.gyroInput.checked = e.isGyroEnabled;
        let n = e.settings.gyroMode;
        for (let t of this.gyroModeInputs) t.checked = t.value === n, t.disabled = !e.isGyroEnabled;
        sf(this.gyroViewpointSensitivityInput, String(e.settings.gyroViewpointSensitivity)), sf(this.gyroModelCenterSensitivityInput, String(e.settings.gyroModelCenterSensitivity)), this.gyroViewpointSensitivityInput.disabled = !e.isGyroEnabled, this.gyroModelCenterSensitivityInput.disabled = !e.isGyroEnabled, this.gyroRecalibrateButton.disabled = !e.isGyroEnabled, this.renderTrackingBoneSelect(e);
        let r = e.loadedMotions.some(e => e.isActive), i = e.activeCameraMotionFileName !== null, a = e.loadedMotions.length > 0 || e.loadedCameraMotions.length > 0;
        if (this.playPauseButton.disabled = e.isLoading || e.isMotionLoading || e.isCameraMotionLoading || !r && !i, this.resetButton.disabled = e.isLoading || e.isMotionLoading || e.isCameraMotionLoading || e.loadedModel === null || !a, this.poseResetButton.disabled = e.isLoading || e.loadedModel === null, this.overlayPlaybackButton.hidden = !e.isFullscreen, this.overlayResetButton.hidden = !e.isFullscreen, this.overlayGyroRecalibrateButton.hidden = !e.isFullscreen || !e.isGyroEnabled, this.overlayPlaybackButton.disabled = this.playPauseButton.disabled, this.overlayResetButton.disabled = this.resetButton.disabled, this.overlayGyroRecalibrateButton.disabled = !e.isGyroEnabled, this.loopInput.checked = e.isLooping, this.loopInput.disabled = e.isLoading || e.isMotionLoading || e.isCameraMotionLoading, this.playPauseButton.textContent = e.isPlaying ? Ud: Hd, this.renderCameraMotionList(e), this.viewerLoading.hidden = !t, t) {
            this.statusText.textContent = Wd;
            return
        } if (e.errorMessage !== null) {
            this.statusText.textContent = e.errorMessage;
            return
        } this.statusText.textContent = e.loadedModel === null ? qd: ``;
        this.renderDeployedModels(e);
        this.renderSavedScenes(e);
    } renderDeployedModels(e) {
        if (!this.deployedModelsList) return;
        this.deployedModelsList.replaceChildren();
        if (!e.models || e.models.length === 0) {
            const empty = document.createElement("p");
            empty.className = "motion-empty";
            empty.style.margin = "0";
            empty.textContent = "配置されているモデルはありません。";
            this.deployedModelsList.append(empty);
            return;
        }
        for (const m of e.models) {
            const row = document.createElement("div");
            row.className = "deployed-model-row";
            row.style.borderBottom = "1px solid #2a3542";
            row.style.padding = "0.5em 0";

            const header = document.createElement("div");
            header.style.display = "flex";
            header.style.justifyContent = "space-between";
            header.style.alignItems = "center";

            const label = document.createElement("label");
            label.className = "checkbox-field";
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = "active-model-choice";
            radio.checked = m.isActive;
            radio.addEventListener("change", () => {
                if (radio.checked) this.handlers.onActiveModelChanged?.(m.id);
            });
            const span = document.createElement("span");
            span.className = "motion-name";
            span.textContent = m.fileName;
            label.append(radio, span);

            const removeBtn = this.createMotionRemoveButton(() => this.handlers.onModelRemove?.(m.id), e.isLoading);
            header.append(label, removeBtn);
            row.append(header);

            const transformRow = document.createElement("div");
            transformRow.style.display = "flex";
            transformRow.style.gap = "0.5em";
            transformRow.style.fontSize = "0.9em";
            transformRow.style.marginTop = "0.3em";
            
            ['x', 'y', 'z'].forEach(axis => {
                const field = document.createElement("label");
                field.style.display = "flex";
                field.style.alignItems = "center";
                field.style.gap = "0.2em";
                const axisLabel = document.createElement("span");
                axisLabel.style.color = "#7b8ba4";
                axisLabel.textContent = axis.toUpperCase();
                const input = document.createElement("input");
                input.type = "number";
                input.step = "0.5";
                input.style.width = "4em";
                input.style.background = "#1b2531";
                input.style.color = "#fff";
                input.style.border = "1px solid #3b4859";
                input.value = (m.position[axis] || 0).toFixed(1);
                input.addEventListener("change", () => {
                    this.handlers.onModelPositionChanged?.(m.id, axis, parseFloat(input.value) || 0);
                });
                field.append(axisLabel, input);
                transformRow.append(field);
            });
            row.append(transformRow);
            this.deployedModelsList.append(row);
        }
    } renderSavedScenes(e) {
        if (!this.savedScenesList) return;
        this.savedScenesList.replaceChildren();
        if (!e.savedScenes || e.savedScenes.length === 0) {
            const empty = document.createElement("p");
            empty.className = "motion-empty";
            empty.style.margin = "0";
            empty.textContent = "保存されたシーンはありません。";
            this.savedScenesList.append(empty);
            return;
        }
        for (const s of e.savedScenes) {
            const row = document.createElement("div");
            row.className = "scene-entry";
            row.style.display = "flex";
            row.style.justifyContent = "space-between";
            row.style.alignItems = "center";
            row.style.padding = "0.3em 0";

            const nameSpan = document.createElement("span");
            nameSpan.className = "motion-name";
            nameSpan.style.cursor = "pointer";
            nameSpan.textContent = s.name;
            nameSpan.title = "シーンを復元";
            nameSpan.addEventListener("click", () => {
                this.handlers.onLoadSavedScene?.(s.yaml);
            });

            const actions = document.createElement("div");
            actions.style.display = "flex";
            actions.style.gap = "0.3em";

            const downloadBtn = document.createElement("button");
            downloadBtn.type = "button";
            downloadBtn.className = "motion-remove-button";
            downloadBtn.title = "ダウンロード";
            downloadBtn.innerHTML = `
                <svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor">
                  <path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/>
                </svg>
            `;
            downloadBtn.addEventListener("click", () => {
                const blob = new Blob([s.yaml], { type: 'text/yaml' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = s.name;
                a.click();
                URL.revokeObjectURL(url);
            });

            const deleteBtn = this.createMotionRemoveButton(() => this.handlers.onDeleteSavedScene?.(s.timestamp), false);
            actions.append(downloadBtn, deleteBtn);
            row.append(nameSpan, actions);
            this.savedScenesList.append(row);
        }
    } renderCameraMotionList(e) {
        let t = [e.loadedCameraMotions.map(e => e.fileName).join(`|`), e.activeCameraMotionFileName ?? ``, String(e.isLoading), String(e.isCameraMotionLoading)].join(`::`);
        if (t === this.lastRenderedCameraMotionListKey) return ;
        this.lastRenderedCameraMotionListKey = t, this.cameraMotionList.replaceChildren();
        let n = document.createElement(`label`);
        n.className = `motion-entry`;
        let r = document.createElement(`input`);
        r.type = `radio`, r.name = `camera-motion`, r.checked = e.activeCameraMotionFileName === null, r.disabled = e.isLoading || e.isCameraMotionLoading, r.addEventListener(`change`, () => {
            r.checked && this.handlers.onActiveCameraMotionChanged(null)
        });
        let i = document.createElement(`span`);
        i.textContent = Kd, n.append(r, i), this.cameraMotionList.append(n);
        for (let t of e.loadedCameraMotions) {
            let n = document.createElement(`label`);
            n.className = `motion-entry`;
            let r = document.createElement(`input`);
            r.type = `radio`, r.name = `camera-motion`, r.checked = e.activeCameraMotionFileName === t.fileName, r.disabled = e.isLoading || e.isCameraMotionLoading, r.addEventListener(`change`, () => {
                r.checked && this.handlers.onActiveCameraMotionChanged(t.fileName)
            });
            let i = document.createElement(`span`);
            i.className = `motion-name`, i.textContent = t.fileName;
            let a = this.createMotionRemoveButton(() => this.handlers.onCameraMotionRemove(t.fileName), e.isLoading || e.isCameraMotionLoading);
            n.append(r, i, a), this.cameraMotionList.append(n)
        }
    } createMotionRemoveButton(e, t) {
        let n = document.createElement(`button`);
        return n.className = `motion-remove-button`, n.type = `button`, n.disabled = t, n.setAttribute(`aria-label`, `削除`), n.innerHTML = af, n.addEventListener(`click`, t => {
            t.preventDefault(), t.stopPropagation(), e()
        }), n
    } renderTrackingBoneSelect(e) {
        let t = e.loadedModel !== null;
        this.trackingBoneField.hidden = !t, this.trackingEnabledInput.checked = e.settings.isTrackingEnabled, this.trackingEnabledInput.disabled = !t, this.trackingBoneSelect.disabled = !t || !e.settings.isTrackingEnabled || (e.loadedModel ?.availableBoneNames.length ?? 0) === 0;
        let n = [String(t), String(e.settings.isTrackingEnabled), e.loadedModel ?.availableBoneNames.join(`|`) ?? ``, e.trackingBoneName ?? ``].join(`::`);
        if (n !== this.lastRenderedTrackingBoneSelectKey) {
            if (this.lastRenderedTrackingBoneSelectKey = n, this.trackingBoneSelect.replaceChildren(), e.loadedModel !== null) for (let t of e.loadedModel.availableBoneNames) {
                let e = document.createElement(`option`);
                e.value = t, e.textContent = t, this.trackingBoneSelect.append(e)
            } this.trackingBoneSelect.value = e.trackingBoneName ?? ``
        }
    } renderMaterialOverrideList(e) {
        let t = e.settings.isDebugModeEnabled && e.suspiciousMaterials.length > 0;
        this.materialOverridePanel.hidden = !t, this.materialSelectAllButton.disabled = !t, this.materialClearAllButton.disabled = !t;
        let n = [String(t), e.suspiciousMaterials.map(t => `${t.name}:${String(e.materialVisibilityOverrides[t.name]===!0)}`).join(`|`)].join(`::`);
        if (n !== this.lastRenderedMaterialOverrideListKey && (this.lastRenderedMaterialOverrideListKey = n, this.materialOverrideList.replaceChildren(), t)) for (let t of e.suspiciousMaterials) {
            let n = document.createElement(`li`);
            n.className = `material-override-entry`;
            let r = document.createElement(`label`);
            r.className = `checkbox-field`;
            let i = document.createElement(`input`);
            i.type = `checkbox`, i.checked = e.materialVisibilityOverrides[t.name] === !0, i.addEventListener(`change`, () => {
                this.handlers.onMaterialOverrideChanged(t.name, i.checked)
            });
            let a = document.createElement(`span`);
            a.textContent = t.name === `` ? `(unnamed)`: t.name;
            let o = document.createElement(`span`);
            o.className = `material-override-detail`, o.textContent = `opacity=${t.originalOpacity}, transparent=${String(t.originalTransparent)}`, r.append(i, a), n.append(r, o), this.materialOverrideList.append(n)
        }
    }
};
function sf(e, t) {
    let n = t;
    if (e.type === `range`) {
        let r = e.getAttribute(`step`), i = Number(t);
        if (!Number.isNaN(i) && r !== null && r !== `any`) {
            let e = (r.split(`.`)[1] ?? ``).length;
            n = i.toFixed(e)
        }
    } e.value !== n && (e.value = n)
} function cf(e, t) {
    e.textContent = t ?? ``, e.hidden = t === null
} function lf(e, t) {
    e.textContent = t === null ? ``: `\u51e6\u7406\u4e2d: ${t}`, e.hidden = t === null
} function uf(e, t) {
    e.textContent = t.length === 0 ? ``: `\u51e6\u7406\u4e2d: ${t.join(`, `)}`, e.hidden = t.length === 0
} var df = `先に PMX モデルを読み込んでください。`, ff = `VMD モーションをモデルへ適用できませんでした。`, pf = `モデスの読み込みに失敗しました。`, mf = [/\u8155/,/\u3046\u3067/,/\u624b/,/\u6307/,/\u808c/,/\u7d20\u808c/,/\u4f53/,/\u30dc\u30c7\u30a3/,/skin/i,/arm/i,/hand/i,/body/i], hf = document.querySelector(`#app`);
if (hf === null) throw Error(`#app element was not found.`);
var Z = new jd, gf = new mu, Q = new Il(Wl());
try {
    const savedSettings = localStorage.getItem('webmmd-settings');
    if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        Z.setState({ settings: parsed });
    }
    const savedScenesStr = localStorage.getItem('webmmd-saved-scenes');
    if (savedScenesStr) {
        const savedScenes = JSON.parse(savedScenesStr);
        Z.setState({ savedScenes });
    } else {
        Z.setState({ savedScenes: [] });
    }
    Z.setState({ models: [], loadedModel: null });
} catch (err) {
    console.warn('[settings] load failed', err);
}
Q.setPlaybackFinishedCallback(() => {
    Z.setState({
        isPlaying: !1
    })
});
var loadedModels = [], vf = [], yf = [], bf = 0, xf = 0, Sf = 0, Cf = 0, wf = new of(hf, {
    onFilesSelected: e => {
        Ef(e)
    }, onMotionFilesSelected: e => {
        const mesh = Q.getCurrentMesh();
        if (mesh !== null) {
            for (const action of Q.getCurrentActions().values()) {
                action.time = 0;
                action.enabled = false;
            }
        }
        Wf();
        if (mesh !== null) {
            Q.resetMeshToRestPose(mesh);
            const ho = Q.helper.objects.get(mesh);
            if (ho?.backupBones) {
                const bones = mesh.skeleton.bones;
                const bb = ho.backupBones;
                for (let i = 0; i < bones.length; i++) {
                    bones[i].position.toArray(bb, i * 7);
                    bones[i].quaternion.toArray(bb, i * 7 + 3);
                }
            }
            if (ho?.physics) ho.physics.reset();
        }
        Z.setState({ loadedMotions: [], hasMotion: false });
        Df(e)
    }, onMotionActiveChanged: (e, t) => {
        jf(e, t)
    }, onMotionRemove: e => {
        kf(e)
    }, onClearMotionFiles: () => {
        Wf()
    }, onCameraFilesSelected: e => {
        Of(e)
    }, onActiveCameraMotionChanged: e => {
        Mf(e)
    }, onCameraMotionRemove: e => {
        Af(e)
    }, onActiveModelChanged: id => {
        const nextModels = Z.getState().models.map(m => ({ ...m, isActive: m.id === id }));
        const targetModel = loadedModels.find(m => m.model.uuid === id);
        if (targetModel) {
            $.currentModel = targetModel.model;
            Q.currentMesh = targetModel.model.isSkinnedMesh ? targetModel.model : getSkinnedMesh(targetModel.model);
            const boneNames = gu(targetModel.model);
            Z.setState({
                models: nextModels,
                loadedModel: {
                    fileName: targetModel.fileName,
                    object: targetModel.model,
                    availableBoneNames: boneNames
                },
                loadedMotions: targetModel.loadedMotions || [],
                hasMotion: (targetModel.loadedMotions || []).length > 0,
                trackingBoneName: targetModel.trackingBoneName || null
            });
            $.setTrackingBone(targetModel.trackingBoneName || null);
            if (window.webmmdUI && typeof window.webmmdUI.setSelectedAssets === "function") {
                const activeMotions = (targetModel.loadedMotions || []).filter(mo => mo.isActive).map(mo => mo.fileName);
                window.webmmdUI.setSelectedAssets(targetModel.fileName, activeMotions);
            }
        }
    }, onModelPositionChanged: (id, axis, val) => {
        const nextModels = Z.getState().models.map(m => {
            if (m.id === id) {
                const pos = { ...m.position, [axis]: val };
                const targetModel = loadedModels.find(t => t.model.uuid === id);
                if (targetModel) {
                    targetModel.model.position[axis] = val;
                }
                return { ...m, position: pos };
            }
            return m;
        });
        Z.setState({ models: nextModels });
    }, onModelRemove: id => {
        const targetIndex = loadedModels.findIndex(m => m.model.uuid === id);
        if (targetIndex !== -1) {
            const target = loadedModels[targetIndex];
            $.removeModel(target.model);
            Q.removeModel(target.model);
            target.dispose();
            loadedModels.splice(targetIndex, 1);
        }
        const nextModels = Z.getState().models.filter(m => m.id !== id);
        if (nextModels.length > 0 && !nextModels.some(m => m.isActive)) {
            nextModels[nextModels.length - 1].isActive = true;
        }
        Z.setState({ models: nextModels });
        
        const activeModel = nextModels.find(m => m.isActive);
        if (activeModel) {
            const targetModel = loadedModels.find(m => m.model.uuid === activeModel.id);
            if (targetModel) {
                $.currentModel = targetModel.model;
                Q.currentMesh = targetModel.model.isSkinnedMesh ? targetModel.model : getSkinnedMesh(targetModel.model);
                const boneNames = gu(targetModel.model);
                Z.setState({
                    loadedModel: {
                        fileName: targetModel.fileName,
                        object: targetModel.model,
                        availableBoneNames: boneNames
                    },
                    loadedMotions: targetModel.loadedMotions || [],
                    hasMotion: (targetModel.loadedMotions || []).length > 0
                });
                if (window.webmmdUI && typeof window.webmmdUI.setSelectedAssets === "function") {
                    const activeMotions = (targetModel.loadedMotions || []).filter(mo => mo.isActive).map(mo => mo.fileName);
                    window.webmmdUI.setSelectedAssets(targetModel.fileName, activeMotions);
                }
            }
        } else {
            $.currentModel = null;
            Q.currentMesh = null;
            Z.setState({ loadedModel: null, loadedMotions: [], hasMotion: false });
            if (window.webmmdUI && typeof window.webmmdUI.setSelectedAssets === "function") {
                window.webmmdUI.setSelectedAssets(null, null);
            }
        }
    }, onSceneSave: () => {
        const modelsState = Z.getState().models;
        const sceneData = {
            models: modelsState.map(m => {
                const targetModel = loadedModels.find(t => t.model.uuid === m.id);
                return {
                    fileName: m.fileName,
                    position: [m.position.x, m.position.y, m.position.z],
                    motions: (targetModel?.loadedMotions || []).map(mo => mo.fileName)
                };
            }),
            cameraMotion: Z.getState().activeCameraMotionFileName
        };
        const yamlStr = jsyaml.dump(sceneData);
        const blob = new Blob([yamlStr], { type: 'text/yaml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `scene_${Date.now()}.yml`;
        a.click();
        URL.revokeObjectURL(url);
        
        const savedScenes = [...(Z.getState().savedScenes || [])];
        const newScene = {
            name: `scene_${Date.now()}.yml`,
            yaml: yamlStr,
            timestamp: Date.now()
        };
        savedScenes.push(newScene);
        Z.setState({ savedScenes });
        try {
            localStorage.setItem('webmmd-saved-scenes', JSON.stringify(savedScenes));
        } catch(e) {
            console.warn('Failed to save scenes to localStorage', e);
        }
    }, onSceneLoad: file => {
        const reader = new FileReader();
        reader.onload = async e => {
            try {
                const yamlStr = e.target.result;
                await loadSceneFromYaml(yamlStr);
            } catch (err) {
                console.error('Failed to parse scene YAML', err);
                alert('シーンファイルの読み込みに失敗しました。');
            }
        };
        reader.readAsText(file);
    }, onLoadSavedScene: yamlStr => {
        loadSceneFromYaml(yamlStr).catch(err => {
            console.error(err);
            alert('シーンの読み込みに失敗しました。');
        });
    }, onDeleteSavedScene: timestamp => {
        const savedScenes = (Z.getState().savedScenes || []).filter(s => s.timestamp !== timestamp);
        Z.setState({ savedScenes });
        try {
            localStorage.setItem('webmmd-saved-scenes', JSON.stringify(savedScenes));
        } catch(e) {
            console.warn('Failed to save scenes to localStorage', e);
        }
    }, onGyroEnabledChanged: e => {
        $.setGyroEnabled(e), Z.setState({
            isGyroEnabled: e, settings: {
...Z.getState().settings, isGyroEnabled: e
            }
        })
    }, onGyroModeChanged: e => {
        $.setGyroMode(e), Z.setState({
            settings: {
...Z.getState().settings, gyroMode: e
            }
        })
    }, onGyroViewpointSensitivityChanged: e => {
        $.setGyroViewpointSensitivity(e), Z.setState({
            settings: {
...Z.getState().settings, gyroViewpointSensitivity: e
            }
        })
    }, onGyroModelCenterSensitivityChanged: e => {
        $.setGyroModelCenterSensitivity(e), Z.setState({
            settings: {
...Z.getState().settings, gyroModelCenterSensitivity: e
            }
        })
    }, onGyroRecalibrate: () => {
        $.recalibrateGyro()
    }, onTrackingEnabledChanged: e => {
        $.setTrackingEnabled(e), Z.setState({
            settings: {
...Z.getState().settings, isTrackingEnabled: e
            }
        })
    }, onTrackingBoneChanged: e => {
        $.setTrackingBone(e), Z.setState({
            trackingBoneName: e, settings: {
...Z.getState().settings, trackingBoneName: e
            }
        })
    }, onPlayPauseToggled: () => {
        let e = !Z.getState().isPlaying;
        Q.setPlaying(e), Z.setState({
            isPlaying: e
        })
    }, onResetRequested: () => {
        Q.resetMotions()
    }, onPoseResetRequested: () => {
        let mesh = Q.getCurrentMesh();
        if (mesh !== null) {
            for (let action of Q.getCurrentActions().values()) {
                action.time = 0;
                action.enabled = false;
            }
            Q.resetMeshToRestPose(mesh);
            Q.setPlaying(false);
            Z.setState({ isPlaying: false });
        }
    }, onLoopChanged: e => {
        Q.setLooping(e), Z.setState({
            isLooping: e
        }), Lf()
    }, onBackgroundColorChanged: e => {
        Z.setState({
            settings: {
...Z.getState().settings, backgroundColor: e
            }
        })
    }, onBackgroundModeChanged: e => {
        Z.setState({
            settings: {
...Z.getState().settings, backgroundMode: e
            }
        })
    }, onAutoRestoreChanged: e => {
        Z.setState({
            settings: {
                ...Z.getState().settings, isAutoRestoreEnabled: e
            }
        });
        if (!e) {
            Td().catch(err => console.warn('[main] clearSessionCache on disable failed', err));
        }
    }, onScreenAwakeEnabledChanged: e => {
        Z.setState({
            settings: {
...Z.getState().settings, isScreenAwakeEnabled: e
            }
        }), gf.setEnabled(e)
    }, onDebugModeChanged: e => {
        Z.setState({
            settings: {
...Z.getState().settings, isDebugModeEnabled: e
            }
        }), e ? $.dumpMaterialDetails(): ($.applyMaterialOverrides({
        }), Z.setState({
            materialVisibilityOverrides: {
            }
        }))
    }, onShadowEnabledChanged: e => {
        Z.setState({
            settings: {
...Z.getState().settings, isShadowEnabled: e
            }
        }), applyShadowEnabled(e)
    }, onPhysicsSensorEnabledChanged: e => {
        Q.setPhysicsSensorEnabled(e), Z.setState({
            settings: {
...Z.getState().settings, isPhysicsSensorEnabled: e
            }
        })
    }, onGravityMagnitudeChanged: e => {
        Q.setGravityMagnitude(e), Z.setState({
            settings: {
...Z.getState().settings, gravityMagnitude: e
            }
        })
    }, onPhysicsSensorImpulseSensitivityChanged: e => {
        Q.setPhysicsSensorImpulseSensitivity(e), Z.setState({
            settings: {
...Z.getState().settings, physicsSensorImpulseSensitivity: e
            }
        })
    }, onPhysicsSensorRecalibrate: () => {
        Q.recalibratePhysicsSensor()
    }, onGravityVectorVisibilityChanged: e => {
        Z.setState({
            settings: {
...Z.getState().settings, isGravityVectorVisible: e
            }
        })
    }, onRotationCenterMarkerVisibilityChanged: e => {
        Z.setState({
            settings: {
...Z.getState().settings, isRotationCenterMarkerVisible: e
            }
        })
    }, onMaterialOverrideChanged: (e, t) => {
        let n = {
...Z.getState().materialVisibilityOverrides, [e]: t
        };
        $.applyMaterialOverrides(n), Z.setState({
            materialVisibilityOverrides: n
        })
    }, onAllMaterialOverridesChanged: e => {
        let t = Object.fromEntries(Z.getState().suspiciousMaterials.map(t => [t.name, e]));
        $.applyMaterialOverrides(t), Z.setState({
            materialVisibilityOverrides: t
        })
    }, onClearCache: () => {
        Uf()
    }, onFullscreenToggled: () => {
        Tf()
    }
}), $ = new pu(wf.getViewerContainer());

// Initialize WebXR VR Mode
const vrButton = document.getElementById('overlay-vr-button');
if (vrButton) {
    initXR({
        renderer: $.renderer,
        scene: $.scene,
        getCamera: () => $.getCamera(),
        vrButton: vrButton,
        viewer: $
    });
    attachXRSessionListeners($.renderer);
}
// ACESFilmicToneMapping(4): 水色などの彩度を保ちつつ白飛びを抑制
$.renderer.toneMapping = 4;
$.renderer.toneMappingExposure = 0.8;
// Shadow map setup (PCFSoftShadowMap=2)
$.renderer.shadowMap.enabled = true;
$.renderer.shadowMap.type = 2;
function applyShadowEnabled(enabled) {
    $.scene.traverse(function(obj) {
        if (obj.isDirectionalLight) obj.castShadow = enabled;
    });
    $.models.forEach(function(model) {
        model.traverse(function(obj) {
            if (obj.isMesh || obj.isSkinnedMesh) {
                obj.castShadow = enabled;
                obj.receiveShadow = enabled;
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                mats.forEach(function(m) { if (m) m.needsUpdate = true; });
            }
        });
    });
}
Q.setCamera($.getCamera()), $.setGravityVectorProvider({
    getGravityVector: () => Q.getPhysicsSensor().getGravityVector($.getCamera())
}), Q.setPhysicsSensorEnabled(Z.getState().settings.isPhysicsSensorEnabled), Q.setGravityMagnitude(Z.getState().settings.gravityMagnitude), Q.setPhysicsSensorImpulseSensitivity(Z.getState().settings.physicsSensorImpulseSensitivity), $.setGyroMode(Z.getState().settings.gyroMode), $.setGyroViewpointSensitivity(Z.getState().settings.gyroViewpointSensitivity), $.setGyroModelCenterSensitivity(Z.getState().settings.gyroModelCenterSensitivity), $.setGyroEnabled(Z.getState().isGyroEnabled), $.setTrackingEnabled(Z.getState().settings.isTrackingEnabled), gf.setEnabled(Z.getState().settings.isScreenAwakeEnabled), $.setCameraVmdStateProvider({
    hasActiveCameraMotion: () => Z.getState().activeCameraMotionFileName !== null
}), $.setFrameUpdater(Q), Q.setDebugModeEnabled(Z.getState().settings.isDebugModeEnabled), Z.subscribe(e => {
    wf.render(e), $.applySettings(e.settings), Q.setDebugModeEnabled(e.settings.isDebugModeEnabled), $.setGravityArrowVisible(e.settings.isDebugModeEnabled && e.settings.isGravityVectorVisible), $.setRotationCenterMarkerVisible(e.settings.isRotationCenterMarkerVisible && e.loadedModel !== null && e.settings.isTrackingEnabled && e.trackingBoneName !== null), applyShadowEnabled(e.settings.isShadowEnabled === true);
    try {
        localStorage.setItem('webmmd-settings', JSON.stringify(e.settings));
    } catch(err) {
        console.warn('[settings] save failed', err);
    }
});
wf.render(Z.getState());
Ul(e => {
    Z.setState({
        isFullscreen: e
    })
}), Nf(), Rf();
async function Tf() {
    try {
        if (Hl()) {
            await Vl();
            return
        } await Bl(wf.getViewerContainer())
    } catch (e) {
        console.warn(`[fullscreen] toggle failed`, e)
    }
} async function Ef(e) {
    let t = ++ xf;
    Sf += 1, Cf += 1, Pf(`openFiles`), console.debug(`[main] openFiles: start`, {
        fileCount: e.length, loadGeneration: t
    }), If(`openFiles:start`, [`isLoading`, `isMotionLoading`, `isCameraMotionLoading`, `errorMessage`, `pendingModelLoadName`, `pendingMotionLoadNames`, `pendingCameraMotionLoadNames`]), Z.setState({
        isLoading: !0, isMotionLoading: !1, isCameraMotionLoading: !1, errorMessage: null, modelLoadError: null, pendingModelLoadName: e.length > 0 ? e[0].name: null, pendingMotionLoadNames: [], pendingCameraMotionLoadNames: []
    });
    try {
        let n = await zu(e);
        if (t !== xf) {
            console.debug(`[main] openFiles: ignored stale result`, {
                loadGeneration: t, currentGeneration: xf
            }), n.dispose();
            return
        }
        
        const currentModels = Z.getState().models.map(m => ({ ...m, isActive: false }));
        
        loadedModels.push(n);
        $.addModel(n.model);
        Q.addModel(n.model);
        Wf();
        Gf();
        applyShadowEnabled(Z.getState().settings.isShadowEnabled === true);
        Z.getState().settings.isDebugModeEnabled && $.dumpMaterialDetails();
        
        let {
            materialVisibilityOverrides: r, suspiciousMaterials: i
        } = Vf(), a = gu(n.model), o = Hf(a);
        $.setTrackingBone(o), xd(n.cachedBlobs).catch (e => {
            console.warn(`[main] saveCurrentModel: failed`, e)
        }), Rf();
        
        const newModelId = n.model.uuid;
        const newModelObj = {
            id: newModelId,
            fileName: n.fileName,
            isActive: true,
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 }
        };
        const nextModels = [...currentModels, newModelObj];
        n.loadedMotions = [];
        
        Z.setState({
            isLoading: !1, isPlaying: !1, hasMotion: !1, modelLoadError: null, pendingModelLoadName: null, loadedMotions: [], loadedCameraMotions: [], suspiciousMaterials: i, materialVisibilityOverrides: r, activeCameraMotionFileName: null, trackingBoneName: o, settings: {
...Z.getState().settings, trackingBoneName: o
            }, loadedModel: {
                fileName: n.fileName, object: n.model, availableBoneNames: a
            },
            models: nextModels
        });
        if (window.webmmdUI && typeof window.webmmdUI.setSelectedAssets === "function") {
            window.webmmdUI.setSelectedAssets(n.fileName, []);
        }
    } catch (e) {
        if (t !== xf) {
            console.debug(`[main] openFiles: ignored stale error`, {
                loadGeneration: t, currentGeneration: xf
            });
            return
        } console.error(`[main] openFiles: error`, e), If(`openFiles:error`, [`isLoading`, `isPlaying`, `hasMotion`, `loadedModel`, `loadedMotions`, `loadedCameraMotions`, `modelLoadError`, `pendingModelLoadName`]), Z.setState({
            isLoading: !1, isPlaying: !1, hasMotion: !1, modelLoadError: Kf(e), pendingModelLoadName: null, loadedModel: null, loadedMotions: [], loadedCameraMotions: [], suspiciousMaterials: [], materialVisibilityOverrides: {
            }, activeCameraMotionFileName: null, trackingBoneName: null
        })
    }
} async function Df(e) {
    let t = ++ Sf;
    Pf(`openMotionFiles`), console.debug(`[main] openMotionFiles: start`, {
        count: e.length, fileNames: e.map(e => e.name), loadGeneration: t
    });
    let n = Q.getCurrentMesh();
    if (console.debug(`[main] openMotionFiles: entry`, {
        loadGeneration: t, motionLoadGenerationNow: Sf, activeMotionsCount: vf.length, currentLoadedMotionsLength: Z.getState().loadedMotions.length, meshFromController: n, isMeshNull: n === null
    }), n === null) {
        console.warn(`[main] openMotionFiles: no model mesh is available`), Z.setState({
            motionLoadError: df, pendingMotionLoadNames: []
        });
        return
    } let r = new Set(vf.map(e => e.fileName)), i = e.filter(e => r.has(e.name) ? (console.warn(`[main] openMotionFiles: duplicate skipped`, {
        fileName: e.name
    }), !1): (r.add(e.name), !0));
    if (i.length === 0) {
        console.warn(`[main] openMotionFiles: all files are duplicates, skipping`);
        return
    } console.debug(`[main] openMotionFiles: files to load`, {
        loadGeneration: t, filesToLoadLength: i.length, fileNames: i.map(e => e.name)
    }), If(`openMotionFiles:start`, [`isMotionLoading`, `motionLoadError`, `pendingMotionLoadNames`]), Z.setState({
        isMotionLoading: !0, motionLoadError: null, pendingMotionLoadNames: i.map(e => e.name)
    });
    let a = [];
    try {
        let e = await ed(i, n);
        if (console.debug(`[main] openMotionFiles: loadVmdsFromFiles complete`, {
            loadGeneration: t, resultsLength: e.length, fileNames: e.map(e => e.fileName), clipNames: e.map(e => e.clip.name), motionLoadGenerationNow: Sf, isStale: t !== Sf
        }), t !== Sf) {
            console.debug(`[main] openMotionFiles: ignored stale result`, {
                loadGeneration: t, currentGeneration: Sf
            }), n.dispose();
            return
        } a = e, console.debug(`[main] openMotionFiles: addMotions before`, {
            loadGeneration: t, clipCount: e.length, clipNames: e.map(e => e.clip.name)
        });
        let r = await Q.addMotions(e.map(e => e.clip));
        if (console.debug(`[main] openMotionFiles: addMotions result`, {
            loadGeneration: t, isRegistered: r, resultsLength: e.length
        }), !r) throw Error(ff);
        vf = [...vf, ...e], a = [], Q.setLooping(Z.getState().isLooping);
        for (let t of e) console.debug(`[main] openMotionFiles: setMotionActive`, {
            fileName: t.fileName, clipName: t.clip.name
        }), Q.setMotionActive(t.clip, !0);
        Q.setPlaying(false);
        
        const activeModelId = $.currentModel?.uuid;
        const targetModel = loadedModels.find(m => m.model.uuid === activeModelId);
        if (targetModel) {
            targetModel.loadedMotions = targetModel.loadedMotions || [];
            targetModel.loadedMotions.push(...e.map(m => ({ fileName: m.fileName, isActive: true })));
            
            Z.setState({
                isMotionLoading: !1,
                hasMotion: !0,
                loadedMotions: targetModel.loadedMotions,
                motionLoadError: null,
                pendingMotionLoadNames: [],
                isPlaying: false
            });
            if (window.webmmdUI && typeof window.webmmdUI.setSelectedAssets === "function") {
                const activeMotions = (targetModel.loadedMotions || []).filter(mo => mo.isActive).map(mo => mo.fileName);
                window.webmmdUI.setSelectedAssets(targetModel.fileName, activeMotions);
            }
        }
        (async() => {
            try {
                await zf(), await Lf(), Rf()
            } catch (e) {
                console.warn(`[main] saveCurrentModelVmds: failed`, e)
            }
        })(), console.debug(`[main] openMotionFiles: complete`, {
            loadGeneration: t, count: e.length, fileNames: e.map(e => e.fileName)
        })
    } catch (e) {
        if (t !== Sf) {
            console.debug(`[main] openMotionFiles: ignored stale error`, {
                loadGeneration: t, currentGeneration: Sf
            });
            return
        } console.error(`[main] openMotionFiles: error`, e);
        for (let e of a) e.dispose();
        If(`openMotionFiles:error`, [`isMotionLoading`, `motionLoadError`, `pendingMotionLoadNames`]), Z.setState({
            isMotionLoading: !1, motionLoadError: Kf(e), pendingMotionLoadNames: []
        })
    }
} async function Of(e) {
    let t = ++ Cf;
    Pf(`openCameraMotionFiles`), console.debug(`[main] openCameraMotionFiles: start`, {
        count: e.length, fileNames: e.map(e => e.name), loadGeneration: t
    });
    let n = new Set(yf.map(e => e.fileName)), r = e.filter(e => n.has(e.name) ? (console.warn(`[main] openCameraMotionFiles: duplicate skipped`, {
        fileName: e.name
    }), !1): (n.add(e.name), !0));
    if (r.length === 0) {
        console.warn(`[main] openCameraMotionFiles: all files are duplicates, skipping`);
        return
    } If(`openCameraMotionFiles:start`, [`isCameraMotionLoading`, `cameraMotionLoadError`, `pendingCameraMotionLoadNames`]), Z.setState({
        isCameraMotionLoading: !0, cameraMotionLoadError: null, pendingCameraMotionLoadNames: r.map(e => e.name)
    });
    let i = [];
    try {
        let e = await id(r);
        if (t !== Cf) {
            console.debug(`[main] openCameraMotionFiles: ignored stale result`, {
                loadGeneration: t, currentGeneration: Cf
            });
            for (let t of e) t.dispose();
            return
        } if (i = e, !Q.addCameraMotions(e.map(e => e.clip))) throw Error(`Camera VMD could not be registered.`);
        yf = [...yf, ...e], i = [], Q.setLooping(Z.getState().isLooping);
        let n = Z.getState().activeCameraMotionFileName, a = yf.find(e => e.fileName === n);
        Q.setActiveCameraMotion(a ?.clip ?? null), If(`openCameraMotionFiles:success`, [`isCameraMotionLoading`, `cameraMotionLoadError`, `loadedCameraMotions`, `pendingCameraMotionLoadNames`]), Z.setState({
            isCameraMotionLoading: !1, cameraMotionLoadError: null, pendingCameraMotionLoadNames: [], loadedCameraMotions: yf.map(e => ({
                fileName: e.fileName
            }))
        }), (async() => {
            try {
                await Bf(), await Lf(), Rf()
            } catch (e) {
                console.warn(`[main] saveCurrentCameraVmds: failed`, e)
            }
        })(), console.debug(`[main] openCameraMotionFiles: complete`, {
            loadGeneration: t, count: e.length, fileNames: e.map(e => e.fileName)
        })
    } catch (e) {
        if (t !== Cf) {
            console.debug(`[main] openCameraMotionFiles: ignored stale error`, {
                loadGeneration: t, currentGeneration: Cf
            });
            return
        } console.error(`[main] openCameraMotionFiles: error`, e);
        for (let e of i) e.dispose();
        If(`openCameraMotionFiles:error`, [`isCameraMotionLoading`, `cameraMotionLoadError`, `pendingCameraMotionLoadNames`]), Z.setState({
            isCameraMotionLoading: !1, cameraMotionLoadError: Kf(e), pendingCameraMotionLoadNames: []
        })
    }
} async function kf(e) {
    let t = vf.find(t => t.fileName === e);
    if (t === void 0) {
        console.warn(`[main] removeMotion: motion was not found`, {
            fileName: e
        });
        return
    } let n = Z.getState(), r = new Map(n.loadedMotions.map(e => [e.fileName, e.isActive]));
    await Q.removeMotion(t.clip), t.dispose(), vf = vf.filter(e => e !== t);
    let i = vf.map(e => ({
        fileName: e.fileName, isActive: r.get(e.fileName) ?? !0
    })), a = i.some(e => e.isActive), o = n.activeCameraMotionFileName !== null, s = n.isPlaying && (a || o);
    Q.setPlaying(s), Z.setState({
        loadedMotions: i, hasMotion: i.length > 0, isPlaying: s
    });
    const activeModelId = $.currentModel?.uuid;
    const targetModel = loadedModels.find(m => m.model.uuid === activeModelId);
    if (targetModel) {
        targetModel.loadedMotions = i;
    }
    await zf(), await Lf(), console.debug(`[main] removeMotion`, {
        fileName: e, remainingCount: vf.length
    })
} async function Af(e) {
    let t = yf.find(t => t.fileName === e);
    if (t === void 0) {
        console.warn(`[main] removeCameraMotion: motion was not found`, {
            fileName: e
        });
        return
    } let n = Z.getState();
    Q.removeCameraMotion(t.clip), t.dispose(), yf = yf.filter(e => e !== t);
    let r = n.activeCameraMotionFileName === e ? null: n.activeCameraMotionFileName, i = yf.find(e => e.fileName === r);
    Q.setActiveCameraMotion(i ?.clip ?? null);
    let a = n.loadedMotions.some(e => e.isActive), o = n.isPlaying && (a || r !== null);
    Q.setPlaying(o), Z.setState({
        loadedCameraMotions: yf.map(e => ({
            fileName: e.fileName
        })), activeCameraMotionFileName: r, isPlaying: o
    }), await Bf(), await Lf(), console.debug(`[main] removeCameraMotion`, {
        fileName: e, remainingCount: yf.length
    })
} function jf(e, t) {
    let n = Z.getState(), r = n.loadedMotions.map(n => n.fileName === e ? {
...n, isActive: t
    }: n), a = r.filter(e => e.isActive).length, s = vf.find(t => t.fileName === e);
    if (console.debug(`[main] setMotionActive`, {
        fileName: e, isActive: t, activeCount: a
    }), s === void 0) {
        console.warn(`[main] setMotionActive: motion was not found`, {
            fileName: e
        });
        return;
    } Q.setMotionActive(s.clip, t);
    Z.setState({
        loadedMotions: r, isPlaying: false
    });
    const activeModelId = $.currentModel?.uuid;
    const targetModel = loadedModels.find(m => m.model.uuid === activeModelId);
    if (targetModel) {
        targetModel.loadedMotions = r;
    }
    Q.setPlaying(false);
    Lf();
} function Mf(e) {
    let t = Z.getState(), n = e === null ? null: yf.find(t => t.fileName === e);
    if (e !== null && n === void 0) {
        console.warn(`[main] setActiveCameraMotion: motion was not found`, {
            fileName: e
        });
        return
    } Q.setActiveCameraMotion(n ?.clip ?? null);
    Q.setPlaying(false);
    Z.setState({
        activeCameraMotionFileName: e, isPlaying: false
    });
    Lf();
    console.debug(`[main] setActiveCameraMotion`, {
        fileName: e
    });
}
async function loadSceneFromYaml(yamlStr) {
    const sceneData = jsyaml.load(yamlStr);
    if (!sceneData || !sceneData.models) {
        throw new Error("Invalid scene YAML structure");
    }
    
    for (const m of loadedModels) {
        $.removeModel(m.model);
        Q.removeModel(m.model);
        m.dispose();
    }
    loadedModels = [];
    vf = [];
    Z.setState({ models: [], loadedModel: null, loadedMotions: [], hasMotion: false });
    
    const availableModelFiles = window.webmmdUI.getIndexedModelFiles();
    const availableMotionFiles = window.webmmdUI.getIndexedMotionFiles();
    
    for (const modelDef of sceneData.models) {
        const foundModel = availableModelFiles.find(file => file.name.toLowerCase() === modelDef.fileName.toLowerCase());
        if (!foundModel) {
            console.warn(`Model not found in assets cache: ${modelDef.fileName}`);
            continue;
        }
        
        const modelFiles = [foundModel];
        if (!foundModel.name.toLowerCase().endsWith(".zip")) {
            const companionFiles = window.webmmdUI.getCachedAssetsFiles().filter(file => {
                const raw = file.webkitRelativePath || file.name;
                const path = raw.replace(/\\/g, "/");
                const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
                return ext !== ".pmx" && ext !== ".zip" && ext !== ".vmd" && path.toLowerCase() !== foundModel.name.toLowerCase();
            });
            modelFiles.push(...companionFiles);
        }
        
        const n = await zu(modelFiles);
        
        if (modelDef.position) {
            n.model.position.set(modelDef.position[0], modelDef.position[1], modelDef.position[2]);
        }
        
        loadedModels.push(n);
        $.addModel(n.model);
        Q.addModel(n.model);
        n.loadedMotions = [];
        
        if (modelDef.motions && modelDef.motions.length > 0) {
            const motionClips = [];
            const newVmds = [];
            for (const motionFileName of modelDef.motions) {
                const foundMotion = availableMotionFiles.find(file => file.name.toLowerCase() === motionFileName.toLowerCase());
                if (foundMotion) {
                    const loadedVmd = await ed([foundMotion], n.model);
                    if (loadedVmd && loadedVmd.length > 0) {
                        motionClips.push(loadedVmd[0].clip);
                        newVmds.push(loadedVmd[0]);
                    }
                }
            }
            if (motionClips.length > 0) {
                Q.currentMesh = n.model.isSkinnedMesh ? n.model : getSkinnedMesh(n.model);
                const added = await Q.addMotions(motionClips);
                if (added) {
                    vf.push(...newVmds);
                    n.loadedMotions = newVmds.map(v => ({ fileName: v.fileName, isActive: true }));
                    for (const v of newVmds) Q.setMotionActive(v.clip, true);
                }
            }
        }
    }
    
    const nextModels = loadedModels.map((m, idx) => ({
        id: m.model.uuid,
        fileName: m.fileName,
        isActive: idx === loadedModels.length - 1,
        position: { x: m.model.position.x, y: m.model.position.y, z: m.model.position.z },
        rotation: { x: m.model.rotation.x, y: m.model.rotation.y, z: m.model.rotation.z }
    }));
    
    if (sceneData.cameraMotion) {
        const foundCameraMotion = availableMotionFiles.find(file => file.name === sceneData.cameraMotion);
        if (foundCameraMotion) {
            const loadedCam = await id([foundCameraMotion]);
            if (loadedCam && loadedCam.length > 0) {
                Q.addCameraMotions(loadedCam.map(c => c.clip));
                yf.push(...loadedCam);
                Q.setActiveCameraMotion(loadedCam[0].clip);
                Z.setState({
                    loadedCameraMotions: yf.map(y => ({ fileName: y.fileName })),
                    activeCameraMotionFileName: sceneData.cameraMotion
                });
            }
        }
    }
    
    Z.setState({ models: nextModels });
    
    if (loadedModels.length > 0) {
        const lastLoaded = loadedModels[loadedModels.length - 1];
        $.currentModel = lastLoaded.model;
        Q.currentMesh = lastLoaded.model.isSkinnedMesh ? lastLoaded.model : getSkinnedMesh(lastLoaded.model);
        const boneNames = gu(lastLoaded.model);
        Z.setState({
            loadedModel: {
                fileName: lastLoaded.fileName,
                object: lastLoaded.model,
                availableBoneNames: boneNames
            },
            loadedMotions: lastLoaded.loadedMotions || [],
            hasMotion: (lastLoaded.loadedMotions || []).length > 0
        });
        if (window.webmmdUI && typeof window.webmmdUI.setSelectedAssets === "function") {
            const activeMotions = (lastLoaded.loadedMotions || []).filter(mo => mo.isActive).map(mo => mo.fileName);
            window.webmmdUI.setSelectedAssets(lastLoaded.fileName, activeMotions);
        }
    }
    
    Q.setPlaying(false);
    Z.setState({ isPlaying: false });
    
    alert("シーンを読み込みました。");
}
function getSkinnedMesh(group) {
    if (group.isSkinnedMesh) return group;
    let skinnedMesh = null;
    group.traverse(child => {
        if (child.isSkinnedMesh) skinnedMesh = child;
    });
    return skinnedMesh;
}
async function Nf() {
    let e = bf;
    if (!Z.getState().settings.isAutoRestoreEnabled) {
        console.debug(`[main] restoreSessionOnStartup: disabled`);
        Z.setState({
            isLoading: false,
            isMotionLoading: false,
            isCameraMotionLoading: false
        });
        try {
            await Td();
        } catch (err) {
            console.warn('[main] clearSessionCache on startup failed', err);
        }
        return
    } console.debug(`[main] restoreSessionOnStartup: start`, {
        restoreGeneration: e
    });
    try {
        let t = await bd();
        if (!Ff(e, `loadSession`)) return ;
        if (t === null || t.modelFiles.length === 0) {
            console.debug(`[main] restoreSessionOnStartup: no cached session`);
            return
        } If(`restoreSessionOnStartup:startLoading`, [`isLoading`, `isMotionLoading`, `isCameraMotionLoading`, `errorMessage`]), Z.setState({
            isLoading: !0, isMotionLoading: t.modelVmds.length > 0, isCameraMotionLoading: t.cameraVmds.length > 0, errorMessage: null
        });
        let n = await Bu(t.modelFiles);
        if (!Ff(e, `loadPmxFromCachedBlobs`)) {
            n.dispose();
            return
        } _f !== null && _f.dispose(), _f = n, $.setModel(n.model), Q.setModel(n.model), Wf(), Gf(), applyShadowEnabled(Z.getState().settings.isShadowEnabled === true), Z.getState().settings.isDebugModeEnabled && $.dumpMaterialDetails();
        let {
            materialVisibilityOverrides: r, suspiciousMaterials: i
        } = Vf(), a = gu(n.model), o = Hf(a);
        $.setTrackingBone(o);
        let s = Q.getCurrentMesh();
        if (s === null) throw Error(`Restored model does not contain a skinned mesh.`);
        let c = [], l = new Set(t.activeModelVmdFileNames);
        if (t.modelVmds.length > 0) {
            if (c = await td(t.modelVmds, s), !Ff(e, `loadVmdsFromBlobs`)) {
                for (let e of c) e.dispose();
                return
            } vf = c;
            let n = await Q.setMotions(c.map(e => e.clip));
            if (!Ff(e, `setMotions`)) return ;
            if (!n) throw Error(ff)
        } let u = [], d;
        if (t.cameraVmds.length > 0) {
            if (u = await ad(t.cameraVmds), !Ff(e, `loadCameraVmdsFromBlobs`)) {
                for (let e of u) e.dispose();
                return
            } if (yf = u, !Q.setCameraMotions(u.map(e => e.clip))) throw Error(`Camera VMD could not be registered.`);
            d = u.find(e => e.fileName === t.activeCameraMotionFileName)
        } Q.setLooping(t.isLooping), Q.setPlaying(!1);
        for (let e of c) Q.setMotionActive(e.clip, l.has(e.fileName));
        if (Q.setActiveCameraMotion(d ?.clip ?? null), !Ff(e, `beforeStoreSetState`)) return ;
        If(`restoreSessionOnStartup:success`, [`isLoading`, `isMotionLoading`, `isCameraMotionLoading`, `isPlaying`, `isLooping`, `hasMotion`, `loadedModel`, `loadedMotions`, `loadedCameraMotions`, `activeCameraMotionFileName`, `trackingBoneName`, `settings.trackingBoneName`]), Z.setState({
            isLoading: !1, isMotionLoading: !1, isCameraMotionLoading: !1, isPlaying: !1, isLooping: t.isLooping, hasMotion: c.length > 0, loadedModel: {
                fileName: n.fileName, object: n.model, availableBoneNames: a
            }, loadedMotions: c.map(e => ({
                fileName: e.fileName, isActive: t.activeModelVmdFileNames.includes(e.fileName)
            })), loadedCameraMotions: u.map(e => ({
                fileName: e.fileName
            })), suspiciousMaterials: i, materialVisibilityOverrides: r, activeCameraMotionFileName: u.some(e => e.fileName === t.activeCameraMotionFileName) ? t.activeCameraMotionFileName: null, trackingBoneName: o, settings: {
...Z.getState().settings, trackingBoneName: o
            }
        }), console.debug(`[main] restoreSessionOnStartup: complete`, {
            restoreGeneration: e, modelFileName: n.fileName, modelVmds: c.length, cameraVmds: u.length
        })
    } catch (t) {
        if (console.error(`[main] restoreSessionOnStartup: error`, t), !Ff(e, `catch`)) return ;
        Wf(), Gf(), _f !== null && (_f.dispose(), _f = null), $.clearModel(), Q.clearModel(), If(`restoreSessionOnStartup:error`, [`isLoading`, `isMotionLoading`, `isCameraMotionLoading`, `isPlaying`, `hasMotion`, `loadedModel`, `loadedMotions`, `loadedCameraMotions`]), Z.setState({
            isLoading: !1, isMotionLoading: !1, isCameraMotionLoading: !1, isPlaying: !1, hasMotion: !1, loadedModel: null, loadedMotions: [], loadedCameraMotions: [], suspiciousMaterials: [], materialVisibilityOverrides: {
            }, activeCameraMotionFileName: null, trackingBoneName: null
        })
    }
} function Pf(e) {
    bf += 1, console.debug(`[main] invalidatePendingSessionRestore`, {
        reason: e, sessionRestoreGeneration: bf
    })
} function Ff(e, t) {
    let n = e === bf;
    return n || console.debug(`[main] restoreSessionOnStartup: ignored stale restore`, {
        step: t, restoreGeneration: e, currentGeneration: bf
    }), n
} function If(e, t) {
    console.debug(`[main] store.setState`, {
        source: e, keys: t
    })
} async function Lf() {
    let e = Z.getState();
    try {
        await wd({
            modelFileNames: e.loadedMotions.filter(e => e.isActive).map(e => e.fileName), cameraFileName: e.activeCameraMotionFileName, isLooping: e.isLooping
        })
    } catch (e) {
        console.warn(`[main] persistActiveSelections: failed`, e)
    }
} async function Rf() {
    try {
        wf.setStorageUsageText(await Yl())
    } catch (e) {
        console.warn(`[main] refreshStorageUsage: failed`, e)
    }
} async function zf() {
    try {
        await Sd(vf.map(e => ({
            fileName: e.fileName, blob: e.sourceBlob
        })))
    } catch (e) {
        console.warn(`[main] persistModelMotions: failed`, e)
    }
} async function Bf() {
    try {
        await Cd(yf.map(e => ({
            fileName: e.fileName, blob: e.sourceBlob
        })))
    } catch (e) {
        console.warn(`[main] persistCameraMotions: failed`, e)
    }
} function Vf() {
    let e = $.collectSuspiciousMaterials(), t = {
    };
    for (let n of e) mf.some(e => e.test(n.name)) && (t[n.name] = !0);
    return $.applyMaterialOverrides(t), {
        suspiciousMaterials: e, materialVisibilityOverrides: t
    }
} function Hf(e) {
    let t = Z.getState().settings.trackingBoneName;
    return t !== null && e.includes(t) ? t: _u(e)
} async function Uf() {
    Pf(`clearSessionCache`), console.debug(`[main] clearSessionCache: start`);
    try {
        await Td();
        for (const m of loadedModels) {
            m.dispose();
        }
        loadedModels = [];
        Z.reset();
        Z.setState({ models: [], savedScenes: [] });
        Rf();
        console.debug(`[main] clearSessionCache: complete`)
    } catch (e) {
        console.error(`[main] clearSessionCache: error`, e), Z.setState({
            errorMessage: Kf(e)
        })
    }
} function Wf() {
    console.debug(`[main] clearActiveMotion`, {
        count: vf.length, fileNames: vf.map(e => e.fileName)
    });
    for (let e of vf) e.dispose();
    vf = [], Q.clearMotion()
} function Gf() {
    console.debug(`[main] clearActiveCameraMotion`, {
        count: yf.length, fileNames: yf.map(e => e.fileName)
    });
    for (let e of yf) e.dispose();
    yf = [], Q.clearCameraMotions()
} function Kf(e) {
    return e instanceof Error ? qf(e.message): pf
} function qf(e) {
    return / [぀ - ヿ一 - 鿿] / .test(e) ? e: e.includes(`Unknown model file extension`) ? `PMXファイル形式ではありません。`:/Unknown. * file extension/i.test(e) ? `対応していないファイル形式です。`:/THREE\.MMDLoader/i.test(e) ? `ファイルの解析に失敗しました。ファイル形式を確認してください。`: e.includes(`Corrupted zip`) ? `ZIP ファイルが破損しているか、対応していない形式です。`: e.includes(`End of data reached`) ? `ファイルの読み込みに失敗しました。ファイルが破損している可能性があります。`: e.includes(`offset is outside the bounds`) ? `ファイル形式が不正です。PMX/VMD 形式ファイルか確認してください。`: e.includes(`Failed to fetch`) || e.includes(`NetworkError`) ? `ファイルの取得に失敗しました。`: e.includes(`FileReader`) ? `ファイルの読み取り中にエラーが発生しました。`: e.includes(`not allowed`) || e.includes(`Permission denied`) ? `アクセスが許可されていません。`: `ファイルの読み込みに失敗しました: ${e}`
}
