/**
 * clean_logic.js
 *
 * logic.js の難読化を廃止し、three.module.js (r160) をベースに再構成した
 * 非難読化されたクリーンなアプリケーション・ロジックモジュール。
 */

import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  DirectionalLight,
  AmbientLight,
  GridHelper,
  Clock,
  Vector3,
  Quaternion,
  Euler,
  MathUtils,
  Object3D,
  Group,
  Color,
  FileLoader,
  AnimationClip,
  AnimationMixer,
  LoopOnce,
  LoopRepeat,
  Spherical,
  AudioListener,
  Audio,
  AudioLoader,
  Mesh,
  BoxGeometry,
  CapsuleGeometry,
  Matrix4,
  SphereGeometry,
  MeshBasicMaterial,
  Vector2,
  LineSegments,
  ArrowHelper,
  LineBasicMaterial,
  LoadingManager
} from './three.module.js';

import { OrbitControls } from './OrbitControls.js';
import { MMDLoader } from './MMDLoader.js';
import { MMDAnimationHelper } from './MMDAnimationHelper.js';
import { MMDPhysics } from './MMDPhysics.js';
import { TGALoader } from './TGALoader.js';

// -------------------------------------------------------
// 1. アプリケーション共通ユーティリティ
// -------------------------------------------------------

/** State Store Class (jd 相当) */
export class jd {
  constructor(initialState = {}) {
    this.state = {
      isLoading: false,
      isMotionLoading: false,
      isCameraMotionLoading: false,
      isGyroEnabled: false,
      isFullscreen: false,
      isPlaying: false,
      isLooping: false,
      hasMotion: false,
      errorMessage: null,
      modelLoadError: null,
      motionLoadError: null,
      cameraMotionLoadError: null,
      pendingModelLoadName: null,
      pendingMotionLoadNames: [],
      pendingCameraMotionLoadNames: [],
      loadedModel: null,
      loadedMotions: [],
      loadedCameraMotions: [],
      suspiciousMaterials: [],
      materialVisibilityOverrides: {},
      activeCameraMotionFileName: null,
      trackingBoneName: null,
      settings: {
        backgroundColor: '#000000',
        backgroundMode: 'grid',
        isAutoRestoreEnabled: true,
        isScreenAwakeEnabled: false,
        isDebugModeEnabled: false,
        isShadowEnabled: false,
        isPhysicsSensorEnabled: false,
        gravityMagnitude: 9.8,
        physicsSensorImpulseSensitivity: 1.0,
        isGravityVectorVisible: false,
        isRotationCenterMarkerVisible: false,
        isTrackingEnabled: true,
        trackingBoneName: null,
        gyroMode: 'lookAt',
        gyroViewpointSensitivity: 1.0,
        gyroModelCenterSensitivity: 1.0,
        isGyroEnabled: false,
      },
      ...initialState
    };
    this.listeners = [];
  }

  getState() {
    return this.state;
  }

  setState(nextState) {
    if (nextState.settings) {
      nextState.settings = { ...this.state.settings, ...nextState.settings };
    }
    this.state = { ...this.state, ...nextState };
    this.listeners.forEach(l => l(this.state));
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  reset() {
    this.setState({
      loadedMotions: [],
      loadedCameraMotions: [],
      activeCameraMotionFileName: null,
      isPlaying: false,
      hasMotion: false,
      errorMessage: null,
      modelLoadError: null,
      motionLoadError: null,
      cameraMotionLoadError: null
    });
  }
}

/** Screen WakeLock Helper Class (mu 相当) */
export class mu {
  constructor() {
    this.sentinel = null;
  }

  async setEnabled(enabled) {
    if (enabled) {
      if ('wakeLock' in navigator) {
        try {
          this.sentinel = await navigator.wakeLock.request('screen');
          console.debug('[wakelock] screen wake lock acquired');
        } catch (err) {
          console.warn('[wakelock] screen wake lock request failed', err);
        }
      }
    } else {
      if (this.sentinel) {
        try {
          await this.sentinel.release();
          console.debug('[wakelock] screen wake lock released');
        } catch (err) {
          console.warn('[wakelock] screen wake lock release failed', err);
        }
        this.sentinel = null;
      }
    }
  }
}

/** Fullscreen API Helpers (Ul, Hl, Vl, Bl 相当) */
export const Hl = () => {
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  );
};

export const Vl = async () => {
  const exit =
    document.exitFullscreen ||
    document.webkitExitFullscreen ||
    document.mozCancelFullScreen ||
    document.msExitFullscreen;
  if (exit) {
    await exit.call(document);
  }
};

export const Bl = async (el) => {
  const req =
    el.requestFullscreen ||
    el.webkitRequestFullscreen ||
    el.mozRequestFullScreen ||
    el.msRequestFullscreen;
  if (req) {
    await req.call(el);
  }
};

export const Ul = (callback) => {
  const events = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
  const handler = () => {
    callback(Hl());
  };
  events.forEach(ev => document.addEventListener(ev, handler));
  return () => {
    events.forEach(ev => document.removeEventListener(ev, handler));
  };
};

/** Default Tracking Bone Auto-selector Helper (_u 相当) */
export const _u = (boneNames) => {
  const priorities = ['頭', '首', 'センター', 'head', 'neck', 'center'];
  for (const p of priorities) {
    const found = boneNames.find(name => name.includes(p));
    if (found) return found;
  }
  return boneNames[0] || null;
};

/** Active bone list extractor (gu 相当) */
export const gu = (model) => {
  const boneNames = [];
  model.traverse(child => {
    if (child.isSkinnedMesh) {
      child.skeleton.bones.forEach(bone => {
        if (bone.name && !boneNames.includes(bone.name)) {
          boneNames.push(bone.name);
        }
      });
    }
  });
  return boneNames;
};

// -------------------------------------------------------
// 2. IndexedDB キャッシュ管理
// -------------------------------------------------------

const DB_NAME = 'handystage';
const DB_VERSION = 1;
const STORE_NAME = 'session';
const KEY_PATH = 'current';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error || new Error('IndexedDB open failed.'));
    };
  });
}

function runTransaction(db, mode, callback) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const req = callback(store);
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error || new Error('IndexedDB request failed.'));
    };
    tx.onerror = () => {
      reject(tx.error || new Error('IndexedDB transaction failed.'));
    };
  });
}

function getDefaultSessionState() {
  return {
    id: KEY_PATH,
    modelFiles: [],
    modelVmds: [],
    cameraVmds: [],
    activeModelVmdFileNames: [],
    activeCameraMotionFileName: null,
    isLooping: false,
    savedAt: Date.now()
  };
}

let cachedSession = getDefaultSessionState();
let dbWriteQueue = Promise.resolve();

async function getPersistedSession() {
  const db = await openDb();
  try {
    const session = await runTransaction(db, 'readonly', store => store.get(KEY_PATH));
    return session || null;
  } finally {
    db.close();
  }
}

async function putPersistedSession(session) {
  const db = await openDb();
  try {
    await runTransaction(db, 'readwrite', store => store.put(session));
  } finally {
    db.close();
  }
}

async function deletePersistedSession() {
  const db = await openDb();
  try {
    await runTransaction(db, 'readwrite', store => store.delete(KEY_PATH));
  } finally {
    db.close();
  }
}

function enqueueDbWrite(session) {
  dbWriteQueue = dbWriteQueue
    .catch(err => {
      console.warn('[idb] previous queued write failed', err);
    })
    .then(async () => {
      if (session === null) {
        await deletePersistedSession();
      } else {
        await putPersistedSession(session);
      }
    });
  return dbWriteQueue;
}

export async function bd() {
  const session = await getPersistedSession();
  cachedSession = session ?? getDefaultSessionState();
  return session;
}

export async function xd(modelFiles) {
  cachedSession = {
    ...cachedSession,
    modelFiles: modelFiles,
    modelVmds: [],
    cameraVmds: [],
    activeModelVmdFileNames: [],
    activeCameraMotionFileName: null,
    savedAt: Date.now()
  };
  await enqueueDbWrite(cachedSession);
}

export async function Sd(modelVmds) {
  cachedSession = {
    ...cachedSession,
    modelVmds: modelVmds,
    activeModelVmdFileNames: modelVmds.map(m => m.fileName),
    savedAt: Date.now()
  };
  await enqueueDbWrite(cachedSession);
}

