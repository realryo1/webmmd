import { SceneLoader, FileTools, Vector3, Quaternion } from "@babylonjs/core";
import { MmdRuntime, MmdPhysics, VmdLoader } from "babylon-mmd";

export class MmdManager {
  scene = null;
  camera = null;
  physicsPlugin = null;
  
  mmdRuntime = null;
  deployedModels = new Map(); // id -> { id, mesh, mmdModel, name, motions: Map, shadowEnabled: bool, audio: Audio }
  activeModelId = null;
  _modelIdCounter = 0;

  activeCameraMotion = null;
  fileMap = new Map(); // relativePath -> blobUrl
  
  constructor(scene, camera, physicsPlugin) {
    this.scene = scene;
    this.camera = camera;
    this.physicsPlugin = physicsPlugin;

    // MmdRuntimeの初期化
    const mmdPhysics = new MmdPhysics(scene);
    this.mmdRuntime = new MmdRuntime(scene, mmdPhysics);
    this.mmdRuntime.register(scene);


    // 音声同期用オブザーバーの登録
    this.scene.onBeforeRenderObservable.add(() => {
      const runtimeTime = this.mmdRuntime.currentTime;
      const isPlaying = this.mmdRuntime.isAnimationPlaying;

      for (const model of this.deployedModels.values()) {
        if (model.audio) {
          model.audio.loop = true;

          // 再生状態の同期
          if (isPlaying && model.audio.paused) {
            model.audio.play().catch(e => {
              console.warn("Audio play blocked:", e);
            });
          } else if (!isPlaying && !model.audio.paused) {
            model.audio.pause();
          }

          // 時間の同期（0.15秒以上のズレがあれば同期補正）
          const diff = Math.abs(model.audio.currentTime - runtimeTime);
          if (diff > 0.15) {
            model.audio.currentTime = runtimeTime;
          }
        }
      }
    });
  }

  // ファイルをマップに追加（相対パス -> { blobUrl, file }）
  addFiles(files) {
    for (const file of files) {
      const path = file.webkitRelativePath || file.path || file.name;
      const cleanPath = path.replace(/\\/g, "/").toLowerCase();
      
      // 既存のURLがあれば解放
      if (this.fileMap.has(cleanPath)) {
        URL.revokeObjectURL(this.fileMap.get(cleanPath).blobUrl);
      }
      
      const blob = file instanceof File ? file : file.blob;
      const blobUrl = URL.createObjectURL(blob);
      this.fileMap.set(cleanPath, { blobUrl, file });
    }
  }

  resolvePath(url) {
    let cleanUrl = url;
    try {
      // 日本語（エンコード済み文字）やスペースをデコードする
      cleanUrl = decodeURIComponent(cleanUrl);
    } catch(e) {
      // URIデコードに失敗した場合はそのまま
    }
    cleanUrl = cleanUrl.replace(/\\/g, "/").toLowerCase();
    
    // "blob:https://..." や "http://..." のスキーマを除去
    cleanUrl = cleanUrl.replace(/^blob:/, "").replace(/^https?:\/\/[^\/]+/, "");
    
    // パスをセグメントに分割し、空要素や "." を除去する
    const urlSegments = cleanUrl.split("/").filter(s => s && s !== ".");
    if (urlSegments.length === 0) return null;

    // 1. 各ファイルキーに対してインテリジェントにセグメント比較を行う
    for (const [key, entry] of this.fileMap.entries()) {
      const keySegments = key.split("/").filter(s => s && s !== ".");
      
      let match = true;
      let urlIdx = urlSegments.length - 1;
      let keyIdx = keySegments.length - 1;
      
      while (urlIdx >= 0 && keyIdx >= 0) {
        const uSeg = urlSegments[urlIdx];
        const kSeg = keySegments[keyIdx];
        
        // ".." の場合は親ディレクトリを1つスキップする
        if (uSeg === "..") {
          urlIdx--;
          keyIdx--;
          continue;
        }
        
        if (uSeg !== kSeg) {
          match = false;
          break;
        }
        urlIdx--;
        keyIdx--;
      }
      
      // すべての urlSegments が keySegments の末尾に正しく一致した場合にマッチとする
      if (match && urlIdx < 0) {
        return entry.blobUrl;
      }
    }

    // 2. 最後のフォールバックとして、ファイル名単体での一致を見る
    const urlFileName = urlSegments[urlSegments.length - 1];
    for (const [key, entry] of this.fileMap.entries()) {
      const keySegments = key.split("/").filter(s => s && s !== ".");
      const keyFileName = keySegments[keySegments.length - 1];
      if (keyFileName === urlFileName) {
        return entry.blobUrl;
      }
    }
    return null;
  }

