import { WebXRDefaultExperience, WebXRState, WebXRFeatureName, Vector3, Matrix, Color4, Quaternion } from "@babylonjs/core";

export class XrManager {
  scene = null;
  ground = null;
  xrHelper = null;

  mmdManager = null;
  babylonEngine = null;
  _savedClearColor = null;
  _savedGroundEnabled = true;
  _savedCameraState = null;
  _desktopRestorePending = false;
  _desktopRestoreScheduled = false;
  _viewerElement = null;

  // 自前移動制御用の状態 (マイクラクリエのように加速なし、常に一定量)
  leftStickValues = { x: 0, y: 0 };
  rightStickX = 0;
  isMovingUp = false;
  isMovingDown = false;
  moveSpeed = 0.03; // m/frame (一定速度、1/3に調整)
  verticalSpeed = 0.015;

  constructor(scene, ground) {
    this.scene = scene;
    this.ground = ground;
  }

  async initialize(vrButtonElement) {
    try {
      this._viewerElement = document.querySelector(".viewer");

      // disableDefaultUI: true を指定してデフォルトUIの自動生成を防止
      // disableTeleportation: true を指定してデフォルトのテレポート＆スナップ回転を無効化
      this.xrHelper = await this.scene.createDefaultXRExperienceAsync({
        floorMeshes: [this.ground],
        uiOptions: {
          disableDefaultUI: true
        },
        disableTeleportation: true,
        optionalFeatures: ["xr-legacy-passthrough", "background-removal"]
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
            // パススルーのチェック状態に合わせてAR/VRの起動セッションモードを切り替える
            const passthrough = localStorage.getItem("vr-passthrough-enabled") === "true";
            const sessionMode = passthrough ? "immersive-ar" : "immersive-vr";
            await this.xrHelper.baseExperience.enterXRAsync(sessionMode, "local-floor");
          }
        });
      }

      // ボタン有無に関わらず状態監視（スマホのブラウザ終了ボタン含む）
      this.xrHelper.baseExperience.onStateChangedObservable.add((state) => {
        if (state === WebXRState.IN_XR) {
          if (vrButtonElement) {
            vrButtonElement.title = "VRモードを終了";
            vrButtonElement.classList.add("active");
          }
          this._viewerElement?.classList.add("xr-active");

          // 終了時に戻すため、デスクトップ側のカメラ状態を保存
          this._saveDesktopState();
          this._desktopRestorePending = true;

          // worldScalingFactor を 12.5 に設定し、ジャイロトラッキングやIPDも含めて等身大化
          if (this.xrHelper.baseExperience.sessionManager) {
            this.xrHelper.baseExperience.sessionManager.worldScalingFactor = 12.5;
          }

          // パススルー設定の自動適用
          const passthrough = localStorage.getItem("vr-passthrough-enabled") === "true";
          this.setPassthroughEnabled(passthrough);
          if (passthrough) {
            if (!this._savedClearColor) {
              this._savedClearColor = this.scene.clearColor.clone();
            }
            this.scene.clearColor = new Color4(0, 0, 0, 0);
            if (this.ground) {
              this._savedGroundEnabled = this.ground.isEnabled();
              this.ground.setEnabled(false);
            }
          }
        } else if (state === WebXRState.NOT_IN_XR) {
          if (vrButtonElement) {
            vrButtonElement.title = "VRモードを開始";
            vrButtonElement.classList.remove("active");
          }
          this._viewerElement?.classList.remove("xr-active");

          // worldScalingFactor を 1.0倍に戻す
          if (this.xrHelper.baseExperience.sessionManager) {
            this.xrHelper.baseExperience.sessionManager.worldScalingFactor = 1.0;
          }

          // Babylon の session end 後処理より後ろで復元する
          this._scheduleDesktopRestore();
        }
      });

      // スマホの左上バツ等、ブラウザ主導の session.end でも確実に復元
      this.xrHelper.baseExperience.sessionManager.onXRSessionEnded.add(() => {
        this._viewerElement?.classList.remove("xr-active");
        this._scheduleDesktopRestore();
      });

      // コントローラーが追加されたときのバインディング (L/Rスティックの割り当てを固定)
      this.xrHelper.input.onControllerAddedObservable.add((controller) => {
        controller.onMotionControllerInitObservable.add((motionController) => {
          this.setupControllerInput(motionController);
        });
      });

      // 毎フレームの移動・回転・上下更新処理 (自前処理で一定速度・平面移動を実現)
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

  _saveDesktopState() {
    if (this.babylonEngine?.camera) {
      const cam = this.babylonEngine.camera;
      this._savedCameraState = {
        alpha: cam.alpha,
        beta: cam.beta,
        radius: cam.radius,
        target: cam.target.clone()
      };
    }

    if (!this._savedClearColor) {
      this._savedClearColor = this.scene.clearColor.clone();
    }

    if (this.ground) {
      this._savedGroundEnabled = this.ground.isEnabled();
    }
  }

  _scheduleDesktopRestore() {
    if (!this._desktopRestorePending && !this._savedCameraState && !this._savedClearColor) {
      return;
    }
    if (this._desktopRestoreScheduled) {
      return;
    }
    this._desktopRestoreScheduled = true;

    // session end ハンドラ内では Babylon が直後に requester を null にするため遅延必須
    const run = () => this._restoreDesktopState();
    setTimeout(run, 0);
    setTimeout(run, 100);
    setTimeout(run, 400);
  }

