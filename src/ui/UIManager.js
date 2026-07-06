import { extractZipEntries } from "../utils/zipLoader";
import yaml from "js-yaml";
import { saveDirectoryHandle, getDirectoryHandle, clearDirectoryHandle, resetAllData } from "../utils/db";

export class UIManager {
  engine = null;
  mmdManager = null;
  xrManager = null;
  directoryHandle = null;

  // DOM要素の保持
  fileInput = null;
  motionInput = null;
  loadedModelName = null;

  colorInput = null;
  backgroundModeSelect = null;
  shadowInput = null;
  gravityMagnitudeInput = null;
  gravityMagnitudeValue = null;
  pixelRatioSelect = null;
  shadowResolutionSelect = null;
  vrPassthroughInput = null;
  autoPlayOnMotionToggle = null;
  physicsDisableToggle = null;

  viewerLoading = null;
  statusText = null;
  fullscreenButton = null;
  overlayVrButton = null;

  assetsDirectoryInput = null;
  assetsPathDisplay = null;
  assetsModelList = null;
  assetsMotionList = null;
  deployedModelsList = null;

  playPauseButton = null;
  resetButton = null;


  addModelWindowButton = null;
  modelSelectModal = null;
  closeModelModal = null;
  modalModelList = null;

  motionSelectModal = null;
  closeMotionModal = null;
  modalMotionList = null;
  currentMotionTargetModelId = null;
  assetsFiles = [];

  overlayPlaybackButton = null;
  overlayResetButton = null;

  // シーン管理要素
  sceneSaveButton = null;
  sceneLoadButton = null;
  savedScenesList = null;
  sceneInput = null;

  // コンソール要素
  consoleClearButton = null;
  consoleCopyButton = null;
  consoleAutoscrollToggle = null;
  consoleLogContainer = null;

  constructor(engine, mmdManager, xrManager) {
    this.engine = engine;
    this.mmdManager = mmdManager;
    this.xrManager = xrManager;

    this.initElements();
    this.setupEvents();
    this.restoreDirectoryHandle();
    this.setupConsoleHook();
  }

  initElements() {
    this.fileInput = document.querySelector(".file-input");
    this.motionInput = document.querySelector(".motion-input");
    this.loadedModelName = document.querySelector(".loaded-model-name");

    this.colorInput = document.querySelector(".color-input");
    this.backgroundModeSelect = document.querySelector(".mode-select");
    this.shadowInput = document.querySelector(".shadow-toggle");
    
    this.gravityMagnitudeInput = document.querySelector(".gravity-magnitude-input");
    this.gravityMagnitudeValue = document.querySelector(".gravity-magnitude-value");
    this.breastPhysicsToggle = document.querySelector(".breast-physics-toggle");
    this.breastPhysicsStiffnessInput = document.querySelector(".breast-physics-stiffness-input");
    this.breastPhysicsStiffnessValue = document.querySelector(".breast-physics-stiffness-value");
    
    this.pixelRatioSelect = document.querySelector(".pixel-ratio-select");
    this.shadowResolutionSelect = document.querySelector(".shadow-resolution-select");
    this.vrPassthroughInput = document.querySelector(".vr-passthrough-toggle");
    this.autoPlayOnMotionToggle = document.querySelector(".auto-play-on-motion-toggle");
    if (this.autoPlayOnMotionToggle) {
      this.autoPlayOnMotionToggle.checked = localStorage.getItem("auto-play-on-motion") === "true";
    }

    this.resourceMonitorToggle = document.querySelector(".resource-monitor-toggle");
    this.resourceMonitorOverlay = document.getElementById("resource-monitor-overlay");
    this.monitorFps = document.getElementById("monitor-fps");
    this.monitorMem = document.getElementById("monitor-mem");
    this.monitorMemContainer = document.getElementById("monitor-mem-container");
    this.monitorDraw = document.getElementById("monitor-draw");
    this.monitorUpdate = document.getElementById("monitor-update");
    if (this.resourceMonitorToggle) {
      const isEnabled = localStorage.getItem("resource-monitor-enabled") === "true";
      this.resourceMonitorToggle.checked = isEnabled;
      if (isEnabled) {
        this.resourceMonitorOverlay?.removeAttribute("hidden");
        // UIManagerのコンストラクタ実行時点では engine がまだ完全に動いていない場合があるので、少し待つか
        // 直接 start を呼び出す
        this.startResourceMonitor();
      } else {
        this.resourceMonitorOverlay?.setAttribute("hidden", "");
      }
    }

    this.physicsDisableToggle = document.querySelector(".physics-disable-toggle");
    if (this.physicsDisableToggle) {
      const isDisable = localStorage.getItem("physics-disable-globally") === "true";
      this.physicsDisableToggle.checked = isDisable;
      this.mmdManager.setPhysicsDisableGlobally(isDisable);
    }

    this.fpsLimitToggle = document.querySelector(".fps-limit-toggle");
    this.fpsLimitInput = document.querySelector(".fps-limit-input");
    if (this.fpsLimitToggle && this.fpsLimitInput) {
      const isEnabled = localStorage.getItem("fps-limit-enabled") === "true";
      const savedVal = localStorage.getItem("fps-limit-value") || "60";
      
      this.fpsLimitToggle.checked = isEnabled;
      this.fpsLimitInput.value = savedVal;
      
      this.fpsLimitInput.disabled = !isEnabled;

      if (this.engine) {
        this.engine.setFpsLimit(isEnabled ? parseInt(savedVal, 10) : null);
      }
    }

    this.viewerLoading = document.querySelector(".viewer-loading");
    this.statusText = document.querySelector(".status");
    this.fullscreenButton = document.querySelector(".fullscreen-toggle");
    this.overlayVrButton = document.getElementById("overlay-vr-button");

    this.assetsDirectoryInput = document.getElementById("assets-directory-input");
    this.assetsPathDisplay = document.getElementById("assets-path-display");
    this.assetsModelList = document.getElementById("assets-model-list");
    this.assetsMotionList = document.getElementById("assets-motion-list");
    this.deployedModelsList = document.getElementById("deployed-models-list");
    
    this.playPauseButton = document.querySelector(".play-pause-button");
    this.resetButton = document.querySelector(".reset-button");

    this.addModelWindowButton = document.getElementById("add-model-window-button");
    this.modelSelectModal = document.getElementById("model-select-modal");
    this.closeModelModal = document.getElementById("close-model-modal");
    this.modalModelList = document.getElementById("modal-model-list");

    this.motionSelectModal = document.getElementById("motion-select-modal");
    this.closeMotionModal = document.getElementById("close-motion-modal");
    this.modalMotionList = document.getElementById("modal-motion-list");

    // VROverlayの再生・停止ボタンも紐付け
    this.overlayPlaybackButton = document.querySelector(".overlay-playback-toggle");
    this.overlayResetButton = document.querySelector(".overlay-reset-button");

    // 初期UI状態設定
    if (this.colorInput) this.colorInput.value = "#0b1118";
    if (this.gravityMagnitudeInput) this.gravityMagnitudeInput.value = "9.8";
    if (this.breastPhysicsToggle) this.breastPhysicsToggle.checked = true;
    if (this.breastPhysicsStiffnessInput) this.breastPhysicsStiffnessInput.value = "1.0";

    // シーン管理DOMの初期化
    this.sceneSaveButton = document.getElementById("scene-save-button");
    this.sceneLoadButton = document.getElementById("scene-load-button");
    this.savedScenesList = document.getElementById("saved-scenes-list");
    this.sceneInput = document.querySelector(".scene-input");

    // コンソールDOMの初期化
    this.consoleClearButton = document.getElementById("console-clear-button");
    this.consoleCopyButton = document.getElementById("console-copy-button");
    this.consoleAutoscrollToggle = document.getElementById("console-autoscroll-toggle");
    this.consoleLogContainer = document.getElementById("console-log-container");

    this.updateDeployedModelsList();
    this.updateSavedScenesList();
  }