export async function Cd(cameraVmds) {
  cachedSession = {
    ...cachedSession,
    cameraVmds: cameraVmds,
    activeCameraMotionFileName: null,
    savedAt: Date.now()
  };
  await enqueueDbWrite(cachedSession);
}

export async function wd(selections) {
  cachedSession = {
    ...cachedSession,
    activeModelVmdFileNames: selections.modelFileNames,
    activeCameraMotionFileName: selections.cameraFileName,
    isLooping: selections.isLooping,
    savedAt: Date.now()
  };
  await enqueueDbWrite(cachedSession);
}

export async function Td() {
  cachedSession = getDefaultSessionState();
  await enqueueDbWrite(null);
}

// Storage Usage Estimation (Yl 相当)
const ST_FAILED = 'ストレージ使用量取得不可';
const ST_LABEL = 'ストレージ使用量';
const ST_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const t = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), ST_UNITS.length - 1);
  const n = bytes / Math.pow(1024, t);
  return `${t === 0 ? String(Math.round(n)) : n.toFixed(1)} ${ST_UNITS[t]}`;
}

export async function Yl() {
  if (!('storage' in navigator) || typeof navigator.storage.estimate !== 'function') {
    return ST_FAILED;
  }
  const estimate = await navigator.storage.estimate();
  const usage = estimate.usage ?? 0;
  const quota = estimate.quota;
  if (quota === undefined) {
    return `${ST_LABEL}: ${formatBytes(usage)}`;
  }
  const percent = quota > 0 ? ` (${(usage / quota * 100).toFixed(1)}%)` : '';
  return [`${ST_LABEL}: ${formatBytes(usage)} / ${formatBytes(quota)}`, percent].join('');
}

// -------------------------------------------------------
// 3. ZIP / PMX / VMD 読み込みロジック
// -------------------------------------------------------

function getNormalizedPath(path) {
  return path.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
}

function getBaseName(path) {
  return path.split('/').pop() || '';
}

function revokeAllUrls(resourceMap) {
  const uniqueUrls = new Set();
  for (const entry of resourceMap.values()) {
    uniqueUrls.add(entry.objectUrl);
  }
  uniqueUrls.forEach(url => URL.revokeObjectURL(url));
}

function createResourceMap(files) {
  const map = new Map();
  for (const file of files) {
    const rawBlob = file.file || file.blob;
    if (!rawBlob) continue;
    const objectUrl = URL.createObjectURL(rawBlob);
    map.set(file.path, { objectUrl });
    map.set(file.name, { objectUrl });
  }
  return map;
}

function redirectUrl(url, resourceMap) {
  if (url.startsWith('data:')) return null;
  const normalizedKey = getNormalizedPath(decodeURIComponent(url));
  const entry = resourceMap.get(normalizedKey);
  if (entry) return entry.objectUrl;

  const baseName = normalizedKey.split('/').pop();
  if (baseName) {
    const nameEntry = resourceMap.get(baseName);
    if (nameEntry) return nameEntry.objectUrl;
  }
  return null;
}

function getSkinnedMesh(root) {
  if (root.isSkinnedMesh) return root;
  let mesh = null;
  root.traverse(child => {
    if (mesh === null && child.isSkinnedMesh) {
      mesh = child;
    }
  });
  return mesh;
}

export function Wl() {
  return new Promise(async (resolve, reject) => {
    console.debug('[physics] Ammo.js load start');
    try {
      let ammo = globalThis.Ammo;
      if (ammo === undefined) {
        console.warn('[physics] Ammo not found on globalThis; physics disabled');
        resolve(false);
        return;
      }
      if (typeof ammo === 'function') {
        ammo = await ammo();
      }
      if (ammo && typeof ammo.btVector3 === 'function') {
        globalThis.Ammo = ammo;
        console.debug('[physics] Ammo.js load complete');
        resolve(true);
      } else {
        console.warn('[physics] Ammo namespace shape unexpected');
        resolve(false);
      }
    } catch (e) {
      console.warn('[physics] Ammo.js load failed; physics disabled', e);
      resolve(false);
    }
  });
}

function loadModelPromise(pmxUrl, loader) {
  return new Promise((resolve, reject) => {
    loader.load(
      pmxUrl,
      mesh => resolve(mesh),
      undefined,
      err => reject(err)
    );
  });
}

async function parseModelFiles(normalizedFiles) {
  const pmxFile = normalizedFiles.find(f => f.name.endsWith('.pmx'));
  if (!pmxFile) {
    throw new Error('No .pmx file was found in the selected files.');
  }

  const resourceMap = createResourceMap(normalizedFiles);
  const pmxEntry = resourceMap.get(pmxFile.path);
  if (!pmxEntry) {
    revokeAllUrls(resourceMap);
    throw new Error('Failed to create an Object URL for the PMX file.');
  }

  const pmxUrl = `${pmxEntry.objectUrl}#${pmxFile.name}`;
  const manager = new LoadingManager();
  manager.setURLModifier(url => redirectUrl(url, resourceMap) || url);
  const loader = new MMDLoader(manager);

  try {
    const mmdMesh = await loadModelPromise(pmxUrl, loader);
    return {
      model: mmdMesh,
      fileName: pmxFile.name,
      cachedBlobs: normalizedFiles.map(f => ({
        path: f.path,
        blob: f.file || f.blob
      })),
      dispose: () => revokeAllUrls(resourceMap)
    };
  } catch (err) {
    revokeAllUrls(resourceMap);
    throw err;
  }
}

export async function zu(files) {
  const fileList = Array.from(files);
  const isZip = fileList.length === 1 && fileList[0].name.toLowerCase().endsWith('.zip');

  if (isZip) {
    const zipFile = fileList[0];
    const { extractZipEntries } = await import('./zip-loader.js');
    const entries = await extractZipEntries(zipFile);
    const normalized = entries.map(e => ({
      path: getNormalizedPath(e.path),
      name: getBaseName(e.path).toLowerCase(),
      blob: e.blob
    }));
    return parseModelFiles(normalized);
  }

  const normalized = fileList.map(f => ({
    path: getNormalizedPath(f.webkitRelativePath || f.name),
    name: f.name.toLowerCase(),
    file: f
  }));
  return parseModelFiles(normalized);
}

export async function Bu(cachedBlobs) {
  const normalized = cachedBlobs.map(cb => {
    const normPath = getNormalizedPath(cb.path);
    return {
      path: normPath,
      name: getBaseName(normPath).toLowerCase(),
      blob: cb.blob
    };
  });
  return parseModelFiles(normalized);
}

function loadVmdPromise(vmdUrl, loader, mesh, source) {
  return new Promise((resolve, reject) => {
    loader.loadVMD(
      vmdUrl,
      vmd => {
        const clip = loader.animationBuilder.build(vmd, mesh);
        resolve({
          clip: clip,
          fileName: source.fileName,
          sourceBlob: source.blob,
          dispose: () => URL.revokeObjectURL(vmdUrl.split('#')[0])
        });
      },
      undefined,
      err => {
        URL.revokeObjectURL(vmdUrl.split('#')[0]);
        reject(err);
      }
    );
  });
}

function loadCameraVmdPromise(vmdUrl, loader, source) {
  return new Promise((resolve, reject) => {
    loader.loadVMD(
      vmdUrl,
      vmd => {
        const clip = loader.animationBuilder.buildCameraAnimation(vmd);
        resolve({
          clip: clip,
          fileName: source.fileName,
          sourceBlob: source.blob,
          dispose: () => URL.revokeObjectURL(vmdUrl.split('#')[0])
        });
      },
      undefined,
      err => {
        URL.revokeObjectURL(vmdUrl.split('#')[0]);
        reject(err);
      }
    );
  });
}

async function loadSingleVmd(source, mesh) {
  const objectUrl = URL.createObjectURL(source.blob);
  const vmdUrl = `${objectUrl}#${source.fileName}`;
  const loader = new MMDLoader();
  return loadVmdPromise(vmdUrl, loader, mesh, source);
}

