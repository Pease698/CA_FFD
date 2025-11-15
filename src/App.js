import logo from './logo.svg';
import './App.css';

import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import React, { useRef, useMemo, useState, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TransformControls } from '@react-three/drei';
import { useLayoutEffect, useEffect } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

// 计算二项式系数
function binomial(n, k) {
  if (k < 0 || k > n) return 0; // 无效输入
  if (k == 0 || k == n) return 1;
  if (k > n / 2) k = n - k;
  let res = 1;
  for (let i = 1; i <= k; ++i) {
    res = res * (n - i + 1) / i;
  }
  return res;
}

// bernstein 函数, n 为最高次数, i 为当前次数，t 为参数
function bernstein(i, n, t) {
  return binomial(n, i) * Math.pow(t, i) * Math.pow(1 - t, n - i);
}

function vectorDot(v1, v2) {
  return v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
}

function vectorCross(v1, v2) {
  const resX = v1[1] * v2[2] - v1[2] * v2[1];
  const resY = v1[2] * v2[0] - v1[0] * v2[2];
  const resZ = v1[0] * v2[1] - v1[1] * v2[0];
  return [resX, resY, resZ];
}

/**
 * 1. 计算顶点在 FFD 晶格中的 (s, t, u) 参数坐标
 * @param {THREE.Vector3} originalPos - 原始顶点坐标
 * @param {Array<number>} bboxMin - FFD 晶格包围盒最小值 [x, y, z]
 * @param {Array<number>} bboxMax - FFD 晶格包围盒最大值 [x, y, z]
 * @returns {Array<number>} - [s, t, u] 坐标，已钳制在 [0, 1] 范围
 */
function calculateSTU(originalPos, bboxMin, bboxMax) {
  const divisorX = bboxMax[0] - bboxMin[0];
  const divisorY = bboxMax[1] - bboxMin[1];
  const divisorZ = bboxMax[2] - bboxMin[2];

  // 计算 s, t, u (参数坐标)
  // 通过 (value - min) / (max - min) 计算比例
  // 并处理分母为 0 的情况，以避免除以零
  const s = (divisorX === 0) ? 0 : (originalPos.x - bboxMin[0]) / divisorX;
  const t = (divisorY === 0) ? 0 : (originalPos.y - bboxMin[1]) / divisorY;
  const u = (divisorZ === 0) ? 0 : (originalPos.z - bboxMin[2]) / divisorZ;

  // 将 s, t, u 钳制在 [0, 1] 范围内
  // 这确保了即使顶点在 FFD 晶格外部，也能被正确“拉伸”
  return [
    Math.max(0, Math.min(1, s)),
    Math.max(0, Math.min(1, t)),
    Math.max(0, Math.min(1, u))
  ];
}

/**
 * 2. 根据 (s, t, u) 和控制点计算变形后的位置
 * @param {Array<Array<number>>} controlPoints - 控制点数组 (ns * nt * nu 个 [x, y, z])
 * @param {number} s - 参数 s
 * @param {number} t - 参数 t
 * @param {number} u - 参数 u
 * @param {Array<number>} gridSize - 晶格维度 [ns, nt, nu] (例如 [3, 3, 3])
 * @returns {Array<number>} - 变形后的 [x, y, z]
 */
function calculateDeformedPosition(controlPoints, s, t, u, gridSize) {
  const [ns, nt, nu] = gridSize;
  const l = ns - 1; // s 方向的阶数
  const m = nt - 1; // t 方向的阶数
  const n = nu - 1; // u 方向的阶数

  const deformedPos = [0, 0, 0];

  for (let i = 0; i < ns; i++) {
    const bernsteinS = bernstein(i, l, s);
    for (let j = 0; j < nt; j++) {
      const bernsteinT = bernstein(j, m, t);
      for (let k = 0; k < nu; k++) {
        const bernsteinU = bernstein(k, n, u);
        
        // 根据 i, j, k 计算在 controlPoints 一维数组中的索引
        const index = i * (nt * nu) + j * nu + k;
        
        if (index >= controlPoints.length) {
          console.error(`FFD index out of bounds. Index: ${index}, CP Length: ${controlPoints.length}`);
          continue;
        }
        
        const cp = controlPoints[index]; // cp 是 [x, y, z]

        // 累加控制点的加权贡献
        const weight = bernsteinS * bernsteinT * bernsteinU;
        deformedPos[0] += cp[0] * weight;
        deformedPos[1] += cp[1] * weight;
        deformedPos[2] += cp[2] * weight;
      }
    }
  }
  return deformedPos;
}

