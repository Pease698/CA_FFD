import logo from './logo.svg';
import './App.css';

import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useGLTF } from '@react-three/drei';
import { Scene } from 'three';
import React, { useRef, useMemo, useState, createRef} from 'react';
import { useFrame } from '@react-three/fiber';
import { Points, PointMaterial, Line} from '@react-three/drei';
import * as THREE from 'three';
import { Segments, Segment } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { TransformControls } from '@react-three/drei';

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
 * @param {Array<Array<number>>} controlPoints - 控制点数组 (27 个 [x, y, z])
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
          console.error("FFD index out of bounds");
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

















function Model({ url, controlPoints, gridSize, bboxMin, bboxMax }) {
  // 1. 加载原始场景
  const { scene: originalScene } = useGLTF(url);

  // 2. 深度克隆原始场景，用于变形和渲染
  // 这个 useMemo 仅在 originalScene 加载时运行一次
  const deformedScene = useMemo(() => {
    // console.log("Cloning scene...");
    return originalScene.clone(true);
  }, [originalScene]);


  // 3. 提取并存储所有原始几何体的顶点数据
  // (已修复 UUID 不匹配的 bug)
  const originalGeometries = useMemo(() => {
    // console.log("Extracting original geometry (Fixed)...");
    const geoMap = new Map();

    // 1. 将原始网格和克隆网格分别收集到数组中
    // 我们依赖 .traverse() 对于
    // 原始对象和克隆对象具有相同的遍历顺序
    const originalMeshes = [];
    originalScene.traverse((object) => {
      if (object.isMesh) {
        originalMeshes.push(object);
      }
    });

    const deformedMeshes = [];
    deformedScene.traverse((object) => {
      if (object.isMesh) {
        deformedMeshes.push(object);
      }
    });

    

    // 2. 检查数量是否匹配 (作为安全检查)
    if (originalMeshes.length !== deformedMeshes.length) {
      console.error("FFD: Cloned mesh count does not match original!");
      return geoMap;
    }

    // 3. 遍历数组，使用 *克隆* 的 UUID 作为键，*原始* 的位置数据作为值
    for (let i = 0; i < deformedMeshes.length; i++) {
      const deformedMesh = deformedMeshes[i];
      const originalMesh = originalMeshes[i];
      
      geoMap.set(deformedMesh.uuid, { // 键: 克隆体 (deformedMesh) 的 UUID
        // 值: 原始体 (originalMesh) 的位置数据
        originalPosition: originalMesh.geometry.attributes.position.clone()
      });
    }

    return geoMap;
  }, [originalScene, deformedScene]); // 依赖项现在还需要包括 deformedScene

  // // 3. 提取并存储所有原始几何体的顶点数据
  // // (已修复 UUID 不匹配的 bug) -> 替换为更健壮的基于名称的映射
  // const originalGeometries = useMemo(() => {
  //   console.log("Extracting original geometry (Name-based)...");
  //   const geoMap = new Map();

  //   // 1. 遍历 *原始* 场景，创建一个 "name" -> "originalMesh" 的索引
  //   const originalMeshMap = new Map();
  //   originalScene.traverse((object) => {
  //     if (object.isMesh) {
  //       // 如果名称已存在，可能会覆盖，但这是更健壮方法的基础
  //       if (object.name) {
  //         originalMeshMap.set(object.name, object);
  //       }
  //     }
  //   });

  //   // 2. 遍历 *变形后* 的场景
  //   deformedScene.traverse((object) => {
  //     if (object.isMesh) {
  //       // 3. 使用变形后网格的 name，在索引中查找对应的 *原始* 网格
  //       const originalMesh = originalMeshMap.get(object.name);
  //       
  //       if (originalMesh && originalMesh.geometry.attributes.position) {
  //         // 4. 建立从 "deformedMesh.uuid" -> "originalMesh.geometry" 的映射
  //         geoMap.set(object.uuid, { // 键: 克隆体 (deformedMesh) 的 UUID
  //           // 值: 原始体 (originalMesh) 的位置数据
  //           originalPosition: originalMesh.geometry.attributes.position.clone()
  //         });
  //       } else {
  //         console.warn(`FFD: Could not find original mesh for: ${object.name}`);
  //       }
  //     }
  //   });

  //   return geoMap;
  // }, [originalScene, deformedScene]); // 依赖项不变

  // 4. 核心变形逻辑：当 controlPoints 变化时执行
  // (也依赖其他 FFD 参数)
  useMemo(() => {
    // console.log("Deforming model...");
    
    // 创建一个可重用的 Vector3，避免在循环中创建成千上万个对象
    const originalVertex = new THREE.Vector3();

    // 遍历我们 *克隆* 出来的 deformedScene
    deformedScene.traverse((object) => {
      if (object.isMesh) {
        // 找到这个 Mesh 对应的原始几何体数据
        const originalData = originalGeometries.get(object.uuid);
        
        if (!originalData) {
          // 如果在 Map 中没找到（例如，这个 mesh 是后来添加的），则跳过
          return;
        }

        const { geometry: deformedGeometry, originalPosition: originalPositionAttribute } = originalData;
        
        // 获取当前（变形中）的几何体
        const geometry = object.geometry; 
        
        // 获取我们要修改的顶点缓冲区
        const deformedPositionAttribute = geometry.attributes.position;
        const vertexCount = originalPositionAttribute.count;

        // 3. 对每个顶点应用 FFD 变形
        for (let i = 0; i < vertexCount; i++) {
          
          // A. 从 *原始* 缓冲区中获取顶点
          originalVertex.fromBufferAttribute(originalPositionAttribute, i);

          // B. FFD 计算步骤：
          // 1. 计算原始顶点在 FFD 笼子中的参数坐标 (s, t, u)
          const [s, t, u] = calculateSTU(originalVertex, bboxMin, bboxMax);

          // 2. 使用最新的 controlPoints 和 (s, t, u) 计算新的变形位置 (newX, newY, newZ)
          const [newX, newY, newZ] = calculateDeformedPosition(controlPoints, s, t, u, gridSize);
          
          // 3. 更新 *变形后* 的顶点位置
          deformedPositionAttribute.setXYZ(i, newX, newY, newZ);
        }

        // 4. 标记几何体需要更新
        deformedPositionAttribute.needsUpdate = true;
        geometry.computeVertexNormals(); // 重新计算法线以保证光照正确
      }
    });
    
  }, [controlPoints, deformedScene, originalGeometries, gridSize, bboxMin, bboxMax]); // 依赖项

  return (
    <primitive object={deformedScene} scale={1} />
  );
}