async function loadSingleCameraVmd(source) {
  const objectUrl = URL.createObjectURL(source.blob);
  const vmdUrl = `${objectUrl}#${source.fileName}`;
  const loader = new MMDLoader();
  return loadCameraVmdPromise(vmdUrl, loader, source);
}

async function executeVmdsLoad(sources, mesh) {
  const loaded = [];
  let failed = false;
  try {
    const results = await Promise.all(
      sources.map(async s => {
        const res = await loadSingleVmd(s, mesh);
        if (failed) {
          res.dispose();
          throw new Error('VMD load was cancelled.');
        }
        loaded.push(res);
        return res;
      })
    );
    return results;
  } catch (err) {
    failed = true;
    loaded.forEach(l => l.dispose());
    throw err;
  }
}

async function executeCameraVmdsLoad(sources) {
  const loaded = [];
  let failed = false;
  try {
    const results = await Promise.all(
      sources.map(async s => {
        const res = await loadSingleCameraVmd(s);
        if (failed) {
          res.dispose();
          throw new Error('Camera VMD load was cancelled.');
        }
        loaded.push(res);
        return res;
      })
    );
    return results;
  } catch (err) {
    failed = true;
    loaded.forEach(l => l.dispose());
    throw err;
  }
}

export async function ed(files, mesh) {
  const sources = files.map(f => ({ fileName: f.name, blob: f }));
  return executeVmdsLoad(sources, mesh);
}

export async function td(blobs, mesh) {
  return executeVmdsLoad(blobs, mesh);
}

export async function id(files) {
  const sources = files.map(f => ({ fileName: f.name, blob: f }));
  return executeCameraVmdsLoad(sources);
}

export async function ad(blobs) {
  return executeCameraVmdsLoad(blobs);
}

// -------------------------------------------------------
// 4. ジャイロコントローラー
// -------------------------------------------------------

const SMOOTH_LAG = 0.5;
const GYRO_MIN_POLAR = 0.1;
const GYRO_MAX_POLAR = Math.PI - 0.1;

function makeDeviceQuaternion(alpha, beta, gamma) {
  const euler = new Euler(MathUtils.degToRad(beta), MathUtils.degToRad(alpha), MathUtils.degToRad(-gamma), 'YXZ');
  const q = new Quaternion().setFromEuler(euler);
  const alignBase = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  q.multiply(alignBase);
  return q;
}

function wrapAngle(val, baseline) {
  const doublePi = Math.PI * 2;
  let diff = (val - baseline) % doublePi;
  if (diff > Math.PI) diff -= doublePi;
  if (diff < -Math.PI) diff += doublePi;
  return diff;
}

function getSpherical(pos) {
  const len = Math.max(pos.length(), 0.001);
  return {
    radius: len,
    phi: Math.acos(MathUtils.clamp(pos.y / len, -1, 1)),
    theta: Math.atan2(pos.x, pos.z)
  };
}

export class cu {
  constructor() {
    this.isActive = false;
    this.viewpointSensitivity = 1.0;
    this.modelCenterSensitivity = 1.0;
    this.mode = 'viewpoint';
    this.modelCenterContext = null;

    this.baselineDeviceQuaternion = null;
    this.baselineOrientation = null;
    this.baselineCameraQuaternion = new Quaternion();
    this.baselineAzimuth = 0;
    this.baselinePolar = Math.PI / 2;
    this.baselineDistance = 1.0;

    this.appliedGyroAzimuth = 0;
    this.appliedGyroPolar = 0;

    this.smoothedQuaternion = null;
    this.smoothedPosition = null;
    this.modelCenterTargetPosition = null;

    this.latestEvent = null;

    this.handler = e => {
      if (e.alpha !== null && e.beta !== null && e.gamma !== null) {
        this.latestEvent = { alpha: e.alpha, beta: e.beta, gamma: e.gamma };
      }
    };
  }

  setModelCenterContext(ctx) {
    this.modelCenterContext = ctx;
    this.captureModelCenterBaseline();
    this.resetSmoothing();
  }

  start(camera) {
    if (!this.isActive) {
      this.isActive = true;
      this.captureCameraBaseline(camera);
      this.resetAppliedGyroOffset();
      this.resetDeviceBaseline();
      this.resetSmoothing();
      this.latestEvent = null;
      window.addEventListener('deviceorientation', this.handler);
    }
  }

  stop() {
    if (this.isActive) {
      this.isActive = false;
      window.removeEventListener('deviceorientation', this.handler);
      this.latestEvent = null;
      this.resetAppliedGyroOffset();
      this.resetDeviceBaseline();
      this.resetSmoothing();
    }
  }

  recalibrate(camera) {
    if (!this.isActive) return;
    if (this.mode === 'modelCenter' && this.modelCenterContext !== null) {
      this.snapModelCenterCameraToNeutral(camera);
    } else {
      this.snapViewpointCameraToNeutral(camera);
    }
    this.resetAppliedGyroOffset();

    if (this.latestEvent === null) {
      this.resetDeviceBaseline();
    } else {
      this.baselineDeviceQuaternion = makeDeviceQuaternion(
        this.latestEvent.alpha,
        this.latestEvent.beta,
        this.latestEvent.gamma
      );
      this.baselineOrientation = { ...this.latestEvent };
    }

    if (this.mode === 'modelCenter') {
      this.smoothedPosition = camera.position.clone();
      this.modelCenterTargetPosition = camera.position.clone();
      this.smoothedQuaternion = null;
    } else {
      this.smoothedQuaternion = this.baselineCameraQuaternion.clone();
      this.smoothedPosition = null;
      this.modelCenterTargetPosition = null;
    }
  }

  setMode(mode, camera) {
    this.mode = mode;
    this.captureCameraBaseline(camera);
    this.resetAppliedGyroOffset();
    this.resetDeviceBaseline();
    this.resetSmoothing();
  }

  setViewpointSensitivity(val) {
    this.viewpointSensitivity = MathUtils.clamp(val, 0.1, 3.0);
  }

  setModelCenterSensitivity(val) {
    this.modelCenterSensitivity = MathUtils.clamp(val, 0.1, 3.0);
  }

  updateCamera(camera) {
    if (!this.isActive || this.latestEvent === null) return;
    const deviceQ = makeDeviceQuaternion(this.latestEvent.alpha, this.latestEvent.beta, this.latestEvent.gamma);

    if (this.baselineDeviceQuaternion === null) {
      this.baselineDeviceQuaternion = deviceQ.clone();
      this.baselineOrientation = { ...this.latestEvent };
      return;
    }

    if (this.mode === 'modelCenter') {
      this.updateModelCenterCamera(camera);
      return;
    }

    const relQ = new Quaternion().copy(this.baselineDeviceQuaternion).invert().multiply(deviceQ);
    const interpQ = new Quaternion().identity().slerp(relQ, this.viewpointSensitivity);
    const targetQ = new Quaternion().copy(this.baselineCameraQuaternion).multiply(interpQ);

    if (this.smoothedQuaternion === null) {
      this.smoothedQuaternion = targetQ.clone();
    } else {
      this.smoothedQuaternion.slerp(targetQ, SMOOTH_LAG);
    }
    camera.quaternion.copy(this.smoothedQuaternion);
  }

