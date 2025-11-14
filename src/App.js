import logo from './logo.svg';
import './App.css';

import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useGLTF } from '@react-three/drei';
import { Scene } from 'three';

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
    <Canvas camera={{ position: [5, 5, 5], fov: 75 }}>
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

function App() {
  return (
    // <div className="App">
    //   <SceneContainer />
    // </div>
    <div id="main-container">
      <div id="left-scene-container">
        {SceneContainer()}
      </div>
      <div id="right-controls-container">
        {/* 控制组件放在这里 */}
      </div>
    </div>
    // <div className="App">
    //   <header className="App-header">
    //     <img src={logo} className="App-logo" alt="logo" />
    //     <p>
    //       Edit <code>src/App.js</code> and save to reload.
    //     </p>
    //     <a
    //       className="App-link"
    //       href="https://reactjs.org"
    //       target="_blank"
    //       rel="noopener noreferrer"
    //     >
    //       Learn React
    //     </a>
    //   </header>
    // </div>
  );
}

export default App;
