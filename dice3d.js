/**
 * 3D Dice Renderer using Three.js.
 * Handles the 3D scene, lighting, shadows, physics simulation,
 * canvas-generated textures, and landing animations.
 */
class Dice3D {
    constructor(container) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        
        this.dice = [];
        this.isRolling = false;
        
        // Physics and animation variables
        this.dieSize = 0.65;
        this.radius = this.dieSize / 2;
        
        // Bounding box limits for dice containment
        this.bounds = { x: 3.5, z: 2.2 };
        
        this.init();
        window.addEventListener('resize', () => this.onResize());
        window.addEventListener('orientationchange', () => setTimeout(() => this.onResize(), 200));
    }

    onResize() {
        if (!this.container || !this.renderer || !this.camera) return;
        const width = this.container.clientWidth || 400;
        const height = this.container.clientHeight || 250;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    init() {
        // Create Scene
        this.scene = new THREE.Scene();

        // Setup Camera (Perspective)
        const width = this.container.clientWidth || 400;
        const height = this.container.clientHeight || 250;
        this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
        // Position camera looking down at the board
        this.camera.position.set(0, 7.5, 5);
        this.camera.lookAt(0, 0.2, 0);

        // Setup Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);
        this.renderer.domElement.style.pointerEvents = 'none';

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
        this.scene.add(ambientLight);

        const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.7);
        dirLight1.position.set(4, 8, 3);
        dirLight1.castShadow = true;
        dirLight1.shadow.mapSize.width = 1024;
        dirLight1.shadow.mapSize.height = 1024;
        dirLight1.shadow.camera.near = 0.5;
        dirLight1.shadow.camera.far = 25;
        dirLight1.shadow.camera.left = -4;
        dirLight1.shadow.camera.right = 4;
        dirLight1.shadow.camera.top = 4;
        dirLight1.shadow.camera.bottom = -4;
        dirLight1.shadow.bias = -0.001;
        this.scene.add(dirLight1);

        const dirLight2 = new THREE.DirectionalLight(0xaaccff, 0.35);
        dirLight2.position.set(-4, 6, -3);
        this.scene.add(dirLight2);

        // Create Dice Textures
        const faceTextures = this.createDiceTextures();
        const materials = faceTextures.map(tex => new THREE.MeshStandardMaterial({
            map: tex,
            roughness: 0.18,
            metalness: 0.1,
            bumpMap: tex,
            bumpScale: 0.02
        }));

        // Shadow Receiver Plane (Ground)
        const shadowPlaneGeo = new THREE.PlaneGeometry(15, 10);
        const shadowPlaneMat = new THREE.ShadowMaterial({ opacity: 0.25 });
        const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
        shadowPlane.rotation.x = -Math.PI / 2;
        shadowPlane.position.y = 0;
        shadowPlane.receiveShadow = true;
        this.scene.add(shadowPlane);

        // Create the 2 dice (subdivided to support rounded corners)
        const geometry = new THREE.BoxGeometry(this.dieSize, this.dieSize, this.dieSize, 8, 8, 8);
        this.makeRoundedBox(geometry, this.dieSize, 0.08);
        
        for (let i = 0; i < 2; i++) {
            const die = new THREE.Mesh(geometry, materials);
            die.castShadow = true;
            die.receiveShadow = true;
            
            // Set initial positions off-screen or hidden
            die.position.set(i === 0 ? -1.2 : 1.2, -5, 0);
            this.scene.add(die);
            
            this.dice.push({
                mesh: die,
                pos: new THREE.Vector3(),
                vel: new THREE.Vector3(),
                rot: new THREE.Quaternion(),
                angVel: new THREE.Vector3(),
                targetPos: new THREE.Vector3(),
                targetRot: new THREE.Quaternion(),
                value: 1
            });
        }

        // Handle resizing
        window.addEventListener('resize', () => this.resize());
        
        // Start animation loop
        this.animate();
    }

    /**
     * Morph vertices of a subdivided box to round its corners and edges.
     */
    makeRoundedBox(geometry, size, radius) {
        const position = geometry.attributes.position;
        const R = size / 2;
        const d = R - radius;
        
        for (let i = 0; i < position.count; i++) {
            let x = position.getX(i);
            let y = position.getY(i);
            let z = position.getZ(i);
            
            let qx = Math.max(0, Math.abs(x) - d);
            let qy = Math.max(0, Math.abs(y) - d);
            let qz = Math.max(0, Math.abs(z) - d);
            
            let len = Math.sqrt(qx * qx + qy * qy + qz * qz);
            if (len > 0) {
                let signX = x >= 0 ? 1 : -1;
                let signY = y >= 0 ? 1 : -1;
                let signZ = z >= 0 ? 1 : -1;
                
                let newX = Math.abs(x) > d ? signX * (d + qx * radius / len) : x;
                let newY = Math.abs(y) > d ? signY * (d + qy * radius / len) : y;
                let newZ = Math.abs(z) > d ? signZ * (d + qz * radius / len) : z;
                
                position.setXYZ(i, newX, newY, newZ);
            }
        }
        geometry.computeVertexNormals();
    }

    resize() {
        if (!this.container || !this.renderer) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    /**
     * Generates HTML Canvas-based textures for the 6 faces.
     * Face mapping matches the default Three.js BoxGeometry material order:
     * Materials array index:
     * 0: +X (Face 3)
     * 1: -X (Face 4)
     * 2: +Y (Face 1) -> TOP
     * 3: -Y (Face 6) -> BOTTOM
     * 4: +Z (Face 2)
     * 5: -Z (Face 5)
    /**
     * Generates HTML Canvas-based textures for the 6 faces.
     */
    createDiceTextures(bgColor = "#ffffff", dotColor = "#000000") {
        const textures = [];
        const faces = [3, 4, 1, 6, 2, 5]; // Numbers corresponding to indices [0..5]
        
        faces.forEach(val => {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');

            // Draw base
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, 128, 128);

            // Draw subtle border shading
            ctx.strokeStyle = "rgba(0,0,0,0.15)";
            ctx.lineWidth = 6;
            ctx.strokeRect(3, 3, 122, 122);
            ctx.strokeStyle = "rgba(255,255,255,0.2)";
            ctx.lineWidth = 3;
            ctx.strokeRect(5, 5, 118, 118);

            // Draw dots
            ctx.fillStyle = dotColor;
            
            const radius = 10;
            const drawDot = (x, y) => {
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fill();
            };

            const center = 64;
            const left = 36;
            const right = 92;
            const top = 36;
            const bottom = 92;

            if (val === 1) {
                drawDot(center, center);
            } else if (val === 2) {
                drawDot(left, top);
                drawDot(right, bottom);
            } else if (val === 3) {
                drawDot(left, top);
                drawDot(center, center);
                drawDot(right, bottom);
            } else if (val === 4) {
                drawDot(left, top);
                drawDot(right, top);
                drawDot(left, bottom);
                drawDot(right, bottom);
            } else if (val === 5) {
                drawDot(left, top);
                drawDot(right, top);
                drawDot(center, center);
                drawDot(left, bottom);
                drawDot(right, bottom);
            } else if (val === 6) {
                drawDot(left, top);
                drawDot(right, top);
                drawDot(left, center);
                drawDot(right, center);
                drawDot(left, bottom);
                drawDot(right, bottom);
            }

            const texture = new THREE.CanvasTexture(canvas);
            textures.push(texture);
        });

        return textures;
    }

    /**
     * Set the color theme of the dice
     */
    setTheme(themeName) {
        let diceBgColor = "#ffffff"; // default White
        let dotColor = "#000000"; // default Black

        if (themeName === "cyberpunk") {
            diceBgColor = "#00f0ff"; // cyan glow
            dotColor = "#000000";
        } else if (themeName === "classic") {
            diceBgColor = "#f4a261"; // amber wood tone
            dotColor = "#3d1e08";
        }

        // Regenerate and update materials
        const textures = [];
        const faces = [3, 4, 1, 6, 2, 5];
        
        faces.forEach(val => {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = diceBgColor;
            ctx.fillRect(0, 0, 128, 128);
            
            ctx.strokeStyle = "rgba(0,0,0,0.15)";
            ctx.lineWidth = 6;
            ctx.strokeRect(3, 3, 122, 122);
            ctx.fillStyle = dotColor;

            const radius = 10;
            const drawDot = (x, y) => {
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fill();
            };

            const center = 64;
            const left = 36;
            const right = 92;
            const top = 36;
            const bottom = 92;

            if (val === 1) drawDot(center, center);
            else if (val === 2) { drawDot(left, top); drawDot(right, bottom); }
            else if (val === 3) { drawDot(left, top); drawDot(center, center); drawDot(right, bottom); }
            else if (val === 4) { drawDot(left, top); drawDot(right, top); drawDot(left, bottom); drawDot(right, bottom); }
            else if (val === 5) { drawDot(left, top); drawDot(right, top); drawDot(center, center); drawDot(left, bottom); drawDot(right, bottom); }
            else if (val === 6) { drawDot(left, top); drawDot(right, top); drawDot(left, center); drawDot(right, center); drawDot(left, bottom); drawDot(right, bottom); }

            textures.push(new THREE.CanvasTexture(canvas));
        });

        this.dice.forEach(d => {
            d.mesh.material.forEach((mat, idx) => {
                mat.map = textures[idx];
                mat.bumpMap = textures[idx];
                mat.map.needsUpdate = true;
                mat.needsUpdate = true;
            });
        });
    }

    /**
     * Start the roll simulation.
     */
    roll(val1, val2, onComplete, activeDieIndex = null) {
        if (this.isRolling) return;
        this.isRolling = true;

        if (window.gameAudio) {
            window.gameAudio.playRoll();
        }

        const values = [val1, val2];
        const diceToRoll = activeDieIndex !== null ? [activeDieIndex] : [0, 1];

        if (activeDieIndex === 0) {
            // P1 is rolling. Hide P2's die off-screen
            this.dice[1].mesh.position.set(1.2, -5, 0);
            this.dice[1].isSimulated = false;
        } else if (activeDieIndex === 1) {
            // P2 is rolling. Ensure P1's die stays still where it landed
            this.dice[0].isSimulated = false;
        }

        this.dice.forEach((die, index) => {
            if (!diceToRoll.includes(index)) {
                die.isSimulated = false;
                return;
            }
            die.isSimulated = true;
            die.value = values[index];

            // 1. Initial Position (elevated and thrown from the side)
            // Die 0 starts from left, Die 1 from right
            const startX = index === 0 ? -3.0 : 3.0;
            const startZ = (Math.random() - 0.5) * 2;
            die.pos.set(startX, 4.5, startZ);
            die.mesh.position.copy(die.pos);

            // 2. Initial Velocity (thrown inwards and slightly up/forward)
            const targetX = index === 0 ? -1.0 : 1.0;
            die.vel.set(
                (targetX - startX) * 2.2 + (Math.random() - 0.5) * 2,
                3.5 + Math.random() * 2,
                (Math.random() - 0.5) * 4
            );

            // 3. Initial Spin (high spin rates for tumbling)
            die.angVel.set(
                (Math.random() - 0.5) * 35,
                (Math.random() - 0.5) * 35,
                (Math.random() - 0.5) * 35
            );

            // 4. Random rotation to begin with
            die.rot.setFromEuler(new THREE.Euler(
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2
            ));
            die.mesh.quaternion.copy(die.rot);

            // 5. Target Position resting point
            die.targetPos.set(index === 0 ? -0.8 : 0.8, this.radius, (Math.random() - 0.5) * 0.4);

            // 6. Target Rotation calculation
            // Base orientation to bring the desired face to the TOP (+Y)
            let baseEuler = new THREE.Euler(0, 0, 0);
            const val = die.value;
            if (val === 1) {
                baseEuler.set(0, 0, 0);
            } else if (val === 2) {
                baseEuler.set(-Math.PI / 2, 0, 0);
            } else if (val === 3) {
                baseEuler.set(0, 0, Math.PI / 2);
            } else if (val === 4) {
                baseEuler.set(0, 0, -Math.PI / 2);
            } else if (val === 5) {
                baseEuler.set(Math.PI / 2, 0, 0);
            } else if (val === 6) {
                baseEuler.set(Math.PI, 0, 0);
            }

            const qBase = new THREE.Quaternion().setFromEuler(baseEuler);
            // Apply a random yaw (rotation around Y) to look natural and organic when landed
            const randomYaw = Math.random() * Math.PI * 2;
            const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), randomYaw);
            
            die.targetRot.copy(qYaw.multiply(qBase));
        });

        // Animation timing
        this.rollStartTime = performance.now();
        this.rollDuration = 1500; // 1.5 seconds total
        this.onRollComplete = onComplete;
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        if (this.isRolling) {
            const elapsed = performance.now() - this.rollStartTime;
            const progress = elapsed / this.rollDuration;

            if (progress >= 1.0) {
                // Finalize positions and rotations for simulated dice
                this.dice.forEach(die => {
                    if (die.isSimulated) {
                        die.mesh.position.copy(die.targetPos);
                        die.mesh.quaternion.copy(die.targetRot);
                        die.isSimulated = false;
                    }
                });
                this.isRolling = false;
                if (this.onRollComplete) {
                    this.onRollComplete(this.dice[0].value, this.dice[1].value);
                }
            } else {
                // Physics Simulation Step (dt is about 1/60s)
                const dt = 0.016; 
                const gravity = 18.0;
                const restitution = 0.45; // bounce bounce
                const groundFriction = 0.75;
                const wallFriction = 0.85;

                this.dice.forEach(die => {
                    if (!die.isSimulated) return;
                    if (progress < 0.6) {
                        // --- Stage 1: Active Kinematic Simulation (Physics) ---
                        // Update Velocity
                        die.vel.y -= gravity * dt;
                        
                        // Update Position
                        die.pos.addScaledVector(die.vel, dt);

                        // Ground collision
                        if (die.pos.y < this.radius) {
                            die.pos.y = this.radius;
                            die.vel.y = -die.vel.y * restitution;
                            
                            // Friction
                            die.vel.x *= groundFriction;
                            die.vel.z *= groundFriction;

                            // Add a bit of bounce torque
                            die.angVel.x += (Math.random() - 0.5) * 8;
                            die.angVel.z += (Math.random() - 0.5) * 8;
                            
                            // Play clack on hard impact
                            if (Math.abs(die.vel.y) > 1.0 && window.gameAudio) {
                                window.gameAudio.playMove();
                            }
                        }

                        // Boundary walls collision
                        if (die.pos.x < -this.bounds.x) {
                            die.pos.x = -this.bounds.x;
                            die.vel.x = -die.vel.x * wallFriction;
                        } else if (die.pos.x > this.bounds.x) {
                            die.pos.x = this.bounds.x;
                            die.vel.x = -die.vel.x * wallFriction;
                        }

                        if (die.pos.z < -this.bounds.z) {
                            die.pos.z = -this.bounds.z;
                            die.vel.z = -die.vel.z * wallFriction;
                        } else if (die.pos.z > this.bounds.z) {
                            die.pos.z = this.bounds.z;
                            die.vel.z = -die.vel.z * wallFriction;
                        }

                        die.mesh.position.copy(die.pos);

                        // Update Rotation
                        const deltaRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(
                            die.angVel.x * dt,
                            die.angVel.y * dt,
                            die.angVel.z * dt
                        ));
                        die.rot.multiplyQuaternions(deltaRot, die.rot);
                        die.mesh.quaternion.copy(die.rot);

                        // Damp angular velocity
                        die.angVel.multiplyScalar(0.97);

                    } else {
                        // --- Stage 2: Slerp / Lerp Snapping to Target Orientation ---
                        // Transition from physics simulated state to final target
                        // We map progress [0.6 -> 1.0] to a local t [0 -> 1]
                        const snapT = (progress - 0.6) / 0.4;
                        
                        // Use smoothstep for satisfying deceleration curve
                        const easeT = snapT * snapT * (3 - 2 * snapT);

                        // Interpolate position
                        const tempPos = new THREE.Vector3().lerpVectors(die.pos, die.targetPos, easeT);
                        die.mesh.position.copy(tempPos);

                        // Interpolate rotation
                        const tempRot = new THREE.Quaternion().copy(die.rot).slerp(die.targetRot, easeT);
                        die.mesh.quaternion.copy(tempRot);
                    }
                });
            }
        }

        this.renderer.render(this.scene, this.camera);
    }

    setTheme(themeName) {
        this.currentTheme = themeName;

        // Keep dice white with black dots for all themes
        const p1Bg = '#ffffff', p1Dot = '#000000';
        const p2Bg = '#ffffff', p2Dot = '#000000';

        if (this.dice && this.dice.length === 2) {
            const mats1 = this.createDiceTextures(p1Bg, p1Dot).map(tex => new THREE.MeshStandardMaterial({
                map: tex,
                roughness: 0.2,
                metalness: 0.1,
                bumpMap: tex,
                bumpScale: 0.02
            }));
            const mats2 = this.createDiceTextures(p2Bg, p2Dot).map(tex => new THREE.MeshStandardMaterial({
                map: tex,
                roughness: 0.2,
                metalness: 0.1,
                bumpMap: tex,
                bumpScale: 0.02
            }));

            this.dice[0].mesh.material = mats1;
            this.dice[1].mesh.material = mats2;
        }
    }
}

// Bind to window for global access
window.Dice3D = Dice3D;