  setupEvents() {
    // モーダルの開閉イベント登録
    this.addModelWindowButton?.addEventListener("click", () => {
      this.modelSelectModal?.removeAttribute("hidden");
    });
    this.closeModelModal?.addEventListener("click", () => {
      this.modelSelectModal?.setAttribute("hidden", "");
    });
    this.modelSelectModal?.addEventListener("click", (e) => {
      if (e.target === this.modelSelectModal) {
        this.modelSelectModal?.setAttribute("hidden", "");
      }
    });

    this.closeMotionModal?.addEventListener("click", () => {
      this.motionSelectModal?.setAttribute("hidden", "");
    });
    this.motionSelectModal?.addEventListener("click", (e) => {
      if (e.target === this.motionSelectModal) {
        this.motionSelectModal?.setAttribute("hidden", "");
      }
    });

    // アセットフォルダ設定ボタンのクリック
    const assetsOpenButton = document.getElementById("assets-open-button");
    if (assetsOpenButton) {
      assetsOpenButton.addEventListener("click", async () => {
        if (window.showDirectoryPicker) {
          if (this.directoryHandle) {
            const currentPermission = await this.directoryHandle.queryPermission({ mode: "read" });
            if (currentPermission !== "granted") {
              const opt = { mode: "read" };
              const permission = await this.directoryHandle.requestPermission(opt);
              if (permission === "granted") {
                await this.loadDirectoryHandle(this.directoryHandle);
                return;
              }
            }
          }
          try {
            const handle = await window.showDirectoryPicker({ mode: "read" });
            this.directoryHandle = handle;
            await saveDirectoryHandle(handle);
            await this.loadDirectoryHandle(handle);
          } catch (err) {
            if (err.name !== "AbortError") {
              console.error(err);
              this.setStatusText(`アセットフォルダ選択エラー: ${err.message}`);
            }
          }
        } else {
          this.assetsDirectoryInput?.click();
        }
      });
    }

    // アセットフォルダ選択イベント
    this.assetsDirectoryInput?.addEventListener("change", async () => {
      if (this.assetsDirectoryInput.files && this.assetsDirectoryInput.files.length > 0) {
        await this.handleAssetsDirectorySelected(this.assetsDirectoryInput.files);
      }
    });

    // モデルファイル選択
    this.fileInput?.addEventListener("change", async () => {
      if (this.fileInput.files && this.fileInput.files.length > 0) {
        await this.handleModelLoad(this.fileInput.files);
      }
    });

    // モーションファイル選択
    this.motionInput?.addEventListener("change", async () => {
      if (this.motionInput.files && this.motionInput.files.length > 0) {
        await this.handleMotionLoad(this.motionInput.files);
      }
    });

    // リソースモニタトグルイベント
    this.resourceMonitorToggle?.addEventListener("change", () => {
      const isChecked = this.resourceMonitorToggle.checked;
      localStorage.setItem("resource-monitor-enabled", isChecked ? "true" : "false");
      if (isChecked) {
        this.resourceMonitorOverlay?.removeAttribute("hidden");
        this.startResourceMonitor();
      } else {
        this.resourceMonitorOverlay?.setAttribute("hidden", "");
        this.stopResourceMonitor();
      }
    });

    // 物理演算完全無効化トグルイベント
    this.physicsDisableToggle?.addEventListener("change", () => {
      const isChecked = this.physicsDisableToggle.checked;
      localStorage.setItem("physics-disable-globally", isChecked ? "true" : "false");
      this.mmdManager.setPhysicsDisableGlobally(isChecked);
      this.setStatusText(`物理演算を${isChecked ? "完全に無効化" : "有効化"}しました。`);
    });

    // FPS制限トグルイベント
    this.fpsLimitToggle?.addEventListener("change", () => {
      const isChecked = this.fpsLimitToggle.checked;
      localStorage.setItem("fps-limit-enabled", isChecked ? "true" : "false");
      if (this.fpsLimitInput) {
        this.fpsLimitInput.disabled = !isChecked;
      }
      
      if (this.engine) {
        const val = this.fpsLimitInput ? parseInt(this.fpsLimitInput.value, 10) : 60;
        this.engine.setFpsLimit(isChecked ? val : null);
      }
    });

    // FPS制限入力値変更イベント
    this.fpsLimitInput?.addEventListener("input", () => {
      let val = parseInt(this.fpsLimitInput.value, 10);
      if (isNaN(val)) return;

      // 入力中の暫定的な値でも反映するが、範囲内にする
      let targetVal = val;
      if (targetVal < 1) targetVal = 1;
      if (targetVal > 240) targetVal = 240;

      localStorage.setItem("fps-limit-value", targetVal.toString());

      if (this.engine && this.fpsLimitToggle && this.fpsLimitToggle.checked) {
        this.engine.setFpsLimit(targetVal);
      }
    });

    this.fpsLimitInput?.addEventListener("blur", () => {
      let val = parseInt(this.fpsLimitInput.value, 10);
      if (isNaN(val) || val < 1) {
        val = 60;
      } else if (val > 240) {
        val = 240;
      }
      this.fpsLimitInput.value = val;
      localStorage.setItem("fps-limit-value", val.toString());

      if (this.engine && this.fpsLimitToggle && this.fpsLimitToggle.checked) {
        this.engine.setFpsLimit(val);
      }
    });



    // 再生・一時停止
    const togglePlay = () => {
      this.mmdManager.unlockAudios();
      if (this.mmdManager.isPlaying) {
        this.mmdManager.pause();
        this.setPlayButtonText("再生");
      } else {
        this.mmdManager.play();
        this.setPlayButtonText("一時停止");
      }
    };
    this.playPauseButton?.addEventListener("click", togglePlay);
    this.overlayPlaybackButton?.addEventListener("click", togglePlay);

    // アプリ全体の最初のインタラクションでオーディオのロック解除を試みる
    const unlockAllOnFirstInteraction = () => {
      this.mmdManager.unlockAudios();
      document.removeEventListener("click", unlockAllOnFirstInteraction);
      document.removeEventListener("touchstart", unlockAllOnFirstInteraction);
    };
    document.addEventListener("click", unlockAllOnFirstInteraction);
    document.addEventListener("touchstart", unlockAllOnFirstInteraction);

    // リセット
    const reset = () => {
      this.mmdManager.reset();
    };
    this.resetButton?.addEventListener("click", reset);
    this.overlayResetButton?.addEventListener("click", reset);



    // 背景色
    this.colorInput?.addEventListener("input", () => {
      this.engine.setBackgroundColor(this.colorInput.value);
    });

    // 背景モード
    this.backgroundModeSelect?.addEventListener("change", () => {
      this.engine.setBackgroundMode(this.backgroundModeSelect.value);
    });

    // 影
    this.shadowInput?.addEventListener("change", () => {
      this.engine.setShadowEnabled(this.shadowInput.checked);
    });

    // 重力
    this.gravityMagnitudeInput?.addEventListener("input", () => {
      const magnitude = parseFloat(this.gravityMagnitudeInput.value);
      this.gravityMagnitudeValue.textContent = magnitude.toFixed(1);
      this.engine.setGravity(magnitude);
    });

    // 胸の物理演算トグル
    this.breastPhysicsToggle?.addEventListener("change", () => {
      const enabled = this.breastPhysicsToggle.checked;
      const stiffness = parseFloat(this.breastPhysicsStiffnessInput.value);
      this.mmdManager.updateBreastPhysicsSettings(enabled, stiffness);
    });

    // 胸の揺れ強度
    this.breastPhysicsStiffnessInput?.addEventListener("input", () => {
      const stiffness = parseFloat(this.breastPhysicsStiffnessInput.value);
      if (this.breastPhysicsStiffnessValue) {
        this.breastPhysicsStiffnessValue.textContent = stiffness.toFixed(1);
      }
      const enabled = this.breastPhysicsToggle ? this.breastPhysicsToggle.checked : true;
      this.mmdManager.updateBreastPhysicsSettings(enabled, stiffness);
    });

    // 画質上限
    this.pixelRatioSelect?.addEventListener("change", () => {
      this.engine.setPixelRatio(parseFloat(this.pixelRatioSelect.value));
    });

    // シャドウ解像度
    this.shadowResolutionSelect?.addEventListener("change", () => {
      this.engine.setShadowResolution(parseInt(this.shadowResolutionSelect.value));
    });

    // パススルー
    this.vrPassthroughInput?.addEventListener("change", () => {
      this.xrManager.setPassthroughEnabled(this.vrPassthroughInput.checked);
    });

    // モーション自動再生
    this.autoPlayOnMotionToggle?.addEventListener("change", () => {
      localStorage.setItem("auto-play-on-motion", this.autoPlayOnMotionToggle.checked);
    });

    // フルスクリーン切り替え
    this.fullscreenButton?.addEventListener("click", () => {
      const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.body.classList.contains("pseudo-fullscreen"));

      if (!isFullscreen) {
        const docElm = document.documentElement;
        if (docElm.requestFullscreen) {
          docElm.requestFullscreen().catch((err) => {
            console.warn(`Fullscreen error: ${err.message}`);
            this.enterPseudoFullscreen();
          });
        } else if (docElm.webkitRequestFullscreen) {
          docElm.webkitRequestFullscreen();
        } else {
          this.enterPseudoFullscreen();
        }
      } else {
        if (document.body.classList.contains("pseudo-fullscreen")) {
          this.exitPseudoFullscreen();
        } else if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      }
    });