function Model({ name, controlPoints, gridSize, bboxMin, bboxMax, onBboxUpdate }) {
  const ffdProps = {
    controlPoints,
    gridSize,
    bboxMin,
    bboxMax,
    onBboxUpdate
  };

  if (name === 'book') {
    return Modelloading({
      url: './book/scene.gltf',
      controlPoints: controlPoints,
      gridSize: gridSize,
      bboxMin: bboxMin,
      bboxMax: bboxMax,
      onBboxUpdate: onBboxUpdate,
      scale: 1.0
    })
  } else if (name === 'car') {
    return Modelloading({
      url: './car/scene.gltf',
      controlPoints: controlPoints,
      gridSize: gridSize,
      bboxMin: bboxMin,
      bboxMax: bboxMax,
      onBboxUpdate: onBboxUpdate,
      scale: 0.3  // 缩小模型
    })
  } else {        // 导入其他几何模型
    return <PrimitiveModel
      name={name}
      controlPoints={controlPoints}
      gridSize={gridSize}
      bboxMin={bboxMin}
      bboxMax={bboxMax}
      onBboxUpdate={onBboxUpdate}
    />
  }
}

const loader = new GLTFLoader();

function Modelloading({ url, controlPoints, gridSize, bboxMin, bboxMax, onBboxUpdate, scale = 1.0 }) {
  // 1. 用 State 替换 useGLTF
  //    需要一个 state 来存储异步加载的原始场景
  const [originalScene, setOriginalScene] = useState(null);

  // 2. 使用 useEffect 来触发命令式加载
  //    这个 effect 会在 'url' prop 发生变化时运行
  useEffect(() => {
    if (!url) {
      // 如果没有 url，则清理场景
      setOriginalScene(null);
      return;
    }

    // 在开始加载新模型之前，立即清除旧模型
    // 这模拟了 `loadModel` 中的 `scene.remove(objectScene)` 逻辑
    setOriginalScene(null);

    // `loadModel` 的核心逻辑
    loader.load(
      url,
      // 成功回调 (m) -> (gltf)
      (gltf) => {
        // 加载成功后，将其设置到我们的 state 中
        // 这将触发 useMemo 链的重新计算
        setOriginalScene(gltf.scene);
      },
      // onProgress 回调
      undefined,
      // onError 回调
      (error) => {
        console.error(`加载模型 ${url} 时出错:`, error);
        setOriginalScene(null); // 出错时也确保清理
      }
    );
    
  }, [url]); // 仅在 `url` 变化时重新运行此 effect

  // 3. 深度克隆原始场景，用于变形和渲染
  const bakedScene = useMemo(() => {
    if(!originalScene) return null;

    const scene = originalScene.clone(true); // 克隆
    const objectsToConvert = [];

    // 在烘焙前应用缩放
    // 将 scale 应用于克隆场景的根部
    scene.scale.set(scale, scale, scale);

    // 1. 找到所有 InstancedMesh
    scene.traverse((object) => {
      if (object.isInstancedMesh) {
        objectsToConvert.push(object);
      }
    });

    // 2. 转换
    objectsToConvert.forEach(instancedMesh => {
      const parent = instancedMesh.parent;
      
      // 获 InstancedMesh 对象的本地变换矩阵
      const baseMatrix = instancedMesh.matrix.clone();
      
      const instanceMatrix = new THREE.Matrix4();
      const bakedMatrix = new THREE.Matrix4();

      for (let i = 0; i < instancedMesh.count; i++) {
        
        instancedMesh.getMatrixAt(i, instanceMatrix); // 获取实例矩阵 [Instance.matrix]

        // 组合变换: [InstancedMesh.matrix] * [Instance.matrix]
        bakedMatrix.multiplyMatrices(baseMatrix, instanceMatrix);

        const newMesh = new THREE.Mesh(
          instancedMesh.geometry.clone(), // 克隆几何体
          instancedMesh.material          // 共享材质
        );

        // 应用组合后的完整烘焙矩阵
        newMesh.geometry.applyMatrix4(bakedMatrix); 

        // 继承原 InstancedMesh 的其他属性
        newMesh.name = `${instancedMesh.name}_instance_${i}`;
        // ... (position, rotation, scale 保持默认，因为变换已烘焙到顶点)

        parent.add(newMesh); // 添加到场景
      }

      // 3. 移除原始的 InstancedMesh
      parent.remove(instancedMesh);
    });

    return scene;
  }, [originalScene]);

  // 4. 创建 "变形" 场景 (可写目标)
  // 这是我们将要实际修改并渲染的场景
  const deformedScene = useMemo(() => {
    // console.log("Step 3: Cloning baked scene AND its geometries...");
    if(!bakedScene) return null;
    
    // 1. 克隆场景结构 (这仍然会共享几何体)
    const scene = bakedScene.clone(true);

    // 遍历新克隆的 scene，
    // 并将每个网格的几何体(geometry)替换为它自己的克隆版本。
    // 打破 deformedScene 和 bakedScene 之间的共享引用。
    scene.traverse((object) => {
      if (object.isMesh) {
        // 创建一个新的、拥有独立 buffer attributes 的几何体。
        object.geometry = object.geometry.clone();
      }
    });

    return scene;
  }, [bakedScene]);

  // 5. 计算模型的精确包围盒 (依赖 bakedScene)
  const modelBbox = useMemo(() => {
    // MODIFIED: 依赖 bakedScene
    if (!bakedScene) return null; 
    
    bakedScene.updateMatrixWorld(true);
    const box = new THREE.Box3();
    
    // 从 bakedScene 计算
    bakedScene.traverse((object) => { 
      if (object.isMesh) {
        box.expandByObject(object);
      }
    });
    
    if (box.isEmpty()) {
      return null;
    }
    return box;
  }, [bakedScene]);

  // 6. 当 modelBbox 计算出来后，通过回调通知父组件
  useEffect(() => {
    // 当 bakedScene 变为 null 时, modelBbox 也会变为 null
    // 当 bakedScene 加载完成时, modelBbox 会变为 Box3
    // onBboxUpdate 是 App 的 useCallback 版本，引用稳定
    if (onBboxUpdate) {
      onBboxUpdate(modelBbox);
    }
  }, [modelBbox, onBboxUpdate]);

  // 7. 预计算 STU 坐标
  const geometryData = useMemo(() => {
    // console.log("Step 4: Pre-calculating STU (Array)...");
    if (!bakedScene || !bboxMin || !bboxMax) return []; 

    // 强制更新场景中所有对象的世界矩阵
    bakedScene.updateMatrixWorld(true);
    
    // 将 STU 数据存储在一个数组中
    // 依赖于 bakedScene 和 deformedScene 具有完全相同的遍历顺序
    const stuList = [];
    const originalVertex = new THREE.Vector3();

    bakedScene.traverse((object) => {
      if (object.isMesh) {
        // 获取此特定网格的世界变换矩阵
        const worldMatrix = object.matrixWorld;

        // 从 "bakedMesh" (只读源) 读取位置数据
        const positionAttribute = object.geometry.attributes.position; 
        const vertexCount = positionAttribute.count;
        const stuArray = new Float32Array(vertexCount * 3);
        
        for (let j = 0; j < vertexCount; j++) {
          originalVertex.fromBufferAttribute(positionAttribute, j);

          // 将局部坐标转换（应用）为世界坐标
          originalVertex.applyMatrix4(worldMatrix);

          const [s, t, u] = calculateSTU(originalVertex, bboxMin, bboxMax);
          stuArray[j * 3 + 0] = s;
          stuArray[j * 3 + 1] = t;
          stuArray[j * 3 + 2] = u;
        }
        
        stuList.push(new THREE.BufferAttribute(stuArray, 3));
      }
    });

    return stuList;
    
  }, [bakedScene, bboxMin, bboxMax]);

  // 8. 核心变形逻辑
  React.useLayoutEffect(() => {
    // console.log("Step 5: Applying deformation (Array)...");
    // 增加防护条件，因为 deformedScene 和 geometryData 现在可能是 null/[]
    if (!deformedScene || !geometryData.length || !controlPoints) {
      return; 
    }
    
    const stu = new THREE.Vector3();
    let meshIndex = 0; // 用于跟踪 STU 数组的索引

    // 遍历 "deformedScene" (可写目标)
    deformedScene.traverse((object) => {
      if (object.isMesh) {
        
        // 按索引从数组获取 STU 数据
        const stuAttribute = geometryData[meshIndex];
        
        if (!stuAttribute) {
          // 如果 stuData 数组和网格数量不匹配
          console.error("FFD: Mesh/STU data mismatch!");
          return; 
        }

        const geometry = object.geometry; 
        const deformedPositionAttribute = geometry.attributes.position;
        const vertexCount = stuAttribute.count;

        for (let i = 0; i < vertexCount; i++) {
          stu.fromBufferAttribute(stuAttribute, i);

          const [newX, newY, newZ] = calculateDeformedPosition(
            controlPoints, 
            stu.x, stu.y, stu.z, 
            gridSize
          );
          
          deformedPositionAttribute.setXYZ(i, newX, newY, newZ);
        }

        deformedPositionAttribute.needsUpdate = true;
        geometry.computeVertexNormals(); 
        
        meshIndex++; // 移动到下一个网格的 STU 数据
      }
    });
    
  }, [controlPoints, geometryData, gridSize]);
  
  return deformedScene ? <primitive object={deformedScene} /> : null;
}