  updateModelCenterCamera(camera) {
    if (this.modelCenterContext === null || this.baselineDeviceQuaternion === null || this.latestEvent === null) return;
    const deviceQ = makeDeviceQuaternion(this.latestEvent.alpha, this.latestEvent.beta, this.latestEvent.gamma);
    const target = this.modelCenterContext.target;

    this.syncExternalModelCenterCameraMove(camera);

    const anchorPos = this.modelCenterTargetPosition ?? camera.position;
    const spherical = getSpherical(new Vector3().copy(anchorPos).sub(target));

    const baselineEuler = new Euler().setFromQuaternion(this.baselineDeviceQuaternion, 'YXZ');
    const currentEuler = new Euler().setFromQuaternion(deviceQ, 'YXZ');

    const diffAzimuth = wrapAngle(currentEuler.y, baselineEuler.y);
    const diffPolar = wrapAngle(currentEuler.x, baselineEuler.x);

    const adjustAzimuth = -diffAzimuth * this.modelCenterSensitivity;
    const adjustPolar = -diffPolar * this.modelCenterSensitivity;

    const angleAzimuth = spherical.theta - this.appliedGyroAzimuth + adjustAzimuth;
    const anglePolar = MathUtils.clamp(spherical.phi - this.appliedGyroPolar + adjustPolar, GYRO_MIN_POLAR, GYRO_MAX_POLAR);

    this.appliedGyroAzimuth = angleAzimuth - (spherical.theta - this.appliedGyroAzimuth);
    this.appliedGyroPolar = anglePolar - (spherical.phi - this.appliedGyroPolar);

    const rad = Math.max(spherical.radius, 0.001);
    const offset = new Vector3().setFromSphericalCoords(rad, anglePolar, angleAzimuth);
    const targetPos = new Vector3().copy(this.modelCenterContext.target).add(offset);

    if (this.modelCenterTargetPosition === null) {
      this.modelCenterTargetPosition = targetPos.clone();
    } else {
      this.modelCenterTargetPosition.copy(targetPos);
    }

    if (this.smoothedPosition === null) {
      this.smoothedPosition = targetPos.clone();
    } else {
      this.smoothedPosition.lerp(targetPos, SMOOTH_LAG);
    }

    camera.position.copy(this.smoothedPosition);
    camera.lookAt(target);
  }

  captureCameraBaseline(camera) {
    this.baselineCameraQuaternion.copy(camera.quaternion);
    this.captureModelCenterBaseline(camera);
  }

  captureModelCenterBaseline(camera) {
    if (this.modelCenterContext === null) return;
    const target = this.modelCenterContext.target;
    const diff = camera === undefined
      ? new Vector3(0, 0, this.modelCenterContext.getCurrentDistance())
      : new Vector3().copy(camera.position).sub(target);

    this.baselineDistance = Math.max(diff.length(), 0.001);
    this.baselineAzimuth = Math.atan2(diff.x, diff.z);
    this.baselinePolar = MathUtils.clamp(
      Math.acos(MathUtils.clamp(diff.y / this.baselineDistance, -1, 1)),
      GYRO_MIN_POLAR,
      GYRO_MAX_POLAR
    );
  }

  snapModelCenterCameraToNeutral(camera) {
    if (this.modelCenterContext === null) return;
    const target = this.modelCenterContext.target;
    const dist = this.modelCenterContext.getCurrentDistance();
    const r = Math.max(dist, this.baselineDistance, 0.001);

    this.baselineAzimuth = 0;
    this.baselinePolar = Math.PI / 2;
    this.baselineDistance = r;

    const offset = new Vector3().setFromSphericalCoords(r, this.baselinePolar, this.baselineAzimuth);
    camera.position.copy(target).add(offset);
    camera.lookAt(target);

    this.baselineCameraQuaternion.copy(camera.quaternion);
    this.modelCenterTargetPosition = camera.position.clone();
    this.smoothedPosition = camera.position.clone();
  }

  snapViewpointCameraToNeutral(camera) {
    if (this.modelCenterContext === null) {
      this.baselineCameraQuaternion.copy(camera.quaternion);
      return;
    }
    camera.lookAt(this.modelCenterContext.target);
    this.baselineCameraQuaternion.copy(camera.quaternion);
  }

  resetDeviceBaseline() {
    this.baselineDeviceQuaternion = null;
    this.baselineOrientation = null;
  }

  resetAppliedGyroOffset() {
    this.appliedGyroAzimuth = 0;
    this.appliedGyroPolar = 0;
  }

  resetSmoothing() {
    this.smoothedQuaternion = null;
    this.smoothedPosition = null;
    this.modelCenterTargetPosition = null;
  }

  syncExternalModelCenterCameraMove(camera) {
    if (this.smoothedPosition === null || this.modelCenterTargetPosition === null) return;
    if (camera.position.distanceToSquared(this.smoothedPosition) > 0.001) {
      this.modelCenterTargetPosition.copy(camera.position);
      this.smoothedPosition.copy(camera.position);
    }
  }
}

// -------------------------------------------------------
// 5. MMDAnimationHelper ラッパー (Il 相当)
// -------------------------------------------------------

const VMD_TRANSITION_DURATION = 0.5;
const GRAVITY_THRESHOLD = 0.1;

export class Il {
  constructor(physicsReadyPromise) {
    this.physicsReady = physicsReadyPromise;
    this.helper = new MMDAnimationHelper({
      afterglow: 2.0,
      resetPhysicsOnLoop: true
    });
    this.physicsSensor = new Nl();
    this.currentMesh = null;
    this.currentAction = null;
    this.currentActions = new Map();
    this.currentClips = [];
    this.modelWeightTransitions = new Map();
    
    this.currentCamera = null;
    this.cameraActions = new Map();
    this.cameraClips = [];
    this.cameraWeightTransitions = new Map();
    this.activeCameraClip = null;
    
    this.hasResetInactiveCamera = true;
    this.isCameraRegistered = false;
    this.isMeshRegistered = false;
    this.isPlaying = false;
    this.isLooping = false;
    this.isLoadingPaused = false;
    this.lastAppliedGravity = null;
    
    this.playbackFinishedCallback = null;
    this.modelMixerListener = null;
    this.cameraMixerListener = null;
    
    this.physicsOnlyRegistrationPromise = null;
    this.physicsOnlyRegistrationMesh = null;
    this.isDebugModeEnabled = false;
  }

  setModel(group) {
    this.removeCurrentMesh();
    this.resetLastAppliedGravity();
    this.currentMesh = getSkinnedMesh(group);
    this.currentAction = null;
    this.currentActions.clear();
    this.currentClips = [];
    this.modelWeightTransitions.clear();
    this.isPlaying = false;

    if (this.currentMesh === null) {
      console.warn('[animation] setModel: SkinnedMesh was not found', group);
      return;
    }
    this.registerPhysicsOnly();
  }

  clearModel() {
    this.clearMotion();
    this.removeCurrentMesh();
    this.resetLastAppliedGravity();
    this.currentAction = null;
    this.currentActions.clear();
    this.currentClips = [];
    this.isPlaying = false;
  }

  getCurrentMesh() {
    return this.currentMesh;
  }

  setCamera(camera) {
    if (this.currentCamera !== camera) {
      this.clearCameraMotions();
      this.removeRegisteredCameraOnly();
      this.currentCamera = camera;
    }
  }

  setPlaybackFinishedCallback(cb) {
    this.playbackFinishedCallback = cb;
  }

  setDebugModeEnabled(enabled) {
    this.isDebugModeEnabled = enabled;
  }

  setLoadingPaused(paused) {
    this.isLoadingPaused = paused;
  }

  async setMotions(clips) {
    if (this.currentMesh === null) {
      console.warn('[animation] setMotions: no SkinnedMesh is available');
      return false;
    }

    const weightSnap = this.createWeightSnapshot(this.currentActions);
    const transSnap = this.createTransitionSnapshot(this.modelWeightTransitions);

    if (!this.isMeshRegistered) {
      await this.registerPhysicsOnly();
    }

    if (!this.isMeshRegistered) {
      this.helper.add(this.currentMesh, { animation: [], physics: false });
      this.isMeshRegistered = true;
      this.resetLastAppliedGravity();
    }

    const mixer = this.ensureModelMixer();
    if (mixer === null) return false;

    this.registerModelMixerFinishedListener();

    const currentKeys = new Set(this.currentActions.keys());
    const newKeys = new Set(clips);
    for (const c of currentKeys) {
      if (!newKeys.has(c)) {
        const action = this.currentActions.get(c);
        if (action) {
          action.stop();
          mixer.uncacheAction(c);
        }
        this.currentActions.delete(c);
        this.modelWeightTransitions.delete(c);
      }
    }

    this.currentClips = clips;
    for (const clip of clips) {
      let action = this.currentActions.get(clip);
      if (action !== undefined) {
        const savedWeight = weightSnap.get(clip.name);
        if (savedWeight !== undefined) action.weight = savedWeight;
        const savedTrans = transSnap.get(clip.name);
        if (savedTrans !== undefined) this.modelWeightTransitions.set(clip, savedTrans);
        continue;
      }

      action = mixer.clipAction(clip);
      action.enabled = true;
      action.weight = 0;
      action.play();

      const savedWeight = weightSnap.get(clip.name);
      if (savedWeight !== undefined) {
        action.weight = savedWeight;
        const savedTrans = transSnap.get(clip.name);
        if (savedTrans !== undefined) this.modelWeightTransitions.set(clip, savedTrans);
      }
      this.currentActions.set(clip, action);
    }

    this.currentAction = this.currentActions.values().next().value ?? null;
    this.syncHelperDuration();
    this.applyLooping();
    this.setPlaying(this.isPlaying);
    return true;
  }

