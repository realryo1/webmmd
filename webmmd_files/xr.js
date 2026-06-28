/**
 * xr.js — WebXR VR モード管理モジュール
 *
 * 役割:
 *   - immersive-vr セッション開始/終了
 *   - playerRig (移動用親 Object3D) の管理
 *   - FBX コントローラモデルのロードと grip への適用
 *   - 左スティックで前後左右移動、X ボタン下降、Y ボタン上昇
 *
 * 使用方法 (handler.js から):
 *   import { initXR, attachXRSessionListeners, updateXR } from './xr.js';
 *   initXR({ renderer, scene, getCamera, vrButton });
 *   attachXRSessionListeners(renderer);
 */

import {
  Object3D,
  Vector3,
  Quaternion,
  Euler,
  Raycaster,
  PlaneGeometry,
  BoxGeometry,
  CanvasTexture,
  MeshBasicMaterial,
  Mesh,
  Line,
  BufferGeometry,
  Float32BufferAttribute,
  Matrix4,
} from './three.module.js';

// -------------------------------------------------------
// 定数
// -------------------------------------------------------
const MOVE_SPEED     = 2.0;  // m/s 前後左右
const VERTICAL_SPEED = 1.0;  // m/s 上下
const DEADZONE       = 0.15; // スティックデッドゾーン

// -------------------------------------------------------
// モジュール内状態
// -------------------------------------------------------
let _renderer   = null;
let _scene      = null;
let _getCamera  = null;
let _vrButton   = null;
let _viewer     = null;

/** VR 中の移動用親 Object3D */
let _playerRig  = null;

/** VR 開始前のカメラ状態保存 */
let _savedCameraPos  = null;
let _savedCameraQuat = null;

/** コントローラ grip */
let _gripL = null;
let _gripR = null;

/** FBX から取り出したノード (clone 済み) */
let _modelL = null;
let _modelR = null;

/** XR セッション進行中フラグ */
let _isXRActive = false;

/** 前フレームのタイムスタンプ (deltaTime 計算用) */
let _lastTime = 0;

/** セッションイベントリスナー多重登録防止フラグ */
let _sessionListenersAttached = false;


let _savedToneMapping = 0;
let _savedShadowMapEnabled = false;

// -------------------------------------------------------
// 公開 API
// -------------------------------------------------------

/**
 * XR システムを初期化する。
 * handler.js の初期化後に一度だけ呼ぶ。
 *
 * @param {object} opts
 * @param {THREE.WebGLRenderer} opts.renderer
 * @param {THREE.Scene}         opts.scene
 * @param {() => THREE.Camera}  opts.getCamera
 * @param {HTMLButtonElement}   opts.vrButton
 * @param {object}              opts.viewer
 */
export function initXR({ renderer, scene, getCamera, vrButton, viewer }) {
  _renderer  = renderer;
  _scene     = scene;
  _getCamera = getCamera;
  _vrButton  = vrButton;
  _viewer    = viewer;

  // WebXR を有効化
  renderer.xr.enabled = true;

  // WebXR サポートチェック
  if (!navigator.xr) {
    _disableVrButton('WebXR非対応');
    return;
  }

  navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
    if (!supported) {
      _disableVrButton('VR非対応');
      return;
    }
    // ボタンを有効化してクリックイベントを登録
    vrButton.disabled = false;
    vrButton.addEventListener('click', _onVrButtonClick);
  }).catch(() => {
    _disableVrButton('確認失敗');
  });

  // コントローラモデルを生成
  _createControllerModels();
}


// -------------------------------------------------------
// VR セッション制御
// -------------------------------------------------------

let _isRequestingSession = false;

async function _onVrButtonClick() {
  if (!_renderer || _isRequestingSession) return;

  const session = _renderer.xr.getSession();
  if (session) {
    // セッション中 → 終了
    _isRequestingSession = true;
    try {
      await session.end();
    } catch (e) {
      console.warn('[xr] session.end failed', e);
    } finally {
      _isRequestingSession = false;
    }
  } else {
    // セッション開始
    _isRequestingSession = true;
    try {
      const viewerElement = document.querySelector('.viewer');
      const newSession = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'dom-overlay'],
        domOverlay: { root: viewerElement }
      });
      await _renderer.xr.setSession(newSession);
    } catch (e) {
      console.warn('[xr] requestSession failed', e);
    } finally {
      _isRequestingSession = false;
    }
  }
}



/**
 * XR セッション開始時の処理。
 */
