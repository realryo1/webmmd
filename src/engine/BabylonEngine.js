import { 
  Engine, 
  Scene, 
  Vector3, 
  ArcRotateCamera, 
  HemisphericLight, 
  DirectionalLight, 
  ShadowGenerator, 
  Color4, 
  MeshBuilder, 
  HavokPlugin,
  StandardMaterial,
  Color3,
  PhysicsViewer
} from "@babylonjs/core";
import { GridMaterial } from "@babylonjs/materials";
import HavokPhysics from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";

export class BabylonEngine {
  engine = null;
  scene = null;
  camera = null;
  dirLight = null;
  hemiLight = null;
  shadowGenerator = null;
  physicsPlugin = null;
  
  ground = null;
  gridMaterial = null;
  solidMaterial = null;
  fpsLimit = null;
  updateTime = 0;
  drawTime = 0;

  setFpsLimit(limit) {
    this.fpsLimit = typeof limit === "number" && !isNaN(limit) ? limit : null;
    this.updateAnimationFrameRequester();
  }

  updateAnimationFrameRequester() {
    if (!this.engine) return;

    if (this.fpsLimit === null) {
      this.engine.customAnimationFrameRequester = null;
      return;
    }

    const limit = this.fpsLimit;
    let lastTime = performance.now();
    const interval = 1000 / limit;

    this.engine.customAnimationFrameRequester = {
      requestID: null,
      requestAnimationFrame: (callback) => {
        const loop = () => {
          const now = performance.now();
          const delta = now - lastTime;
          if (delta >= interval) {
            lastTime = now - (delta % interval);
            callback();
          } else {
            this.engine.customAnimationFrameRequester.requestID = requestAnimationFrame(loop);
          }
        };
        this.engine.customAnimationFrameRequester.requestID = requestAnimationFrame(loop);
      },
      cancelAnimationFrame: (id) => {
        if (this.engine.customAnimationFrameRequester && this.engine.customAnimationFrameRequester.requestID) {
          cancelAnimationFrame(this.engine.customAnimationFrameRequester.requestID);
        }
      }
    };
  }

  // Physics debugging
  _physicsViewer = null;
  _showPhysicsViewer = false;

  async initialize(canvas) {
    this.engine = new Engine(canvas, true, { 
      preserveDrawingBuffer: true, 
      stencil: true 
    });

    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.04, 0.07, 0.09, 1.0); // #0b1118 に近いダークカラー

    // 物理エンジンの初期化 (Havok)
    const havokInstance = await HavokPhysics({
      locateFile: () => havokWasmUrl
    });
    // useDeltaForWorldStep = false: 各物理ステップは固定 dt で進める
    // setSubTimeStep により描画 FPS（制限含む）ではなく実時間で 60Hz 分ステップする
    this.physicsPlugin = new HavokPlugin(false, havokInstance);
    this.scene.enablePhysics(new Vector3(0, -9.8 * 12.5, 0), this.physicsPlugin); // MMDスケールを考慮
    const physicsEngine = this.scene.getPhysicsEngine();
    if (physicsEngine) {
      physicsEngine.setTimeStep(1 / 60);
      physicsEngine.setSubTimeStep(1000 / 60);
    }

    // カメラの初期化
    this.camera = new ArcRotateCamera(
      "camera",
      -Math.PI / 2,
      Math.PI / 2 - 0.1,
      30,
      new Vector3(0, 10, 0),
      this.scene
    );
    this.camera.attachControl(canvas, true);
    this.camera.wheelPrecision = 15;
    this.camera.pinchPrecision = 200; // ピンチズーム感度（大きいほど鈍感）
    this.camera.lowerRadiusLimit = 1;
    this.camera.upperRadiusLimit = 200;

    // ライトの初期化
    this.hemiLight = new HemisphericLight("hemiLight", new Vector3(0, 1, 0), this.scene);
    this.hemiLight.intensity = 0.5;

    this.dirLight = new DirectionalLight("dirLight", new Vector3(-1, -2, 1), this.scene);
    this.dirLight.position = new Vector3(10, 30, -10);
    this.dirLight.intensity = 0.7;

    // 影の初期化
    this.shadowGenerator = new ShadowGenerator(1024, this.dirLight);
    this.shadowGenerator.useBlurExponentialShadowMap = true;
    this.shadowGenerator.useKernelBlur = true;
    this.shadowGenerator.blurKernel = 32;

    // グリッド床の初期化
    this.ground = MeshBuilder.CreateGround("ground", { width: 100, height: 100 }, this.scene);
    this.ground.receiveShadows = true;

    this.gridMaterial = new GridMaterial("gridMaterial", this.scene);
    this.gridMaterial.majorUnitFrequency = 5;
    this.gridMaterial.gridRatio = 1.0;
    this.gridMaterial.mainColor = new Color3(0.2, 0.3, 0.4);
    this.gridMaterial.lineColor = new Color3(0.1, 0.15, 0.2);
    this.gridMaterial.opacity = 0.8;

    this.solidMaterial = new StandardMaterial("solidMaterial", this.scene);
    this.solidMaterial.diffuseColor = new Color3(0.04, 0.07, 0.09);
    this.solidMaterial.specularColor = new Color3(0, 0, 0);

    this.ground.material = this.gridMaterial;

    // パフォーマンス計測用のイベントフック
    let updateStart = 0;
    let drawStart = 0;
    this.scene.onBeforeRenderObservable.add(() => {
      updateStart = performance.now();
    });
    this.scene.onBeforeDrawPhaseObservable.add(() => {
      const now = performance.now();
      this.updateTime = now - updateStart;
      drawStart = now;
    });
    this.scene.onAfterRenderObservable.add(() => {
      this.drawTime = performance.now() - drawStart;
    });

