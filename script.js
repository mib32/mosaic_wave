import { mat4 } from 'https://cdn.skypack.dev/gl-matrix';

async function createScene(canvas) {
  if (!navigator.gpu) {
    console.error("WebGPU is not supported in this browser.");
    return;
  }

  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();

  const context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format,
    alphaMode: "opaque",
  });

  // Constants
  const numRows = 10;
  const baseHeight = 0.3;
  const expansionFactor = 0.4;
  const waveFrequency = 0.2;
  const phaseDelay = (Math.PI / 3); // 60 degrees in radians

  const frameWidth = canvas.width / 100; // Normalized to screen space
  const frameHeight = canvas.height / 100;

  // Shader Code (WGSL)
  const vertexShaderCode = `
        struct Uniforms {
            time: f32,
        };
        @binding(0) @group(0) var<uniform> uniforms: Uniforms;

        struct VertexInput {
            @location(0) position: vec2<f32>,
            @builtin(instance_index) instanceIndex: u32,
        };

        struct VertexOutput {
            @builtin(position) position: vec4<f32>,
            @location(0) color: vec4<f32>,
        };

        @vertex
        fn main(input: VertexInput) -> VertexOutput {
            let baseHeight = ${baseHeight.toFixed(2)};
            let expansionFactor = ${expansionFactor.toFixed(2)};
            let waveFrequency = ${waveFrequency.toFixed(2)};
            let phaseDelay = ${phaseDelay.toFixed(2)};

            let rowIndex = f32(input.instanceIndex);
            let phaseOffset = phaseDelay * rowIndex;
            let sineValue = sin(waveFrequency * uniforms.time + phaseOffset);
            let modulatedHeight = baseHeight * (1.0 + expansionFactor * sineValue);

            let yOffset = rowIndex * -baseHeight * 2.0;
            var out = VertexOutput();
            out.position = vec4<f32>(input.position.x, input.position.y * modulatedHeight + yOffset, 0.0, 1.0);

            let isBlack = (input.instanceIndex % 2u == 0u);
            out.color = if isBlack {
                vec4<f32>(0.0, 0.0, 0.0, 1.0)
            } else {
                vec4<f32>(1.0, 1.0, 1.0, 1.0)
            };
            return out;
        }
    `;

  const fragmentShaderCode = `
        @fragment
        fn main(@location(0) color: vec4<f32>) -> @location(0) vec4<f32> {
            return color;
        }
    `;

  // Pipeline
  const pipeline = device.createRenderPipeline({
    vertex: {
      module: device.createShaderModule({ code: vertexShaderCode }),
      entryPoint: 'main',
      buffers: [ {
        arrayStride: 2 * Float32Array.BYTES_PER_ELEMENT,
        attributes: [ {
          shaderLocation: 0,
          offset: 0,
          format: 'float32x2',
        } ],
      } ],
    },
    fragment: {
      module: device.createShaderModule({ code: fragmentShaderCode }),
      entryPoint: 'main',
      targets: [ { format } ],
    },
    primitive: { topology: 'triangle-strip' },
  });

  // Vertex buffer (Quad)
  const vertices = new Float32Array([
    -frameWidth, 1, // Top-left
    frameWidth, 1, // Top-right
    -frameWidth, -1, // Bottom-left
    frameWidth, -1, // Bottom-right
  ]);

  const vertexBuffer = device.createBuffer({
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, vertices);

  // Uniform buffer for time
  const uniformBuffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [ { binding: 0, resource: { buffer: uniformBuffer } } ],
  });

  // Render Loop
  let startTime = performance.now();

  function render() {
    const currentTime = performance.now();
    const elapsedTime = (currentTime - startTime) / 1000;

    // Update time uniform
    device.queue.writeBuffer(uniformBuffer, 0, new Float32Array([ elapsedTime ]));

    // Command encoding
    const commandEncoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [ {
        view: textureView,
        loadValue: [ 0, 0, 0, 1 ],
        storeOp: 'store',
      } ],
    });

    renderPass.setPipeline(pipeline);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.setVertexBuffer(0, vertexBuffer);
    renderPass.draw(4, numRows);
    renderPass.endPass();

    device.queue.submit([ commandEncoder.finish() ]);
    requestAnimationFrame(render);
  }

  render();
}

// Initialize WebGPU
const canvas = document.getElementById('webgpuCanvas');
createScene(canvas);