function _onSessionStart() {
  _isXRActive = true;
  _lastTime = 0;

  // VR ボタンをアクティブ状態にする
  if (_vrButton) {
    _vrButton.classList.add('overlay-button--active');
    _vrButton.setAttribute('aria-label', 'VR終了');
  }

  // DOM Overlay 用に .viewer に .xr-active クラスを追加
  const viewerElement = document.querySelector('.viewer');
  if (viewerElement) {
    viewerElement.classList.add('xr-active');
  }

  // カメラ状態を保存
  const cam = _getCamera();
  _savedCameraPos  = cam.position.clone();
  _savedCameraQuat = cam.quaternion.clone();

  // 黒いもや・バグを回避するためトーンマッピングとシャドウを一時無効化
  _savedToneMapping = _renderer.toneMapping;
  _savedShadowMapEnabled = _renderer.shadowMap.enabled;
  _renderer.toneMapping = 0;
  _renderer.shadowMap.enabled = false;

  // playerRig をシーンに追加
  _playerRig = new Object3D();
  _playerRig.name = 'playerRig';
  _playerRig.position.copy(_savedCameraPos);
  _scene.add(_playerRig);

  // カメラを playerRig の子にする
  _playerRig.add(cam);

  // コントローラ grip をリグに追加
  _setupControllerGrips();

  // コントローラをリグに追加
  const controllerL = _renderer.xr.getController(0);
  const controllerR = _renderer.xr.getController(1);
  _playerRig.add(controllerL);
  _playerRig.add(controllerR);

  // 通常のレンダーループを停止し、XRレンダーループを開始
  if (_viewer) {
    window.cancelAnimationFrame(_viewer.animationFrameId);
  }
  _renderer.setAnimationLoop(_xrRenderLoop);
}

/**
 * XR セッション終了時の処理。
 */
function _onSessionEnd() {
  _isXRActive = false;
  _lastTime = 0;

  // XRレンダーループを停止
  _renderer.setAnimationLoop(null);

  // VR ボタンを通常状態に戻す
  if (_vrButton) {
    _vrButton.classList.remove('overlay-button--active');
    _vrButton.setAttribute('aria-label', 'VRモード');
  }

  // DOM Overlay 用に .viewer から .xr-active クラスを削除
  const viewerElement = document.querySelector('.viewer');
  if (viewerElement) {
    viewerElement.classList.remove('xr-active');
  }

  // コントローラをリグから除去
  const controllerL = _renderer.xr.getController(0);
  const controllerR = _renderer.xr.getController(1);
  if (_playerRig) {
    _playerRig.remove(controllerL);
    _playerRig.remove(controllerR);
  }

  // コントローラモデルを片付ける
  _cleanupControllerGrips();

  // カメラを元の親 (cameraPivot) またはシーンに戻す
  const cam = _getCamera();
  if (_viewer && _viewer.cameraPivot) {
    _viewer.cameraPivot.add(cam);
  } else {
    _scene.add(cam);
  }

  // playerRig をシーンから除去
  if (_playerRig) {
    _scene.remove(_playerRig);
    _playerRig = null;
  }

  // トーンマッピングとシャドウを復元
  _renderer.toneMapping = _savedToneMapping;
  _renderer.shadowMap.enabled = _savedShadowMapEnabled;

  // カメラを元に戻す
  if (_savedCameraPos && _savedCameraQuat) {
    cam.position.copy(_savedCameraPos);
    cam.quaternion.copy(_savedCameraQuat);
  }

  // 通常のレンダーループを再開
  if (_viewer) {
    _viewer.clock.getDelta(); // 時間差分をリセット
    _viewer.render();
  }
}

/**
 * XRセッション中のレンダーループ。
 */
function _xrRenderLoop(timestamp, frame) {
  if (!_isXRActive || !_renderer) return;

  const delta = _lastTime > 0 ? Math.min((timestamp - _lastTime) / 1000, 0.1) : 0;
  _lastTime = timestamp;

  // 入力処理
  _processInput(delta);

  // MMD アニメーションの更新
  if (_viewer && _viewer.frameUpdater) {
    _viewer.frameUpdater.update(delta);
  }

  // レンダリング (XR カメラで自動レンダリングされる)
  _renderer.render(_scene, _renderer.xr.getCamera());
}


// -------------------------------------------------------
// セッションイベント登録
// -------------------------------------------------------

/**
 * renderer.xr の sessionstart/sessionend を登録する。
 * 多重登録を防ぐために一度だけ実行される。
 *
 * @param {THREE.WebGLRenderer} renderer
 */
export function attachXRSessionListeners(renderer) {
  if (_sessionListenersAttached) return;
  _sessionListenersAttached = true;

  renderer.xr.addEventListener('sessionstart', _onSessionStart);
  renderer.xr.addEventListener('sessionend',   _onSessionEnd);
}

