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

import { FBXLoader } from './FBXLoader.js';
import {
  Object3D,
  Vector3,
  Quaternion,
  Euler,
  Raycaster,
  PlaneGeometry,
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

/** VR終了用の3DUIボタンと当たり判定用のオブジェクト */
let _vrQuitButton = null;
let _raycaster = null;
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

  // FBX コントローラモデルを事前ロード
  _preloadControllerModels();
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
      const newSession = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor'],
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
 * VR終了用の3DUIボタンを作成する
 */
function _createQuitButton() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  
  // 背景（半透明の赤）
  ctx.fillStyle = 'rgba(200, 30, 30, 0.85)';
  ctx.fillRect(0, 0, 256, 128);
  
  // 枠線
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 250, 122);
  
  // テキスト
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VR 終了', 128, 64);
  
  const texture = new CanvasTexture(canvas);
  const geometry = new PlaneGeometry(0.4, 0.2);
  const material = new MeshBasicMaterial({ map: texture, transparent: true });
  const mesh = new Mesh(geometry, material);
  
  // プレイヤーの目の前に配置
  mesh.position.set(0, 1.2, -1.5);
  return mesh;
}

/**
 * コントローラのトリガーが引かれた際の判定処理
 */
function _onSelect(event) {
  if (!_vrQuitButton) return;

  const controller = event.target;
  const raycaster = _raycaster || new Raycaster();
  _raycaster = raycaster;
  
  const matrix = controller.matrixWorld;
  const origin = new Vector3().setFromMatrixPosition(matrix);
  const direction = new Vector3(0, 0, -1).applyMatrix4(new Matrix4().extractRotation(matrix)).normalize();
  
  raycaster.set(origin, direction);
  
  const intersects = raycaster.intersectObject(_vrQuitButton);
  if (intersects.length > 0) {
    console.log('[xr] VR Quit button clicked, ending VR session');
    _onVrButtonClick();
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

  // コントローラ grip をリグに追加
  _setupControllerGrips();

  // コントローラのトリガーイベント登録
  const controllerL = _renderer.xr.getController(0);
  const controllerR = _renderer.xr.getController(1);
  controllerL.addEventListener('select', _onSelect);
  controllerR.addEventListener('select', _onSelect);
  
  _playerRig.add(controllerL);
  _playerRig.add(controllerR);

  const lineGeometry = new BufferGeometry();
  lineGeometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, 0, -2], 3));
  const lineMaterial = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
  const line = new Line(lineGeometry, lineMaterial);
  line.name = 'ray';

  controllerL.add(line.clone());
  controllerR.add(line.clone());

  // VR終了ボタンを作成してリグに追加
  _vrQuitButton = _createQuitButton();
  _playerRig.add(_vrQuitButton);

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

  // コントローラからイベントリスナー解除
  const controllerL = _renderer.xr.getController(0);
  const controllerR = _renderer.xr.getController(1);
  controllerL.removeEventListener('select', _onSelect);
  controllerR.removeEventListener('select', _onSelect);

  // コントローラオブジェクトと光線をリグ/オブジェクトから除去
  if (_playerRig) {
    _playerRig.remove(controllerL);
    _playerRig.remove(controllerR);
  }
  controllerL.remove(controllerL.getObjectByName('ray'));
  controllerR.remove(controllerR.getObjectByName('ray'));

  // コントローラモデルを片付ける
  _cleanupControllerGrips();

  // VR終了ボタンの破棄
  if (_vrQuitButton) {
    if (_playerRig) _playerRig.remove(_vrQuitButton);
    _vrQuitButton.geometry.dispose();
    _vrQuitButton.material.map.dispose();
    _vrQuitButton.material.dispose();
    _vrQuitButton = null;
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
    const cam = _getCamera();
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

function _preloadControllerModels() {
  const loader = new FBXLoader();

  // xr.js から quest2_Controller.fbx への相対パスを解決
  const url = new URL('./quest2_Controller.fbx', import.meta.url).href;

  loader.load(
    url,
    (fbx) => {
      // 左右のノードを名前で検索
      let nodeL = null;
      let nodeR = null;
      fbx.traverse((child) => {
        if (child.name === 'left_quest2_controller_world')  nodeL = child;
        if (child.name === 'right_quest2_controller_world') nodeR = child;
      });

      if (!nodeL) {
        console.warn('[xr] left_quest2_controller_world not found, using whole model');
        nodeL = fbx;
      }
      if (!nodeR) {
        console.warn('[xr] right_quest2_controller_world not found, using whole model clone');
        nodeR = fbx.clone();
      }

      // 左コントローラ用クローン
      _modelL = nodeL.clone ? nodeL.clone() : nodeL;
      _applyControllerModelCorrection(_modelL, 'left');

      // 右コントローラ用クローン (nodeL と nodeR が別オブジェクトでも clone)
      _modelR = nodeR.clone ? nodeR.clone() : nodeR;
      _applyControllerModelCorrection(_modelR, 'right');

      console.log('[xr] controller models loaded');

      // セッション中なら即アタッチ
      if (_isXRActive) {
        if (_gripL && _modelL) _gripL.add(_modelL);
        if (_gripR && _modelR) _gripR.add(_modelR);
      }
    },
    undefined,
    (err) => {
      console.warn('[xr] FBX load error, controllers invisible', err);
    }
  );
}

/**
 * grip 座標系に合わせてコントローラモデルを補正する。
 * FBX のスケールは通常 cm 単位なので 0.01 でメートルに変換。
 *
 * @param {Object3D} model
 * @param {'left'|'right'} hand
 */
function _applyControllerModelCorrection(model, hand) {
  // FBX は通常 cm スケール → m に変換
  model.scale.setScalar(0.01);
  // grip 空間の初期向きに合わせた補正 (FBX モデルの実際の向きに合わせて調整可)
  model.rotation.set(0, 0, 0);
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

      // Meta Quest 2: Y=buttons[4] (上昇), X=buttons[3] (下降)
      goUp   = !!(gp.buttons[4]?.pressed);
      goDown = !!(gp.buttons[3]?.pressed);
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
