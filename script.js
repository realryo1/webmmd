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

  let cachedAssetsFiles = [];
  let indexedModelFiles = [];
  let indexedMotionFiles = [];

  const toLower = (value) => value.toLowerCase();

  const getRelativePath = (file) => {
    const raw = file.webkitRelativePath || file.name;
    return raw.replace(/\\/g, "/");
  };

  const splitPath = (file) => getRelativePath(file).split("/").filter(Boolean);

  const updateStatus = (message) => {
    const statusNode = document.querySelector(".status");
    if (!statusNode) return;
    statusNode.textContent = message;
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
      updateStatus("選択した PMX が見つかりませんでした。");
      return;
    }

    const selectedFiles = [selectedModel];
    const modelFiles = cachedAssetsFiles
      .filter((file) => {
        const parts = splitPath(file);
        return parts.length >= 3 && toLower(parts[1]) === "model";
      })
      .filter((file) => {
        const filePath = toLower(getRelativePath(file));
        if (filePath === selectedLower) return false;
        return !file.name.toLowerCase().endsWith(".pmx");
      })
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
      const parts = splitPath(file);
      if (parts.length < 3) continue;
      const area = toLower(parts[1]);
      const fileName = toLower(file.name);

      if (area === "model" && fileName.endsWith(".pmx")) {
        modelFiles.push(file);
      }
      if (area === "motion" && fileName.endsWith(".vmd")) {
        motionFiles.push(file);
      }
    }

    modelFiles.sort((a, b) => getRelativePath(a).localeCompare(getRelativePath(b)));
    motionFiles.sort((a, b) => getRelativePath(a).localeCompare(getRelativePath(b)));
    return { modelFiles, motionFiles };
  };

  const forceHideLegacyMotionUi = () => {
    const motionInput = document.querySelector(".motion-input");
    if (!motionInput) return;
    const motionPanel = motionInput.closest(".panel");
    if (!motionPanel) return;

    const legacyMotionField = motionPanel.querySelector("label.field");
    const legacyMotionList = motionPanel.querySelector(".motion-list");
    const legacyPlaybackRow = motionPanel.querySelector(".playback-button-row");
    const legacyLoopField = motionPanel.querySelector(".checkbox-field");

    if (legacyMotionField) {
      legacyMotionField.hidden = true;
      legacyMotionField.style.display = "none";
    }
    if (legacyMotionList) {
      legacyMotionList.hidden = true;
      legacyMotionList.style.display = "none";
    }
    if (legacyPlaybackRow) {
      legacyPlaybackRow.hidden = true;
      legacyPlaybackRow.style.display = "none";
    }
    if (legacyLoopField) {
      legacyLoopField.hidden = true;
      legacyLoopField.style.display = "none";
    }
  };

  const forceHideLegacyModelUi = () => {
    const modelInput = document.querySelector(".file-input");
    if (!modelInput) return;
    const modelPanel = modelInput.closest(".panel");
    if (!modelPanel) return;

    const legacyModelField = modelPanel.querySelector("label.field");
    if (legacyModelField) {
      legacyModelField.hidden = true;
      legacyModelField.style.display = "none";
    }

    const legacyModelHelp = modelPanel.querySelector(".motion-empty");
    if (legacyModelHelp) {
      legacyModelHelp.textContent = "";
      legacyModelHelp.hidden = true;
      legacyModelHelp.style.display = "none";
    }

    const statusNode = document.querySelector(".status");
    if (!statusNode) return;
    const text = statusNode.textContent ? statusNode.textContent.trim() : "";
    if (text === LEGACY_MODEL_HELP || text === LEGACY_STATUS) {
      statusNode.textContent = STATUS_DEFAULT;
    }
  };

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
    forceHideLegacyModelUi();
    forceHideLegacyMotionUi();
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

    forceHideLegacyMotionUi();

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

    controlsField.append(openAssetsButton, rescanButton);
    modelPanel.prepend(controlsField);

    const modelResources = createList("model (.pmx) 一覧");
    const motionResources = createList("motion (.vmd) 一覧");
    modelPanel.append(modelResources.wrap);
    motionPanel.append(motionResources.wrap);

    const renderIndexed = () => {
      renderResourceList({
        listNode: modelResources.list,
        files: indexedModelFiles,
        emptyText: "model フォルダ内に PMX がありません。",
        buttonPrefix: "配置",
        onClick: (path) => loadModelByPath(path, modelInput),
      });
      renderResourceList({
        listNode: motionResources.list,
        files: indexedMotionFiles,
        emptyText: "motion フォルダ内に VMD がありません。",
        buttonPrefix: "適用",
        onClick: (path) => loadMotionByPath(path, motionInput),
      });
    };

    const scan = () => {
      const indexed = indexAssetsFiles(cachedAssetsFiles);
      indexedModelFiles = indexed.modelFiles;
      indexedMotionFiles = indexed.motionFiles;
      renderIndexed();

      if (indexedModelFiles.length === 0 && indexedMotionFiles.length === 0) {
        updateStatus(STATUS_MISSING);
        return;
      }
      updateStatus(`assets を検知しました: PMX ${indexedModelFiles.length}件 / VMD ${indexedMotionFiles.length}件`);
    };

    sourceInput.addEventListener("change", () => {
      cachedAssetsFiles = Array.from(sourceInput.files || []);
      scan();
    });

    openAssetsButton.addEventListener("click", () => {
      sourceInput.click();
    });

    rescanButton.addEventListener("click", () => {
      if (cachedAssetsFiles.length === 0) {
        updateStatus("先に assets フォルダを設定してください。");
        return;
      }
      scan();
    });

    updateStatus(STATUS_DEFAULT);
    forceHideLegacyModelUi();
    renderIndexed();
  };

  const appRoot = document.querySelector("#app");
  if (appRoot) {
    const appObserver = new MutationObserver(() => {
      enforcePanelOrder();
      forceHideLegacyModelUi();
      forceHideLegacyMotionUi();
      setupIfReady();
    });
    appObserver.observe(appRoot, { childList: true, subtree: true });
  }

  window.addEventListener("DOMContentLoaded", () => {
    setupIfReady();
  });
})();