  setMotionActive(clip, active) {
    const action = this.currentActions.get(clip);
    if (action === undefined) return;
    const target = active ? 1.0 : 0.0;
    this.modelWeightTransitions.set(clip, {
      startWeight: action.weight,
      targetWeight: target,
      elapsed: 0,
      duration: VMD_TRANSITION_DURATION,
      hasLoggedFirstStep: false
    });
    action.enabled = true;
    if (!action.isRunning()) action.play();
  }

  async addMotions(clips) {
    const snap = this.createActionStateSnapshot(this.currentActions);
    const combined = [...this.currentClips, ...clips];
    const registered = await this.setMotions(combined);
    if (registered) {
      this.restoreActionStateSnapshot(this.currentActions, snap);
    }
    return registered;
  }

  async removeMotion(clip) {
    const snap = this.createActionStateSnapshot(this.currentActions);
    snap.delete(clip.name);
    const filtered = this.currentClips.filter(c => c !== clip);
    if (filtered.length === 0) {
      this.clearMotion();
      return;
    }
    const registered = await this.setMotions(filtered);
    if (registered) {
      this.restoreActionStateSnapshot(this.currentActions, snap);
    }
  }

  setCameraMotions(clips) {
    if (this.currentCamera === null) return false;
    const weightSnap = this.createWeightSnapshot(this.cameraActions);
    const transSnap = this.createTransitionSnapshot(this.cameraWeightTransitions);

    this.activeCameraClip = null;
    this.hasResetInactiveCamera = true;

    if (!this.isCameraRegistered) {
      this.helper.add(this.currentCamera, { animation: [] });
      this.isCameraRegistered = true;
      this.registerCameraMixerFinishedListener();
    }

    const mixer = this.getCameraMixer();
    if (mixer === null) return false;

    const currentKeys = new Set(this.cameraActions.keys());
    const newKeys = new Set(clips);
    for (const c of currentKeys) {
      if (!newKeys.has(c)) {
        const action = this.cameraActions.get(c);
        if (action) {
          action.stop();
          mixer.uncacheAction(c);
        }
        this.cameraActions.delete(c);
        this.cameraWeightTransitions.delete(c);
      }
    }

    this.cameraClips = clips;
    for (const clip of clips) {
      let action = this.cameraActions.get(clip);
      if (action !== undefined) {
        const savedWeight = weightSnap.get(clip.name);
        if (savedWeight !== undefined) action.weight = savedWeight;
        const savedTrans = transSnap.get(clip.name);
        if (savedTrans !== undefined) this.cameraWeightTransitions.set(clip, savedTrans);
        continue;
      }

      action = mixer.clipAction(clip);
      const savedWeight = weightSnap.get(clip.name);
      if (savedWeight !== undefined) {
        action.weight = savedWeight;
        const savedTrans = transSnap.get(clip.name);
        if (savedTrans !== undefined) this.cameraWeightTransitions.set(clip, savedTrans);
      } else {
        action.weight = 0;
      }
      action.enabled = true;
      action.play();
      this.cameraActions.set(clip, action);
    }

    this.syncHelperDuration();
    this.applyLooping();
    this.setPlaying(this.isPlaying);
    return true;
  }

  addCameraMotions(clips) {
    const snap = this.createActionStateSnapshot(this.cameraActions);
    const combined = [...this.cameraClips, ...clips];
    const registered = this.setCameraMotions(combined);
    if (registered) {
      this.restoreActionStateSnapshot(this.cameraActions, snap);
    }
    return registered;
  }

  removeCameraMotion(clip) {
    const snap = this.createActionStateSnapshot(this.cameraActions);
    snap.delete(clip.name);
    const filtered = this.cameraClips.filter(c => c !== clip);
    if (filtered.length === 0) {
      this.clearCameraMotions();
      return;
    }
    const registered = this.setCameraMotions(filtered);
    if (registered) {
      this.restoreActionStateSnapshot(this.cameraActions, snap);
    }
  }

  setActiveCameraMotion(clip) {
    this.activeCameraClip = clip;
    for (const [c, action] of this.cameraActions) {
      const active = c === clip ? 1.0 : 0.0;
      this.cameraWeightTransitions.set(c, {
        startWeight: action.weight,
        targetWeight: active,
        elapsed: 0,
        duration: VMD_TRANSITION_DURATION,
        hasLoggedFirstStep: false
      });
      action.enabled = true;
      if (!action.isRunning()) action.play();
    }
    this.hasResetInactiveCamera = clip !== null;
  }

  setPlaying(playing) {
    this.isPlaying = playing;
    for (const action of this.getAllActions()) {
      const duration = action.getClip().duration;
      if (playing && action.time >= duration) {
        action.reset();
      }
      action.paused = !playing;
      if (playing) action.play();
    }
  }

  setLooping(looping) {
    this.isLooping = looping;
    this.applyLooping();
  }

  setPhysicsSensorEnabled(enabled) {
    this.physicsSensor.setEnabled(enabled);
    this.resetLastAppliedGravity();
  }

  setPhysicsSensorImpulseSensitivity(val) {
    this.physicsSensor.setImpulseSensitivity(val);
  }

  setGravityMagnitude(val) {
    this.physicsSensor.setGravityMagnitude(val);
    this.resetLastAppliedGravity();
  }

  recalibratePhysicsSensor() {
    this.physicsSensor.recalibrate();
    this.resetLastAppliedGravity();
  }

  getPhysicsSensor() {
    return this.physicsSensor;
  }

  resetMotions() {
    for (const action of this.getAllActions()) {
      action.time = 0;
    }
    if (this.isMeshRegistered || this.isCameraRegistered) {
      this.helper.update(0);
    }
  }

  clearMotion() {
    const mixer = this.getModelMixer();
    if (mixer !== null) {
      for (const [clip, action] of this.currentActions) {
        action.stop();
        mixer.uncacheAction(clip);
      }
    }
    this.currentAction = null;
    this.currentActions.clear();
    this.currentClips = [];
    this.modelWeightTransitions.clear();
    this.isPlaying = false;
  }

  clearCameraMotions() {
    const mixer = this.getCameraMixer();
    if (mixer !== null) {
      for (const [clip, action] of this.cameraActions) {
        action.stop();
        mixer.uncacheAction(clip);
      }
    }
    this.cameraActions.clear();
    this.cameraClips = [];
    this.cameraWeightTransitions.clear();
    this.activeCameraClip = null;
    this.hasResetInactiveCamera = true;
    this.resetRenderCameraLocal();
  }

  update(delta) {
    if (!this.isMeshRegistered && !this.isCameraRegistered) return;
    this.applyWeightTransitions(delta);
    this.applyPhysicsSensor();
    this.helper.update(delta);
  }

  removeCurrentMesh() {
    this.removeRegisteredMeshOnly();
    this.currentMesh = null;
  }

  removeRegisteredMeshOnly() {
    if (this.currentMesh !== null && this.isMeshRegistered) {
      this.removeModelMixerFinishedListener();
      this.helper.remove(this.currentMesh);
      this.isMeshRegistered = false;
      this.resetLastAppliedGravity();
    }
  }

  removeRegisteredCameraOnly() {
    if (this.currentCamera !== null && this.isCameraRegistered) {
      this.removeCameraMixerFinishedListener();
      this.helper.remove(this.currentCamera);
      this.isCameraRegistered = false;
    }
  }

  resetRenderCameraLocal() {
    if (this.currentCamera !== null) {
      this.currentCamera.position.set(0, 0, 0);
      this.currentCamera.quaternion.identity();
      this.currentCamera.updateMatrixWorld(true);
    }
  }

