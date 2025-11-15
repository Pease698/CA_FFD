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

import { FFDManager } from './FFDManager.js';
import { generateFFDControlGeometry } from './FFDCP.js';
import { Model } from './Model.js';

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
