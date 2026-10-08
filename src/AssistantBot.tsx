import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

interface AssistantBotProps {
  isThinking: boolean;
  isSpeaking: boolean;
}

function roundedBox(width: number, height: number, depth: number, radius: number) {
  return new RoundedBoxGeometry(width, height, depth, 4, radius);
}

function createRobot() {
  const root = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xe8f3f5, roughness: 0.28, metalness: 0.32 });
  const whiteShade = new THREE.MeshStandardMaterial({ color: 0xa9c0c7, roughness: 0.32, metalness: 0.42 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x091519, roughness: 0.2, metalness: 0.22 });
  const cyan = new THREE.MeshStandardMaterial({
    color: 0x64f5f0,
    emissive: 0x13bfc1,
    emissiveIntensity: 1.8,
    roughness: 0.18,
    metalness: 0.15,
  });
  const jointMat = new THREE.MeshStandardMaterial({ color: 0x283e47, roughness: 0.35, metalness: 0.74 });
  const robot = new THREE.Group();
  root.add(robot);

  const addMesh = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Group, x: number, y: number, z: number) => {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  };

  const sphere = (parent: THREE.Group, material: THREE.Material, position: [number, number, number], scale: [number, number, number]) => {
    const object = addMesh(new THREE.SphereGeometry(1, 32, 24), material, parent, ...position);
    object.scale.set(...scale);
    return object;
  };

  const capsule = (parent: THREE.Group, material: THREE.Material, position: [number, number, number], size: [number, number, number]) => {
    const object = addMesh(roundedBox(size[0], size[1], size[2], Math.min(size[0], size[1]) * 0.32), material, parent, ...position);
    return object;
  };

  const head = new THREE.Group();
  head.position.set(0, 0.66, 0);
  robot.add(head);
  capsule(head, white, [0, 0, 0], [2.08, 1.55, 1.08]);
  capsule(head, whiteShade, [0, -0.67, 0.06], [1.44, 0.2, 0.76]);
  capsule(head, dark, [0, -0.03, 0.53], [1.76, 1.08, 0.16]);
  capsule(head, jointMat, [0, -0.03, 0.63], [1.61, 0.93, 0.08]);
  capsule(head, dark, [0, -0.03, 0.69], [1.54, 0.86, 0.07]);

  const leftEye = capsule(head, cyan, [-0.43, 0.05, 0.75], [0.3, 0.43, 0.08]);
  const rightEye = capsule(head, cyan, [0.43, 0.05, 0.75], [0.3, 0.43, 0.08]);
  const smileCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.18, -0.29, 0.75),
    new THREE.Vector3(0, -0.46, 0.77),
    new THREE.Vector3(0.18, -0.29, 0.75),
  );
  const smile = addMesh(new THREE.TubeGeometry(smileCurve, 16, 0.025, 8, false), cyan, head, 0, 0, 0);
  const openMouth = sphere(head, dark, [0, -0.34, 0.76], [0.11, 0.04, 0.025]);
  const mouthRim = addMesh(new THREE.TorusGeometry(0.11, 0.018, 8, 24), cyan, head, 0, -0.34, 0.765);
  mouthRim.scale.y = 0.6;
  openMouth.visible = false;
  mouthRim.visible = false;

  const antenna = (x: number) => {
    const stem = addMesh(new THREE.CylinderGeometry(0.025, 0.035, 0.32, 12), whiteShade, head, x, 0.91, 0);
    stem.rotation.z = x * -0.1;
    sphere(head, cyan, [x, 1.11, 0], [0.085, 0.085, 0.085]);
  };
  antenna(-0.81);
  antenna(0.81);

  sphere(robot, whiteShade, [0, -0.27, 0], [0.28, 0.18, 0.3]);
  sphere(robot, dark, [0, -0.49, 0], [0.34, 0.17, 0.3]);
  const torso = sphere(robot, white, [0, -1.02, 0], [0.72, 0.66, 0.47]);
  capsule(robot, whiteShade, [0, -0.68, 0.34], [0.42, 0.13, 0.14]);
  sphere(robot, cyan, [0.38, -0.84, 0.42], [0.09, 0.09, 0.05]);
  capsule(robot, dark, [0, -1.54, 0], [0.48, 0.39, 0.37]);

  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.66, -0.61, 0);
    robot.add(arm);
    sphere(arm, whiteShade, [0, 0, 0], [0.26, 0.26, 0.27]);
    sphere(arm, cyan, [0, 0, 0.24], [0.1, 0.1, 0.045]);
    const upper = addMesh(new THREE.CylinderGeometry(0.14, 0.17, 0.48, 20), white, arm, side * 0.14, -0.33, 0);
    upper.rotation.z = side * -0.38;
    sphere(arm, jointMat, [side * 0.27, -0.64, 0], [0.18, 0.18, 0.18]);
    const forearm = capsule(arm, whiteShade, [side * 0.36, -0.97, 0], [0.27, 0.54, 0.3]);
    forearm.rotation.z = side * -0.2;
    sphere(arm, jointMat, [side * 0.4, -1.28, 0.01], [0.13, 0.12, 0.13]);
    for (let finger = 0; finger < 3; finger += 1) {
      const offset = (finger - 1) * 0.1;
      const segment = addMesh(new THREE.CylinderGeometry(0.045, 0.06, 0.19, 12), whiteShade, arm, side * (0.4 + offset), -1.46, 0.05);
      segment.rotation.z = side * (0.25 + Math.abs(offset));
      sphere(arm, jointMat, [side * (0.4 + offset), -1.57, 0.05], [0.055, 0.055, 0.055]);
    }
    arms.push(arm);
  }

  for (const side of [-1, 1]) {
    sphere(robot, jointMat, [side * 0.34, -1.78, 0], [0.25, 0.2, 0.24]);
    const shin = capsule(robot, white, [side * 0.38, -2.04, 0], [0.38, 0.52, 0.43]);
    shin.rotation.z = side * -0.06;
    sphere(robot, jointMat, [side * 0.38, -2.25, 0.05], [0.16, 0.12, 0.16]);
    const foot = capsule(robot, whiteShade, [side * 0.38, -2.42, 0.18], [0.58, 0.28, 0.72]);
    foot.material = white;
  }

  const stage = new THREE.Group();
  root.add(stage);
  const haloMaterial = new THREE.MeshBasicMaterial({ color: 0x42dfe4, transparent: true, opacity: 0.54, side: THREE.DoubleSide });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.46, 0.009, 8, 120), haloMaterial);
  halo.rotation.x = Math.PI / 2;
  halo.position.y = -2.56;
  stage.add(halo);
  const haloInner = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.005, 8, 120), haloMaterial.clone());
  haloInner.material.opacity = 0.24;
  haloInner.rotation.x = Math.PI / 2;
  haloInner.position.y = -2.57;
  stage.add(haloInner);

  return { root, robot, head, leftEye, rightEye, smile, openMouth, mouthRim, torso, arms, halo };
}