// -------------------------------------------------------
// コントローラ grip のセットアップ
// -------------------------------------------------------

function _setupControllerGrips() {
  if (!_renderer || !_playerRig) return;

  _gripL = _renderer.xr.getControllerGrip(0);
  _gripR = _renderer.xr.getControllerGrip(1);

  _playerRig.add(_gripL);
  _playerRig.add(_gripR);

  // FBX モデルが準備できていればアタッチ
  if (_modelL) _gripL.add(_modelL);
  if (_modelR) _gripR.add(_modelR);
}

function _cleanupControllerGrips() {
  if (_gripL) {
    if (_modelL) _gripL.remove(_modelL);
    if (_playerRig) _playerRig.remove(_gripL);
    _gripL = null;
  }
  if (_gripR) {
    if (_modelR) _gripR.remove(_modelR);
    if (_playerRig) _playerRig.remove(_gripR);
    _gripR = null;
  }
}

// -------------------------------------------------------
// FBX コントローラモデルのプリロード
// -------------------------------------------------------

function _createControllerModels() {
  const geometry = new BoxGeometry(0.05, 0.05, 0.08); // 幅5cm, 高さ5cm, 奥行き8cm
  const materialL = new MeshBasicMaterial({ color: 0xff0000 }); // 左: 赤
  const materialR = new MeshBasicMaterial({ color: 0x0000ff }); // 右: 青

  _modelL = new Mesh(geometry, materialL);
  _modelR = new Mesh(geometry, materialR);

  console.log('[xr] controller cube models created');
}

// -------------------------------------------------------
// 入力処理
// -------------------------------------------------------

/** 一時変数 (GC 軽減) */
const _tmpQuat  = new Quaternion();
const _tmpDir   = new Vector3();
const _tmpEuler = new Euler();

/**
 * 毎フレーム呼ばれる入力処理。
 *
 * @param {number} delta  フレーム時間 (秒)
 */
function _processInput(delta) {
  if (!_renderer || !_playerRig) return;

  const session = _renderer.xr.getSession();
  if (!session) return;

  let axisX  = 0;
  let axisY  = 0;
  let goUp   = false;
  let goDown = false;

  for (const source of session.inputSources) {
    if (!source.gamepad) continue;

    const gp = source.gamepad;

    if (source.handedness === 'left') {
      // 左スティック: axes[2]=X, axes[3]=Y
      const ax = gp.axes[2] ?? 0;
      const ay = gp.axes[3] ?? 0;
      axisX = Math.abs(ax) > DEADZONE ? ax : 0;
      axisY = Math.abs(ay) > DEADZONE ? ay : 0;

      // Meta Quest 2: Y=buttons[5] (上昇), X=buttons[4] (下降)
      goUp   = !!(gp.buttons[5]?.pressed);
      goDown = !!(gp.buttons[4]?.pressed);
    }
  }

  if (axisX !== 0 || axisY !== 0) {
    _moveHorizontal(axisX, axisY, delta);
  }
  if (goUp)   _playerRig.position.y += VERTICAL_SPEED * delta;
  if (goDown) _playerRig.position.y -= VERTICAL_SPEED * delta;
}

/**
 * HMD の yaw 方向基準で水平移動する。
 *
 * @param {number} x      スティック X 軸値
 * @param {number} y      スティック Y 軸値 (負=前)
 * @param {number} delta  フレーム時間 (秒)
 */
function _moveHorizontal(x, y, delta) {
  // XR カメラの現在向きを取得
  const xrCam = _renderer.xr.getCamera();
  xrCam.getWorldQuaternion(_tmpQuat);

  // yaw のみ取り出す (pitch/roll を無視して水平移動)
  _tmpEuler.setFromQuaternion(_tmpQuat, 'YXZ');
  _tmpEuler.x = 0;
  _tmpEuler.z = 0;
  _tmpQuat.setFromEuler(_tmpEuler);

  // 移動方向ベクトルを yaw で回転
  _tmpDir.set(x, 0, y).applyQuaternion(_tmpQuat);
  _tmpDir.normalize().multiplyScalar(MOVE_SPEED * delta);

  _playerRig.position.x += _tmpDir.x;
  _playerRig.position.z += _tmpDir.z;
}

// -------------------------------------------------------
// ユーティリティ
// -------------------------------------------------------

function _disableVrButton(reason) {
  if (!_vrButton) return;
  _vrButton.disabled = true;
  _vrButton.title = reason;
  console.log(`[xr] VR button disabled: ${reason}`);
}