  // ロード処理中のリクエストURLをフックしてBlob URLを解決するラッパー
  async wrapLoading(action) {
    const original = FileTools.PreprocessUrl;
    FileTools.PreprocessUrl = (url) => {
      const resolved = this.resolvePath(url);
      return resolved ? resolved : original(url);
    };
    try {
      return await action();
    } finally {
      FileTools.PreprocessUrl = original;
    }
  }

  async loadModel(pmxFileName, zipName = null) {
    let cleanPath = pmxFileName.replace(/\\/g, "/").toLowerCase();
    let entry = this.fileMap.get(cleanPath);
    if (!entry) {
      // 部分一致で検索
      for (const [key, e] of this.fileMap.entries()) {
        if (key.endsWith("/" + cleanPath) || cleanPath.endsWith("/" + key)) {
          entry = e;
          break;
        }
      }
    }

    if (!entry) {
      throw new Error(`Model file ${pmxFileName} not found in uploaded assets.`);
    }

    // ReferenceFileResolver による解決をバイパスし、PreprocessUrl フックを用いてテクスチャ等を完全に解決する
    const pmxBlobUrl = entry.blobUrl;
    const mmdMesh = await this.wrapLoading(async () => {
      return await SceneLoader.ImportMeshAsync("", "", pmxBlobUrl, this.scene, null, ".pmx");
    });

    const mesh = mmdMesh.meshes[0];
    
    // 複数追加時に重ならないよう、モデル数に応じて初期位置をX軸方向にずらす (例: 6.0 ずつ)
    const initialX = this.deployedModels.size * 6.0;
    mesh.position.set(initialX, 0, 0);

    // シャドウジェネレーターにメッシュを追加
    const shadowGenerator = this.scene.lights.find(l => l.name === "dirLight")?._shadowGenerator;
    if (shadowGenerator) {
      shadowGenerator.addShadowCaster(mesh, true);
    }

    // MmdRuntimeにモデルを登録
    const mmdModel = this.mmdRuntime.createMmdModel(mesh);
    mmdModel.physicsEnabled = true;

    const id = "model_" + (this._modelIdCounter++);
    this.deployedModels.set(id, {
      id,
      mesh,
      mmdModel,
      name: pmxFileName,
      zipName: zipName,
      motions: new Map(),
      shadowEnabled: true,
      audio: null
    });
    this.activeModelId = id;

    return { id, mesh, mmdModel };
  }

  async loadMotion(vmdFileName, modelId = this.activeModelId) {
    const model = this.deployedModels.get(modelId);
    if (!model) {
      throw new Error("No active model or target model not found to load motion.");
    }

    const vmdBlobUrl = this.resolvePath(vmdFileName);
    if (!vmdBlobUrl) {
      throw new Error(`Motion file ${vmdFileName} not found.`);
    }

    const vmdLoader = new VmdLoader(this.scene);
    const animation = await this.wrapLoading(async () => {
      return await vmdLoader.loadAsync(vmdFileName, vmdBlobUrl);
    });

    model.mmdModel.addAnimation(animation);
    model.mmdModel.setAnimation(vmdFileName);
    model.motions.set(vmdFileName, animation);

    // 同名音声ファイル（.wav / .mp3）の検索とロード
    const lastSlash = vmdFileName.lastIndexOf("/");
    const fileNameOnly = lastSlash !== -1 ? vmdFileName.substring(lastSlash + 1) : vmdFileName;
    const dotIdx = fileNameOnly.lastIndexOf(".");
    const baseName = dotIdx !== -1 ? fileNameOnly.substring(0, dotIdx) : fileNameOnly;
    const lowerBase = baseName.toLowerCase();

    let audioBlobUrl = null;
    for (const [key, entry] of this.fileMap.entries()) {
      const kLastSlash = key.lastIndexOf("/");
      const kFileName = kLastSlash !== -1 ? key.substring(kLastSlash + 1) : key;
      const kDotIdx = kFileName.lastIndexOf(".");
      if (kDotIdx !== -1) {
        const keyBase = kFileName.substring(0, kDotIdx);
        const keyExt = kFileName.substring(kDotIdx);
        if (keyBase === lowerBase && (keyExt === ".wav" || keyExt === ".mp3")) {
          audioBlobUrl = entry.blobUrl;
          break;
        }
      }
    }

    if (audioBlobUrl) {
      if (model.audio) {
        model.audio.pause();
        model.audio = null;
      }
      model.audio = new Audio(audioBlobUrl);
      model.audio.loop = true;
      // 初期シーク
      model.audio.currentTime = this.mmdRuntime.currentTime;
      if (this.mmdRuntime.isAnimationPlaying) {
        model.audio.play().catch(e => console.warn(e));
      }
    }
  }

