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
import { useLayoutEffect } from 'react';
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
  const bakedScene = useMemo(() => {
    const scene = originalScene.clone(true); // 克隆
    const objectsToConvert = [];

    // 1. 找到所有 InstancedMesh
    scene.traverse((object) => {
      if (object.isInstancedMesh) {
        objectsToConvert.push(object);
      }
    });

    // // 2. 转换
    // objectsToConvert.forEach(instancedMesh => {
    //   const parent = instancedMesh.parent;

    //   for (let i = 0; i < instancedMesh.count; i++) {
    //     const matrix = new THREE.Matrix4();
    //     instancedMesh.getMatrixAt(i, matrix); // 获取实例矩阵

    //     const newMesh = new THREE.Mesh(
    //       instancedMesh.geometry.clone(), // 克隆几何体
    //       instancedMesh.material         // 共享材质 (或克隆)
    //     );

    //     newMesh.geometry.applyMatrix4(matrix); // 烘焙变换

    //     // 继承原 InstancedMesh 的其他属性
    //     newMesh.name = `${instancedMesh.name}_instance_${i}`;
    //     // ... (position, rotation, scale 应该被 applyMatrix4 重置了)

    //     parent.add(newMesh); // 添加到场景
    //   }

    //   // 3. 移除原始的 InstancedMesh
    //   parent.remove(instancedMesh);
    // });

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
          instancedMesh.material         // 共享材质
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

  // 3. 创建 "变形" 场景 (可写目标)
  // 这是我们将要实际修改并渲染的场景
  const deformedScene = useMemo(() => {
    // console.log("Step 3: Cloning baked scene AND its geometries...");
    
    // 1. 克隆场景结构 (这仍然会共享几何体)
    const scene = bakedScene.clone(true);

    // 遍历新克隆的 scene，
    // 并将每个网格的几何体(geometry)替换为它自己的克隆版本。
    // 这打破了 deformedScene 和 bakedScene 之间的共享引用。
    scene.traverse((object) => {
      if (object.isMesh) {
        // object.geometry.clone() 会创建一个新的、
        // 拥有独立 buffer attributes 的几何体。
        object.geometry = object.geometry.clone();
      }
    });

    return scene;
  }, [bakedScene]);


  // 4. 预计算 STU 坐标
  const geometryData = useMemo(() => {
    // console.log("Step 4: Pre-calculating STU (Array)...");
    
    // 我们将 STU 数据存储在一个数组中，
    // 依赖于 bakedScene 和 deformedScene 具有完全相同的遍历顺序
    const stuList = [];
    const originalVertex = new THREE.Vector3();

    bakedScene.traverse((object) => {
      if (object.isMesh) {
        // 从 "bakedMesh" (只读源) 读取位置数据
        const positionAttribute = object.geometry.attributes.position; 
        const vertexCount = positionAttribute.count;
        const stuArray = new Float32Array(vertexCount * 3);
        
        for (let j = 0; j < vertexCount; j++) {
          originalVertex.fromBufferAttribute(positionAttribute, j);
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

  // 5. 核心变形逻辑
  React.useLayoutEffect(() => {
    // console.log("Step 5: Applying deformation (Array)...");
    
    const stu = new THREE.Vector3();
    let meshIndex = 0; // <--- 用于跟踪 STU 数组的索引

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
        
        meshIndex++; // <--- 移动到下一个网格的 STU 数据
      }
    });
    
  }, [controlPoints, geometryData, gridSize]);

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