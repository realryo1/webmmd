import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { FileToolsOptions } from "@babylonjs/core/Misc/fileTools";
import { RegisterPmxLoader } from "babylon-mmd/esm/Loader/pmxLoader.pure";
import { RegisterMmdRuntimeModelAnimation } from "babylon-mmd/esm/Runtime/Animation/mmdRuntimeModelAnimation.pure";
import { RegisterMmdRuntimeCameraAnimation } from "babylon-mmd/esm/Runtime/Animation/mmdRuntimeCameraAnimation.pure";
import { MmdStandardMaterialBuilder } from "babylon-mmd/esm/Loader/mmdStandardMaterialBuilder";
import { MmdStandardMaterialProxy } from "babylon-mmd/esm/Runtime/mmdStandardMaterialProxy";
import { MmdRuntime } from "babylon-mmd/esm/Runtime/mmdRuntime";
import { MmdPhysics } from "babylon-mmd/esm/Runtime/Physics/mmdPhysics";
import { MmdCamera } from "babylon-mmd/esm/Runtime/mmdCamera.pure";
import { VmdLoader } from "babylon-mmd/esm/Loader/vmdLoader";
import { MmdPbrMaterialBuilder } from "./materials/MmdPbrMaterialBuilder";

// babylon-mmd 1.3 ツリーシェイク対応API: 各種ローダー/ランタイムアニメーションの副作用登録
RegisterPmxLoader();
RegisterMmdRuntimeModelAnimation();
RegisterMmdRuntimeCameraAnimation();

// 1x1透明PNGのBase64データからBlob URLを生成するヘルパー
const DUMMY_PNG_DATA = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
let dummyBlobUrl = null;
function getDummyBlobUrl() {
  if (!dummyBlobUrl && typeof window !== "undefined") {
    try {
      const byteString = atob(DUMMY_PNG_DATA.split(',')[1]);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ab], { type: 'image/png' });
      dummyBlobUrl = URL.createObjectURL(blob);
    } catch (e) {
      console.warn("Failed to create dummy texture blob", e);
    }
  }
  return dummyBlobUrl;
}

// 除外する不要な物理剛体のキーワード
const IGNORE_KEYWORDS = ["下着", "パンツ", "インナー", "アンダーウェア", "pants", "underwear", "inner"];

// 体幹・基幹ボーンのキーワード
const BODY_BASE_KEYWORDS = ["センター", "グルーブ", "腰", "骨盤", "下半身", "上半身", "首", "頭", "親", "体", "center", "groove", "waist", "pelvis", "lower body", "upper body", "neck", "head", "root", "spine", "hip", "torso", "body"];

// 揺れもののキーワード
const HAIR_KEYWORDS = ["髪", "ヘア", "hair", "ツインテ", "ポニテ", "前髪", "横髪", "後髪", "アホ毛", "サイド", "バック", "テール"];
const BREAST_KEYWORDS = ["胸", "おっぱい", "乳", "bust", "breast", "ちち"];
const SKIRT_KEYWORDS = ["スカート", "skirt", "裾", "フリル", "プリーツ"];
const ACCESSORY_KEYWORDS = ["リボン", "ribbon", "袖", "sleeve", "紐", "ひも", "帯", "飾り", "羽", "ウイング", "wing", "しっぽ", "尻尾", "tail"];

export class MmdManager {
  scene = null;
  camera = null; // デスクトップ用 ArcRotateCamera
  physicsPlugin = null;
  mmdPhysics = null;
  renderingManager = null;

  mmdRuntime = null;
  mmdCamera = null; // MMDカメラモーション再生用

  deployedModels = new Map(); // id -> { id, mesh, mmdModel, name, zipName, motions: Map, audio, userMorphOverrides, assetContainer, runtimeAnimationHandles }
  activeModelId = null;
  _modelIdCounter = 0;

  activeCameraMotion = null;
  cameraHandle = null;
  fileMap = new Map(); // relativePath -> { blobUrl, file }

  materialMode = "standard"; // "standard" | "pbr"
  keywordPresetsEnabled = false;
  _standardMaterialBuilder = null;
  _pbrMaterialBuilder = null;

  breastPhysicsEnabled = true;
  breastPhysicsInertia = 1.0;
  physicsDisableGlobally = false;
  loopEnabled = false;
  boneLogEnabled = false;

  constructor(scene, camera, physicsPlugin, renderingManager = null) {
    this.scene = scene;
    this.camera = camera;
    this.physicsPlugin = physicsPlugin;
    this.renderingManager = renderingManager;

    // MmdRuntimeの初期化
    const mmdPhysics = new MmdPhysics(scene);
    this.mmdPhysics = mmdPhysics;
    this.mmdRuntime = new MmdRuntime(scene, mmdPhysics);
    this.mmdRuntime.register(scene);

    // MMDカメラモーション再生用のMmdCameraを生成しランタイムに登録
    this.mmdCamera = new MmdCamera("mmdCamera", new Vector3(0, 10, 0), scene);
    this.mmdRuntime.addAnimatable(this.mmdCamera);

    // マテリアルビルダー（共有インスタンス）を準備
    this._standardMaterialBuilder = new MmdStandardMaterialBuilder();
    // トゥーンエッジ（アウトライン）の適用を無効化
    this._standardMaterialBuilder.loadOutlineRenderingProperties = () => {};
    this._pbrMaterialBuilder = new MmdPbrMaterialBuilder();

    // 描画 FPS 非依存の 60Hz 固定ステップを適用
    this._applyPhysicsTimestep();

    // 音声同期用オブザーバーの登録
    this.scene.onBeforeRenderObservable.add(() => {
      const runtimeTime = this.mmdRuntime.currentTime;
      const isPlaying = this.mmdRuntime.isAnimationPlaying;

      // モーションループ再生の処理
      if (this.loopEnabled && !isPlaying) {
        const duration = this.mmdRuntime.animationFrameTimeDuration;
        const currentFrame = this.mmdRuntime.currentFrameTime;
        if (duration > 0 && currentFrame >= duration) {
          this.reset();
          this.play();
          return;
        }
      }

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

    // スペースキー押下時のダンプリスナ登録
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", (e) => {
        if (e.key === " " || e.code === "Space") {
          setTimeout(() => {
            if (this.boneLogEnabled) {
              this.dumpCurrentPoseAndMotion();
            }
          }, 100);
        }
      });
    }
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

    const urlFileName = urlSegments[urlSegments.length - 1];

    const getBaseName = (name) => {
      const idx = name.lastIndexOf('.');
      return idx === -1 ? name : name.substring(0, idx);
    };

    const isNonImageExt = (name) => {
      const ext = name.split('.').pop()?.toLowerCase();
      return ext === 'sai' || ext === 'psd' || ext === 'txt' || ext === 'zip';
    };

    const urlBaseName = getBaseName(urlFileName);
    let bestMatchEntry = null;
    let maxScore = -9999;
    let isExactMatchFound = false;

    for (const [key, entry] of this.fileMap.entries()) {
      const keySegments = key.split("/").filter(s => s && s !== ".");
      if (keySegments.length === 0) continue;

      const keyFileName = keySegments[keySegments.length - 1];
      const keyBaseName = getBaseName(keyFileName);

      const isExact = (keyFileName === urlFileName);
      const isBaseMatch = (keyBaseName === urlBaseName);

      if (!isExact && !isBaseMatch) continue;

      // 既に完全一致が見つかっているのに、ベース名一致（曖昧一致）のキーを処理しようとしている場合はスキップ
      if (isExactMatchFound && !isExact) continue;

      // フォルダ構造のスコア計算
      let score = 0;
      let urlIdx = urlSegments.length - 1;
      let keyIdx = keySegments.length - 1;

      while (urlIdx >= 0 && keyIdx >= 0) {
        const uSeg = urlSegments[urlIdx];
        const kSeg = keySegments[keyIdx];

        if (uSeg === "..") {
          urlIdx--;
          keyIdx--;
          continue;
        }

        // 最後の要素（ファイル名）の比較は、完全一致かベース名一致かで分ける
        if (urlIdx === urlSegments.length - 1) {
          if (isExact || isBaseMatch) {
            score++;
          } else {
            break;
          }
        } else {
          if (uSeg === kSeg) {
            score++;
          } else {
            break;
          }
        }
        urlIdx--;
        keyIdx--;
      }

      // 非画像拡張子（.sai 等）の場合は、スコアを大幅に低く見積もる
      let finalScore = score;
      if (isNonImageExt(keyFileName)) {
        finalScore -= 100;
      }

      // 完全一致が見つかったら、これまでの曖昧一致の結果をクリアして完全一致を最優先する
      if (isExact && !isExactMatchFound) {
        isExactMatchFound = true;
        maxScore = finalScore;
        bestMatchEntry = entry;
      } else if (finalScore > maxScore) {
        maxScore = finalScore;
        bestMatchEntry = entry;
      }
    }