function SceneContainer() { // main component of the 3D scene
  return (
    <Canvas camera={{ position: [30, 30, 30], fov: 75 }}>
      {/* 引入模型 */}
      <Model url="./book/scene.gltf" />
      {/* 引入控制组件 */}
      <OrbitControls enableZoom={true} enablePan={true} />

      {/* 其他场景元素 */}
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} />
    </Canvas>
  );
}

// 假设 FFD 笼子中心在 (0,0,0)，边长为 size
function generateFFDControlPoints(size = 2) {
  const halfSize = 10;
  const points = [];

  // 生成一个 3x3x3 的立方体顶点
  for (let x = -1; x <= 1; x += 1) {
    for (let y = -1; y <= 1; y += 1) {
      for (let z = -1; z <= 1; z += 1) {
        points.push([x * halfSize, y * halfSize, z * halfSize]);
      }
    }
  }
  return points; // 这是一个二维数组，每个子数组代表一个点的 [x, y, z]
}

// 假设我们有一个生成 FFD 控制点和线的函数
function generateFFDControlGeometry(
  gridSize = [3, 3, 3], // 例如 [3,3,3] 代表一个立方体
  bboxMin = [-1, -1, -1],
  bboxMax = [1, 1, 1]
) {
  const [ns, nt, nu] = gridSize;
  const points = [];
  const lines = [];

  // 计算步长
  const stepS = (bboxMax[0] - bboxMin[0]) / (ns - 1);
  const stepT = (bboxMax[1] - bboxMin[1]) / (nt - 1);
  const stepU = (bboxMax[2] - bboxMin[2]) / (nu - 1);

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
        if (i < ns - 1) {
          lines.push([[x, y, z], [x + stepS, y, z]]);
        }
        // 沿 T 方向
        if (j < nt - 1) {
          lines.push([[x, y, z], [x, y + stepT, z]]);
        }
        // 沿 U 方向
        if (k < nu - 1) {
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
  // const controlsRef = useRef();
  
  // 处理拖拽开始和结束的逻辑
  const handleDragEnd = () => {
    // 拖拽结束时，获取当前 Mesh 的位置
    // const newPosition = meshRef.current.position;
    // onDrag(index, [newPosition.x, newPosition.y, newPosition.z]);
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

  return (
    // // TransformControls 必须包裹一个 THREE.Object3D (如 Mesh)
    // <TransformControls 
    //   key={index}
    //   ref={controlsRef}
    //   mode="translate" // 仅允许移动，禁用旋转和缩放
    //   showX={true}
    //   showY={true}
    //   showZ={true}
    //   onMouseUp={handleDragEnd}
    //   onMouseDown={handleDraggingChanged}
    // >
    <group>
      <mesh
        ref={meshRef}
        position={initialPosition}
        onClick={(e) => {
          e.stopPropagation(); // 阻止事件冒泡（非常重要！）
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
  
  // const [controlPoints, setPoints] = useState(initialPoints);
  
  // 拖拽结束时更新点的位置
  // const handleDrag = (index, newPosition) => {
  //   const newPoints = [...controlPoints];
  //   newPoints[index] = newPosition;
  //   setPoints(newPoints);
  // };
  
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

function FFDControl({
  gridSize = [3, 3, 3],
  bboxMin = [-1, -1, -1],
  bboxMax = [1, 1, 1],
  pointColor = 'white',
  lineColor = 'grey',
  pointSize = 0.3,
  lineWidth = 2,
  controlPoints,
  onPointDrag,
  setOrbitEnabled,
}) {
  // 实时生成线段数据 (lines) - 依赖 controlPoints 的最新状态
  const lines = useMemo(() => {
      // 重新执行生成线段的逻辑，但这次是基于 controlPoints
      return generateFFDControlGeometry(gridSize, bboxMin, bboxMax, controlPoints).lines;
  }, [controlPoints, gridSize, bboxMin, bboxMax]);

  return (
    <group>
      {/* 绘制控制顶点 */}
      {controlPoints.map((pos, index) => (
        <FFDPoint
          key={index}
          index={index}
          initialPosition={pos}
          onDrag={onPointDrag}
          setOrbitEnabled={setOrbitEnabled}
        />
      ))}

      {/* 绘制网格线 */}
      <Segments 
        limit={1000} // 预分配最大线段数，确保足够 (FFD笼子一般不会超过这个数)
        color={lineColor}
        lineWidth={lineWidth}
      >
        {/* 遍历数据并为每个线段渲染一个 Segment 组件 */}
        {lines.map((segment, index) => (
          <Segment
            key={index}
            start={segment[0]}
            end={segment[1]}
          />
        ))}
      </Segments>
    </group>
  );
}

function App() {
  // --- FFD 状态提升到 App 组件 ---
  const gridSize = [3, 3, 3];
  const bboxMin = [-20, -20, -20];
  const bboxMax = [20, 20, 20];

  // 1. 初始化 controlPoints 状态
  const { points: initialPoints } = useMemo(
    () => generateFFDControlGeometry(gridSize, bboxMin, bboxMax),
    [gridSize, bboxMin, bboxMax]
  );

  const [controlPoints, setControlPoints] = useState(initialPoints);
  const [orbitEnabled, setOrbitEnabled] = useState(true); // 声明状态
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // 2. 这是在 Canvas“背景”上点击时触发的函数
  // const handleCanvasClick = (e) => {
  //   // 调用此函数意味着点击没有命中任何 FFDPoint
  //   setSelectedIndex(-1); 
  // };

  // 2. 定义更新 controlPoints 的函数
  const handlePointDrag = (index, newPosition) => {
    setControlPoints(prevPoints => {
      const newPoints = [...prevPoints];
      newPoints[index] = newPosition;
      
      // ⚠️ 这一步是 FFD 的核心：在这里触发模型的变形计算
      // 也可以直接返回 newPoints，让 Model 组件在接收到新 props 后自行计算
      
      return newPoints;
    });
  };

  return (
    <div id="main-container" style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      <div id="left-scene-container" style={{ flex: 7, backgroundColor: '#222' }}>
        <Canvas camera={{ position: [30, 30, 30], fov: 75 }} >
          <OrbitControls enabled={orbitEnabled} />
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} />

          {/* 传递 controlPoints 状态给 Model 组件 */}
          <Model 
            url="./book/scene.gltf" 
            controlPoints={controlPoints}
            gridSize={gridSize}
            bboxMin={bboxMin}
            bboxMax={bboxMax}
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
      <div id="right-controls-container" style={{ flex: 3, padding: '15px', overflowY: 'auto', backgroundColor: '#f0f0f0' }}>

      </div>
    </div>
  );
}

export default App;