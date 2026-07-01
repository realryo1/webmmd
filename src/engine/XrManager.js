import { WebXRDefaultExperience, WebXRState, WebXRFeatureName, Vector3, Matrix } from "@babylonjs/core";

export class XrManager {
  scene = null;
  ground = null;
  xrHelper = null;

  // 移動制御用の状態
  leftStickValues = { x: 0, y: 0 };
  isMovingUp = false;
  isMovingDown = false;
  moveSpeed = 0.1; // m/frame
  verticalSpeed = 0.05;

  constructor(scene, ground) {
    this.scene = scene;
    this.ground = ground;
  }

  async initialize(vrButtonElement) {
    try {
      // disableDefaultUI: true を指定してデフォルトUIの自動生成を防止
      this.xrHelper = await this.scene.createDefaultXRExperienceAsync({
        floorMeshes: [this.ground],
        uiOptions: {
          disableDefaultUI: true
        }
      });

      // 独自ボタン (overlay-vr-button) を利用可能にする
      if (vrButtonElement) {
        vrButtonElement.disabled = false;
        vrButtonElement.title = "VRモードを開始";

        vrButtonElement.addEventListener("click", async () => {
          const state = this.xrHelper.baseExperience.state;
          if (state === WebXRState.IN_XR) {
            await this.xrHelper.baseExperience.exitXRAsync();
          } else {
            await this.xrHelper.baseExperience.enterXRAsync("immersive-vr", "local-floor");
          }
        });

        // XRセッションの開始・終了を検知してボタンの状態・テキストを連動させる
        this.xrHelper.baseExperience.onStateChangedObservable.add((state) => {
          if (state === WebXRState.IN_XR) {
            vrButtonElement.title = "VRモードを終了";
            vrButtonElement.classList.add("active");
          } else {
            vrButtonElement.title = "VRモードを開始";
            vrButtonElement.classList.remove("active");
          }
        });
      }

      // コントローラーが追加されたときのバインディング
      this.xrHelper.input.onControllerAddedObservable.add((controller) => {
        controller.onMotionControllerInitObservable.add((motionController) => {
          this.setupControllerInput(motionController);
        });
      });

      // 毎フレームの移動更新処理
      this.scene.onBeforeRenderObservable.add(() => {
        this.updateXrMovement();
      });

      console.log("WebXR initialized successfully");
    } catch (e) {
      console.warn("WebXR is not supported on this device/browser", e);
      if (vrButtonElement) {
        vrButtonElement.disabled = true;
        vrButtonElement.title = "WebXR はこのブラウザ/デバイスではサポートされていません";
      }
    }
  }

  setupControllerInput(motionController) {
    const isLeftHand = motionController.handedness === "left";

    // 1. スティック移動 (左コントローラー)
    if (isLeftHand) {
      const thumbstick = motionController.getComponentOfType("thumbstick");
      if (thumbstick) {
        thumbstick.onAxisValueChangedObservable.add((axes) => {
          this.leftStickValues.x = axes.x;
          this.leftStickValues.y = axes.y;
        });
      }

      // X/Yボタン (Quest)
      const xButton = motionController.getComponent("x-button");
      const yButton = motionController.getComponent("y-button");

      if (xButton) {
        xButton.onButtonStateChangedObservable.add((state) => {
          this.isMovingDown = state.pressed;
        });
      }
      if (yButton) {
        yButton.onButtonStateChangedObservable.add((state) => {
          this.isMovingUp = state.pressed;
        });
      }
    }
  }

  updateXrMovement() {
    if (!this.xrHelper || this.xrHelper.baseExperience.state !== WebXRState.IN_XR) {
      return;
    }

    const camera = this.xrHelper.baseExperience.camera;

    // 前後左右の移動 (左スティック)
    if (Math.abs(this.leftStickValues.x) > 0.1 || Math.abs(this.leftStickValues.y) > 0.1) {
      // カメラの向きベクトルを取得 (Y軸方向は無視して水平移動にする)
      const forward = camera.getForwardRay().direction;
      forward.y = 0;
      forward.normalize();

      const right = Vector3.Cross(forward, Vector3.Up()).normalize();

      // 移動ベクトルの算出
      const moveDirection = forward.scale(-this.leftStickValues.y)
        .add(right.scale(this.leftStickValues.x));

      camera.position.addInPlace(moveDirection.scale(this.moveSpeed));
    }

    // 上下移動 (X/Yボタン)
    if (this.isMovingUp) {
      camera.position.y += this.verticalSpeed;
    }
    if (this.isMovingDown) {
      camera.position.y -= this.verticalSpeed;
    }
  }

  setPassthroughEnabled(enabled) {
    if (!this.xrHelper) return;
    const fm = this.xrHelper.baseExperience.featuresManager;

    // WebXRのパススルー機能（ARカメラ背景）を有効/無効化
    try {
      if (enabled) {
        fm.enableFeature(WebXRFeatureName.XR_LEGACY_PASSTHROUGH, "latest");
      } else {
        fm.disableFeature(WebXRFeatureName.XR_LEGACY_PASSTHROUGH);
      }
    } catch (e) {
      console.warn("Failed to toggle Passthrough feature", e);
    }
  }
}