/**
 * 用于加载和变形基本几何体（球体、立方体等）的组件
 */
function PrimitiveModel({ 
  name, 
  controlPoints, 
  gridSize, 
  bboxMin, 
  bboxMax, 
  onBboxUpdate 
}) {
  
  // 1. 创建 "baked" (原始) 网格
  const bakedMesh = useMemo(() => {
    // 为所有几何体创建一个共享材质
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x2194ce,
      metalness: 0.5,
      roughness: 0.6,

      emissive: 0x2194ce,         // 发出和颜色一样的光
      emissiveIntensity: 0.5      // "发光"强度
    });
    
    let geometry = null;
    if (name === 'sphere') {
      geometry = new THREE.SphereGeometry(15, 64, 64);
    } 
    else if (name === 'cube') {
      geometry = new THREE.BoxGeometry(20, 20, 20, 16, 16, 16);
    } else if (name === 'cylinder') {
      geometry = new THREE.CylinderGeometry( 10, 10, 30, 32, 8 );
    } else if (name === 'donut') {
      geometry = new THREE.TorusGeometry( 15, 6, 16, 100 );
    }
    else {
      return null; // 如果 name 无效
    }

    const mesh = new THREE.Mesh(geometry, material);
    return mesh;
  }, [name]); // 仅当 'name' prop 改变时重新运行

  // 2. 创建 "deformed" (变形) 网格
  const deformedMesh = useMemo(() => {
    if (!bakedMesh) return null;
    
    // 克隆网格并深度克隆其几何体，使其具有独立的顶点
    const mesh = bakedMesh.clone();
    mesh.geometry = bakedMesh.geometry.clone();
    
    return mesh;
  }, [bakedMesh]);

  // 3. 计算模型的精确包围盒
  const modelBbox = useMemo(() => {
    if (!bakedMesh) return null;
    
    // 基本几何体默认在原点，可以直接计算包围盒
    bakedMesh.geometry.computeBoundingBox();
    return bakedMesh.geometry.boundingBox;
    
  }, [bakedMesh]);

  // 4. 当 modelBbox 计算出来后，通过回调通知父组件
  useEffect(() => {
    if (onBboxUpdate) {
      onBboxUpdate(modelBbox);
    }
    
    // 当此组件被卸载（例如切换模型）时,
    // 它会通知 App 将 BBox 重置为 null。
    return () => {
      if (onBboxUpdate) {
        onBboxUpdate(null);
      }
    };
  }, [modelBbox, onBboxUpdate]);

  // 5. 预计算 STU 坐标
  const geometryData = useMemo(() => {
    if (!bakedMesh || !bboxMin || !bboxMax) return null;

    const stuList = [];
    const originalVertex = new THREE.Vector3();

    // 从 "bakedMesh" (只读源) 读取位置数据
    const positionAttribute = bakedMesh.geometry.attributes.position;
    const vertexCount = positionAttribute.count;
    const stuArray = new Float32Array(vertexCount * 3);
    
    for (let j = 0; j < vertexCount; j++) {
      originalVertex.fromBufferAttribute(positionAttribute, j);

      // 基本几何体在局部空间中, 无需应用 worldMatrix
      const [s, t, u] = calculateSTU(originalVertex, bboxMin, bboxMax);
      stuArray[j * 3 + 0] = s;
      stuArray[j * 3 + 1] = t;
      stuArray[j * 3 + 2] = u;
    }
    
    return new THREE.BufferAttribute(stuArray, 3);
    
  }, [bakedMesh, bboxMin, bboxMax]);

  // 6. 核心变形逻辑 (useLayoutEffect)
  useLayoutEffect(() => {
    if (!deformedMesh || !geometryData || !controlPoints) {
      return; 
    }
    
    const stu = new THREE.Vector3();
    const stuAttribute = geometryData; // 只有一个网格

    const geometry = deformedMesh.geometry; 
    const deformedPositionAttribute = geometry.attributes.position;
    const vertexCount = stuAttribute.count;

    for (let i = 0; i < vertexCount; i++) {
      stu.fromBufferAttribute(stuAttribute, i);

      const [newX, newY, newZ] = calculateDeformedPosition(
        controlPoints, 
        stu.x, stu.y, stu.z, 
        gridSize
      );
      
      deformedPositionAttribute.setXYZ(i, newX, newY, newZ);
    }

    deformedPositionAttribute.needsUpdate = true;
    geometry.computeVertexNormals(); 
    
  }, [deformedMesh, controlPoints, geometryData, gridSize]);
  
  // 7. 渲染可变形的网格
  return deformedMesh ? <primitive object={deformedMesh} /> : null;
}

