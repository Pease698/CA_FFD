import logo from './logo.svg';
import './App.css';

import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useGLTF } from '@react-three/drei';
import { Scene } from 'three';
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Points, PointMaterial, Line} from '@react-three/drei';
import * as THREE from 'three';
import { Segments, Segment } from '@react-three/drei';

function Model({ url }) {
  // 加载模型数据
  const { scene } = useGLTF(url);

  // FFD 关键：要对模型进行变形，您需要访问并修改其几何体（Geometry）的顶点数据
  // 对于复杂的GLTF模型，您可能需要遍历 scene.traverse() 来找到 Mesh 对象

  return (
    // 使用原始几何体（Primitive）将加载的场景数据渲染出来
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

function FFDControl({
  gridSize = [3, 3, 3],
  bboxMin = [-1, -1, -1],
  bboxMax = [1, 1, 1],
  pointColor = 'white',
  lineColor = 'grey',
  pointSize = 0.3,
  lineWidth = 2,
}) {
  const { points, lines } = useMemo(
    () => generateFFDControlGeometry(gridSize, bboxMin, bboxMax),
    [gridSize, bboxMin, bboxMax]
  );

  return (
    <group>
      {/* 绘制控制顶点 */}
      <Points positions={new Float32Array(points.flat())} stride={3}>
        <PointMaterial
          transparent
          color={pointColor}
          size={pointSize}
          sizeAttenuation={true}
          depthWrite={false}
        />
      </Points>

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
  return (
    <div id="main-container" style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      <div id="left-scene-container" style={{ flex: 7, backgroundColor: '#222' }}>
        <Canvas camera={{ position: [30, 30, 30], fov: 75 }}>
          <OrbitControls />
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} />

          {/* 你的三维物体模型会放在这里 */}
          <Model url="./book/scene.gltf" />

          {/* 绘制 FFD 控制顶点和网格线 */}
          <FFDControl
            gridSize={[3, 3, 3]} // 示例：3x3x3 的 FFD 笼子
            bboxMin={[-20, -20, -20]} // 假设 FFD 笼子的最小边界
            bboxMax={[20, 20, 20]}   // 假设 FFD 笼子的最大边界
            pointSize = {1}
          />
        </Canvas>
      </div>
      <div id="right-controls-container" style={{ flex: 3, padding: '15px', overflowY: 'auto', backgroundColor: '#f0f0f0' }}>

      </div>
    </div>
  );
}

export default App;