  async loadCameraMotion(vmdFileName) {
    const vmdBlobUrl = this.resolvePath(vmdFileName);
    if (!vmdBlobUrl) {
      throw new Error(`Camera motion file ${vmdFileName} not found.`);
    }

    const vmdLoader = new VmdLoader(this.scene);
    const cameraAnimation = await this.wrapLoading(async () => {
      return await vmdLoader.loadAsync(vmdFileName, vmdBlobUrl);
    });

    this.activeCameraMotion = cameraAnimation;
    const mmdCamera = this.mmdRuntime.camera;
    if (mmdCamera) {
      const handle = mmdCamera.createRuntimeAnimation(cameraAnimation);
      mmdCamera.setRuntimeAnimation(handle);
    }
  }

  get isPlaying() {
    return this.mmdRuntime.isAnimationPlaying;
  }

  play() {
    this.mmdRuntime.playAnimation();
    for (const model of this.deployedModels.values()) {
      if (model.audio) {
        model.audio.play().catch(e => console.warn(e));
      }
    }
  }

  pause() {
    this.mmdRuntime.pauseAnimation();
    for (const model of this.deployedModels.values()) {
      if (model.audio) {
        model.audio.pause();
      }
    }
  }

  reset() {
    this.mmdRuntime.seekAnimation(0);
    const isPlaying = this.mmdRuntime.isAnimationPlaying;
    for (const model of this.deployedModels.values()) {
      if (model.audio) {
        model.audio.currentTime = 0;
        if (!isPlaying) {
          model.audio.pause();
        }
      }
      if (!isPlaying) {
        if (model.mmdModel && model.mmdModel.mesh.skeleton) {
          model.mmdModel.mesh.skeleton.returnToRestPose();
        }
      }
    }
  }


  removeMotion(vmdFileName, modelId = this.activeModelId) {
    const model = this.deployedModels.get(modelId);
    if (model && model.motions.has(vmdFileName)) {
      const index = model.mmdModel.runtimeAnimations.findIndex(
        anim => anim.animation.name === vmdFileName
      );
      if (index !== -1) {
        model.mmdModel.removeAnimation(index);
      }
      model.motions.delete(vmdFileName);
    }
  }

  removeCameraMotion() {
    const mmdCamera = this.mmdRuntime.camera;
    if (mmdCamera) {
      mmdCamera.setRuntimeAnimation(null);
    }
    this.activeCameraMotion = null;
  }

  removeModel(modelId) {
    const model = this.deployedModels.get(modelId);
    if (model) {
      if (model.audio) {
        model.audio.pause();
        model.audio = null;
      }
      this.mmdRuntime.destroyMmdModel(model.mmdModel);
      model.mesh.dispose();
      this.deployedModels.delete(modelId);
      if (this.activeModelId === modelId) {
        const keys = Array.from(this.deployedModels.keys());
        this.activeModelId = keys.length > 0 ? keys[0] : null;
      }
    }
  }

  setModelPosition(modelId, x, y, z) {
    const model = this.deployedModels.get(modelId);
    if (model) {
      model.mesh.position.set(x, y, z);
    }
  }

  setModelRotation(modelId, xDeg, yDeg, zDeg) {
    const model = this.deployedModels.get(modelId);
    if (model) {
      const xRad = (xDeg * Math.PI) / 180;
      const yRad = (yDeg * Math.PI) / 180;
      const zRad = (zDeg * Math.PI) / 180;
      if (model.mesh.rotationQuaternion) {
        model.mesh.rotationQuaternion = Quaternion.RotationYawPitchRoll(yRad, xRad, zRad);
      } else {
        model.mesh.rotation.set(xRad, yRad, zRad);
      }
    }
  }

  setModelShadowEnabled(modelId, enabled) {
    const model = this.deployedModels.get(modelId);
    if (model) {
      model.shadowEnabled = enabled;
      const shadowGenerator = this.scene.lights.find(l => l.name === "dirLight")?._shadowGenerator;
      if (shadowGenerator) {
        if (enabled) {
          shadowGenerator.addShadowCaster(model.mesh, true);
        } else {
          shadowGenerator.removeShadowCaster(model.mesh);
        }
      }
    }
  }

  clearDeployedModels() {
    for (const model of this.deployedModels.values()) {
      if (model.audio) {
        model.audio.pause();
        model.audio = null;
      }
      this.mmdRuntime.destroyMmdModel(model.mmdModel);
      model.mesh.dispose();
    }
    this.deployedModels.clear();
    this.activeModelId = null;
    this.removeCameraMotion();
  }

  clear() {
    for (const model of this.deployedModels.values()) {
      if (model.audio) {
        model.audio.pause();
        model.audio = null;
      }
      this.mmdRuntime.destroyMmdModel(model.mmdModel);
      model.mesh.dispose();
    }
    this.deployedModels.clear();
    this.activeModelId = null;
    this.removeCameraMotion();
    
    // Blob URLを解放してメモリリークを防ぐ
    for (const entry of this.fileMap.values()) {
      URL.revokeObjectURL(entry.blobUrl);
    }
    this.fileMap.clear();
  }
}