  _restoreDesktopState() {
    // 不透明背景へ強制復元（パススルー時の透明 clearColor 残りを防ぐ）
    if (this._savedClearColor) {
      const c = this._savedClearColor;
      this.scene.clearColor = new Color4(c.r, c.g, c.b, 1.0);
      this._savedClearColor = null;
    } else if (this.babylonEngine) {
      const uiColor = document.querySelector(".color-input")?.value || "#0b1118";
      this.babylonEngine.setBackgroundColor(uiColor);
    } else {
      this.scene.clearColor = new Color4(0.04, 0.07, 0.09, 1.0);
    }

    if (this.ground) {
      this.ground.setEnabled(this._savedGroundEnabled);
    }

    // Babylon が XR カメラ位置で ArcRotateCamera を上書きするため、保存値で戻す
    if (this.babylonEngine?.camera && this._savedCameraState) {
      const cam = this.babylonEngine.camera;
      const s = this._savedCameraState;
      cam.alpha = s.alpha;
      cam.beta = s.beta;
      cam.radius = s.radius;
      cam.setTarget(s.target.clone());
      this._savedCameraState = null;
    }

    this.leftStickValues = { x: 0, y: 0 };
    this.rightStickX = 0;
    this.isMovingUp = false;
    this.isMovingDown = false;

    if (this.babylonEngine) {
      this.babylonEngine.restoreAfterXr();
    }

    this._desktopRestorePending = false;
    this._desktopRestoreScheduled = false;
    this._viewerElement?.classList.remove("xr-active");
  }

  setupControllerInput(motionController) {
    const isLeftHand = motionController.handedness === "left";
    const isRightHand = motionController.handedness === "right";

    // 左コントローラー: 移動 (Lスティック) + 上下 (X/Yボタン)
    if (isLeftHand) {
      const thumbstick = motionController.getComponentOfType("thumbstick");
      if (thumbstick) {
        thumbstick.onAxisValueChangedObservable.add((axes) => {
          this.leftStickValues.x = axes.x;
          this.leftStickValues.y = axes.y;
        });
      }

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

    // 右コントローラー: 回転 (Rスティック)
    if (isRightHand) {
      const thumbstick = motionController.getComponentOfType("thumbstick");
      if (thumbstick) {
        thumbstick.onAxisValueChangedObservable.add((axes) => {
          this.rightStickX = axes.x;
        });
      }
    }
  }

  updateXrMovement() {
    if (!this.xrHelper || this.xrHelper.baseExperience.state !== WebXRState.IN_XR) {
      return;
    }

    const camera = this.xrHelper.baseExperience.camera;
    const scaling = this.xrHelper.baseExperience.sessionManager?.worldScalingFactor || 1.0;

    // 1. 前後左右の平面移動 (左スティック)
    if (Math.abs(this.leftStickValues.x) > 0.1 || Math.abs(this.leftStickValues.y) > 0.1) {
      // カメラの向きベクトルを取得 (Y軸方向は無視して水平移動にする)
      const forward = camera.getForwardRay().direction;
      forward.y = 0;
      forward.normalize();

      // 左手座標系における右方向ベクトル
      const right = Vector3.Cross(Vector3.Up(), forward).normalize();

      // 移動ベクトルの算出 (逆移動を修正するため、yはプラス、xはマイナスで加算)
      const moveDirection = forward.scale(this.leftStickValues.y)
        .add(right.scale(-this.leftStickValues.x));

      // worldScalingFactor に合わせて速度をスケールし、常に一定量移動
      const speed = this.moveSpeed * scaling;
      camera.position.addInPlace(moveDirection.scale(speed));
    }

    // 2. 右スティックによる滑らかな回転 (スムース回転 - 逆回転を修正するためマイナスを適用)
    if (Math.abs(this.rightStickX) > 0.1) {
      const rotationSpeed = 0.03; // ラジアン/フレーム
      if (this.xrHelper.baseExperience.container) {
        this.xrHelper.baseExperience.container.rotationQuaternion = 
          this.xrHelper.baseExperience.container.rotationQuaternion || Quaternion.Identity();
        
        const rotation = Quaternion.RotationAxis(Vector3.Up(), -this.rightStickX * rotationSpeed);
        this.xrHelper.baseExperience.container.rotationQuaternion.multiplyInPlace(rotation);
      }
    }

    // 3. 上下移動 (X/Yボタン)
    const vSpeed = this.verticalSpeed * scaling;
    if (this.isMovingUp) {
      camera.position.y += vSpeed;
    }
    if (this.isMovingDown) {
      camera.position.y -= vSpeed;
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

      // VRモード実行中の場合、背景と地面の状態も連動させる
      if (this.xrHelper.baseExperience.state === WebXRState.IN_XR) {
        if (enabled) {
          if (!this._savedClearColor) {
            this._savedClearColor = this.scene.clearColor.clone();
          }
          this.scene.clearColor = new Color4(0, 0, 0, 0);
          if (this.ground) {
            this._savedGroundEnabled = this.ground.isEnabled();
            this.ground.setEnabled(false);
          }
        } else {
          if (this._savedClearColor) {
            this.scene.clearColor = this._savedClearColor;
            this._savedClearColor = null;
          } else if (this.babylonEngine) {
            const uiColor = document.querySelector(".color-input")?.value || "#0b1118";
            this.babylonEngine.setBackgroundColor(uiColor);
          }
          if (this.ground) {
            this.ground.setEnabled(this._savedGroundEnabled);
          }
        }
      }
    } catch (e) {
      console.warn("Failed to toggle Passthrough feature", e);
    }
  }
}