// 生成 FFD 控制点和线
function generateFFDControlGeometry(
  gridSize = [3, 3, 3],
  bboxMin = [-1, -1, -1],
  bboxMax = [1, 1, 1]
) {
  if (!bboxMin || !bboxMax) {
    return { points: [], lines: [] }; // 如果 bbox 未定义, 返回空
  }

  const [ns, nt, nu] = gridSize;
  const points = [];
  const lines = [];

  // 确保 ns, nt, nu 至少为 2
  const l = Math.max(2, ns) - 1;
  const m = Math.max(2, nt) - 1;
  const n = Math.max(2, nu) - 1;

  // 计算步长
  const stepS = (l === 0) ? 0 : (bboxMax[0] - bboxMin[0]) / l;
  const stepT = (m === 0) ? 0 : (bboxMax[1] - bboxMin[1]) / m;
  const stepU = (n === 0) ? 0 : (bboxMax[2] - bboxMin[2]) / n;

  // 生成控制点
  for (let i = 0; i < ns; i ++) {
    for (let j = 0; j < nt; j ++) {
      for (let k = 0; k < nu; k ++) {
        const x = bboxMin[0] + i * stepS;
        const y = bboxMin[1] + j * stepT;
        const z = bboxMin[2] + k * stepU;
        points.push([x, y, z]);

        // 生成网格线段
        // 沿 S 方向
        if (i < l) {
          lines.push([[x, y, z], [x + stepS, y, z]]);
        }
        // 沿 T 方向
        if (j < m) {
          lines.push([[x, y, z], [x, y + stepT, z]]);
        }
        // 沿 U 方向
        if (k < n) {
          lines.push([[x, y, z], [x, y, z + stepU]]);
        }
      }
    }
  }

  return { points, lines };
}

