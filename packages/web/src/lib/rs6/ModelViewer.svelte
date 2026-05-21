<script lang="ts">
  import { onMount } from 'svelte';
  import * as THREE from 'three';
  import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

  interface Props {
    glbUrl?: string | null;
    glbBytes?: ArrayBuffer | null;
  }

  let { glbUrl = null, glbBytes = null }: Props = $props();

  let container: HTMLDivElement | null = $state(null);
  let status: string = $state('');

  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let controls: OrbitControls | null = null;
  let currentRoot: THREE.Object3D | null = null;
  let raf = 0;
  let resizeObs: ResizeObserver | null = null;

  function disposeRoot(root: THREE.Object3D | null) {
    if (!root) return;
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if ((mesh as THREE.Mesh).isMesh) {
        mesh.geometry?.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      }
    });
  }

  function fitCamera(object: THREE.Object3D) {
    if (!camera || !controls) return;
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const fov = (camera.fov * Math.PI) / 180;
    const dist = (maxDim / (2 * Math.tan(fov / 2))) * 1.6;
    camera.position.copy(center).add(new THREE.Vector3(dist * 0.7, dist * 0.5, dist));
    camera.near = Math.max(0.01, dist / 1000);
    camera.far = dist * 100;
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();
  }

  function applyStyle() {
    if (!currentRoot) return;
    currentRoot.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!(mesh as THREE.Mesh).isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const std = m as THREE.MeshStandardMaterial;
        std.wireframe = false;
        std.vertexColors = true;
        std.needsUpdate = true;
      }
    });
  }

  async function loadGlb() {
    if (!scene) return;
    if (currentRoot) {
      scene.remove(currentRoot);
      disposeRoot(currentRoot);
      currentRoot = null;
    }
    if (!glbUrl && !glbBytes) {
      status = '';
      return;
    }
      status = 'loading...';
    const loader = new GLTFLoader();
    try {
      let gltf;
      if (glbBytes) {
        gltf = await loader.parseAsync(glbBytes, '');
      } else if (glbUrl) {
        gltf = await loader.loadAsync(glbUrl);
      } else return;
      currentRoot = gltf.scene;
      currentRoot.rotation.y = Math.PI;
      scene.add(currentRoot);
      applyStyle();
      fitCamera(currentRoot);
      status = '';
    } catch (e) {
      status = `error: ${(e as Error).message}`;
    }
  }

  onMount(() => {
    if (!container) return;
    const w = container.clientWidth || 600;
    const h = container.clientHeight || 400;
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(w, h);
    renderer.setClearColor(0x161310);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    camera.position.set(2, 2, 4);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x303040, 1.4);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(5, 10, 7);
    scene.add(dir);
    const fill = new THREE.DirectionalLight(0xdce8ff, 0.45);
    fill.position.set(-4, 5, -6);
    scene.add(fill);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      controls?.update();
      if (renderer && scene && camera) renderer.render(scene, camera);
    };
    tick();

    resizeObs = new ResizeObserver(() => {
      if (!container || !renderer || !camera) return;
      const w2 = container.clientWidth;
      const h2 = container.clientHeight;
      renderer.setSize(w2, h2);
      camera.aspect = w2 / Math.max(1, h2);
      camera.updateProjectionMatrix();
    });
    resizeObs.observe(container);

    return () => {
      cancelAnimationFrame(raf);
      resizeObs?.disconnect();
      disposeRoot(currentRoot);
      controls?.dispose();
      renderer?.dispose();
      if (renderer && container?.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer = null;
      scene = null;
      camera = null;
      controls = null;
      currentRoot = null;
    };
  });

  $effect(() => {
    // re-run when glbUrl or glbBytes changes
    glbUrl;
    glbBytes;
    if (scene) loadGlb();
  });

</script>

<div class="viewer">
  <div class="canvas" bind:this={container}></div>
  {#if status}
    <div class="viewer-status">{status}</div>
  {/if}
</div>

<style>
  .viewer {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    position: relative;
  }
  .canvas {
    flex: 1;
    min-height: 0;
    background: #0a0c10;
    border: 1px solid var(--ground-4);
    border-radius: 4px;
  }
  .viewer-status {
    position: absolute;
    inset: 8px 8px auto;
    padding: 4px 6px;
    background: rgba(14, 12, 10, 0.84);
    border: 1px solid var(--ground-4);
    font-family: var(--mono);
    font-size: 12px;
  }
</style>
