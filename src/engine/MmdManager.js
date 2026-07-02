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

          // 再生速度微調整（playbackRate）による同期
          if (isPlaying && !model.audio.paused) {
            // Safariでのロード・デコード待ちのフリーズを防ぐため、
            // readyStateが 2 (HAVE_CURRENT_DATA) 未満の場合は同期処理を行わない
            if (model.audio.readyState < 2) {
              continue;
            }

            const audioTime = model.audio.currentTime;
            const diff = runtimeTime - audioTime; // 正なら音声が遅れている、負なら音声が進んでいる

            // ロード直後のズレに対応するため、強制シークのしきい値を 2.0 秒に緩和
            if (Math.abs(diff) > 2.0) {
              model.audio.currentTime = runtimeTime;
              model.audio.playbackRate = 1.0;
            } else if (diff > 0.05) {
              // 音声が遅れている -> 再生速度を1.02倍にする
              model.audio.playbackRate = 1.02;
            } else if (diff < -0.05) {
              // 音声が進んでいる -> 再生速度を0.98倍にする
              model.audio.playbackRate = 0.98;
            } else if (Math.abs(diff) <= 0.02) {
              // ズレがほぼない -> 等倍再生に戻す
              model.audio.playbackRate = 1.0;
            }
          } else {
            // 停止時は等倍に戻す
            model.audio.playbackRate = 1.0;
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

    // 物理パラメータの自動最適化 (揺れもの、除外フィルター等)
    this._optimizeModelPhysicsMetadata(mesh);

    // MmdRuntimeにモデルを登録 (物理初期化バグを防ぐため、一度無効化したのちレストポーズで初期化)
    const mmdModel = this.mmdRuntime.createMmdModel(mesh);
    mmdModel.physicsEnabled = false;
    if (mesh.skeleton) {
      mesh.skeleton.returnToRestPose();
    }
    mesh.computeWorldMatrix(true);
    mmdModel.initializePhysics();
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

    // 既存のすべてのモーションと音声を解除する
    if (model.audio) {
      model.audio.pause();
      model.audio = null;
    }
    for (const key of Array.from(model.motions.keys())) {
      this.removeMotion(key, modelId);
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

  unlockAudios() {
    for (const model of this.deployedModels.values()) {
      if (model.audio) {
        // Safari等の自動再生制限を解除するためのダミー再生
        model.audio.play()
          .then(() => {
            if (!this.mmdRuntime.isAnimationPlaying) {
              model.audio.pause();
            }
          })
          .catch(e => console.warn("Failed to unlock audio:", e));
      }
    }
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
        if (model.mmdModel) {
          // 初期姿勢（Tポーズ）での物理リセット
          model.mmdModel.physicsEnabled = false;
          if (model.mmdModel.mesh.skeleton) {
            model.mmdModel.mesh.skeleton.returnToRestPose();
          }
          model.mmdModel.mesh.computeWorldMatrix(true);
          model.mmdModel.initializePhysics();
          model.mmdModel.physicsEnabled = true;
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

  // PMXメタデータ（剛体・ジョイント）を走査して自動最適化する
  _optimizeModelPhysicsMetadata(mesh) {
    if (!mesh.metadata || !mesh.metadata.rigidBodies) return;

    const rigidBodies = mesh.metadata.rigidBodies;
    const joints = mesh.metadata.joints || [];
    const bones = mesh.skeleton ? mesh.skeleton.bones : [];

    // 除外する不要な物理剛体のキーワード
    const ignoreKeywords = ["下着", "パンツ", "インナー", "アンダーウェア", "pants", "underwear", "inner"];

    // 揺れもののキーワード
    const hairKeywords = ["髪", "ヘア", "hair", "ツインテ", "ポニテ", "前髪", "横髪", "後髪", "アホ毛", "サイド", "バック", "テール"];
    const breastKeywords = ["胸", "おっぱい", "乳", "bust", "breast", "ちち"];
    const skirtKeywords = ["スカート", "skirt", "裾", "フリル", "プリーツ"];
    const accessoryKeywords = ["リボン", "ribbon", "袖", "sleeve", "紐", "ひも", "帯", "飾り", "羽", "ウイング", "wing", "しっぽ", "尻尾", "tail"];

    // 1. 剛体 (RigidBody) の最適化
    for (let i = 0; i < rigidBodies.length; ++i) {
      const rb = rigidBodies[i];
      const bone = bones[rb.boneIndex];
      const boneName = bone ? (bone.name || "") : "";
      const rbName = rb.name || "";
      const targetName = (rbName + "_" + boneName).toLowerCase();

      // 不要物理の除外 (FollowBoneにして衝突対象から外す)
      const shouldIgnore = ignoreKeywords.some(kw => targetName.includes(kw));
      if (shouldIgnore) {
        rb.physicsMode = 0; // FollowBone
        rb.collisionMask = 0; // 他のものと衝突させない
        continue;
      }

      const isHair = hairKeywords.some(kw => targetName.includes(kw));
      const isBreast = breastKeywords.some(kw => targetName.includes(kw));
      const isSkirt = skirtKeywords.some(kw => targetName.includes(kw));
      const isAccessory = accessoryKeywords.some(kw => targetName.includes(kw));

      if (isHair || isBreast || isSkirt || isAccessory) {
        // 質量 (mass) の補正: 小さすぎると他剛体との衝突で投げられて伸びる
        if (isBreast) {
          rb.mass = Math.max(rb.mass, 0.8);
          rb.repulsion = 0.02; // 胸は反発をほぼゼロにする
          rb.friction = Math.max(rb.friction, 0.8); // 摩擦高め
        } else if (isHair) {
          rb.mass = Math.max(rb.mass, 0.4);
          rb.repulsion = 0.05;
          rb.friction = Math.max(rb.friction, 0.5);
        } else if (isSkirt) {
          rb.mass = Math.max(rb.mass, 0.6);
          rb.repulsion = 0.05;
          rb.friction = Math.max(rb.friction, 0.6);
        } else {
          rb.mass = Math.max(rb.mass, 0.3);
          rb.repulsion = 0.05;
          rb.friction = Math.max(rb.friction, 0.5);
        }

        // 減衰 (damping) の補正: ブンブン揺れ続けるのを防ぐ
        rb.linearDamping = Math.max(rb.linearDamping, 0.15);
        // 角速度ダンピングを少し高めにして安定させる (fps 60換算)
        rb.angularDamping = Math.max(rb.angularDamping, 0.25);
      }
    }

    // 2. ジョイント (Joint) の回転制限の最適化 (ねじれやポリゴンの引き伸ばし防止)
    for (let i = 0; i < joints.length; ++i) {
      const joint = joints[i];
      const rbA = rigidBodies[joint.rigidbodyIndexA];
      const rbB = rigidBodies[joint.rigidbodyIndexB];
      if (!rbA || !rbB) continue;

      const boneA = bones[rbA.boneIndex];
      const boneB = bones[rbB.boneIndex];
      const boneAName = boneA ? (boneA.name || "") : "";
      const boneBName = boneB ? (boneB.name || "") : "";
      const nameConcat = (joint.name + "_" + rbA.name + "_" + rbB.name + "_" + boneAName + "_" + boneBName).toLowerCase();

      const isHairJoint = hairKeywords.some(kw => nameConcat.includes(kw));
      const isBreastJoint = breastKeywords.some(kw => nameConcat.includes(kw));
      const isSkirtJoint = skirtKeywords.some(kw => nameConcat.includes(kw));
      const isAccessoryJoint = accessoryKeywords.some(kw => nameConcat.includes(kw));

      if (isHairJoint || isBreastJoint || isSkirtJoint || isAccessoryJoint) {
        // 回転制限 (ラジアン)
        // X軸は ±20度程度 (0.35 rad)
        // Y, Z軸は ±8度程度 (0.14 rad) でねじれを制限
        let xLimit = 20 * Math.PI / 180;
        let yzLimit = 8 * Math.PI / 180;

        if (isBreastJoint) {
          xLimit = 10 * Math.PI / 180; // 胸はかなり狭く
          yzLimit = 5 * Math.PI / 180;
        } else if (isSkirtJoint) {
          xLimit = 25 * Math.PI / 180;
          yzLimit = 10 * Math.PI / 180;
        }

        // X軸クランプ
        joint.rotationMin[0] = Math.max(joint.rotationMin[0], -xLimit);
        joint.rotationMax[0] = Math.min(joint.rotationMax[0], xLimit);

        // Y軸クランプ
        joint.rotationMin[1] = Math.max(joint.rotationMin[1], -yzLimit);
        joint.rotationMax[1] = Math.min(joint.rotationMax[1], yzLimit);

        // Z軸クランプ
        joint.rotationMin[2] = Math.max(joint.rotationMin[2], -yzLimit);
        joint.rotationMax[2] = Math.min(joint.rotationMax[2], yzLimit);
      }
    }
  }

  getMorphTargets(modelId) {
    const model = this.deployedModels.get(modelId);
    if (!model || !model.mmdModel || !model.mmdModel.morph) return [];
    
    const targets = [];
    const morphs = model.mmdModel.morph.morphs;
    for (let i = 0; i < morphs.length; i++) {
      const morph = morphs[i];
      const weight = model.mmdModel.morph.getMorphWeightFromIndex(i);
      targets.push({ name: morph.name, value: weight, index: i });
    }
    return targets;
  }

  setMorphValue(modelId, morphName, value) {
    const model = this.deployedModels.get(modelId);
    if (!model || !model.mmdModel || !model.mmdModel.morph) return;

    model.mmdModel.morph.setMorphWeight(morphName, value);
  }
}