  resetMeshToRestPose(mesh) {
    mesh.skeleton.pose();
    mesh.updateMatrixWorld(true);
    if (mesh.morphTargetInfluences !== undefined) {
      mesh.morphTargetInfluences.fill(0);
    }
    mesh.traverse(child => {
      if (child.morphTargetInfluences !== undefined) {
        child.morphTargetInfluences.fill(0);
      }
    });
    mesh.updateMatrixWorld(true);
  }

  async registerPhysicsOnly() {
    if (this.currentMesh === null || this.isMeshRegistered || this.currentClips.length > 0) return;
    if (this.physicsOnlyRegistrationPromise !== null && this.physicsOnlyRegistrationMesh === this.currentMesh) {
      await this.physicsOnlyRegistrationPromise;
      return;
    }

    const promise = this.doRegisterPhysicsOnly();
    this.physicsOnlyRegistrationPromise = promise;
    this.physicsOnlyRegistrationMesh = this.currentMesh;
    try {
      await promise;
    } finally {
      if (this.physicsOnlyRegistrationPromise === promise) {
        this.physicsOnlyRegistrationPromise = null;
        this.physicsOnlyRegistrationMesh = null;
      }
    }
  }

  async doRegisterPhysicsOnly() {
    if (this.currentMesh === null || this.isMeshRegistered || this.currentClips.length > 0) return;
    const mesh = this.currentMesh;
    const active = await this.physicsReady;
    if (!active || this.currentMesh !== mesh || this.isMeshRegistered || this.currentClips.length > 0) return;

    this.helper.add(mesh, { physics: true });
    this.isMeshRegistered = true;
    this.resetLastAppliedGravity();
    this.registerModelMixerFinishedListener();
  }

  applyWeightTransitions(delta) {
    this.applyTransitionMap(this.modelWeightTransitions, this.currentActions, delta);
    this.applyTransitionMap(this.cameraWeightTransitions, this.cameraActions, delta);
    if (this.activeCameraClip === null && !this.hasResetInactiveCamera && this.cameraWeightTransitions.size === 0) {
      this.resetRenderCameraLocal();
      this.hasResetInactiveCamera = true;
    }
  }

  applyTransitionMap(transitionMap, actionMap, delta) {
    for (const [clip, trans] of transitionMap) {
      const action = actionMap.get(clip);
      if (action === undefined) {
        transitionMap.delete(clip);
        continue;
      }
      trans.elapsed += delta;
      const alpha = Math.min(trans.elapsed / trans.duration, 1.0);
      const smoothAlpha = 0.5 * (1.0 - Math.cos(Math.PI * alpha));
      action.weight = trans.startWeight + (trans.targetWeight - trans.startWeight) * smoothAlpha;

      if (alpha >= 1.0) {
        action.weight = trans.targetWeight;
        transitionMap.delete(clip);
      }
    }
  }

  applyPhysicsSensor() {
    if (this.currentMesh === null || !this.isMeshRegistered) return;
    const physics = this.helper.objects.get(this.currentMesh)?.physics;
    if (!physics || !physics.world) return;

    const ammo = getAmmo();
    if (ammo === null || this.currentCamera === null) return;

    const gravityVec = this.physicsSensor.getGravityVector(this.currentCamera);
    if (this.shouldApplyGravity(gravityVec)) {
      const ammoGravity = new ammo.btVector3(gravityVec.x, gravityVec.y, gravityVec.z);
      physics.world.setGravity(ammoGravity);
      if (ammo.destroy) ammo.destroy(ammoGravity);
      this.updateLastAppliedGravity(gravityVec);
    }

    const impulse = this.physicsSensor.consumePendingImpulse();
    if (impulse === null || !physics.bodies) return;

    const ammoImpulse = new ammo.btVector3(impulse.x, impulse.y, impulse.z);
    for (const bodyObj of physics.bodies) {
      bodyObj.body.applyCentralImpulse(ammoImpulse);
    }
    if (ammo.destroy) ammo.destroy(ammoImpulse);
  }

  shouldApplyGravity(vec) {
    return this.lastAppliedGravity === null || vec.distanceTo(this.lastAppliedGravity) > GRAVITY_THRESHOLD;
  }

  updateLastAppliedGravity(vec) {
    if (this.lastAppliedGravity === null) {
      this.lastAppliedGravity = vec.clone();
    } else {
      this.lastAppliedGravity.copy(vec);
    }
  }

  resetLastAppliedGravity() {
    this.lastAppliedGravity = null;
  }

  registerModelMixerFinishedListener() {
    this.removeModelMixerFinishedListener();
    if (this.currentMesh === null) return;
    const mixer = this.helper.objects.get(this.currentMesh)?.mixer;
    if (mixer !== undefined) {
      this.modelMixerListener = () => this.handleAnimationFinished();
      mixer.addEventListener('finished', this.modelMixerListener);
    }
  }

  removeModelMixerFinishedListener() {
    if (this.currentMesh === null || this.modelMixerListener === null) {
      this.modelMixerListener = null;
      return;
    }
    const mixer = this.helper.objects.get(this.currentMesh)?.mixer;
    if (mixer !== undefined) {
      mixer.removeEventListener('finished', this.modelMixerListener);
    }
    this.modelMixerListener = null;
  }

  registerCameraMixerFinishedListener() {
    this.removeCameraMixerFinishedListener();
    if (this.currentCamera === null) return;
    const mixer = this.helper.objects.get(this.currentCamera)?.mixer;
    if (mixer !== undefined) {
      this.cameraMixerListener = () => this.handleAnimationFinished();
      mixer.addEventListener('finished', this.cameraMixerListener);
    }
  }

  removeCameraMixerFinishedListener() {
    if (this.currentCamera === null || this.cameraMixerListener === null) {
      this.cameraMixerListener = null;
      return;
    }
    const mixer = this.helper.objects.get(this.currentCamera)?.mixer;
    if (mixer !== undefined) {
      mixer.removeEventListener('finished', this.cameraMixerListener);
    }
    this.cameraMixerListener = null;
  }

  handleAnimationFinished() {
    if (this.isPlaying) {
      this.setPlaying(false);
      if (this.playbackFinishedCallback) this.playbackFinishedCallback();
    }
  }

  getModelMixer() {
    return this.currentMesh === null ? null : this.helper.objects.get(this.currentMesh)?.mixer ?? null;
  }

  ensureModelMixer() {
    if (this.currentMesh === null) return null;
    const obj = this.helper.objects.get(this.currentMesh);
    if (obj === undefined) return null;
    if (obj.mixer === undefined) {
      obj.mixer = new AnimationMixer(this.currentMesh);
      obj.mixer.addEventListener('loop', e => {
        const tracks = (e.action?._clip || e.action?.getClip?.())?.tracks || [];
        if (tracks.length === 0 || tracks[0].name.slice(0, 6) === '.bones') {
          obj.looped = true;
        }
      });
    }
    return obj.mixer;
  }

  getCameraMixer() {
    return this.currentCamera === null ? null : this.helper.objects.get(this.currentCamera)?.mixer ?? null;
  }

  syncHelperDuration() {
    this.helper._syncDuration?.();
  }

  applyLooping() {
    const loopMode = this.isLooping ? LoopRepeat : LoopOnce;
    const iterations = this.isLooping ? Infinity : 1;
    for (const action of this.getAllActions()) {
      action.setLoop(loopMode, iterations);
      action.clampWhenFinished = !this.isLooping;
    }
  }

  createActionStateSnapshot(actionMap) {
    const snap = new Map();
    for (const [clip, action] of actionMap) {
      snap.set(clip.name, {
        time: action.time,
        weight: action.weight,
        enabled: action.enabled
      });
    }
    return snap;
  }

  createWeightSnapshot(actionMap) {
    const snap = new Map();
    for (const [clip, action] of actionMap) {
      snap.set(clip.name, action.weight);
    }
    return snap;
  }

  createTransitionSnapshot(transitionMap) {
    const snap = new Map();
    for (const [clip, trans] of transitionMap) {
      snap.set(clip.name, { ...trans });
    }
    return snap;
  }

  restoreActionStateSnapshot(actionMap, snap) {
    for (const [clip, action] of actionMap) {
      const saved = snap.get(clip.name);
      if (saved !== undefined) {
        action.time = saved.time;
        action.weight = saved.weight;
        action.enabled = saved.enabled;
      }
    }
  }

