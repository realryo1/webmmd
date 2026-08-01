import {
  Engine,
  Scene,
  Vector3,
  ArcRotateCamera,
  Color4,
  MeshBuilder,
  HavokPlugin,
  StandardMaterial,
  Color3,
  PhysicsViewer
} from "@babylonjs/core";
import { GridMaterial } from "@babylonjs/materials";
import { ShadowOnlyMaterial } from "@babylonjs/materials/shadowOnly/shadowOnlyMaterial";
import HavokPhysics from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
import { SdefInjector } from "babylon-mmd/esm/Loader/sdefInjector";
import { RenderingManager } from "./RenderingManager";

export class BabylonEngine {
  engine = null;
  scene = null;
  camera = null;
  renderingManager = null;
  physicsPlugin = null;

  // RenderingManager 経由の互換プロパティ
  get dirLight() {
    return this.renderingManager?.keyLight ?? null;
  }
  get hemiLight() {
    return this.renderingManager?.hemiLight ?? null;
  }
  get shadowGenerator() {
    return this.renderingManager?.shadowGenerator ?? null;
  }

  ground = null;
  shadowGround = null;
  gridMaterial = null;
  solidMaterial = null;
  shadowOnlyMaterial = null;
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
      cancelAnimationFrame: () => {
        if (this.engine.customAnimationFrameRequester && this.engine.customAnimationFrameRequester.requestID) {
          cancelAnimationFrame(this.engine.customAnimationFrameRequester.requestID);
        }
      }
    };
  }

  _physicsViewer = null;
  _showPhysicsViewer = false;

  async initialize(canvas) {
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true
    });

    // SDEF: Engine 生成直後、ShadowGenerator より前
    SdefInjector.OverrideEngineCreateEffect(this.engine);

    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.04, 0.07, 0.09, 1.0);

    const havokInstance = await HavokPhysics({
      locateFile: () => havokWasmUrl
    });
    this.physicsPlugin = new HavokPlugin(false, havokInstance);
    this.scene.enablePhysics(new Vector3(0, -9.8 * 12.5, 0), this.physicsPlugin);
    const physicsEngine = this.scene.getPhysicsEngine();
    if (physicsEngine) {
      physicsEngine.setTimeStep(1 / 60);
      physicsEngine.setSubTimeStep(1000 / 60);
    }

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
    this.camera.pinchPrecision = 200;
    this.camera.lowerRadiusLimit = 1;
    this.camera.upperRadiusLimit = 200;

    // 描画中枢
    this.renderingManager = new RenderingManager(this.engine, this.scene, this.camera);
    this.renderingManager.initialize();

    this.ground = MeshBuilder.CreateGround("ground", { width: 100, height: 100 }, this.scene);
    this.ground.receiveShadows = true;

    // GridMaterial は影の受けが弱いため、影専用の半透明受け面を重ねる
    this.shadowGround = MeshBuilder.CreateGround("shadowGround", { width: 100, height: 100 }, this.scene);
    this.shadowGround.position.y = 0.02;
    this.shadowGround.receiveShadows = true;
    this.shadowGround.isPickable = false;
    this.shadowOnlyMaterial = new ShadowOnlyMaterial("shadowOnly", this.scene);
    this.shadowOnlyMaterial.activeLight = this.dirLight;
    this.shadowGround.material = this.shadowOnlyMaterial;

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
    if (this.engine) this.engine.resize();
  };

  handleFullscreenChange = () => {
    requestAnimationFrame(() => {
      if (this.engine) this.engine.resize();
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
      this.scene.meshes.forEach((mesh) => {
        if (mesh.physicsBody) this._physicsViewer.showBody(mesh.physicsBody);
      });
      this.scene.transformNodes.forEach((node) => {
        if (node.physicsBody) this._physicsViewer.showBody(node.physicsBody);
      });
      console.log("PhysicsViewer enabled");
    } else {
      this.scene.meshes.forEach((mesh) => {
        if (mesh.physicsBody) this._physicsViewer.hideBody(mesh.physicsBody);
      });
      this.scene.transformNodes.forEach((node) => {
        if (node.physicsBody) this._physicsViewer.hideBody(node.physicsBody);
      });
      this._physicsViewer.dispose();
      this._physicsViewer = null;
      console.log("PhysicsViewer disabled");
    }
  }

  setGravity(magnitude) {
    if (this.scene) {
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

  restoreAfterXr() {
    if (!this.engine || !this.scene) return;

    const canvas = this.engine.getRenderingCanvas();
    if (this.camera) {
      this.scene.activeCamera = this.camera;
      if (canvas) {
        this.camera.attachControl(canvas, true);
      }
    }

    if (canvas) {
      canvas.style.width = "100%";
      canvas.style.height = "100%";
    }

    this.scene.autoClear = true;

    const syncLayoutAndLoop = () => {
      if (!this.engine) return;
      this.updateAnimationFrameRequester();
      this.engine.resize();
      if (typeof this.engine._renderLoop === "function") {
        this.engine._renderLoop();
      }
    };

    syncLayoutAndLoop();

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
      if (this.shadowGround) this.shadowGround.setEnabled(true);
    } else {
      this.ground.material = this.solidMaterial;
      // ソリッド床は StandardMaterial 自身が影を受けるので専用面は不要
      if (this.shadowGround) this.shadowGround.setEnabled(false);
    }
  }

  setShadowEnabled(enabled) {
    this.renderingManager?.setShadowEnabled(enabled);
  }

  setShadowDarkness(v) {
    this.renderingManager?.setShadowDarkness(v);
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
    this.renderingManager?.dispose();
    this.renderingManager = null;
    if (this.engine) {
      this.engine.dispose();
    }
  }
}
