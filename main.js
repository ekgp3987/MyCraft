// import * as THREE from 'https://threejsfundamentals.org/threejs/resources/threejs/r132/build/three.module.js';
// import {OrbitControls} from 'https://threejsfundamentals.org/threejs/resources/threejs/r132/examples/jsm/controls/OrbitControls.js';

class VoxelWorld {
  constructor(options) {
    this.cellSize = options.cellSize;
    this.tileSize = options.tileSize;
    this.tileTextureWidth = options.tileTextureWidth;
    this.tileTextureHeight = options.tileTextureHeight;
    const {cellSize} = this;
    this.cellSliceSize = cellSize * cellSize;
    this.cells = {};
  }
  computeVoxelOffset(x, y, z) {
    const {cellSize, cellSliceSize} = this;
    const voxelX = THREE.MathUtils.euclideanModulo(x, cellSize) | 0;
    const voxelY = THREE.MathUtils.euclideanModulo(y, cellSize) | 0;
    const voxelZ = THREE.MathUtils.euclideanModulo(z, cellSize) | 0;
    return voxelY * cellSliceSize +
      voxelZ * cellSize +
      voxelX;
  }
  getCellForVoxel(x, y, z) {
    const { cellSize } = this;
    const cellX = Math.floor(x / cellSize);
    const cellY = Math.floor(y / cellSize);
    const cellZ = Math.floor(z / cellSize);
    return `${cellX},${cellY},${cellZ}`;
  }
  getCellForVoxel(x, y, z) {
    return this.cells[this.computeCellId(x, y, z)]
  }
  setVoxel(x, y, z, v) {
    let cell = this.getCellForVoxel(x, y, z);
    if (!cell) {
      cell = this.addCellForVoxel(x, y, z);
    }
    const voxelOffset = this.computeVoxelOffset(x, y, z);
    cell[voxelOffset] = v;
  }
  addCellForVoxel(x, y, z) {
    const cellId = this.computeCellId(x, y, z);
    let cell = this.cells[cellId];
    if (!cell) {
      const { cellSize } = this;
      cell = new Uint8Array(cellSize * cellSize * cellSize);
      this.cells[cellId] = cell;
    }
    return cell;
  }
  getVoxel(x, y, z) {
    const cell = this.getCellForVoxel(x, y, z);
    if (!cell) {
      return 0;
    }
    const voxelOffset = this.computeVoxelOffset(x, y, z);
    return cell[voxelOffset];
  }
  generateGeometryDataForCell(cellX, cellY, cellZ) {
    const {cellSize, tileSize, tileTextureWidth, tileTextureHeight} = this;
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    const startX = cellX * cellSize;
    const startY = cellY * cellSize;
    const startZ = cellZ * cellSize;

    for (let y = 0; y < cellSize; ++y) {
      const voxelY = startY + y;
      for (let z = 0; z < cellSize; ++z) {
        const voxelZ = startZ + z;
        for (let x = 0; x < cellSize; ++x) {
          const voxelX = startX + x;
          const voxel = this.getVoxel(voxelX, voxelY, voxelZ);
          if (voxel) {
            // voxel 0 is sky (empty) so for UVs we start at 0
            const uvVoxel = voxel - 1;
            // There is a voxel here but do we need faces for it?
            for (const {dir, corners, uvRow} of VoxelWorld.faces) {
              const neighbor = this.getVoxel(
                  voxelX + dir[0],
                  voxelY + dir[1],
                  voxelZ + dir[2]);
              if (!neighbor) {
                // this voxel has no neighbor in this direction so we need a face.
                const ndx = positions.length / 3;
                for (const {pos, uv} of corners) {
                  positions.push(pos[0] + x, pos[1] + y, pos[2] + z);
                  normals.push(...dir);
                  uvs.push(
                        (uvVoxel +   uv[0]) * tileSize / tileTextureWidth,
                    1 - (uvRow + 1 - uv[1]) * tileSize / tileTextureHeight);
                }
                indices.push(
                  ndx, ndx + 1, ndx + 2,
                  ndx + 2, ndx + 1, ndx + 3,
                );
              }
            }
          }
        }
      }
    }

    return {
      positions,
      normals,
      uvs,
      indices,
    };
  }
  intersectRay(start, end) {
    let dx = end.x - start.x;
    let dy = end.y - start.y;
    let dz = end.z - start.z;
    const lenSq = dx * dx + dy * dy + dz * dz;
    const len = Math.sqrt(lenSq);

    dx /= len;
    dy /= len;
    dz /= len;

    let t = 0.0;
    let ix = Math.floor(start.x);
    let iy = Math.floor(start.y);
    let iz = Math.floor(start.z);

    const stepX = (dx > 0) ? 1 : -1;
    const stepY = (dy > 0) ? 1 : -1;
    const stepZ = (dz > 0) ? 1 : -1;

    const txDelta = Math.abs(1 / dx);
    const tyDelta = Math.abs(1 / dy);
    const tzDelta = Math.abs(1 / dz);

    const xDist = (stepX > 0) ? (ix + 1 - start.x) : (start.x - ix);
    const yDist = (stepY > 0) ? (iy + 1 - start.y) : (start.y - iy);
    const zDist = (stepZ > 0) ? (iz + 1 - start.z) : (start.z - iz);

    // location of nearest voxel boundary, in units of t
    let txMax = (txDelta < Infinity) ? txDelta * xDist : Infinity;
    let tyMax = (tyDelta < Infinity) ? tyDelta * yDist : Infinity;
    let tzMax = (tzDelta < Infinity) ? tzDelta * zDist : Infinity;

    let steppedIndex = -1;

    // main loop along raycast vector
    while (t <= len) {
      const voxel = this.getVoxel(ix, iy, iz);
      if (voxel) {
        return {
          position: [
            start.x + t * dx,
            start.y + t * dy,
            start.z + t * dz,
          ],
          normal: [
            steppedIndex === 0 ? -stepX : 0,
            steppedIndex === 1 ? -stepY : 0,
            steppedIndex === 2 ? -stepZ : 0,
          ],
          voxel,
        };
      }

      // advance t to next nearest voxel boundary
      if (txMax < tyMax) {
        if (txMax < tzMax) {
          ix += stepX;
          t = txMax;
          txMax += txDelta;
          steppedIndex = 0;
        } else {
          iz += stepZ;
          t = tzMax;
          tzMax += tzDelta;
          steppedIndex = 2;
        }
      } else {
        if (tyMax < tzMax) {
          iy += stepY;
          t = tyMax;
          tyMax += tyDelta;
          steppedIndex = 1;
        } else {
          iz += stepZ;
          t = tzMax;
          tzMax += tzDelta;
          steppedIndex = 2;
        }
      }
    }
    return null;
  }
}