/**
 * 单个可拖拽的 FFD 控制点
 * @param {Array<number>} initialPosition - 初始位置 [x, y, z]
 * @param {Function} onDrag - 拖拽结束时调用的回调函数 (newPosition) => {...}
 */
function FFDPoint({
  index,
  initialPosition,
  onDrag,
  setOrbitEnabled,
  onSelect,        // 新增：通知父组件“我被选中了”
  isSelected,      // 新增：父组件告诉我“我是否被选中”
}) {
  const meshRef = useRef();
  
  // 处理拖拽开始和结束的逻辑
  const handleDragEnd = () => {
    setOrbitEnabled(true);
  };
  
  const handleDragStart = () => {
    setOrbitEnabled(false);
  };

  const handleDarg = (e) => {
    // e.target.object 就是被控制的 meshRef.current
    if (e.target.object) {
      const newPosition = e.target.object.position;
      onDrag(index, [newPosition.x, newPosition.y, newPosition.z]);
    }
  }

  // 当 initialPosition 改变时 (例如 gridSize 改变导致重置), 
  // 强制更新 meshRef 的位置
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.position.set(...initialPosition);
    }
  }, [initialPosition]);

  return (
    <group>
      <mesh
        ref={meshRef}
        position={initialPosition}
        onClick={(e) => {
          e.stopPropagation(); // 阻止事件冒泡
          onSelect(index);
        }}
      >
        {/* 使用简单的几何体来表示控制点，例如球体 */}
        <sphereGeometry args={[0.8]} /> 
        <meshBasicMaterial 
          color={isSelected ? 'red' : "white"}
          depthTest={true} // 确保它总是在最前面
          transparent={false}
          opacity={0.8}
        />
      </mesh>
      
      {/* 2. *有条件地* 渲染 TransformControls */}
      {/* 只有当这个点被选中时，才创建和显示 TransformControls */}
      {isSelected && (
        <TransformControls 
          mode="translate"
          showX={isSelected}
          showY={true}
          showZ={true}
          object={meshRef} // 关键：将 controls 附加到 meshRef 上
          onMouseUp={handleDragEnd}
          onMouseDown={handleDragStart}
          onChange={handleDarg}
        />
      )}
    </group>
  );
}

