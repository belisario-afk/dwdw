// Tiny WebGL + mat4 helpers used by Word Burst 3D

export function createProgram(gl: WebGLRenderingContext | WebGL2RenderingContext, vsSource: string, fsSource: string): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSource);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) || 'link failed';
    gl.deleteProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    throw new Error(`GL link error: ${log}`);
  }
  // Cleanup shaders after successful link
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

function compile(gl: WebGLRenderingContext | WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || 'compile failed';
    gl.deleteShader(sh);
    throw new Error(`GL shader compile error: ${log}\n${src}`);
  }
  return sh;
}

// Mat4 helpers (column-major Float32Array[16])
export function mat4Identity(): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
}

export function mat4Perspective(fovyRad: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1.0 / Math.tan(fovyRad / 2);
  const nf = 1 / (near - far);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;

  out[4] = 0;
  out[5] = f;
  out[6] = 0;
  out[7] = 0;

  out[8] = 0;
  out[9] = 0;
  out[10] = (far + near) * nf;
  out[11] = -1;

  out[12] = 0;
  out[13] = 0;
  out[14] = (2 * far * near) * nf;
  out[15] = 0;
  return out;
}

export function mat4LookAt(eye: [number, number, number], center: [number, number, number], up: [number, number, number]): Float32Array {
  const [ex, ey, ez] = eye;
  const [cx, cy, cz] = center;
  let [ux, uy, uz] = up;

  // f = normalize(center - eye)
  let fx = cx - ex, fy = cy - ey, fz = cz - ez;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;

  // s = normalize(cross(f, up))
  let sx = fy * uz - fz * uy;
  let sy = fz * ux - fx * uz;
  let sz = fx * uy - fy * ux;
  const sl = Math.hypot(sx, sy, sz) || 1;
  sx /= sl; sy /= sl; sz /= sl;

  // u = cross(s, f)
  ux = sy * fz - sz * fy;
  uy = sz * fx - sx * fz;
  uz = sx * fy - sy * fx;

  const out = new Float32Array(16);
  out[0] = sx; out[4] = sy; out[8] = sz;  out[12] = 0;
  out[1] = ux; out[5] = uy; out[9] = uz;  out[13] = 0;
  out[2] = -fx;out[6] = -fy;out[10] = -fz;out[14] = 0;
  out[3] = 0;  out[7] = 0;  out[11] = 0;  out[15] = 1;

  // Translate by -eye
  out[12] = -(sx * ex + sy * ey + sz * ez);
  out[13] = -(ux * ex + uy * ey + uz * ez);
  out[14] = -(-fx * ex + -fy * ey + -fz * ez);
  return out;
}