// net/character-utils.js
// Utility functions for attaching weapons to rigged FBX/GLTF characters
// and a lightweight "ragdoll" fallback (no external physics engine required).
// - attachWeaponToBone(characterRoot, weaponMesh, boneName, posOffset, rotOffset)
// - autoAttachWeapon(characterRoot, weaponMesh, hintNames)
// - enableRagdollSimple(characterRoot, options)
// This file is safe to load after three.js and the project's other scripts.

(function(){
  if(!window.THREE) return console.warn('character-utils: THREE not found');

  // small helpers
  function findFirstSkinnedMesh(root){
    let found = null;
    root.traverse((c)=>{ if(!found && c.isSkinnedMesh) found = c; });
    return found;
  }

  function findBoneByName(root, name){
    let found = null;
    root.traverse((o)=>{ if(!found && o.isBone && o.name===name) found = o; });
    return found;
  }

  function findBoneByKeyword(root, keyword){
    keyword = (keyword||'').toLowerCase();
    let found = null;
    root.traverse((o)=>{ if(found) return; if(o.isBone && o.name && o.name.toLowerCase().includes(keyword)) found = o; });
    return found;
  }

  function attachWeaponToBone(characterRoot, weapon, boneName, posOffset, rotOffset){
    if(!characterRoot || !weapon) return null;
    const bone = findBoneByName(characterRoot, boneName) || findBoneByKeyword(characterRoot, boneName);
    if(!bone){
      console.warn('attachWeaponToBone: bone not found:', boneName);
      return null;
    }
    // Create a grip object to keep a stable local transform
    const grip = new THREE.Object3D();
    grip.name = 'weapon_grip_'+(boneName||'');
    bone.add(grip);

    // move weapon under grip and reset local transform
    // keep world scale/rotation by using world matrices
    weapon.updateMatrixWorld(true);
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    weapon.matrixWorld.decompose(worldPos, worldQuat, worldScale);

    grip.add(weapon);
    if(posOffset && posOffset.isVector3){ weapon.position.copy(posOffset); }
    else if(posOffset && typeof posOffset === 'object'){ weapon.position.set(posOffset.x||0,posOffset.y||0,posOffset.z||0); }
    else weapon.position.set(0,0,0);

    if(rotOffset && typeof rotOffset === 'object'){ weapon.rotation.set(rotOffset.x||0, rotOffset.y||0, rotOffset.z||0); }

    // preserve scale if weapon had worldScale
    weapon.scale.copy(worldScale);

    weapon.userData._attachedGrip = grip;
    weapon.userData._attachedToBone = boneName;
    console.log('attachWeaponToBone: attached', weapon.name||weapon.uuid, 'to bone', bone.name);
    return grip;
  }

  // Try common bone name candidates and attach automatically
  function autoAttachWeapon(characterRoot, weapon, hints){
    hints = hints || [];
    // common right-hand bone name candidates (expand as needed)
    const COMMON = ['RightHand','RightHandMiddle','righthand','Right_Wrist','hand_r','Hand_R','RightArm','rightforearm','RightForeArm','RightUpArm','RightFinger','hand.r'];
    const searchList = Array.from(new Set([].concat(hints||[]).concat(COMMON)));
    // first try exact match
    for(const name of searchList){
      const b = findBoneByName(characterRoot, name);
      if(b){ return attachWeaponToBone(characterRoot, weapon, name); }
    }
    // then try keyword contains
    for(const name of searchList){
      const b = findBoneByKeyword(characterRoot, name);
      if(b){ return attachWeaponToBone(characterRoot, weapon, name); }
    }
    // fallback: try to find any bone with 'hand' in name
    const anyHand = findBoneByKeyword(characterRoot, 'hand');
    if(anyHand) return attachWeaponToBone(characterRoot, weapon, anyHand.name);
    console.warn('autoAttachWeapon: no suitable bone found');
    return null;
  }

  // Lightweight ragdoll: create simple meshes at important bone positions and simulate them
  // with a tiny custom integrator (gravity + velocity + angular velocity). No constraints.
  const RAGDOLL_PARTS = [
    // bone-name hints to look for (common naming across many FBX exports)
    'Hips','Spine','Spine1','Spine2','Chest','UpperChest','Neck','Head',
    'RightShoulder','RightArm','RightForeArm','RightHand',
    'LeftShoulder','LeftArm','LeftForeArm','LeftHand',
    'RightUpLeg','RightLeg','RightFoot',
    'LeftUpLeg','LeftLeg','LeftFoot'
  ];

  window._simpleRagdolls = window._simpleRagdolls || [];

  function enableRagdollSimple(characterRoot, options){
    options = options || {};
    const scene = window.scene;
    if(!scene) { console.warn('enableRagdollSimple: window.scene not found'); return; }

    // find skinned mesh and skeleton
    const sk = findFirstSkinnedMesh(characterRoot);
    if(!sk){
      console.warn('enableRagdollSimple: SkinnedMesh not found on character root');
      return;
    }

    const skeleton = sk.skeleton;
    if(!skeleton){ console.warn('enableRagdollSimple: skeleton missing'); }

    // collect bones by name (fall back to all bones if names differ)
    const bones = skeleton ? skeleton.bones : [];
    const namedBones = {};
    bones.forEach(b=> namedBones[b.name] = b);

    // pick a list of bones to create parts for
    const parts = [];
    if(bones.length>0){
      // try matching known names first
      RAGDOLL_PARTS.forEach(n => { if(namedBones[n]) parts.push(namedBones[n]); });
      // if nothing matched, fallback to some bones by index
      if(parts.length===0){
        for(let i=0;i<Math.min(10,bones.length);i++) parts.push(bones[i]);
      }
    }

    // create visible pieces
    const meshes = [];
    parts.forEach((bone)=>{
      const pos = new THREE.Vector3();
      bone.getWorldPosition(pos);
      const geo = new THREE.SphereGeometry(0.18, 8, 6);
      const mat = new THREE.MeshStandardMaterial({color:0x999999,metalness:0.2,roughness:0.7});
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(pos);
      m.quaternion.copy(bone.getWorldQuaternion(new THREE.Quaternion()));
      m.scale.setScalar(1);
      m.userData.sourceBone = bone.name;
      scene.add(m);
      meshes.push(m);
    });

    // hide original skinned mesh (we hide entire characterRoot to remove animation flicker)
    characterRoot.traverse((o)=>{ if(o.isMesh) o.visible = false; });

    // if weapon is parented under a bone, detach it and make it part of ragdoll pieces
    const dropped = [];
    characterRoot.traverse((o)=>{
      if(o.userData && o.userData._attachedGrip){
        const weaponGrip = o.userData._attachedGrip;
        // weapon likely child of grip
        weaponGrip.traverse((c)=>{ if(c.isMesh || c.isGroup) {
            // detach meshes/groups under grip
            // compute world transform
            c.updateMatrixWorld(true);
            const pos = new THREE.Vector3(); const quat = new THREE.Quaternion(); const sc = new THREE.Vector3();
            c.matrixWorld.decompose(pos, quat, sc);
            scene.add(c);
            c.position.copy(pos);
            c.quaternion.copy(quat);
            c.scale.copy(sc);
            dropped.push(c);
        }});
      }
    });

    // initial impulse
    const impulse = options.force || new THREE.Vector3((Math.random()-0.5)*2, 6 + Math.random()*2, (Math.random()-0.5)*2);

    // create ragdoll object
    const rag = {
      createdAt: performance.now()/1000,
      meshes: meshes,
      drops: dropped,
      velocities: meshes.map(()=> new THREE.Vector3((Math.random()-0.5)*1.5 + impulse.x, impulse.y*(0.6+Math.random()*0.8), (Math.random()-0.5)*1.5 + impulse.z)),
      angular: meshes.map(()=> new THREE.Vector3((Math.random()-0.5)*4, (Math.random()-0.5)*4, (Math.random()-0.5)*4)),
      life: options.life || 6.0,
      fadeStart: options.fadeStart || 3.0
    };

    // detach dropped weapons with velocity
    rag.drops.forEach(w=>{ w.userData._ragdolled = true; w.userData._vel = new THREE.Vector3(impulse.x*1.2 + (Math.random()-0.5)*2, impulse.y*1.2 + Math.random()*2, impulse.z*1.2 + (Math.random()-0.5)*2); });

    window._simpleRagdolls.push(rag);
    return rag;
  }

  // updater loop
  let _lastRagTick = performance.now()/1000;
  function _ragdollTick(){
    const now = performance.now()/1000;
    const dt = Math.min(0.04, Math.max(0.0001, now - _lastRagTick));
    _lastRagTick = now;
    if((window._simpleRagdolls||[]).length===0){ requestAnimationFrame(_ragdollTick); return; }

    const gravity = new THREE.Vector3(0, -9.8, 0);
    for(let i = window._simpleRagdolls.length-1; i>=0; i--){
      const r = window._simpleRagdolls[i];
      r.meshes.forEach((m, idx)=>{
        // integrate velocity
        const v = r.velocities[idx];
        v.addScaledVector(gravity, dt);
        m.position.addScaledVector(v, dt);
        // simple rotation
        const ang = r.angular[idx];
        m.rotateX(ang.x * dt);
        m.rotateY(ang.y * dt);
        m.rotateZ(ang.z * dt);
        // simple floor collision
        if(m.position.y < 0.05){ m.position.y = 0.05; v.y *= -0.25; v.x *= 0.6; v.z *= 0.6; }
      });
      r.drops.forEach((w)=>{
        if(!w.userData._vel) return;
        w.userData._vel.addScaledVector(gravity, dt);
        w.position.addScaledVector(w.userData._vel, dt);
        // basic rotation for the weapon
        w.rotateX(0.5*dt); w.rotateY(0.8*dt);
        if(w.position.y < 0.05){ w.position.y = 0.05; w.userData._vel.y *= -0.25; w.userData._vel.x *= 0.6; w.userData._vel.z *= 0.6; }
      });

      const age = now - r.createdAt;
      if(age > r.life){
        // cleanup
        r.meshes.forEach(m=>{ try{ m.parent && m.parent.remove(m); }catch(e){} });
        window._simpleRagdolls.splice(i,1);
      } else if(age > r.fadeStart){
        const f = 1 - (age - r.fadeStart)/(r.life - r.fadeStart);
        r.meshes.forEach(m=>{ if(m.material) { m.material.opacity = f; m.material.transparent = true; } });
      }
    }
    requestAnimationFrame(_ragdollTick);
  }
  requestAnimationFrame(_ragdollTick);

  // Expose to global
  window.attachWeaponToBone = attachWeaponToBone;
  window.autoAttachWeapon = autoAttachWeapon;
  window.enableRagdollSimple = enableRagdollSimple;

  // Monkeypatch P2PSocket._fire to auto-ragdoll on 'playerDied' events when available
  try{
    if(window.P2PSocket && !window.P2PSocket._patchedForRagdoll){
      const orig = window.P2PSocket.prototype._fire;
      window.P2PSocket.prototype._fire = function(event, data){
        try{ orig.call(this, event, data); }catch(e){ console.warn('P2PSocket._fire orig error',e); }
        try{
          if(event === 'playerDied'){
            const deadId = data && data.deadId;
            if(deadId && window.playerMeshes && window.playerMeshes[deadId]){
              const mesh = window.playerMeshes[deadId];
              // compute impulse from killer or fallback
              let forceVec = new THREE.Vector3( (Math.random()-0.5)*2, 6, (Math.random()-0.5)*2 );
              if(data && data.killerId && window.players && window.players[data.killerId]){
                const k = window.players[data.killerId];
                if(k && k.x !== undefined){
                  // direction from killer to victim
                  const victimPos = new THREE.Vector3(mesh.position.x, mesh.position.y, mesh.position.z);
                  const killerPos = new THREE.Vector3(k.x||0, k.y||0, k.z||0);
                  const dir = new THREE.Vector3().subVectors(victimPos, killerPos).normalize().multiplyScalar(5);
                  dir.y = 6;
                  forceVec = dir;
                }
              }
              // if weapon attached, try to detach gracefully
              if(mesh.userData && mesh.userData.gun){
                const gun = mesh.userData.gun;
                // make sure gun is world-aligned before ragdoll so it can drop
                gun.updateMatrixWorld(true);
                // detach from grip if any
                if(gun.userData && gun.userData._attachedGrip){
                  const grip = gun.userData._attachedGrip;
                  try{ grip.remove(gun); }catch(e){}
                  window.scene.add(gun);
                  gun.position.copy(new THREE.Vector3().setFromMatrixPosition(gun.matrixWorld));
                  gun.quaternion.copy(new THREE.Quaternion().setFromRotationMatrix(gun.matrixWorld));
                }
              }
              window.enableRagdollSimple(mesh, { force: forceVec, life: 6 });
            }
          }
        }catch(e){ console.warn('ragdoll _fire hook error', e); }
      };
      window.P2PSocket._patchedForRagdoll = true;
    }
  }catch(e){ /* silent */ }

})();
