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

  overlayPlaybackButton = null;
  overlayResetButton = null;

  // シーン管理要素
  sceneSaveButton = null;
  sceneLoadButton = null;
  savedScenesList = null;
  sceneInput = null;

  constructor(engine, mmdManager, xrManager) {
    this.engine = engine;
    this.mmdManager = mmdManager;
    this.xrManager = xrManager;

    this.initElements();
    this.setupEvents();
    this.restoreDirectoryHandle();
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
    
    this.pixelRatioSelect = document.querySelector(".pixel-ratio-select");
    this.shadowResolutionSelect = document.querySelector(".shadow-resolution-select");
    this.vrPassthroughInput = document.querySelector(".vr-passthrough-toggle");

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

    // シーン管理DOMの初期化
    this.sceneSaveButton = document.getElementById("scene-save-button");
    this.sceneLoadButton = document.getElementById("scene-load-button");
    this.savedScenesList = document.getElementById("saved-scenes-list");
    this.sceneInput = document.querySelector(".scene-input");

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



    // 再生・一時停止
    const togglePlay = () => {
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

    // フルスクリーン切り替え
    this.fullscreenButton?.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((err) => {
          console.warn(`Fullscreen error: ${err.message}`);
        });
      } else {
        document.exitFullscreen();
      }
    });



    // パネルの折りたたみ制御
    const panelHeaders = document.querySelectorAll(".panel-header");
    panelHeaders.forEach(header => {
      header.addEventListener("click", () => {
        const panel = header.closest(".panel");
        if (panel) {
          panel.classList.toggle("collapsed");
        }
      });
    });

    // アプリのキャッシュ強制更新ボタン
    const clearSwBtn = document.querySelector(".clear-service-worker-button");
    clearSwBtn?.addEventListener("click", async () => {
      if (confirm("アプリのキャッシュを強制更新してリロードしますか？\n\n※アセットフォルダやシーンなどのユーザーデータは削除されません。")) {
        this.showLoading(true, "キャッシュを強制クリア中...");
        try {
          if ("serviceWorker" in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
              await registration.unregister();
            }
          }
          if ("caches" in window) {
            const keys = await caches.keys();
            for (const key of keys) {
              await caches.delete(key);
            }
          }
          window.location.reload(true);
        } catch (err) {
          console.error("Failed to clear service worker:", err);
          this.setStatusText("キャッシュのクリアに失敗しました。");
          this.showLoading(false);
        }
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
        const pmxEntry = entries.find(e => e.name.toLowerCase().endsWith(".pmx"));
        if (!pmxEntry) throw new Error("ZIPの中に .pmx ファイルが見つかりません");
        pmxName = pmxEntry.name;
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

      const applyBtn = document.createElement("button");
      applyBtn.textContent = "適用";
      applyBtn.className = "action-button";
      applyBtn.style.width = "auto";
      applyBtn.style.minHeight = "24px";
      applyBtn.style.padding = "2px 8px";
      applyBtn.style.fontSize = "11px";
      applyBtn.addEventListener("click", async () => {
        this.motionSelectModal?.setAttribute("hidden", "");
        if (this.currentMotionTargetModelId) {
          await this.handleMotionLoadForModel(file, this.currentMotionTargetModelId);
        }
      });

      item.appendChild(span);
      item.appendChild(applyBtn);
      this.modalMotionList.appendChild(item);
    });
  }

  updateDeployedModelsList() {
    if (!this.deployedModelsList) return;
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

      // 2.5. モーション
      const motionLabel = document.createElement("div");
      motionLabel.textContent = "モーション";
      motionLabel.style.fontSize = "11px";
      motionLabel.style.color = "#8fa3b8";
      motionLabel.style.marginTop = "4px";
      settingsSection.appendChild(motionLabel);

      const motionRow = document.createElement("div");
      motionRow.style.display = "flex";
      motionRow.style.alignItems = "center";
      motionRow.style.justifyContent = "space-between";
      motionRow.style.gap = "8px";

      const activeMotionNameSpan = document.createElement("span");
      const motionKeys = Array.from(model.motions.keys());
      if (motionKeys.length > 0) {
        const fullPath = motionKeys[motionKeys.length - 1];
        const lastSlash = fullPath.lastIndexOf("/");
        activeMotionNameSpan.textContent = lastSlash !== -1 ? fullPath.substring(lastSlash + 1) : fullPath;
        activeMotionNameSpan.style.color = "#8fd8ff";
      } else {
        activeMotionNameSpan.textContent = "未適用";
        activeMotionNameSpan.style.color = "#87919d";
      }
      activeMotionNameSpan.style.fontSize = "11px";
      activeMotionNameSpan.style.overflow = "hidden";
      activeMotionNameSpan.style.textOverflow = "ellipsis";
      activeMotionNameSpan.style.whiteSpace = "nowrap";
      activeMotionNameSpan.style.flex = "1";

      const changeMotionBtn = document.createElement("button");
      changeMotionBtn.textContent = "モーション追加・変更";
      changeMotionBtn.className = "action-button";
      changeMotionBtn.style.width = "auto";
      changeMotionBtn.style.minHeight = "24px";
      changeMotionBtn.style.padding = "2px 8px";
      changeMotionBtn.style.fontSize = "11px";
      changeMotionBtn.addEventListener("click", () => {
        this.currentMotionTargetModelId = model.id;
        this.motionSelectModal?.removeAttribute("hidden");
      });

      motionRow.appendChild(activeMotionNameSpan);
      motionRow.appendChild(changeMotionBtn);
      settingsSection.appendChild(motionRow);

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

      itemContainer.appendChild(settingsSection);
      this.deployedModelsList.appendChild(itemContainer);
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

      models.push({
        name: model.name,
        zipName: model.zipName || null,
        position: [model.mesh.position.x, model.mesh.position.y, model.mesh.position.z],
        rotation: [rx, ry, rz],
        shadowEnabled: model.shadowEnabled ?? true,
        motions: Array.from(model.motions.keys())
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
        gravity: this.gravityMagnitudeInput ? parseFloat(this.gravityMagnitudeInput.value) : 9.8
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
}