    if (bestMatchEntry) {
      return bestMatchEntry.blobUrl;
    }

    // 解決に失敗したテクスチャに対しては、ダミーの1x1透明画像を返してエラーを回避する
    if (urlFileName) {
      const ext = urlFileName.split('.').pop()?.toLowerCase();
      const textureExts = ['png', 'jpg', 'jpeg', 'bmp', 'tga', 'spa', 'sph', 'gif', 'dds'];
      if (textureExts.includes(ext)) {
        const dummy = getDummyBlobUrl();
        if (dummy) return dummy;
      }
    }

    return null;
  }

  // ロード処理中のリクエストURLをフックしてBlob URLを解決するラッパー
  // babylon-mmd 1.3 では FileTools.PreprocessUrl ではなく FileToolsOptions.PreprocessUrl を差し替える
  async wrapLoading(action) {
    const original = FileToolsOptions.PreprocessUrl;
    FileToolsOptions.PreprocessUrl = (url) => {
      const resolved = this.resolvePath(url);
      return resolved ? resolved : original(url);
    };
    try {
      return await action();
    } finally {
      FileToolsOptions.PreprocessUrl = original;
    }
  }

  // materialMode に応じた共有マテリアルビルダーを返す
  _getMaterialBuilder() {
    return this.materialMode === "pbr" ? this._pbrMaterialBuilder : this._standardMaterialBuilder;
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
    const materialBuilder = this._getMaterialBuilder();

    const container = await this.wrapLoading(async () => {
      return await LoadAssetContainerAsync(pmxBlobUrl, this.scene, {
        pluginExtension: ".pmx",
        pluginOptions: {
          mmdmodel: {
            materialBuilder
          }
        }
      });
    });

    container.addAllToScene();
    const mesh = container.meshes[0];

    // 複数追加時に重ならないよう、モデル数に応じて初期位置をX軸方向にずらす (例: 6.0 ずつ)
    const initialX = this.deployedModels.size * 6.0;
    mesh.position.set(initialX, 0, 0);

    // モデルのスケールは常に等倍（1.0）
    mesh.scaling.set(1.0, 1.0, 1.0);

    // トゥーンエッジ（アウトライン）を全マテリアルで無効化
    this._disableModelOutlines(mesh);

    // 描画マネージャ経由でシャドウキャスタ・受影を設定
    if (this.renderingManager) {
      this.renderingManager.addShadowCaster(mesh, true);
      this.renderingManager.enableReceiveShadows(mesh);
    }

    // 物理パラメータの自動最適化 (揺れもの、除外フィルター等)
    this._optimizeModelPhysicsMetadata(mesh);

    // つま先IKの変形階層不整合を自動修正
    if (mesh.metadata && mesh.metadata.bones) {
      const bonesMetadata = mesh.metadata.bones;
      const leftLegIk = bonesMetadata.find(b => b.name === "左足ＩＫ");
      const rightLegIk = bonesMetadata.find(b => b.name === "右足ＩＫ");
      const leftToeIk = bonesMetadata.find(b => b.name === "左つま先ＩＫ");
      const rightToeIk = bonesMetadata.find(b => b.name === "右つま先ＩＫ");

      if (leftLegIk && leftToeIk && leftToeIk.transformOrder <= leftLegIk.transformOrder) {
        console.log(`%c[MMD Fix] Correcting transformOrder for 左つま先ＩＫ (from ${leftToeIk.transformOrder} to ${leftLegIk.transformOrder + 1})`, "color: #FF9800; font-weight: bold;");
        leftToeIk.transformOrder = leftLegIk.transformOrder + 1;
      }
      if (rightLegIk && rightToeIk && rightToeIk.transformOrder <= rightLegIk.transformOrder) {
        console.log(`%c[MMD Fix] Correcting transformOrder for 右つま先ＩＫ (from ${rightToeIk.transformOrder} to ${rightLegIk.transformOrder + 1})`, "color: #FF9800; font-weight: bold;");
        rightToeIk.transformOrder = rightLegIk.transformOrder + 1;
      }
    }

    // createMmdModel の前に体幹剛体の physicsMode (物理演算モード) をメタデータ上で FollowBone (0) に書き換え
    if (mesh.metadata && mesh.metadata.rigidBodies && mesh.metadata.bones) {
      const rigidBodiesMetadata = mesh.metadata.rigidBodies;
      const bonesMetadata = mesh.metadata.bones;

      rigidBodiesMetadata.forEach(rb => {
        const bone = bonesMetadata[rb.boneIndex];
        const boneName = bone ? (bone.name || "") : "";
        const targetName = ((rb.name || "") + "_" + boneName).toLowerCase();
        const isBodyBase = BODY_BASE_KEYWORDS.some(kw => targetName.includes(kw));

        if (isBodyBase) {
          rb.physicsMode = 0; // FollowBone
          if (rb.type !== undefined) rb.type = 0;
        }
      });
    }

    // MmdRuntimeにモデルを登録
    const mmdModel = this.mmdRuntime.createMmdModel(mesh, {
      materialProxyConstructor: this.materialMode === "standard" ? MmdStandardMaterialProxy : null,
      trimMetadata: false,
      buildPhysics: true
    });

    // 物理初期化バグを防ぐため、レストポーズに戻してから物理状態を構築する
    if (mesh.skeleton) {
      mesh.skeleton.returnToRestPose();
    }
    mesh.computeWorldMatrix(true);

    this._applyRigidBodyStatesAfterCreate(mmdModel, mesh);
    this.mmdRuntime.initializeMmdModelPhysics(mmdModel);
    this._optimizeBreastPhysicsDirectly(mmdModel, mesh);
    this._optimizeBodyBasePhysicsDirectly(mmdModel, mesh);

    const id = "model_" + (this._modelIdCounter++);
    this.deployedModels.set(id, {
      id,
      mesh,
      mmdModel,
      name: pmxFileName,
      zipName: zipName,
      motions: new Map(), // name -> { animation, handle }
      audio: null,
      userMorphOverrides: new Map(),
      assetContainer: container,
      runtimeAnimationHandles: new Map() // name -> handle
    });
    this.activeModelId = id;

    // モデル読み込み時のボーン＆IK詳細ログの出力
    console.log(`%c[MMD Model Loaded] ${pmxFileName} (ID: ${id})`, "color: #4CAF50; font-weight: bold; font-size: 1.2em;");
    const bonesSource = mmdModel.runtimeBones || (mesh.skeleton ? mesh.skeleton.bones : null);
    if (this.boneLogEnabled && bonesSource) {
      console.log(` - Total Bones: ${bonesSource.length}`);

      // 最初のボーンのプロパティ構成を出力してデバッグしやすくする
      if (bonesSource.length > 0) {
        const sampleBone = bonesSource[0];
        console.log("Sample Bone Keys:", Object.keys(sampleBone));
        if (sampleBone.linkedBone) {
          console.log("Sample Linked Bone Keys:", Object.keys(sampleBone.linkedBone));
        }
      }

      const targetBoneNames = [
        "すべての親", "全ての親",
        "センター", "グルーブ", "腰",
        "下半身", "上半身", "上半身2",
        "左足", "右足", "左ひざ", "右ひざ", "左足首", "右足首",
        "左足ＩＫ", "右足ＩＫ", "左つま先ＩＫ", "右つま先ＩＫ"
      ];
      console.group(`Bone Structure Detail for ${pmxFileName}`);
      targetBoneNames.forEach(boneName => {
        const bone = bonesSource.find(b => b.name === boneName);
        if (bone) {
          // 親・祖父ボーン等を遡るヘルパー
          const getParentChain = (b) => {
            const chain = [];
            let current = b;
            for (let i = 0; i < 3; i++) {
              const p = current.parentBone || current.parent || (typeof current.getParent === "function" ? current.getParent() : null) || current.linkedBone;
              if (p && p !== current) {
                chain.push(p.name || "Unnamed");
                current = p;
              } else {
                break;
              }
            }
            return chain.length > 0 ? chain.join(" -> ") : "None";
          };

          const parentChain = getParentChain(bone);
          let localPos = "N/A";

          if (bone.linkedBone && bone.linkedBone.position) {
            localPos = bone.linkedBone.position.toString();
          } else if (bone.babylonBone && bone.babylonBone.position) {
            localPos = bone.babylonBone.position.toString();
          } else if (bone.position) {
            localPos = bone.position.toString();
          }

          const idx = bonesSource.indexOf(bone);
          const flag = bone.flag !== undefined ? bone.flag : "N/A";
          const isMovable = (typeof flag === "number") ? ((flag & 0x0004) !== 0) : "N/A";
          const order = bone.transformOrder !== undefined ? bone.transformOrder : "N/A";
          const afterPhys = bone.transformAfterPhysics !== undefined ? bone.transformAfterPhysics : "N/A";

          console.log(`Bone [${boneName}]: Index = ${idx}, Parent Chain = ${parentChain}, flag = ${flag} (Movable: ${isMovable}), transformOrder = ${order}, transformAfterPhysics = ${afterPhys}, Local Pos = ${localPos}`);
        } else {
          console.log(`Bone [${boneName}]: %cNOT FOUND`, "color: #FF5722;");
        }
      });
      console.groupEnd();
    }

    if (this.boneLogEnabled && mmdModel) {
      console.group(`IK Solver Settings for ${pmxFileName}`);
      // mmdModel.runtimeBones または内部構造から IK 情報を抽出
      if (mmdModel.runtimeBones) {
        let ikCount = 0;
        mmdModel.runtimeBones.forEach(rb => {
          if (rb.ikSolver) {
            ikCount++;
            const solver = rb.ikSolver;
            console.log(`IK Bone: [${rb.name}] -> Target: [${solver.targetBone ? solver.targetBone.name : "Unknown"}], Iterations: ${solver.iteration}, LimitAngle: ${solver.limitAngle}`);
            if (solver.links) {
              const linkNames = solver.links.map(l => l.bone ? l.bone.name : "Unknown");
              console.log(`   Links: ${linkNames.join(" -> ")}`);
            }
          }
        });
        if (ikCount === 0) {
          console.log("No IK Solvers found in runtime bones.");
        }
      } else {
        console.log("runtimeBones properties not found on mmdModel.");
      }
      console.log("Raw mmdModel object:", mmdModel);
      console.groupEnd();
    }

    return { id, mesh, mmdModel };
  }

  async loadMotion(vmdFileName, modelId = this.activeModelId) {
    const model = this.deployedModels.get(modelId);
    if (!model) {
      const available = Array.from(this.deployedModels.keys()).join(", ") || "(none)";
      throw new Error(
        `No active model or target model not found to load motion. (requested: ${modelId ?? "null"}, available: ${available})`
      );
    }

    // 既存のすべてのモーションと音声を解除する
    if (model.audio) {
      model.audio.pause();
      model.audio = null;
    }

    for (const entry of model.motions.values()) {
      const handle = entry?.handle;
      if (handle !== undefined && handle !== null) {
        model.mmdModel.destroyRuntimeAnimation(handle);
      }
    }
    model.mmdModel.setRuntimeAnimation(null);
    model.motions.clear();
    model.runtimeAnimationHandles?.clear();

    // 再生時間を0にリセット
    this.mmdRuntime.seekAnimation(0);

    // モーション由来のモーフ残存をクリアし、ユーザー手動設定のみ復元
    this._restoreUserMorphOverrides(model);

    // スケルトンを初期姿勢に戻してから物理を再構築する
    if (model.mesh.skeleton) {
      model.mesh.skeleton.returnToRestPose();
    }
    model.mesh.computeWorldMatrix(true);

    // すべてのIKソルバーの状態を 1 (有効) にリセット
    if (model.mmdModel.ikSolverStates) {
      model.mmdModel.ikSolverStates.fill(1);
    }

    this.mmdRuntime.initializeMmdModelPhysics(model.mmdModel);
    this._optimizeBreastPhysicsDirectly(model.mmdModel, model.mesh);
    this._optimizeBodyBasePhysicsDirectly(model.mmdModel, model.mesh);

    const vmdBlobUrl = this.resolvePath(vmdFileName);
    if (!vmdBlobUrl) {
      throw new Error(`Motion file ${vmdFileName} not found.`);
    }

    const vmdLoader = new VmdLoader(this.scene);
    const animation = await this.wrapLoading(async () => {
      return await vmdLoader.loadAsync(vmdFileName, vmdBlobUrl);
    });

    const handle = model.mmdModel.createRuntimeAnimation(animation);
    model.mmdModel.setRuntimeAnimation(handle);
    model.motions.set(vmdFileName, { animation, handle });
    model.runtimeAnimationHandles.set(vmdFileName, handle);

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

    // モーション読み込み時のログ出力
    console.log(`%c[MMD Motion Loaded] ${vmdFileName} for Model: ${model.name}`, "color: #2196F3; font-weight: bold; font-size: 1.2em;");
    if (this.boneLogEnabled && animation) {
      console.log("Raw Motion Object:", animation);

      const tracks = [];
      if (animation.boneTracks) tracks.push(...animation.boneTracks);
      if (animation.movableBoneTracks) tracks.push(...animation.movableBoneTracks);

      console.log(` - Motion Bone Tracks Count: ${tracks.length}`);
      const trackNames = tracks.map(b => b.name);
      console.log(" - Tracks list:", trackNames);

      // 主要なボーンアニメーションがモデルに存在するかチェック
      console.group(`Motion Bone Mapping Check for ${model.name}`);
      const importantMotionBones = ["すべての親", "全ての親", "センター", "グルーブ", "腰", "下半身", "左足ＩＫ", "右足ＩＫ"];

      const modelBones = model.mmdModel.runtimeBones || (model.mesh.skeleton ? model.mesh.skeleton.bones : []);

      importantMotionBones.forEach(boneName => {
        const hasTrack = trackNames.includes(boneName);
        const hasBone = modelBones.some(b => b.name === boneName);
        if (hasTrack) {
          if (hasBone) {
            console.log(`Track [${boneName}]: %cMapped successfully to model bone`, "color: #4CAF50;");
          } else {
            console.log(`Track [${boneName}]: %cMISSING in model (Motion exists but model doesn't have this bone)`, "color: #F44336; font-weight: bold;");
          }
        } else {
          console.log(`Track [${boneName}]: %cNot in VMD Motion`, "color: #9E9E9E;");
        }
      });
      console.groupEnd();
    }

    // _currentAnimation の内部バインドマップをダンプ
    if (this.boneLogEnabled) {
      this._dumpBindMaps(model, vmdFileName);
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

    // 既存のカメラモーションがあれば先に破棄する
    if (this.cameraHandle !== null && this.cameraHandle !== undefined) {
      this.mmdCamera.setRuntimeAnimation(null);
      this.mmdCamera.destroyRuntimeAnimation(this.cameraHandle);
      this.cameraHandle = null;
    }

    const handle = this.mmdCamera.createRuntimeAnimation(cameraAnimation);
    this.mmdCamera.setRuntimeAnimation(handle);

    this.activeCameraMotion = cameraAnimation;
    this.cameraHandle = handle;

    // MMDカメラへ切り替え（デスクトップ用ArcRotateCameraの入力制御には触れない）
    this.scene.activeCamera = this.mmdCamera;
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
          if (model.mesh.skeleton) {
            model.mesh.skeleton.returnToRestPose();
          }
          model.mesh.computeWorldMatrix(true);
          this.mmdRuntime.initializeMmdModelPhysics(model.mmdModel);
          this._optimizeBreastPhysicsDirectly(model.mmdModel, model.mesh);
          this._optimizeBodyBasePhysicsDirectly(model.mmdModel, model.mesh);
        }
      }
    }
  }

  removeMotion(vmdFileName, modelId = this.activeModelId) {
    const model = this.deployedModels.get(modelId);
    if (!model || !model.motions.has(vmdFileName)) return;

    const entry = model.motions.get(vmdFileName);
    const handle = entry?.handle;
    if (handle !== undefined && handle !== null) {
      model.mmdModel.destroyRuntimeAnimation(handle);
    }
    model.motions.delete(vmdFileName);
    model.runtimeAnimationHandles?.delete(vmdFileName);
  }

  removeCameraMotion() {
    if (this.mmdCamera) {
      this.mmdCamera.setRuntimeAnimation(null);
      if (this.cameraHandle !== null && this.cameraHandle !== undefined) {
        this.mmdCamera.destroyRuntimeAnimation(this.cameraHandle);
      }
    }
    this.cameraHandle = null;
    this.activeCameraMotion = null;

    // MMDカメラがアクティブだった場合はデスクトップ用カメラへ戻す
    if (this.scene.activeCamera === this.mmdCamera) {
      this.scene.activeCamera = this.camera;
    }
  }

  removeModel(modelId) {
    const model = this.deployedModels.get(modelId);
    if (!model) return;

    this._disposeModelEntry(model);
    this.deployedModels.delete(modelId);
    if (this.activeModelId === modelId) {
      const keys = Array.from(this.deployedModels.keys());
      this.activeModelId = keys.length > 0 ? keys[0] : null;
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

  clearDeployedModels() {
    for (const model of this.deployedModels.values()) {
      this._disposeModelEntry(model);
    }
    this.deployedModels.clear();
    this.activeModelId = null;
    this.removeCameraMotion();
  }

  setLoopEnabled(enabled) {
    this.loopEnabled = enabled;
  }

  clear() {
    this.clearDeployedModels();

    // Blob URLを解放してメモリリークを防ぐ
    for (const entry of this.fileMap.values()) {
      URL.revokeObjectURL(entry.blobUrl);
    }
    this.fileMap.clear();
  }

  /**
   * マテリアルモード（standard / pbr）を切り替える (Phase 4-b)
   *
   * 現在配置されているモデル群を一旦破棄し、選択したマテリアルビルダーで読み直す。
   * 位置・回転・モーション・モーフ・再生位置/状態はスナップショットから復元する。
   * 影キャストはロード時に常時有効。
   */
  async switchMaterialMode(mode) {
    const targetMode = mode === "pbr" ? "pbr" : "standard";
    if (targetMode === this.materialMode) return;

    const wasPlaying = this.isPlaying;
    const currentFrameTime = this.mmdRuntime.currentFrameTime;

    // 現在配置されているモデルのスナップショットを保存
    const snapshots = [];
    for (const model of this.deployedModels.values()) {
      const rotationDeg = this._getMeshRotationDeg(model.mesh);
      snapshots.push({
        name: model.name,
        zipName: model.zipName,
        position: [model.mesh.position.x, model.mesh.position.y, model.mesh.position.z],
        rotation: rotationDeg,
        motionKeys: Array.from(model.motions.keys()),
        morphs: model.userMorphOverrides ? Array.from(model.userMorphOverrides.entries()) : []
      });
    }

    this.pause();
    this.clearDeployedModels();

    this.materialMode = targetMode;
    if (this.renderingManager) {
      this.renderingManager.setMaterialMode(targetMode);
    }
    this._pbrMaterialBuilder.keywordPresetsEnabled = this.keywordPresetsEnabled;

    for (const snap of snapshots) {
      const { id } = await this.loadModel(snap.name, snap.zipName);
      this.setModelPosition(id, snap.position[0], snap.position[1], snap.position[2]);
      this.setModelRotation(id, snap.rotation[0], snap.rotation[1], snap.rotation[2]);

      for (const motionName of snap.motionKeys) {
        await this.loadMotion(motionName, id);
      }
      for (const [morphName, value] of snap.morphs) {
        this.setMorphValue(id, morphName, value);
      }
    }

    await this.mmdRuntime.seekAnimation(currentFrameTime, true);
    if (wasPlaying) {
      this.play();
    }
  }

  // メッシュの現在の回転をオイラー角（度）で取得するヘルパー
  _getMeshRotationDeg(mesh) {
    const toDeg = (rad) => (rad * 180) / Math.PI;
    if (mesh.rotationQuaternion) {
      const euler = mesh.rotationQuaternion.toEulerAngles();
      return [toDeg(euler.x), toDeg(euler.y), toDeg(euler.z)];
    }
    return [toDeg(mesh.rotation.x), toDeg(mesh.rotation.y), toDeg(mesh.rotation.z)];
  }

  // モデル1体分の全リソースを解放する共通処理
  _disposeModelEntry(model) {
    if (!model) return;

    if (model.audio) {
      model.audio.pause();
      model.audio = null;
    }

    if (model.mmdModel) {
      for (const entry of model.motions.values()) {
        const handle = entry?.handle;
        if (handle !== undefined && handle !== null) {
          model.mmdModel.destroyRuntimeAnimation(handle);
        }
      }
    }
    model.motions.clear();
    model.runtimeAnimationHandles?.clear();

    if (this.renderingManager && model.mesh) {
      this.renderingManager.removeShadowCaster(model.mesh);
    }

    if (model.mmdModel) {
      this.mmdRuntime.destroyMmdModel(model.mmdModel);
      model.mmdModel = null;
    }

    // 重要: material.dispose(true, true) は使わない。
    // forceDisposeEffect=true だと同種マテリアルが共有する Effect（シェーダ）まで破棄され、
    // 残ったモデルが真っ黒になる。forceDisposeTextures=true も同一 blob URL の
    // InternalTexture 共有時に他モデルのテクスチャを壊す。
    if (model.assetContainer) {
      try {
        model.assetContainer.removeAllFromScene();
      } catch (_) {
        // already removed
      }

      for (const mesh of [...(model.assetContainer.meshes || [])]) {
        try {
          mesh?.dispose(false, false);
        } catch (_) {
          // ignore
        }
      }
      for (const mat of [...(model.assetContainer.materials || [])]) {
        try {
          // Effect / Texture は強制破棄しない
          mat?.dispose(false, false);
        } catch (_) {
          // ignore
        }
      }
      // コンテナ参照だけ切る（dispose() 全体は内部で texture 強制破棄する実装があるため避ける）
      model.assetContainer.meshes = [];
      model.assetContainer.materials = [];
      model.assetContainer.textures = [];
      model.assetContainer.skeletons = [];
      model.assetContainer.animationGroups = [];
      model.assetContainer = null;
    } else if (model.mesh) {
      try {
        model.mesh.dispose(false, false);
      } catch (_) {
        // ignore
      }
    }

    model.mesh = null;
  }

  /** モデル配下の全マテリアルでアウトライン描画を無効化する */
  _disableModelOutlines(rootMesh) {
    const meshes = rootMesh.getChildMeshes
      ? [rootMesh, ...rootMesh.getChildMeshes(false)]
      : [rootMesh];

    for (const mesh of meshes) {
      const materials = [];
      if (mesh.material) {
        if (mesh.material.subMaterials) {
          materials.push(...mesh.material.subMaterials);
        } else {
          materials.push(mesh.material);
        }
      }
      for (const material of materials) {
        if (material && "renderOutline" in material) {
          material.renderOutline = false;
        }
      }
    }
  }

  // PMXメタデータ（剛体・ジョイント）を走査して自動最適化する
  _optimizeModelPhysicsMetadata(mesh) {
    if (!mesh.metadata || !mesh.metadata.rigidBodies) return;

    const rigidBodies = mesh.metadata.rigidBodies;
    const joints = mesh.metadata.joints || [];
    const bones = mesh.skeleton ? mesh.skeleton.bones : [];

    // 1. 剛体 (RigidBody) の最適化
    for (let i = 0; i < rigidBodies.length; ++i) {
      const rb = rigidBodies[i];
      const bone = bones[rb.boneIndex];
      const boneName = bone ? (bone.name || "") : "";
      const rbName = rb.name || "";
      const targetName = (rbName + "_" + boneName).toLowerCase();

      // 不要物理の除外 (FollowBoneにして衝突対象から外す)
      const shouldIgnore = IGNORE_KEYWORDS.some(kw => targetName.includes(kw));
      if (shouldIgnore) {
        rb.physicsMode = 0; // FollowBone
        rb.collisionMask = 0; // 他のものと衝突させない
        continue;
      }

      // 体幹・基幹ボーンの剛体は物理演算で動かさず、必ずアニメーションに追従させる (FollowBone)
      const isBodyBase = BODY_BASE_KEYWORDS.some(kw => targetName.includes(kw));
      if (isBodyBase) {
        rb.physicsMode = 0; // FollowBone
        continue;
      }

      const isHair = HAIR_KEYWORDS.some(kw => targetName.includes(kw));
      const isBreast = BREAST_KEYWORDS.some(kw => targetName.includes(kw));
      const isSkirt = SKIRT_KEYWORDS.some(kw => targetName.includes(kw));
      const isAccessory = ACCESSORY_KEYWORDS.some(kw => targetName.includes(kw));

      if (isHair || isBreast || isSkirt || isAccessory) {
        // 質量 (mass) の補正: 小さすぎると他剛体との衝突で投げられて伸びる
        if (isBreast) {
          rb.mass = Math.max(rb.mass, 1.0); // 自然な重さ
          rb.repulsion = 0.0; // 胸は反発をゼロにする
          rb.friction = Math.max(rb.friction, 0.8); // 摩擦高め
          // 他のすべての剛体との物理衝突（めり込み反発）を完全に無効化する
          rb.collisionMask = 0;
          // 自然な揺れの減衰
          rb.linearDamping = Math.max(rb.linearDamping, 0.3);
          rb.angularDamping = Math.max(rb.angularDamping, 0.3);
        } else if (isHair) {
          rb.mass = Math.max(rb.mass, 0.4);
          rb.repulsion = 0.05;
          rb.friction = Math.max(rb.friction, 0.5);
          rb.linearDamping = Math.max(rb.linearDamping, 0.15);
          rb.angularDamping = Math.max(rb.angularDamping, 0.25);
        } else if (isSkirt) {
          rb.mass = Math.max(rb.mass, 0.6);
          rb.repulsion = 0.05;
          rb.friction = Math.max(rb.friction, 0.6);
          rb.linearDamping = Math.max(rb.linearDamping, 0.15);
          rb.angularDamping = Math.max(rb.angularDamping, 0.25);
        } else {
          rb.mass = Math.max(rb.mass, 0.3);
          rb.repulsion = 0.05;
          rb.friction = Math.max(rb.friction, 0.5);
          rb.linearDamping = Math.max(rb.linearDamping, 0.15);
          rb.angularDamping = Math.max(rb.angularDamping, 0.25);
        }
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

      const isHairJoint = HAIR_KEYWORDS.some(kw => nameConcat.includes(kw));
      const isBreastJoint = BREAST_KEYWORDS.some(kw => nameConcat.includes(kw));
      const isSkirtJoint = SKIRT_KEYWORDS.some(kw => nameConcat.includes(kw));
      const isAccessoryJoint = ACCESSORY_KEYWORDS.some(kw => nameConcat.includes(kw));

      if (isHairJoint || isBreastJoint || isSkirtJoint || isAccessoryJoint) {
        // 回転制限 (ラジアン)
        // X軸は ±20度程度 (0.35 rad)
        // Y, Z軸は ±8度程度 (0.14 rad) でねじれを制限
        let xLimit = 20 * Math.PI / 180;
        let yzLimit = 8 * Math.PI / 180;

        if (isBreastJoint) {
          // 衝突が発生しないため、可動範囲を自然な値（X軸±15度、Y/Z軸±10度）に設定
          xLimit = 15 * Math.PI / 180;
          yzLimit = 10 * Math.PI / 180;
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

  /**
   * createMmdModel 直後に呼び出し、rigidBodyStates (0=キネマティック/アニメ追従, 1=物理演算) の初期値を設定する。
   * babylon-mmd 1.3 では mmdModel.physicsEnabled や _physicsModel._bodies は存在しないため、
   * 公開APIである rigidBodyStates 配列を直接操作して有効/無効を切り替える。
   */
  _applyRigidBodyStatesAfterCreate(mmdModel, mesh) {
    if (!mmdModel || !mmdModel.rigidBodyStates || !mesh.metadata || !mesh.metadata.rigidBodies) return;

    const rigidBodies = mesh.metadata.rigidBodies;
    const bones = mesh.skeleton ? mesh.skeleton.bones : [];
    const states = mmdModel.rigidBodyStates;

    for (let i = 0; i < rigidBodies.length && i < states.length; ++i) {
      const rb = rigidBodies[i];
      const bone = bones[rb.boneIndex];
      const boneName = bone ? (bone.name || "") : "";
      const targetName = ((rb.name || "") + "_" + boneName).toLowerCase();

      const isIgnored = IGNORE_KEYWORDS.some(kw => targetName.includes(kw));
      const isBodyBase = BODY_BASE_KEYWORDS.some(kw => targetName.includes(kw));
      const isBreast = BREAST_KEYWORDS.some(kw => targetName.includes(kw));

      if (isIgnored || isBodyBase) {
        states[i] = 0;
      } else if (isBreast && !this.breastPhysicsEnabled) {
        states[i] = 0;
      } else {
        states[i] = 1;
      }
    }

    if (this.physicsDisableGlobally) {
      states.fill(0);
    }
  }

  /**
   * メッシュ直下（および子孫）の物理トランスフォームノード（MmdPhysicsTransformNode）を走査し、
   * PMXメタデータの剛体配列とインデックスを対応付けながらコールバックする。
   *
   * babylon-mmd 1.3 では物理ノードは rootMesh の子として追加され、公開プロパティ physicsBody を持つ。
   * ノード名は生成時の rigidBody.name がそのまま使われるため、name の一致でインデックスを解決する。
   */
  _iteratePhysicsNodes(mesh, callback) {
    if (!mesh || typeof mesh.getChildTransformNodes !== "function") return;
    const rigidBodies = mesh.metadata?.rigidBodies || [];
    if (rigidBodies.length === 0) return;

    // 同名剛体が複数存在するケースに備え、名前ごとにインデックスをキューイングする
    const nameQueues = new Map();
    for (let i = 0; i < rigidBodies.length; ++i) {
      const key = rigidBodies[i].name || "";
      if (!nameQueues.has(key)) nameQueues.set(key, []);
      nameQueues.get(key).push(i);
    }

    const nodes = mesh.getChildTransformNodes(false);
    for (const node of nodes) {
      if (!node || !node.physicsBody) continue;
      const queue = nameQueues.get(node.name || "");
      const rbIndex = (queue && queue.length > 0) ? queue.shift() : -1;
      const rb = rbIndex >= 0 ? rigidBodies[rbIndex] : null;
      callback(node, rbIndex, rb);
    }
  }

  // 胸剛体の物理を直接最適化（ON/OFFおよび強度反映）
  _optimizeBreastPhysicsDirectly(mmdModel, mesh) {
    if (!mmdModel || !mesh) return;

    const bones = mesh.skeleton ? mesh.skeleton.bones : [];
    const states = mmdModel.rigidBodyStates;
    let optimizedCount = 0;

    const enabled = this.breastPhysicsEnabled && this.breastPhysicsInertia > 0.0;
    const inertia = this.breastPhysicsInertia;

    // 慣性力倍率 1.0 で従来相当の減衰。高倍率でも効き続けるよう漸近曲線にする
    // inertia=1 → ≈0.30 / inertia=5 → ≈0.08 / inertia=10 → ≈0.04
    const linearDamping = enabled ? Math.max(0.02, 1.0 / (1.0 + 2.3 * inertia)) : 1.0;
    const angularDamping = enabled ? Math.max(0.015, 1.0 / (1.0 + 3.0 * inertia)) : 1.0;
    // 倍率に応じて重力影響を少し強め、揺れの戻りを大きくする
    const gravityFactor = enabled ? Math.min(2.5, 0.7 + 0.3 * inertia) : 0.0;

    this._iteratePhysicsNodes(mesh, (node, rbIndex, rb) => {
      if (rbIndex < 0 || !rb) return;
      const bone = bones[rb.boneIndex];
      const boneName = bone ? (bone.name || "") : "";
      const targetName = ((node.name || "") + "_" + (rb.name || "") + "_" + boneName).toLowerCase();
      const isBreast = BREAST_KEYWORDS.some(kw => targetName.includes(kw));
      if (!isBreast) return;

      const body = node.physicsBody;
      if (!body) return;

      if (!enabled) {
        // OFFの場合: rigidBodyStates を 0 にしてアニメーション追従（キネマティック）にする
        if (states && rbIndex < states.length) states[rbIndex] = 0;
        if (typeof body.setGravityFactor === "function") {
          body.setGravityFactor(0.0);
        }
      } else {
        // ONの場合: rigidBodyStates を 1 にして物理演算に委ねる
        if (states && rbIndex < states.length) states[rbIndex] = 1;
        if (typeof body.setLinearDamping === "function") {
          body.setLinearDamping(linearDamping);
        }
        if (typeof body.setAngularDamping === "function") {
          body.setAngularDamping(angularDamping);
        }
        if (typeof body.setGravityFactor === "function") {
          body.setGravityFactor(gravityFactor);
        }
      }
      optimizedCount++;
    });

    console.log(`[Physics Optimization] Breast settings updated. Enabled: ${enabled}, Inertia: ${inertia}, Optimized: ${optimizedCount} bodies.`);
  }

  // 体幹剛体の物理を直接最適化（物理演算による上書きを完全に防ぐ）
  _optimizeBodyBasePhysicsDirectly(mmdModel, mesh) {
    if (!mmdModel || !mesh) return;

    const bones = mesh.skeleton ? mesh.skeleton.bones : [];
    const states = mmdModel.rigidBodyStates;
    let optimizedCount = 0;

    this._iteratePhysicsNodes(mesh, (node, rbIndex, rb) => {
      if (rbIndex < 0 || !rb) return;
      const bone = bones[rb.boneIndex];
      const boneName = bone ? (bone.name || "") : "";
      const targetName = ((node.name || "") + "_" + (rb.name || "") + "_" + boneName).toLowerCase();
      const isBodyBase = BODY_BASE_KEYWORDS.some(kw => targetName.includes(kw));
      if (!isBodyBase) return;

      if (states && rbIndex < states.length) states[rbIndex] = 0;

      const body = node.physicsBody;
      if (body && typeof body.setGravityFactor === "function") {
        body.setGravityFactor(0.0);
      }
      optimizedCount++;
    });

    console.log(`[Physics Optimization] Body base settings updated. Optimized: ${optimizedCount} bodies.`);
  }

  /**
   * 物理ワールドを 60Hz 固定ステップにする。
   * setSubTimeStep により描画 FPS（制限含む）に依存せず実時間で進める。
   */
  _applyPhysicsTimestep() {
    if (!this.scene || typeof this.scene.getPhysicsEngine !== "function") return;
    const physicsEngine = this.scene.getPhysicsEngine();
    if (!physicsEngine) return;

    if (this.physicsDisableGlobally) {
      physicsEngine.setTimeStep(0);
      physicsEngine.setSubTimeStep(0);
      return;
    }

    physicsEngine.setTimeStep(1 / 60);
    physicsEngine.setSubTimeStep(1000 / 60);
  }

  updateBreastPhysicsSettings(enabled, inertia) {
    this.breastPhysicsEnabled = enabled;
    this.breastPhysicsInertia = inertia;

    for (const model of this.deployedModels.values()) {
      if (!model.mmdModel) continue;
      this._applyRigidBodyStatesAfterCreate(model.mmdModel, model.mesh);
      this._optimizeBreastPhysicsDirectly(model.mmdModel, model.mesh);
      this._optimizeBodyBasePhysicsDirectly(model.mmdModel, model.mesh);
      // 減衰値が大きく変わった際の速度残留による破綻を防ぐため、剛体の位置・速度を再初期化する
      this.mmdRuntime.initializeMmdModelPhysics(model.mmdModel);
    }
  }

  setPhysicsDisableGlobally(disabled) {
    this.physicsDisableGlobally = disabled;

    for (const model of this.deployedModels.values()) {
      if (!model.mmdModel) continue;
      if (disabled) {
        model.mmdModel.rigidBodyStates.fill(0);
      } else {
        this._applyRigidBodyStatesAfterCreate(model.mmdModel, model.mesh);
        this._optimizeBreastPhysicsDirectly(model.mmdModel, model.mesh);
        this._optimizeBodyBasePhysicsDirectly(model.mmdModel, model.mesh);
      }
    }

    this._applyPhysicsTimestep();
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
    if (!model.userMorphOverrides) {
      model.userMorphOverrides = new Map();
    }
    model.userMorphOverrides.set(morphName, value);
  }

  /**
   * モーション由来のモーフを全クリアし、ユーザー手動設定値のみ再適用する
   */
  _restoreUserMorphOverrides(model) {
    const morph = model?.mmdModel?.morph;
    if (!morph) return;

    morph.resetMorphWeights();

    const overrides = model.userMorphOverrides;
    if (overrides && overrides.size > 0) {
      for (const [morphName, weight] of overrides.entries()) {
        morph.setMorphWeight(morphName, weight);
      }
    }

    // ウェイト変更をメッシュへ即反映（次フレーム待ちを避ける）
    if (typeof morph.update === "function") {
      morph.update();
    }
  }

  dumpCurrentPoseAndMotion() {
    if (!this.boneLogEnabled) return;
    const runtimeTime = this.mmdRuntime.currentTime;
    const isPlaying = this.mmdRuntime.isAnimationPlaying;
    const frameIndex = runtimeTime * 30; // 30fps VMD frame

    console.log(`%c=== MMD Realtime Debug (Time: ${runtimeTime.toFixed(4)}s, Frame: ${frameIndex.toFixed(2)}, Playing: ${isPlaying}) ===`, "color: #FF5722; font-weight: bold; font-size: 1.1em;");

    console.log("=== MmdRuntime Raw Object ===", this.mmdRuntime);
    console.log("=== MmdPhysics Raw Object ===", this.mmdPhysics);

    for (const [id, model] of this.deployedModels.entries()) {
      console.group(`Model: ${model.name} (ID: ${id})`);
      console.log("Mesh Position:", model.mesh.position.toString());
      console.log("=== MmdModel Raw Object ===", model.mmdModel);

      // currentAnimation のバインドマップダンプ
      this._dumpBindMaps(model, null);

      let animDetails = "";
      try {
        if (model.mmdModel._runtimeBones) {
          animDetails += `_runtimeBones: ${model.mmdModel._runtimeBones.length}, `;
        }
        const keys = Object.getOwnPropertyNames(model.mmdModel);
        keys.forEach(k => {
          if (k.toLowerCase().includes("anim") || k.toLowerCase().includes("track") || k.toLowerCase().includes("state")) {
            const val = model.mmdModel[k];
            if (val) {
              if (Array.isArray(val)) {
                animDetails += `${k}: [Array(${val.length})], `;
              } else if (typeof val === "object") {
                animDetails += `${k}: {Object keys: ${Object.keys(val).join(",")}}, `;
              } else {
                animDetails += `${k}: ${val}, `;
              }
            }
          }
        });
      } catch (e) {
        animDetails += `Error scanning: ${e.message}`;
      }
      console.log("   MmdModel Anim Details:", animDetails);

      const bonesSource = model.mmdModel.runtimeBones;
      if (!bonesSource) {
        console.log("No runtime bones found.");
        console.groupEnd();
        continue;
      }

      // 主要ボーンのダンプ
      const targetBoneNames = ["全ての親", "すべての親", "センター", "グルーブ", "腰", "下半身", "左足ＩＫ", "右足ＩＫ"];

      targetBoneNames.forEach(boneName => {
        const bone = bonesSource.find(b => b.name === boneName);
        if (!bone) return;

        let worldPos = new Vector3();
        let localPos = new Vector3();

        if (bone.worldMatrix) {
          if (bone.worldMatrix.m) {
            worldPos = Vector3.TransformCoordinates(Vector3.Zero(), bone.worldMatrix);
          } else if (bone.worldMatrix.length === 16) {
            worldPos.set(bone.worldMatrix[12], bone.worldMatrix[13], bone.worldMatrix[14]);
          }
        } else if (bone.linkedBone) {
          const wm = bone.linkedBone.getWorldMatrix ? bone.linkedBone.getWorldMatrix() : null;
          if (wm) worldPos = Vector3.TransformCoordinates(Vector3.Zero(), wm);
        } else if (bone.babylonBone) {
          const wm = bone.babylonBone.getWorldMatrix();
          worldPos = Vector3.TransformCoordinates(Vector3.Zero(), wm);
        }

        if (typeof bone.getAnimationPositionOffsetToRef === "function") {
          bone.getAnimationPositionOffsetToRef(localPos);
        } else if (bone.linkedBone) {
          localPos = bone.linkedBone.position.clone();
        } else if (bone.babylonBone) {
          localPos = bone.babylonBone.position.clone();
        }

        console.log(`%c[Bone: ${boneName}]`, "font-weight: bold; color: #673AB7;");
        console.log("   Constructor:", bone.constructor.name);
        console.log("   Raw Object:", bone);

        let details = "";
        try {
          const proto = Object.getPrototypeOf(bone);
          const allKeys = Array.from(new Set([...Object.getOwnPropertyNames(bone), ...Object.getOwnPropertyNames(proto)]));
          allKeys.forEach(k => {
            if (k.startsWith("_") || k.toLowerCase().includes("movable") || k.toLowerCase().includes("physics") || k.toLowerCase().includes("flag")) {
              try {
                details += `${k}: ${bone[k]}, `;
              } catch(e) {}
            }
          });
        } catch (err) {}
        console.log(`   Internal Flag Details: ${details}`);

        console.log(` - Live Local Pos (animOffset): ${localPos.toString()}`);
        console.log(` - Live World Pos: ${worldPos.toString()}`);
        // linkedBone.position と restMatrix.translation の生ダンプ（センター系ボーンのみ詳細）
        const isCenterBone = ["センター", "グルーブ", "腰"].includes(boneName);
        if (isCenterBone && bone.linkedBone) {
          const rawPos = bone.linkedBone.position;
          const restVec = new Vector3();
          if (typeof bone.linkedBone.getRestMatrix === "function") {
            bone.linkedBone.getRestMatrix().getTranslationToRef(restVec);
          }
          console.log(`%c   [Raw] linkedBone.position = {X:${rawPos.x.toFixed(6)} Y:${rawPos.y.toFixed(6)} Z:${rawPos.z.toFixed(6)}}`, "color: #FF9800;");
          console.log(`%c   [Raw] restMatrix.translation = {X:${restVec.x.toFixed(6)} Y:${restVec.y.toFixed(6)} Z:${restVec.z.toFixed(6)}}`, "color: #FF9800;");
          console.log(`%c   [Raw] diff (should == animOffset) = {X:${(rawPos.x-restVec.x).toFixed(6)} Y:${(rawPos.y-restVec.y).toFixed(6)} Z:${(rawPos.z-restVec.z).toFixed(6)}}`, "color: #FF9800;");

          if (bone.linkedBone._linkedTransformNode) {
            const ltn = bone.linkedBone._linkedTransformNode;
            console.log(`%c   [LinkedTransformNode] name: "${ltn.name}", pos: {X:${ltn.position.x.toFixed(6)} Y:${ltn.position.y.toFixed(6)} Z:${ltn.position.z.toFixed(6)}}`, "color: #03A9F4; font-weight: bold;");
          } else {
            console.log(`   [LinkedTransformNode] None`);
          }

          if (bone.appendTransformSolver) {
            const ats = bone.appendTransformSolver;
            console.log(`%c   [AppendTransform] target: "${ats.targetBone ? ats.targetBone.name : 'null'}", affectAlign: ${ats.affectAlign}, ratio: ${ats.ratio}, isPosition: ${ats.isPosition}, isRotation: ${ats.isRotation}`, "color: #E91E63; font-weight: bold;");
          } else {
            console.log(`   [AppendTransform] None`);
          }
          if (bone.ikSolver) {
            console.log(`%c   [IKSolver] target: "${bone.ikSolver.targetBone ? bone.ikSolver.targetBone.name : 'null'}", iteration: ${bone.ikSolver.iteration}`, "color: #E91E63; font-weight: bold;");
          }
        }

        // モーションの対応キーフレーム探索（movableBoneTracks と boneTracks を分けて表示）
        for (const [motionName, motionEntry] of model.motions.entries()) {
          const anim = motionEntry?.animation ?? motionEntry;
          const findClosestKeyframe = (track) => {
            if (!track || !track.frameNumbers || track.frameNumbers.length === 0) return null;
            let closestIdx = 0;
            let minDiff = Infinity;
            for (let i = 0; i < track.frameNumbers.length; i++) {
              const diff = Math.abs(track.frameNumbers[i] - frameIndex);
              if (diff < minDiff) { minDiff = diff; closestIdx = i; }
            }
            const closestFrame = track.frameNumbers[closestIdx];
            let keyInfo = `Frame ${closestFrame} (Diff: ${(frameIndex - closestFrame).toFixed(2)})`;
            if (track.positions && track.positions.length > 0) {
              const px = track.positions[closestIdx * 3];
              const py = track.positions[closestIdx * 3 + 1];
              const pz = track.positions[closestIdx * 3 + 2];
              if (px !== undefined) keyInfo += `, Pos=[${px.toFixed(4)}, ${py.toFixed(4)}, ${pz.toFixed(4)}]`;
            }
            if (track.rotations && track.rotations.length > 0) {
              const rx = track.rotations[closestIdx * 4];
              const ry = track.rotations[closestIdx * 4 + 1];
              const rz = track.rotations[closestIdx * 4 + 2];
              const rw = track.rotations[closestIdx * 4 + 3];
              if (rx !== undefined) keyInfo += `, Rot=[${rx.toFixed(4)}, ${ry.toFixed(4)}, ${rz.toFixed(4)}, ${rw.toFixed(4)}]`;
            }
            return keyInfo;
          };

          // ① movableBoneTracks（位置＋回転トラック）を検索
          const movableTrack = (anim?.movableBoneTracks || []).find(t => t.name === boneName);
          if (movableTrack) {
            const frameCount = movableTrack.frameNumbers?.length ?? 0;
            if (frameCount === 0) {
              console.log(`%c - [MovableTrack] "${boneName}" in "${motionName}" frameNumbers.length: 0 → position が常に restMatrix にリセットされる！`, "color: #F44336; font-weight: bold;");
            } else {
              const kf = findClosestKeyframe(movableTrack);
              console.log(`%c - [MovableTrack] "${boneName}" frameNumbers.length: ${frameCount}`, "color: #4CAF50;");
              if (kf) console.log(`   Closest Keyframe: ${kf}`);
            }
          } else {
            console.log(`%c - [MovableTrack] "${boneName}" → NOT FOUND in movableBoneTracks`, "color: #FF9800;");
          }

          // ② boneTracks（回転のみトラック）を検索
          const boneTrack = (anim?.boneTracks || []).find(t => t.name === boneName);
          if (boneTrack) {
            const frameCount = boneTrack.frameNumbers?.length ?? 0;
            const kf = findClosestKeyframe(boneTrack);
            console.log(` - [BoneTrack] "${boneName}" frameNumbers.length: ${frameCount}`);
            if (kf) console.log(`   Closest Keyframe: ${kf}`);
          }
        }
      });
      console.groupEnd();
    }
  }

  // currentAnimation のバインドマップをダンプするヘルパー
  _dumpBindMaps(model, contextLabel) {
    const runtimeAnim = model.mmdModel.currentAnimation ?? model.mmdModel._currentAnimation;
    if (!runtimeAnim) {
      console.log(`%c[Bind Map Dump] No currentAnimation for ${model.name}`, "color: #FF9800;");
      return;
    }

    const label = contextLabel || "Realtime Dump";
    console.group(`%c[Bind Map Dump] ${label} - ${model.name}`, "color: #00BCD4; font-weight: bold;");

    // movableBoneBindIndexMap のダンプ
    const movableMap = runtimeAnim.movableBoneBindIndexMap;
    const movableTracks = runtimeAnim.animation?.movableBoneTracks || [];
    console.log(`movableBoneBindIndexMap length: ${movableMap?.length}, movableBoneTracks count: ${movableTracks.length}`);

    const skeletonBones = model.mmdModel.skeleton?.bones || [];
    if (movableMap) {
      for (let i = 0; i < movableMap.length; i++) {
        const bone = movableMap[i];
        const trackName = movableTracks[i]?.name || `Track[${i}]`;
        if (bone === null || bone === undefined) {
          console.log(`%c  [${i}] Track "${trackName}" -> UNBOUND (null)`, "color: #F44336; font-weight: bold;");
        } else {
          const skelBone = skeletonBones.find(b => b.name === bone.name);
          const isSame = skelBone === bone;
          console.log(`  [${i}] Track "${trackName}" -> Bone "${bone.name}" (constructor: ${bone.constructor.name}), SameInstanceAsSkel: ${isSame}`);
          if (!isSame && skelBone) {
            console.log(`%c    WARNING: Bone instance mismatch for Track "${trackName}"! Bound: ${bone._index}, Skel: ${skeletonBones.indexOf(skelBone)}`, "color: #FF5722; font-weight: bold;");
          }
        }
      }
    }

    // boneBindIndexMap のダンプ（回転のみボーン）
    const boneMap = runtimeAnim.boneBindIndexMap;
    const boneTracks = runtimeAnim.animation?.boneTracks || [];
    console.log(`boneBindIndexMap length: ${boneMap?.length}, boneTracks count: ${boneTracks.length}`);
    if (boneMap) {
      const targetCheckNames = ["センター", "グルーブ", "腰", "全ての親", "すべての親"];
      for (let i = 0; i < boneMap.length; i++) {
        const bone = boneMap[i];
        const trackName = boneTracks[i]?.name || `Track[${i}]`;
        if (targetCheckNames.includes(trackName)) {
          if (bone === null || bone === undefined) {
            console.log(`  [BoneTrack: ${trackName}] -> UNBOUND (null)`);
          } else {
            const skelBone = skeletonBones.find(b => b.name === bone.name);
            const isSame = skelBone === bone;
            console.log(`  [BoneTrack: ${trackName}] -> Bone "${bone.name}" (constructor: ${bone.constructor.name}), SameInstanceAsSkel: ${isSame}`);
            if (!isSame && skelBone) {
              console.log(`%c    WARNING: Bone instance mismatch for BoneTrack "${trackName}"! Bound: ${bone._index}, Skel: ${skeletonBones.indexOf(skelBone)}`, "color: #FF5722; font-weight: bold;");
            }
          }
        }
      }
    }

    // 体幹ボーンのバインド状態を重点チェック
    const centerTrackNames = ["センター", "グルーブ", "腰", "全ての親", "すべての親"];
    centerTrackNames.forEach(name => {
      // movableBoneTracksで検索
      const mIdx = movableTracks.findIndex(t => t.name === name);
      if (mIdx !== -1) {
        const bound = movableMap?.[mIdx];
        console.log(`%c  [重要] "${name}" in movableBoneTracks[${mIdx}] -> ${bound ? `Bound to "${bound.name}" (${bound.constructor.name})` : "UNBOUND (null)"}`,
          bound ? "color: #4CAF50; font-weight: bold;" : "color: #F44336; font-weight: bold;");
      }
      // boneTracksで検索
      const bIdx = boneTracks.findIndex(t => t.name === name);
      if (bIdx !== -1) {
        const bound = boneMap?.[bIdx];
        console.log(`%c  [重要] "${name}" in boneTracks[${bIdx}] -> ${bound ? `Bound to "${bound.name}" (${bound.constructor.name})` : "UNBOUND (null)"}`,
          bound ? "color: #4CAF50; font-weight: bold;" : "color: #F44336; font-weight: bold;");
      }
      if (mIdx === -1 && bIdx === -1) {
        console.log(`%c  [重要] "${name}" -> Not in any tracks`, "color: #9E9E9E;");
      }
    });

    // skeleton.bones vs runtimeBones の一致性チェック（センターのみ）
    const runtimeBones = model.mmdModel.runtimeBones || [];
    console.group("skeleton.bones vs runtimeBones 比較 (体幹ボーン)");
    centerTrackNames.forEach(name => {
      const skelBone = skeletonBones.find(b => b.name === name);
      const rtBone = runtimeBones.find(b => b.name === name);
      const skelIdx = skelBone ? skeletonBones.indexOf(skelBone) : -1;
      const rtIdx = rtBone ? runtimeBones.indexOf(rtBone) : -1;

      if (skelBone && rtBone) {
        // バインドされたBoneオブジェクトがruntimeBoneのlinkedBone等と同一か確認
        const isSameInstance = (skelBone === rtBone) || (rtBone.linkedBone === skelBone) || (rtBone.babylonBone === skelBone);
        console.log(`"${name}": skeleton[${skelIdx}] = "${skelBone.name}" (${skelBone.constructor.name}), runtime[${rtIdx}] = "${rtBone.name}" (${rtBone.constructor.name}), SameInstance: ${isSameInstance}`);
        if (!isSameInstance) {
          console.log(`  -> skelBone object:`, skelBone);
          console.log(`  -> rtBone object:`, rtBone);
          if (rtBone.linkedBone) console.log(`  -> rtBone.linkedBone:`, rtBone.linkedBone);
          if (rtBone.babylonBone) console.log(`  -> rtBone.babylonBone:`, rtBone.babylonBone);
        }
      } else {
        console.log(`%c"${name}": skeleton[${skelIdx}]=${skelBone ? "found" : "NOT FOUND"}, runtime[${rtIdx}]=${rtBone ? "found" : "NOT FOUND"}`, "color: #FF9800;");
      }
    });
    console.groupEnd();

    console.groupEnd();
  }
}