    const onFullscreenChange = () => {
      const isNativeFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
      if (isNativeFullscreen) {
        this.fullscreenButton?.classList.add("is-active");
      } else {
        if (!document.body.classList.contains("pseudo-fullscreen")) {
          this.fullscreenButton?.classList.remove("is-active");
        }
      }
      window.dispatchEvent(new Event("resize"));
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && document.body.classList.contains("pseudo-fullscreen")) {
        this.exitPseudoFullscreen();
      }
    });




    // パネルの折りたたみ制御
    const panelHeaders = document.querySelectorAll(".panel-header");
    let panelStates = {};
    try {
      const saved = localStorage.getItem("webmmd-panel-states");
      if (saved) {
        panelStates = JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Failed to load panel states:", e);
    }

    panelHeaders.forEach(header => {
      const panel = header.closest(".panel");
      if (panel) {
        const sectionId = panel.getAttribute("data-section-id");
        if (sectionId && panelStates[sectionId] !== undefined) {
          if (panelStates[sectionId]) {
            panel.classList.add("collapsed");
          } else {
            panel.classList.remove("collapsed");
          }
        }

        header.addEventListener("click", () => {
          panel.classList.toggle("collapsed");
          const currentSectionId = panel.getAttribute("data-section-id");
          if (currentSectionId) {
            try {
              const saved = localStorage.getItem("webmmd-panel-states");
              const states = saved ? JSON.parse(saved) : {};
              states[currentSectionId] = panel.classList.contains("collapsed");
              localStorage.setItem("webmmd-panel-states", JSON.stringify(states));
            } catch (e) {
              console.warn("Failed to save panel states:", e);
            }
          }
        });
      }
    });

    // ユーザーデータ完全リセットボタン
    const resetUserDataBtn = document.querySelector(".reset-user-data-button");
    resetUserDataBtn?.addEventListener("click", async () => {
      if (confirm("すべてのユーザーデータをリセットしますか？\n\n・アセットフォルダの設定\n・保存済みシーン\n・アプリキャッシュ\n\n⚠️ この操作は元に戻せません。初回訪問時の状態に戻ります。")) {
        this.showLoading(true, "ユーザーデータをリセット中...");
        try {
          // IndexedDB を完全削除
          await resetAllData();
          // localStorage を消去
          localStorage.clear();
          // Service Worker を登録解除
          if ("serviceWorker" in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
              await registration.unregister();
            }
          }
          // キャッシュを消去
          if ("caches" in window) {
            const keys = await caches.keys();
            for (const key of keys) {
              await caches.delete(key);
            }
          }
          window.location.reload(true);
        } catch (err) {
          console.error("Failed to reset user data:", err);
          this.setStatusText("リセットに失敗しました。");
          this.showLoading(false);
        }
      }
    });

    // シーン保存イベント
    this.sceneSaveButton?.addEventListener("click", () => {
      const sceneName = prompt("シーン名を入力してください", `シーン_${new Date().toLocaleString()}`);
      if (!sceneName) return;

      try {
        const yamlStr = this.serializeCurrentScene();
        const savedScenesJson = localStorage.getItem("webmmd-saved-scenes");
        let savedScenes = [];
        if (savedScenesJson) {
          try {
            savedScenes = JSON.parse(savedScenesJson);
          } catch(e) {
            savedScenes = [];
          }
        }
        const existingIdx = savedScenes.findIndex(s => s.name === sceneName);
        if (existingIdx !== -1) {
          savedScenes[existingIdx].data = yamlStr;
          savedScenes[existingIdx].date = Date.now();
        } else {
          savedScenes.push({
            name: sceneName,
            data: yamlStr,
            date: Date.now()
          });
        }
        localStorage.setItem("webmmd-saved-scenes", JSON.stringify(savedScenes));
        this.updateSavedScenesList();
        this.setStatusText(`シーン「${sceneName}」を保存しました。`);
      } catch (e) {
        console.error(e);
        this.setStatusText(`シーンの保存に失敗しました: ${e.message}`);
      }
    });

    // シーン読み込みボタン（ファイル選択ダイアログを開く）
    this.sceneLoadButton?.addEventListener("click", () => {
      this.sceneInput?.click();
    });

    // シーンファイル選択時
    this.sceneInput?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const yamlStr = evt.target.result;
          const sceneData = yaml.load(yamlStr);
          await this.applySceneData(sceneData);

          // 読み込んだシーンをlocalStorageに保存する
          const sceneName = file.name.replace(/\.[^/.]+$/, ""); // 拡張子を除いたファイル名
          try {
            const savedScenesJson = localStorage.getItem("webmmd-saved-scenes");
            let savedScenes = [];
            if (savedScenesJson) {
              try { savedScenes = JSON.parse(savedScenesJson); } catch(e) { savedScenes = []; }
            }
            const existingIdx = savedScenes.findIndex(s => s.name === sceneName);
            if (existingIdx !== -1) {
              savedScenes[existingIdx].data = yamlStr;
              savedScenes[existingIdx].date = Date.now();
            } else {
              savedScenes.push({ name: sceneName, data: yamlStr, date: Date.now() });
            }
            localStorage.setItem("webmmd-saved-scenes", JSON.stringify(savedScenes));
            this.updateSavedScenesList();
          } catch (saveErr) {
            console.warn("シーンの自動保存に失敗しました:", saveErr);
          }

          this.setStatusText(`シーンファイル「${file.name}」から復元しました。`);
        } catch (err) {
          console.error(err);
          this.setStatusText(`シーンのパース/復元に失敗しました: ${err.message}`);
        }
      };
      reader.readAsText(file);
      this.sceneInput.value = "";
    });

  }

  showZipModelSelect(pmxNames) {
    return new Promise((resolve) => {
      const modal = document.getElementById("zip-model-select-modal");
      const listContainer = document.getElementById("modal-zip-model-list");
      const closeBtn = document.getElementById("close-zip-model-modal");
      
      listContainer.innerHTML = "";
      
      pmxNames.forEach(name => {
        const item = document.createElement("div");
        item.className = "model-item";
        
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "action-button";
        btn.style.width = "100%";
        btn.style.textAlign = "left";
        btn.textContent = name;
        
        btn.addEventListener("click", () => {
          modal.setAttribute("hidden", "");
          resolve(name);
        });
        
        item.appendChild(btn);
        listContainer.appendChild(item);
      });
      
      const handleClose = () => {
        modal.setAttribute("hidden", "");
        resolve(null);
      };
      
      if (closeBtn) closeBtn.onclick = handleClose;
      if (modal) {
        modal.onclick = (e) => {
          if (e.target === modal) {
            handleClose();
          }
        };
      }
      
      modal?.removeAttribute("hidden");
    });
  }

  async handleModelLoad(files) {
    this.showLoading(true, "ファイルを展開・準備中...");
    this.setStatusText("アセットを解析中...");
    
    try {
      let pmxName = null;
      const fileList = Array.from(files);
      const zipFile = fileList.find(f => f.name.toLowerCase().endsWith(".zip"));

      if (zipFile) {
        this.setStatusText("ZIPアーカイブを解凍中...");
        const entries = await extractZipEntries(zipFile);
        this.mmdManager.addFiles(entries);
        const pmxEntries = entries.filter(e => e.name.toLowerCase().endsWith(".pmx"));
        if (pmxEntries.length === 0) throw new Error("ZIPの中に .pmx ファイルが見つかりません");
        
        if (pmxEntries.length > 1) {
          this.showLoading(false);
          const selectedName = await this.showZipModelSelect(pmxEntries.map(e => e.name));
          if (!selectedName) {
            this.setStatusText("モデルの選択がキャンセルされました。");
            return;
          }
          pmxName = selectedName;
          this.showLoading(true, "モデルデータを読み込み中...");
        } else {
          pmxName = pmxEntries[0].name;
        }
      } else {
        this.mmdManager.addFiles(fileList);
        const pmxFile = fileList.find(f => f.name.toLowerCase().endsWith(".pmx"));
        if (!pmxFile) throw new Error("選択されたファイルの中に .pmx ファイルが見つかりません");
        pmxName = pmxFile.webkitRelativePath || pmxFile.name;
      }

      this.setStatusText("モデルデータを読み込み中...");
      await this.mmdManager.loadModel(pmxName, zipFile ? zipFile.name : null);

      // モデル名の表示と操作パネル有効化
      if (this.loadedModelName) {
        this.loadedModelName.textContent = pmxName;
        this.loadedModelName.hidden = false;
      }
      if (this.motionInput) this.motionInput.disabled = false;
      if (this.resetButton) this.resetButton.disabled = false;
      if (this.overlayResetButton) this.overlayResetButton.disabled = false;

      this.updateDeployedModelsList();

      this.setStatusText("モデルのロードが完了しました。モーションを選択してください。");
    } catch (e) {
      this.setStatusText(`エラー: ${e.message}`);
      console.error(e);
    } finally {
      this.showLoading(false);
    }
  }

  async handleMotionLoad(files) {
    this.showLoading(true, "モーションを適用中...");
    try {
      const fileList = Array.from(files);
      this.mmdManager.addFiles(fileList);

      for (const file of fileList) {
        if (file.name.toLowerCase().endsWith(".vmd")) {
          const motionPath = file.webkitRelativePath || file.name;
          this.setStatusText(`モーション ${file.name} を読み込み中...`);
          await this.mmdManager.loadMotion(motionPath);
        }
      }

      if (this.playPauseButton) this.playPauseButton.disabled = false;
      if (this.overlayPlaybackButton) this.overlayPlaybackButton.disabled = false;
      
      this.setStatusText("モーションの適用が完了しました。再生ボタンを押してください。");

      if (this.autoPlayOnMotionToggle && this.autoPlayOnMotionToggle.checked) {
        if (!this.mmdManager.isPlaying) {
          this.mmdManager.play();
          this.setPlayButtonText("一時停止");
        }
      }
    } catch (e) {
      this.setStatusText(`エラー: ${e.message}`);
      console.error(e);
    } finally {
      this.showLoading(false);
    }
  }

  async handleMotionLoadForModel(file, modelId) {
    this.showLoading(true, "モーションを適用中...");
    try {
      this.mmdManager.addFiles([file]);
      const motionPath = file.webkitRelativePath || file.name;
      this.setStatusText(`モーション ${file.name} を読み込み中...`);
      await this.mmdManager.loadMotion(motionPath, modelId);

      if (this.playPauseButton) this.playPauseButton.disabled = false;
      if (this.overlayPlaybackButton) this.overlayPlaybackButton.disabled = false;
      if (this.resetButton) this.resetButton.disabled = false;
      if (this.overlayResetButton) this.overlayResetButton.disabled = false;

      this.updateDeployedModelsList();
      this.setStatusText("モーションの適用が完了しました。再生ボタンを押してください。");

      if (this.autoPlayOnMotionToggle && this.autoPlayOnMotionToggle.checked) {
        if (!this.mmdManager.isPlaying) {
          this.mmdManager.play();
          this.setPlayButtonText("一時停止");
        }
      }
    } catch (e) {
      this.setStatusText(`エラー: ${e.message}`);
      console.error(e);
    } finally {
      this.showLoading(false);
    }
  }



  showLoading(show, text = "読み込み中...") {
    if (this.viewerLoading) {
      this.viewerLoading.hidden = !show;
      const spinnerText = this.viewerLoading.querySelector(".viewer-loading__text");
      if (spinnerText) spinnerText.textContent = text;
    }
  }

  setStatusText(text) {
    if (this.statusText) {
      this.statusText.textContent = text;
    }
  }

  setPlayButtonText(text) {
    if (this.playPauseButton) this.playPauseButton.textContent = text;
  }

  async handleAssetsDirectorySelected(files) {
    this.showLoading(true, "アセットフォルダを解析中...");
    try {
      const fileList = Array.from(files);
      this.assetsFiles = fileList;
      // MmdManagerにすべてのファイルを登録
      this.mmdManager.addFiles(fileList);

      // フォルダ名（ルート名）の表示
      if (fileList.length > 0 && fileList[0].webkitRelativePath) {
        const rootDir = fileList[0].webkitRelativePath.split("/")[0];
        if (this.assetsPathDisplay) {
          this.assetsPathDisplay.textContent = `現在のアセットパス：${rootDir}`;
          this.assetsPathDisplay.classList.remove("motion-empty");
        }
      }

      // アセットモデルリスト、モーションリストの更新（カメラモーションは無効化）
      this.updateAssetsModelList(fileList);
      this.updateAssetsMotionList(fileList);
      // this.updateCameraMotionList(fileList);

      this.setStatusText(`アセットフォルダが設定されました。ファイル数: ${fileList.length}`);
    } catch (e) {
      this.setStatusText(`アセット解析エラー: ${e.message}`);
      console.error(e);
    } finally {
      this.showLoading(false);
    }
  }

  updateAssetsModelList(files) {
    if (!this.modalModelList) return;
    this.modalModelList.innerHTML = "";

    const pmxOrZipFiles = files.filter(file => {
      const name = file.name.toLowerCase();
      return name.endsWith(".pmx") || name.endsWith(".zip");
    });

    if (pmxOrZipFiles.length === 0) {
      this.modalModelList.innerHTML = `<p class="motion-empty">モデルファイル (.pmx / .zip) が見つかりません。</p>`;
      return;
    }

    pmxOrZipFiles.forEach(file => {
      const item = document.createElement("div");
      item.className = "model-entry";
      item.style.display = "flex";
      item.style.justifyContent = "space-between";
      item.style.alignItems = "center";
      item.style.padding = "4px 0";

      const span = document.createElement("span");
      span.textContent = file.name;
      span.style.overflow = "hidden";
      span.style.textOverflow = "ellipsis";
      span.style.whiteSpace = "nowrap";
      span.style.fontSize = "12px";
      span.style.flex = "1";
      span.style.marginRight = "8px";

      const addBtn = document.createElement("button");
      addBtn.textContent = "追加";
      addBtn.className = "action-button";
      addBtn.style.width = "auto";
      addBtn.style.minHeight = "24px";
      addBtn.style.padding = "2px 8px";
      addBtn.style.fontSize = "11px";
      addBtn.addEventListener("click", async () => {
        this.modelSelectModal?.setAttribute("hidden", "");
        await this.handleModelLoad([file]);
      });

      item.appendChild(span);
      item.appendChild(addBtn);
      this.modalModelList.appendChild(item);
    });
  }

  updateAssetsMotionList(files) {
    if (!this.modalMotionList) return;
    this.modalMotionList.innerHTML = "";

    const vmdFiles = files.filter(file => {
      const name = file.name.toLowerCase();
      return name.endsWith(".vmd");
    });

    if (vmdFiles.length === 0) {
      this.modalMotionList.innerHTML = `<p class="motion-empty">モーションファイル (.vmd) が見つかりません。</p>`;
      return;
    }

    vmdFiles.forEach(file => {
      const item = document.createElement("div");
      item.className = "motion-entry";
      item.style.display = "flex";
      item.style.justifyContent = "space-between";
      item.style.alignItems = "center";
      item.style.padding = "4px 0";

      const span = document.createElement("span");
      span.textContent = file.name;
      span.style.overflow = "hidden";
      span.style.textOverflow = "ellipsis";
      span.style.whiteSpace = "nowrap";
      span.style.fontSize = "12px";
      span.style.flex = "1";
      span.style.marginRight = "8px";

      const motionPath = file.webkitRelativePath || file.name;
      const cleanMotionPath = motionPath.replace(/\\/g, "/").toLowerCase();
      let isApplied = false;
      let matchedKey = motionPath;

      if (this.currentMotionTargetModelId) {
        const model = this.mmdManager.deployedModels.get(this.currentMotionTargetModelId);
        if (model) {
          for (const key of model.motions.keys()) {
            if (key.replace(/\\/g, "/").toLowerCase() === cleanMotionPath) {
              isApplied = true;
              matchedKey = key;
              break;
            }
          }
        }
      }

      const applyBtn = document.createElement("button");
      applyBtn.textContent = isApplied ? "解除" : "適用";
      applyBtn.className = "action-button";
      applyBtn.style.width = "auto";
      applyBtn.style.minHeight = "24px";
      applyBtn.style.padding = "2px 8px";
      applyBtn.style.fontSize = "11px";
      if (isApplied) {
        applyBtn.style.background = "#8e3c3c";
        applyBtn.style.borderColor = "#a64949";
      }

      applyBtn.addEventListener("click", async () => {
        this.motionSelectModal?.setAttribute("hidden", "");
        if (this.currentMotionTargetModelId) {
          if (isApplied) {
            const model = this.mmdManager.deployedModels.get(this.currentMotionTargetModelId);
            if (model) {
              if (model.audio) {
                model.audio.pause();
                model.audio = null;
              }
              this.mmdManager.removeMotion(matchedKey, this.currentMotionTargetModelId);
            }
            this.updateDeployedModelsList();
            this.setStatusText("モーションを解除しました。");
          } else {
            await this.handleMotionLoadForModel(file, this.currentMotionTargetModelId);
          }
        }
      });

      item.appendChild(span);
      item.appendChild(applyBtn);
      this.modalMotionList.appendChild(item);
    });
  }

  updateDeployedModelsList() {
    if (!this.deployedModelsList) return;

    // 現在開いている詳細メニューのIDとスクロール位置、高さを退避する
    const openMotionModels = new Set();
    const openMorphModels = new Set();
    const motionScrollTops = new Map();
    const morphScrollTops = new Map();
    const motionHeights = new Map();
    const morphHeights = new Map();

    const containers = this.deployedModelsList.querySelectorAll(".deployed-model-container");
    containers.forEach(container => {
      const mId = container.dataset.modelId;
      if (mId) {
        const detailsElements = container.querySelectorAll("details");
        detailsElements.forEach(details => {
          if (details.open) {
            const summaryText = details.querySelector("summary")?.textContent;
            if (summaryText === "モーション設定") {
              openMotionModels.add(mId);
              const scrollEl = details.querySelector(".motion-list-container");
              if (scrollEl) {
                motionScrollTops.set(mId, scrollEl.scrollTop);
                if (scrollEl.style.height) {
                  motionHeights.set(mId, scrollEl.style.height);
                }
              }
            } else if (summaryText === "モーフ設定") {
              openMorphModels.add(mId);
              const scrollEl = details.querySelector(".morph-list-container");
              if (scrollEl) {
                morphScrollTops.set(mId, scrollEl.scrollTop);
                if (scrollEl.style.height) {
                  morphHeights.set(mId, scrollEl.style.height);
                }
              }
            }
          }
        });
      }
    });

    this.deployedModelsList.innerHTML = "";

    if (!this.mmdManager || this.mmdManager.deployedModels.size === 0) {
      this.deployedModelsList.innerHTML = `<p class="motion-empty">配置済みのモデルはありません。</p>`;
      return;
    }

    const models = Array.from(this.mmdManager.deployedModels.values());

    models.forEach(model => {
      const isAct = this.mmdManager.activeModelId === model.id;

      // 親コンテナ
      const itemContainer = document.createElement("div");
      itemContainer.className = "deployed-model-container";
      itemContainer.dataset.modelId = model.id;
      itemContainer.style.background = "#242a31";
      itemContainer.style.borderRadius = "6px";
      itemContainer.style.border = isAct ? "1px solid #7aa2d8" : "1px solid #44505d";
      itemContainer.style.marginBottom = "8px";
      itemContainer.style.padding = "8px";

      // ヘッダー（タイトル、アクティブ選択、削除ボタン）
      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.justifyContent = "space-between";
      header.style.alignItems = "center";

      const leftSide = document.createElement("div");
      leftSide.style.display = "flex";
      leftSide.style.alignItems = "center";
      leftSide.style.gap = "6px";
      leftSide.style.flex = "1";
      leftSide.style.minWidth = "0";

      // アクティブ選択ラジオ
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "active-deployed-model";
      radio.checked = isAct;
      radio.addEventListener("change", () => {
        if (radio.checked) {
          this.mmdManager.activeModelId = model.id;
          this.updateDeployedModelsList();
          this.syncMotionSelection();
        }
      });
      leftSide.appendChild(radio);

      // モデル名
      const span = document.createElement("span");
      span.textContent = model.name;
      span.style.overflow = "hidden";
      span.style.textOverflow = "ellipsis";
      span.style.whiteSpace = "nowrap";
      span.style.fontSize = "12px";
      span.style.fontWeight = isAct ? "bold" : "normal";
      span.style.color = isAct ? "#8fc7ff" : "#eef3f8";
      leftSide.appendChild(span);

      // 削除ボタン
      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "削除";
      deleteBtn.className = "action-button";
      deleteBtn.style.width = "auto";
      deleteBtn.style.minHeight = "24px";
      deleteBtn.style.padding = "2px 8px";
      deleteBtn.style.fontSize = "11px";
      deleteBtn.style.background = "#8e3c3c";
      deleteBtn.style.borderColor = "#a64949";
      deleteBtn.style.marginLeft = "8px";
      deleteBtn.addEventListener("click", () => {
        this.mmdManager.removeModel(model.id);
        this.updateDeployedModelsList();
        this.syncMotionSelection();
        this.setStatusText(`モデル「${model.name}」を削除しました。`);
      });

      header.appendChild(leftSide);
      header.appendChild(deleteBtn);
      itemContainer.appendChild(header);

      // 設定項目セクション
      const settingsSection = document.createElement("div");
      settingsSection.className = "deployed-model-settings";
      settingsSection.style.marginTop = "8px";
      settingsSection.style.paddingTop = "8px";
      settingsSection.style.borderTop = "1px solid #3a4450";
      settingsSection.style.display = "flex";
      settingsSection.style.flexDirection = "column";
      settingsSection.style.gap = "8px";

      // 1. ポジション (X, Y, Z)
      const posLabel = document.createElement("div");
      posLabel.textContent = "ポジション (X, Y, Z)";
      posLabel.style.fontSize = "11px";
      posLabel.style.color = "#8fa3b8";
      settingsSection.appendChild(posLabel);

      const posRow = document.createElement("div");
      posRow.style.display = "flex";
      posRow.style.gap = "4px";

      const createNumInput = (val, callback) => {
        const input = document.createElement("input");
        input.type = "number";
        input.step = "0.5";
        input.value = val.toFixed(1);
        input.style.width = "100%";
        input.style.fontSize = "11px";
        input.style.padding = "2px 4px";
        input.style.background = "#1a1f26";
        input.style.color = "#fff";
        input.style.border = "1px solid #44505d";
        input.style.borderRadius = "4px";
        input.addEventListener("input", () => {
          callback(parseFloat(input.value) || 0);
        });
        return input;
      };

      const posX = createNumInput(model.mesh.position.x, (val) => {
        this.mmdManager.setModelPosition(model.id, val, model.mesh.position.y, model.mesh.position.z);
      });
      const posY = createNumInput(model.mesh.position.y, (val) => {
        this.mmdManager.setModelPosition(model.id, model.mesh.position.x, val, model.mesh.position.z);
      });
      const posZ = createNumInput(model.mesh.position.z, (val) => {
        this.mmdManager.setModelPosition(model.id, model.mesh.position.x, model.mesh.position.y, val);
      });
      
      posRow.appendChild(posX);
      posRow.appendChild(posY);
      posRow.appendChild(posZ);
      settingsSection.appendChild(posRow);

      // 2. 回転 (X, Y, Z)
      const rotLabel = document.createElement("div");
      rotLabel.textContent = "回転 (X, Y, Z) 角度";
      rotLabel.style.fontSize = "11px";
      rotLabel.style.color = "#8fa3b8";
      settingsSection.appendChild(rotLabel);

      const rotRow = document.createElement("div");
      rotRow.style.display = "flex";
      rotRow.style.gap = "4px";

      // 現在の回転角 (Degrees) を取得
      let rx = 0, ry = 0, rz = 0;
      if (model.mesh.rotationQuaternion) {
        const euler = model.mesh.rotationQuaternion.toEulerAngles();
        rx = (euler.x * 180) / Math.PI;
        ry = (euler.y * 180) / Math.PI;
        rz = (euler.z * 180) / Math.PI;
      } else {
        rx = (model.mesh.rotation.x * 180) / Math.PI;
        ry = (model.mesh.rotation.y * 180) / Math.PI;
        rz = (model.mesh.rotation.z * 180) / Math.PI;
      }

      const updateRot = () => {
        this.mmdManager.setModelRotation(
          model.id, 
          parseFloat(rotX.value) || 0, 
          parseFloat(rotY.value) || 0, 
          parseFloat(rotZ.value) || 0
        );
      };

      const rotX = createNumInput(rx, updateRot);
      const rotY = createNumInput(ry, updateRot);
      const rotZ = createNumInput(rz, updateRot);

      rotRow.appendChild(rotX);
      rotRow.appendChild(rotY);
      rotRow.appendChild(rotZ);
      settingsSection.appendChild(rotRow);

      // 2.5. モーション設定 (折りたたみ)
      const motionDetails = document.createElement("details");
      if (openMotionModels.has(model.id)) {
        motionDetails.open = true;
      }
      motionDetails.style.marginTop = "6px";
      motionDetails.style.border = "1px solid #44505d";
      motionDetails.style.borderRadius = "4px";
      motionDetails.style.background = "#1a1f26";
      motionDetails.style.padding = "4px 6px";

      const motionSummary = document.createElement("summary");
      motionSummary.textContent = "モーション設定";
      motionSummary.style.fontSize = "11px";
      motionSummary.style.color = "#8fa3b8";
      motionSummary.style.cursor = "pointer";
      motionSummary.style.outline = "none";
      motionDetails.appendChild(motionSummary);

      const motionContainer = document.createElement("div");
      motionContainer.style.marginTop = "6px";
      motionContainer.style.display = "flex";
      motionContainer.style.flexDirection = "column";
      motionContainer.style.gap = "6px";

      const activeMotionRow = document.createElement("div");
      activeMotionRow.style.display = "flex";
      activeMotionRow.style.alignItems = "center";
      activeMotionRow.style.justifyContent = "space-between";
      activeMotionRow.style.gap = "8px";

      const activeMotionNameSpan = document.createElement("span");
      const motionKeys = Array.from(model.motions.keys());
      if (motionKeys.length > 0) {
        const fullPath = motionKeys[motionKeys.length - 1];
        const lastSlash = fullPath.lastIndexOf("/");
        activeMotionNameSpan.textContent = "適用中: " + (lastSlash !== -1 ? fullPath.substring(lastSlash + 1) : fullPath);
        activeMotionNameSpan.style.color = "#8fd8ff";
      } else {
        activeMotionNameSpan.textContent = "適用中: なし";
        activeMotionNameSpan.style.color = "#87919d";
      }
      activeMotionNameSpan.style.fontSize = "11px";
      activeMotionNameSpan.style.overflow = "hidden";
      activeMotionNameSpan.style.textOverflow = "ellipsis";
      activeMotionNameSpan.style.whiteSpace = "nowrap";
      activeMotionNameSpan.style.flex = "1";

      activeMotionRow.appendChild(activeMotionNameSpan);
      motionContainer.appendChild(activeMotionRow);

      const motionFilterInput = document.createElement("input");
      motionFilterInput.type = "text";
      motionFilterInput.placeholder = "モーション名で絞り込み...";
      motionFilterInput.style.width = "100%";
      motionFilterInput.style.fontSize = "11px";
      motionFilterInput.style.padding = "2px 4px";
      motionFilterInput.style.background = "#242a31";
      motionFilterInput.style.color = "#fff";
      motionFilterInput.style.border = "1px solid #44505d";
      motionFilterInput.style.borderRadius = "4px";
      motionFilterInput.style.marginBottom = "4px";
      motionContainer.appendChild(motionFilterInput);

      const motionListContainer = document.createElement("div");
      motionListContainer.className = "motion-list-container";
      motionListContainer.style.height = "150px";
      motionListContainer.style.minHeight = "60px";
      motionListContainer.style.maxHeight = "500px";
      motionListContainer.style.overflowY = "auto";
      motionListContainer.style.display = "flex";
      motionListContainer.style.flexDirection = "column";
      motionListContainer.style.gap = "4px";

      const updateLocalMotionList = (filterText = "") => {
        motionListContainer.innerHTML = "";
        const lowerFilter = filterText.toLowerCase();
        const vmdFiles = (this.assetsFiles || []).filter(f => f.name.toLowerCase().endsWith(".vmd"));

        if (vmdFiles.length === 0) {
          const emptyP = document.createElement("p");
          emptyP.className = "motion-empty";
          emptyP.textContent = "モーションファイルが見つかりません。";
          emptyP.style.margin = "0";
          motionListContainer.appendChild(emptyP);
          return;
        }

        vmdFiles.forEach(file => {
          if (lowerFilter && !file.name.toLowerCase().includes(lowerFilter)) {
            return;
          }

          const row = document.createElement("div");
          row.style.display = "flex";
          row.style.alignItems = "center";
          row.style.justifyContent = "space-between";
          row.style.padding = "4px 0";

          const nameLabel = document.createElement("span");
          nameLabel.textContent = file.name;
          nameLabel.style.fontSize = "10px";
          nameLabel.style.color = "#c7d1dc";
          nameLabel.style.flex = "1";
          nameLabel.style.marginRight = "8px";
          nameLabel.style.overflow = "hidden";
          nameLabel.style.textOverflow = "ellipsis";
          nameLabel.style.whiteSpace = "nowrap";

          const motionPath = file.webkitRelativePath || file.name;
          const cleanMotionPath = motionPath.replace(/\\/g, "/").toLowerCase();
          let isApplied = false;
          let matchedKey = motionPath;

          for (const key of model.motions.keys()) {
            if (key.replace(/\\/g, "/").toLowerCase() === cleanMotionPath) {
              isApplied = true;
              matchedKey = key;
              break;
            }
          }

          const applyBtn = document.createElement("button");
          applyBtn.textContent = isApplied ? "解除" : "適用";
          applyBtn.className = "action-button";
          applyBtn.style.width = "auto";
          applyBtn.style.minHeight = "24px";
          applyBtn.style.padding = "2px 8px";
          applyBtn.style.fontSize = "11px";
          if (isApplied) {
            applyBtn.style.background = "#8e3c3c";
            applyBtn.style.borderColor = "#a64949";
          }

          applyBtn.addEventListener("click", async () => {
            if (isApplied) {
              if (model.audio) {
                model.audio.pause();
                model.audio = null;
              }
              this.mmdManager.removeMotion(matchedKey, model.id);
              this.updateDeployedModelsList();
              this.setStatusText("モーションを解除しました。");
            } else {
              await this.handleMotionLoadForModel(file, model.id);
            }
          });

          row.appendChild(nameLabel);
          row.appendChild(applyBtn);
          motionListContainer.appendChild(row);
        });
      };

      motionFilterInput.addEventListener("input", () => {
        updateLocalMotionList(motionFilterInput.value);
      });

      updateLocalMotionList();

      motionContainer.appendChild(motionListContainer);
      motionDetails.appendChild(motionContainer);
      settingsSection.appendChild(motionDetails);

      // 3. 影表示 (オン/オフ)
      const shadowField = document.createElement("label");
      shadowField.style.display = "flex";
      shadowField.style.alignItems = "center";
      shadowField.style.gap = "6px";
      shadowField.style.fontSize = "11px";
      shadowField.style.color = "#c7d1dc";
      shadowField.style.cursor = "pointer";

      const shadowToggle = document.createElement("input");
      shadowToggle.type = "checkbox";
      shadowToggle.checked = model.shadowEnabled ?? true;
      shadowToggle.addEventListener("change", () => {
        this.mmdManager.setModelShadowEnabled(model.id, shadowToggle.checked);
      });

      const shadowSpan = document.createElement("span");
      shadowSpan.textContent = "影を落とす";

      shadowField.appendChild(shadowToggle);
      shadowField.appendChild(shadowSpan);
      settingsSection.appendChild(shadowField);

      // 4. モーフ設定 (折りたたみ)
      const morphTargets = this.mmdManager.getMorphTargets(model.id);
      if (morphTargets.length > 0) {
        const morphDetails = document.createElement("details");
        if (openMorphModels.has(model.id)) {
          morphDetails.open = true;
        }
        morphDetails.style.marginTop = "6px";
        morphDetails.style.border = "1px solid #44505d";
        morphDetails.style.borderRadius = "4px";
        morphDetails.style.background = "#1a1f26";
        morphDetails.style.padding = "4px 6px";

        const morphSummary = document.createElement("summary");
        morphSummary.textContent = "モーフ設定";
        morphSummary.style.fontSize = "11px";
        morphSummary.style.color = "#8fa3b8";
        morphSummary.style.cursor = "pointer";
        morphSummary.style.outline = "none";
        morphDetails.appendChild(morphSummary);

        const morphContainer = document.createElement("div");
        morphContainer.style.marginTop = "6px";
        morphContainer.style.display = "flex";
        morphContainer.style.flexDirection = "column";
        morphContainer.style.gap = "6px";

        // モーフ名検索フィルター
        const filterInput = document.createElement("input");
        filterInput.type = "text";
        filterInput.placeholder = "モーフ名で絞り込み...";
        filterInput.style.width = "100%";
        filterInput.style.fontSize = "11px";
        filterInput.style.padding = "2px 4px";
        filterInput.style.background = "#242a31";
        filterInput.style.color = "#fff";
        filterInput.style.border = "1px solid #44505d";
        filterInput.style.borderRadius = "4px";
        filterInput.style.marginBottom = "4px";
        morphContainer.appendChild(filterInput);

        const listContainer = document.createElement("div");
        listContainer.className = "morph-list-container";
        listContainer.style.height = "150px";
        listContainer.style.minHeight = "60px";
        listContainer.style.maxHeight = "500px";
        listContainer.style.overflowY = "auto";
        listContainer.style.display = "flex";
        listContainer.style.flexDirection = "column";
        listContainer.style.gap = "4px";

        const updateMorphList = (filterText = "") => {
          listContainer.innerHTML = "";
          const lowerFilter = filterText.toLowerCase();

          morphTargets.forEach(morph => {
            if (lowerFilter && !morph.name.toLowerCase().includes(lowerFilter)) {
              return;
            }

            const row = document.createElement("div");
            row.style.display = "flex";
            row.style.alignItems = "center";
            row.style.justifyContent = "space-between";
            row.style.gap = "8px";

            const nameLabel = document.createElement("span");
            nameLabel.textContent = morph.name;
            nameLabel.style.fontSize = "10px";
            nameLabel.style.color = "#c7d1dc";
            nameLabel.style.flex = "1";
            nameLabel.style.overflow = "hidden";
            nameLabel.style.textOverflow = "ellipsis";
            nameLabel.style.whiteSpace = "nowrap";

            const slider = document.createElement("input");
            slider.type = "range";
            slider.min = "0.0";
            slider.max = "1.0";
            slider.step = "0.01";
            slider.value = morph.value;
            slider.style.width = "80px";

            const valDisplay = document.createElement("span");
            valDisplay.textContent = parseFloat(morph.value).toFixed(2);
            valDisplay.style.fontSize = "10px";
            valDisplay.style.color = "#8fd8ff";
            valDisplay.style.minWidth = "24px";
            valDisplay.style.textAlign = "right";

            slider.addEventListener("input", () => {
              const val = parseFloat(slider.value) || 0;
              this.mmdManager.setMorphValue(model.id, morph.name, val);
              valDisplay.textContent = val.toFixed(2);
              morph.value = val; // 状態を保持
            });

            row.appendChild(nameLabel);
            row.appendChild(slider);
            row.appendChild(valDisplay);
            listContainer.appendChild(row);
          });
        };

        filterInput.addEventListener("input", () => {
          updateMorphList(filterInput.value);
        });

        updateMorphList();
        morphContainer.appendChild(listContainer);
        morphDetails.appendChild(morphContainer);
        settingsSection.appendChild(morphDetails);
      }


      itemContainer.appendChild(settingsSection);
      this.deployedModelsList.appendChild(itemContainer);

      // 高さとスクロール位置の復元
      if (openMotionModels.has(model.id)) {
        const scrollEl = itemContainer.querySelector(".motion-list-container");
        if (scrollEl) {
          const height = motionHeights.get(model.id);
          if (height !== undefined) {
            scrollEl.style.height = height;
          }
          const scrollTop = motionScrollTops.get(model.id);
          if (scrollTop !== undefined) {
            scrollEl.scrollTop = scrollTop;
          }
        }
      }
      if (openMorphModels.has(model.id)) {
        const scrollEl = itemContainer.querySelector(".morph-list-container");
        if (scrollEl) {
          const height = morphHeights.get(model.id);
          if (height !== undefined) {
            scrollEl.style.height = height;
          }
          const scrollTop = morphScrollTops.get(model.id);
          if (scrollTop !== undefined) {
            scrollEl.scrollTop = scrollTop;
          }
        }
      }
    });
  }



  async restoreSession() {
    // 古いキャッシュがこのメソッドを呼び出す可能性があるため、スタブとして残し、
    // 単にローディング表示を消す処理のみを行います。
    this.showLoading(false);
  }

  syncMotionSelection() {
    // assets-motion elements have been removed. This is a stub method.
  }

  serializeCurrentScene() {
    const models = [];
    for (const model of this.mmdManager.deployedModels.values()) {
      let rx = 0, ry = 0, rz = 0;
      if (model.mesh.rotationQuaternion) {
        const euler = model.mesh.rotationQuaternion.toEulerAngles();
        rx = (euler.x * 180) / Math.PI;
        ry = (euler.y * 180) / Math.PI;
        rz = (euler.z * 180) / Math.PI;
      } else {
        rx = (model.mesh.rotation.x * 180) / Math.PI;
        ry = (model.mesh.rotation.y * 180) / Math.PI;
        rz = (model.mesh.rotation.z * 180) / Math.PI;
      }

      const morphs = {};
      const targets = this.mmdManager.getMorphTargets(model.id);
      for (const target of targets) {
        if (target.value > 0) {
          morphs[target.name] = target.value;
        }
      }

      models.push({
        name: model.name,
        zipName: model.zipName || null,
        position: [model.mesh.position.x, model.mesh.position.y, model.mesh.position.z],
        rotation: [rx, ry, rz],
        shadowEnabled: model.shadowEnabled ?? true,
        motions: Array.from(model.motions.keys()),
        morphs: morphs
      });
    }

    const sceneData = {
      version: "1.0",
      models: models,
      cameraMotion: this.mmdManager.activeCameraMotion ? this.mmdManager.activeCameraMotion.name : null,
      settings: {
        backgroundColor: this.colorInput ? this.colorInput.value : "#0b1118",
        backgroundMode: this.backgroundModeSelect ? this.backgroundModeSelect.value : "grid",
        shadowEnabled: this.shadowInput ? this.shadowInput.checked : true,
        gravity: this.gravityMagnitudeInput ? parseFloat(this.gravityMagnitudeInput.value) : 9.8,
        breastPhysicsEnabled: this.breastPhysicsToggle ? this.breastPhysicsToggle.checked : true,
        breastPhysicsStiffness: this.breastPhysicsStiffnessInput ? parseFloat(this.breastPhysicsStiffnessInput.value) : 1.0
      }
    };

    return yaml.dump(sceneData);
  }

  async applySceneData(sceneData) {
    if (!sceneData) return;

    this.showLoading(true, "シーンを復元中...");
    try {
      // 1. 設定の適用
      if (sceneData.settings) {
        const settings = sceneData.settings;
        if (settings.backgroundColor && this.colorInput) {
          this.colorInput.value = settings.backgroundColor;
          this.engine.setBackgroundColor(settings.backgroundColor);
        }
        if (settings.backgroundMode && this.backgroundModeSelect) {
          this.backgroundModeSelect.value = settings.backgroundMode;
          this.engine.setBackgroundMode(settings.backgroundMode);
        }
        if (settings.shadowEnabled !== undefined && this.shadowInput) {
          this.shadowInput.checked = settings.shadowEnabled;
          this.engine.setShadowEnabled(settings.shadowEnabled);
        }
        if (settings.gravity !== undefined && this.gravityMagnitudeInput) {
          this.gravityMagnitudeInput.value = settings.gravity;
          if (this.gravityMagnitudeValue) {
            this.gravityMagnitudeValue.textContent = parseFloat(settings.gravity).toFixed(1);
          }
          this.engine.setGravity(parseFloat(settings.gravity));
        }
        if (settings.breastPhysicsEnabled !== undefined && this.breastPhysicsToggle) {
          this.breastPhysicsToggle.checked = settings.breastPhysicsEnabled;
        }
        if (settings.breastPhysicsStiffness !== undefined && this.breastPhysicsStiffnessInput) {
          this.breastPhysicsStiffnessInput.value = settings.breastPhysicsStiffness;
          if (this.breastPhysicsStiffnessValue) {
            this.breastPhysicsStiffnessValue.textContent = parseFloat(settings.breastPhysicsStiffness).toFixed(1);
          }
        }
        const bEnabled = this.breastPhysicsToggle ? this.breastPhysicsToggle.checked : true;
        const bStiffness = this.breastPhysicsStiffnessInput ? parseFloat(this.breastPhysicsStiffnessInput.value) : 1.0;
        this.mmdManager.updateBreastPhysicsSettings(bEnabled, bStiffness);
      }

      // 2. 配置モデルのクリア
      this.mmdManager.clearDeployedModels();

      // 3. モデルとモーションのロード
      if (sceneData.models && Array.from(sceneData.models).length > 0) {
        for (const modelData of sceneData.models) {
          // ZIPファイルからのロードだった場合は事前に解凍
          if (modelData.zipName) {
            const zipNameLower = modelData.zipName.toLowerCase();
            let zipEntry = this.mmdManager.fileMap.get(zipNameLower);
            if (!zipEntry) {
              // フォルダパス付きキー（例: "assets/mikuv6.zip"）への末尾一致フォールバック
              for (const [key, entry] of this.mmdManager.fileMap.entries()) {
                if (key === zipNameLower || key.endsWith("/" + zipNameLower)) {
                  zipEntry = entry;
                  break;
                }
              }
            }
            if (!zipEntry) {
              throw new Error(`ZIPファイル「${modelData.zipName}」がアセットフォルダ内に見つかりません。`);
            }
            if (zipEntry.file) {
              this.setStatusText(`ZIP「${modelData.zipName}」を解凍中...`);
              const entries = await extractZipEntries(zipEntry.file);
              this.mmdManager.addFiles(entries);
            }
          }

          this.setStatusText(`モデル ${modelData.name} を復元中...`);
          // アセットフォルダにあるか確認
          const resolvedPath = this.mmdManager.resolvePath(modelData.name);
          if (!resolvedPath) {
            throw new Error(`モデルファイル「${modelData.name}」がアセットフォルダ内に見つかりません。`);
          }

          const { id } = await this.mmdManager.loadModel(modelData.name, modelData.zipName);

          // 位置と回転の適用
          if (modelData.position) {
            this.mmdManager.setModelPosition(id, modelData.position[0], modelData.position[1], modelData.position[2]);
          }
          if (modelData.rotation) {
            this.mmdManager.setModelRotation(id, modelData.rotation[0], modelData.rotation[1], modelData.rotation[2]);
          }
          if (modelData.shadowEnabled !== undefined) {
            this.mmdManager.setModelShadowEnabled(id, modelData.shadowEnabled);
          }

          // モーフの適用
          if (modelData.morphs) {
            for (const [morphName, val] of Object.entries(modelData.morphs)) {
              this.mmdManager.setMorphValue(id, morphName, val);
            }
          }

          // モーションの適用
          if (modelData.motions && modelData.motions.length > 0) {
            for (const motionName of modelData.motions) {
              const resolvedMotion = this.mmdManager.resolvePath(motionName);
              if (!resolvedMotion) {
                console.warn(`モーション「${motionName}」が見つからないためスキップします。`);
                continue;
              }
              this.setStatusText(`モデル ${modelData.name} にモーション ${motionName} を適用中...`);
              await this.mmdManager.loadMotion(motionName, id);
            }
          }
        }
      }

      // 4. カメラモーションの復元
      if (sceneData.cameraMotion) {
        const resolvedCamera = this.mmdManager.resolvePath(sceneData.cameraMotion);
        if (resolvedCamera) {
          this.setStatusText(`カメラモーション ${sceneData.cameraMotion} を適用中...`);
          await this.mmdManager.loadCameraMotion(sceneData.cameraMotion);
        } else {
          console.warn(`カメラモーション「${sceneData.cameraMotion}」が見つかりませんでした。`);
        }
      }

      // 5. リスト等の更新
      this.updateDeployedModelsList();

      // 再生ボタン、リセットボタンの有効化（モデルが復元された場合）
      if (this.mmdManager.deployedModels.size > 0) {
        if (this.resetButton) this.resetButton.disabled = false;
        if (this.overlayResetButton) this.overlayResetButton.disabled = false;
        let hasAnyMotion = false;
        for (const model of this.mmdManager.deployedModels.values()) {
          if (model.motions.size > 0) {
            hasAnyMotion = true;
            break;
          }
        }
        if (hasAnyMotion || this.mmdManager.activeCameraMotion) {
          if (this.playPauseButton) this.playPauseButton.disabled = false;
          if (this.overlayPlaybackButton) this.overlayPlaybackButton.disabled = false;
        }
      }

      this.setStatusText("シーンの復元が完了しました。");
    } catch (e) {
      console.error(e);
      this.setStatusText(`復元エラー: ${e.message}`);
    } finally {
      this.showLoading(false);
    }
  }

  updateSavedScenesList() {
    if (!this.savedScenesList) return;
    this.savedScenesList.innerHTML = "";

    const savedScenesJson = localStorage.getItem("webmmd-saved-scenes");
    let savedScenes = [];
    if (savedScenesJson) {
      try {
        savedScenes = JSON.parse(savedScenesJson);
      } catch(e) {
        savedScenes = [];
      }
    }

    if (savedScenes.length === 0) {
      this.savedScenesList.innerHTML = `<p class="motion-empty" style="margin:0">保存されたシーンはありません。</p>`;
      return;
    }

    savedScenes.forEach((scene, index) => {
      const item = document.createElement("div");
      item.className = "scene-entry";
      item.style.display = "flex";
      item.style.justifyContent = "space-between";
      item.style.alignItems = "center";
      item.style.padding = "6px 0";


      const nameSpan = document.createElement("span");
      nameSpan.textContent = scene.name;
      nameSpan.style.overflow = "hidden";
      nameSpan.style.textOverflow = "ellipsis";
      nameSpan.style.whiteSpace = "nowrap";
      nameSpan.style.fontSize = "12px";
      nameSpan.style.flex = "1";
      nameSpan.style.marginRight = "8px";
      nameSpan.title = scene.name;

      const actionsWrap = document.createElement("div");
      actionsWrap.style.display = "flex";
      actionsWrap.style.gap = "4px";

      // 適用（ロード）ボタン
      const loadBtn = document.createElement("button");
      loadBtn.textContent = "適用";
      loadBtn.className = "action-button";
      loadBtn.style.width = "auto";
      loadBtn.style.minHeight = "24px";
      loadBtn.style.padding = "2px 8px";
      loadBtn.style.fontSize = "11px";
      loadBtn.addEventListener("click", async () => {
        try {
          const sceneData = yaml.load(scene.data);
          await this.applySceneData(sceneData);
        } catch(e) {
          console.error(e);
          this.setStatusText(`復元エラー: ${e.message}`);
        }
      });

      // エクスポートボタン（yamlとしてダウンロード）
      const exportBtn = document.createElement("button");
      exportBtn.textContent = "保存";
      exportBtn.title = "YAMLファイルとして書き出し";
      exportBtn.className = "action-button";
      exportBtn.style.width = "auto";
      exportBtn.style.minHeight = "24px";
      exportBtn.style.padding = "2px 8px";
      exportBtn.style.fontSize = "11px";
      exportBtn.addEventListener("click", () => {
        const blob = new Blob([scene.data], { type: "text/yaml;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${scene.name}.yml`;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      });

      // 削除ボタン
      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "削除";
      deleteBtn.className = "action-button";
      deleteBtn.style.width = "auto";
      deleteBtn.style.minHeight = "24px";
      deleteBtn.style.padding = "2px 8px";
      deleteBtn.style.fontSize = "11px";
      deleteBtn.style.background = "#8e3c3c";
      deleteBtn.style.borderColor = "#a64949";
      deleteBtn.addEventListener("click", () => {
        if (confirm(`シーン「${scene.name}」を削除しますか？`)) {
          savedScenes.splice(index, 1);
          localStorage.setItem("webmmd-saved-scenes", JSON.stringify(savedScenes));
          this.updateSavedScenesList();
          this.setStatusText(`シーン「${scene.name}」を削除しました。`);
        }
      });

      actionsWrap.appendChild(loadBtn);
      actionsWrap.appendChild(exportBtn);
      actionsWrap.appendChild(deleteBtn);
      item.appendChild(nameSpan);
      item.appendChild(actionsWrap);
      this.savedScenesList.appendChild(item);
    });
  }

  // 保存されたディレクトリハンドルの復元
  async restoreDirectoryHandle() {
    if (!window.showDirectoryPicker) return;
    try {
      const handle = await getDirectoryHandle();
      if (handle) {
        this.directoryHandle = handle;
        
        // パス名表示だけ仮復元 (パーミッション要求が必要なことを示す)
        if (this.assetsPathDisplay) {
          this.assetsPathDisplay.textContent = `現在のアセットパス：${handle.name} (再接続が必要)`;
          this.assetsPathDisplay.classList.remove("motion-empty");
          this.assetsPathDisplay.style.cursor = "pointer";
          this.assetsPathDisplay.title = "クリックしてアクセス許可を付与し、再読み込みします";
          
          // パス表示部分のクリックでも復元できるようにイベント登録
          const clickHandler = async () => {
            const permission = await handle.requestPermission({ mode: "read" });
            if (permission === "granted") {
              await this.loadDirectoryHandle(handle);
              this.assetsPathDisplay.removeEventListener("click", clickHandler);
              this.assetsPathDisplay.style.cursor = "";
              this.assetsPathDisplay.title = "";
            }
          };
          this.assetsPathDisplay.addEventListener("click", clickHandler);
        }

        // すでに権限がある場合は自動でロード（セッション内リロード等）
        const currentPermission = await handle.queryPermission({ mode: "read" });
        if (currentPermission === "granted") {
          await this.loadDirectoryHandle(handle);
        } else {
          this.setStatusText(`保存されているアセットフォルダ「${handle.name}」へのアクセス許可が必要です。アセットフォルダ設定ボタンまたはパス表示をクリックしてください。`);
        }
      }
    } catch (e) {
      console.error("Failed to restore directory handle:", e);
    }
  }

  // ディレクトリハンドルからファイルを列挙し、アセットフォルダとして設定
  async loadDirectoryHandle(handle) {
    this.showLoading(true, "アセットフォルダをスキャン中...");
    try {
      const files = [];
      const getFilesRecursively = async (dirHandle, path = "") => {
        for await (const entry of dirHandle.values()) {
          if (entry.kind === "file") {
            try {
              const file = await entry.getFile();
              const relativePath = path ? `${path}/${entry.name}` : entry.name;
              Object.defineProperty(file, "webkitRelativePath", {
                value: relativePath,
                writable: false,
                configurable: true
              });
              files.push(file);
            } catch (fileErr) {
              console.warn(`Failed to get file ${entry.name}:`, fileErr);
            }
          } else if (entry.kind === "directory") {
            const nextPath = path ? `${path}/${entry.name}` : entry.name;
            await getFilesRecursively(entry, nextPath);
          }
        }
      };

      await getFilesRecursively(handle);
      await this.handleAssetsDirectorySelected(files);
      
      // パス表示を「再接続が必要」から正常な表示に更新
      if (this.assetsPathDisplay) {
        this.assetsPathDisplay.textContent = `現在のアセットパス：${handle.name}`;
        this.assetsPathDisplay.classList.remove("motion-empty");
        this.assetsPathDisplay.style.cursor = "";
        this.assetsPathDisplay.title = "";
      }
    } catch (e) {
      console.error(e);
      this.setStatusText(`アセットフォルダの読み込みに失敗しました: ${e.message}`);
    } finally {
      this.showLoading(false);
    }
  }

  enterPseudoFullscreen() {
    document.body.classList.add("pseudo-fullscreen");
    this.fullscreenButton?.classList.add("is-active");
    window.dispatchEvent(new Event("resize"));
  }

  exitPseudoFullscreen() {
    document.body.classList.remove("pseudo-fullscreen");
    this.fullscreenButton?.classList.remove("is-active");
    window.dispatchEvent(new Event("resize"));
  }

  setupConsoleHook() {
    if (!this.consoleLogContainer) return;

    const originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error
    };

    const addLogToUI = (type, args) => {
      if (!this.consoleLogContainer) return;

      const message = args.map(arg => {
        if (typeof arg === "object") {
          try {
            return JSON.stringify(arg);
          } catch (e) {
            return String(arg);
          }
        }
        return String(arg);
      }).join(" ");

      const line = document.createElement("div");
      line.className = `console-log-line log-${type}`;
      
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;
      
      line.textContent = `[${timeStr}] ${message}`;
      
      this.consoleLogContainer.appendChild(line);

      // 最大保持数を超えたら古いものを削除
      const maxLogs = 200;
      while (this.consoleLogContainer.childNodes.length > maxLogs) {
        this.consoleLogContainer.removeChild(this.consoleLogContainer.firstChild);
      }

      // 自動スクロール
      if (this.consoleAutoscrollToggle && this.consoleAutoscrollToggle.checked) {
        this.consoleLogContainer.scrollTop = this.consoleLogContainer.scrollHeight;
      }
    };

    console.log = (...args) => {
      originalConsole.log.apply(console, args);
      addLogToUI("log", args);
    };

    console.info = (...args) => {
      originalConsole.info.apply(console, args);
      addLogToUI("info", args);
    };

    console.warn = (...args) => {
      originalConsole.warn.apply(console, args);
      addLogToUI("warn", args);
    };

    console.error = (...args) => {
      originalConsole.error.apply(console, args);
      addLogToUI("error", args);
    };

    // windowの未ハンドルのエラーもキャプチャする
    window.addEventListener("error", (event) => {
      addLogToUI("error", [event.message]);
    });

    window.addEventListener("unhandledrejection", (event) => {
      addLogToUI("error", [`Unhandled promise rejection: ${event.reason}`]);
    });

    // クリアボタンのイベント
    this.consoleClearButton?.addEventListener("click", () => {
      if (this.consoleLogContainer) {
        this.consoleLogContainer.innerHTML = "";
      }
    });

    // コピーボタンのイベント
    this.consoleCopyButton?.addEventListener("click", () => {
      if (this.consoleLogContainer) {
        const logLines = Array.from(this.consoleLogContainer.querySelectorAll(".console-log-line"))
          .map(line => line.textContent);
        const textToCopy = logLines.join("\n");
        
        navigator.clipboard.writeText(textToCopy)
          .then(() => {
            const originalText = this.consoleCopyButton.textContent;
            this.consoleCopyButton.textContent = "コピー完了！";
            setTimeout(() => {
              this.consoleCopyButton.textContent = originalText;
            }, 1500);
          })
          .catch(err => {
            console.error("Failed to copy logs: ", err);
          });
      }
    });
  }

  resourceMonitorActive = false;

  startResourceMonitor() {
    if (this.resourceMonitorActive) return;
    this.resourceMonitorActive = true;

    const hasMemoryApi = window.performance && window.performance.memory;
    if (hasMemoryApi && this.monitorMemContainer) {
      this.monitorMemContainer.removeAttribute("hidden");
    }

    let lastTime = performance.now();
    let frameCount = 0;

    const checkFps = () => {
      if (!this.resourceMonitorActive) return;
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        let fps = 0;
        if (this.engine && this.engine.engine && typeof this.engine.engine.getFps === "function") {
          fps = Math.round(this.engine.engine.getFps());
        } else {
          fps = Math.round((frameCount * 1000) / (now - lastTime));
        }

        if (this.monitorFps) {
          this.monitorFps.textContent = fps;
        }
        frameCount = 0;
        lastTime = now;

        if (hasMemoryApi && this.monitorMem) {
          const usedMem = (performance.memory.usedJSHeapSize / 1048576).toFixed(1);
          this.monitorMem.textContent = usedMem;
        }

        if (this.engine) {
          if (this.monitorDraw && typeof this.engine.drawTime === "number") {
            this.monitorDraw.textContent = this.engine.drawTime.toFixed(1);
          }
          if (this.monitorUpdate && typeof this.engine.updateTime === "number") {
            this.monitorUpdate.textContent = this.engine.updateTime.toFixed(1);
          }
        }
      }
      requestAnimationFrame(checkFps);
    };

    requestAnimationFrame(checkFps);
  }

  stopResourceMonitor() {
    this.resourceMonitorActive = false;
  }
}