export function AssistantBot({ isThinking, isSpeaking }: AssistantBotProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const moodRef = useRef({ isThinking, isSpeaking });

  useEffect(() => {
    moodRef.current = { isThinking, isSpeaking };
  }, [isThinking, isSpeaking]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
    camera.position.set(0, -0.45, 8.1);
    camera.lookAt(0, -0.48, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.domElement.setAttribute('aria-label', 'Animated three-dimensional assistant robot');
    renderer.domElement.setAttribute('role', 'img');
    host.appendChild(renderer.domElement);

    const robot = createRobot();
    scene.add(robot.root);
    scene.add(new THREE.HemisphereLight(0xe2ffff, 0x19303c, 2.1));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(-3, 5, 6);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0x35e9ed, 18, 8);
    rimLight.position.set(2.6, 0.6, 2.2);
    scene.add(rimLight);
    const fillLight = new THREE.PointLight(0x6397ff, 8, 7);
    fillLight.position.set(-3, -1.4, 2);
    scene.add(fillLight);

    const starsGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(48 * 3);
    for (let index = 0; index < 48; index += 1) {
      const radius = 2.6 + Math.random() * 1.4;
      const angle = Math.random() * Math.PI * 2;
      starPositions[index * 3] = Math.cos(angle) * radius;
      starPositions[index * 3 + 1] = Math.sin(angle) * radius * 0.8;
      starPositions[index * 3 + 2] = -1.3 - Math.random() * 1.5;
    }
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(starsGeometry, new THREE.PointsMaterial({ color: 0x61dce0, size: 0.025, transparent: true, opacity: 0.74 }));
    scene.add(stars);

    const pointer = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    const onPointerMove = (event: PointerEvent) => {
      const bounds = host.getBoundingClientRect();
      target.x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
      target.y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    };
    const onPointerLeave = () => {
      target.x = 0;
      target.y = 0;
    };
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerleave', onPointerLeave);

    const resizeObserver = new ResizeObserver(() => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      camera.aspect = width / height;
      camera.position.z = width < height * 0.72 ? 8.8 : 8.1;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    });
    resizeObserver.observe(host);

    let frame = 0;
    const animationStartedAt = performance.now();
    const animate = () => {
      frame = window.requestAnimationFrame(animate);
      const time = (performance.now() - animationStartedAt) / 1000;
      const mood = moodRef.current;
      const thinking = mood.isThinking;
      const speaking = mood.isSpeaking;
      pointer.x += (target.x - pointer.x) * 0.035;
      pointer.y += (target.y - pointer.y) * 0.035;
      robot.robot.position.y = Math.sin(time * (thinking ? 2.6 : 1.35)) * (thinking ? 0.1 : 0.055);
      robot.robot.rotation.y = pointer.x * 0.22 + Math.sin(time * 0.42) * 0.035;
      robot.robot.rotation.x = pointer.y * 0.06;
      robot.head.rotation.y = pointer.x * 0.13 + (thinking ? Math.sin(time * 1.5) * 0.09 : 0);
      robot.head.rotation.x = -pointer.y * 0.08 + (thinking ? Math.sin(time * 1.9) * 0.035 : 0);
      robot.arms[0].rotation.z = Math.sin(time * 1.5) * 0.035;
      robot.arms[1].rotation.z = -Math.sin(time * 1.5) * 0.035 + (speaking ? Math.sin(time * 5) * 0.09 : 0);
      robot.torso.rotation.z = Math.sin(time * 1.1) * 0.018;
      robot.halo.rotation.z = time * 0.09;
      stars.rotation.z = -time * 0.015;
      const blink = Math.sin(time * 0.73) > 0.994 ? 0.12 : 1;
      robot.leftEye.scale.y = blink;
      robot.rightEye.scale.y = blink;
      robot.smile.visible = !thinking && !speaking;
      robot.openMouth.visible = thinking || speaking;
      robot.mouthRim.visible = thinking || speaking;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerleave', onPointerLeave);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, []);

  return <div className="assistant-bot-canvas" ref={hostRef} aria-hidden="false" />;
}