  getAllActions() {
    return [...this.currentActions.values(), ...this.cameraActions.values()];
  }
}

function getAmmo() {
  const ammo = globalThis.Ammo;
  return typeof ammo === 'object' && ammo && typeof ammo.btVector3 === 'function' ? ammo : null;
}

// -------------------------------------------------------
// 6. デバイスモーション（物理揺れ干渉）マネージャ
// -------------------------------------------------------

const BASE_GRAVITY = 9.8;
const GRAVITY_SMOOTH_LAG = 0.15;
const ACCEL_HISTORY_LAG = 500;
const ACCEL_PEAK_LAG = 100;
const ACCEL_THRESHOLD = 12.0;

class Nl {
  constructor() {
    this.isActive = false;
    this.gravityMagnitude = BASE_GRAVITY;
    this.impulseSensitivity = 1.0;
    this.latestGravityDirection = null;
    this.baselineGravityDirection = null;
    this.accelerationHistory = [];
    this.pendingImpulse = null;
    this.lastImpulseAt = 0;

    this.motionHandler = e => {
      const g = e.accelerationIncludingGravity;
      if (g !== null && g.x !== null && g.y !== null && g.z !== null) {
        const gravityDir = new Vector3(-g.x, -g.y, -g.z);
        if (gravityDir.lengthSq() > 0.0001) {
          const normalized = gravityDir.normalize();
          if (this.latestGravityDirection === null) {
            this.latestGravityDirection = normalized;
          } else {
            this.latestGravityDirection.lerp(normalized, GRAVITY_SMOOTH_LAG).normalize();
          }
        }
      }

      const a = e.acceleration;
      if (a === null || a.x === null || a.y === null || a.z === null) return;
      const now = performance.now();
      this.accelerationHistory.push({ x: a.x, y: a.y, z: a.z, t: now });
      this.accelerationHistory = this.accelerationHistory.filter(item => now - item.t < ACCEL_HISTORY_LAG);
      this.detectImpulse();
    };
  }

  setEnabled(enabled) {
    if (enabled !== this.isActive) {
      this.isActive = enabled;
      if (enabled) {
        window.addEventListener('devicemotion', this.motionHandler);
        this.latestGravityDirection = null;
        this.baselineGravityDirection = null;
      } else {
        window.removeEventListener('devicemotion', this.motionHandler);
        this.latestGravityDirection = null;
        this.accelerationHistory = [];
        this.pendingImpulse = null;
        this.baselineGravityDirection = null;
        this.lastImpulseAt = 0;
      }
    }
  }

  setImpulseSensitivity(val) {
    this.impulseSensitivity = MathUtils.clamp(val, 0.1, 3.0);
  }

  setGravityMagnitude(val) {
    this.gravityMagnitude = MathUtils.clamp(val, 0.1, 50.0);
  }

  recalibrate() {
    this.baselineGravityDirection = null;
  }

  getGravityVector(camera) {
    const gravityVec = new Vector3(0, -this.gravityMagnitude, 0);
    if (this.isActive && this.latestGravityDirection !== null) {
      if (this.baselineGravityDirection === null) {
        this.baselineGravityDirection = this.latestGravityDirection.clone();
      } else {
        const rotation = new Quaternion().setFromUnitVectors(this.baselineGravityDirection, this.latestGravityDirection);
        gravityVec.applyQuaternion(rotation);
      }
    }
    camera.updateWorldMatrix(true, false);
    const cameraQuat = new Quaternion();
    camera.getWorldQuaternion(cameraQuat);
    gravityVec.applyQuaternion(cameraQuat);
    return gravityVec;
  }

  consumePendingImpulse() {
    const impulse = this.pendingImpulse;
    this.pendingImpulse = null;
    return impulse;
  }

  detectImpulse() {
    if (this.accelerationHistory.length < 3) return;
    const now = performance.now();
    if (now - this.lastImpulseAt < 250) return;

    const filtered = this.accelerationHistory.filter(item => now - item.t < ACCEL_PEAK_LAG);
    if (filtered.length < 2) return;

    let maxMagnitude = 0;
    let peakItem = null;
    for (const item of filtered) {
      const mag = Math.sqrt(item.x * item.x + item.y * item.y + item.z * item.z);
      if (mag > maxMagnitude) {
        maxMagnitude = mag;
        peakItem = item;
      }
    }

    if (peakItem !== null && maxMagnitude > ACCEL_THRESHOLD) {
      this.pendingImpulse = new Vector3(peakItem.x, peakItem.y, peakItem.z).multiplyScalar(this.impulseSensitivity);
      this.lastImpulseAt = now;
      console.debug('[physics-sensor] impulse detected', {
        magnitude: maxMagnitude,
        impulse: this.pendingImpulse.toArray()
      });
    }
  }
}

// -------------------------------------------------------
// 7. 3D ビューアー本体 (pu 相当)
// -------------------------------------------------------

export class pu {
  constructor(container) {
    this.container = container;
    this.scene = new Scene();
    this.clock = new Clock();
    this.dummyCamera = new PerspectiveCamera(45, 1, 0.1, 1000);
    this.dummyCamera.position.set(0, 12, 28);
    this.renderCamera = new PerspectiveCamera(45, 1, 0.1, 1000);
    this.cameraPivot = new Group();
    this.cameraPivot.add(this.renderCamera);
    
    this.gyroController = new cu();
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.outputColorSpace = 'srgb';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.container.querySelectorAll('canvas').forEach(el => el.remove());
    this.container.append(this.renderer.domElement);

    this.controls = new OrbitControls(this.dummyCamera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 8, 0);

    this.gyroController.setModelCenterContext({
      target: this.controls.target,
      getCurrentDistance: () => this.dummyCamera.position.distanceTo(this.controls.target)
    });

    this.scene.add(this.cameraPivot);
    
    this.grid = new GridHelper(20, 20, 0x7b7b7b, 0x344582);
    this.scene.add(this.grid);

    this.gravityArrow = new ArrowHelper(new Vector3(0, -1, 0), new Vector3(0, 5, 0), 5, 0xff0000);
    this.gravityArrow.visible = false;
    this.scene.add(this.gravityArrow);

    this.rotationCenterMarker = new Mesh(
      new SphereGeometry(0.3, 16, 12),
      new MeshBasicMaterial({ color: 0x5fd8ff, transparent: true, opacity: 0.7 })
    );
    this.rotationCenterMarker.visible = false;
    this.scene.add(this.rotationCenterMarker);

    this.modelRoot = new Group();
    this.scene.add(this.modelRoot);

    this.addLights();
    
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    
    this.resize();

    this.trackingBoneWorldPosition = new Vector3();
    this.trackingPanDelta = new Vector3();
    this.trackingPanOffset = new Vector3();
    this.previousTrackedTarget = new Vector3();
    this.trackingStandardOffset = new Vector3();
    
    this.originalMaterialSettings = new Map();
    this.animationFrameId = 0;
    this.currentModel = null;
    this.isTrackingEnabled = true;
    this.isRotationCenterMarkerRequestedVisible = false;
    this.trackingBoneName = null;
    this.trackingBoneRef = null;
    this.isTrackingTargetInitialized = false;
    this.isTrackingStandardOffsetCaptured = false;

    this.frameUpdater = null;
    this.cameraVmdStateProvider = null;
    this.gravityVectorProvider = null;
    this.isDebugModeEnabled = false;

    this.render();
  }

  render = () => {
    this.animationFrameId = window.requestAnimationFrame(this.render);
    const delta = Math.min(this.clock.getDelta(), 0.1);

    this.controls.update();
    this.gyroController.updateCamera(this.dummyCamera);
    
    if (this.frameUpdater && this.frameUpdater.update) {
      this.frameUpdater.update(delta);
    }

    this.updateTrackingTarget();
    this.syncCameraPivot();
    this.syncRenderCameraProjection();
    this.updateRotationCenterMarker();
    this.updateGravityArrow();

    this.renderer.render(this.scene, this.renderCamera);
  };

  applySettings(settings) {
    this.isDebugModeEnabled = settings.isDebugModeEnabled;
    this.scene.background = new Color(settings.backgroundColor);
    this.grid.visible = settings.backgroundMode === 'grid';
  }

