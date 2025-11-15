import { useRef } from 'react';
import { TransformControls } from '@react-three/drei';
import { useEffect } from 'react';

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

export function FFDManager({ controlPoints, onPointDrag, selectedIndex, setSelectedIndex, setOrbitEnabled }) {
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
