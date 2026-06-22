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
  const LEGACY_MODEL_HELP = "PMX 本体とテクスチャ画像を全て選択、または ZIP を 1 つ選択";
  const LEGACY_STATUS = "PMX 本体とテクスチャ画像を全て選択、または ZIP を 1 つ選択してください。";
  const ASSETS_PATH_LABEL_KEY = "webmmd.assets.pathLabel";
  const HANDLE_DB_NAME = "webmmd-assets-db";
  const HANDLE_DB_VERSION = 2;
  const HANDLE_STORE_NAME = "settings";
  const ASSETS_CACHE_STORE_NAME = "assetsCache";
  const ASSETS_CACHE_RECORD_KEY = "assetsFiles";
  const HANDLE_RECORD_KEY = "assetsDirectoryHandle";

  let cachedAssetsFiles = [];
  let indexedModelFiles = [];
  let indexedMotionFiles = [];
  let sectionState = { usePathSections: false };
  let hasScannedAssets = false;
  let currentAssetsDirectoryHandle = null;
  let assetsPathDisplayNode = null;
  const customPathMap = new WeakMap();

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

  const loadModelByPath = (path, modelInput) => {
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

  const loadMotionByPath = (path, motionInput) => {
    const selectedLower = toLower(path);
    const selectedMotion = indexedMotionFiles.find((file) => toLower(getRelativePath(file)) === selectedLower);
    if (!selectedMotion) {
      updateStatus("選択した VMD が見つかりませんでした。");
      return;
    }

    setFileInputAndDispatch(motionInput, [selectedMotion]);
    updateStatus(`モーションを読み込みました: ${selectedMotion.name}`);
  };

  const createList = (titleText) => {
    const wrap = document.createElement("div");
    wrap.className = "field";

    const title = document.createElement("span");
    title.textContent = titleText;

    const list = document.createElement("div");
    list.className = "motion-list";

    wrap.append(title, list);
    return { wrap, list };
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

  const forceHideLegacyMotionUi = () => {};

  const forceHideLegacyModelUi = () => {};

  const enforcePanelOrder = () => {
    const cameraInput = document.querySelector(".camera-motion-input");
    const materialPanel = document.querySelector(".material-override-panel");
    if (!cameraInput || !materialPanel) return;

    const cameraPanel = cameraInput.closest(".panel");
    if (!cameraPanel) return;
    if (cameraPanel.nextElementSibling === materialPanel) return;

    cameraPanel.insertAdjacentElement("afterend", materialPanel);
  };

  const setupIfReady = () => {
    const modelInput = document.querySelector(".file-input");
    const motionInput = document.querySelector(".motion-input");
    if (!modelInput || !motionInput) return;

    enforcePanelOrder();
    if (modelInput.dataset.assetsEnhanced === "1") return;
    modelInput.dataset.assetsEnhanced = "1";

    const sourceInput = document.createElement("input");
    sourceInput.type = "file";
    sourceInput.multiple = true;
    sourceInput.hidden = true;
    sourceInput.setAttribute("webkitdirectory", "");
    sourceInput.setAttribute("directory", "");
    document.body.append(sourceInput);

    const modelPanel = modelInput.closest(".panel");
    const motionPanel = motionInput.closest(".panel");
    if (!modelPanel || !motionPanel) return;

    const controlsField = document.createElement("div");
    controlsField.className = "field";

    const openAssetsButton = document.createElement("button");
    openAssetsButton.type = "button";
    openAssetsButton.className = "action-button";
    openAssetsButton.textContent = "assets フォルダを設定";

    const rescanButton = document.createElement("button");
    rescanButton.type = "button";
    rescanButton.className = "action-button";
    rescanButton.textContent = "再スキャン";

    assetsPathDisplayNode = document.createElement("p");
    assetsPathDisplayNode.className = "motion-empty";
    assetsPathDisplayNode.style.margin = "0";
    assetsPathDisplayNode.textContent = "現在の assets: 未設定";

    controlsField.append(openAssetsButton, rescanButton, assetsPathDisplayNode);
    modelPanel.prepend(controlsField);

    const savedPathLabel = localStorage.getItem(ASSETS_PATH_LABEL_KEY) || "";
    updateAssetsPathDisplay(savedPathLabel || "未設定");

    const modelResources = createList("model (.pmx / .zip) 一覧");
    const motionResources = createList("motion (.vmd) 一覧");
    modelPanel.append(modelResources.wrap);
    motionPanel.append(motionResources.wrap);

    const renderIndexed = () => {
      const modelEmptyText = hasScannedAssets
        ? "model フォルダ内に PMX / ZIP がありません。"
        : "assets フォルダを設定すると model 一覧を表示します。";
      const motionEmptyText = hasScannedAssets
        ? "motion フォルダ内に VMD がありません。"
        : "assets フォルダを設定すると motion 一覧を表示します。";

      renderResourceList({
        listNode: modelResources.list,
        files: indexedModelFiles,
        emptyText: modelEmptyText,
        buttonPrefix: "配置",
        onClick: (path) => loadModelByPath(path, modelInput),
      });
      renderResourceList({
        listNode: motionResources.list,
        files: indexedMotionFiles,
        emptyText: motionEmptyText,
        buttonPrefix: "適用",
        onClick: (path) => loadMotionByPath(path, motionInput),
      });
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

  window.addEventListener("DOMContentLoaded", () => {
    setupIfReady();
  });
})();