/*  texture atlas setting */

VoxelWorld.faces = [
  { // left
    uvRow: 0,
    dir: [ -1,  0,  0, ],
    corners: [
      { pos: [ 0, 1, 0 ], uv: [ 0, 1 ], },
      { pos: [ 0, 0, 0 ], uv: [ 0, 0 ], },
      { pos: [ 0, 1, 1 ], uv: [ 1, 1 ], },
      { pos: [ 0, 0, 1 ], uv: [ 1, 0 ], },
    ],
  },
  { // right
    uvRow: 0,
    dir: [  1,  0,  0, ],
    corners: [
      { pos: [ 1, 1, 1 ], uv: [ 0, 1 ], },
      { pos: [ 1, 0, 1 ], uv: [ 0, 0 ], },
      { pos: [ 1, 1, 0 ], uv: [ 1, 1 ], },
      { pos: [ 1, 0, 0 ], uv: [ 1, 0 ], },
    ],
  },
  { // bottom
    uvRow: 1,
    dir: [  0, -1,  0, ],
    corners: [
      { pos: [ 1, 0, 1 ], uv: [ 1, 0 ], },
      { pos: [ 0, 0, 1 ], uv: [ 0, 0 ], },
      { pos: [ 1, 0, 0 ], uv: [ 1, 1 ], },
      { pos: [ 0, 0, 0 ], uv: [ 0, 1 ], },
    ],
  },
  { // top
    uvRow: 2,
    dir: [  0,  1,  0, ],
    corners: [
      { pos: [ 0, 1, 1 ], uv: [ 1, 1 ], },
      { pos: [ 1, 1, 1 ], uv: [ 0, 1 ], },
      { pos: [ 0, 1, 0 ], uv: [ 1, 0 ], },
      { pos: [ 1, 1, 0 ], uv: [ 0, 0 ], },
    ],
  },
  { // back
    uvRow: 0,
    dir: [  0,  0, -1, ],
    corners: [
      { pos: [ 1, 0, 0 ], uv: [ 0, 0 ], },
      { pos: [ 0, 0, 0 ], uv: [ 1, 0 ], },
      { pos: [ 1, 1, 0 ], uv: [ 0, 1 ], },
      { pos: [ 0, 1, 0 ], uv: [ 1, 1 ], },
    ],
  },
  { // front
    uvRow: 0,
    dir: [  0,  0,  1, ],
    corners: [
      { pos: [ 0, 0, 1 ], uv: [ 0, 0 ], },
      { pos: [ 1, 0, 1 ], uv: [ 1, 0 ], },
      { pos: [ 0, 1, 1 ], uv: [ 0, 1 ], },
      { pos: [ 1, 1, 1 ], uv: [ 1, 1 ], },
// =======
//       indices,
//     };
//   }
// }

// VoxelWorld.faces = [
//   { // left
//     dir: [-1, 0, 0,],
//     corners: [
//       [0, 1, 0],
//       [0, 0, 0],
//       [0, 1, 1],
//       [0, 0, 1],
//     ],
//   },
//   { // right
//     dir: [1, 0, 0,],
//     corners: [
//       [1, 1, 1],
//       [1, 0, 1],
//       [1, 1, 0],
//       [1, 0, 0],
//     ],
//   },
//   { // bottom
//     dir: [0, -1, 0,],
//     corners: [
//       [1, 0, 1],
//       [0, 0, 1],
//       [1, 0, 0],
//       [0, 0, 0],
//     ],
//   },
//   { // top
//     dir: [0, 1, 0,],
//     corners: [
//       [0, 1, 1],
//       [1, 1, 1],
//       [0, 1, 0],
//       [1, 1, 0],
//     ],
//   },
//   { // back
//     dir: [0, 0, -1,],
//     corners: [
//       [1, 0, 0],
//       [0, 0, 0],
//       [1, 1, 0],
//       [0, 1, 0],
//     ],
//   },
//   { // front
//     dir: [0, 0, 1,],
//     corners: [
//       [0, 0, 1],
//       [1, 0, 1],
//       [0, 1, 1],
//       [1, 1, 1],
// >>>>>>> kimdahye
    ],
  },
];