function FFDManager({ controlPoints, onPointDrag, selectedIndex, setSelectedIndex, setOrbitEnabled }) {
  
  return (
    <>
      {/* 渲染所有点 */}
      {controlPoints.map((pos, index) => (
        <FFDPoint
          key={index}
          index={index}
          initialPosition={pos}
          onDrag={onPointDrag}
          setOrbitEnabled={setOrbitEnabled}
          
          // 传入状态
          isSelected={index == selectedIndex}
          onSelect={setSelectedIndex}
        />
      ))}
    </>
  );
}

/**
 * 一个跟随相机移动的点光源
 */
function CameraLight() {
  // 1. 创建一个 ref 来引用 R3F 的灯光
  const lightRef = useRef();
  
  // 2. 使用 useThree 钩子获取 R3F 的
  //    'camera' (相机) 和 'scene' (场景) 实例
  const { camera } = useThree();

  // 3. 使用 useFrame 钩子，它会在每一帧渲染时执行
  useFrame(() => {
    if (lightRef.current) {
      // 4. 将光源的世界坐标 (position)
      //    设置为与相机的世界坐标完全相同
      lightRef.current.position.copy(camera.position);
    }
  });

  // 5. 返回一个点光源。
  //    - 附加到 ref 上，以便在 useFrame 中访问它
  return (
    <pointLight 
      ref={lightRef} 
      intensity={1000}
      distance={50}
      color={0xffffff} // 默认是白光
    />
  );
}