    // 描画ループの開始
    this.engine.runRenderLoop(() => {
      this.scene.render();
    });

    this.updateAnimationFrameRequester();

    window.addEventListener("resize", this.handleResize);
    document.addEventListener("fullscreenchange", this.handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", this.handleFullscreenChange);
    window.addEventListener("keydown", this.handleKeyDown);
  }

  handleResize = () => {
    if (this.engine) {
      this.engine.resize();
    }
  };

  // フルスクリーン切替後はCSSレイアウト完了を待ってリサイズ
  handleFullscreenChange = () => {
    requestAnimationFrame(() => {
      if (this.engine) {
        this.engine.resize();
      }
    });
  };

  handleKeyDown = (e) => {
    if (e.key && e.key.toLowerCase() === "p") {
      this.togglePhysicsViewer();
    }
  };

  togglePhysicsViewer() {
    if (!this.scene || !this.physicsPlugin) return;

    if (!this._physicsViewer) {
      this._physicsViewer = new PhysicsViewer(this.scene);
    }

    this._showPhysicsViewer = !this._showPhysicsViewer;

    if (this._showPhysicsViewer) {
      this.scene.meshes.forEach(mesh => {
        if (mesh.physicsBody) {
          this._physicsViewer.showBody(mesh.physicsBody);
        }
      });
      this.scene.transformNodes.forEach(node => {
        if (node.physicsBody) {
          this._physicsViewer.showBody(node.physicsBody);
        }
      });
      console.log("PhysicsViewer enabled");
    } else {
      this.scene.meshes.forEach(mesh => {
        if (mesh.physicsBody) {
          this._physicsViewer.hideBody(mesh.physicsBody);
        }
      });
      this.scene.transformNodes.forEach(node => {
        if (node.physicsBody) {
          this._physicsViewer.hideBody(node.physicsBody);
        }
      });
      this._physicsViewer.dispose();
      this._physicsViewer = null;
      console.log("PhysicsViewer disabled");
    }
  }

  setGravity(magnitude) {
    if (this.scene) {
      // MMDのスケール倍率（約12.5倍）を掛けて設定
      this.scene.getPhysicsEngine().setGravity(new Vector3(0, -magnitude * 12.5, 0));
    }
  }

  setBackgroundColor(hexColor) {
    if (this.scene) {
      const color = Color3.FromHexString(hexColor);
      this.scene.clearColor = new Color4(color.r, color.g, color.b, 1.0);
      if (this.solidMaterial) {
        this.solidMaterial.diffuseColor = color;
      }
    }
  }

  // WebXR 終了後にデスクトップ描画状態を復元する
  // スマホのブラウザ終了ボタンでは、Babylon の session end 処理が
  // オブザーバより後に customAnimationFrameRequester を null にするため、遅延再適用が必要
  restoreAfterXr() {
    if (!this.engine || !this.scene) return;

    const canvas = this.engine.getRenderingCanvas();
    if (this.camera) {
      this.scene.activeCamera = this.camera;
      if (canvas) {
        this.camera.attachControl(canvas, true);
      }
    }

    // XR 中に Babylon が canvas バッファをヘッドセット解像度へ変えるため CSS を明示
    if (canvas) {
      canvas.style.width = "100%";
      canvas.style.height = "100%";
    }

    this.scene.autoClear = true;

    const syncLayoutAndLoop = () => {
      if (!this.engine) return;
      this.updateAnimationFrameRequester();
      this.engine.resize();
      // session end 直後にループが止まる端末対策
      if (typeof this.engine._renderLoop === "function") {
        this.engine._renderLoop();
      }
    };

    syncLayoutAndLoop();

    // 没入モード解除後のレイアウト確定を待つ（スマホは特に遅延が大きい）
    const delays = [0, 50, 150, 300, 600, 1000];
    for (const ms of delays) {
      setTimeout(syncLayoutAndLoop, ms);
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(syncLayoutAndLoop);
    });
  }

  setBackgroundMode(mode) {
    if (!this.ground) return;
    if (mode === "grid") {
      this.ground.material = this.gridMaterial;
    } else {
      this.ground.material = this.solidMaterial;
    }
  }

  setShadowEnabled(enabled) {
    if (this.shadowGenerator) {
      // 既存の影の描画マップを設定・無効化
      if (enabled) {
        this.dirLight.shadowEnabled = true;
      } else {
        this.dirLight.shadowEnabled = false;
      }
    }
  }

  setPixelRatio(ratio) {
    if (this.engine) {
      this.engine.setHardwareScalingLevel(1 / ratio);
    }
  }

  setShadowResolution(size) {
    if (this.shadowGenerator) {
      const shadowMap = this.shadowGenerator.getShadowMap();
      if (shadowMap && typeof shadowMap.resize === "function") {
        shadowMap.resize(size);
      }
    }
  }

  dispose() {
    window.removeEventListener("resize", this.handleResize);
    document.removeEventListener("fullscreenchange", this.handleFullscreenChange);
    document.removeEventListener("webkitfullscreenchange", this.handleFullscreenChange);
    window.removeEventListener("keydown", this.handleKeyDown);
    if (this._physicsViewer) {
      this._physicsViewer.dispose();
      this._physicsViewer = null;
    }
    if (this.engine) {
      this.engine.dispose();
    }
  }
}