function main() {
  const canvas = document.querySelector('#gl-canvas');
  const renderer = new THREE.WebGLRenderer({canvas});

  const cellSize = 50;

  const fov = 75;
  const aspect = 2;  // the canvas default
  const near = 0.1;
  const far = 1000;
  const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  camera.position.set(-cellSize * .3, cellSize * .8, -cellSize * .3);

  // camera: orbitcontrol
  // const controls = new THREE.OrbitControls(camera, canvas);
  // controls.target.set(cellSize / 2, cellSize / 3, cellSize / 2);
  // controls.update();

  // const scene = new THREE.Scene();
  // scene.background = new THREE.Color('skyblue');

  // camera: flycontrol 사용
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('lightblue');

  camera.position.set(cellSize / 2, cellSize / 3, cellSize / 2+40); //이렇게 해야 도형보임(조정)
  

  //camera 방법 1. threejs controls 를 사용한다.
  // 2. 이벤트로 keycode받아서 카메라의 위치변환(뭔가 잘안된다...) 
  
  //변경하려는 FlyControls 코드 (작동x)
  const controls = new THREE.FlyControls(camera, canvas); //카메라 control
    controls.movementSpeed = 20;
    controls.rollSpeed = 0.01;
    controls.autoForward = true;
    controls.dragToLook = true;
  /* */

  /*
  //기존의 OrbitControls 코드 
  const controls = new THREE.OrbitControls(camera, canvas);
  controls.target.set(cellSize / 2, cellSize / 3, cellSize / 2); //기존 카메라 위치
  controls.update();
  /* */

  const clock = new THREE.Clock(true) //controls.update(delta) 를 위한 변수.





  function addLight(x, y, z) {
    const color = 0xFFFFFF;
    const intensity = 1;
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(x, y, z);
    scene.add(light);
  }
  addLight(-1, 2, 4);
  addLight(1, -1, -2);

  const world = new VoxelWorld(cellSize);

  for (let y = 0; y < cellSize; ++y) {
    for (let z = 0; z < cellSize; ++z) {
      for (let x = 0; x < cellSize; ++x) {
        let height = 3;
        // const height = (Math.sin(x / cellSize * Math.PI * 2) + Math.sin(z / cellSize * Math.PI * 3)) * (cellSize / 6) + (cellSize / 2);
        if (y < height) {
          world.setVoxel(x, y, z, 1);
        }
      }
    }
  }

  const { positions, normals, indices } = world.generateGeometryDataForCell(0, 0, 0);
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.MeshLambertMaterial({ color: 'green' });

  const positionNumComponents = 3;
  const normalNumComponents = 3;
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(positions), positionNumComponents));
  geometry.setAttribute(
    'normal',
    new THREE.BufferAttribute(new Float32Array(normals), normalNumComponents));
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  function resizeRendererToDisplaySize(renderer) {
    const canvas = renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const needResize = canvas.width !== width || canvas.height !== height;
    if (needResize) {
      renderer.setSize(width, height, false);
    }
    return needResize;
  }

  let renderRequested = false;

  function render() {

    var delta = clock.getDelta();  //controls.update(delta)에 사용변수.
    renderRequested = undefined;

    if (resizeRendererToDisplaySize(renderer)) {
      const canvas = renderer.domElement;
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
    }

    //renderer.clear();
    //controls.update();  //orbitControls 용
    controls.update(delta); //delta


    renderer.render(scene, camera);
  }
  render();

  function requestRenderIfNotRequested() {
    if (!renderRequested) {
      renderRequested = true;
      
      requestAnimationFrame(render);

    }
  }


  controls.addEventListener('change', requestRenderIfNotRequested); //orbitControls 용
  window.addEventListener('resize', requestRenderIfNotRequested);



  function addLight(x, y, z) {
    const color = 0xFFFFFF;
    const intensity = 1;
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(x, y, z);
    scene.add(light);
  }
  addLight(-1,  2,  4);
  addLight( 1, -1, -2);

  /*background*/
  function createClouds(radius, segments) {
    // Mesh
    return new THREE.Mesh(
        // geometry
        new THREE.SphereGeometry(radius, segments, segments),
        // material
        new THREE.MeshBasicMaterial({
            map:    THREE.ImageUtils.loadTexture('images/fair_clouds_4k.png'),
            side:   THREE.BackSide,
            transparent:    true
        })
    );
  }
  var clouds = createClouds(80, 64);  // create big sphere
  scene.add(clouds);

  // bring textuers
  /*  bring textuers */  
  const loader = new THREE.TextureLoader();
  let texture = loader.load(src="textures/my-texture2.png"); //직접 지정
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;

  const tileSize = 1024;
  const tileTextureWidth = 16384;
  const tileTextureHeight = 4096;
  const world = new VoxelWorld({
    cellSize,
    tileSize,
    tileTextureWidth,
    tileTextureHeight,
  });

  // function randInt(min, max) {
  //   return Math.floor(Math.random() * (max - min) + min);
  // }

  // const {positions, normals, uvs, indices} = world.generateGeometryDataForCell(0, 0, 0);
  // const geometry = new THREE.BufferGeometry();
  const material = new THREE.MeshLambertMaterial({
    map: texture,
    side: THREE.DoubleSide,
    alphaTest: 0.1,
    transparent: true,
  });

  const cellIdToMesh = {};
  function updateCellGeometry(x, y, z) {
    const cellX = Math.floor(x / cellSize);
    const cellY = Math.floor(y / cellSize);
    const cellZ = Math.floor(z / cellSize);
    const cellId = world.computeCellId(x, y, z);
    let mesh = cellIdToMesh[cellId];
    const geometry = mesh ? mesh.geometry : new THREE.BufferGeometry();

    const {positions, normals, uvs, indices} = world.generateGeometryDataForCell(cellX, cellY, cellZ);
    const positionNumComponents = 3;
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), positionNumComponents));
    const normalNumComponents = 3;
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), normalNumComponents));
    const uvNumComponents = 2;
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), uvNumComponents));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();

    if (!mesh) {
      mesh = new THREE.Mesh(geometry, material);
      mesh.name = cellId;
      cellIdToMesh[cellId] = mesh;
      scene.add(mesh);
      mesh.position.set(cellX * cellSize, cellY * cellSize, cellZ * cellSize);
    }
  }

  const neighborOffsets = [
    [ 0,  0,  0], // self
    [-1,  0,  0], // left
    [ 1,  0,  0], // right
    [ 0, -1,  0], // down
    [ 0,  1,  0], // up
    [ 0,  0, -1], // back
    [ 0,  0,  1], // front
  ];
  function updateVoxelGeometry(x, y, z) {
    const updatedCellIds = {};
    for (const offset of neighborOffsets) {
      const ox = x + offset[0];
      const oy = y + offset[1];
      const oz = z + offset[2];
      const cellId = world.computeCellId(ox, oy, oz);
      if (!updatedCellIds[cellId]) {
        updatedCellIds[cellId] = true;
        updateCellGeometry(ox, oy, oz);
      }
    }
  }
  
  for (let y = 0; y < cellSize; ++y) {
    for (let z = 0; z < cellSize; ++z) {
      for (let x = 0; x < cellSize; ++x) {
        let height = 3;
        // const height = (Math.sin(x / cellSize * Math.PI * 2) + Math.sin(z / cellSize * Math.PI * 3)) * (cellSize / 6) + (cellSize / 2);
        if (y < height) {
          world.setVoxel(x, y, z, randInt(1, 18));
          // world.setVoxel(x, y, z, 1); //마지막 숫자번째 texture 사용
          // texture = loader.load(src="textures/marble_01_1k.png"); //직접 지정
        }
        // else if(y==height){
        //   // world.setVoxel(x, y, z, 1); //1번째 texture 사용
        //   texture = loader.load(src="textures/brick_wall_001_1k.png"); //직접 지정
        // }
        // world.setVoxel(x, y, z, 1); //1번째 texture 사용
        
        
      }
    }
  }
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
  }

  updateVoxelGeometry(0,0,0);  // 0,0,0 will generate

  function resizeRendererToDisplaySize(renderer) {
    const canvas = renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const needResize = canvas.width !== width || canvas.height !== height;
    if (needResize) {
      renderer.setSize(width, height, false);
    }
    return needResize;
  }

  let renderRequested = false;

  function render() {
    renderRequested = undefined;

    if (resizeRendererToDisplaySize(renderer)) {
      const canvas = renderer.domElement;
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
    }

    controls.update();
    renderer.render(scene, camera);
  }
  render();

  let currentVoxel = 0;
  let currentId;
  
  document.querySelectorAll('#ui .tiles input[type=radio][name=voxel]').forEach((elem) => {
    elem.addEventListener('click', allowUncheck);
  });
  
  function allowUncheck() {
    if (this.id === currentId) {
      this.checked = false;
      currentId = undefined;
      currentVoxel = 0;
    } else {
      currentId = this.id;
      currentVoxel = parseInt(this.value);
    }
  }

  function getCanvasRelativePosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * canvas.width  / rect.width,
      y: (event.clientY - rect.top ) * canvas.height / rect.height,
    };
  }
   
  function placeVoxel(event) {
    const pos = getCanvasRelativePosition(event);
    const x = (pos.x / canvas.width ) *  2 - 1;
    const y = (pos.y / canvas.height) * -2 + 1;  // Y축을 뒤집었음
   
    const start = new THREE.Vector3();
    const end = new THREE.Vector3();
    start.setFromMatrixPosition(camera.matrixWorld);
    end.set(x, y, 1).unproject(camera);
   
    const intersection = world.intersectRay(start, end);
    if (intersection) {
      const voxelId = event.shiftKey ? 0 : currentVoxel;
      /**
       * 교차점은 면 위에 있습니다. 이는 수학적 오차로 인해 교차점이 면의 양면
       * 어디로 떨어질지 모른다는 이야기죠.
       * 그래서 복셀을 제거하는 경우(currentVoxel = 0)는 normal의 값을 반으로
       * 줄이고, 추가하는 경우(currentVoxel > 0)에는 방향을 바꾼 뒤 반만큼 줄입니다.
       **/
      const pos = intersection.position.map((v, ndx) => {
        return v + intersection.normal[ndx] * (voxelId > 0 ? 0.5 : -0.5);
      });
      world.setVoxel(...pos, voxelId);
      updateVoxelGeometry(...pos);
      requestRenderIfNotRequested();
    }
  }
   
  const mouse = {
    x: 0,
    y: 0,
  };
   
  function recordStartPosition(event) {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.moveX = 0;
    mouse.moveY = 0;
  }
  function recordMovement(event) {
    mouse.moveX += Math.abs(mouse.x - event.clientX);
    mouse.moveY += Math.abs(mouse.y - event.clientY);
  }
  function placeVoxelIfNoMovement(event) {
    if (mouse.moveX < 5 && mouse.moveY < 5) {
      placeVoxel(event);
    }
    window.removeEventListener('pointermove', recordMovement);
    window.removeEventListener('pointerup', placeVoxelIfNoMovement);
  }
  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    recordStartPosition(event);
    window.addEventListener('pointermove', recordMovement);
    window.addEventListener('pointerup', placeVoxelIfNoMovement);
  }, { passive: false });
  canvas.addEventListener('touchstart', (event) => {
    // prevent scrolling
    event.preventDefault();
  }, { passive: false });

  function requestRenderIfNotRequested() {
    if (!renderRequested) {
      renderRequested = true;
      requestAnimationFrame(render);
    }
  }

  controls.addEventListener('change', requestRenderIfNotRequested);
  window.addEventListener('resize', requestRenderIfNotRequested);
}

main();
// let i =0;
//  function back(){
//    i = Math.abs(--i)%3;
//    var url = 'url("flourish-cc-by-nc-sa'.concat(i,'.png")');
//    console.log(i);
//    var ui = document.getElementById("ui")
//    var tiles = ui.querySelectorAll("input[type=radio] + label")
//    for(var j = 0; j<16; j++){
//      tiles[j].style.backgroundImage = url;
//    }    
//  }
//  function forth(){
//    i = Math.abs(++i)%3;
//    var url = 'url("flourish-cc-by-nc-sa'.concat(i,'.png")');
//    var ui = document.getElementById("ui")
//    var tiles = ui.querySelectorAll("input[type=radio] + label")
//    for(var j = 0; j<16; j++){
//      tiles[j].style.backgroundImage = url;

//    }     
//  }