const DEFAULT_BBOXMIN = [-20, -20, -20];
const DEFAULT_BBOXMAX = [20, 20, 20];

function App() {
  const [gridSize, setGridSize] = useState([3, 3, 3]); // [ns, nt, nu]
  const [modelName, setModelName] = useState('car');
  const [bboxMin, setBboxMin] = useState(DEFAULT_BBOXMIN);
  const [bboxMax, setBboxMax] = useState(DEFAULT_BBOXMAX);

  // 1. 初始化 controlPoints 状态
  const { points: initialPoints } = useMemo(
    () => generateFFDControlGeometry(gridSize, bboxMin, bboxMax),
    [gridSize, bboxMin, bboxMax]
  );

  const [controlPoints, setControlPoints] = useState(initialPoints);
  const [orbitEnabled, setOrbitEnabled] = useState(true); // 声明状态
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // 当 gridSize 改变 (导致 initialPoints 改变) 时，自动重置 controlPoints
  useEffect(() => {
    setControlPoints(initialPoints);
    setSelectedIndex(-1); // 并取消选中
  }, [initialPoints]);

  // 2. 定义更新 controlPoints 的函数
  const handlePointDrag = (index, newPosition) => {
    setControlPoints(prevPoints => {
      const newPoints = [...prevPoints];
      newPoints[index] = newPosition;
      return newPoints;
    });
  };

  // 重置按钮的点击处理函数
  const handleReset = () => {
    setControlPoints(initialPoints); // 恢复到当前 gridSize 的初始点
    setSelectedIndex(-1); // 取消选中
  };

  // 晶格点数变化的点击处理函数
  const handleGridChange = (axis, value) => {
    const newSize = [...gridSize];
    // FFD 每条轴至少需要 2 个点
    const newCount = Math.max(2, parseInt(value, 10) || 2); 
    
    if (axis === 'x') newSize[0] = newCount;
    if (axis === 'y') newSize[1] = newCount;
    if (axis === 'z') newSize[2] = newCount;
    
    setGridSize(newSize);
  };

  const handleBboxUpdate = useCallback((newBbox) => {
    // 检查 newBbox 是否有效
    if (newBbox) {
      
      const size = newBbox.getSize(new THREE.Vector3());
      // 使用 5% 的 B-Box 对角线长度作为 padding
      // 同时设置一个最小 padding (如 0.1) 避免 B-Box 大小为 0
      const padding = Math.max(size.length() * 0.05, 0.1); 

      setBboxMin([
        newBbox.min.x - padding, 
        newBbox.min.y - padding, 
        newBbox.min.z - padding
      ]);
      setBboxMax([
        newBbox.max.x + padding, 
        newBbox.max.y + padding, 
        newBbox.max.z + padding
      ]);
    } else {
      // 如果模型被卸载 (newBbox 为 null) 或 B-Box 无效
      // 将状态重置回 null
      setBboxMin(null);
      setBboxMax(null);
    }
  }, []); // 空依赖数组确保函数引用稳定

  return (
    <div id="main-container" style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      
      {/* 为右侧面板添加一些 CSS 样式 */}
      <style>{`
        #right-controls-container {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          color: #333;
        }
        .control-group {
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 1px solid #ddd;
        }
        .control-group h3 {
          margin-top: 0;
          margin-bottom: 10px;
          font-size: 16px;
          color: #333;
          font-weight: 600;
        }
        .control-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .control-row label {
          font-size: 14px;
          color: #555;
        }
        .control-row input[type="number"] {
          width: 60px;
          padding: 4px 8px;
          border: 1px solid #ccc;
          border-radius: 4px;
          box-sizing: border-box; /* 确保 padding 不影响宽度 */
        }
        .reset-button {
          width: 100%;
          padding: 10px;
          background-color: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 15px;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .reset-button:hover {
          background-color: #0056b3;
        }
        .model-label {
          display: block;
          margin-bottom: 8px;
          font-size: 14px;
          color: #555;
        }
        .model-select {
          width: 100%;
          padding: 10px;
          background-color: #fff;
          border: 1px solid #ccc;
          border-radius: 4px;
          font-size: 15px;
          cursor: pointer;
        }
        .model-select:hover {
          border-color: #999;
        }
      `}</style>

      <div id="left-scene-container" style={{ flex: 7, backgroundColor: '#222' }}>
        <Canvas camera={{ position: [30, 30, 30], fov: 75 }} >
          <OrbitControls enabled={orbitEnabled} />

          <ambientLight intensity={2.0} />
          <pointLight position={[50, 50, 50]} intensity={300} distance={100} />
          <CameraLight />

          <pointLight position={[10, 10, 10]} />

          {/* 传递 controlPoints 状态给 Model 组件 */}
          <Model
            name={modelName}
            controlPoints={controlPoints}
            gridSize={gridSize}
            bboxMin={bboxMin}
            bboxMax={bboxMax}
            onBboxUpdate={handleBboxUpdate}
          />

          {/* 绘制 FFD 控制顶点和网格线 */}
          <FFDManager 
            // 4. 将状态和设置器(setter)传递给 FFDManager
            controlPoints={controlPoints}
            onPointDrag={handlePointDrag}
            selectedIndex={selectedIndex}
            setSelectedIndex={setSelectedIndex}
            setOrbitEnabled={setOrbitEnabled}
          />
        </Canvas>
      </div>
      
      {/* --- 右侧控制面板 --- */}
      <div id="right-controls-container" style={{ flex: 3, padding: '20px', overflowY: 'auto', backgroundColor: '#f4f4f4', boxSizing: 'border-box' }}>
        
        {/* 下拉框 */}
        <div className="control-group">
          <h3>Load Model</h3>
          <label htmlFor="model-select" className="model-label">
            Choose a model:
          </label>
          <select
            id="model-select"
            className="model-select"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
          >
            <option value="car">Car</option>
            <option value="book">Book</option>
            <option value="sphere">Sphere</option>
            <option value="cube">Cube</option>
            <option value="cylinder">Cylinder</option>
            <option value="donut">Donut</option>
          </select>
        </div>

        {/* 晶格控制 */}
        <div className="control-group">
          <h3>FFD Lattice Controls</h3>
          <div className="control-row">
            <label htmlFor="x-points">X Points (s)</label>
            <input 
              id="x-points"
              type="number" 
              min="2" // FFD 每轴至少需要2个点
              max="11"
              value={gridSize[0]}
              onChange={(e) => handleGridChange('x', e.target.value)}
            />
          </div>
          <div className="control-row">
            <label htmlFor="y-points">Y Points (t)</label>
            <input 
              id="y-points"
              type="number" 
              min="2"
              max="11"
              value={gridSize[1]}
              onChange={(e) => handleGridChange('y', e.target.value)}
            />
          </div>
          <div className="control-row">
            <label htmlFor="z-points">Z Points (u)</label>
            <input 
              id="z-points"
              type="number" 
              min="2"
              max="11"
              value={gridSize[2]}
              onChange={(e) => handleGridChange('z', e.target.value)}
            />
          </div>
        </div>

        {/* 重置按钮 */}
        <div className="control-group">
          <h3>Actions</h3>
          <button className="reset-button" onClick={handleReset}>
            Reset Deformation
          </button>
        </div>

      </div>
    </div>
  );
}

export default App;
