if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("Service Worker registration failed:", error);
    });
  });
}

(() => {
  const STATUS_DEFAULT = "assets フォルダを設定すると model / motion を検知して一覧表示します。";
  const STATUS_MISSING = "assets/model または assets/motion が見つかりません。";
  const ASSETS_PATH_LABEL_KEY = "webmmd.assets.pathLabel";
  const HANDLE_DB_NAME = "webmmd-assets-db";
  const HANDLE_DB_VERSION = 2;
  const HANDLE_STORE_NAME = "settings";
  const ASSETS_CACHE_STORE_NAME = "assetsCache";
  const ASSETS_CACHE_RECORD_KEY = "assetsFiles";
  const HANDLE_RECORD_KEY = "assetsDirectoryHandle";
  const ASSETS_SELECTED_MOTION_PATH_KEY = "webmmd.assets.selectedMotionPath";

  let cachedAssetsFiles = [];
  let indexedModelFiles = [];
  let indexedMotionFiles = [];
  let selectedAssetsModelPath = "";
  let selectedAssetsMotionPath = "";
  let sectionState = { usePathSections: false };
  let hasScannedAssets = false;
  let currentAssetsDirectoryHandle = null;
  let assetsPathDisplayNode = null;
  const customPathMap = new WeakMap();
  let renderIndexed = () => {};

  // ---- サウンド ----
  let currentAudio = null;
  let currentAudioObjectUrl = null;

  const getSoundStatusNode = () => document.getElementById("sound-status");

  const findAudioFileForMotion = (motionPath) => {
    const normalized = motionPath.replace(/\\/g, "/");
    const dotIndex = normalized.lastIndexOf(".");
    const stem = dotIndex !== -1 ? normalized.slice(0, dotIndex) : normalized;
    const stemLower = stem.toLowerCase();
    for (const file of cachedAssetsFiles) {
      const filePath = toLower(getRelativePath(file));
      const fileExt = filePath.slice(filePath.lastIndexOf("."));
      if (fileExt !== ".mp3" && fileExt !== ".wav") continue;
      const fileStem = filePath.slice(0, filePath.lastIndexOf("."));
      if (fileStem === stemLower) return file;
    }
    return null;
  };

  const stopCurrentAudio = () => {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    if (currentAudioObjectUrl) {
      URL.revokeObjectURL(currentAudioObjectUrl);
      currentAudioObjectUrl = null;
    }
  };

  const loadSoundForMotion = (motionPath) => {
    stopCurrentAudio();
    const statusNode = getSoundStatusNode();
    const audioFile = findAudioFileForMotion(motionPath);
    if (!audioFile) {
      if (statusNode) {
        statusNode.textContent = "存在しませんでした";
        statusNode.hidden = false;
      }
      return;
    }
    const url = URL.createObjectURL(audioFile);
    currentAudioObjectUrl = url;
    const audio = new Audio(url);
    const loopInput = document.querySelector(".loop-input");
    audio.loop = loopInput ? loopInput.checked : false;
    currentAudio = audio;
    if (statusNode) {
      statusNode.textContent = audioFile.name;
      statusNode.hidden = false;
    }
  };
  // ---- サウンド ここまで ----

  const toLower = (value) => value.toLowerCase();

  const getRelativePath = (file) => {
    const customPath = customPathMap.get(file);
    if (customPath) return customPath;
    const raw = file.webkitRelativePath || file.name;
    return raw.replace(/\\/g, "/");
  };

  const setRelativePath = (file, relativePath) => {
    customPathMap.set(file, relativePath.replace(/\\/g, "/"));
  };

  const splitPath = (file) => getRelativePath(file).split("/").filter(Boolean);

  const isUnderSection = (file, sectionName) => {
    const section = toLower(sectionName);
    const parts = splitPath(file).map(toLower);
    const sectionIndex = parts.indexOf(section);
    return sectionIndex !== -1 && sectionIndex < parts.length - 1;
  };

  const hasSectionInPath = (file, sectionName) => {
    const section = toLower(sectionName);
    const parts = splitPath(file).map(toLower);
    return parts.includes(section);
  };

  const getExtension = (file) => {
    const name = toLower(file.name).trim();
    const dot = name.lastIndexOf(".");
    return dot === -1 ? "" : name.slice(dot);
  };

  const isModelEntry = (file) => {
    const ext = getExtension(file);
    if (sectionState.usePathSections) {
      return isUnderSection(file, "model") && (ext === ".pmx" || ext === ".zip");
    }
    return ext === ".pmx" || ext === ".zip";
  };

  const isMotionEntry = (file) => {
    const ext = getExtension(file);
    if (sectionState.usePathSections) {
      return isUnderSection(file, "motion") && ext === ".vmd";
    }
    return ext === ".vmd";
  };

  const isModelCompanionAsset = (file, selectedLower) => {
    const filePath = toLower(getRelativePath(file));
    if (filePath === selectedLower) return false;

    const ext = getExtension(file);
    if (sectionState.usePathSections && !isUnderSection(file, "model")) return false;
    return ext !== ".pmx" && ext !== ".zip" && ext !== ".vmd";
  };

  const detectSectionState = (allFiles) => {
    const hasModelMarker = allFiles.some((file) => hasSectionInPath(file, "model"));
    const hasMotionMarker = allFiles.some((file) => hasSectionInPath(file, "motion"));
    return { usePathSections: hasModelMarker || hasMotionMarker };
  };

  const updateStatus = (message) => {
    const statusNode = document.querySelector(".status");
    if (!statusNode) return;
    statusNode.textContent = message;
  };

  const showPopup = (message, isError = false) => {
    const prefix = isError ? "失敗" : "完了";
    window.alert(`${prefix}: ${message}`);
  };

  const openHandleDb = () => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(HANDLE_DB_NAME, HANDLE_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(HANDLE_STORE_NAME)) {
          db.createObjectStore(HANDLE_STORE_NAME);
        }
        if (!db.objectStoreNames.contains(ASSETS_CACHE_STORE_NAME)) {
          db.createObjectStore(ASSETS_CACHE_STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || Error("IndexedDB open failed"));
    });
  };

  const saveAssetsFilesToCache = async (files) => {
    const db = await openHandleDb();
    const payload = files.map((file) => ({
      path: getRelativePath(file),
      blob: file,
    }));
    await new Promise((resolve, reject) => {
      const tx = db.transaction(ASSETS_CACHE_STORE_NAME, "readwrite");
      tx.objectStore(ASSETS_CACHE_STORE_NAME).put(payload, ASSETS_CACHE_RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || Error("IndexedDB assets cache write failed"));
    });
    db.close();
  };

  const loadAssetsFilesFromCache = async () => {
    try {
      const db = await openHandleDb();
      const payload = await new Promise((resolve, reject) => {
        const tx = db.transaction(ASSETS_CACHE_STORE_NAME, "readonly");
        const request = tx.objectStore(ASSETS_CACHE_STORE_NAME).get(ASSETS_CACHE_RECORD_KEY);
        request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
        request.onerror = () => reject(request.error || Error("IndexedDB assets cache read failed"));
      });
      db.close();

      return payload
        .filter((entry) => entry && typeof entry.path === "string" && entry.blob instanceof Blob)
        .map((entry) => {
          const nameParts = entry.path.split("/").filter(Boolean);
          const fileName = nameParts[nameParts.length - 1] || "unknown";
          const file = new File([entry.blob], fileName, { type: entry.blob.type || "" });
          setRelativePath(file, entry.path);
          return file;
        });
    } catch {
      return [];
    }
  };

  const clearPersistedAssetsData = async () => {
    localStorage.removeItem(ASSETS_PATH_LABEL_KEY);

    try {
      const db = await openHandleDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction([HANDLE_STORE_NAME, ASSETS_CACHE_STORE_NAME], "readwrite");
        tx.objectStore(HANDLE_STORE_NAME).delete(HANDLE_RECORD_KEY);
        tx.objectStore(ASSETS_CACHE_STORE_NAME).delete(ASSETS_CACHE_RECORD_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || Error("IndexedDB clear failed"));
      });
      db.close();
    } catch (error) {
      console.warn("Failed to clear persisted assets data", error);
    }
  };

  const saveDirectoryHandle = async (handle) => {
    const db = await openHandleDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE_NAME, "readwrite");
      tx.objectStore(HANDLE_STORE_NAME).put(handle, HANDLE_RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || Error("IndexedDB write failed"));
    });
    db.close();
  };

  const loadDirectoryHandle = async () => {
    try {
      const db = await openHandleDb();
      const handle = await new Promise((resolve, reject) => {
        const tx = db.transaction(HANDLE_STORE_NAME, "readonly");
        const request = tx.objectStore(HANDLE_STORE_NAME).get(HANDLE_RECORD_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || Error("IndexedDB read failed"));
      });
      db.close();
      return handle;
    } catch {
      return null;
    }
  };

  const isDirectoryPickerSupported = () => typeof window.showDirectoryPicker === "function";

  const updateAssetsPathDisplay = (label) => {
    if (!assetsPathDisplayNode) return;
    assetsPathDisplayNode.textContent = `現在の assets: ${label || "未設定"}`;
  };

  const persistAssetsPathLabel = (label) => {
    localStorage.setItem(ASSETS_PATH_LABEL_KEY, label || "");
    updateAssetsPathDisplay(label);
  };

  const ensureDirectoryPermission = async (handle, allowPrompt) => {
    if (!handle || typeof handle.queryPermission !== "function") return false;
    let state = await handle.queryPermission({ mode: "read" });
    if (state === "granted") return true;
    if (!allowPrompt || typeof handle.requestPermission !== "function") return false;
    state = await handle.requestPermission({ mode: "read" });
    return state === "granted";
  };

  const collectDirectoryFiles = async (handle, parentPath) => {
    const collected = [];
    for await (const [name, entry] of handle.entries()) {
      const currentPath = parentPath ? `${parentPath}/${name}` : name;
      if (entry.kind === "file") {
        const file = await entry.getFile();
        setRelativePath(file, currentPath);
        collected.push(file);
      } else if (entry.kind === "directory") {
        const childFiles = await collectDirectoryFiles(entry, currentPath);
        collected.push(...childFiles);
      }
    }
    return collected;
  };

  const deriveInputRootLabel = (files) => {
    if (!files.length) return "未設定";
    const firstPath = getRelativePath(files[0]);
    const root = firstPath.split("/").filter(Boolean)[0] || "未設定";
    return root;
  };

  const setFileInputAndDispatch = (input, files) => {
    const transfer = new DataTransfer();
    for (const file of files) {
      transfer.items.add(file);
    }
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const modelCandidateSorter = (selectedPath) => {
    const selectedLower = toLower(selectedPath);
    return (a, b) => {
      const aPath = toLower(getRelativePath(a));
      const bPath = toLower(getRelativePath(b));
      if (aPath === selectedLower) return -1;
      if (bPath === selectedLower) return 1;
      return aPath.localeCompare(bPath);
    };
  };

  const loadModelByPath = (path) => {
    const modelInput = document.querySelector(".file-input");
    if (!modelInput) {
      updateStatus("モデル入力が初期化されていません。ページを再読み込みしてください。");
      return;
    }

    const selectedLower = toLower(path);
    const selectedModel = indexedModelFiles.find((file) => toLower(getRelativePath(file)) === selectedLower);
    if (!selectedModel) {
      updateStatus("選択したモデルが見つかりませんでした。");
      return;
    }

    const selectedNameLower = selectedModel.name.toLowerCase();
    if (selectedNameLower.endsWith(".zip")) {
      setFileInputAndDispatch(modelInput, [selectedModel]);
      updateStatus(`ZIP モデルを読み込みました: ${selectedModel.name}`);
      return;
    }

    const selectedFiles = [selectedModel];
    const modelFiles = cachedAssetsFiles
      .filter((file) => isModelCompanionAsset(file, selectedLower))
      .sort(modelCandidateSorter(path));

    selectedFiles.push(...modelFiles);
    setFileInputAndDispatch(modelInput, selectedFiles);
    updateStatus(`モデルを読み込みました: ${selectedModel.name}`);
  };

  const loadMotionByPath = (path) => {
    const motionInput = document.querySelector(".motion-input");
    if (!motionInput) {
      updateStatus("モーション入力が初期化されていません。ページを再読み込みしてください。");
      return;
    }

    const selectedLower = toLower(path);
    const selectedMotion = indexedMotionFiles.find((file) => toLower(getRelativePath(file)) === selectedLower);
    if (!selectedMotion) {
      updateStatus("選択した VMD が見つかりませんでした。");
      return;
    }

    // 前のモーション状態をクリア（空のファイルリスト）
    const clearTransfer = new DataTransfer();
    motionInput.files = clearTransfer.files;
    motionInput.dispatchEvent(new Event("change", { bubbles: true }));

    // その後、新しいモーションを設定
    setFileInputAndDispatch(motionInput, [selectedMotion]);
    updateStatus(`モーションを読み込みました: ${selectedMotion.name}`);
  };

  const renderResourceList = ({
    listNode,
    files,
    emptyText,
    buttonPrefix,
    onClick,
  }) => {
    listNode.replaceChildren();

    if (files.length === 0) {
      const empty = document.createElement("p");
      empty.className = "motion-empty";
      empty.textContent = emptyText;
      listNode.append(empty);
      return;
    }

    for (const file of files) {
      const row = document.createElement("div");
      row.className = "playback-button-row";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "action-button";
      button.textContent = `${buttonPrefix}: ${file.name}`;
      button.title = getRelativePath(file);
      button.addEventListener("click", () => {
        onClick(getRelativePath(file));
      });

      row.append(button);
      listNode.append(row);
    }
  };

  const renderSingleChoiceMotionList = ({
    listNode,
    files,
    emptyText,
    selectedPath,
    onSelect,
  }) => {
    listNode.replaceChildren();

    if (files.length === 0) {
      const empty = document.createElement("p");
      empty.className = "motion-empty";
      empty.textContent = emptyText;
      listNode.append(empty);
      return;
    }

    const selectedLower = toLower(selectedPath || "");
    for (const file of files) {
      const relativePath = getRelativePath(file);
      const relativeLower = toLower(relativePath);

      const row = document.createElement("label");
      row.className = "motion-entry";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "assets-motion-choice";
      input.checked = relativeLower === selectedLower;
      input.title = relativePath;
      input.addEventListener("change", () => {
        if (!input.checked) return;
        onSelect(relativePath);
      });

      const text = document.createElement("span");
      text.className = "motion-name";
      text.textContent = file.name;
      text.title = relativePath;

      row.append(input, text);
      listNode.append(row);
    }
  };

  const renderSingleChoiceModelList = ({
    listNode,
    files,
    emptyText,
    selectedPath,
    onSelect,
  }) => {
    listNode.replaceChildren();

    if (files.length === 0) {
      const empty = document.createElement("p");
      empty.className = "motion-empty";
      empty.textContent = emptyText;
      listNode.append(empty);
      return;
    }

    const selectedLower = toLower(selectedPath || "");
    for (const file of files) {
      const relativePath = getRelativePath(file);
      const relativeLower = toLower(relativePath);

      const row = document.createElement("label");
      row.className = "motion-entry";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "assets-model-choice";
      input.checked = relativeLower === selectedLower;
      input.title = relativePath;
      input.addEventListener("change", () => {
        if (!input.checked) return;
        onSelect(relativePath);
      });

      const text = document.createElement("span");
      text.className = "motion-name";
      text.textContent = file.name;
      text.title = relativePath;

      row.append(input, text);
      listNode.append(row);
    }
  };

  const indexAssetsFiles = (allFiles) => {
    const modelFiles = [];
    const motionFiles = [];

    for (const file of allFiles) {
      if (isModelEntry(file)) {
        modelFiles.push(file);
      }
      if (isMotionEntry(file)) {
        motionFiles.push(file);
      }
    }

    modelFiles.sort((a, b) => getRelativePath(a).localeCompare(getRelativePath(b)));
    motionFiles.sort((a, b) => getRelativePath(a).localeCompare(getRelativePath(b)));
    return { modelFiles, motionFiles };
  };

  const ASSETS_CONTROLS_HTML = `<div class="field" id="assets-controls">
    <button id="assets-open-button" type="button" class="action-button">assets フォルダを設定</button>
    <button id="assets-rescan-button" type="button" class="action-button">再スキャン</button>
    <p id="assets-path-display" class="motion-empty" style="margin:0">現在の assets: 未設定</p>
  </div>`;

  const ASSETS_MODEL_LIST_HTML = `<div class="field" id="assets-model-list-wrap">
    <span>model (.pmx / .zip) 一覧</span>
    <div id="assets-model-list" class="motion-list"></div>
  </div>`;

  const ASSETS_MOTION_LIST_HTML = `<div class="field" id="assets-motion-list-wrap">
    <span>motion (.vmd) 一覧</span>
    <div id="assets-motion-list" class="motion-list"></div>
  </div>`;

  const ensureAssetsUi = (modelPanel, motionPanel) => {
    if (!document.getElementById("assets-controls")) {
      modelPanel.insertAdjacentHTML("afterbegin", ASSETS_CONTROLS_HTML);
    }
    if (!document.getElementById("assets-model-list-wrap")) {
      modelPanel.insertAdjacentHTML("beforeend", ASSETS_MODEL_LIST_HTML);
    }
    if (!document.getElementById("assets-motion-list-wrap")) {
      motionPanel.insertAdjacentHTML("beforeend", ASSETS_MOTION_LIST_HTML);
    }
  };

  const enforcePanelOrder = () => {
    const cameraMotionList = document.querySelector(".camera-motion-list");
    const materialPanel = document.querySelector(".material-override-panel");
    if (!cameraMotionList || !materialPanel) return;

    const cameraPanel = cameraMotionList.closest(".panel");
    if (!cameraPanel) return;
    if (cameraPanel.nextElementSibling === materialPanel) return;

    cameraPanel.insertAdjacentElement("afterend", materialPanel);
  };

  const setupIfReady = () => {
    enforcePanelOrder();

    const allPanels = Array.from(document.querySelectorAll(".sidebar .panel"));
    const motionPanel = allPanels.find((panel) => panel.querySelector(".play-pause-button")) || null;
    const modelPanel = allPanels.find((panel) => {
      if (!(panel instanceof HTMLElement)) return false;
      if (panel === motionPanel) return false;
      if (panel.classList.contains("material-override-panel")) return false;
      if (panel.classList.contains("camera-controls-panel")) return false;
      if (panel.querySelector(".camera-motion-list")) return false;
      return true;
    }) || null;
    if (!modelPanel || !motionPanel) return;

    ensureAssetsUi(modelPanel, motionPanel);

    const openAssetsButton = document.getElementById("assets-open-button");
    if (!openAssetsButton || openAssetsButton.dataset.hooked === "1") return;
    openAssetsButton.dataset.hooked = "1";

    assetsPathDisplayNode = document.getElementById("assets-path-display");
    const rescanButton = document.getElementById("assets-rescan-button");
    const sourceInput = document.getElementById("assets-directory-input");

    const savedPathLabel = localStorage.getItem(ASSETS_PATH_LABEL_KEY) || "";
    updateAssetsPathDisplay(savedPathLabel || "未設定");

    const syncSelectedModelFromLoadedState = () => {
      if (selectedAssetsModelPath || indexedModelFiles.length === 0) return false;

      const loadedModelNameNode = document.querySelector(".loaded-model-name");
      const loadedModelName = (loadedModelNameNode?.textContent || "").trim();
      if (!loadedModelName) return false;

      const loadedLower = toLower(loadedModelName);
      const pathMatched = indexedModelFiles.find((file) => toLower(getRelativePath(file)) === loadedLower);
      if (pathMatched) {
        selectedAssetsModelPath = toLower(getRelativePath(pathMatched));
        return true;
      }

      const nameMatched = indexedModelFiles.filter((file) => toLower(file.name) === loadedLower);
      if (nameMatched.length !== 1) return false;

      selectedAssetsModelPath = toLower(getRelativePath(nameMatched[0]));
      return true;
    };

    renderIndexed = () => {
      const modelListNode = document.getElementById("assets-model-list");
      const motionListNode = document.getElementById("assets-motion-list");
      if (!modelListNode || !motionListNode) return;

      if (!selectedAssetsModelPath) {
        selectedAssetsMotionPath = "";
      } else if (!selectedAssetsMotionPath) {
        const persistedMotionPath = localStorage.getItem(ASSETS_SELECTED_MOTION_PATH_KEY) || "";
        if (persistedMotionPath) {
          selectedAssetsMotionPath = toLower(persistedMotionPath);
        }
      }

      if (
        selectedAssetsModelPath &&
        !indexedModelFiles.some((file) => toLower(getRelativePath(file)) === selectedAssetsModelPath)
      ) {
        selectedAssetsModelPath = "";
      }

      syncSelectedModelFromLoadedState();

      if (
        selectedAssetsMotionPath &&
        !indexedMotionFiles.some((file) => toLower(getRelativePath(file)) === selectedAssetsMotionPath)
      ) {
        selectedAssetsMotionPath = "";
      }

      const modelEmptyText = hasScannedAssets
        ? "model フォルダ内に PMX / ZIP がありません。"
        : "assets フォルダを設定すると model 一覧を表示します。";
      const motionEmptyText = hasScannedAssets
        ? "motion フォルダ内に VMD がありません。"
        : "assets フォルダを設定すると motion 一覧を表示します。";

      renderSingleChoiceModelList({
        listNode: modelListNode,
        files: indexedModelFiles,
        emptyText: modelEmptyText,
        selectedPath: selectedAssetsModelPath,
        onSelect: (path) => {
          selectedAssetsModelPath = toLower(path);
          loadModelByPath(path);
        },
      });
      renderSingleChoiceMotionList({
        listNode: motionListNode,
        files: indexedMotionFiles,
        emptyText: motionEmptyText,
        selectedPath: selectedAssetsMotionPath,
        onSelect: (path) => {
          selectedAssetsMotionPath = toLower(path);
          localStorage.setItem(ASSETS_SELECTED_MOTION_PATH_KEY, path);
          loadMotionByPath(path);
          loadSoundForMotion(path);
        },
      });

      // 初期ポーズ ラジオを先頭に挿入
      const initialPoseRow = document.createElement("label");
      initialPoseRow.className = "motion-entry";
      const initialPoseRadio = document.createElement("input");
      initialPoseRadio.type = "radio";
      initialPoseRadio.name = "assets-motion-choice";
      initialPoseRadio.checked = !selectedAssetsMotionPath;
      initialPoseRadio.addEventListener("change", () => {
        if (!initialPoseRadio.checked) return;
        selectedAssetsMotionPath = "";
        localStorage.removeItem(ASSETS_SELECTED_MOTION_PATH_KEY);
        stopCurrentAudio();
        const statusNode = getSoundStatusNode();
        if (statusNode) statusNode.textContent = "モーションを選択すると音声ファイルを検索します。";
        const poseResetBtn = document.querySelector(".pose-reset-button");
        if (poseResetBtn && !poseResetBtn.disabled) poseResetBtn.click();
      });
      const initialPoseText = document.createElement("span");
      initialPoseText.className = "motion-name";
      initialPoseText.textContent = "初期ポーズ";
      initialPoseRow.append(initialPoseRadio, initialPoseText);
      motionListNode.prepend(initialPoseRow);
    };

    const scan = () => {
      hasScannedAssets = true;
      sectionState = detectSectionState(cachedAssetsFiles);
      const indexed = indexAssetsFiles(cachedAssetsFiles);
      indexedModelFiles = indexed.modelFiles;
      indexedMotionFiles = indexed.motionFiles;
      renderIndexed();

      if (indexedModelFiles.length === 0 && indexedMotionFiles.length === 0) {
        updateStatus(STATUS_MISSING);
        return { ok: false, reason: "empty" };
      }
      const zipCount = indexedModelFiles.filter((file) => getExtension(file) === ".zip").length;
      updateStatus(`assets を検知しました: model ${indexedModelFiles.length}件 (zip ${zipCount}件) / VMD ${indexedMotionFiles.length}件`);
      return { ok: true, reason: "ready" };
    };

    const resetAssetsState = async () => {
      currentAssetsDirectoryHandle = null;
      cachedAssetsFiles = [];
      indexedModelFiles = [];
      indexedMotionFiles = [];
      selectedAssetsModelPath = "";
      selectedAssetsMotionPath = "";
      localStorage.removeItem(ASSETS_SELECTED_MOTION_PATH_KEY);
      sectionState = { usePathSections: false };
      hasScannedAssets = false;

      await clearPersistedAssetsData();
      updateAssetsPathDisplay("未設定");
      updateStatus(STATUS_DEFAULT);
      renderIndexed();
    };

    const scanFromDirectoryHandle = async (allowPrompt, notifyPopup) => {
      if (!currentAssetsDirectoryHandle) {
        if (notifyPopup) showPopup("再スキャン失敗: assets フォルダが未設定です。", true);
        return;
      }
      try {
        const allowed = await ensureDirectoryPermission(currentAssetsDirectoryHandle, allowPrompt);
        if (!allowed) {
          updateStatus("assets フォルダへのアクセス許可が必要です。");
          if (notifyPopup) showPopup("再スキャン失敗: アクセス権限がありません。", true);
          return;
        }

        cachedAssetsFiles = await collectDirectoryFiles(currentAssetsDirectoryHandle, currentAssetsDirectoryHandle.name);
        await saveAssetsFilesToCache(cachedAssetsFiles);
        const result = scan();
        if (notifyPopup) {
          showPopup(result.ok ? "再スキャン完了" : "再スキャン失敗", !result.ok);
        }
      } catch (error) {
        console.error("Failed to scan directory handle", error);
        updateStatus("assets フォルダの再スキャンに失敗しました。");
        if (notifyPopup) showPopup("再スキャン失敗", true);
      }
    };

    const chooseAssetsDirectory = async () => {
      if (!isDirectoryPickerSupported()) {
        sourceInput.click();
        return;
      }

      try {
        const handle = await window.showDirectoryPicker({ mode: "read" });
        currentAssetsDirectoryHandle = handle;
        persistAssetsPathLabel(handle.name || "未設定");
        await saveDirectoryHandle(handle);
        await scanFromDirectoryHandle(true, false);
      } catch (error) {
        if (error && error.name === "AbortError") return;
        console.error("Failed to choose assets directory", error);
        updateStatus("assets フォルダの指定に失敗しました。");
      }
    };

    sourceInput.addEventListener("change", () => {
      currentAssetsDirectoryHandle = null;
      cachedAssetsFiles = Array.from(sourceInput.files || []);
      saveAssetsFilesToCache(cachedAssetsFiles).catch((error) => {
        console.warn("Failed to cache assets files", error);
      });
      persistAssetsPathLabel(deriveInputRootLabel(cachedAssetsFiles));
      scan();
    });

    openAssetsButton.addEventListener("click", async () => {
      await chooseAssetsDirectory();
    });

    rescanButton.addEventListener("click", async () => {
      if (currentAssetsDirectoryHandle) {
        await scanFromDirectoryHandle(true, true);
        return;
      }

      if (cachedAssetsFiles.length === 0) {
        updateStatus("先に assets フォルダを設定してください。");
        showPopup("再スキャン失敗: assets フォルダが未設定です。", true);
        return;
      }
      const result = scan();
      showPopup(result.ok ? "再スキャン完了" : "再スキャン失敗", !result.ok);
    });

    const clearCacheButton = document.querySelector(".clear-cache-button");
    if (clearCacheButton && clearCacheButton.dataset.assetsClearHooked !== "1") {
      clearCacheButton.dataset.assetsClearHooked = "1";
      clearCacheButton.addEventListener("click", async () => {
        await resetAssetsState();
      });
    }

    const clearSWButton = document.querySelector(".clear-service-worker-button");
    if (clearSWButton && clearSWButton.dataset.swClearHooked !== "1") {
      clearSWButton.dataset.swClearHooked = "1";
      clearSWButton.addEventListener("click", async () => {
        if (!window.confirm("アプリのキャッシュを強制更新して再起動しますか？\n（読み込んだモデルやモーションのキャッシュは削除されません）")) {
          return;
        }
        
        updateStatus("キャッシュを強制更新中...");
        
        // CacheStorage をすべて削除
        if ('caches' in window) {
          try {
            const keys = await caches.keys();
            await Promise.all(keys.map(key => caches.delete(key)));
            console.debug('[ui] CacheStorage cleared');
          } catch (e) {
            console.warn('[ui] CacheStorage clear failed', e);
          }
        }
        
        // サービスワーカーの登録を解除
        if ('serviceWorker' in navigator) {
          try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(reg => reg.unregister()));
            console.debug('[ui] ServiceWorker unregistered');
          } catch (e) {
            console.warn('[ui] ServiceWorker unregister failed', e);
          }
        }
        
        // ページを強制リロード
        window.location.reload(true);
      });
    }

    const loadedModelNameNode = document.querySelector(".loaded-model-name");
    if (loadedModelNameNode instanceof HTMLElement && loadedModelNameNode.dataset.assetsSyncHooked !== "1") {
      loadedModelNameNode.dataset.assetsSyncHooked = "1";
      const loadedModelObserver = new MutationObserver(() => {
        if (!selectedAssetsModelPath && syncSelectedModelFromLoadedState()) {
          renderIndexed();
        }
      });
      loadedModelObserver.observe(loadedModelNameNode, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }

    // ---- サウンド再生同期フック ----
    const playPauseButton = document.querySelector(".play-pause-button");
    if (playPauseButton && playPauseButton.dataset.soundHooked !== "1") {
      playPauseButton.dataset.soundHooked = "1";
      // capture:true で UIClass より先に発火 → クリック前のテキスト（現在の状態）を読む
      // "再生" = 現在停止中 → このクリックで再生開始 → play()
      // "一時停止" = 現在再生中 → このクリックで停止 → pause()
      playPauseButton.addEventListener("click", () => {
        if (!currentAudio) return;
        if (playPauseButton.textContent.trim() === "再生") {
          currentAudio.play().catch((err) => console.warn("[sound] play failed:", err));
        } else {
          currentAudio.pause();
        }
      }, true);
    }

    const overlayPlaybackButton = document.querySelector(".overlay-playback-toggle");
    if (overlayPlaybackButton && overlayPlaybackButton.dataset.soundHooked !== "1") {
      overlayPlaybackButton.dataset.soundHooked = "1";
      // aria-label でクリック前の状態を読む（"再生" = 現在停止中 → play）
      overlayPlaybackButton.addEventListener("click", () => {
        if (!currentAudio) return;
        if (overlayPlaybackButton.getAttribute("aria-label") === "再生") {
          currentAudio.play().catch((err) => console.warn("[sound] overlay play failed:", err));
        } else {
          currentAudio.pause();
        }
      }, true);
    }

    const resetButton = document.querySelector(".reset-button");
    if (resetButton && resetButton.dataset.soundHooked !== "1") {
      resetButton.dataset.soundHooked = "1";
      resetButton.addEventListener("click", () => {
        if (!currentAudio) return;
        const wasPlaying = !currentAudio.paused;
        currentAudio.currentTime = 0;
        if (wasPlaying) currentAudio.play().catch(() => {});
      });
    }

    const overlayResetButton = document.querySelector(".overlay-reset-button");
    if (overlayResetButton && overlayResetButton.dataset.soundHooked !== "1") {
      overlayResetButton.dataset.soundHooked = "1";
      overlayResetButton.addEventListener("click", () => {
        if (!currentAudio) return;
        const wasPlaying = !currentAudio.paused;
        currentAudio.currentTime = 0;
        if (wasPlaying) currentAudio.play().catch(() => {});
      });
    }

    const poseResetButton = document.querySelector(".pose-reset-button");
    if (poseResetButton && poseResetButton.dataset.soundHooked !== "1") {
      poseResetButton.dataset.soundHooked = "1";
      poseResetButton.addEventListener("click", () => {
        if (!currentAudio) return;
        currentAudio.pause();
        currentAudio.currentTime = 0;
      });
    }

    const loopInput = document.querySelector(".loop-input");
    if (loopInput && loopInput.dataset.soundHooked !== "1") {
      loopInput.dataset.soundHooked = "1";
      loopInput.addEventListener("change", () => {
        if (currentAudio) currentAudio.loop = loopInput.checked;
      });
    }
    // ---- サウンド再生同期フック ここまで ----

    updateStatus(STATUS_DEFAULT);
    renderIndexed();

    loadAssetsFilesFromCache().then((cachedFiles) => {
      if (cachedFiles.length === 0 || cachedAssetsFiles.length > 0) return;
      cachedAssetsFiles = cachedFiles;
      const result = scan();
      if (result.ok) {
        const savedPathLabel = localStorage.getItem(ASSETS_PATH_LABEL_KEY) || deriveInputRootLabel(cachedAssetsFiles);
        persistAssetsPathLabel(savedPathLabel);
      }
    });

    loadDirectoryHandle().then(async (savedHandle) => {
      if (!savedHandle || currentAssetsDirectoryHandle) return;
      currentAssetsDirectoryHandle = savedHandle;
      persistAssetsPathLabel(savedHandle.name || localStorage.getItem(ASSETS_PATH_LABEL_KEY) || "未設定");
      const granted = await ensureDirectoryPermission(savedHandle, false);
      if (granted) {
        await scanFromDirectoryHandle(false, false);
      }
    });
  };

  const appRoot = document.querySelector("#app");
  if (appRoot) {
    const appObserver = new MutationObserver(() => {
      enforcePanelOrder();
      setupIfReady();
    });
    appObserver.observe(appRoot, { childList: true, subtree: true });
  }

  const setSelectedAssets = (modelFileName, activeMotionFileNames) => {
    if (modelFileName) {
      const lowerModelName = modelFileName.toLowerCase();
      const foundModel = indexedModelFiles.find((file) => toLower(getRelativePath(file)).endsWith(lowerModelName) || toLower(file.name) === lowerModelName);
      if (foundModel) {
        selectedAssetsModelPath = toLower(getRelativePath(foundModel));
      } else {
        selectedAssetsModelPath = "";
      }
    } else {
      selectedAssetsModelPath = "";
    }

    const motionName = Array.isArray(activeMotionFileNames)
      ? (activeMotionFileNames.length > 0 ? activeMotionFileNames[0] : null)
      : activeMotionFileNames;

    if (motionName) {
      const lowerMotionName = motionName.toLowerCase();
      const foundMotion = indexedMotionFiles.find((file) => toLower(getRelativePath(file)).endsWith(lowerMotionName) || toLower(file.name) === lowerMotionName);
      if (foundMotion) {
        selectedAssetsMotionPath = toLower(getRelativePath(foundMotion));
      } else {
        selectedAssetsMotionPath = "";
      }
    } else {
      selectedAssetsMotionPath = "";
      localStorage.removeItem(ASSETS_SELECTED_MOTION_PATH_KEY);
    }

    renderIndexed();
  };

  window.webmmdUI = {
    loadModelByPath,
    loadMotionByPath,
    getCachedAssetsFiles: () => cachedAssetsFiles,
    getIndexedModelFiles: () => indexedModelFiles,
    getIndexedMotionFiles: () => indexedMotionFiles,
    loadSoundForMotion,
    stopCurrentAudio,
    setSelectedAssets
  };

  window.addEventListener("DOMContentLoaded", () => {
    setupIfReady();
  });
  })();