  setModel(model) {
    if (this.currentModel !== null) {
      this.modelRoot.remove(this.currentModel);
    }
    this.originalMaterialSettings.clear();
    this.currentModel = model;
    this.modelRoot.add(model);
    this.resetTrackingPanOffset();
    this.refreshTrackingBoneRef();
    this.syncTrackingActiveState();
    this.frameModel(model);
  }

  clearModel() {
    if (this.currentModel !== null) {
      this.modelRoot.remove(this.currentModel);
      this.currentModel = null;
    }
    this.trackingBoneRef = null;
    this.originalMaterialSettings.clear();
    this.resetTrackingPanOffset();
    this.syncTrackingActiveState();
  }

  setFrameUpdater(updater) {
    this.frameUpdater = updater;
  }

  setCameraVmdStateProvider(provider) {
    this.cameraVmdStateProvider = provider;
  }

  setGravityVectorProvider(provider) {
    this.gravityVectorProvider = provider;
  }

  getCamera() {
    return this.renderCamera;
  }

  resetClock() {
    this.clock.getDelta();
  }

  setGyroEnabled(enabled) {
    if (enabled) {
      this.gyroController.start(this.dummyCamera);
    } else {
      this.gyroController.stop();
    }
  }

  setGyroViewpointSensitivity(val) {
    this.gyroController.setViewpointSensitivity(val);
  }

  setGyroModelCenterSensitivity(val) {
    this.gyroController.setModelCenterSensitivity(val);
  }

  setGyroMode(mode) {
    this.gyroController.setMode(mode, this.dummyCamera);
  }

  setTrackingBone(boneName) {
    this.trackingBoneName = boneName;
    this.resetTrackingPanOffset();
    this.refreshTrackingBoneRef();
    this.syncTrackingActiveState();
  }

  setTrackingEnabled(enabled) {
    this.isTrackingEnabled = enabled;
    this.resetTrackingPanOffset();
    this.syncTrackingActiveState();
  }

  setGravityArrowVisible(visible) {
    this.gravityArrow.visible = visible;
  }

  setRotationCenterMarkerVisible(visible) {
    this.isRotationCenterMarkerRequestedVisible = visible;
    this.syncTrackingActiveState();
  }

  recalibrateGyro() {
    this.gyroController.recalibrate(this.dummyCamera);
  }

  dumpMaterialDetails() {
    if (this.currentModel === null) return;
    console.group('[debug] materials');
    this.traverseCurrentMaterials((material, mesh, idx) => {
      console.debug('[debug] submesh', {
        meshName: mesh.name,
        materialIndex: idx,
        materialName: material.name,
        transparent: material.transparent,
        opacity: material.opacity,
        alphaTest: material.alphaTest,
        depthWrite: material.depthWrite,
        side: material.side,
        color: material.color?.getHexString()
      });
    });
    console.groupEnd();
  }

  collectSuspiciousMaterials() {
    this.originalMaterialSettings.clear();
    const uniqueNames = new Set();
    const list = [];
    this.traverseCurrentMaterials(material => {
      this.originalMaterialSettings.set(material, {
        transparent: material.transparent,
        opacity: material.opacity,
        alphaTest: material.alphaTest,
        depthWrite: material.depthWrite
      });
      if (material.transparent && material.opacity < 1.0) {
        if (!uniqueNames.has(material.name)) {
          uniqueNames.add(material.name);
          list.push({
            name: material.name,
            originalOpacity: material.opacity,
            originalTransparent: material.transparent
          });
        }
      }
    });
    return list;
  }

  applyMaterialOverrides(overrides) {
    this.traverseCurrentMaterials(material => {
      const orig = this.originalMaterialSettings.get(material);
      if (orig !== undefined) {
        if (overrides[material.name] === true) {
          material.transparent = false;
          material.opacity = 1.0;
          material.alphaTest = 0.0;
          material.depthWrite = true;
        } else {
          material.transparent = orig.transparent;
          material.opacity = orig.opacity;
          material.alphaTest = orig.alphaTest;
          material.depthWrite = orig.depthWrite;
        }
        material.needsUpdate = true;
      }
    });
  }

  dispose() {
    window.cancelAnimationFrame(this.animationFrameId);
    this.gyroController.stop();
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  addLights() {
    const ambient = new AmbientLight(0xffffff, 0.55);
    this.scene.add(ambient);

    const dirLight = new DirectionalLight(0xffffff, 1.4);
    dirLight.position.set(0, 20, 20);
    this.scene.add(dirLight);
  }

  resize() {
    const w = Math.max(this.container.clientWidth, 1);
    const h = Math.max(this.container.clientHeight, 1);
    this.dummyCamera.aspect = w / h;
    this.renderCamera.aspect = w / h;
    this.dummyCamera.updateProjectionMatrix();
    this.renderCamera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  traverseCurrentMaterials(callback) {
    if (this.currentModel === null) return;
    this.currentModel.traverse(child => {
      if (child.isMesh || child.isSkinnedMesh) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat, idx) => {
          if (mat) callback(mat, child, idx);
        });
      }
    });
  }

  frameModel(model) {
    this.controls.target.set(0, 8, 0);
    this.dummyCamera.position.set(0, 12, 28);
    this.controls.update();
  }

  resetTrackingPanOffset() {
    this.trackingPanOffset.set(0, 0, 0);
    this.isTrackingTargetInitialized = false;
    this.isTrackingStandardOffsetCaptured = false;
  }

  refreshTrackingBoneRef() {
    this.trackingBoneRef = null;
    if (this.currentModel === null || !this.trackingBoneName) return;
    this.currentModel.traverse(child => {
      if (child.isBone && child.name === this.trackingBoneName) {
        this.trackingBoneRef = child;
      }
    });
  }

  syncTrackingActiveState() {
    const active = this.isTrackingEnabled && this.trackingBoneRef !== null;
    this.rotationCenterMarker.visible = this.isRotationCenterMarkerRequestedVisible && active;
  }

  updateTrackingTarget() {
    if (!this.isTrackingEnabled || this.trackingBoneRef === null) return;
    this.trackingBoneRef.getWorldPosition(this.trackingBoneWorldPosition);

    if (!this.isTrackingTargetInitialized) {
      this.previousTrackedTarget.copy(this.trackingBoneWorldPosition);
      this.isTrackingTargetInitialized = true;
    }

    if (!this.isTrackingStandardOffsetCaptured) {
      this.trackingStandardOffset.copy(this.controls.target).sub(this.trackingBoneWorldPosition);
      this.isTrackingStandardOffsetCaptured = true;
    }

    const delta = new Vector3().copy(this.trackingBoneWorldPosition).sub(this.previousTrackedTarget);
    this.trackingPanOffset.add(delta);
    
    this.controls.target.copy(this.trackingBoneWorldPosition).add(this.trackingStandardOffset);
    this.previousTrackedTarget.copy(this.trackingBoneWorldPosition);
  }

  syncCameraPivot() {
    const hasCameraMotion = this.cameraVmdStateProvider?.hasActiveCameraMotion?.() === true;
    if (hasCameraMotion) {
      this.cameraPivot.position.set(0, 0, 0);
      this.cameraPivot.quaternion.identity();
    } else {
      this.cameraPivot.position.copy(this.dummyCamera.position);
      this.cameraPivot.quaternion.copy(this.dummyCamera.quaternion);
    }
  }

  syncRenderCameraProjection() {
    this.renderCamera.near = this.dummyCamera.near;
    this.renderCamera.far = this.dummyCamera.far;
    this.renderCamera.fov = this.dummyCamera.fov;
    this.renderCamera.aspect = this.dummyCamera.aspect;
    this.renderCamera.updateProjectionMatrix();
  }

  updateRotationCenterMarker() {
    if (this.rotationCenterMarker.visible) {
      this.rotationCenterMarker.position.copy(this.controls.target);
    }
  }

  updateGravityArrow() {
    if (!this.gravityArrow.visible || !this.gravityVectorProvider) return;
    const gVec = this.gravityVectorProvider.getGravityVector();
    this.gravityArrow.setDirection(gVec.clone().normalize());
    this.gravityArrow.setLength(gVec.length() * 0.5);
  }
}
