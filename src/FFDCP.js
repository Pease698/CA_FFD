// 生成 FFD 控制点和线
export function generateFFDControlGeometry(
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
