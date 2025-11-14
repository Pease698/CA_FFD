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

function Model({ url, controlPoints }) {
  // 加载模型数据
  const { scene } = useGLTF(url);

  // 核心变形逻辑：使用 useMemo 确保只有 controlPoints 变化时才重新计算顶点
  useMemo(() => {
    
    // ----------------------------------------------------
    // FFD 变形主逻辑发生在这里！
    // ----------------------------------------------------
    
    // 1. 遍历 GLTF 场景中的所有 Mesh
    scene.traverse((object) => {
      if (object.isMesh) {
        const geometry = object.geometry;
        
        // 2. 访问 geometry 的顶点数据
        const positionAttribute = geometry.attributes.position;
        const vertexCount = positionAttribute.count;

        // 3. 对每个顶点应用 FFD 变形
        for (let i = 0; i < vertexCount; i++) {
          const originalX = positionAttribute.getX(i);
          const originalY = positionAttribute.getY(i);
          const originalZ = positionAttribute.getZ(i);

          // FFD 计算的步骤（伪代码）：
          // 1. 计算原始顶点 (originalX, originalY, originalZ) 在 FFD 笼子中的参数坐标 (s, t, u)
          // [s, t, u] = calculateSTU(originalX, originalY, originalZ, bboxMin, bboxMax, gridSize);

          // 2. 使用最新的 controlPoints 和 (s, t, u) 进行三线性插值，计算新的变形位置 (newX, newY, newZ)
          // [newX, newY, newZ] = calculateDeformedPosition(controlPoints, s, t, u, gridSize);
          
          // 3. 更新顶点位置
          // positionAttribute.setXYZ(i, newX, newY, newZ);
        }

        // 4. 标记几何体需要更新
        positionAttribute.needsUpdate = true;
        geometry.computeVertexNormals(); // 可能需要重新计算法线以保证光照正确
      }
    });
    
    // ----------------------------------------------------
    
  }, [controlPoints, scene]); // 依赖 controlPoints：每当拖拽停止，状态更新，这里就会重新执行

  return (
    <primitive object={scene} scale={1} />
  );
}
function SceneContainer() { // main component of the 3D scene
  return (
    <Canvas camera={{ position: [30, 30, 30], fov: 75 }}>
      // 引入模型
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
    const newPosition = meshRef.current.position;
    onDrag(index, [newPosition.x, newPosition.y, newPosition.z]);
    setOrbitEnabled(true);
  };
  
  const handleDraggingChanged = () => {
    setOrbitEnabled(false);
  };

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
          onMouseDown={handleDraggingChanged}
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
          <Model url="./book/scene.gltf" controlPoints={controlPoints} />

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