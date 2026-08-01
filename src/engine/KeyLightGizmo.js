import { Color3, Quaternion, Vector3 } from "@babylonjs/core/Maths/math";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

/** Unity の Directional Light ギズモに近い黄色 */
const GIZMO_COLOR = new Color3(1.0, 0.92, 0.16);
/** キャラ付近の見やすい高さ */
const DEFAULT_CENTER = new Vector3(0, 10, 0);

/**
 * キーライト（Directional）の向きをシーン中央に可視化する。
 * Unity の Directional Light アイコンに近い見た目（黄球 + 平行レイ）。
 *
 * 回転は方位角・高度から直接構築する（FromLookDirectionLH はビュー行列由来で
 * 向きが反転し、かつ Up 切替で特定角度が飛ぶため使わない）。
 */
export class KeyLightGizmo {
  scene = null;
  root = null;
  _material = null;
  _visible = false;
  _built = false;
  center = DEFAULT_CENTER.clone();

  constructor(scene) {
    this.scene = scene;
  }

  get visible() {
    return this._visible;
  }

  setVisible(visible) {
    this._visible = !!visible;
    if (this._visible) {
      this._ensureBuilt();
    }
    if (this.root) {
      this.root.setEnabled(this._visible);
    }
  }

  /**
   * @param {number} azimuthDeg 方位角（度）キーライトと同じ定義
   * @param {number} elevationDeg 高度（度）キーライトと同じ定義
   * @param {Vector3} [center] 表示位置（既定: (0, 10, 0)）
   */
  update(azimuthDeg, elevationDeg, center = null) {
    if (!this._visible) return;
    this._ensureBuilt();

    if (center) {
      this.center.copyFrom(center);
    }
    this.root.position.copyFrom(this.center);

    // キーライト dir = (sin(az)cos(el), -sin(el), cos(az)cos(el)) にローカル +Z を一致
    // → RotationYawPitchRoll(az, el, 0)（特異点・Up切替なし）
    const az = (Number(azimuthDeg) * Math.PI) / 180;
    const el = (Number(elevationDeg) * Math.PI) / 180;
    if (!this.root.rotationQuaternion) {
      this.root.rotationQuaternion = Quaternion.Identity();
    }
    Quaternion.RotationYawPitchRollToRef(az, el, 0, this.root.rotationQuaternion);
  }

  _ensureBuilt() {
    if (this._built || !this.scene) return;
    this._built = true;

    this._material = new StandardMaterial("keyLightGizmoMat", this.scene);
    this._material.diffuseColor = GIZMO_COLOR.clone();
    this._material.emissiveColor = GIZMO_COLOR.clone();
    this._material.specularColor = new Color3(0, 0, 0);
    this._material.disableLighting = true;
    this._material.fogEnabled = false;

    this.root = new TransformNode("keyLightGizmo", this.scene);
    this.root.position.copyFrom(this.center);
    this.root.rotationQuaternion = Quaternion.Identity();
    this.root.setEnabled(this._visible);

    const sun = MeshBuilder.CreateSphere(
      "keyLightGizmoSun",
      { diameter: 1.6, segments: 12 },
      this.scene
    );
    sun.parent = this.root;
    sun.material = this._material;
    this._configureHelperMesh(sun);

    const rayCount = 8;
    const ringRadius = 0.85;
    for (let i = 0; i < rayCount; i++) {
      const angle = (i / rayCount) * Math.PI * 2;
      const ray = MeshBuilder.CreateCylinder(
        `keyLightGizmoRay${i}`,
        { height: 3.2, diameter: 0.12, tessellation: 6 },
        this.scene
      );
      ray.parent = this.root;
      ray.material = this._material;
      // シリンダ既定 +Y → ローカル +Z（光の進行方向）へ
      ray.rotation.x = Math.PI / 2;
      ray.position.x = Math.cos(angle) * ringRadius;
      ray.position.y = Math.sin(angle) * ringRadius;
      ray.position.z = 2.4;
      this._configureHelperMesh(ray);

      const tip = MeshBuilder.CreateCylinder(
        `keyLightGizmoRayTip${i}`,
        { height: 0.55, diameterTop: 0, diameterBottom: 0.28, tessellation: 6 },
        this.scene
      );
      tip.parent = this.root;
      tip.material = this._material;
      tip.rotation.x = Math.PI / 2;
      tip.position.x = Math.cos(angle) * ringRadius;
      tip.position.y = Math.sin(angle) * ringRadius;
      tip.position.z = 4.3;
      this._configureHelperMesh(tip);
    }
  }

  _configureHelperMesh(mesh) {
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    mesh.renderingGroupId = 1;
    mesh.alwaysSelectAsActiveMesh = true;
    if (typeof mesh.doNotSyncBoundingInfo !== "undefined") {
      mesh.doNotSyncBoundingInfo = true;
    }
  }

  dispose() {
    if (this.root) {
      this.root.dispose(false, false);
      this.root = null;
    }
    if (this._material) {
      this._material.dispose();
      this._material = null;
    }
    this._built = false;
    this._visible = false;
  }
}
